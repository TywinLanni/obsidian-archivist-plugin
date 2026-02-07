// src/tags-manager.ts
import { Vault, TFile, normalizePath, parseYaml, stringifyYaml } from "obsidian";
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
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) {
			return {};
		}

		try {
			const parsed: unknown = parseYaml(match[1]);
			if (!parsed || typeof parsed !== "object") {
				return {};
			}
			return parsed as TagsRegistry;
		} catch {
			console.error("[ArchivistBot] Failed to parse tags_registry.md YAML");
			return {};
		}
	}

	/**
	 * Format registry as markdown with YAML frontmatter.
	 * Sorts categories alphabetically and tags by count descending
	 * for consistent, readable output.
	 */
	private formatAsMarkdown(registry: TagsRegistry): string {
		// Sort for consistent output
		const sorted: TagsRegistry = {};
		for (const category of Object.keys(registry).sort()) {
			const tags = registry[category];
			if (!tags || Object.keys(tags).length === 0) {
				sorted[category] = {};
				continue;
			}
			// Sort tags by count descending
			sorted[category] = Object.fromEntries(
				Object.entries(tags).sort((a, b) => b[1] - a[1])
			);
		}

		const yaml = stringifyYaml(sorted).trimEnd();

		return `---
${yaml}
---

# Tags registry

Auto-managed by ArchivistBot. Edit with caution.

Each category contains tags with usage counts. Tags with lowest counts are evicted when limit is reached.
`;
	}
}
