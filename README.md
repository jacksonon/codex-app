# Codex 桌面客户端

跨平台的 Codex 独立对话应用，基于 Electron + React 构建，当前支持 macOS 与 Windows，配置已预先准备好扩展至 Linux 打包。

## 功能特性

- 🚀 一键封装 Codex SDK，选择工作目录后即可与 Codex 进行往返对话。
- 🌈 启动界面提供七彩光晕输入框，左上角为工作目录选择，右上角展示 Codex 状态与上下文用量。
- 💬 发送首条指令后自动展开历史对话视图，实时展示用户与 Codex 的交流、推理、命令执行情况。
- 🧩 采用 `@openai/codex-sdk`，可在同一工作目录内保持线程上下文，支持后续多轮提问。
- 📦 使用 `electron-builder`，默认输出 macOS (dmg/zip)、Windows (nsis/zip) 以及 Linux (AppImage/deb) 安装包配置。

## 环境要求

- Node.js ≥ 18
- npm ≥ 9
- 需预先安装并登录 Codex CLI（`npm i -g @openai/codex` 或 `brew install codex`），SDK 会复用本地凭证。

## 快速上手

1. 安装依赖（首次下载 Electron 体积较大，如遇网络超时可重试或提前配置镜像源）：

   ```bash
   npm install
   ```

2. 启动开发模式（并行监听主进程、预加载脚本与 Vite 前端）：

   ```bash
   npm run dev
   ```

   - Vite Dev Server 固定端口 `5173`
   - Electron 在资源编译完成后自动启动

3. 生产构建（仅生成静态产物，不打包安装包）：

   ```bash
   npm run build
   ```

4. 跨平台打包（默认按照 `electron-builder` 配置生成安装包）：

   ```bash
   npm run package
   ```

   输出产物位于 `dist/` 目录。

## 使用流程

1. 打开应用后，首先点击左上角的「选择工作目录」，确保目录已初始化为 Git 仓库或启用 `skipGitRepoCheck`（本项目已启用，方便快速试用）。
2. 选择完成后，状态面板会显示当前目录，输入框解锁。
3. 在输入框中键入问题/指令（最多显示 3 行，超出部分滚动），点击右下角「发送」或使用 `Cmd/Ctrl + Enter` 快捷键发送。
4. 首条消息发送后界面切换为对话视图，左侧展示 Codex 回复、推理说明与命令执行结果，右上角实时更新 token 用量。
5. 若 Codex 返回错误或执行失败，系统消息会以红色提示。

## 项目结构

```
├─ src
│  ├─ main/        # Electron 主进程（窗口、IPC、Codex 会话管理）
│  ├─ preload/     # 预加载脚本，暴露安全的窗口 API
│  ├─ renderer/    # React 前端界面与样式
│  └─ shared/      # 主进程与渲染进程共享的类型/接口
├─ dist/           # 构建输出目录（构建后生成）
├─ tsconfig*.json  # TypeScript 配置
├─ vite.config.ts  # Vite 渲染进程配置
└─ package.json
```

## 后续扩展建议

- **Linux 支持**：`electron-builder` 已配置 AppImage 与 deb 目标，安装对应依赖后即可在 Linux 主机上执行 `npm run package` 生成安装包。
- **身份校验**：根据业务需要，可结合 `CodexOptions` 增加自定义 `baseUrl`/`apiKey` 配置。
- **持久化历史**：目前会话历史仅维护于内存，若需跨会话恢复，可记录 `thread.id`，并调用 `codex.resumeThread` 恢复对话。
- **UI 微调**：可在 `src/renderer/styles` 内继续拓展主题或接入设计系统。

## 常见问题

- **Electron 依赖下载超时**：由于 Electron 安装存在大文件，建议配置国内源或手动设置 `ELECTRON_MIRROR`。
- **Codex 未登录**：若终端未登录 Codex CLI，首次调用 SDK 会提示登录，按 CLI 指引完成即可。
- **未选择目录无法发送**：应用默认禁止在未选择工作目录时发送消息，以确保 Codex 拥有上下文。

欢迎在此基础上继续扩展功能，如引入会话管理、多窗口支持或插件系统等。
