import express, { type Express } from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import type { DocRegistry, SavedDoc } from "./registry.js";
import { validateDocx } from "./upload.js";

export interface CreateAppDeps {
  registry: DocRegistry;
  /** CopilotKit 的 Express 处理器(express Router/middleware)。 */
  copilotHandler: express.RequestHandler;
  /**
   * 打包/Electron 模式下前端 `vite build` 产物目录(含 index.html)。
   * 提供后由同一进程同源托管静态资源,免掉独立 Vite server。
   */
  webDist?: string;
  /**
   * 上传成功后的预处理钩子(blocks.list + 标题栈层级归类,见 preprocess.ts)。
   * 钩子抛错只告警、不影响上传响应——分析可降级,上传不背锅。
   */
  preprocess?: (saved: SavedDoc) => Promise<void>;
}

/**
 * 构建 HTTP app:上传路由 + CopilotKit runtime 处理器。
 * 不含进程级副作用(监听、dispose),便于用 listen(0) 做端到端测试。
 */
export function createApp({
  registry,
  copilotHandler,
  webDist,
  preprocess,
}: CreateAppDeps): Express {
  const app = express();
  // multipart 解析:先进内存 buffer(再由 registry 落盘),限制单文件 50MB
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // 上传链路: multer 收文件 → 校验扩展名 → registry.save 落盘并登记 → 返回 docId
  app.post(
    "/api/upload",
    upload.single("file"),
    async (req: Request, res: Response) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "缺少文件字段 file" });
        return;
      }
      const validation = validateDocx(file.originalname);
      if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const saved = registry.save(file.buffer, file.originalname);

      // 上传即预处理:后续分析可直接读层级结果,不必再开档
      if (preprocess) {
        try {
          await preprocess(saved);
        } catch (e) {
          console.warn(
            "[doc-chat] 预处理失败(不影响上传):",
            e instanceof Error ? e.message : e,
          );
        }
      }

      res.json({ docId: saved.docId, name: saved.name });
    },
  );

  // CopilotKit runtime 路由:/api/copilotkit/info、/agent/<id>/run(SSE)等
  app.use(copilotHandler);

  if (webDist && existsSync(webDist)) {
    app.use(express.static(webDist));
    // SPA 回退:非 /api 的 GET 一律回 index.html
    app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  return app;
}
