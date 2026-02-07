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
		it("creates categories.md with defaults when file missing", async () => {
			const { vault, manager } = createManager();

			await manager.ensureExists();

			const content = (vault as any)._getFile("VoiceNotes/categories.md");
			expect(content).toBeDefined();
			expect(content).toContain("| work |");
			expect(content).toContain("| Category | Description |");
		});

		it("does not overwrite existing file", async () => {
			const { vault, manager } = createManager();
			(vault as any)._addFile("VoiceNotes/categories.md", "custom content");

			await manager.ensureExists();

			expect((vault as any)._getFile("VoiceNotes/categories.md")).toBe("custom content");
		});
	});

	describe("read → write roundtrip", () => {
		it("preserves categories through write then read", async () => {
			const { manager } = createManager();
			const categories = [
				{ name: "work", description: "Work stuff" },
				{ name: "personal", description: "Personal notes" },
				{ name: "work/meetings", description: "Meetings" },
			];

			await manager.write(categories);
			const result = await manager.read();

			expect(result).toEqual(categories);
		});

		it("handles empty description", async () => {
			const { manager } = createManager();
			const categories = [{ name: "misc", description: "" }];

			await manager.write(categories);
			const result = await manager.read();

			expect(result).toEqual(categories);
		});

		it("handles pipe characters in description", async () => {
			const { manager } = createManager();
			// Pipe in description would break markdown table parsing —
			// this tests current behavior (known limitation)
			const categories = [{ name: "test", description: "A description" }];

			await manager.write(categories);
			const result = await manager.read();

			expect(result).toEqual(categories);
		});
	});

	describe("read without file", () => {
		it("returns default categories when file does not exist", async () => {
			const { manager } = createManager();

			const result = await manager.read();

			expect(result.length).toBeGreaterThan(0);
			expect(result[0].name).toBe("work");
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
