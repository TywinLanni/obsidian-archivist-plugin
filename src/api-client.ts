// src/api-client.ts
import { requestUrl } from "obsidian";
import type { NoteResponse, HealthResponse, MarkSyncedResponse } from "./types";
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

	async health(): Promise<HealthResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/health`,
			headers: this.headers,
		});
		return resp.json as HealthResponse;
	}

	async fetchUnsynced(): Promise<NoteResponse[]> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/notes/unsynced`,
			headers: this.headers,
		});
		return resp.json as NoteResponse[];
	}

	async markSynced(ids: string[]): Promise<MarkSyncedResponse> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/notes/mark-synced`,
			method: "POST",
			headers: this.headers,
			body: JSON.stringify({ ids }),
		});
		return resp.json as MarkSyncedResponse;
	}
}
