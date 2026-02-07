/**
 * Minimal Obsidian API mock for unit tests.
 */
import { parse, stringify } from "yaml";

// ── YAML ──

export function parseYaml(yaml: string): unknown {
	return parse(yaml);
}

export function stringifyYaml(obj: unknown): string {
	return stringify(obj);
}

// ── Path ──

export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

// ── Notice (no-op in tests) ──

export class Notice {
	constructor(_message: string, _timeout?: number) {}
}

// ── File system types ──

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? "";
		const dotIdx = this.name.lastIndexOf(".");
		this.basename = dotIdx > 0 ? this.name.slice(0, dotIdx) : this.name;
		this.extension = dotIdx > 0 ? this.name.slice(dotIdx + 1) : "";
	}
}

export class TFolder {
	path: string;
	constructor(path: string) {
		this.path = path;
	}
}

// ── Mock Vault ──

export class Vault {
	private files = new Map<string, string>();
	private folders = new Set<string>();

	/** Seed a file for testing. */
	_addFile(path: string, content: string): void {
		this.files.set(normalizePath(path), content);
	}

	/** Read file content (for test assertions). */
	_getFile(path: string): string | undefined {
		return this.files.get(normalizePath(path));
	}

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		const p = normalizePath(path);
		if (this.files.has(p)) {
			return new TFile(p);
		}
		if (this.folders.has(p)) {
			return new TFolder(p);
		}
		return null;
	}

	async read(file: TFile): Promise<string> {
		const content = this.files.get(normalizePath(file.path));
		if (content === undefined) {
			throw new Error(`File not found: ${file.path}`);
		}
		return content;
	}

	async create(path: string, content: string): Promise<TFile> {
		const p = normalizePath(path);
		this.files.set(p, content);
		return new TFile(p);
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(normalizePath(file.path), content);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(normalizePath(path));
	}
}

// ── Mock FileManager ──

class FileManager {
	private vault: Vault;

	constructor(vault: Vault) {
		this.vault = vault;
	}

	/**
	 * Rename/move a file in the vault.
	 */
	async renameFile(file: TFile, newPath: string): Promise<void> {
		const oldPath = normalizePath(file.path);
		const np = normalizePath(newPath);
		const content = this.vault._getFile(oldPath);
		if (content === undefined) {
			throw new Error(`File not found for rename: ${oldPath}`);
		}
		// Remove old, add new
		(this.vault as any).files.delete(oldPath);
		(this.vault as any).files.set(np, content);
		file.path = np;
	}

	/**
	 * Process frontmatter: parse YAML, call callback, rewrite.
	 */
	async processFrontMatter(
		file: TFile,
		fn: (fm: Record<string, unknown>) => void,
	): Promise<void> {
		const content = this.vault._getFile(normalizePath(file.path));
		if (content === undefined) {
			throw new Error(`File not found: ${file.path}`);
		}

		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) {
			// No frontmatter — create one
			const fm: Record<string, unknown> = {};
			fn(fm);
			const yaml = stringify(fm).trimEnd();
			const newContent = `---\n${yaml}\n---\n${content}`;
			(this.vault as any).files.set(normalizePath(file.path), newContent);
			return;
		}

		const fm = parse(fmMatch[1]) as Record<string, unknown>;
		fn(fm);
		const yaml = stringify(fm).trimEnd();
		const rest = content.slice(fmMatch[0].length);
		const newContent = `---\n${yaml}\n---${rest}`;
		(this.vault as any).files.set(normalizePath(file.path), newContent);
	}
}

// ── Mock App ──

export class App {
	vault: Vault;
	fileManager: FileManager;

	constructor() {
		this.vault = new Vault();
		this.fileManager = new FileManager(this.vault);
	}
}

// ── Stubs for unused imports ──

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Modal {}

export function requestUrl(): never {
	throw new Error("requestUrl should not be called in unit tests");
}

export type RequestUrlParam = {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
};
