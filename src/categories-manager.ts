// src/categories-manager.ts
import { Vault, TFile, normalizePath, Notice } from "obsidian";
import type { CategoryItem } from "./types";

const CATEGORIES_FILENAME = "categories.md";

const DEFAULT_CATEGORIES: CategoryItem[] = [
	{ name: "work", description: "Рабочие задачи", reminder: "daily", calendar: "google" },
	{ name: "personal", description: "Личные дела", reminder: "weekly" },
	{ name: "ideas", description: "Идеи и мысли", reminder: "monthly" },
	{ name: "health", description: "Здоровье, спорт", reminder: "weekly" },
];

/**
 * Manages categories.md file in vault root.
 */
export class CategoriesManager {
	private filePath: string;

	constructor(
		private vault: Vault,
		private basePath: string
	) {
		this.filePath = normalizePath(`${basePath}/${CATEGORIES_FILENAME}`);
	}

	/**
	 * Update base path when settings change.
	 */
	setBasePath(basePath: string): void {
		this.basePath = basePath;
		this.filePath = normalizePath(`${basePath}/${CATEGORIES_FILENAME}`);
	}

	/**
	 * Get the file path for categories.md.
	 */
	getFilePath(): string {
		return this.filePath;
	}

	/**
	 * Check if categories file exists.
	 */
	exists(): boolean {
		return this.vault.getAbstractFileByPath(this.filePath) instanceof TFile;
	}

	/**
	 * Create default categories file if not exists.
	 */
	async ensureExists(): Promise<void> {
		if (this.exists()) {
			return;
		}

		// Ensure base folder exists
		const baseFolder = this.vault.getAbstractFileByPath(this.basePath);
		if (!baseFolder) {
			await this.vault.createFolder(this.basePath);
		}

		const content = this.formatAsMarkdown(DEFAULT_CATEGORIES);
		await this.vault.create(this.filePath, content);
	}

	/**
	 * Read and parse categories from file.
	 */
	async read(): Promise<CategoryItem[]> {
		const file = this.vault.getAbstractFileByPath(this.filePath);
		if (!(file instanceof TFile)) {
			return DEFAULT_CATEGORIES;
		}

		const content = await this.vault.read(file);
		return this.parseMarkdown(content);
	}

	/**
	 * Write categories to file.
	 */
	async write(categories: CategoryItem[]): Promise<void> {
		const content = this.formatAsMarkdown(categories);
		const file = this.vault.getAbstractFileByPath(this.filePath);

		if (file instanceof TFile) {
			await this.vault.modify(file, content);
		} else {
			await this.ensureExists();
			const newFile = this.vault.getAbstractFileByPath(this.filePath);
			if (newFile instanceof TFile) {
				await this.vault.modify(newFile, content);
			}
		}
	}

	/**
	 * Valid reminder values for type-safe parsing.
	 */
	private static readonly VALID_REMINDERS = new Set(["off", "daily", "weekly", "monthly"]);

	/**
	 * Valid calendar provider values for type-safe parsing.
	 */
	private static readonly VALID_CALENDARS = new Set(["google"]);

	/**
	 * Parse markdown table into CategoryItem array.
	 * Supports both 2-column (name, description) and 3-column (name, description, reminder) tables.
	 */
	private parseMarkdown(content: string): CategoryItem[] {
		const categories: CategoryItem[] = [];
		const lines = content.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			// Skip non-table and header lines
			if (
				!trimmed.startsWith("|") ||
				trimmed.startsWith("| Category")
			) {
				continue;
			}

			const parts = trimmed.split("|").map((p) => p.trim());
			// parts[0] is empty (before first |), parts[1] is name, parts[2] is description, parts[3] is reminder, parts[4] is calendar

			// Skip separator lines: |---|---|---| or | --- | --- | or |:---|:---|
			if (!parts[1] || /^:?-+:?$/.test(parts[1])) {
				continue;
			}

			if (parts.length >= 3) {
				const cat: CategoryItem = {
					name: parts[1],
					description: parts[2] || "",
				};
				// 3+ column table: parse reminder if present and valid
				if (parts.length >= 4 && parts[3]) {
					if (CategoriesManager.VALID_REMINDERS.has(parts[3])) {
						cat.reminder = parts[3] as CategoryItem["reminder"];
					} else {
						new Notice(`⚠️ Invalid reminder "${parts[3]}" for category "${parts[1]}" — ignored`);
					}
				}
				// 4+ column table: parse calendar if present and valid
				if (parts.length >= 5 && parts[4]) {
					if (CategoriesManager.VALID_CALENDARS.has(parts[4])) {
						cat.calendar = parts[4];
					} else {
						new Notice(`⚠️ Invalid calendar "${parts[4]}" for category "${parts[1]}" — ignored`);
					}
				}
				categories.push(cat);
			}
		}

		return categories;
	}

	/**
	 * Format categories as markdown table (3-column with Reminder).
	 */
	private formatAsMarkdown(categories: CategoryItem[]): string {
		const lines = [
			"| Category | Description | Reminder | Calendar |",
			"|----------|-------------|----------|----------|",
		];

		for (const cat of categories) {
			const reminder = cat.reminder || "weekly";
			const calendar = cat.calendar || "";
			lines.push(`| ${cat.name} | ${cat.description} | ${reminder} | ${calendar} |`);
		}

		lines.push("");
		lines.push("---");
		lines.push("");
		lines.push("**Reminder** — как часто получать дайджест непрочитанных заметок в Telegram:");
		lines.push("- `off` — не напоминать");
		lines.push("- `daily` — каждый день");
		lines.push("- `weekly` — раз в неделю");
		lines.push("- `monthly` — раз в месяц");
		lines.push("");
		lines.push("**Calendar** — автоматически создавать событие, если в заметке есть дата/время:");
		lines.push("- *(пусто)* — не создавать");
		lines.push("- `google` — Google Calendar");
		lines.push("");
		lines.push("Подкатегории: `work/meetings`, `projects/coding` и т.д. — добавляйте когда появится реальная потребность.");

		return lines.join("\n") + "\n";
	}
}
