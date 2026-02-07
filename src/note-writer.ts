// src/note-writer.ts
import { Vault, normalizePath, TFolder, stringifyYaml } from "obsidian";
import type { NoteResponse } from "./types";

/**
 * Writes NoteResponse objects to vault as .md files.
 * Handles folder creation, filename sanitization, and markdown generation.
 */
export class NoteWriter {
	constructor(
		private vault: Vault,
		private basePath: string
	) {}

	/**
	 * Write a note to the vault.
	 * @returns File path if created, null if file already exists (dedup)
	 */
	async write(note: NoteResponse): Promise<string | null> {
		const dir = normalizePath(`${this.basePath}/${note.category}`);
		await this.ensureFolder(dir);

		const fileName = this.sanitize(note.name);
		const filePath = normalizePath(`${dir}/${fileName}.md`);

		// Deduplication: skip if file already exists
		if (this.vault.getAbstractFileByPath(filePath)) {
			return null;
		}

		const markdown = this.generateMarkdown(note);
		await this.vault.create(filePath, markdown);
		return filePath;
	}

	/**
	 * Update the base path (when settings change).
	 */
	setBasePath(basePath: string): void {
		this.basePath = basePath;
	}

	/**
	 * Generate markdown content with YAML frontmatter.
	 */
	private generateMarkdown(note: NoteResponse): string {
		const frontmatter: Record<string, unknown> = {
			category: note.category,
			tags: note.tags,
			summary: note.summary,
			source: "telegram",
			created: note.created_at,
		};

		if (note.synced_at) {
			frontmatter.synced = note.synced_at;
		}

		const yaml = stringifyYaml(frontmatter).trimEnd();
		const parts: string[] = [`---\n${yaml}\n---`, ""];

		// Add tags as hashtags
		if (note.tags.length > 0) {
			parts.push(note.tags.map((t) => `#${t}`).join(" "), "");
		}

		parts.push(note.content);

		return parts.join("\n");
	}

	/**
	 * Recursively create folder structure.
	 */
	private async ensureFolder(path: string): Promise<void> {
		const existing = this.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) {
			return;
		}

		const parts = path.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const folder = this.vault.getAbstractFileByPath(current);
			if (!folder) {
				await this.vault.createFolder(current);
			}
		}
	}

	/**
	 * Sanitize filename: remove illegal characters, trim, limit length.
	 */
	private sanitize(name: string): string {
		return name
			.replace(/[\\/:*?"<>|#^[\]]/g, "_")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 100);
	}
}
