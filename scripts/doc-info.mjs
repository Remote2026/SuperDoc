// 打印 docx 文档信息:node scripts/doc-info.mjs [路径/文件.docx]
// 默认读取 fixtures/sample.docx
import { SuperDocClient } from "@superdoc/sdk";

const path = process.argv[2] ?? "./fixtures/sample.docx";

const client = new SuperDocClient();
await client.connect();

try {
  const doc = await client.open({ doc: path });
  try {
    const info = await doc.info({});
    console.log("=== doc.info() ===");
    console.log(JSON.stringify(info, null, 2));

    const sections = await doc.sections.list({});
    console.log("\n=== doc.sections.list() ===");
    console.log(JSON.stringify(sections, null, 2));

    const markdown = await doc.getMarkdown({});
    console.log("\n=== doc.getMarkdown() ===");
    console.log(markdown);

    const blocks = await doc.blocks.list({});
    console.log("\n=== doc.blocks.list() ===");
    console.log(JSON.stringify(blocks, null, 2));

    const extract = await doc.extract();
    console.log("\n=== doc.extract() ===");
    console.log(JSON.stringify(extract, null, 2));

  } finally {
    await doc.close({ discard: true });
  }
} finally {
  await client.dispose();
}
