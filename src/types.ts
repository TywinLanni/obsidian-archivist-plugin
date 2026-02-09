/**
 * API types - re-exported from auto-generated api-types.ts
 *
 * DO NOT edit api-types.ts directly - it's generated from OpenAPI spec.
 * Run `npm run update-api` to regenerate after API changes.
 */

import type { components } from "./api-types";

// ── Core schemas ──
export type HealthResponse = components["schemas"]["HealthResponse"];
export type NoteResponse = components["schemas"]["NoteResponse"];
export type SyncResponse = components["schemas"]["SyncResponse"];
export type MarkSyncedRequest = components["schemas"]["MarkSyncedRequest"];
export type MarkSyncedResponse = components["schemas"]["MarkSyncedResponse"];
// CategoryItem: make `reminder` optional for backward compat with 2-column categories.md
export type CategoryItem = Omit<components["schemas"]["CategoryItem"], "reminder"> & {
	reminder?: components["schemas"]["CategoryItem"]["reminder"];
};
export type CategoriesResponse = components["schemas"]["CategoriesResponse"];
export type CategoriesUpdateRequest = components["schemas"]["CategoriesUpdateRequest"];
export type TagsRegistryResponse = components["schemas"]["TagsRegistryResponse"];
export type TagsUpdateRequest = components["schemas"]["TagsUpdateRequest"];
export type ReminderSettings = components["schemas"]["ReminderSettings"];
export type ReconcileArchivedRequest = components["schemas"]["ReconcileArchivedRequest"];
export type ReconcileArchivedResponse = components["schemas"]["ReconcileArchivedResponse"];

// ── Auth (commercial edition) ──
export type TokenPairResponse = components["schemas"]["TokenPairResponse"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];

// ── User & GDPR (commercial edition) ──
export type UserSettingsResponse = components["schemas"]["UserSettingsResponse"];
export type UserSettingsUpdateRequest = components["schemas"]["UserSettingsUpdateRequest"];
export type SessionInfo = components["schemas"]["SessionInfo"];
export type UserSessionsResponse = components["schemas"]["UserSessionsResponse"];
export type UserDataExport = components["schemas"]["UserDataExport"];
export type UserDataDeleteResponse = components["schemas"]["UserDataDeleteResponse"];

// TagsRegistry is now inline in TagsRegistryResponse, define as convenience type
export type TagsRegistry = Record<string, Record<string, number>>;
