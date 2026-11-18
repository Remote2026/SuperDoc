import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../app.js";
import { DocRegistry, type SavedDoc } from "../registry.js";

let server: Server;
let baseUrl: string;
let dir: string;
let registry: DocRegistry;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "doc-chat-e2e-"));
  registry = new DocRegistry(dir);
  const noopHandler = (_req: any, res: any) => {
    res.statusCode = 501;
    res.end("copilot not mounted in test");
  };
  const app = createApp({ registry, copilotHandler: noopHandler });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

function docxForm(filename: string, bytes = new Uint8Array([0x50, 0x4b])) {
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  return form;
}

describe("POST /api/upload", () => {
  it("accepts a .docx upload and returns its docId", async () => {
    const response = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      body: docxForm("abc.docx"),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { docId: string; name: string };
    expect(body.name).toBe("abc.docx");
    expect(registry.pathFor(body.docId)).not.toBeNull();
    expect(existsSync(registry.pathFor(body.docId)!)).toBe(true);
  });

  it("rejects a .txt upload with 400", async () => {
    const response = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      body: docxForm("notes.txt"),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/docx/i);
  });

  it("rejects a request without a file with 400", async () => {
    const response = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      body: new FormData(),
    });

    expect(response.status).toBe(400);
  });
});

describe("post-upload preprocess hook", () => {
  async function serveWith(opts: {
    preprocess?: (saved: SavedDoc) => Promise<void>;
  }): Promise<{ url: string; close: () => void }> {
    const reg = new DocRegistry(mkdtempSync(path.join(tmpdir(), "doc-chat-pre-")));
    const noop = (_req: any, res: any) => {
      res.statusCode = 501;
      res.end("copilot stub");
    };
    const app = createApp({ registry: reg, copilotHandler: noop, preprocess: opts.preprocess });
    const srv = createServer(app);
    await new Promise<void>((resolve) => srv.listen(0, resolve));
    const addr = srv.address();
    if (addr === null || typeof addr === "string") throw new Error("no port");
    return { url: `http://127.0.0.1:${addr.port}`, close: () => srv.close() };
  }

  it("receives the saved doc after a successful upload", async () => {
    const calls: SavedDoc[] = [];
    const { url, close } = await serveWith({
      preprocess: async (saved) => {
        calls.push(saved);
      },
    });

    try {
      const response = await fetch(`${url}/api/upload`, {
        method: "POST",
        body: docxForm("a.docx"),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { docId: string };

      expect(calls.length).toBe(1);
      expect(calls[0]!.docId).toBe(body.docId);
      expect(existsSync(calls[0]!.path)).toBe(true); // 预处理拿到的是已落盘文件
    } finally {
      close();
    }
  });

  it("upload still returns 200 when preprocessing fails", async () => {
    const { url, close } = await serveWith({
      preprocess: async () => {
        throw new Error("boom");
      },
    });

    try {
      const response = await fetch(`${url}/api/upload`, {
        method: "POST",
        body: docxForm("b.docx"),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { docId: string };
      expect(body.docId).toBeTruthy();
    } finally {
      close();
    }
  });
});

describe("static web hosting mode", () => {
  it("serves index.html for non-api GETs but leaves /api to its routes", async () => {
    const dist = mkdtempSync(path.join(tmpdir(), "doc-chat-dist-"));
    writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>doc-chat</title>");

    const reg = new DocRegistry(mkdtempSync(path.join(tmpdir(), "doc-chat-up-")));
    // 真实 copilot handler 是 Router,只接管 /api/copilotkit;其余交还 next()
    const copilotStub = (req: any, res: any, next: any) => {
      if (req.path.startsWith("/api/copilotkit")) {
        res.statusCode = 501;
        res.end("copilot stub");
        return;
      }
      next();
    };
    const app = createApp({ registry: reg, copilotHandler: copilotStub, webDist: dist });
    const srv = createServer(app);
    await new Promise<void>((resolve) => srv.listen(0, resolve));
    const addr = srv.address();
    if (addr === null || typeof addr === "string") throw new Error("no port");
    const url = `http://127.0.0.1:${addr.port}`;

    try {
      const root = await fetch(`${url}/`);
      expect(root.status).toBe(200);
      expect(await root.text()).toContain("doc-chat");

      const spa = await fetch(`${url}/some/client/route`);
      expect(spa.status).toBe(200);
      expect(await spa.text()).toContain("doc-chat");

      // /api/upload is NOT swallowed by the SPA fallback (returns 400, not the html)
      const api = await fetch(`${url}/api/upload`, { method: "POST", body: new FormData() });
      expect(api.status).toBe(400);
    } finally {
      srv.close();
    }
  });
});
