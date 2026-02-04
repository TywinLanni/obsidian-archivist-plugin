// src/sync-engine.ts
import { Notice } from "obsidian";
import type { ArchivistApiClient } from "./api-client";
import type { NoteWriter } from "./note-writer";

/**
 * Handles periodic sync of notes from ArchivistBot server.
 * Fetches unsynced notes, writes them to vault, marks as synced.
 */
export class SyncEngine {
	private intervalId: number | null = null;
	private syncing = false;

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
		// Immediate first sync
		void this.sync();
		this.intervalId = window.setInterval(
			() => void this.sync(),
			intervalSec * 1000
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
	 * Perform a single sync operation.
	 * Can be called manually or by the interval.
	 */
	async sync(): Promise<void> {
		if (this.syncing) {
			return; // Guard against overlapping syncs
		}
		this.syncing = true;

		try {
			const notes = await this.client.fetchUnsynced();
			if (notes.length === 0) {
				return;
			}

			const written: string[] = [];
			const syncedIds: string[] = [];

			for (const note of notes) {
				const path = await this.writer.write(note);
				if (path) {
					written.push(path);
				}
				syncedIds.push(note.id);
			}

			if (syncedIds.length > 0) {
				await this.client.markSynced(syncedIds);
			}

			if (written.length > 0) {
				new Notice(`ArchivistBot: synced ${written.length} note(s)`);
			}
		} catch (e) {
			console.error("[ArchivistBot] sync error:", e);
			// Don't spam Notice on every interval - only on manual sync
		} finally {
			this.syncing = false;
		}
	}

	/**
	 * Manual sync with error notification.
	 */
	async manualSync(): Promise<void> {
		if (this.syncing) {
			new Notice("Archivistbot: sync already in progress");
			return;
		}

		try {
			await this.sync();
			// If no notes were synced, show a message
			// (sync() already shows notice if notes were written)
		} catch (e) {
			new Notice(`ArchivistBot: sync failed - ${String(e)}`);
			throw e;
		}
	}
}
