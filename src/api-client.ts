// src/api-client.ts
import { requestUrl } from "obsidian";
import type {
	SyncResponse,
	HealthResponse,
	MarkSyncedResponse,
	CategoriesResponse,
	CategoryItem,
	TagsRegistryResponse,
	TagsRegistry,
} from "./types";
import type { ArchivistBotSettings } from "./settings";

/**
 * REST client for ArchivistBot API.
 *
 * Uses obsidian requestUrl() instead of fetch() —
 * works on both Desktop and Mobile, bypasses CORS.
 */
export class ArchivistApiClient {
	constructor(private getSettings: () => ArchivistBotSettings) {}

	private get baseUrl(): string {
		return this.getSettings().endpoint.replace(/\/+$/, "");
	}

	private get headers(): Record<string, string> {
		const h: Record<string, string> = { "Content-Type": "application/json" };
		const token = this.getSettings().authToken;
		if (token) {
			h["Authorization"] = `Bearer ${token}`;
		}
		return h;
	}

	// ── Health ──

	async health(): Promise<HealthResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/health`,
			headers: this.headers,
		});
		return resp.json as HealthResponse;
	}

	// ── Notes ──

	async fetchUnsynced(): Promise<SyncResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/notes/unsynced`,
			headers: this.headers,
		});
		return resp.json as SyncResponse;
	}

	async markSynced(noteIds: string[]): Promise<MarkSyncedResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/notes/mark-synced`,
			method: "POST",
			headers: this.headers,
			body: JSON.stringify({ note_ids: noteIds }),
		});
		return resp.json as MarkSyncedResponse;
	}

	// ── Categories ──

	async getCategories(): Promise<CategoriesResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/categories`,
			headers: this.headers,
		});
		return resp.json as CategoriesResponse;
	}

	async updateCategories(categories: CategoryItem[]): Promise<CategoriesResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/categories`,
			method: "PUT",
			headers: this.headers,
			body: JSON.stringify({ categories }),
		});
		return resp.json as CategoriesResponse;
	}

	// ── Tags ──

	async getTags(): Promise<TagsRegistryResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/tags`,
			headers: this.headers,
		});
		return resp.json as TagsRegistryResponse;
	}

	async updateTags(registry: TagsRegistry): Promise<TagsRegistryResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/tags`,
			method: "PUT",
			headers: this.headers,
			body: JSON.stringify({ registry }),
		});
		return resp.json as TagsRegistryResponse;
	}
}
