// Agent 定义层:组装 doc_analyzer = LLM(DeepSeek/vLLM)+ 工具 + 分步 instructions。
// 纯工厂函数、依赖注入:测试可传替身,Electron 复用同一份代码。
import path from "node:path";
import { Agent } from "@mastra/core/agent";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { DocRegistry } from "./registry.js";
import { SuperdocService } from "./superdoc.js";
import { makeDocTools } from "./tools.js";

export interface BuildDocAgentOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  superdoc?: SuperdocService;
  registry?: DocRegistry;
}

// 前后端共用的 agent id:决定 CopilotKit 路由 /api/copilotkit/agent/<id>/run
export const DOC_AGENT_ID = "doc_analyzer";

/**
 * 构建章节结构分析 Agent。
 * baseUrl/model/apiKey 全部走 env:默认 DeepSeek,改三行即切 vLLM(OpenAI 兼容);key 绝不进前端。
 */
export function buildDocAgent({
  apiKey,
  baseUrl = "https://api.deepseek.com/v1",
  model = "deepseek-chat",
  superdoc = new SuperdocService(),
  registry = new DocRegistry(
    process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads"),
  ),
}: BuildDocAgentOptions) {
  // OpenAI 兼容协议:同一份代码对接 DeepSeek 官方端点或本地 vLLM,供应商对代码透明
  const provider = createOpenAICompatible({
    name: "deepseek",
    baseURL: baseUrl,
    apiKey,
  });

  // 工具注入 Agent:模型可发起 tool_call,execute 在服务端进程内运行
  const tools = makeDocTools({ superdoc, registry });

  const agent = new Agent({
    id: DOC_AGENT_ID,
    name: "Doc Analyzer",
    description: "上传 docx 的章节结构分析 agent(docx chapter-structure analyzer)",
    model: provider(model),
    tools,
    // 分步作业说明书:每步先用一句话自述再执行,chat 窗口因此可见进度
    instructions: `你是文档结构分析助手。用户会上传 .docx 文档并给出 docId。
当收到"解析/分析章节结构"类请求时,严格按以下步骤执行,并且每步开始前先用一句话向用户说明本步要做什么:

第 1 步:调用 extractDocumentStructure 工具(不传参数即可,它会自动使用用户最近上传的文档),获取章节骨架 JSON。
第 2 步:分析章节结构:标题层级是否连续(有无跳级,如 H1 直接到 H3)、同级标题是否缺失编号或编号跳号、是否存在没有正文段落的空章节(paragraphCount 为 0)。
第 3 步:输出 markdown 分析报告,包含:① 目录树(标题层级缩进 + 每节段落数);② 发现的问题清单(逐条,注明所在章节);③ 一段总体结构评价。

追问文档内容时,若手头没有该文档的结构数据,先重新调用工具。所有回答用中文。`,
  });

  return { agent, agentId: DOC_AGENT_ID, tools, superdoc, registry };
}
