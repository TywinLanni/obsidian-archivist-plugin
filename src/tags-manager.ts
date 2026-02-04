// src/tags-manager.ts
import { Vault, TFile, normalizePath } from "obsidian";
import type { TagsRegistry } from "./types";

const TAGS_FILENAME = "tags_registry.md";

/**
 * Manages tags_registry.md file in vault.
 * Format: YAML frontmatter with category -> tag -> count mapping.
 */
export class TagsManager {
	private filePath: string;

	constructor(
		private vault: Vault,
		private basePath: string
	) {
		this.filePath = normalizePath(`${basePath}/${TAGS_FILENAME}`);
	}

	/**
	 * Update base path when settings change.
	 */
	setBasePath(basePath: string): void {
		this.basePath = basePath;
		this.filePath = normalizePath(`${basePath}/${TAGS_FILENAME}`);
	}

	/**
	 * Get the file path for tags_registry.md.
	 */
	getFilePath(): string {
		return this.filePath;
	}

	/**
	 * Check if tags registry file exists.
	 */
	exists(): boolean {
		return this.vault.getAbstractFileByPath(this.filePath) instanceof TFile;
	}

	/**
	 * Create empty tags registry file if not exists.
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

		const content = this.formatAsMarkdown({});
		await this.vault.create(this.filePath, content);
	}

	/**
	 * Read and parse tags registry from file.
	 */
	async read(): Promise<TagsRegistry> {
		const file = this.vault.getAbstractFileByPath(this.filePath);
		if (!(file instanceof TFile)) {
			return {};
		}

		const content = await this.vault.read(file);
		return this.parseMarkdown(content);
	}

	/**
	 * Write tags registry to file.
	 */
	async write(registry: TagsRegistry): Promise<void> {
		const content = this.formatAsMarkdown(registry);
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
	 * Parse YAML frontmatter into TagsRegistry.
	 */
	private parseMarkdown(content: string): TagsRegistry {
		// Extract YAML frontmatter between ---
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) {
			return {};
		}

		const yamlContent = match[1];
		return this.parseYaml(yamlContent);
	}

	/**
	 * Simple YAML parser for our specific format.
	 * Format:
	 * category:
	 *   tag: count
	 */
	private parseYaml(yaml: string): TagsRegistry {
		const registry: TagsRegistry = {};
		const lines = yaml.split("\n");

		let currentCategory: string | null = null;

		for (const line of lines) {
			// Skip empty lines
			if (!line.trim()) {
				continue;
			}

			// Category line (no leading spaces, ends with :)
			if (!line.startsWith(" ") && line.endsWith(":")) {
				currentCategory = line.slice(0, -1).trim();
				registry[currentCategory] = {};
				continue;
			}

			// Tag line (has leading spaces, format: "  tag: count")
			if (currentCategory && line.startsWith("  ")) {
				const tagMatch = line.match(/^\s+([^:]+):\s*(\d+)/);
				if (tagMatch) {
					const tag = tagMatch[1].trim();
					const count = parseInt(tagMatch[2], 10);
					registry[currentCategory][tag] = count;
				}
			}
		}

		return registry;
	}

	/**
	 * Format registry as markdown with YAML frontmatter.
	 */
	private formatAsMarkdown(registry: TagsRegistry): string {
		const yamlLines: string[] = [];

		// Sort categories for consistent output
		const categories = Object.keys(registry).sort();

		for (const category of categories) {
			const tags = registry[category];
			if (!tags || Object.keys(tags).length === 0) {
				yamlLines.push(`${category}: {}`);
				continue;
			}

			yamlLines.push(`${category}:`);

			// Sort tags by count descending
			const sortedTags = Object.entries(tags).sort((a, b) => b[1] - a[1]);
			for (const [tag, count] of sortedTags) {
				yamlLines.push(`  ${tag}: ${count}`);
			}
		}

		const yaml = yamlLines.length > 0 ? yamlLines.join("\n") : "";

		return `---
${yaml}
---

# Tags Registry

Auto-managed by ArchivistBot. Edit with caution.

Each category contains tags with usage counts. Tags with lowest counts are evicted when limit is reached.
`;
	}
}
