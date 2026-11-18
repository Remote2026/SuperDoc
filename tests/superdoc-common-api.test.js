// SuperDoc Document API 常见接口冒烟测试(基于 docs.superdoc.dev 的
// "查询 → 定位 → 变更 → 回执"心智模型,使用 @superdoc/sdk 无头运行)。
//
// 注意:按官方文档建议,断言以操作返回的 receipt / 结果对象为准,
// 而不是靠文件是否存在、界面刷新等副作用来证明成功。
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SuperDocClient } from "@superdoc/sdk";

const FIXTURE = "./fixtures/sample.docx";
const SAVE_OUT = "./fixtures/out/sample.saved.docx";

/** @type {import("@superdoc/sdk").SuperDocClient} */
let client;
/** @type {import("@superdoc/sdk").SuperDocDocument} */
let doc;

beforeAll(async () => {
  rmSync("./fixtures/out", { recursive: true, force: true });
  mkdirSync("./fixtures/out", { recursive: true });

  client = new SuperDocClient({ user: { name: "CI Bot", email: "ci@example.com" } });
  await client.connect();
  doc = await client.open({ doc: FIXTURE });
}, 180_000);

afterAll(async () => {
  if (doc) await doc.close({ discard: true });
  if (client) await client.dispose();
}, 120_000);

describe("SuperDoc 常见 API(打开 → 查询 → 读取 → 修订 → 保存)", () => {
  it("open 后 info() 能取到文档元信息与修订号", async () => {
    const current = await doc.info({});
    expect(current).toBeTruthy();
  });

  it("query.match 能按文本模式找到全部 'termination' 命中,并带回 target", async () => {
    const result = await doc.query.match({
      select: { type: "text", pattern: "termination" },
      require: "all",
    });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.evaluatedRevision).toBeTruthy();

    for (const item of result.items) {
      expect(item.matchKind).toBe("text");
      expect(item.target).toBeTruthy();
      expect(item.snippet.toLowerCase()).toContain("termination");
    }
  });

  it("require:'exactlyOne' 在命中数不符时按契约报错", async () => {
    await expect(
      doc.query.match({
        select: { type: "text", pattern: "termination" },
        require: "exactlyOne",
      }),
    ).rejects.toBeTruthy();
  });

  it("getMarkdown / projectMarkdown 能读出正文内容", async () => {
    const markdown = await doc.getMarkdown({});
    expect(markdown).toContain("Sample Agreement");
    expect(markdown.toLowerCase()).toContain("termination");
    expect(markdown.toLowerCase()).toContain("confidential");

    const projection = await doc.projectMarkdown({ reviewMode: "final" });
    expect(projection.evaluatedRevision).toBeTruthy();
  });

  it("getNode 能按命中项 address 读回所在块", async () => {
    const result = await doc.query.match({
      select: { type: "text", pattern: "termination" },
      require: "first",
    });
    const item = result.items[0];
    expect(item.address).toBeTruthy();

    expect(item.address).toMatchObject({ kind: "block", nodeType: "paragraph" });

    const node = await doc.getNode({ address: item.address });
    expect(node.node).toBeTruthy();
    expect(node.node.kind).toBe("paragraph");
  });

  it("replace(changeMode:'tracked') 用查询得到的 target 生成回执", async () => {
    const result = await doc.query.match({
      select: { type: "text", pattern: "termination" },
      require: "first",
    });

    const receipt = await doc.replace({
      target: result.items[0].target,
      text: "cancellation",
      changeMode: "tracked",
    });
    expect(receipt?.success).not.toBe(false);
  });

  it("trackChanges.list 能看到挂起修订,decide 接受后正文生效", async () => {
    const list = await doc.trackChanges.list({});
    expect(list).toBeTruthy();

    const receipt = await doc.trackChanges.decide({
      decision: "accept",
      target: { kind: "all" },
    });
    expect(receipt?.success).not.toBe(false);

    // 前面只替换了第一个 termination(require:'first'),
    // 所以接受修订后应恰好剩下一处 termination。
    const markdown = await doc.getMarkdown({});
    expect(markdown.toLowerCase()).toContain("cancellation");
    expect(markdown.toLowerCase().match(/termination/g)).toHaveLength(1);
  });

  it("sections.list 能列出文档的节(页面设置)结构", async () => {
    const sections = await doc.sections.list({});
    expect(sections).toBeTruthy();
  });

  it("save 到独立路径并返回成功回执,磁盘文件随之存在", async () => {
    const receipt = await doc.save({ out: SAVE_OUT, force: true });
    expect(receipt?.success).not.toBe(false);
    expect(existsSync(SAVE_OUT)).toBe(true);
  });
});
