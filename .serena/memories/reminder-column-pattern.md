# Reminder Column Pattern - Complete Implementation

## Overview
The `reminder` column was added to the categories.md markdown table. This document captures the EXACT pattern used so it can be replicated for the `calendar` column.

## 1. Type Definition (src/types.ts)

```typescript
// CategoryItem: make `reminder` optional for backward compat with 2-column categories.md
export type CategoryItem = Omit<components["schemas"]["CategoryItem"], "reminder"> & {
	reminder?: components["schemas"]["CategoryItem"]["reminder"];
};
```

**Key points:**
- `reminder` is OPTIONAL (using `?`) for backward compatibility with old 2-column tables
- The actual type comes from OpenAPI generated types: `components["schemas"]["CategoryItem"]["reminder"]`
- In api-types.ts, the reminder type is: `"off" | "daily" | "weekly" | "monthly"`

## 2. CategoriesManager - Parsing (src/categories-manager.ts)

### VALID_REMINDERS constant:
```typescript
private static readonly VALID_REMINDERS = new Set(["off", "daily", "weekly", "monthly"]);
```

### parseMarkdown method (lines 114-145):
```typescript
private parseMarkdown(content: string): CategoryItem[] {
	const categories: CategoryItem[] = [];
	const lines = content.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();
		// Skip header and separator lines
		if (
			!trimmed.startsWith("|") ||
			trimmed.startsWith("| Category") ||
			trimmed.startsWith("|---")
		) {
			continue;
		}

		const parts = trimmed.split("|").map((p) => p.trim());
		// parts[0] is empty (before first |), parts[1] is name, parts[2] is description, parts[3] is reminder
		if (parts.length >= 3 && parts[1]) {
			const cat: CategoryItem = {
				name: parts[1],
				description: parts[2] || "",
			};
			// 3-column table: parse reminder if present and valid
			if (parts.length >= 4 && parts[3] && CategoriesManager.VALID_REMINDERS.has(parts[3])) {
				cat.reminder = parts[3] as CategoryItem["reminder"];
			}
			categories.push(cat);
		}
	}

	return categories;
}
```

**Key parsing logic:**
- Split line by `|` and trim each part
- parts[0] = empty, parts[1] = name, parts[2] = description, parts[3] = reminder
- Check `parts.length >= 4` to detect 3-column table
- Validate against VALID_REMINDERS set before assigning
- If invalid or missing, the field is simply not set (undefined)
- Backward compatible: 2-column tables work fine (reminder stays undefined)

## 3. CategoriesManager - Formatting (src/categories-manager.ts)

### formatAsMarkdown method (lines 150-162):
```typescript
private formatAsMarkdown(categories: CategoryItem[]): string {
	const lines = [
		"| Category | Description | Reminder |",
		"|----------|-------------|----------|",
	];

	for (const cat of categories) {
		const reminder = cat.reminder || "weekly";
		lines.push(`| ${cat.name} | ${cat.description} | ${reminder} |`);
	}

	return lines.join("\n") + "\n";
}
```

**Key formatting logic:**
- Header: `| Category | Description | Reminder |`
- Separator: `|----------|-------------|----------|`
- Default value: `cat.reminder || "weekly"` (if undefined, use "weekly")
- Each row: `| ${cat.name} | ${cat.description} | ${reminder} |`

## 4. API Types (src/api-types.ts)

From OpenAPI spec, CategoryItem schema:
```typescript
CategoryItem: {
    /** @description Category name (e.g., "work", "work/meetings") */
    name: string;
    /** @description Human-readable category description */
    description: string;
    /**
     * @description Digest reminder frequency for this category
     * @default weekly
     * @enum {string}
     */
    reminder: "off" | "daily" | "weekly" | "monthly";
};
```

## 5. API Client (src/api-client.ts)

### getCategories method:
```typescript
async getCategories(): Promise<CategoriesResponse> {
	return this.request<CategoriesResponse>({
		url: `${this.baseUrl}/v1/categories`,
	});
}
```

### updateCategories method:
```typescript
async updateCategories(categories: CategoryItem[]): Promise<CategoriesResponse> {
	return this.request<CategoriesResponse>({
		url: `${this.baseUrl}/v1/categories`,
		method: "PUT",
		body: JSON.stringify({ categories }),
	});
}
```

**Key points:**
- GET returns CategoriesResponse with `categories` array
- PUT sends `{ categories }` object
- Categories are serialized as-is (reminder field included if present)

## 6. Config Sync (src/config-sync.ts)

### pullFromServer (lines 141-162):
```typescript
async pullFromServer(): Promise<void> {
	try {
		// Fetch categories
		const categoriesResponse = await this.client.getCategories();
		await this.categoriesManager.write(categoriesResponse.categories);

		// Fetch tags
		const tagsResponse = await this.client.getTags();
		await this.tagsManager.write(tagsResponse.registry);

		this.setStatus("synced");
	} catch (e) {
		if (e instanceof RefreshTokenExpiredError) {
			new Notice("Auth token expired. Use /newtoken in Telegram to get a new one.");
			this.setStatus("error");
			return;
		}
		console.error("[ArchivistBot] Failed to pull config from server:", e);
		this.setStatus("offline");
		// Don't throw - files have defaults, plugin can work offline
	}
}
```

