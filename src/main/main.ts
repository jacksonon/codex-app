import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { BrowserWindowConstructorOptions } from "electron";
import path from "node:path";
import { CodexSession, CodexStreamEvent } from "./codexSession";

const isDev = process.env.NODE_ENV === "development";
let mainWindow: BrowserWindow | null = null;

const session = new CodexSession();

function createWindow() {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0B0B0F",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === "darwin") {
    windowOptions.fullscreenable = false;
    windowOptions.alwaysOnTop = true;
    windowOptions.visibleOnAllWorkspaces = true;
    windowOptions.vibrancy = "sidebar";
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (process.platform === "darwin") {
    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = path.join(__dirname, "../renderer/index.html");
    void mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function emitToRenderer(event: CodexStreamEvent) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("codex:stream", event);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("workspace:select", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const dir = result.filePaths[0];
  session.setWorkspace(dir);
  const status = session.getStatus();
  emitToRenderer({ type: "status", status });
  return { path: dir, status };
});

ipcMain.handle("workspace:get-status", () => {
  return session.getStatus();
});

ipcMain.handle("codex:send", async (event, prompt: string) => {
  if (!prompt.trim()) {
    throw new Error("输入不能为空");
  }
  const sender = event.sender;
  await session.runPrompt(prompt, (payload) => {
    if (!sender.isDestroyed()) {
      sender.send("codex:stream", payload);
    }
  });
  return true;
});

ipcMain.handle("codex:is-busy", () => session.isBusy());
