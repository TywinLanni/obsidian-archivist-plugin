import { describe, it, expect } from "vitest";
import { Vault, parseYaml } from "obsidian";
import { NoteWriter } from "./note-writer";
import type { NoteResponse } from "./types";

function createWriter(): { vault: Vault; writer: NoteWriter } {
	const vault = new Vault();
	const writer = new NoteWriter(vault, "VoiceNotes");
	return { vault, writer };
}

function makeNote(overrides: Partial<NoteResponse> = {}): NoteResponse {
	return {
		id: "test-uuid-123",
		name: "Test Note",
		content: "This is the note content.",
		category: "work",
		tags: ["meeting", "planning"],
		summary: "A test note about work",
		created_at: "2026-02-07T10:00:00Z",
		...overrides,
	};
}

describe("NoteWriter", () => {
	describe("write", () => {
		it("creates file with correct path", async () => {
			const { writer } = createWriter();
			const note = makeNote();

			const path = await writer.write(note);

			expect(path).toBe("VoiceNotes/work/Test Note.md");
		});

		it("returns null for duplicate (dedup)", async () => {
			const { vault, writer } = createWriter();
			const note = makeNote();

			// First write
			await writer.write(note);
			// Second write — same file exists
			const result = await writer.write(note);

			expect(result).toBeNull();
		});

		it("creates nested category folders", async () => {
			const { writer } = createWriter();
			const note = makeNote({ category: "work/meetings" });

			const path = await writer.write(note);

			expect(path).toBe("VoiceNotes/work/meetings/Test Note.md");
		});
	});

	describe("markdown generation", () => {
		it("includes YAML frontmatter with correct fields", async () => {
			const { vault, writer } = createWriter();
			const note = makeNote();

			await writer.write(note);
			const content = (vault as any)._getFile("VoiceNotes/work/Test Note.md") as string;

			// Extract frontmatter
			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			expect(fmMatch).not.toBeNull();

			const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
			expect(fm.category).toBe("work");
			expect(fm.tags).toEqual(["meeting", "planning"]);
			expect(fm.summary).toBe("A test note about work");
			expect(fm.source).toBe("telegram");
			expect(fm.created).toBe("2026-02-07T10:00:00Z");
		});

		it("includes synced_at when present", async () => {
			const { vault, writer } = createWriter();
			const note = makeNote({ synced_at: "2026-02-07T11:00:00Z" });

			await writer.write(note);
			const content = (vault as any)._getFile("VoiceNotes/work/Test Note.md") as string;

			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
			expect(fm.synced).toBe("2026-02-07T11:00:00Z");
		});

		it("omits synced when synced_at is null", async () => {
			const { vault, writer } = createWriter();
			const note = makeNote({ synced_at: null });

			await writer.write(note);
			const content = (vault as any)._getFile("VoiceNotes/work/Test Note.md") as string;

			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
			expect(fm.synced).toBeUndefined();
		});

		it("includes hashtags in body", async () => {
			const { vault, writer } = createWriter();
			const note = makeNote();

			await writer.write(note);
			const content = (vault as any)._getFile("VoiceNotes/work/Test Note.md") as string;

			expect(content).toContain("#meeting #planning");
		});

		it("includes note content in body", async () => {
			const { vault, writer } = createWriter();
			const note = makeNote({ content: "Important meeting notes here." });

			await writer.write(note);
			const content = (vault as any)._getFile("VoiceNotes/work/Test Note.md") as string;

			expect(content).toContain("Important meeting notes here.");
		});

		it("handles special characters in summary (quotes, colons)", async () => {
			const { vault, writer } = createWriter();
			const note = makeNote({
				summary: 'He said: "hello, world!" and left',
			});

			await writer.write(note);
			const content = (vault as any)._getFile("VoiceNotes/work/Test Note.md") as string;

			// Parse frontmatter — should not break YAML
			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			expect(fmMatch).not.toBeNull();
			const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
			expect(fm.summary).toBe('He said: "hello, world!" and left');
		});

		it("handles empty tags", async () => {
			const { vault, writer } = createWriter();
			const note = makeNote({ tags: [] });

			await writer.write(note);
			const content = (vault as any)._getFile("VoiceNotes/work/Test Note.md") as string;

			// Should not have hashtag line
			expect(content).not.toContain("#");
			// But should still have content
			expect(content).toContain("This is the note content.");
		});
	});

	describe("filename sanitization", () => {
		it("replaces illegal characters with underscore", async () => {
			const { writer } = createWriter();
			const note = makeNote({ name: 'file:with*bad"chars' });

			const path = await writer.write(note);

			expect(path).toBe("VoiceNotes/work/file_with_bad_chars.md");
		});

		it("collapses multiple spaces", async () => {
			const { writer } = createWriter();
			const note = makeNote({ name: "too   many   spaces" });

			const path = await writer.write(note);

			expect(path).toBe("VoiceNotes/work/too many spaces.md");
		});

		it("trims whitespace", async () => {
			const { writer } = createWriter();
			const note = makeNote({ name: "  padded name  " });

			const path = await writer.write(note);

			expect(path).toBe("VoiceNotes/work/padded name.md");
		});

		it("truncates to 100 characters", async () => {
			const { writer } = createWriter();
			const longName = "a".repeat(150);
			const note = makeNote({ name: longName });

			const path = await writer.write(note);

			// 100 chars + ".md" suffix
			const fileName = path!.split("/").pop()!;
			expect(fileName).toBe("a".repeat(100) + ".md");
		});
	});
});
