import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

	describe("syncing guard", () => {
		it("returns -1 when sync is already in progress", async () => {
			let resolveSync: () => void;
			const blockingPromise = new Promise<void>((r) => { resolveSync = r; });

			const client = {
				fetchUnsynced: vi.fn(async (): Promise<SyncResponse> => {
					await blockingPromise;
					return { notes: [], server_time: "2026-02-07T10:00:00Z" };
				}),
				markSynced: vi.fn(),
			} as unknown as ArchivistApiClient;

			const writer = { write: vi.fn() } as unknown as NoteWriter;
			const engine = new SyncEngine(client, writer, () => {});

			// Start first sync (will block on fetchUnsynced)
			const first = engine.sync();

			// Second sync while first is in progress
			const second = await engine.sync();
			expect(second).toBe(-1);

			// Unblock and finish
			resolveSync!();
			const firstResult = await first;
			expect(firstResult).toBe(0);
		});

		it("releases syncing lock after fetch error", async () => {
			const client = {
				fetchUnsynced: vi.fn()
					.mockRejectedValueOnce(new Error("network error"))
					.mockResolvedValueOnce({ notes: [], server_time: "2026-02-07T10:00:00Z" }),
				markSynced: vi.fn(),
			} as unknown as ArchivistApiClient;

			const writer = { write: vi.fn() } as unknown as NoteWriter;
			const engine = new SyncEngine(client, writer, () => {});

			// First sync fails
			await expect(engine.sync()).rejects.toThrow("network error");

			// Second sync should NOT be blocked by stale lock
			const result = await engine.sync();
			expect(result).toBe(0);
		});

		it("releases syncing lock after markSynced error", async () => {
			const notes = [makeNote("1")];
			const client = {
				fetchUnsynced: vi.fn(async (): Promise<SyncResponse> => ({
					notes,
					server_time: "2026-02-07T10:00:00Z",
				})),
				markSynced: vi.fn()
					.mockRejectedValueOnce(new Error("server 500"))
					.mockResolvedValueOnce({ synced_count: 0 }),
			} as unknown as ArchivistApiClient;

			const writer = {
				write: vi.fn(async () => "path/note.md"),
			} as unknown as NoteWriter;

			const engine = new SyncEngine(client, writer, () => {});

			// First sync: write succeeds but markSynced fails
			await expect(engine.sync()).rejects.toThrow("server 500");

			// Lock must be released — second sync should work
			const result = await engine.sync();
			expect(result).toBe(1);
		});
	});

	describe("consecutiveFailures tracking", () => {
		it("increments on fetch error", async () => {
			const client = {
				fetchUnsynced: vi.fn().mockRejectedValue(new Error("timeout")),
				markSynced: vi.fn(),
			} as unknown as ArchivistApiClient;

			const writer = { write: vi.fn() } as unknown as NoteWriter;
			const engine = new SyncEngine(client, writer, () => {});

			await expect(engine.sync()).rejects.toThrow("timeout");
			await expect(engine.sync()).rejects.toThrow("timeout");

			// Access private field for verification
			expect((engine as unknown as { consecutiveFailures: number }).consecutiveFailures).toBe(2);
		});

		it("resets to 0 on success after failures", async () => {
			const client = {
				fetchUnsynced: vi.fn()
					.mockRejectedValueOnce(new Error("timeout"))
					.mockRejectedValueOnce(new Error("timeout"))
					.mockResolvedValueOnce({ notes: [], server_time: "2026-02-07T10:00:00Z" }),
				markSynced: vi.fn(),
			} as unknown as ArchivistApiClient;

			const writer = { write: vi.fn() } as unknown as NoteWriter;
			const engine = new SyncEngine(client, writer, () => {});

			await expect(engine.sync()).rejects.toThrow();
			await expect(engine.sync()).rejects.toThrow();
			expect((engine as unknown as { consecutiveFailures: number }).consecutiveFailures).toBe(2);

			await engine.sync(); // success
			expect((engine as unknown as { consecutiveFailures: number }).consecutiveFailures).toBe(0);
		});

		it("resets to 0 when empty notes returned (server reachable)", async () => {
			const client = {
				fetchUnsynced: vi.fn()
					.mockRejectedValueOnce(new Error("timeout"))
					.mockResolvedValueOnce({ notes: [], server_time: "2026-02-07T10:00:00Z" }),
				markSynced: vi.fn(),
			} as unknown as ArchivistApiClient;

			const writer = { write: vi.fn() } as unknown as NoteWriter;
			const engine = new SyncEngine(client, writer, () => {});

			await expect(engine.sync()).rejects.toThrow();
			expect((engine as unknown as { consecutiveFailures: number }).consecutiveFailures).toBe(1);

			await engine.sync(); // empty notes = success
			expect((engine as unknown as { consecutiveFailures: number }).consecutiveFailures).toBe(0);
		});
	});

	describe("manualSync", () => {
		beforeEach(() => {
			vi.stubGlobal("Notice", class { constructor() {} });
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("returns immediately when syncing is in progress", async () => {
			let resolveSync: () => void;
			const blockingPromise = new Promise<void>((r) => { resolveSync = r; });

			const client = {
				fetchUnsynced: vi.fn(async (): Promise<SyncResponse> => {
					await blockingPromise;
					return { notes: [], server_time: "2026-02-07T10:00:00Z" };
				}),
				markSynced: vi.fn(),
			} as unknown as ArchivistApiClient;

			const writer = { write: vi.fn() } as unknown as NoteWriter;
			const engine = new SyncEngine(client, writer, () => {});

			// Start background sync
			const bgSync = engine.sync();

			// manualSync should return immediately, not block
			await engine.manualSync();

			// Only one fetchUnsynced call (from bgSync, not manualSync)
			expect(client.fetchUnsynced).toHaveBeenCalledTimes(1);

			resolveSync!();
			await bgSync;
		});
	});
});
