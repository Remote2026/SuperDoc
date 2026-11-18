// Electron 主进程:spawn 内嵌 doc-chat server(复用已测试的 Node 逻辑),
// 等待其就绪后用同源 http://localhost:PORT 加载前端。
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");

// 资源路径:打包后 server/web 产物在 resourcesPath 下(见 package.json build.extraResources),
// 开发时直接用 doc-chat/ 目录。
const isPackaged = app.isPackaged;
const resourcesRoot = isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
const serverRoot = path.join(resourcesRoot, "server");
const webDist = path.join(resourcesRoot, "web", "dist");
const tsxCli = path.join(serverRoot, "node_modules", ".bin", "tsx");
const serverEntry = path.join(serverRoot, "src", "index.ts");

let serverProcess = null;
let mainWindow = null;
let currentPort = null;

/** 选一个空闲端口。 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** 启动内嵌 server:取空闲端口 → spawn tsx 跑 server/src/index.ts → 等就绪日志。 */
async function startServer() {
  const port = await getFreePort();
  // 上传目录放 userData:打包后应用目录只读,且重装不丢文档
  const uploadsDir = path.join(app.getPath("userData"), "uploads");

  // 用 Electron 自带的 Node 运行 tsx(避免依赖系统 node)。
  serverProcess = spawn(
    process.execPath,
    [tsxCli, serverEntry],
    {
      cwd: serverRoot,
      // 以环境变量把运行参数交给 server(端口/上传目录/前端产物/关遥测)
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(port),
        UPLOADS_DIR: uploadsDir,
        DOC_CHAT_WEB_DIST: webDist,
        COPILOTKIT_TELEMETRY_DISABLED: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  // 就绪判定:server 打出 "server on http" 才算启动成功;提前退出或 30s 超时 → 失败
  await new Promise((resolve, reject) => {
    let settled = false;
    const onData = (buf) => {
      const text = buf.toString();
      process.stdout.write(`[server] ${text}`);
      if (!settled && text.includes("server on http")) {
        settled = true;
        resolve();
      }
    };
    serverProcess.stdout.on("data", onData);
    serverProcess.stderr.on("data", (b) => process.stderr.write(`[server] ${b}`));
    serverProcess.on("exit", (code) => {
      if (!settled) reject(new Error(`server exited early (code ${code})`));
    });
    setTimeout(() => {
      if (!settled) reject(new Error("server start timeout"));
    }, 30000);
  });

  return port;
}

function createWindow(port) {
  currentPort = port;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    title: "SuperDoc 文档分析",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}/`);

  // 外部链接用系统浏览器打开,不在应用内导航。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/** SIGTERM 内嵌 server(server 端自行 close HTTP + dispose SuperDoc 宿主)。 */
function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

// 启动顺序:先等 server 就绪再开窗加载同源页面;失败直接退出,避免白窗
app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
  } catch (err) {
    console.error("启动内嵌服务失败:", err);
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && currentPort !== null) {
      createWindow(currentPort);
    }
  });
});

app.on("window-all-closed", () => {
  // 非 macOS 关窗即退出;macOS 保留进程,activate 时复用内嵌服务重开窗口。
  if (process.platform !== "darwin") {
    stopServer();
    app.quit();
  }
});

app.on("before-quit", stopServer);
