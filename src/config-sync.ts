// src/config-sync.ts
import { Notice, TFile, type EventRef, Vault } from "obsidian";
import { RefreshTokenExpiredError } from "./api-client";
import type { ArchivistApiClient } from "./api-client";
import { CategoriesManager } from "./categories-manager";
import { TagsManager } from "./tags-manager";

export type SyncStatus = "synced" | "pending" | "error" | "offline";

/**
 * Orchestrates sync of categories.md and tags_registry.md with server.
 * Handles file watching, conflict resolution, and status tracking.
 */
export class ConfigSync {
	private categoriesManager: CategoriesManager;
	private tagsManager: TagsManager;
	private status: SyncStatus = "pending";
	private debounceTimer: number | null = null;
	private onStatusChange: ((status: SyncStatus) => void) | null = null;
	private lastPushedCategories = "";
	private lastPushedTags = "";

	constructor(
		private vault: Vault,
		private client: ArchivistApiClient,
		basePath: string
	) {
		this.categoriesManager = new CategoriesManager(vault, basePath);
		this.tagsManager = new TagsManager(vault, basePath);
	}

	/**
	 * Update base path when settings change.
	 */
	setBasePath(basePath: string): void {
		this.categoriesManager.setBasePath(basePath);
		this.tagsManager.setBasePath(basePath);
	}

	/**
	 * Set callback for status changes.
	 */
	setStatusCallback(callback: (status: SyncStatus) => void): void {
		this.onStatusChange = callback;
	}

	/**
	 * Get current sync status.
	 */
	getStatus(): SyncStatus {
		return this.status;
	}

	/**
	 * Initialize: create default files, send init to server, pull tags.
	 *
	 * On first run: creates default categories.md, sends them to server
	 * via POST /v1/init (which also triggers processing of any pending notes).
	 * On subsequent runs: pulls existing config from server.
	 */
	async initialize(): Promise<void> {
		// Ensure files exist with defaults
		await this.categoriesManager.ensureExists();
		await this.tagsManager.ensureExists();

		try {
			// Check if server has categories
			const serverCategories = await this.client.getCategories();

			if (serverCategories.categories.length === 0) {
				// First init — push local categories to server
				const localCategories = await this.categoriesManager.read();
				const result = await this.client.pluginInit(localCategories);

				if (result.pending_notes > 0) {
					new Notice(
						`Plugin connected! ${result.pending_notes} pending notes will be processed.`
					);
				} else {
					new Notice("Plugin connected!");
				}
			} else {
				// Server already has categories — pull them
				await this.categoriesManager.write(serverCategories.categories);
			}

			// Always pull tags from server
			const tagsResponse = await this.client.getTags();
			await this.tagsManager.write(tagsResponse.registry);

			this.setStatus("synced");
		} catch (e) {
			if (e instanceof RefreshTokenExpiredError) {
				new Notice("Auth token expired. Use /newtoken in Telegram to get a new one.");
				this.setStatus("error");
				return;
			}
			console.error("[ArchivistBot] Failed to initialize config:", e);
			this.setStatus("offline");
			// Don't throw — files have defaults, plugin can work offline
		}
	}

	/**
	 * Start watching for file changes.
	 */
	startWatching(registerEvent: (ref: EventRef) => void): void {
		const ref = this.vault.on("modify", (file) => {
			if (!(file instanceof TFile)) {
				return;
			}

			const categoriesPath = this.categoriesManager.getFilePath();
			const tagsPath = this.tagsManager.getFilePath();

			if (file.path === categoriesPath || file.path === tagsPath) {
				this.handleFileChange(file.path);
			}
		});

		registerEvent(ref);
	}

	/**
	 * Handle file modification with debounce.
	 */
	private handleFileChange(filePath: string): void {
		// Debounce to avoid multiple syncs on rapid edits
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}

		this.setStatus("pending");

		this.debounceTimer = window.setTimeout(() => {
			this.debounceTimer = null;
			void this.pushToServer(filePath);
		}, 2000); // 2 second debounce
	}

	/**
	 * Pull categories and tags from server, write to files.
	 */
	async pullFromServer(): Promise<void> {
		try {
			// Fetch categories
			const categoriesResponse = await this.client.getCategories();
			await this.categoriesManager.write(categoriesResponse.categories);
			this.lastPushedCategories = JSON.stringify(categoriesResponse.categories);

			// Fetch tags
			const tagsResponse = await this.client.getTags();
			await this.tagsManager.write(tagsResponse.registry);
			this.lastPushedTags = JSON.stringify(tagsResponse.registry);

			this.setStatus("synced");
		} catch (e) {
			if (e instanceof RefreshTokenExpiredError) {
				new Notice("Auth token expired. Use /newtoken in Telegram to get a new one.");
				this.setStatus("error");
				return;
			}
			console.error("[ArchivistBot] Failed to pull config from server:", e);
			this.setStatus("offline");
			// Don't throw - files have defaults, plugin can work offline
		}
	}

	/**
	 * Push local file changes to server.
	 */
	private async pushToServer(filePath: string): Promise<void> {
		try {
			const categoriesPath = this.categoriesManager.getFilePath();
			const tagsPath = this.tagsManager.getFilePath();

			if (filePath === categoriesPath) {
				const categories = await this.categoriesManager.read();
				const hash = JSON.stringify(categories);
				if (hash === this.lastPushedCategories) {
					this.setStatus("synced");
					return;
				}
				await this.client.updateCategories(categories);
				this.lastPushedCategories = hash;
				new Notice("Categories synced to server");
			} else if (filePath === tagsPath) {
				const registry = await this.tagsManager.read();
				const hash = JSON.stringify(registry);
				if (hash === this.lastPushedTags) {
					this.setStatus("synced");
					return;
				}
				await this.client.updateTags(registry);
				this.lastPushedTags = hash;
				new Notice("Tags synced to server");
			}

			this.setStatus("synced");
		} catch (e) {
			if (e instanceof RefreshTokenExpiredError) {
				new Notice("Auth token expired. Use /newtoken in Telegram to get a new one.");
				this.setStatus("error");
				return;
			}
			console.error("[ArchivistBot] Failed to push config to server:", e);
			this.setStatus("error");
			new Notice("Failed to sync config to server");
		}
	}

	/**
	 * Manual sync: pull from server.
	 */
	async manualSync(): Promise<void> {
		this.setStatus("pending");
		await this.pullFromServer();

		if (this.status === "synced") {
			new Notice("Config synced from server");
		}
	}

	/**
	 * Update status and notify callback.
	 */
	private setStatus(status: SyncStatus): void {
		this.status = status;
		this.onStatusChange?.(status);
	}

	/**
	 * Clean up resources (debounce timer).
	 * Call from plugin onunload.
	 */
	destroy(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	/**
	 * Get status indicator emoji.
	 */
	getStatusEmoji(): string {
		switch (this.status) {
			case "synced":
				return "🟢";
			case "pending":
				return "🟡";
			case "error":
				return "🔴";
			case "offline":
				return "⚫";
		}
	}
}
