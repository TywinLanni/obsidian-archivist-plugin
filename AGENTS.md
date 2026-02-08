# ArchivistBot Obsidian Plugin

## Project overview

- **Purpose**: Obsidian plugin for syncing voice notes from ArchivistBot Telegram bot
- **Target**: Obsidian Community Plugin (TypeScript → bundled JavaScript)
- **Entry point**: `src/main.ts` compiled to `main.js` and loaded by Obsidian
- **Required release artifacts**: `main.js`, `manifest.json`, `styles.css`

## Related Repositories

| Repository       | Path                                       | Description                                           |
|------------------|--------------------------------------------|-------------------------------------------------------|
| **ArchivistBot** | `C:\Users\Tywin\IdeaProjects\ArchivistBot` | Telegram bot + REST API (Python, FastAPI, PostgreSQL) |

### Cross-repo workflow

When a feature in this plugin requires corresponding work in the bot:

1. Implement the plugin side (UI, API client calls, types)
2. Add a task to the bot's `TODO.md` (`C:\Users\Tywin\IdeaProjects\ArchivistBot\TODO.md`)
3. The task must include:
   - Description of what the bot needs to implement
   - Links to the plugin files with the implementation (relative paths from plugin repo root, e.g. `src/api-client.ts`)
   - Relevant API endpoints or model changes

Example entry in bot TODO.md:
```markdown
- [ ] **Feature name** — description of bot-side work.
  Plugin implementation: `src/....ts`.
  API: `POST /v1/endpoint`.
```

## Architecture

```
src/
├── main.ts              # Plugin entry point, lifecycle, commands registration
├── settings.ts          # Settings interface + SettingTab UI
├── types.ts             # API contract types (mirrors server models)
├── api-client.ts        # REST client using obsidian requestUrl
├── note-writer.ts       # NoteResponse → .md file in vault
├── sync-engine.ts       # Periodic sync logic + mark-synced
├── archiver.ts          # Archive modal + frontmatter update + file move
├── categories-manager.ts # Parse/write categories.md (markdown table)
├── tags-manager.ts      # Parse/write tags_registry.md (YAML frontmatter)
└── config-sync.ts       # Orchestrates categories/tags sync with server
```

### Module responsibilities

| Module                  | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                 |
|-------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `main.ts`               | Plugin lifecycle (onload/onunload), command registration, ribbon icon, context menu, settings tab, status bar                                                                                                                                                                                                                                                                                                                  |
| `settings.ts`           | `ArchivistBotSettings` interface, `DEFAULT_SETTINGS`, `ArchivistBotSettingTab` class                                                                                                                                                                                                                                                                                                                                           |
| `types.ts`              | Core: `NoteResponse`, `SyncResponse`, `HealthResponse`, `MarkSyncedRequest`, `MarkSyncedResponse`, `CategoryItem`, `CategoriesResponse`, `CategoriesUpdateRequest`, `TagsRegistryResponse`, `TagsUpdateRequest`, `TagsRegistry`. Auth: `TokenPairResponse`, `ErrorResponse`. User/GDPR: `UserSettingsResponse`, `UserSettingsUpdateRequest`, `SessionInfo`, `UserSessionsResponse`, `UserDataExport`, `UserDataDeleteResponse` |
| `api-client.ts`         | `ArchivistApiClient` class with `health()`, `fetchUnsynced()`, `markSynced()`, `pluginInit()`, `getCategories()`, `updateCategories()`, `getTags()`, `updateTags()`                                                                                                                                                                                                                                                            |
| `note-writer.ts`        | `NoteWriter` class - creates folders, sanitizes filenames, writes markdown                                                                                                                                                                                                                                                                                                                                                     |
| `sync-engine.ts`        | `SyncEngine` class - interval management, sync logic, deduplication                                                                                                                                                                                                                                                                                                                                                            |
| `archiver.ts`           | `NoteArchiver` class, `ArchiveModal` - resolution selection, frontmatter update, file move                                                                                                                                                                                                                                                                                                                                     |
| `categories-manager.ts` | `CategoriesManager` class - parse/write `categories.md` markdown table format                                                                                                                                                                                                                                                                                                                                                  |
| `tags-manager.ts`       | `TagsManager` class - parse/write `tags_registry.md` YAML frontmatter format                                                                                                                                                                                                                                                                                                                                                   |
| `config-sync.ts`        | `ConfigSync` class - orchestrates bidirectional sync, file watching, status tracking                                                                                                                                                                                                                                                                                                                                           |

