import { describe, expect, it, afterAll } from "vitest";
import path from "node:path";
import { SuperdocService } from "../superdoc.js";

// 默认用仓库里的 fixtures/sample.docx(含 Title/Heading1/Heading2);可用环境变量覆盖
const fixture =
  process.env.SUPERDOC_FIXTURE ??
  path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../../../../fixtures/sample.docx",
  );

const svc = new SuperdocService();

afterAll(async () => {
  await svc.dispose();
});

describe("SuperdocService.extractFromFile", () => {
  it(
    "returns a chapter skeleton with leveled headings from a real docx",
    { timeout: 120_000 },
    async () => {
      const result = await svc.extractFromFile(fixture);

      expect(result.chapters.length).toBeGreaterThanOrEqual(2);
      for (const chapter of result.chapters) {
        expect(typeof chapter.title).toBe("string");
        expect(chapter.title.length).toBeGreaterThan(0);
        expect(chapter.level).toBeGreaterThan(0);
        expect(Number.isInteger(chapter.paragraphCount)).toBe(true);
      }
      expect(result.totalBlocks).toBeGreaterThanOrEqual(result.chapters.length);
      expect(typeof result.revision).toBe("string");
    },
  );

  it("rejects a missing file with a clear error", async () => {
    await expect(svc.extractFromFile("/nonexistent/no.docx")).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("SuperdocService.listBlocks (doc.blocks.list)", () => {
  it(
    "returns heading blocks with level/ordinal when filtered by nodeTypes",
    { timeout: 120_000 },
    async () => {
      const result = await svc.listBlocks(fixture, { nodeTypes: ["heading"] });

      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.blocks.length).toBeGreaterThan(0);
      for (const block of result.blocks) {
        expect(block.nodeType).toBe("heading");
        expect(typeof block.nodeId).toBe("string");
        expect(Number.isInteger(block.ordinal)).toBe(true);
        if (block.headingLevel !== undefined) {
          expect(block.headingLevel).toBeGreaterThan(0);
        }
      }
      expect(typeof result.revision).toBe("string");
    },
  );

  it(
    "honors limit pagination while total reflects the full count",
    { timeout: 120_000 },
    async () => {
      const result = await svc.listBlocks(fixture, { limit: 1 });

      expect(result.blocks.length).toBeLessThanOrEqual(1);
      expect(result.total).toBeGreaterThanOrEqual(result.blocks.length);
    },
  );

  it(
    "returns full flattened text per block when includeText is true",
    { timeout: 120_000 },
    async () => {
      const result = await svc.listBlocks(fixture, { includeText: true });

      expect(result.total).toBeGreaterThan(0);
      // nodeType 必须落在文档化类型集合内(heading/paragraph/table/image/listItem/...)
      const knownTypes = new Set([
        "paragraph",
        "heading",
        "listItem",
        "table",
        "tableRow",
        "tableCell",
        "tableOfContents",
        "image",
        "sdt",
      ]);
      for (const block of result.blocks) {
        expect(knownTypes.has(block.nodeType)).toBe(true);
      }
      // includeText 开启后,含字内容的块应带完整 text(非仅预览)
      const withFullText = result.blocks.filter(
        (block) => typeof block.text === "string" && block.text.length > 0,
      );
      expect(withFullText.length).toBeGreaterThan(0);
    },
  );

  it("rejects a missing file with a clear error", async () => {
    await expect(svc.listBlocks("/nonexistent/no.docx")).rejects.toThrow(
      /not found/i,
    );
  });
});
