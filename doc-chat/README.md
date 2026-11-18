# doc-chat — SuperDoc 章节结构分析助手

上传 `.docx`,Mastra Agent 分步骤(extract 章节结构 → LLM 分析)处理,分析过程与结果实时显示在 CopilotKit chat 窗口。

- 前端:**Vue 3 + CopilotKit Vue**(`@copilotkit/vue` v2 `CopilotChat`)
- 后端:**Node + CopilotKit Runtime v2(SSE)** 桥接 **Mastra Agent**(经 `@ag-ui/mastra`)
- 文档解析:**`@superdoc/sdk`**(SuperDoc Node SDK,`doc.extract()`)
- LLM:**DeepSeek 官方 API**(OpenAI 兼容),可一行 env 切到本地 **vLLM**
- 分发:纯浏览器 dev,或 **Electron 桌面 app**

> 功能清单与边界、技术方案详解、未来开发计划(含 SuperDoc Agent SDK `createAgentToolkit` 接入路线)→ [功能与方案.md](功能与方案.md)

## 目录

```
doc-chat/
├─ server/   Express + CopilotKit runtime + Mastra agent + SuperDoc SDK
├─ web/      Vite + Vue3 + CopilotKit 前端
└─ electron/ Electron 壳(主进程 spawn 内嵌 server,同源加载前端)
```

## 环境准备

1. 复制环境变量并填入你的 key:

   ```bash
   cd doc-chat
   cp .env.example .env      # 编辑 DEEPSEEK_API_KEY
   ```

   切到本地 vLLM(OpenAI 兼容端点)只改这三行:

   ```
   DEEPSEEK_BASE_URL=http://localhost:8000/v1
   DEEPSEEK_MODEL=<vllm 提供的模型名>
   DEEPSEEK_API_KEY=<vllm 的 key,可留占位>
   ```

2. 安装依赖(需 Node ≥20):

   ```bash
   npm run setup             # = server + web 安装
   ```

## 运行

### A. 开发模式(两个进程,热更新)

```bash
npm run dev:server          # 终端 1: http://localhost:8787
npm run dev:web             # 终端 2: http://localhost:5173(代理 /api → 8787)
```

浏览器打开 :5173,点击"选择 .docx 上传"。上传后助手自动分步分析。

### B. 单进程生产模式(前端由 server 同源托管)

```bash
npm run build               # 构建 web/dist
npm start                   # 起 server 并托管 web/dist:访问 http://localhost:8787
```

### C. Electron 桌面 app

```bash
npm run build               # 先构建前端产物
npm run electron:install    # 安装 electron(首次)
npm run electron            # 启动桌面窗口(主进程 spawn 内嵌 server,复用同源服务)
```

打包分发:`cd electron && npx electron-builder --linux AppImage deb`(产物含各平台 SuperDoc 原生二进制)。

## 使用流程

1. 上传 `abc.docx` → `POST /api/upload` 落盘并登记 `docId`(自动记为"最近文档")。
2. 前端注入 agent 上下文并自动发消息触发分析。
3. Agent **第 1 步**调用 `extractDocumentStructure` 工具 → SuperDoc SDK 在 Node 侧 `open()+extract()` 返回章节骨架 JSON(标题层级/文本/各节段落数)。
4. Agent **第 2 步**分析结构问题(跳级、编号跳号、空章节)。
5. Agent **第 3 步**输出 markdown 分析报告(目录树 + 问题清单 + 总体评价),经 AG-UI/SSE 流式回 chat。
6. 上传后可继续用自然语言追问文档内容。

## 验证状态

已自动化/命令级验证:

- `npm run verify`:server 与 web 类型检查 + **18 个测试**(含真实调用 SuperDoc SDK 二进制抽取 fixture、上传端到端 HTTP、docId 自动选取、CopilotKit runtime `/info` agent 发现)。
- 运行时探针:server 启动、`/api/upload` 返回 docId、`/api/copilotkit/info`  advertise `doc_analyzer`(tools/streaming)、静态托管 SPA 回退——均 curl 通过。

需你本机验证(依赖真实凭证/显示环境,无法在此自动化):

- 用真实 `DEEPSEEK_API_KEY` 跑完整聊天往返;Electron 窗口渲染(需图形界面)。

## 关键设计说明

- SuperDoc Node SDK 会 spawn 平台原生二进制,**必须在 Node/Electron 主进程侧运行**,不能放浏览器。因此解析、工具执行、API key 全在服务端;前端只做 UI 与 SSE。
- CopilotKit 的 `useAgentContext` 注入的 context 经 `MastraAgent` 转发到工具的 `requestContext`(供工具读),不进入模型 prompt。故 `docId` 不由模型传参,而是工具默认取"最近一次上传"(`DocRegistry.latest()`),对单用户本地 app 最稳。
- SuperDocClient 为进程级单例、懒连接,进程退出时 `dispose()`(README/官方要求,避免每次调用付宿主启动开销)。
