import type { CodexSessionStatus, CodexStreamEvent } from "./codexTypes";

export interface CodexAPI {
  selectWorkspace(): Promise<{ path: string; status: CodexSessionStatus } | null>;
  getStatus(): Promise<CodexSessionStatus>;
  isBusy(): Promise<boolean>;
  sendPrompt(prompt: string): Promise<void>;
  onStream(callback: (event: CodexStreamEvent) => void): number;
  offStream(id: number): void;
}
