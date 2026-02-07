import { describe, it, expect } from "vitest";
import { Vault } from "obsidian";
import { TagsManager } from "./tags-manager";
import type { TagsRegistry } from "./types";

function createManager(): { vault: Vault; manager: TagsManager } {
	const vault = new Vault();
	const manager = new TagsManager(vault, "VoiceNotes");
	return { vault, manager };
}

describe("TagsManager", () => {
	describe("ensureExists", () => {
		it("creates tags_registry.md when file missing", async () => {
			const { vault, manager } = createManager();

			await manager.ensureExists();

			const content = (vault as any)._getFile("VoiceNotes/tags_registry.md");
			expect(content).toBeDefined();
			expect(content).toContain("---");
			expect(content).toContain("# Tags registry");
		});
	});

	describe("write → read roundtrip", () => {
		it("preserves registry through write then read", async () => {
			const { manager } = createManager();
			const registry: TagsRegistry = {
				work: { meeting: 12, planning: 5 },
				personal: { health: 3 },
			};

			await manager.write(registry);
			const result = await manager.read();

			expect(result).toEqual(registry);
		});

		it("handles empty registry", async () => {
			const { manager } = createManager();

			await manager.write({});
			const result = await manager.read();

			expect(result).toEqual({});
		});

		it("handles category with empty tags", async () => {
			const { manager } = createManager();
			const registry: TagsRegistry = {
				work: {},
				personal: { health: 1 },
			};

			await manager.write(registry);
			const result = await manager.read();

			expect(result.work).toEqual({});
			expect(result.personal).toEqual({ health: 1 });
		});

		it("sorts categories alphabetically", async () => {
			const { vault, manager } = createManager();
			const registry: TagsRegistry = {
				zebra: { z: 1 },
				alpha: { a: 2 },
			};

			await manager.write(registry);
			const content = (vault as any)._getFile("VoiceNotes/tags_registry.md") as string;

			const alphaIdx = content.indexOf("alpha:");
			const zebraIdx = content.indexOf("zebra:");
			expect(alphaIdx).toBeLessThan(zebraIdx);
		});

		it("sorts tags by count descending", async () => {
			const { vault, manager } = createManager();
			const registry: TagsRegistry = {
				work: { low: 1, high: 99, mid: 10 },
			};

			await manager.write(registry);
			const content = (vault as any)._getFile("VoiceNotes/tags_registry.md") as string;

			const highIdx = content.indexOf("high:");
			const midIdx = content.indexOf("mid:");
			const lowIdx = content.indexOf("low:");
			expect(highIdx).toBeLessThan(midIdx);
			expect(midIdx).toBeLessThan(lowIdx);
		});

		it("handles special characters in tag names", async () => {
			const { manager } = createManager();
			const registry: TagsRegistry = {
				work: { "c++": 5, "c#": 3, "node.js": 1 },
			};

			await manager.write(registry);
			const result = await manager.read();

			expect(result.work["c++"]).toBe(5);
			expect(result.work["c#"]).toBe(3);
			expect(result.work["node.js"]).toBe(1);
		});
	});

	describe("read without file", () => {
		it("returns empty registry when file does not exist", async () => {
			const { manager } = createManager();

			const result = await manager.read();

			expect(result).toEqual({});
		});
	});
});
