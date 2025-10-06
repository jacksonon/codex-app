import { contextBridge, ipcRenderer } from "electron";
import type { CodexSessionStatus, CodexStreamEvent } from "../shared/codexTypes";
import type { CodexAPI } from "../shared/preloadBridge";

type StreamCallback = (event: CodexStreamEvent) => void;

const callbacks = new Map<number, StreamCallback>();
let callbackIdSeed = 0;

const api: CodexAPI = {
  async selectWorkspace(): Promise<{ path: string; status: CodexSessionStatus } | null> {
    return ipcRenderer.invoke("workspace:select");
  },
  async getStatus(): Promise<CodexSessionStatus> {
    return ipcRenderer.invoke("workspace:get-status");
  },
  async isBusy(): Promise<boolean> {
    return ipcRenderer.invoke("codex:is-busy");
  },
  async sendPrompt(prompt: string): Promise<void> {
    await ipcRenderer.invoke("codex:send", prompt);
  },
  onStream(callback: StreamCallback): number {
    const id = ++callbackIdSeed;
    callbacks.set(id, callback);
    return id;
  },
  offStream(id: number) {
    callbacks.delete(id);
  },
};

ipcRenderer.on("codex:stream", (_event, payload: CodexStreamEvent) => {
  callbacks.forEach((cb) => cb(payload));
});

contextBridge.exposeInMainWorld("codex", api);
