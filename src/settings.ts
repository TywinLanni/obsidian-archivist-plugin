// src/settings.ts
import { App, PluginSettingTab, Setting } from "obsidian";
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

	constructor(app: App, plugin: ArchivistBotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
			.addText((text) =>
				text
					.setPlaceholder("Paste token from Telegram...")
					.setValue(this.plugin.settings.refreshToken)
					.onChange(async (value) => {
						this.plugin.settings.refreshToken = value.trim();
						// Clear cached access token when refresh token changes
						this.plugin.settings.accessToken = "";
						this.plugin.settings.accessTokenExpiresAt = 0;
						await this.plugin.saveSettings();
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
}
