// src/note-writer.ts
import { App, Vault, normalizePath, TFolder, TFile, stringifyYaml } from "obsidian";
import type { NoteResponse } from "./types";

/**
 * Writes NoteResponse objects to vault as .md files.
 * Handles folder creation, filename sanitization, markdown generation,
 * and appending content to existing notes (reply/addition flow).
 *
 * When a reply targets an archived note, restores it from _archive/
 * back to its original location before appending.
 */
export class NoteWriter {
	private vault: Vault;

	constructor(
		private app: App,
		private basePath: string
	) {
		this.vault = app.vault;
	}

	/**
	 * Write a note to the vault — either as a new file or appended to an existing one.
	 *
	 * When `note.append_to` is set, appends content to the referenced file.
	 * Otherwise creates a new file with a datetime-stamped filename.
	 *
	 * @param note The note to write
	 * @param siblingNames Names of sibling notes (from the same smart-split batch)
	 *   for wikilink cross-references. Excludes the current note's own name.
	 * @returns Vault file path (new or appended), null if dedup skipped
	 */
	async write(note: NoteResponse, siblingNames?: string[]): Promise<string | null> {
		if (note.append_to) {
			return this.appendToExisting(note);
		}
		return this.createNew(note, siblingNames);
	}

	/**
	 * Create a new note file with datetime-stamped filename.
	 * Format: {sanitized_name}_{YYYYMMDD_HHmmss}.md
	 */
	private async createNew(note: NoteResponse, siblingNames?: string[]): Promise<string | null> {
		const dir = normalizePath(`${this.basePath}/${note.category}`);
		await this.ensureFolder(dir);

		const fileName = this.sanitize(note.name);
		const timestamp = this.formatTimestamp(note.created_at);
		const filePath = normalizePath(`${dir}/${fileName}_${timestamp}.md`);

		// Deduplication: skip if file already exists
		if (this.vault.getAbstractFileByPath(filePath)) {
			return null;
		}

		const markdown = this.generateMarkdown(note, siblingNames);
		await this.vault.create(filePath, markdown);
		return filePath;
	}

	/**
	 * Append note content to an existing file referenced by `note.append_to`.
	 *
	 * Resolution order:
	 * 1. File exists at append_to path → append directly
	 * 2. File found in _archive/ (was archived) → restore to original path, then append
	 * 3. File not found anywhere → create as new note
	 */
	private async appendToExisting(note: NoteResponse): Promise<string | null> {
		const targetPath = normalizePath(note.append_to!);
		let file = this.vault.getAbstractFileByPath(targetPath);

		// Not at original path — check archive
		if (!(file instanceof TFile)) {
			const archivedFile = this.findInArchive(targetPath);
			if (archivedFile) {
				// Restore from archive to original location
				const dir = targetPath.slice(0, targetPath.lastIndexOf("/"));
				await this.ensureFolder(dir);
				await this.app.fileManager.renameFile(archivedFile, targetPath);
				file = this.vault.getAbstractFileByPath(targetPath);
				console.debug(
					`[ArchivistBot] Restored from archive: ${archivedFile.path} → ${targetPath}`,
				);
			}
		}

		if (!(file instanceof TFile)) {
			// Not found anywhere — create as new note
			console.warn(
				`[ArchivistBot] Append target not found: ${targetPath}, creating new file`,
			);
			return this.createNew(note);
		}

		// Append content
		const separator = `\n\n---\n\n**Дополнение** (${this.formatHumanDate(note.created_at)})\n\n`;
		const existing = await this.vault.read(file);
		await this.vault.modify(file, existing + separator + note.content);

		// Update frontmatter: set updated timestamp
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm.updated = note.created_at;
		});

		return targetPath;
	}

	/**
	 * Try to find a file in _archive/ that was originally at `originalPath`.
	 *
	 * originalPath: "VoiceNotes/work/meetings/note.md"
	 * archive path: "VoiceNotes/_archive/work/meetings/note.md"
	 */
	private findInArchive(originalPath: string): TFile | null {
		// originalPath starts with basePath + "/"
		const relative = originalPath.slice(this.basePath.length + 1);
		// relative = "work/meetings/note.md"
		const archivePath = normalizePath(`${this.basePath}/_archive/${relative}`);
		const file = this.vault.getAbstractFileByPath(archivePath);
		return file instanceof TFile ? file : null;
	}

	/**
	 * Update the base path (when settings change).
	 */
	setBasePath(basePath: string): void {
		this.basePath = basePath;
	}

	/**
	 * Generate markdown content with YAML frontmatter.
	 *
	 * @param note The note data
	 * @param siblingNames Names of sibling notes for wikilink cross-references
	 */
	private generateMarkdown(note: NoteResponse, siblingNames?: string[]): string {
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

		const actionItems = note.action_items ?? [];

		if (actionItems.length > 0) {
			frontmatter.action_items = actionItems;
		}

		if (note.source_batch_id) {
			frontmatter.source_batch_id = note.source_batch_id;
		}

		const yaml = stringifyYaml(frontmatter).trimEnd();
		const parts: string[] = [`---\n${yaml}\n---`, ""];

		// Add tags as hashtags
		if (note.tags.length > 0) {
			parts.push(note.tags.map((t) => `#${t}`).join(" "), "");
		}

		parts.push(note.content);

		// Add action items as checkboxes
		if (actionItems.length > 0) {
			parts.push("", "## Задачи", "");
			for (const item of actionItems) {
				parts.push(`- [ ] ${item}`);
			}
		}

		// Add wikilinks to sibling notes (smart split)
		if (siblingNames && siblingNames.length > 0) {
			parts.push("", "---", "", "**Связанные заметки:**");
			for (const name of siblingNames) {
				parts.push(`- [[${name}]]`);
			}
		}

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
	 * Format ISO timestamp as YYYYMMDD_HHmmss for filenames.
	 * Uses UTC to ensure consistent filenames regardless of timezone.
	 */
	private formatTimestamp(isoDate: string): string {
		const d = new Date(isoDate);
		const pad = (n: number) => String(n).padStart(2, "0");
		return (
			`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
			`_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
		);
	}

	/**
	 * Format ISO timestamp as human-readable date for append separator.
	 * Uses UTC for consistency.
	 */
	private formatHumanDate(isoDate: string): string {
		const d = new Date(isoDate);
		const pad = (n: number) => String(n).padStart(2, "0");
		return (
			`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
			`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
		);
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
