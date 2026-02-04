# ArchivistBot Obsidian Plugin

Sync voice notes from ArchivistBot Telegram bot to your Obsidian vault with auto-categorization.

## Features

- **Automatic sync** — periodically fetches new notes from ArchivistBot server
- **Manual sync** — ribbon icon and command for on-demand sync
- **Archive notes** — move processed notes to archive with resolution status
- **Auto-categorization** — notes are organized by category/subcategory from AI processing
- **Mobile compatible** — works on both desktop and mobile Obsidian

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder `<vault>/.obsidian/plugins/archivistbot/`
3. Copy the downloaded files into this folder
4. Reload Obsidian
5. Enable the plugin in **Settings → Community plugins**

### From source

```bash
git clone https://github.com/TywinLanni/obsidian-archivist-plugin
cd obsidian-archivist-plugin
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.

## Configuration

Open **Settings → ArchivistBot** to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| Server URL | ArchivistBot API endpoint | `http://localhost:8000` |
| Auth token | Bearer token for authentication (optional for local) | empty |
| Sync interval | Seconds between automatic syncs (10-300) | 60 |
| Vault base path | Folder where synced notes are stored | `VoiceNotes` |
| Auto sync | Enable/disable automatic sync | enabled |

## Usage

### Syncing notes

- **Automatic**: Notes sync automatically based on the configured interval
- **Manual**: Click the refresh icon in the ribbon or use command **ArchivistBot: Sync notes now**
- **Health check**: Use command **ArchivistBot: Check server connection** to verify server connectivity

### Archiving notes

When you're done with a note, archive it with a resolution:

1. Open the note or right-click it in the file explorer
2. Select **Archive (archivistbot)** from context menu, or use command **ArchivistBot: Archive note**
3. Choose resolution: **Realized**, **Dropped**, or **Outdated**

The note will be moved to `<base-path>/_archive/<category>/` with updated frontmatter:
- `resolution`: your selected resolution
- `archived_at`: timestamp of archival

## File structure

Synced notes are organized as:

```
VoiceNotes/
├── work/
│   ├── meetings/
│   │   └── standup-notes.md
│   └── ideas.md
├── personal/
│   └── shopping-list.md
└── _archive/
    └── work/
        └── completed-task.md
```

## Commands

| Command | Description |
|---------|-------------|
| Sync notes now | Manually trigger sync with server |
| Check server connection | Test if server is reachable |
| Archive note | Archive the current note with resolution |

## Network disclosure

This plugin connects to your configured ArchivistBot server to:
- Fetch unsynced notes (`GET /notes/unsynced`)
- Mark notes as synced (`POST /notes/mark-synced`)
- Check server health (`GET /health`)

No data is sent to third parties. All communication is with your self-hosted or configured server.

## Development

```bash
# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

## Requirements

- Obsidian 1.5.0 or later
- ArchivistBot server running and accessible

## License

MIT

## Author

[TywinLanni](https://github.com/TywinLanni)
