import { describe, expect, it, afterAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { groupBlocks, preprocessDocument, type HierarchyBlock } from "../preprocess.js";
import { SuperdocService } from "../superdoc.js";

// ---------- 纯算法单元测试:标题栈 ----------

const h = (nodeId: string, level: number, text: string): HierarchyBlock => ({
  nodeId,
  nodeType: "heading",
  headingLevel: level,
  text,
});
const p = (nodeId: string, text = "body"): HierarchyBlock => ({
  nodeId,
  nodeType: "paragraph",
  text,
});

describe("groupBlocks (heading-stack algorithm)", () => {
  it("nests H2 under the nearest H1 and H3 under the nearest H2", () => {
    const root = groupBlocks([h("1", 1, "Ch1"), h("2", 2, "S1"), h("3", 3, "SS1")]);

    expect(root.children.length).toBe(1);
    const ch1 = root.children[0]!;
    expect(ch1.title).toBe("Ch1");
    expect(ch1.level).toBe(1);
    expect(ch1.headingNodeId).toBe("1");
    expect(ch1.groupId).toBe("G0001");

    const s1 = ch1.children[0]!;
    expect([s1.title, s1.level]).toEqual(["S1", 2]);

    const ss1 = s1.children[0]!;
    expect([ss1.title, ss1.level, ss1.groupId]).toEqual(["SS1", 3, "G0003"]);
  });

  it("closes previous same-level groups: the second H2 is a sibling, not a child", () => {
    const root = groupBlocks([h("1", 1, "Ch1"), h("2", 2, "S1"), h("3", 2, "S2")]);

    const ch1 = root.children[0]!;
    expect(ch1.children.map((g) => g.title)).toEqual(["S1", "S2"]);
  });

  it("a higher-level heading pops all deeper groups before attaching", () => {
    const root = groupBlocks([
      h("1", 1, "Ch1"),
      h("2", 2, "S1"),
      h("3", 3, "SS"),
      h("4", 1, "Ch2"),
    ]);

    expect(root.children.map((g) => g.title)).toEqual(["Ch1", "Ch2"]);
  });

  it("non-heading blocks join the innermost open group, heading block leads its own list, order/nodeId preserved", () => {
    const table: HierarchyBlock = { nodeId: "9", nodeType: "table", text: "" };
    const root = groupBlocks([p("a"), h("1", 1, "Ch1"), p("b"), table, h("2", 2, "S1"), p("c")]);

    // 首个标题之前的内容归 root
    expect(root.blocks.map((b) => b.nodeId)).toEqual(["a"]);
    // 标题块自身是组内第一个块,随后是直属正文/表格
    const ch1 = root.children[0]!;
    expect(ch1.blocks.map((b) => b.nodeId)).toEqual(["1", "b", "9"]);
    const s1 = ch1.children[0]!;
    expect(s1.blocks.map((b) => b.nodeId)).toEqual(["2", "c"]);
  });

  it("level jump H1→H3 attaches the H3 under the H1", () => {
    const root = groupBlocks([h("1", 1, "Ch1"), h("2", 3, "Deep")]);

    const ch1 = root.children[0]!;
    expect(ch1.children.length).toBe(1);
    expect(ch1.children[0]!.level).toBe(3);
  });

  it("heading without headingLevel defaults to level 1", () => {
    const root = groupBlocks([{ nodeId: "1", nodeType: "heading", text: "T" }]);

    expect(root.children[0]!.level).toBe(1);
  });

  it("empty document returns bare root", () => {
    const root = groupBlocks([]);

    expect(root.blocks).toEqual([]);
    expect(root.children).toEqual([]);
  });
});

// ---------- 真实 fixture 集成:preprocessDocument + 数据落 out 目录 ----------

const here = path.dirname(new URL(import.meta.url).pathname);
const fixturesDir = path.resolve(here, "../../../../fixtures");
const outDir = path.join(fixturesDir, "out"); // 与 fixtures/out 中既有产物对比

const svc = new SuperdocService();
afterAll(async () => {
  await svc.dispose();
});

function dump(name: string, result: Awaited<ReturnType<typeof preprocessDocument>>) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `${name}.blocks.json`), JSON.stringify(result.blocks, null, 2));
  writeFileSync(
    path.join(outDir, `${name}.hierarchy.json`),
    JSON.stringify(result.hierarchy, null, 2),
  );
}

describe("preprocessDocument on real fixtures (writes fixtures/out)", () => {
  it(
    "sample.docx: 4 H1 chapters, Title paragraph stays in root, tables nested in groups",
    { timeout: 120_000 },
    async () => {
      const result = await preprocessDocument(svc, path.join(fixturesDir, "sample.docx"));

      expect(result.total).toBe(21);
      // 探测确认:"Sample Agreement" 是 Title 样式段落(非 heading)→ 归 root
      expect(result.hierarchy.blocks.some((b) => b.styleId === "Title")).toBe(true);
      // H1×4 → 4 个 Chapter;H2×3 挂在其下
      expect(result.hierarchy.children.length).toBe(4);
      const nested = result.hierarchy.children.filter((g) => g.children.length > 0);
      expect(nested.length).toBeGreaterThan(0);
      // 表格块应落在某个组里:结构化统计(探测确认 sample.docx 有 2 个表)
      const countTables = (g: typeof result.hierarchy): number =>
        g.blocks.filter((b) => b.nodeType === "table").length +
        g.children.reduce((n, child) => n + countTables(child), 0);
      expect(countTables(result.hierarchy)).toBe(2);

      dump("sample", result);
    },
  );

  it(
    "sample2.docx: no Word heading styles at all → flat hierarchy (honest output)",
    { timeout: 120_000 },
    async () => {
      const result = await preprocessDocument(svc, path.join(fixturesDir, "sample2.docx"));

      expect(result.total).toBe(320);
      expect(result.hierarchy.children).toEqual([]);
      expect(result.hierarchy.blocks.length).toBe(result.total);

      dump("sample2", result);
    },
  );
});
