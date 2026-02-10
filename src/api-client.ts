// src/api-client.ts
import { requestUrl, RequestUrlParam } from "obsidian";
import type {
	SyncResponse,
	HealthResponse,
	MarkSyncedResponse,
	CategoriesResponse,
	CategoryItem,
	TagsRegistryResponse,
	TagsRegistry,
	TokenPairResponse,
	ReconcileArchivedResponse,
	UserSettingsResponse,
	UserSettingsUpdateRequest,
} from "./types";
import type { ArchivistBotSettings } from "./settings";

/**
 * Thrown when the refresh token itself is expired or revoked.
 * Callers should notify the user to obtain a new token from Telegram.
 */
export class RefreshTokenExpiredError extends Error {
	constructor() {
		super("Refresh token expired or revoked. Use /newtoken in Telegram.");
		this.name = "RefreshTokenExpiredError";
	}
}

/**
 * Extract HTTP status code from requestUrl error string.
 * requestUrl throws strings like "Error: Request failed, status 401".
 */
function extractHttpStatus(error: unknown): number | null {
	const match = String(error).match(/status (\d+)/);
	return match ? parseInt(match[1]) : null;
}

/** Margin before expiry to trigger proactive refresh (60 seconds). */
const EXPIRY_MARGIN_MS = 60_000;

/** Request timeout per attempt (ms). */
const TIMEOUT_MS = 3_000;

/**
 * Retry policy for regular API requests.
 * Short retries — sync engine has its own interval, no need to block for minutes.
 */
const REQUEST_MAX_RETRIES = 2;
const REQUEST_BASE_DELAY_MS = 1_000;

/**
 * Retry policy for token refresh.
 * More aggressive — losing the refresh token means user has to re-authenticate.
 */
const REFRESH_MAX_RETRIES = 5;
const REFRESH_BASE_DELAY_MS = 20_000;

/**
 * Single requestUrl call with timeout.
 * Obsidian's requestUrl has no native timeout — race against a timer.
 */
