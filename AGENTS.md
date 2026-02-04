# ArchivistBot Obsidian Plugin

## Project overview

- **Purpose**: Obsidian plugin for syncing voice notes from ArchivistBot Telegram bot
- **Target**: Obsidian Community Plugin (TypeScript → bundled JavaScript)
- **Entry point**: `src/main.ts` compiled to `main.js` and loaded by Obsidian
- **Required release artifacts**: `main.js`, `manifest.json`, `styles.css`

## Architecture

```
src/
├── main.ts           # Plugin entry point, lifecycle, commands registration
├── settings.ts       # Settings interface + SettingTab UI
├── types.ts          # API contract types (mirrors server models)
├── api-client.ts     # REST client using obsidian requestUrl
├── note-writer.ts    # NoteResponse → .md file in vault
├── sync-engine.ts    # Periodic sync logic + mark-synced
└── archiver.ts       # Archive modal + frontmatter update + file move
```

### Module responsibilities

| Module | Responsibility |
|--------|----------------|
| `main.ts` | Plugin lifecycle (onload/onunload), command registration, ribbon icon, context menu, settings tab |
| `settings.ts` | `ArchivistBotSettings` interface, `DEFAULT_SETTINGS`, `ArchivistBotSettingTab` class |
| `types.ts` | `NoteResponse`, `HealthResponse`, `MarkSyncedRequest`, `MarkSyncedResponse` |
| `api-client.ts` | `ArchivistApiClient` class with `health()`, `fetchUnsynced()`, `markSynced()` |
| `note-writer.ts` | `NoteWriter` class - creates folders, sanitizes filenames, writes markdown |
| `sync-engine.ts` | `SyncEngine` class - interval management, sync logic, deduplication |
| `archiver.ts` | `NoteArchiver` class, `ArchiveModal` - resolution selection, frontmatter update, file move |

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

Server endpoints used by the plugin:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check, returns `{ status, version }` |
| GET | `/notes/unsynced` | Fetch notes pending sync, returns `NoteResponse[]` |
| POST | `/notes/mark-synced` | Mark notes as synced, body: `{ ids: string[] }` |

### NoteResponse structure

```typescript
interface NoteResponse {
  id: string;
  title: string;
  content: string;      // raw transcript
  markdown: string;     // ready .md with frontmatter
  category: string;
  subcategory: string | null;
  tags: string[];
  summary: string;
  created_at: string;   // ISO datetime
  source: string;       // "telegram"
}
```

## Plugin features

### Commands (stable IDs - do not rename)

| ID | Name | Description |
|----|------|-------------|
| `sync-now` | Sync notes now | Manual sync trigger |
| `health-check` | Check server connection | Test server connectivity |
| `archive-note` | Archive note | Archive current note with resolution |

### Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `endpoint` | string | `http://localhost:8000` | Server URL |
| `authToken` | string | `""` | Bearer token (optional) |
| `syncIntervalSec` | number | `60` | Sync interval (10-300) |
| `vaultBasePath` | string | `VoiceNotes` | Root folder for notes |
| `autoSync` | boolean | `true` | Enable automatic sync |

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
├── {category}/
│   ├── {subcategory}/
│   │   └── {title}.md
│   └── {title}.md
└── _archive/
    └── {category}/
        └── {title}.md
```

## Testing

1. Build: `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to `<vault>/.obsidian/plugins/archivistbot/`
3. Reload Obsidian, enable plugin
4. Configure server URL in settings
5. Test sync and archive functionality

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
