// 服务端入口:加载 env → 装配依赖(SDK/registry/agent/runtime)→ Express 监听。
// Electron 主进程 spawn 的也是本文件(见 electron/main.cjs),两种运行形态共用同一套代码。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { config as loadEnv } from "dotenv";
import { Mastra } from "@mastra/core";
import { MastraAgent } from "@ag-ui/mastra";
import { CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotExpressHandler } from "@copilotkit/runtime/v2/express";
import { buildDocAgent, DOC_AGENT_ID } from "./mastra.js";
import { DocRegistry, type SavedDoc } from "./registry.js";
import { SuperdocService } from "./superdoc.js";
import { preprocessDocument } from "./preprocess.js";
import { createApp } from "./app.js";

// 以自身文件目录定位 doc-chat/.env,不受启动目录影响
const here = path.dirname(fileURLToPath(import.meta.url));
// .env 放在 doc-chat 根(此处 here = server/src,../../ = doc-chat)。
loadEnv({ path: path.resolve(here, "../../.env") });
const PORT = Number(process.env.PORT ?? 8787);
const uploadsDir = process.env.UPLOADS_DIR ?? path.resolve(here, "../uploads");

if (!process.env.DEEPSEEK_API_KEY) {
  console.warn(
    "[doc-chat] 警告: 未设置 DEEPSEEK_API_KEY,LLM 调用会失败。请在 doc-chat/.env 配置。",
  );
}

// 全进程共享实例:registry 记住"最近上传",superdoc 持有 SDK 单例连接
const superdoc = new SuperdocService();
const registry = new DocRegistry(uploadsDir);

// Agent 依赖注入构建;API key 只留在服务端,不进前端 bundle
const { agent } = buildDocAgent({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  model: process.env.DEEPSEEK_MODEL,
  superdoc,
  registry,
});

// 挂到 Mastra 实例(解析 logger/storage 等运行时依赖),再包成 AG-UI AbstractAgent
const mastra = new Mastra({ agents: { [DOC_AGENT_ID]: agent } });
const aguiAgent = new MastraAgent({
  agent: mastra.getAgent(DOC_AGENT_ID),
  resourceId: "doc-chat-local-user",
});

// 本地单用户 Electron 场景:线程无需按调用者身份隔离(见 CopilotKit 启动提示)。
const runtime = new CopilotRuntime({
  agents: { [DOC_AGENT_ID]: aguiAgent },
  threads: { access: "open" },
});
const copilotHandler = createCopilotExpressHandler({
  runtime,
  basePath: "/api/copilotkit",
});

// 生产/Electron:同源托管已构建前端(DOC_CHAT_WEB_DIST 指向 web/dist)。
const webDist = process.env.DOC_CHAT_WEB_DIST
  ? path.resolve(process.env.DOC_CHAT_WEB_DIST)
  : undefined;

// 上传后预处理:blocks.list(includeText)+ 标题栈层级归类,持久化 uploads/<docId>.hierarchy.json
const preprocess = async (saved: SavedDoc): Promise<void> => {
  const { hierarchy } = await preprocessDocument(superdoc, saved.path);
  writeFileSync(
    path.join(uploadsDir, `${saved.docId}.hierarchy.json`),
    JSON.stringify(hierarchy, null, 2),
  );
};

// 组装 HTTP:POST /api/upload(带预处理)+ /api/copilotkit(SSE)+ 可选静态托管 SPA(同源)
const app = createApp({ registry, copilotHandler, webDist, preprocess });
const server = createServer(app);

// 日志里的 "on http" 行是 Electron 主进程的就绪信号(waitForServer)
server.listen(PORT, () => {
  console.log(`[doc-chat] server on http://localhost:${PORT}`);
  console.log(`[doc-chat] uploads: ${uploadsDir}`);
});

// 优雅退出:关 HTTP 服务 → 断 SuperDoc 宿主进程
async function shutdown() {
  server.close();
  await superdoc.dispose();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
