// 工具层:把 SuperDoc 解析能力包装成 Mastra tool,供 doc_analyzer agent 在推理中调用。
// LLM 侧只看到 id/description/inputSchema;execute 在服务端进程内运行。
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { DocRegistry } from "./registry.js";
import type { SuperdocService } from "./superdoc.js";

export interface DocToolsDeps {
  superdoc: SuperdocService; // SDK 抽取封装(进程内单例 client)
  registry: DocRegistry;     // docId → 磁盘路径 登记表
}

/** 创建文档工具集;依赖全部注入,方便测试传替身。 */
export function makeDocTools({ superdoc, registry }: DocToolsDeps) {
  const extractDocumentStructure = createTool({
    id: "extractDocumentStructure",
    // description/inputSchema 会进入模型的 tool schema,是驱动 LLM 正确调用的关键文案
    description:
      "提取已上传 docx 的章节骨架(标题层级、标题文本、各节段落数)。分析文档结构前必须先调用本工具。",
    inputSchema: z.object({
      // docId 可选:context 不进模型 prompt,模型无需知道 id,缺省时自动取最近上传
      docId: z
        .string()
        .optional()
        .describe(
          "要分析的文档 id;省略时自动使用最近一次上传的文档。",
        ),
    }),
    execute: async ({ docId }) => {
      // 1) 定位目标:显式 docId 优先,否则回退 registry.latest()(单用户"最近上传"语义)
      const target = docId ?? registry.latest()?.docId;
      if (!target) {
        // 尚未上传:抛错让模型转述给用户,而不是返回空骨架
        throw new Error(
          "No document uploaded yet — 请先上传 .docx 文档 (no doc to analyze)",
        );
      }
      // 2) docId → uploads/<uuid>.docx 真实路径(上传时已落盘)
      const filePath = registry.pathFor(target);
      if (!filePath) {
        throw new Error(`Unknown docId: ${target} (document not found)`);
      }
      // 3) 调 SuperDoc SDK 抽取章节骨架(见 superdoc.ts);返回对象即工具结果,回给模型
      const skeleton = await superdoc.extractFromFile(filePath);
      return { docId: target, ...skeleton };
    },
  });

  return { extractDocumentStructure };
}
