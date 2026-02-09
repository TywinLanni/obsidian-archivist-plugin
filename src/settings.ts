// src/settings.ts
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ArchivistBotPlugin from "./main";
import type { ReminderSettings } from "./types";

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

		// ── Digest Reminders (server-side settings) ──
		if (this.plugin.settings.accessToken) {
			this.renderReminderSettings(containerEl);
		}
	}

	/**
	 * Render digest reminder settings section.
	 * Loads current values from server, saves changes via PATCH.
	 */
	private renderReminderSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Digest reminders").setHeading();

		const loadingEl = containerEl.createDiv({ text: "Loading reminder settings..." });

		// Load settings from server asynchronously
		void this.plugin.getUserSettings().then((response) => {
			loadingEl.remove();

			const reminders: ReminderSettings = response.reminders ?? {
				enabled: true,
				send_time: 9,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				weekly_day: "monday",
				monthly_day: 1,
			};

			// Helper to save a partial update
			const saveReminder = async (patch: Partial<ReminderSettings>): Promise<void> => {
				try {
					await this.plugin.updateUserSettings({ reminders: { ...reminders, ...patch } as ReminderSettings });
					Object.assign(reminders, patch);
				} catch (e) {
					new Notice(`Failed to save reminder settings: ${String(e)}`);
				}
			};

			new Setting(containerEl)
				.setName("Enable digest reminders")
				.setDesc("Receive periodic summaries of unarchived notes in Telegram")
				.addToggle((toggle) =>
					toggle.setValue(reminders.enabled).onChange(async (value) => {
						await saveReminder({ enabled: value });
					})
				);

			new Setting(containerEl)
				.setName("Send time")
				.setDesc("Hour of day to receive digests (0-23)")
				.addDropdown((dropdown) => {
					for (let h = 0; h < 24; h++) {
						const label = `${h.toString().padStart(2, "0")}:00`;
						dropdown.addOption(String(h), label);
					}
					dropdown.setValue(String(reminders.send_time));
					dropdown.onChange(async (value) => {
						await saveReminder({ send_time: parseInt(value) });
					});
				});

			new Setting(containerEl)
				.setName("Timezone")
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- IANA is a proper noun
			.setDesc("IANA timezone for digest scheduling")
			.addText((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- timezone identifier, not UI text
					.setPlaceholder("Europe/Amsterdam")
						.setValue(reminders.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
						.onChange(async (value) => {
							await saveReminder({ timezone: value || null });
						})
				);

			const weekDays: { value: ReminderSettings["weekly_day"]; label: string }[] = [
				{ value: "monday", label: "Monday" },
				{ value: "tuesday", label: "Tuesday" },
				{ value: "wednesday", label: "Wednesday" },
				{ value: "thursday", label: "Thursday" },
				{ value: "friday", label: "Friday" },
				{ value: "saturday", label: "Saturday" },
				{ value: "sunday", label: "Sunday" },
			];

			new Setting(containerEl)
				.setName("Weekly digest day")
				.setDesc("Day of week for weekly reminders")
				.addDropdown((dropdown) => {
					for (const { value, label } of weekDays) {
						dropdown.addOption(value, label);
					}
					dropdown.setValue(reminders.weekly_day);
					dropdown.onChange(async (value) => {
						await saveReminder({ weekly_day: value as ReminderSettings["weekly_day"] });
					});
				});

			new Setting(containerEl)
				.setName("Monthly digest day")
				.setDesc("Day of month for monthly reminders (1-28)")
				.addSlider((slider) =>
					slider
						.setLimits(1, 28, 1)
						.setValue(reminders.monthly_day)
						.setDynamicTooltip()
						.onChange(async (value) => {
							await saveReminder({ monthly_day: value });
						})
				);
		}).catch((e) => {
			loadingEl.setText("Failed to load reminder settings");
			console.error("[ArchivistBot] Failed to load reminder settings:", e);
		});
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
