import { describe, it, expect, beforeEach } from "vitest";
import { Vault, Notice } from "obsidian";
import { CategoriesManager } from "./categories-manager";

function createManager(): { vault: Vault; manager: CategoriesManager } {
	const vault = new Vault();
	const manager = new CategoriesManager(vault, "VoiceNotes");
	return { vault, manager };
}

describe("CategoriesManager", () => {
	describe("ensureExists", () => {
		it("creates categories.md with 4-column defaults when file missing", async () => {
			const { vault, manager } = createManager();

			await manager.ensureExists();

			const content = (vault as any)._getFile("VoiceNotes/categories.md");
			expect(content).toBeDefined();
			expect(content).toContain("| work |");
			expect(content).toContain("| Category | Description | Reminder | Calendar |");
			expect(content).toContain("| daily |");
			expect(content).toContain("| weekly |");
			expect(content).toContain("| monthly |");
		});

		it("does not overwrite existing file", async () => {
			const { vault, manager } = createManager();
			(vault as any)._addFile("VoiceNotes/categories.md", "custom content");

			await manager.ensureExists();

			expect((vault as any)._getFile("VoiceNotes/categories.md")).toBe("custom content");
		});
	});

	describe("read → write roundtrip (4-column)", () => {
		it("preserves categories with reminder and calendar through write then read", async () => {
			const { manager } = createManager();
			const categories = [
				{ name: "work", description: "Work stuff", reminder: "daily" as const, calendar: "google" },
				{ name: "personal", description: "Personal notes", reminder: "weekly" as const },
				{ name: "work/meetings", description: "Meetings", reminder: "off" as const, calendar: "google" },
			];

			await manager.write(categories);
			const result = await manager.read();

			expect(result).toEqual([
				{ name: "work", description: "Work stuff", reminder: "daily", calendar: "google" },
				{ name: "personal", description: "Personal notes", reminder: "weekly" },
				{ name: "work/meetings", description: "Meetings", reminder: "off", calendar: "google" },
			]);
		});

		it("defaults reminder to weekly when not specified", async () => {
			const { manager } = createManager();
			const categories = [
				{ name: "work", description: "Work stuff" },
				{ name: "personal", description: "Personal notes" },
			];

			await manager.write(categories);
			const result = await manager.read();

			// formatAsMarkdown defaults missing reminder to "weekly"
			expect(result).toEqual([
				{ name: "work", description: "Work stuff", reminder: "weekly" },
				{ name: "personal", description: "Personal notes", reminder: "weekly" },
			]);
		});

		it("handles empty description with reminder", async () => {
			const { manager } = createManager();
			const categories = [{ name: "misc", description: "", reminder: "monthly" as const }];

			await manager.write(categories);
			const result = await manager.read();

			expect(result).toEqual(categories);
		});

		it("handles pipe characters in description", async () => {
			const { manager } = createManager();
			const categories = [{ name: "test", description: "A description", reminder: "daily" as const }];

			await manager.write(categories);
			const result = await manager.read();

			expect(result).toEqual(categories);
		});
	});

	describe("backward compatibility (2 and 3 column)", () => {
		it("parses 2-column table without reminder or calendar", async () => {
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
			expect(result[0].reminder).toBeUndefined();
			expect(result[0].calendar).toBeUndefined();
		});

		it("parses 3-column table with reminder values (no calendar)", async () => {
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
			expect(result[0].calendar).toBeUndefined();
		});

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
	});

	describe("calendar column", () => {
		it("parses 4-column table with calendar values", async () => {
			const { vault, manager } = createManager();
			const content = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | daily | google |",
				"| personal | Personal notes | weekly |  |",
				"| ideas | Ideas | monthly | google |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			const result = await manager.read();

			expect(result).toEqual([
				{ name: "work", description: "Work stuff", reminder: "daily", calendar: "google" },
				{ name: "personal", description: "Personal notes", reminder: "weekly" },
				{ name: "ideas", description: "Ideas", reminder: "monthly", calendar: "google" },
			]);
		});

		it("ignores invalid calendar values", async () => {
			const { vault, manager } = createManager();
			const content = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | daily | outlook |",
				"| personal | Personal notes | weekly | google |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			const result = await manager.read();

			expect(result[0].calendar).toBeUndefined();
			expect(result[1].calendar).toBe("google");
		});

		it("preserves calendar through write → read roundtrip", async () => {
			const { manager } = createManager();
			const categories = [
				{ name: "work", description: "Work stuff", reminder: "daily" as const, calendar: "google" },
				{ name: "personal", description: "Personal notes", reminder: "weekly" as const },
			];

			await manager.write(categories);
			const result = await manager.read();

			expect(result[0].calendar).toBe("google");
			expect(result[1].calendar).toBeUndefined();
		});

		it("formats empty calendar as blank cell", async () => {
			const { manager } = createManager();
			const categories = [
				{ name: "work", description: "Work", reminder: "daily" as const },
			];

			await manager.write(categories);
			const result = await manager.read();

			expect(result[0].calendar).toBeUndefined();
		});

		it("handles null calendar from API", async () => {
			const { manager } = createManager();
			const categories = [
				{ name: "work", description: "Work", reminder: "daily" as const, calendar: null },
			];

			await manager.write(categories);
			const result = await manager.read();

			// null → "" in markdown → undefined on parse
			expect(result[0].calendar).toBeUndefined();
		});
	});

	describe("read without file", () => {
		it("returns default categories when file does not exist", async () => {
			const { manager } = createManager();

			const result = await manager.read();

			expect(result.length).toBeGreaterThan(0);
			expect(result[0].name).toBe("work");
			expect(result[0].reminder).toBe("daily");
		});
	});

	describe("setBasePath", () => {
		it("updates file path", () => {
			const { manager } = createManager();

			manager.setBasePath("NewPath");

			expect(manager.getFilePath()).toBe("NewPath/categories.md");
		});
	});

	describe("invalid value notices", () => {
		beforeEach(() => {
			Notice.calls = [];
		});

		it("shows notice for invalid reminder value", async () => {
			const { vault, manager } = createManager();
			const content = [
				"| Category | Description | Reminder |",
				"|----------|-------------|----------|",
				"| work | Work stuff | banana |",
				"| personal | Personal notes | daily |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			await manager.read();

			expect(Notice.calls).toHaveLength(1);
			expect(Notice.calls[0]).toContain("Invalid reminder");
			expect(Notice.calls[0]).toContain("banana");
			expect(Notice.calls[0]).toContain("work");
		});

		it("shows notice for invalid calendar value", async () => {
			const { vault, manager } = createManager();
			const content = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | daily | outlook |",
				"| personal | Personal notes | weekly | google |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			await manager.read();

			expect(Notice.calls).toHaveLength(1);
			expect(Notice.calls[0]).toContain("Invalid calendar");
			expect(Notice.calls[0]).toContain("outlook");
			expect(Notice.calls[0]).toContain("work");
		});

		it("shows notices for both invalid reminder and calendar", async () => {
			const { vault, manager } = createManager();
			const content = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | banana | outlook |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			await manager.read();

			expect(Notice.calls).toHaveLength(2);
			expect(Notice.calls[0]).toContain("Invalid reminder");
			expect(Notice.calls[1]).toContain("Invalid calendar");
		});

		it("does not show notice for valid values", async () => {
			const { vault, manager } = createManager();
			const content = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff | daily | google |",
				"| personal | Personal notes | weekly |  |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			await manager.read();

			expect(Notice.calls).toHaveLength(0);
		});

		it("does not show notice for empty values", async () => {
			const { vault, manager } = createManager();
			const content = [
				"| Category | Description | Reminder | Calendar |",
				"|----------|-------------|----------|----------|",
				"| work | Work stuff |  |  |",
				"",
			].join("\n");
			(vault as any)._addFile("VoiceNotes/categories.md", content);

			await manager.read();

			expect(Notice.calls).toHaveLength(0);
		});
	});
});
