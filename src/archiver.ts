// src/archiver.ts
import {
	App,
	TFile,
	Notice,
	Modal,
	Setting,
	normalizePath,
	TFolder,
} from "obsidian";

const RESOLUTIONS = [
	{ value: "realized", label: "Realized" },
	{ value: "dropped", label: "Dropped" },
	{ value: "outdated", label: "Outdated" },
] as const;

type Resolution = (typeof RESOLUTIONS)[number]["value"];

/**
 * Modal for selecting resolution when archiving.
 */
class ArchiveModal extends Modal {
	private resolve: ((value: Resolution | null) => void) | null = null;

	constructor(app: App) {
		super(app);
	}

	pick(): Promise<Resolution | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Archive note" });
		contentEl.createEl("p", { text: "Select resolution:" });

		for (const { value, label } of RESOLUTIONS) {
			new Setting(contentEl).addButton((btn) =>
				btn
					.setButtonText(label)
					.setCta()
					.onClick(() => {
						this.resolve?.(value);
						this.close();
					})
			);
		}
	}

	onClose(): void {
		// If closed without selection
		this.resolve?.(null);
		this.contentEl.empty();
	}
}

/**
 * Note archiver.
 * Replaces Templater script Archive Note.md.
 */
export class NoteArchiver {
	constructor(
		private app: App,
		private basePath: string // "VoiceNotes"
	) {}

	/**
	 * Update the base path (when settings change).
	 */
	setBasePath(basePath: string): void {
		this.basePath = basePath;
	}

	/**
	 * Check if a file can be archived.
	 */
	canArchive(file: TFile): boolean {
		if (!file.path.startsWith(this.basePath + "/")) {
			return false;
		}
		if (file.path.includes("/_archive/")) {
			return false;
		}
		return true;
	}

	/**
	 * Archive a note: select resolution → update frontmatter → move.
	 */
	async archive(file: TFile): Promise<void> {
		// 1. Check: not already in archive
		if (file.path.includes("/_archive/")) {
			new Notice("Note is already archived");
			return;
		}

		// 2. Check: file is inside basePath
		if (!file.path.startsWith(this.basePath + "/")) {
			new Notice("Not an archivistbot note");
			return;
		}

		// 3. Select resolution
		const modal = new ArchiveModal(this.app);
		const resolution = await modal.pick();
		if (!resolution) {
			return; // Cancelled
		}

		// 4. Update frontmatter
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm.resolution = resolution;
			fm.archived_at = new Date().toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
		});

		// 5. Calculate archive path
		const relativePath = file.path.slice(this.basePath.length + 1);
		// relativePath = "work/meetings/note.md"
		const lastSlash = relativePath.lastIndexOf("/");
		const categoryPath =
			lastSlash > 0 ? relativePath.slice(0, lastSlash) : "uncategorized";

		const archiveDir = normalizePath(
			`${this.basePath}/_archive/${categoryPath}`
		);
		const archivePath = normalizePath(`${archiveDir}/${file.name}`);

		// 6. Create folders recursively
		await this.ensureFolder(archiveDir);

		// 7. Move file
		await this.app.fileManager.renameFile(file, archivePath);

		new Notice(`Archived: ${resolution}`);
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) {
			return;
		}

		const parts = path.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}
