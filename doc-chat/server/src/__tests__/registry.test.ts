import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DocRegistry } from "../registry.js";

describe("DocRegistry", () => {
  let dir: string;
  let registry: DocRegistry;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "doc-chat-test-"));
    registry = new DocRegistry(dir);
  });

  it("saves the buffer under a new docId and resolves it back to the stored file", () => {
    const saved = registry.save(
      Buffer.from("fake docx bytes"),
      "abc.docx",
    );

    expect(saved.docId).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.name).toBe("abc.docx");
    expect(existsSync(saved.path)).toBe(true);
    expect(readFileSync(saved.path, "utf8")).toBe("fake docx bytes");
    expect(registry.pathFor(saved.docId)).toBe(saved.path);
  });

  it("returns null for an unknown docId", () => {
    expect(registry.pathFor("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("tracks the most recently saved doc as latest", () => {
    expect(registry.latest()).toBeNull();

    const a = registry.save(Buffer.from("a"), "a.docx");
    expect(registry.latest()?.docId).toBe(a.docId);

    const b = registry.save(Buffer.from("bb"), "b.docx");
    const latest = registry.latest();
    expect(latest?.docId).toBe(b.docId);
    expect(latest?.name).toBe("b.docx");
  });
});
