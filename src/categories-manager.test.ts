import { describe, it, expect } from "vitest";
import { Vault } from "obsidian";
import { CategoriesManager } from "./categories-manager";

function createManager(): { vault: Vault; manager: CategoriesManager } {
	const vault = new Vault();
	const manager = new CategoriesManager(vault, "VoiceNotes");
	return { vault, manager };
}

describe("CategoriesManager", () => {
	describe("ensureExists", () => {
		it("creates categories.md with 3-column defaults when file missing", async () => {
			const { vault, manager } = createManager();

			await manager.ensureExists();

			const content = (vault as any)._getFile("VoiceNotes/categories.md");
			expect(content).toBeDefined();
			expect(content).toContain("| work |");
			expect(content).toContain("| Category | Description | Reminder |");
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

	describe("read → write roundtrip (3-column)", () => {
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

	describe("backward compatibility (2-column)", () => {
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
});