### pushToServer (lines 167-193):
```typescript
private async pushToServer(filePath: string): Promise<void> {
	try {
		const categoriesPath = this.categoriesManager.getFilePath();
		const tagsPath = this.tagsManager.getFilePath();

		if (filePath === categoriesPath) {
			const categories = await this.categoriesManager.read();
			await this.client.updateCategories(categories);
			new Notice("Categories synced to server");
		} else if (filePath === tagsPath) {
			const registry = await this.tagsManager.read();
			await this.client.updateTags(registry);
			new Notice("Tags synced to server");
		}

		this.setStatus("synced");
	} catch (e) {
		if (e instanceof RefreshTokenExpiredError) {
			new Notice("Auth token expired. Use /newtoken in Telegram to get a new one.");
			this.setStatus("error");
			return;
		}
		console.error("[ArchivistBot] Failed to push config to server:", e);
		this.setStatus("error");
		new Notice("Failed to sync config to server");
	}
}
```

**Key points:**
- Pull: API response → categoriesManager.write() → markdown file
- Push: categoriesManager.read() → API updateCategories() → server
- No special serialization needed - CategoryItem[] is passed directly

## 7. Tests (src/categories-manager.test.ts)

### Test: Parse 3-column table with reminder
```typescript
it("parses 3-column table with reminder values", async () => {
	const { vault, manager } = createManager();
	const content = [
		"| Category | Description | Reminder |",
		"|----------|-------------|----------|",
		"| work | Work stuff | daily |",
		"| personal | Personal notes | off |",
		"| ideas | Ideas | monthly |",
		"",
	].join("\n");
	(vault as any)._addFile("VoiceNotes/categories.md", content);

	const result = await manager.read();

	expect(result).toEqual([
		{ name: "work", description: "Work stuff", reminder: "daily" },
		{ name: "personal", description: "Personal notes", reminder: "off" },
		{ name: "ideas", description: "Ideas", reminder: "monthly" },
	]);
});
```

### Test: Format with reminder
```typescript
it("preserves categories with reminder through write then read", async () => {
	const { manager } = createManager();
	const categories = [
		{ name: "work", description: "Work stuff", reminder: "daily" as const },
		{ name: "personal", description: "Personal notes", reminder: "weekly" as const },
		{ name: "work/meetings", description: "Meetings", reminder: "off" as const },
	];

	await manager.write(categories);
	const result = await manager.read();

	expect(result).toEqual(categories);
});
```

### Test: Backward compatibility (2-column)
```typescript
it("parses 2-column table without reminder", async () => {
	const { vault, manager } = createManager();
	const content = [
		"| Category | Description |",
		"|----------|-------------|",
		"| work | Work stuff |",
		"| personal | Personal notes |",
		"",
	].join("\n");
	(vault as any)._addFile("VoiceNotes/categories.md", content);

	const result = await manager.read();

	expect(result).toEqual([
		{ name: "work", description: "Work stuff" },
		{ name: "personal", description: "Personal notes" },
	]);
	// No reminder field — undefined
	expect(result[0].reminder).toBeUndefined();
	expect(result[1].reminder).toBeUndefined();
});
```

### Test: Invalid values ignored
```typescript
it("ignores invalid reminder values", async () => {
	const { vault, manager } = createManager();
	const content = [
		"| Category | Description | Reminder |",
		"|----------|-------------|----------|",
		"| work | Work stuff | invalid |",
		"| personal | Personal notes | daily |",
		"",
	].join("\n");
	(vault as any)._addFile("VoiceNotes/categories.md", content);

	const result = await manager.read();

	expect(result[0].reminder).toBeUndefined();
	expect(result[1].reminder).toBe("daily");
});
```

## 8. Validation Notices

When `parseMarkdown()` encounters a non-empty value that is NOT in the valid set, it shows an Obsidian `Notice`:

```typescript
new Notice(`⚠️ Invalid reminder "${parts[3]}" for category "${parts[1]}" — ignored`);
new Notice(`⚠️ Invalid calendar "${parts[4]}" for category "${parts[1]}" — ignored`);
```

**Testing pattern:**
- Mock Notice in `__mocks__/obsidian.ts` has `static calls: string[]` that records all constructor messages
- In tests: `beforeEach(() => { Notice.calls = []; })` to reset
- Assert: `expect(Notice.calls).toHaveLength(N)` and `expect(Notice.calls[0]).toContain("...")`
- Empty values (whitespace-only cells) do NOT trigger Notice — only non-empty invalid values do

## Summary: Pattern for Adding New Column

To add a `calendar` column following the exact same pattern:

1. **Type**: Make it optional in CategoryItem type definition
2. **Parsing**: 
   - Add VALID_CALENDARS constant with allowed values
   - Check `parts.length >= 5` for 4-column table
   - Validate against VALID_CALENDARS before assigning
3. **Formatting**:
   - Update header to include Calendar column
   - Update separator line
   - Add `const calendar = cat.calendar || "default_value"`
   - Include in row template
4. **API**: No changes needed - CategoryItem[] is serialized as-is
5. **Tests**: Mirror the reminder tests for calendar column
