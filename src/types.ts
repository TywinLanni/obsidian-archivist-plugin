/**
 * API types - re-exported from auto-generated api-types.ts
 *
 * DO NOT edit api-types.ts directly - it's generated from OpenAPI spec.
 * Run `npm run update-api` to regenerate after API changes.
 */

import type { components } from "./api-types";

// Schema types (convenient aliases)
export type HealthResponse = components["schemas"]["HealthResponse"];
export type NoteResponse = components["schemas"]["NoteResponse"];
export type SyncResponse = components["schemas"]["SyncResponse"];
export type MarkSyncedRequest = components["schemas"]["MarkSyncedRequest"];
export type MarkSyncedResponse = components["schemas"]["MarkSyncedResponse"];
export type CategoryItem = components["schemas"]["CategoryItem"];
export type CategoriesResponse = components["schemas"]["CategoriesResponse"];
export type CategoriesUpdateRequest = components["schemas"]["CategoriesUpdateRequest"];
export type TagsRegistryResponse = components["schemas"]["TagsRegistryResponse"];
export type TagsUpdateRequest = components["schemas"]["TagsUpdateRequest"];

// TagsRegistry is now inline in TagsRegistryResponse, define as convenience type
export type TagsRegistry = Record<string, Record<string, number>>;