## Environment & tooling

- **Node.js**: 18+ LTS
- **Package manager**: npm
- **Bundler**: esbuild (configured in `esbuild.config.mjs`)
- **Types**: `obsidian` package provides type definitions
- **Linting**: eslint with `eslint-plugin-obsidianmd`

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Development mode (watch)
npm run build        # Production build (tsc check + esbuild minified)
npm run lint         # Run eslint
```

## API contract

**Source of truth:** [`ArchivistBot/core/openapi.yaml`](https://github.com/TywinLanni/ArchivistBot/blob/master/core/openapi.yaml)

### Updating types after API changes

```bash
npm run update-api    # Fetches spec and regenerates types
```

This runs:
1. `fetch-spec` — downloads `openapi.yaml` from ArchivistBot repo (by tag)
2. `generate-types` — runs `openapi-typescript` to generate `src/api-types.ts`

### Generated files

- `openapi.yaml` — local copy of spec (fetched from ArchivistBot)
- `src/api-types.ts` — generated TypeScript types (DO NOT EDIT)
- `src/types.ts` — re-exports from api-types.ts with convenient aliases

### Versioning

Types are generated from a specific git tag. To update to a new API version:

1. Update the tag in `package.json` scripts (e.g., `v0.1.0` → `v1.0.0`)
2. Run `npm run update-api`
3. Fix any type errors in the codebase
4. Test thoroughly

### Current types

Types in `src/types.ts` re-export from generated `src/api-types.ts`:

| Type                        | Description                                               |
|-----------------------------|-----------------------------------------------------------|
| `NoteResponse`              | Note data with id, name, content, category, tags, summary |
| `SyncResponse`              | Wrapper with notes array and server_time                  |
| `HealthResponse`            | Server status and version                                 |
| `MarkSyncedRequest`         | Request body for marking notes synced                     |
| `MarkSyncedResponse`        | Count of synced notes                                     |
| `CategoryItem`              | Category name and description                             |
| `CategoriesResponse`        | Categories array with updated_at                          |
| `CategoriesUpdateRequest`   | Request body for updating categories                      |
| `TagsRegistryResponse`      | Registry with updated_at                                  |
| `TagsUpdateRequest`         | Request body for updating tags                            |
| `TagsRegistry`              | `{category: {tag: count}}` convenience type               |
| `TokenPairResponse`         | Access + refresh token pair (auth)                        |
| `ErrorResponse`             | Error response with detail message                        |
| `UserSettingsResponse`      | User settings from server                                 |
| `UserSettingsUpdateRequest` | Request body for updating user settings                   |
| `SessionInfo`               | Single session info (device, last_used)                   |
| `UserSessionsResponse`      | List of user sessions                                     |
| `UserDataExport`            | Full user data export (GDPR)                              |
| `UserDataDeleteResponse`    | Confirmation of user data deletion (GDPR)                 |

## Plugin features

### Commands (stable IDs - do not rename)

| ID             | Name                     | Description                          |
|----------------|--------------------------|--------------------------------------|
| `sync-now`     | Sync notes now           | Manual sync trigger                  |
| `sync-config`  | Sync categories and tags | Manual config sync trigger           |
| `health-check` | Check server connection  | Test server connectivity             |
| `archive-note` | Archive note             | Archive current note with resolution |

### Status bar indicator

Shows config sync status:
- 🟢 synced — all changes pushed to server
- 🟡 pending — local changes waiting to sync
- 🔴 error — sync failed (click to retry)
- ⚫ offline — server unreachable

### Settings

| Key                    | Type    | Default                 | Description                                               |
|------------------------|---------|-------------------------|-----------------------------------------------------------|
| `endpoint`             | string  | `http://localhost:8000` | Server URL                                                |
| `refreshToken`         | string  | `""`                    | Refresh token (obtained via Connect flow in Telegram bot) |
| `accessToken`          | string  | `""`                    | Short-lived access token (auto-refreshed)                 |
| `accessTokenExpiresAt` | number  | `0`                     | Access token expiry (unix timestamp ms, 0 = not set)      |
| `syncIntervalSec`      | number  | `60`                    | Sync interval (10-300)                                    |
| `vaultBasePath`        | string  | `VoiceNotes`            | Root folder for notes                                     |
| `autoSync`             | boolean | `true`                  | Enable automatic sync                                     |

