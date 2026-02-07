// src/sync-engine.ts
import { Notice } from "obsidian";
import { RefreshTokenExpiredError } from "./api-client";
import type { ArchivistApiClient } from "./api-client";
import type { NoteWriter } from "./note-writer";

/** Max consecutive failures before stopping backoff growth. */
const MAX_BACKOFF_MULTIPLIER = 5;

/**
 * Handles periodic sync of notes from ArchivistBot server.
 * Fetches unsynced notes, writes them to vault, marks as synced.
 * Implements exponential backoff on server errors.
 */
export class SyncEngine {
	private intervalId: number | null = null;
	private syncing = false;
	private consecutiveFailures = 0;
	private baseIntervalSec = 60;

	constructor(
		private client: ArchivistApiClient,
		private writer: NoteWriter,
		private registerInterval: (id: number) => void
	) {}

	/**
	 * Start periodic sync.
	 * @param intervalSec Interval between syncs in seconds
	 */
	start(intervalSec: number): void {
		this.stop();
		this.baseIntervalSec = intervalSec;
		this.consecutiveFailures = 0;
		// Immediate first sync
		void this.sync();
		this.scheduleNext();
	}

	/**
	 * Schedule next sync with backoff on failures.
	 */
	private scheduleNext(): void {
		const multiplier = Math.min(
			2 ** this.consecutiveFailures,
			2 ** MAX_BACKOFF_MULTIPLIER,
		);
		const intervalMs = this.baseIntervalSec * multiplier * 1000;

		this.intervalId = window.setInterval(
			() => void this.sync(),
			intervalMs,
		);
		this.registerInterval(this.intervalId);
	}

	/**
	 * Stop periodic sync.
	 */
	stop(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	/**
	 * Restart interval with current backoff level.
	 */
	private reschedule(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.scheduleNext();
	}

	/**
	 * Perform a single sync operation.
	 * Can be called manually or by the interval.
	 * @returns Number of notes written (0 = nothing new, -1 = skipped/guard)
	 */
	async sync(): Promise<number> {
		if (this.syncing) {
			return -1; // Guard against overlapping syncs
		}
		this.syncing = true;

		try {
			const response = await this.client.fetchUnsynced();
			const notes = response.notes;

			if (notes.length === 0) {
				return 0;
			}

			const written: string[] = [];
			const syncedIds: string[] = [];

			for (const note of notes) {
				try {
					const path = await this.writer.write(note);
					if (path) {
						written.push(path);
					}
					// Mark as synced: either written (path) or dedup (null)
					syncedIds.push(note.id);
				} catch (writeErr) {
					// write() failed for this note — do NOT mark as synced
					// so it will be retried on next sync
					console.error(
						`[ArchivistBot] Failed to write note ${note.id}:`,
						writeErr,
					);
				}
			}

			if (syncedIds.length > 0) {
				await this.client.markSynced(syncedIds);
			}

			if (written.length > 0) {
				new Notice(`Archivistbot: synced ${written.length} note(s)`);
			}

			// Success — reset backoff
			if (this.consecutiveFailures > 0) {
				this.consecutiveFailures = 0;
				this.reschedule();
			}

			return written.length;
		} catch (e) {
			if (e instanceof RefreshTokenExpiredError) {
				new Notice("Auth token expired. Use /newtoken in Telegram to get a new one.");
				this.stop();
				return -1;
			}

			this.consecutiveFailures++;
			console.error(
				`[ArchivistBot] sync error (attempt ${this.consecutiveFailures}):`,
				e,
			);

			// Reschedule with backoff
			this.reschedule();
			throw e;
		} finally {
			this.syncing = false;
		}
	}

	/**
	 * Manual sync with user-facing feedback.
	 */
	async manualSync(): Promise<void> {
		if (this.syncing) {
			new Notice("Archivistbot: sync already in progress");
			return;
		}

		try {
			const count = await this.sync();
			// sync() already shows notice when notes were written (count > 0)
			if (count === 0) {
				new Notice("Archivistbot: no new notes");
			}
		} catch (e) {
			new Notice(`Archivistbot: sync failed — ${String(e)}`);
			throw e;
		}
	}
}
