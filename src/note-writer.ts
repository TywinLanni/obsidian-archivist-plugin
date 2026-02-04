// src/note-writer.ts
import { Vault, normalizePath, TFolder } from "obsidian";
import type { NoteResponse } from "./types";

/**
 * Writes NoteResponse objects to vault as .md files.
 * Handles folder creation and filename sanitization.
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
		const parts = [this.basePath, note.category];
		if (note.subcategory) {
			parts.push(note.subcategory);
		}

		const dir = normalizePath(parts.join("/"));
		await this.ensureFolder(dir);

		const fileName = this.sanitize(note.title);
		const filePath = normalizePath(`${dir}/${fileName}.md`);

		// Deduplication: skip if file already exists
		if (this.vault.getAbstractFileByPath(filePath)) {
			return null;
		}

		await this.vault.create(filePath, note.markdown);
		return filePath;
	}

	/**
	 * Update the base path (when settings change).
	 */
	setBasePath(basePath: string): void {
		this.basePath = basePath;
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
