import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  AgentMessageItem,
  CommandExecutionItem,
  ReasoningItem,
  ThreadEvent,
  TurnCompletedEvent,
} from "@openai/codex-sdk";
import type { CodexSessionStatus, CodexStreamEvent } from "@shared/codexTypes";

type ChatRole = "user" | "assistant" | "system";

type MessageVariant = "default" | "reasoning" | "command" | "error";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  variant?: MessageVariant;
  status?: "streaming" | "done" | "error";
  commandOutput?: string;
  sequence: number;
};

const initialStatus: CodexSessionStatus = { state: "idle" };

export function App() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [status, setStatus] = useState<CodexSessionStatus>(initialStatus);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [usage, setUsage] = useState<TurnCompletedEvent["usage"] | null>(null);

  const messageMapRef = useRef<Map<string, string>>(new Map());
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    window.codex
      .getStatus()
      .then((initial) => {
        setStatus(initial);
        if (initial.workspacePath) {
          setWorkspacePath(initial.workspacePath);
        }
      })
      .catch((error) => {
        console.error("获取初始状态失败", error);
      });
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const nextSequence = useCallback(() => {
    const current = sequenceRef.current;
    sequenceRef.current += 1;
    return current;
  }, []);

  const addMessage = useCallback(
    (message: Omit<ChatMessage, "sequence">) => {
      const sequence = nextSequence();
      setMessages((prev) => {
        const next = [...prev, { ...message, sequence }];
        next.sort((a, b) => a.sequence - b.sequence);
        return next;
      });
    },
    [nextSequence],
  );

  const appendSystemMessage = useCallback(
    (variant: MessageVariant, content: string) => {
      addMessage({
        id: `system-${Date.now()}`,
        role: "system",
        content,
        variant,
        status: variant === "error" ? "error" : "done",
      });
    },
    [addMessage],
  );

  const appendUserMessage = useCallback(
    (content: string) => {
      addMessage({
        id: `user-${Date.now()}`,
        role: "user",
        content,
        status: "done",
      });
    },
    [addMessage],
  );

  const handleSelectWorkspace = useCallback(async () => {
    try {
      const result = await window.codex.selectWorkspace();
      if (result) {
        setWorkspacePath(result.path);
        setStatus(result.status);
        setUsage(null);
        setMessages([]);
        messageMapRef.current.clear();
        sequenceRef.current = 0;
      }
    } catch (error) {
      console.error("选择工作目录失败", error);
      appendSystemMessage(
        "error",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [appendSystemMessage]);

  const ensureAssistantMessage = useCallback((item: AgentMessageItem) => {
    const existingId = messageMapRef.current.get(item.id);
    if (existingId) {
      return existingId;
    }
    const messageId = `assistant-${item.id}`;
    messageMapRef.current.set(item.id, messageId);
    addMessage({
      id: messageId,
      role: "assistant",
      content: item.text ?? "",
      status: "streaming",
    });
    return messageId;
  }, [addMessage]);

  const updateAssistantMessage = useCallback(
    (item: AgentMessageItem, completed = false) => {
      const messageId = ensureAssistantMessage(item);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                content: item.text,
                status: completed ? "done" : "streaming",
              }
            : msg,
        ),
      );
    },
    [ensureAssistantMessage],
  );

  const ensureReasoningMessage = useCallback((item: ReasoningItem) => {
    const existingId = messageMapRef.current.get(item.id);
    if (existingId) {
      return existingId;
    }
    const messageId = `reasoning-${item.id}`;
    messageMapRef.current.set(item.id, messageId);
    addMessage({
      id: messageId,
      role: "assistant",
      content: item.text,
      variant: "reasoning",
      status: "streaming",
    });
    return messageId;
  }, [addMessage]);

  const updateReasoningMessage = useCallback((item: ReasoningItem, completed = false) => {
    const messageId = ensureReasoningMessage(item);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              content: item.text,
              status: completed ? "done" : "streaming",
            }
          : msg,
      ),
    );
  }, [ensureReasoningMessage]);

  const handleCommandItem = useCallback((item: CommandExecutionItem) => {
    const existingId = messageMapRef.current.get(item.id);
    if (!existingId) {
      const messageId = `command-${item.id}`;
      messageMapRef.current.set(item.id, messageId);
      addMessage({
        id: messageId,
        role: "system",
        content: item.command,
        variant: "command",
        status: item.status === "completed" ? "done" : "streaming",
        commandOutput: item.aggregated_output ?? "",
      });
      return;
    }
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === existingId
          ? {
              ...msg,
              status: item.status === "completed" ? "done" : msg.status,
              commandOutput: item.aggregated_output ?? msg.commandOutput,
            }
          : msg,
      ),
    );
  }, [addMessage]);

  const handleThreadEvent = useCallback((threadEvent: ThreadEvent) => {
    if (threadEvent.type === "turn.started") {
      messageMapRef.current.clear();
      setUsage(null);
    } else if (threadEvent.type === "item.started") {
      const item = threadEvent.item;
      if (item.type === "agent_message") {
        ensureAssistantMessage(item);
      } else if (item.type === "reasoning") {
        ensureReasoningMessage(item);
      } else if (item.type === "command_execution") {
        handleCommandItem(item);
      }
    } else if (threadEvent.type === "item.updated") {
      const item = threadEvent.item;
      if (item.type === "agent_message") {
        updateAssistantMessage(item);
      } else if (item.type === "reasoning") {
        updateReasoningMessage(item);
      } else if (item.type === "command_execution") {
        handleCommandItem(item);
      }
    } else if (threadEvent.type === "item.completed") {
      const item = threadEvent.item;
      if (item.type === "agent_message") {
        updateAssistantMessage(item, true);
      } else if (item.type === "reasoning") {
        updateReasoningMessage(item, true);
      } else if (item.type === "command_execution") {
        handleCommandItem({ ...item, status: "completed" });
      }
    } else if (threadEvent.type === "turn.completed") {
      setUsage(threadEvent.usage);
    } else if (threadEvent.type === "turn.failed") {
      appendSystemMessage("error", threadEvent.error.message);
    } else if (threadEvent.type === "error") {
      appendSystemMessage("error", threadEvent.message);
    }
  }, [appendSystemMessage, ensureAssistantMessage, ensureReasoningMessage, handleCommandItem, updateAssistantMessage, updateReasoningMessage]);

  const handleStreamEvent = useCallback((event: CodexStreamEvent) => {
    if (event.type === "status") {
      setStatus(event.status);
      if (event.status.workspacePath) {
        setWorkspacePath(event.status.workspacePath);
      }
    } else if (event.type === "start") {
      appendUserMessage(event.prompt);
      setUsage(null);
      setIsSending(true);
    } else if (event.type === "thread-event") {
      handleThreadEvent(event.event);
    } else if (event.type === "complete") {
      setIsSending(false);
    } else if (event.type === "error") {
      setIsSending(false);
      appendSystemMessage("error", event.message);
    }
  }, [appendSystemMessage, appendUserMessage, handleThreadEvent]);

  useEffect(() => {
    const id = window.codex.onStream(handleStreamEvent);
    return () => window.codex.offStream(id);
  }, [handleStreamEvent]);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      return;
    }
    if (!workspacePath) {
      appendSystemMessage("error", "请先选择一个工作目录");
      return;
    }
    setInputValue("");
    setIsSending(true);
    try {
      await window.codex.sendPrompt(trimmed);
    } catch (error) {
      setIsSending(false);
      appendSystemMessage(
        "error",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [appendSystemMessage, inputValue, workspacePath]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const statusLabel = useMemo(() => {
    switch (status.state) {
      case "idle":
        return "等待选择工作目录";
      case "ready":
        return "Codex 已就绪";
      case "running":
        return "Codex 正在处理中";
      case "error":
        return status.error ?? status.message ?? "运行出错";
      default:
        return status.message ?? "";
    }
  }, [status]);

  const progressLabel = useMemo(() => {
    if (!usage) {
      return null;
    }
    return `上下文 tokens: in ${usage.input_tokens} • out ${usage.output_tokens}`;
  }, [usage]);

  const sendDisabled = !workspacePath || isSending || !inputValue.trim();

  const showChatHistory = messages.length > 0;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button className="folder-button" onClick={handleSelectWorkspace} disabled={isSending}>
          选择工作目录
        </button>
        <div className="status-panel">
          <div className="status-primary">{statusLabel}</div>
          <div className="status-secondary">
            {workspacePath ? workspacePath : "未选择目录"}
          </div>
          {progressLabel ? (
            <div className="status-secondary">{progressLabel}</div>
          ) : null}
        </div>
      </header>

      <main className={`chat-wrapper ${showChatHistory ? "chat-wrapper--active" : ""}`}>
        {showChatHistory ? (
          <div className="chat-scroll" ref={chatContainerRef}>
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
          </div>
        ) : (
          <div className="chat-empty">等待消息开始对话</div>
        )}
      </main>

      <footer className="composer">
        <div className="rainbow-frame">
          <div className="input-shell">
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={workspacePath ? "输入你的指令 (Ctrl/Cmd + Enter 发送)" : "请先选择工作目录"}
              disabled={!workspacePath || isSending}
              rows={3}
            />
            <button
              className="send-button"
              onClick={() => void handleSend()}
              disabled={sendDisabled}
            >
              {isSending ? "发送中..." : "发送"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

type ChatBubbleProps = {
  message: ChatMessage;
};

function ChatBubble({ message }: ChatBubbleProps) {
  const roleLabel = message.role === "user" ? "我" : message.role === "assistant" ? "Codex" : "系统";
  const bubbleClass = useMemo(() => {
    let className = "bubble";
    if (message.role === "user") {
      className += " bubble--user";
    } else if (message.role === "assistant") {
      className += " bubble--assistant";
    } else {
      className += " bubble--system";
    }
    if (message.variant === "reasoning") {
      className += " bubble--reasoning";
    }
    if (message.variant === "command") {
      className += " bubble--command";
    }
    if (message.variant === "error") {
      className += " bubble--error";
    }
    if (message.status === "streaming") {
      className += " bubble--streaming";
    }
    return className;
  }, [message]);

  return (
    <div className={bubbleClass}>
      <div className="bubble-header">
        <span className="bubble-role">{roleLabel}</span>
        {message.status === "streaming" ? <span className="bubble-tag">生成中...</span> : null}
      </div>
      <div className="bubble-content">{message.content}</div>
      {message.variant === "command" && message.commandOutput ? (
        <pre className="bubble-command-output">{message.commandOutput}</pre>
      ) : null}
    </div>
  );
}
