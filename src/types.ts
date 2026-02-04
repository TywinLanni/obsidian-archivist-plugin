// src/types.ts
// Mirror of Core Pydantic models - API contract

export interface NoteResponse {
	id: string;
	name: string;
	content: string;           // raw transcript
	category: string;
	tags: string[];
	summary: string;
	created_at: string;        // ISO datetime
	synced_at: string | null;
}

export interface SyncResponse {
	notes: NoteResponse[];
	server_time: string;
}

export interface HealthResponse {
	status: string;
	version: string;
}

export interface MarkSyncedRequest {
	note_ids: string[];
}

export interface MarkSyncedResponse {
	synced_count: number;
}

// Categories API

export interface CategoryItem {
	name: string;
	description: string;
}

export interface CategoriesResponse {
	categories: CategoryItem[];
	updated_at: string;
}

export interface CategoriesUpdateRequest {
	categories: CategoryItem[];
}

// Tags API

export type TagsRegistry = Record<string, Record<string, number>>;

export interface TagsRegistryResponse {
	registry: TagsRegistry;
	updated_at: string;
}

export interface TagsUpdateRequest {
	registry: TagsRegistry;
}
