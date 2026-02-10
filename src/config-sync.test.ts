import { describe, it, expect, vi, beforeEach } from "vitest";
import { Vault, Notice } from "obsidian";
import { ConfigSync } from "./config-sync";
import type { ArchivistApiClient } from "./api-client";
import type { CategoriesResponse, TagsResponse } from "./api-types";

function createSync() {
	const vault = new Vault();
	const updateCategories = vi.fn(async () => ({} as CategoriesResponse));
	const updateTags = vi.fn(async () => ({} as TagsResponse));
	const getCategories = vi.fn(async (): Promise<CategoriesResponse> => ({
		categories: [
			{ name: "work", description: "Work stuff", reminder: "daily" },
		],
	}));
	const getTags = vi.fn(async (): Promise<TagsResponse> => ({
		registry: {},
	}));

	const client = {
		updateCategories,
		updateTags,
		getCategories,
		getTags,
	} as unknown as ArchivistApiClient;

	const sync = new ConfigSync(vault, client, "VoiceNotes");

	return { vault, sync, client, updateCategories, updateTags, getCategories };
}

describe("ConfigSync", () => {
	beforeEach(() => {
		Notice.calls = [];
	});

	describe("content-hash deduplication", () => {
		it("skips push when categories have not changed", async () => {
			const { vault, sync, updateCategories } = createSync();
			const content = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | daily |  |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			// First push — should call API
			await (sync as any).pushToServer("VoiceNotes/categories.md");
			expect(updateCategories).toHaveBeenCalledTimes(1);

			// Second push with same content — should skip
			await (sync as any).pushToServer("VoiceNotes/categories.md");
			expect(updateCategories).toHaveBeenCalledTimes(1);
		});

		it("pushes when categories actually changed", async () => {
			const { vault, sync, updateCategories } = createSync();
			const content1 = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | daily |  |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content1);

			// First push
			await (sync as any).pushToServer("VoiceNotes/categories.md");
			expect(updateCategories).toHaveBeenCalledTimes(1);

			// Change content
			const content2 = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | daily | google |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content2);

			// Second push — content changed, should call API
			await (sync as any).pushToServer("VoiceNotes/categories.md");
			expect(updateCategories).toHaveBeenCalledTimes(2);
		});

		it("does not show Notice when push is skipped", async () => {
			const { vault, sync } = createSync();
			const content = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | daily |  |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			await (sync as any).pushToServer("VoiceNotes/categories.md");
			expect(Notice.calls).toContain("Categories synced to server");

			Notice.calls = [];

			// Same content — skipped, no Notice
			await (sync as any).pushToServer("VoiceNotes/categories.md");
			expect(Notice.calls).toHaveLength(0);
		});

		it("updates hash after pull to prevent echo push", async () => {
			const { vault, sync, updateCategories, getCategories } = createSync();

			// Pull from server writes categories.md
			await sync.pullFromServer();

			// The file now exists — simulate modify event triggering push
			await (sync as any).pushToServer("VoiceNotes/categories.md");

			// Should NOT push — content matches what was just pulled
			expect(updateCategories).not.toHaveBeenCalled();
		});
	});
});
