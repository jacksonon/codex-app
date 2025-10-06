import type { CodexAPI } from "./preloadBridge";

declare global {
  interface Window {
    codex: CodexAPI;
  }
}

export {};
