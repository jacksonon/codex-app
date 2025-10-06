import type { Codex as CodexClient, Thread } from "@openai/codex-sdk";
import type { CodexSessionStatus, CodexStreamEvent } from "../shared/codexTypes";

type CodexOptions = {
  baseUrl?: string;
  apiKey?: string;
};

export class CodexSession {
  private codexInstance: CodexClient | null = null;
  private thread: Thread | null = null;
  private workingDirectory: string | null = null;
  private status: CodexSessionStatus = { state: "idle" };
  private busy = false;
  private readonly options?: CodexOptions;

  constructor(options?: CodexOptions) {
    this.options = options;
  }

  public getStatus(): CodexSessionStatus {
    return this.status;
  }

  public hasWorkspace(): boolean {
    return Boolean(this.workingDirectory);
  }

  public isBusy(): boolean {
    return this.busy;
  }

  public setWorkspace(path: string) {
    this.workingDirectory = path;
    this.thread = null;
    this.updateStatus({
      state: "ready",
      workspacePath: path,
      message: "工作目录已就绪",
    });
  }

  public resetWorkspace() {
    this.workingDirectory = null;
    this.thread = null;
    this.updateStatus({ state: "idle" });
  }

  private updateStatus(status: CodexSessionStatus) {
    this.status = status;
  }

  private ensureWorkspace() {
    if (!this.workingDirectory) {
      throw new Error("请选择一个工作目录以继续");
    }
  }

  private async getCodex(): Promise<CodexClient> {
    if (this.codexInstance) {
      return this.codexInstance;
    }
    const mod = await import("@openai/codex-sdk");
    this.codexInstance = new mod.Codex(this.options);
    return this.codexInstance;
  }

  private async ensureThread() {
    if (!this.thread) {
      const codex = await this.getCodex();
      this.thread = codex.startThread({
        workingDirectory: this.workingDirectory!,
        skipGitRepoCheck: true,
      });
    }
  }

  public async runPrompt(
    prompt: string,
    emit: (event: CodexStreamEvent) => void,
  ): Promise<void> {
    this.ensureWorkspace();
    if (this.busy) {
      throw new Error("Codex 正在处理，请稍后再试");
    }
    await this.ensureThread();

    this.busy = true;
    this.updateStatus({
      state: "running",
      workspacePath: this.workingDirectory ?? undefined,
      message: "Codex 正在处理...",
    });
    emit({ type: "status", status: this.status });
    emit({ type: "start", prompt });

    try {
      const activeThread = this.thread!;
      const streamed = await activeThread.runStreamed(prompt);
      for await (const event of streamed.events) {
        emit({ type: "thread-event", event });
      }
      emit({ type: "complete" });
      this.updateStatus({
        state: "ready",
        workspacePath: this.workingDirectory ?? undefined,
        message: "Codex 已完成当前请求",
      });
      emit({ type: "status", status: this.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus({
        state: "error",
        workspacePath: this.workingDirectory ?? undefined,
        message: "Codex 运行出错",
        error: message,
      });
      emit({ type: "error", message });
      emit({ type: "status", status: this.status });
    } finally {
      this.busy = false;
    }
  }
}
