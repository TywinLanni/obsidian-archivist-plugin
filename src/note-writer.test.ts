import { describe, it, expect } from "vitest";
import { App, parseYaml } from "obsidian";
import { NoteWriter } from "./note-writer";
import type { NoteResponse } from "./types";

function createWriter(): { app: App; writer: NoteWriter } {
	const app = new App();
	const writer = new NoteWriter(app, "VoiceNotes");
	return { app, writer };
}

/** Default created_at → UTC timestamp suffix: _20260207_100000 */
const TS = "_20260207_100000";

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
	describe("write (new file)", () => {
		it("creates file with datetime-stamped path", async () => {
			const { writer } = createWriter();
			const note = makeNote();

			const path = await writer.write(note);

			expect(path).toBe(`VoiceNotes/work/Test Note${TS}.md`);
		});

		it("returns null for duplicate (dedup)", async () => {
			const { app, writer } = createWriter();
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

			expect(path).toBe(`VoiceNotes/work/meetings/Test Note${TS}.md`);
		});
	});

	describe("write (append)", () => {
		it("appends content to existing file when append_to is set", async () => {
			const { app, writer } = createWriter();
			// Create the target file first
			const note = makeNote();
			const targetPath = await writer.write(note);

			// Now write an append note
			const appendNote = makeNote({
				id: "append-uuid-456",
				name: "Addition",
				content: "Extra content appended.",
				append_to: targetPath,
				created_at: "2026-02-07T12:00:00Z",
			});

			const resultPath = await writer.write(appendNote);

			expect(resultPath).toBe(targetPath);
			const content = (app.vault as any)._getFile(targetPath) as string;
			expect(content).toContain("Extra content appended.");
			expect(content).toContain("---"); // separator
		});

		it("sets updated in frontmatter after append", async () => {
			const { app, writer } = createWriter();
			const note = makeNote();
			const targetPath = await writer.write(note);

			const appendNote = makeNote({
				id: "append-uuid-789",
				name: "Update",
				content: "Follow-up content.",
				append_to: targetPath,
				created_at: "2026-02-07T15:30:00Z",
			});
			await writer.write(appendNote);

			const content = (app.vault as any)._getFile(targetPath) as string;
			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			expect(fmMatch).not.toBeNull();
			const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
			expect(fm.updated).toBe("2026-02-07T15:30:00Z");
		});

		it("restores file from archive when append target is archived", async () => {
			const { app, writer } = createWriter();
			const originalPath = `VoiceNotes/work/Test Note${TS}.md`;
			const archivePath = `VoiceNotes/_archive/work/Test Note${TS}.md`;

			// Simulate: file was created then archived (exists only in _archive/)
			(app.vault as any)._addFile(archivePath, "---\ncategory: work\n---\n\nOriginal content.");

			const appendNote = makeNote({
				id: "append-uuid-restore",
				name: "Addition",
				content: "Content after restore.",
				append_to: originalPath,
				created_at: "2026-02-07T16:00:00Z",
			});

			const resultPath = await writer.write(appendNote);

			// Should restore to original path
			expect(resultPath).toBe(originalPath);
			// File should be at original path, not archive
			expect((app.vault as any)._getFile(originalPath)).toBeDefined();
			expect((app.vault as any)._getFile(archivePath)).toBeUndefined();
			// Content should be appended
			const content = (app.vault as any)._getFile(originalPath) as string;
			expect(content).toContain("Content after restore.");
		});

		it("falls back to new file when not found anywhere", async () => {
			const { writer } = createWriter();
			const note = makeNote({
				append_to: "VoiceNotes/work/nonexistent.md",
				created_at: "2026-02-07T14:00:00Z",
			});

			const path = await writer.write(note);

			// Not in archive either — create as new file
			expect(path).toBe("VoiceNotes/work/Test Note_20260207_140000.md");
		});
	});

	describe("markdown generation", () => {
		it("includes YAML frontmatter with correct fields", async () => {
			const { app, writer } = createWriter();
			const note = makeNote();

			await writer.write(note);
			const content = (app.vault as any)._getFile(`VoiceNotes/work/Test Note${TS}.md`) as string;

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
			const { app, writer } = createWriter();
			const note = makeNote({ synced_at: "2026-02-07T11:00:00Z" });

			await writer.write(note);
			const content = (app.vault as any)._getFile(`VoiceNotes/work/Test Note${TS}.md`) as string;

			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
			expect(fm.synced).toBe("2026-02-07T11:00:00Z");
		});

		it("omits synced when synced_at is null", async () => {
			const { app, writer } = createWriter();
			const note = makeNote({ synced_at: null });

			await writer.write(note);
			const content = (app.vault as any)._getFile(`VoiceNotes/work/Test Note${TS}.md`) as string;

			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
			expect(fm.synced).toBeUndefined();
		});

		it("includes hashtags in body", async () => {
			const { app, writer } = createWriter();
			const note = makeNote();

			await writer.write(note);
			const content = (app.vault as any)._getFile(`VoiceNotes/work/Test Note${TS}.md`) as string;

			expect(content).toContain("#meeting #planning");
		});

		it("includes note content in body", async () => {
			const { app, writer } = createWriter();
			const note = makeNote({ content: "Important meeting notes here." });

			await writer.write(note);
			const content = (app.vault as any)._getFile(`VoiceNotes/work/Test Note${TS}.md`) as string;

			expect(content).toContain("Important meeting notes here.");
		});

		it("handles special characters in summary (quotes, colons)", async () => {
			const { app, writer } = createWriter();
			const note = makeNote({
				summary: 'He said: "hello, world!" and left',
			});

			await writer.write(note);
			const content = (app.vault as any)._getFile(`VoiceNotes/work/Test Note${TS}.md`) as string;

			// Parse frontmatter — should not break YAML
			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			expect(fmMatch).not.toBeNull();
			const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
			expect(fm.summary).toBe('He said: "hello, world!" and left');
		});

		it("handles empty tags", async () => {
			const { app, writer } = createWriter();
			const note = makeNote({ tags: [] });

			await writer.write(note);
			const content = (app.vault as any)._getFile(`VoiceNotes/work/Test Note${TS}.md`) as string;

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

			expect(path).toBe(`VoiceNotes/work/file_with_bad_chars${TS}.md`);
		});

		it("collapses multiple spaces", async () => {
			const { writer } = createWriter();
			const note = makeNote({ name: "too   many   spaces" });

			const path = await writer.write(note);

			expect(path).toBe(`VoiceNotes/work/too many spaces${TS}.md`);
		});

		it("trims whitespace", async () => {
			const { writer } = createWriter();
			const note = makeNote({ name: "  padded name  " });

			const path = await writer.write(note);

			expect(path).toBe(`VoiceNotes/work/padded name${TS}.md`);
		});

		it("truncates to 100 characters", async () => {
			const { writer } = createWriter();
			const longName = "a".repeat(150);
			const note = makeNote({ name: longName });

			const path = await writer.write(note);

			// 100 chars + timestamp + ".md" suffix
			const fileName = path!.split("/").pop()!;
			expect(fileName).toBe("a".repeat(100) + `${TS}.md`);
		});
	});
});