function timedRequest(
	params: RequestUrlParam,
): Promise<import("obsidian").RequestUrlResponse> {
	return Promise.race([
		requestUrl(params),
		new Promise<never>((_, reject) => {
			const timer = window.setTimeout(
				() => reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`)),
				TIMEOUT_MS,
			);
			// Prevent timer from keeping Node alive in tests
			if (typeof timer === "object" && "unref" in timer) {
				(timer as ReturnType<typeof setTimeout>).unref();
			}
		}),
	]);
}

/**
 * Check if an error is retryable.
 * 4xx client errors (except 408/429) are not retryable.
 */
function isRetryable(error: unknown): boolean {
	const status = extractHttpStatus(error);
	if (status === null) {
		// Network error / timeout — retryable
		return true;
	}
	// 408 Request Timeout, 429 Too Many Requests, 5xx — retryable
	if (status === 408 || status === 429 || status >= 500) {
		return true;
	}
	// All other 4xx (401, 403, 404, etc.) — not retryable
	return false;
}

/**
 * requestUrl with timeout + exponential backoff retry.
 *
 * @param params - requestUrl parameters
 * @param maxRetries - max retry attempts (default: REQUEST_MAX_RETRIES)
 * @param baseDelayMs - base delay between retries (default: REQUEST_BASE_DELAY_MS)
 */
async function requestWithRetry(
	params: RequestUrlParam,
	maxRetries: number = REQUEST_MAX_RETRIES,
	baseDelayMs: number = REQUEST_BASE_DELAY_MS,
): Promise<import("obsidian").RequestUrlResponse> {
	let lastError: unknown;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await timedRequest(params);
		} catch (e) {
			lastError = e;

			if (!isRetryable(e) || attempt === maxRetries - 1) {
				throw e;
			}

			const delay = baseDelayMs * 2 ** attempt;
			await sleep(delay);
		}
	}

	throw lastError;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * REST client for ArchivistBot API.
 *
 * Uses obsidian requestUrl() instead of fetch() —
 * works on both Desktop and Mobile, bypasses CORS.
 *
 * Handles JWT token lifecycle:
 * - Proactively refreshes access token before expiry
 * - Retries once on 401 with a fresh access token
 * - Throws RefreshTokenExpiredError when refresh token is dead
 */
export class ArchivistApiClient {
	private refreshing: Promise<void> | null = null;

	constructor(
		private getSettings: () => ArchivistBotSettings,
		private saveSettings: () => Promise<void>,
	) {}

	private get baseUrl(): string {
		return this.getSettings().endpoint.replace(/\/+$/, "");
	}

	// ── Token management ──

	/**
	 * Check if access token is still valid (with margin).
	 */
	private isAccessTokenValid(): boolean {
		const settings = this.getSettings();
		if (!settings.accessToken || !settings.accessTokenExpiresAt) {
			return false;
		}
		return Date.now() < settings.accessTokenExpiresAt - EXPIRY_MARGIN_MS;
	}

	/**
	 * Ensure we have a valid access token. Refreshes if needed.
	 * Deduplicates concurrent refresh calls.
	 */
	private async ensureAccessToken(): Promise<void> {
		if (this.isAccessTokenValid()) {
			return;
		}

		// Deduplicate: if refresh is already in flight, wait for it
		if (this.refreshing) {
			await this.refreshing;
			return;
		}

		this.refreshing = this.doRefresh();
		try {
			await this.refreshing;
		} finally {
			this.refreshing = null;
		}
	}

	/**
	 * Exchange refresh token for a new access + refresh token pair.
	 */
	private async doRefresh(): Promise<void> {
		const settings = this.getSettings();
		if (!settings.refreshToken) {
			throw new RefreshTokenExpiredError();
		}

		try {
			const resp = await requestWithRetry(
				{
					url: `${this.baseUrl}/v1/auth/refresh`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${settings.refreshToken}`,
					},
				},
				REFRESH_MAX_RETRIES,
				REFRESH_BASE_DELAY_MS,
			);

			const data = resp.json as TokenPairResponse;

			// Persist new tokens
			settings.accessToken = data.access_token;
			settings.accessTokenExpiresAt = new Date(data.expires_at).getTime();
			settings.refreshToken = data.refresh_token;
			await this.saveSettings();
		} catch (e) {
			const status = extractHttpStatus(e);
			if (status === 401 || status === 403) {
				// Refresh token expired or session revoked
				settings.accessToken = "";
				settings.accessTokenExpiresAt = 0;
				await this.saveSettings();
				throw new RefreshTokenExpiredError();
			}
			throw e;
		}
	}

	/**
	 * Build auth headers using current access token.
	 */
	private authHeaders(): Record<string, string> {
		const h: Record<string, string> = { "Content-Type": "application/json" };
		const token = this.getSettings().accessToken;
		if (token) {
			h["Authorization"] = `Bearer ${token}`;
		}
		return h;
	}

	/**
	 * Execute an authenticated request with automatic token refresh.
	 * On 401: refreshes token and retries once.
	 */
	private async request<T>(params: RequestUrlParam): Promise<T> {
		await this.ensureAccessToken();

		try {
			const resp = await requestWithRetry({
				...params,
				headers: { ...this.authHeaders(), ...params.headers },
			});
			return resp.json as T;
		} catch (e) {
			const status = extractHttpStatus(e);
			if (status !== 401) {
				throw e;
			}

			// 401 — token might have been revoked server-side, try refresh once
			await this.doRefresh();

			const resp = await requestWithRetry({
				...params,
				headers: { ...this.authHeaders(), ...params.headers },
			});
			return resp.json as T;
		}
	}

	// ── Health (no auth required) ──

	async health(): Promise<HealthResponse> {
		const resp = await requestWithRetry({
			url: `${this.baseUrl}/health`,
			headers: { "Content-Type": "application/json" },
		});
		return resp.json as HealthResponse;
	}

	// ── Notes ──

	async fetchUnsynced(): Promise<SyncResponse> {
		return this.request<SyncResponse>({
			url: `${this.baseUrl}/v1/notes/unsynced`,
		});
	}

	async markSynced(
		noteIds: string[],
		vaultPaths?: Record<string, string>,
	): Promise<MarkSyncedResponse> {
		const payload: { note_ids: string[]; vault_paths?: Record<string, string> } = {
			note_ids: noteIds,
		};
		if (vaultPaths && Object.keys(vaultPaths).length > 0) {
			payload.vault_paths = vaultPaths;
		}
		return this.request<MarkSyncedResponse>({
			url: `${this.baseUrl}/v1/notes/mark-synced`,
			method: "POST",
			body: JSON.stringify(payload),
		});
	}

	// ── Plugin init ──

	async pluginInit(
		categories: CategoryItem[]
	): Promise<{ status: string; categories_saved: number; pending_notes: number; message: string }> {
		return this.request({
			url: `${this.baseUrl}/v1/init`,
			method: "POST",
			body: JSON.stringify({ categories }),
		});
	}

	// ── Categories ──

	async getCategories(): Promise<CategoriesResponse> {
		return this.request<CategoriesResponse>({
			url: `${this.baseUrl}/v1/categories`,
		});
	}

	async updateCategories(categories: CategoryItem[]): Promise<CategoriesResponse> {
		return this.request<CategoriesResponse>({
			url: `${this.baseUrl}/v1/categories`,
			method: "PUT",
			body: JSON.stringify({ categories }),
		});
	}

	// ── Tags ──

	async getTags(): Promise<TagsRegistryResponse> {
		return this.request<TagsRegistryResponse>({
			url: `${this.baseUrl}/v1/tags`,
		});
	}

	async updateTags(registry: TagsRegistry): Promise<TagsRegistryResponse> {
		return this.request<TagsRegistryResponse>({
			url: `${this.baseUrl}/v1/tags`,
			method: "PUT",
			body: JSON.stringify({ registry }),
		});
	}

	// ── Archive reconciliation ──

	async reconcileArchived(vaultPaths: string[]): Promise<ReconcileArchivedResponse> {
		return this.request<ReconcileArchivedResponse>({
			url: `${this.baseUrl}/v1/notes/reconcile-archived`,
			method: "POST",
			body: JSON.stringify({ vault_paths: vaultPaths }),
		});
	}

	// ── User settings ──

	async getUserSettings(): Promise<UserSettingsResponse> {
		return this.request<UserSettingsResponse>({
			url: `${this.baseUrl}/v1/user/settings`,
		});
	}

	async updateUserSettings(settings: UserSettingsUpdateRequest): Promise<UserSettingsResponse> {
		return this.request<UserSettingsResponse>({
			url: `${this.baseUrl}/v1/user/settings`,
			method: "PATCH",
			body: JSON.stringify(settings),
		});
	}
}
