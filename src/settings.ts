// src/settings.ts
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ArchivistBotPlugin from "./main";

export interface ArchivistBotSettings {
	endpoint: string;
	refreshToken: string;
	accessToken: string;
	accessTokenExpiresAt: number; // unix timestamp ms, 0 = not set
	syncIntervalSec: number;
	vaultBasePath: string;        // root folder for notes in vault
	autoSync: boolean;
}

export const DEFAULT_SETTINGS: ArchivistBotSettings = {
	endpoint: "http://localhost:8000",
	refreshToken: "",
	accessToken: "",
	accessTokenExpiresAt: 0,
	syncIntervalSec: 60,
	vaultBasePath: "VoiceNotes",
	autoSync: true,
};

export class ArchivistBotSettingTab extends PluginSettingTab {
	plugin: ArchivistBotPlugin;
	private statusEl: HTMLElement | null = null;

	constructor(app: App, plugin: ArchivistBotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Connection status ──
		this.statusEl = containerEl.createDiv({ cls: "archivistbot-connection-status" });
		this.updateConnectionStatus();

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("API endpoint for the server")
			.addText((text) =>
				text
					.setPlaceholder("https://example.com")
					.setValue(this.plugin.settings.endpoint)
					.onChange(async (value) => {
						this.plugin.settings.endpoint = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auth token")
			.setDesc("Token from Telegram bot (/start or /newtoken)")
			.addText((text) => {
				// Show placeholder if already connected (token was rotated internally),
				// show actual value only if freshly pasted and not yet connected
				const hasSession = !!this.plugin.settings.accessToken;
				text
					.setPlaceholder("Paste token from Telegram...")
					.setValue(hasSession ? "" : this.plugin.settings.refreshToken)
					.onChange(async (value) => {
						// Strip all whitespace — Telegram may insert line breaks in long tokens
					this.plugin.settings.refreshToken = value.replace(/\s+/g, "");
						// Clear cached access token when refresh token changes
						this.plugin.settings.accessToken = "";
						this.plugin.settings.accessTokenExpiresAt = 0;
						await this.plugin.saveSettings();
					});

				if (hasSession) {
					text.inputEl.placeholder = "Connected (paste new token to reconnect)";
				}
			});

		// ── Connect button ──
		new Setting(containerEl)
			.setName("Connect")
			.setDesc("Validate token and sync configuration with server")
			.addButton((btn) =>
				btn
					.setButtonText("Connect")
					.setCta()
					.onClick(async () => {
						if (!this.plugin.settings.refreshToken) {
							new Notice("Paste an auth token first");
							return;
						}

						btn.setButtonText("Connecting...");
						btn.setDisabled(true);

						try {
							await this.plugin.connect();
							this.updateConnectionStatus();
						} finally {
							btn.setButtonText("Connect");
							btn.setDisabled(false);
						}
					})
			);

		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("Seconds between sync checks (10-300)")
			.addSlider((slider) =>
				slider
					.setLimits(10, 300, 10)
					.setValue(this.plugin.settings.syncIntervalSec)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.syncIntervalSec = value;
						await this.plugin.saveSettings();
						this.plugin.restartSync();
					})
			);

		new Setting(containerEl)
			.setName("Vault base path")
			.setDesc("Folder for synced notes")
			.addText((text) =>
				text
					.setPlaceholder("Notes")
					.setValue(this.plugin.settings.vaultBasePath)
					.onChange(async (value) => {
						this.plugin.settings.vaultBasePath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto sync")
			.setDesc("Automatically sync notes on interval")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.startSync();
					} else {
						this.plugin.stopSync();
					}
				})
			);
	}

	/**
	 * Update the connection status indicator in settings.
	 */
	private updateConnectionStatus(): void {
		if (!this.statusEl) {
			return;
		}
		this.statusEl.empty();

		const emoji = this.plugin.configSync.getStatusEmoji();
		const status = this.plugin.configSync.getStatus();

		const labels: Record<string, string> = {
			synced: "Connected",
			pending: "Syncing...",
			error: "Connection error",
			offline: "Server unreachable",
		};

		const label = labels[status] ?? status;
		this.statusEl.setText(`${emoji} ${label}`);
	}
}
