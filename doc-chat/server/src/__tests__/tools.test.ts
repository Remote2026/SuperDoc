import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DocRegistry } from "../registry.js";
import { SuperdocService } from "../superdoc.js";
import { makeDocTools } from "../tools.js";

const fixture = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../../fixtures/sample.docx",
);

describe("extractDocumentStructure tool", () => {
  it("returns the chapter skeleton for a registered docId", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-chat-tools-"));
    const registry = new DocRegistry(dir);
    const saved = registry.save(readFileSync(fixture), "abc.docx");

    const svc = new SuperdocService();
    try {
      const tools = makeDocTools({ superdoc: svc, registry });
      const run = tools.extractDocumentStructure.execute;
      if (!run) throw new Error("tool has no execute");

      const result = (await run(
        { docId: saved.docId },
        {} as never,
      )) as { docId: string; chapters: Array<{ title: string; level: number }> };

      expect(result.docId).toBe(saved.docId);
      expect(result.chapters.length).toBeGreaterThanOrEqual(2);
      expect(result.chapters[0].title.length).toBeGreaterThan(0);
    } finally {
      await svc.dispose();
    }
  });

  it("throws for an unknown docId", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-chat-tools-"));
    const registry = new DocRegistry(dir);
    const tools = makeDocTools({ superdoc: new SuperdocService(), registry });
    const run = tools.extractDocumentStructure.execute;
    if (!run) throw new Error("tool has no execute");

    await expect(
      run({ docId: "00000000-0000-4000-8000-000000000000" }, {} as never),
    ).rejects.toThrow(/unknown|not found/i);
  });

  it("defaults to the most recently uploaded doc when docId is omitted", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-chat-tools-"));
    const registry = new DocRegistry(dir);
    const saved = registry.save(readFileSync(fixture), "abc.docx");

    const svc = new SuperdocService();
    try {
      const tools = makeDocTools({ superdoc: svc, registry });
      const run = tools.extractDocumentStructure.execute;
      if (!run) throw new Error("tool has no execute");

      const result = (await run({}, {} as never)) as { docId: string };
      expect(result.docId).toBe(saved.docId);
    } finally {
      await svc.dispose();
    }
  });

  it("throws when no doc has been uploaded and none was specified", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-chat-tools-"));
    const registry = new DocRegistry(dir);
    const tools = makeDocTools({ superdoc: new SuperdocService(), registry });
    const run = tools.extractDocumentStructure.execute;
    if (!run) throw new Error("tool has no execute");

    await expect(run({}, {} as never)).rejects.toThrow(/upload|未上传|no doc/i);
  });
});
