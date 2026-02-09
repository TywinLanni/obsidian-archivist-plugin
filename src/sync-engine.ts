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
/** Cooldown after manual sync to prevent button spam (ms). */
const MANUAL_SYNC_COOLDOWN_MS = 2_000;

/** Callback that returns vault_paths of archived notes (files in _archive/). */
export type ArchiveScanner = () => Promise<string[]>;

/** Called when SyncEngine successfully reaches the server after being offline. */
export type OnServerReachable = () => void;

export class SyncEngine {
	private intervalId: number | null = null;
	private syncing = false;
	private consecutiveFailures = 0;
	private baseIntervalSec = 60;
	private lastManualSyncAt = 0;
	private archiveScanner: ArchiveScanner | null = null;
	private onServerReachable: OnServerReachable | null = null;

	constructor(
		private client: ArchivistApiClient,
		private writer: NoteWriter,
		private registerInterval: (id: number) => void
	) {}

	/**
	 * Set archive scanner for reconciliation during sync.
	 * When set, each sync cycle will also reconcile archived notes with the server.
	 */
	setArchiveScanner(scanner: ArchiveScanner): void {
		this.archiveScanner = scanner;
	}

	/**
	 * Set callback invoked when server becomes reachable after failures.
	 * Used to re-initialize config sync after offline → online transition.
	 */
	setOnServerReachable(callback: OnServerReachable): void {
		this.onServerReachable = callback;
	}

	/**
	 * Start periodic sync.
	 * @param intervalSec Interval between syncs in seconds
	 */
	start(intervalSec: number): void {
		this.stop();
		this.baseIntervalSec = intervalSec;
		this.consecutiveFailures = 0;
		// Immediate first sync, then schedule periodic.
		// Chain: sync → schedule to avoid overlapping intervals.
		void this.syncAndSchedule();
	}

	/**
	 * Run sync, then (re)schedule the next tick with current backoff.
	 * This is the single owner of the interval lifecycle.
	 */
	private async syncAndSchedule(): Promise<void> {
		try {
			await this.sync();
		} catch {
			// sync() already tracks consecutiveFailures
		}
		// Always schedule next tick (backoff is already updated by sync)
		this.scheduleNext();
	}

	/**
	 * Schedule next sync with backoff on failures.
	 */
	private scheduleNext(): void {
		// Clear any existing interval first
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}

		const multiplier = Math.min(
			2 ** this.consecutiveFailures,
			2 ** MAX_BACKOFF_MULTIPLIER,
		);
		const intervalMs = this.baseIntervalSec * multiplier * 1000;

		this.intervalId = window.setInterval(
			() => void this.syncAndSchedule(),
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
	 * Perform a single sync operation.
	 * Does NOT manage intervals — caller is responsible for scheduling.
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
				// Success — reset backoff, notify listener
				this.consecutiveFailures = 0;
				this.onServerReachable?.();
				return 0;
			}

			const written: string[] = [];
			const syncedIds: string[] = [];
			const vaultPaths: Record<string, string> = {};

			for (const note of notes) {
				try {
					const path = await this.writer.write(note);
					if (path) {
						written.push(path);
						vaultPaths[note.id] = path;
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
				await this.client.markSynced(syncedIds, vaultPaths);
			}

			if (written.length > 0) {
				new Notice(`Archivistbot: synced ${written.length} note(s)`);
			}

			// Reconcile archived notes with server (removes from digest inbox)
			await this.reconcileArchived();

			// Success — reset backoff, notify listener
			this.consecutiveFailures = 0;
			this.onServerReachable?.();
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
			throw e;
		} finally {
			this.syncing = false;
		}
	}

	/**
	 * Reconcile archived notes with server.
	 * Scans _archive/ folder and tells server which vault_paths are archived,
	 * so they can be removed from digest inbox.
	 */
	private async reconcileArchived(): Promise<void> {
		if (!this.archiveScanner) {
			return;
		}

		try {
			const archivedPaths = await this.archiveScanner();
			if (archivedPaths.length > 0) {
				await this.client.reconcileArchived(archivedPaths);
			}
		} catch (e) {
			// Non-critical — log and continue, don't break sync
			console.error("[ArchivistBot] archive reconciliation failed:", e);
		}
	}

	/**
	 * Manual sync with user-facing feedback and cooldown.
	 * Ignores rapid clicks within MANUAL_SYNC_COOLDOWN_MS.
	 */
	async manualSync(): Promise<void> {
		const now = Date.now();
		if (now - this.lastManualSyncAt < MANUAL_SYNC_COOLDOWN_MS) {
			return; // Cooldown — silently ignore
		}

		if (this.syncing) {
			new Notice("Archivistbot: sync already in progress");
			return;
		}

		this.lastManualSyncAt = now;

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
