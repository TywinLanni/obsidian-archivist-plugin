// src/categories-manager.ts
import { Vault, TFile, normalizePath } from "obsidian";
import type { CategoryItem } from "./types";

const CATEGORIES_FILENAME = "categories.md";

const DEFAULT_CATEGORIES: CategoryItem[] = [
	{ name: "work", description: "Рабочие задачи (общее)" },
	{ name: "work/meetings", description: "Встречи, созвоны, митинги" },
	{ name: "work/tasks", description: "Текущие рабочие задачи" },
	{ name: "ideas", description: "Идеи, мысли, концепции" },
	{ name: "personal", description: "Личные заметки, дневник" },
	{ name: "projects", description: "Проекты вне работы (общее)" },
	{ name: "projects/coding", description: "Программирование, пет-проекты" },
	{ name: "projects/hobby", description: "Хобби-проекты" },
	{ name: "health", description: "Здоровье, спорт, питание" },
	{ name: "learning", description: "Обучение, книги, курсы" },
	{ name: "creative", description: "Творчество, музыка, искусство" },
	{ name: "finance", description: "Финансы, бюджет, инвестиции" },
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
	 * Parse markdown table into CategoryItem array.
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
			// parts[0] is empty (before first |), parts[1] is name, parts[2] is description
			if (parts.length >= 3 && parts[1]) {
				categories.push({
					name: parts[1],
					description: parts[2] || "",
				});
			}
		}

		return categories;
	}

	/**
	 * Format categories as markdown table.
	 */
	private formatAsMarkdown(categories: CategoryItem[]): string {
		const lines = [
			"| Category | Description |",
			"|----------|-------------|",
		];

		for (const cat of categories) {
			lines.push(`| ${cat.name} | ${cat.description} |`);
		}

		return lines.join("\n") + "\n";
	}
}
