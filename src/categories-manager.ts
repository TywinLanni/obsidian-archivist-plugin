// src/categories-manager.ts
import { Vault, TFile, normalizePath } from "obsidian";
import type { CategoryItem } from "./types";

const CATEGORIES_FILENAME = "categories.md";

const DEFAULT_CATEGORIES: CategoryItem[] = [
	{ name: "work", description: "Рабочие задачи (общее)", reminder: "daily" },
	{ name: "work/meetings", description: "Встречи, созвоны, митинги", reminder: "daily" },
	{ name: "work/tasks", description: "Текущие рабочие задачи", reminder: "daily" },
	{ name: "ideas", description: "Идеи, мысли, концепции", reminder: "weekly" },
	{ name: "personal", description: "Личные заметки, дневник", reminder: "weekly" },
	{ name: "projects", description: "Проекты вне работы (общее)", reminder: "weekly" },
	{ name: "projects/coding", description: "Программирование, пет-проекты", reminder: "weekly" },
	{ name: "projects/hobby", description: "Хобби-проекты", reminder: "monthly" },
	{ name: "health", description: "Здоровье, спорт, питание", reminder: "weekly" },
	{ name: "learning", description: "Обучение, книги, курсы", reminder: "weekly" },
	{ name: "creative", description: "Творчество, музыка, искусство", reminder: "monthly" },
	{ name: "finance", description: "Финансы, бюджет, инвестиции", reminder: "monthly" },
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
			// Skip header and separator lines
			if (
				!trimmed.startsWith("|") ||
				trimmed.startsWith("| Category") ||
				trimmed.startsWith("|---")
			) {
				continue;
			}

			const parts = trimmed.split("|").map((p) => p.trim());
			// parts[0] is empty (before first |), parts[1] is name, parts[2] is description, parts[3] is reminder, parts[4] is calendar
			if (parts.length >= 3 && parts[1]) {
				const cat: CategoryItem = {
					name: parts[1],
					description: parts[2] || "",
				};
				// 3+ column table: parse reminder if present and valid
				if (parts.length >= 4 && parts[3] && CategoriesManager.VALID_REMINDERS.has(parts[3])) {
					cat.reminder = parts[3] as CategoryItem["reminder"];
				}
				// 4+ column table: parse calendar if present and valid
				if (parts.length >= 5 && parts[4] && CategoriesManager.VALID_CALENDARS.has(parts[4])) {
					cat.calendar = parts[4];
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

		return lines.join("\n") + "\n";
	}
}
