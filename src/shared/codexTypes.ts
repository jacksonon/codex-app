import type { ThreadEvent } from "@openai/codex-sdk";

export type CodexSessionState = "idle" | "initializing" | "ready" | "running" | "error";

export type CodexSessionStatus = {
  state: CodexSessionState;
  workspacePath?: string;
  message?: string;
  error?: string;
};

export type CodexStreamEvent =
  | { type: "status"; status: CodexSessionStatus }
  | { type: "start"; prompt: string }
  | { type: "thread-event"; event: ThreadEvent }
  | { type: "complete" }
  | { type: "error"; message: string };
