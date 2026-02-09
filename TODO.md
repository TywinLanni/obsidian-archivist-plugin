# obsidian-archivist-plugin — TODO

> Состояние на 2026-02-09.

---

## Текущая стадия готовности

| Компонент                                         | Статус  | Комментарий                                                                |
|---------------------------------------------------|---------|----------------------------------------------------------------------------|
| **Sync engine** — pull notes, mark synced         | ✅ Готов | Auto-sync, per-note error handling, backoff при consecutive failures       |
| **Note writer** — markdown + frontmatter          | ✅ Готов | Дедупликация, sanitize, frontmatter через `stringifyYaml()`                |
| **Archiver** — modal + move to _archive           | ✅ Готов | Resolution selection                                                       |
| **Config sync** — categories + tags bidirectional | ✅ Готов | File watcher, debounce, status bar, cleanup через `destroy()`              |
| **Settings UI**                                   | ✅ Готов | Endpoint, token, interval, basePath                                        |
| **Auth (JWT refresh)**                            | ✅ Готов | Proactive refresh, retry on 401, `RefreshTokenExpiredError` → Notice       |
| **API client** — requestUrl + retry               | ✅ Готов | 3s timeout, 5 attempts, exponential backoff, smart retry (skip 4xx)        |
| **Smart split + action items**                    | ✅ Готов | action_items → чекбоксы, source_batch_id → wikilinks между split-заметками |
| **Тесты**                                         | ✅ Готов | 64 unit-теста (vitest): categories, tags, note-writer, sync-engine         |
| **Публикация в Community Plugins**                | ❌ Нет   |                                                                            |

---

## Выполнено

### Фаза 1 — MVP ✅

- [x] **JWT refresh flow** — `refreshToken` + `accessToken` в settings, proactive refresh (60s margin), `POST /v1/auth/refresh`, `RefreshTokenExpiredError` с Notice пользователю.
- [x] **Тесты** — 64 unit-теста: `CategoriesManager` (11), `TagsManager` (8), `NoteWriter` (27), `SyncEngine` (18). Vitest + mock Obsidian API.
- [x] **Error handling в sync** — per-note try/catch (failed write не помечает synced), backoff при consecutive failures (×2 до ×32), retry + уведомление.
- [x] **Request reliability** — 3s timeout, 5 attempts, exponential backoff (~5 min total), smart retry (только timeout/network/5xx/408/429).
- [x] **YAML handling** — `parseYaml()`/`stringifyYaml()` из Obsidian API вместо ручного парсинга (tags-manager, note-writer).
- [x] **OpenAPI types** — spec v0.2.0, `openapi-typescript` генерация, новые типы (auth, sessions, GDPR).

---

## Следующие шаги

### Фаза 2 — Публичный запуск

- [x] **Reply/append support** — при синхронизации: если `NoteResponse.append_to` содержит vault path, дописывать контент в существующую заметку вместо создания новой. Бот теперь сохраняет `parent_note_id` (FK) и API резолвит `append_to` = vault_path родителя. Plugin должен: (1) при mark-synced отправлять `vault_paths` mapping, (2) при получении заметки с `append_to` — находить файл и дописывать контент.
  Bot implementation: `core/src/archivistbot_core/handlers/messages.py`, `core/src/archivistbot_core/storage/models.py` (Note.parent_note_id).
  API: `GET /v1/notes/unsynced` returns `append_to` (see `commercial/src/archivistbot_commercial/api_server.py`).
  API: `POST /v1/notes/mark-synced` accepts `vault_paths` mapping (see `commercial/src/archivistbot_commercial/api_server.py`).
- [x] **Digest reminders — category frequency sync** — парсить колонку `Reminder` из `categories.md` (значения: `off`, `daily`, `weekly`, `monthly`; default: `weekly`). Включать поле `reminder` в `PUT /v1/categories`. При `GET /v1/categories` — читать `reminder` и записывать обратно в таблицу `categories.md`.
  Bot implementation: `core/src/archivistbot_core/storage/models.py` (Category.reminder), `core/openapi.yaml` (CategoryItem.reminder).
  API: `PUT /v1/categories` accepts `reminder` field, `GET /v1/categories` returns it (see `commercial/src/archivistbot_commercial/api_server.py`).
- [x] **Digest reminders — user settings UI** — добавить в настройки плагина секцию Reminder Settings: `send_time` (HH:MM), `timezone` (IANA), `weekly_day`, `monthly_day`. Синхронизировать через `PATCH /v1/user/settings` → `reminders` object.
  API: `GET/PATCH /v1/user/settings` — поле `reminders` (see `commercial/src/archivistbot_commercial/api_server.py`, `core/openapi.yaml` — `ReminderSettings` schema).
- [x] **Digest reminders — archive reconciliation** — при каждой синхронизации сканировать `_archive/` и отправлять `POST /v1/notes/reconcile-archived` с vault_paths архивированных заметок, чтобы убрать их из дайджестов.
  API: `POST /v1/notes/reconcile-archived` (see `commercial/src/archivistbot_commercial/api_server.py`).
- [x] **Smart split + action items** — `NoteResponse` получил поля `source_batch_id` (nullable string) и `action_items` (string[]). NoteWriter: action_items во frontmatter + секция «Задачи» с чекбоксами (`- [ ]`), source_batch_id во frontmatter + секция «Связанные заметки» с wikilinks на sibling-заметки. SyncEngine: `buildBatchSiblings()` группирует заметки по `source_batch_id` и передаёт имена siblings в writer.
  Bot implementation: `core/src/archivistbot_core/models/note.py` (SplitResult, action_items), `core/src/archivistbot_core/handlers/messages.py` (split flow), `commercial/src/archivistbot_commercial/llm_claude.py` (split_and_categorize).
  API: `GET /v1/notes/unsynced` returns `source_batch_id`, `action_items` (see `core/openapi.yaml`, `commercial/src/archivistbot_commercial/api_server.py`).
- [ ] **Настраиваемый промпт** — пользователь может добавить extra instructions для категоризации (md-файл рядом с categories.md или в настройках плагина).
- [ ] **Публикация плагина** — подготовить для Obsidian Community Plugins: README, manifest, review process.

### Фаза 3 — Рост

- [ ] **Offline queue** — persistent queue неотправленных заметок, индикация «N заметок ожидают синхронизации».
