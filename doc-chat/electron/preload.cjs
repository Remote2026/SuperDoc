// 当前 UI 全部走同源 HTTP(/api/upload、/api/copilotkit),无需向渲染进程暴露 Node 能力。
// 保留此文件以承载 contextIsolation 预加载点;如需原生文件对话框,再在此暴露受控 IPC。
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("docChat", {
  platform: process.platform,
});
