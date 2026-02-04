// src/types.ts
// Mirror of Core Pydantic models - API contract

export interface NoteResponse {
	id: string;
	title: string;
	content: string;           // raw transcript
	markdown: string;          // ready .md with frontmatter
	category: string;
	subcategory: string | null;
	tags: string[];
	summary: string;
	created_at: string;        // ISO datetime
	source: string;            // "telegram"
}

export interface HealthResponse {
	status: string;
	version: string;
}

export interface MarkSyncedRequest {
	ids: string[];
}

export interface MarkSyncedResponse {
	synced: number;
}
