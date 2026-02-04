// src/main.ts
import { Plugin, Notice, TFile } from "obsidian";
import {
	ArchivistBotSettings,
	DEFAULT_SETTINGS,
	ArchivistBotSettingTab,
} from "./settings";
import { ArchivistApiClient } from "./api-client";
import { NoteWriter } from "./note-writer";
import { SyncEngine } from "./sync-engine";
import { NoteArchiver } from "./archiver";

export default class ArchivistBotPlugin extends Plugin {
	settings: ArchivistBotSettings = DEFAULT_SETTINGS;
	private client!: ArchivistApiClient;
	private writer!: NoteWriter;
	private syncEngine!: SyncEngine;
	private archiver!: NoteArchiver;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.client = new ArchivistApiClient(() => this.settings);

		this.writer = new NoteWriter(
			this.app.vault,
			this.settings.vaultBasePath
		);

		this.syncEngine = new SyncEngine(
			this.client,
			this.writer,
			(id) => this.registerInterval(id)
		);

		this.archiver = new NoteArchiver(
			this.app,
			this.settings.vaultBasePath
		);

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

		// Manual sync
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

		// Health check
		this.addCommand({
			id: "health-check",
			name: "Check server connection",
			callback: async () => {
				try {
					const h = await this.client.health();
					new Notice(`ArchivistBot: Server OK (v${h.version})`);
				} catch (e) {
					new Notice(`ArchivistBot: Server unreachable - ${String(e)}`);
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

		// ── Context Menu: Archive ──
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

		// ── Auto Sync ──
		if (this.settings.autoSync) {
			// Wait for layout ready, then start
			this.app.workspace.onLayoutReady(() => {
				this.startSync();
			});
		}

		// ── Status Bar ──
		const statusBarEl = this.addStatusBarItem();
		statusBarEl.setText("Archivistbot");
	}

	onunload(): void {
		this.syncEngine.stop();
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

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<ArchivistBotSettings>
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Update writer's and archiver's base path when settings change
		this.writer.setBasePath(this.settings.vaultBasePath);
		this.archiver.setBasePath(this.settings.vaultBasePath);
	}
}
