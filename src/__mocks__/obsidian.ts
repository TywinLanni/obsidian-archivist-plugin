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

// ── Stubs for unused imports ──

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class App {}
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
