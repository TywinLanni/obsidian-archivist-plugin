// src/config-sync.ts
import { Notice, TFile, EventRef, Vault } from "obsidian";
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
	private fileWatcherRef: EventRef | null = null;
	private debounceTimer: number | null = null;
	private onStatusChange: ((status: SyncStatus) => void) | null = null;

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
	 * Initialize: create default files, pull from server, start watching.
	 */
	async initialize(): Promise<void> {
		// Ensure files exist with defaults
		await this.categoriesManager.ensureExists();
		await this.tagsManager.ensureExists();

		// Try to pull from server
		await this.pullFromServer();
	}

	/**
	 * Start watching for file changes.
	 */
	startWatching(registerEvent: (ref: EventRef) => void): void {
		this.fileWatcherRef = this.vault.on("modify", (file) => {
			if (!(file instanceof TFile)) {
				return;
			}

			const categoriesPath = this.categoriesManager.getFilePath();
			const tagsPath = this.tagsManager.getFilePath();

			if (file.path === categoriesPath || file.path === tagsPath) {
				this.handleFileChange(file.path);
			}
		});

		registerEvent(this.fileWatcherRef);
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
		}, 1000); // 1 second debounce
	}

	/**
	 * Pull categories and tags from server, write to files.
	 */
	async pullFromServer(): Promise<void> {
		try {
			// Fetch categories
			const categoriesResponse = await this.client.getCategories();
			await this.categoriesManager.write(categoriesResponse.categories);

			// Fetch tags
			const tagsResponse = await this.client.getTags();
			await this.tagsManager.write(tagsResponse.registry);

			this.setStatus("synced");
		} catch (e) {
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
				await this.client.updateCategories(categories);
				new Notice("Categories synced to server");
			} else if (filePath === tagsPath) {
				const registry = await this.tagsManager.read();
				await this.client.updateTags(registry);
				new Notice("Tags synced to server");
			}

			this.setStatus("synced");
		} catch (e) {
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