## Coding conventions

- TypeScript strict mode
- Use `obsidian` `requestUrl()` instead of `fetch()` for network requests (mobile compatibility, CORS bypass)
- Use `this.register*` helpers for all cleanup (intervals, events, DOM)
- Use `app.fileManager.processFrontMatter()` for safe frontmatter updates
- Use `app.fileManager.renameFile()` for file moves (updates links)
- Sentence case for all UI text (enforced by eslint)

## File organization in vault

```
{vaultBasePath}/
├── categories.md         # Category definitions (markdown table)
├── tags_registry.md      # Tags by category (YAML frontmatter)
├── {category}/
│   ├── {subcategory}/
│   │   └── {title}.md
│   └── {title}.md
└── _archive/
    └── {category}/
        └── {title}.md
```

### Config file formats

**categories.md** (markdown table):
```markdown
# Categories

| Category | Description |
|----------|-------------|
| work | Work-related notes |
| personal | Personal notes |
```

**tags_registry.md** (YAML frontmatter):
```markdown
---
work:
  meeting: 5
  project: 3
personal:
  health: 2
  finance: 1
---

# Tags Registry

This file tracks tag usage across categories.
```

## Testing

1. Build: `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to `<vault>/.obsidian/plugins/archivistbot/`
3. Reload Obsidian, enable plugin
4. Configure server URL in settings
5. Test sync and archive functionality

## Documentation

| Document        | Audience   | Location                                                                | Description                          |
|-----------------|------------|-------------------------------------------------------------------------|--------------------------------------|
| `README.md`     | Developers | This repo                                                               | Setup, architecture, contributing    |
| `user-guide.md` | End users  | **Bot repo** (`C:\Users\Tywin\IdeaProjects\ArchivistBot\user-guide.md`) | Features, commands, plugin usage     |
| `AGENTS.md`     | AI agents  | This repo                                                               | Project rules, patterns, conventions |

### User Guide maintenance

The user guide lives in the **bot repository** (single source of truth for both projects).

When implementing a **user-facing feature** in the plugin (new command, settings change, sync behavior, UI element):

1. Update `C:\Users\Tywin\IdeaProjects\ArchivistBot\user-guide.md` — section "Obsidian плагин"
2. Keep the guide in Russian, written for non-technical users
3. Do NOT add implementation details — only describe what the user sees and does

## Agent guidelines

### Do

- Keep `main.ts` focused on lifecycle and registration
- Use existing module structure - add new features to appropriate modules
- Maintain stable command IDs
- Use `requestUrl` for all HTTP requests
- Register all intervals/events with `this.register*` helpers
- Follow sentence case for UI text

### Don't

- Add network calls without documenting in README
- Change command IDs after release
- Use `fetch()` directly (breaks mobile)
- Create files outside `vaultBasePath`
- Skip frontmatter processing for metadata updates

## References

- Obsidian API: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Developer policies: https://docs.obsidian.md/Developer+policies
