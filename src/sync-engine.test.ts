import { describe, it, expect, vi } from "vitest";
import type { ArchivistApiClient } from "./api-client";
import type { NoteWriter } from "./note-writer";
import type { NoteResponse, SyncResponse, MarkSyncedResponse } from "./types";
import { SyncEngine } from "./sync-engine";

function makeNote(id: string): NoteResponse {
	return {
		id,
		name: `Note ${id}`,
		content: "content",
		category: "work",
		tags: [],
		summary: "summary",
		created_at: "2026-02-07T10:00:00Z",
	};
}

function createEngine(opts: {
	notes?: NoteResponse[];
	writeResults?: (string | null)[];
	writeErrors?: Map<string, Error>;
} = {}): {
	engine: SyncEngine;
	markSyncedIds: string[][];
} {
	const notes = opts.notes ?? [];
	const writeResults = opts.writeResults ?? notes.map((n) => `path/${n.name}.md`);
	const writeErrors = opts.writeErrors ?? new Map();
	const markSyncedIds: string[][] = [];

	let writeIdx = 0;

	const client = {
		fetchUnsynced: vi.fn(async (): Promise<SyncResponse> => ({
			notes,
			server_time: "2026-02-07T10:00:00Z",
		})),
		markSynced: vi.fn(async (ids: string[]): Promise<MarkSyncedResponse> => {
			markSyncedIds.push([...ids]);
			return { synced_count: ids.length };
		}),
	} as unknown as ArchivistApiClient;

	const writer = {
		write: vi.fn(async (note: NoteResponse): Promise<string | null> => {
			if (writeErrors.has(note.id)) {
				throw writeErrors.get(note.id)!;
			}
			return writeResults[writeIdx++] ?? null;
		}),
	} as unknown as NoteWriter;

	const engine = new SyncEngine(client, writer, () => {});

	return { engine, markSyncedIds };
}

describe("SyncEngine", () => {
	describe("sync", () => {
		it("marks all notes as synced on success", async () => {
			const notes = [makeNote("1"), makeNote("2"), makeNote("3")];
			const { engine, markSyncedIds } = createEngine({ notes });

			await engine.sync();

			expect(markSyncedIds).toHaveLength(1);
			expect(markSyncedIds[0]).toEqual(["1", "2", "3"]);
		});

		it("does not call markSynced when no notes", async () => {
			const { engine, markSyncedIds } = createEngine({ notes: [] });

			await engine.sync();

			expect(markSyncedIds).toHaveLength(0);
		});

		it("excludes notes where write() threw an error", async () => {
			const notes = [makeNote("1"), makeNote("2"), makeNote("3")];
			const writeErrors = new Map([
				["2", new Error("disk full")],
			]);
			const { engine, markSyncedIds } = createEngine({
				notes,
				writeResults: ["path/1.md", null, "path/3.md"],
				writeErrors,
			});

			await engine.sync();

			expect(markSyncedIds).toHaveLength(1);
			// Note "2" should NOT be in synced list
			expect(markSyncedIds[0]).toEqual(["1", "3"]);
		});

		it("includes deduped notes (write returns null) in synced list", async () => {
			const notes = [makeNote("1"), makeNote("2")];
			const { engine, markSyncedIds } = createEngine({
				notes,
				writeResults: ["path/1.md", null], // "2" is dedup
			});

			await engine.sync();

			expect(markSyncedIds[0]).toEqual(["1", "2"]);
		});

		it("does not mark any notes if ALL writes fail", async () => {
			const notes = [makeNote("1"), makeNote("2")];
			const writeErrors = new Map([
				["1", new Error("fail")],
				["2", new Error("fail")],
			]);
			const { engine, markSyncedIds } = createEngine({
				notes,
				writeErrors,
			});

			await engine.sync();

			expect(markSyncedIds).toHaveLength(0);
		});
	});
});
