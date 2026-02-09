// src/main.ts
import { Plugin, Notice, TFile, TFolder, MarkdownView } from "obsidian";
import {
	ArchivistBotSettings,
	DEFAULT_SETTINGS,
	ArchivistBotSettingTab,
} from "./settings";
import { ArchivistApiClient, RefreshTokenExpiredError } from "./api-client";
import { NoteWriter } from "./note-writer";
import { SyncEngine } from "./sync-engine";
import { NoteArchiver } from "./archiver";
import { ConfigSync } from "./config-sync";

export default class ArchivistBotPlugin extends Plugin {
	settings: ArchivistBotSettings = DEFAULT_SETTINGS;
	private client!: ArchivistApiClient;
	private writer!: NoteWriter;
	private syncEngine!: SyncEngine;
	private archiver!: NoteArchiver;
	configSync!: ConfigSync;
	private statusBarEl!: HTMLElement;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.client = new ArchivistApiClient(
			() => this.settings,
			() => this.saveSettings(),
		);

		this.writer = new NoteWriter(
			this.app,
			this.settings.vaultBasePath
		);

		this.syncEngine = new SyncEngine(
			this.client,
			this.writer,
			(id) => this.registerInterval(id)
		);

		this.syncEngine.setArchiveScanner(() => this.scanArchivedPaths());

		this.archiver = new NoteArchiver(
			this.app,
			this.settings.vaultBasePath
		);

		this.configSync = new ConfigSync(
			this.app.vault,
			this.client,
			this.settings.vaultBasePath
		);

		// ── Status Bar ──
		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar();

		// Update status bar when config sync status changes
		this.configSync.setStatusCallback(() => {
			this.updateStatusBar();
		});

		// ── Settings Tab ──
		this.addSettingTab(new ArchivistBotSettingTab(this.app, this));

		// ── Ribbon Icon: Manual Sync ──
		this.addRibbonIcon("refresh-cw", "Sync now", async () => {
			try {
				await this.syncEngine.manualSync();
			} catch {
				// Error already shown by manualSync
			}
		});

		// ── Commands ──

		// Manual sync notes
		this.addCommand({
			id: "sync-now",
			name: "Sync notes now",
			callback: async () => {
				try {
					await this.syncEngine.manualSync();
				} catch {
					// Error already shown by manualSync
				}
			},
		});

		// Sync config (categories + tags)
		this.addCommand({
			id: "sync-config",
			name: "Sync categories and tags",
			callback: async () => {
				try {
					await this.configSync.manualSync();
				} catch {
					// Error already shown
				}
			},
		});

		// Health check
		this.addCommand({
			id: "health-check",
			name: "Check server connection",
			callback: async () => {
				try {
					const h = await this.client.health();
					new Notice(`Server ok (v${h.version})`);
				} catch (e) {
					if (e instanceof RefreshTokenExpiredError) {
						new Notice("Auth token expired. Use /newtoken in Telegram to get a new one.");
					} else {
						new Notice(`Server unreachable - ${String(e)}`);
					}
				}
			},
		});

		// Archive note
		this.addCommand({
			id: "archive-note",
			name: "Archive note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					return false;
				}
				if (!this.archiver.canArchive(file)) {
					return false;
				}

				if (!checking) {
					void this.archiver.archive(file);
				}
				return true;
			},
		});

		// ── Context Menu: Archive (file explorer, tabs, links) ──
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) {
					return;
				}
				if (!this.archiver.canArchive(file)) {
					return;
				}

				menu.addItem((item) =>
					item
						.setTitle("Archive (archivistbot)")
						.setIcon("archive")
						.onClick(() => void this.archiver.archive(file))
				);
			})
		);

		// ── Context Menu: Archive (editor right-click) ──
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, _editor, view) => {
				if (!(view instanceof MarkdownView) || !view.file) {
					return;
				}
				if (!this.archiver.canArchive(view.file)) {
					return;
				}

				const file = view.file;
				menu.addItem((item) =>
					item
						.setTitle("Archive (archivistbot)")
						.setIcon("archive")
						.onClick(() => void this.archiver.archive(file))
				);
			})
		);

		// ── Initialize on Layout Ready ──
		this.app.workspace.onLayoutReady(() => {
			// Start file watcher always (local-only, no auth needed)
			this.configSync.startWatching((ref) => this.registerEvent(ref));

			// Only auto-connect if we have a previously successful session
			// (accessToken present = token was already rotated via connect())
			if (this.settings.accessToken) {
				void this.configSync.initialize();

				if (this.settings.autoSync) {
					this.startSync();
				}
			}
		});
	}

	onunload(): void {
		this.syncEngine.stop();
		this.configSync.destroy();
	}

	/**
	 * Update status bar with sync status.
	 */
	private updateStatusBar(): void {
		const emoji = this.configSync.getStatusEmoji();
		this.statusBarEl.setText(`${emoji} Archivistbot`);
	}

	startSync(): void {
		this.syncEngine.start(this.settings.syncIntervalSec);
	}

	stopSync(): void {
		this.syncEngine.stop();
	}

	restartSync(): void {
		if (this.settings.autoSync) {
			this.stopSync();
			this.startSync();
		}
	}

	/**
	 * Connect to server: validate token, initialize config, start sync.
	 * Called from settings "Connect" button.
	 */
	async connect(): Promise<void> {
		try {
			// Validate connection via health check
			const h = await this.client.health();
			new Notice(`Server ok (v${h.version})`);
		} catch (e) {
			if (e instanceof RefreshTokenExpiredError) {
				new Notice("Auth token expired. Use /newtoken in Telegram to get a new one.");
			} else {
				new Notice(`Server unreachable — ${String(e)}`);
			}
			return;
		}

		// Re-initialize config (categories + tags sync with server)
		await this.configSync.initialize();

		// (Re)start auto sync if enabled
		if (this.settings.autoSync) {
			this.stopSync();
			this.startSync();
		}
	}

	/**
	 * Scan _archive/ folder and return original vault_paths for reconciliation.
	 * Converts archive paths back to original paths by removing /_archive/ segment.
	 */
	private async scanArchivedPaths(): Promise<string[]> {
		const archiveDir = `${this.settings.vaultBasePath}/_archive`;
		const folder = this.app.vault.getAbstractFileByPath(archiveDir);
		if (!(folder instanceof TFolder)) {
			return [];
		}

		const paths: string[] = [];
		const collectFiles = (f: TFolder): void => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === "md") {
					// Convert: VoiceNotes/_archive/work/note.md → VoiceNotes/work/note.md
					const originalPath = child.path.replace("/_archive/", "/");
					paths.push(originalPath);
				} else if (child instanceof TFolder) {
					collectFiles(child);
				}
			}
		};
		collectFiles(folder);

		return paths;
	}

	/**
	 * Get user settings from server (for settings UI).
	 */
	async getUserSettings(): ReturnType<ArchivistApiClient["getUserSettings"]> {
		return this.client.getUserSettings();
	}

	/**
	 * Update user settings on server (for settings UI).
	 */
	async updateUserSettings(
		...args: Parameters<ArchivistApiClient["updateUserSettings"]>
	): ReturnType<ArchivistApiClient["updateUserSettings"]> {
		return this.client.updateUserSettings(...args);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<ArchivistBotSettings>
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Update all components with new base path
		this.writer.setBasePath(this.settings.vaultBasePath);
		this.archiver.setBasePath(this.settings.vaultBasePath);
		this.configSync.setBasePath(this.settings.vaultBasePath);
	}
}
