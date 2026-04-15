# User Insight CLI

一键分析 OpenClaw workspace，生成用户画像 HTML 报告。

## 功能

- 自动扫描已安装的 skills
- 读取 SOUL.md、USER.md、MEMORY.md、AGENTS.md、HEARTBEAT.md、TOOLS.md
- 支持两种分析模式：
  - **Agent 协助模式**（推荐）：安装后由 OpenClaw Agent 直接使用本地大模型分析
  - **全自动模式**：配置 API Key 后一键生成报告
- 输出美观的本地 HTML 报告（数据不出本地）

## 安装与使用

### 方式一：Agent 协助模式（无需 API Key）

```bash
# 1. 全局安装
npm install -g "E:\OpenClaw\projects\user-insight-cli\clawd-user-insight-0.1.0.tgz"

# 2. 运行安装命令
user-insight
```

安装完成后，你会看到：
```
=== USER_INSIGHT_SETUP_COMPLETE ===
user-insight 已安装完成。
请在 OpenClaw 对话中回复「是」开始分析你的 AI 能力画像。
=====================================
```

**回复「是」**，Agent 将自动：
1. 收集你的 workspace 数据
2. 使用本地大模型分析生成结构化画像
3. 输出 HTML 报告

### 方式二：全自动模式（需要 API Key）

```bash
# 配置 API Key
$env:KIMI_API_KEY="sk-xxx"
# 或 $env:OPENAI_API_KEY="sk-xxx"
# 或 $env:DEEPSEEK_API_KEY="sk-xxx"

# 一键运行
user-insight-run
```

### 方式三：分步手动模式

```bash
# 1. 收集数据
user-insight-collect
# 输出: C:\Users\...\.openclaw\workspace\user-insight-reports\raw-2026-...json

# 2. 将数据交给 Agent 分析（或用自己的 API 调用 LLM）
# Agent 会读取 raw JSON 并生成 analysis JSON

# 3. 生成报告
user-insight-report analysis-2026-...json raw-2026-...json
```

## CLI 命令说明

| 命令 | 说明 |
|------|------|
| `user-insight` | 安装 skill，初始化环境 |
| `user-insight-collect` | 收集 workspace 数据，输出 raw JSON |
| `user-insight-report` | 从 analysis + raw JSON 生成 HTML 报告 |
| `user-insight-run` | 全自动模式（collect → analyze → report）|

## 输出位置

所有报告保存在：
```
~/.openclaw/workspace/user-insight-reports/
```

包含：
- `raw-*.json` — 收集的原始数据
- `analysis-*.json` — 模型分析结果
- `report-*.html` — 最终可视化报告

## 支持的模型（全自动模式）

| 厂商 | 环境变量 | 默认模型 |
|------|---------|---------|
| Moonshot (Kimi) | `KIMI_API_KEY` | `moonshot-v1-8k` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |

**Agent 协助模式不需要配置 API Key**，由 Agent 直接使用本地大模型完成分析。

## 隐私说明

- 原始 markdown 文件**不会上传**到任何外部平台
- Agent 协助模式下，分析由本地 Agent 直接完成，数据不出本地
- 全自动模式下，仅上传一个包含文件内容的分析 prompt 给 LLM
- 最终报告**仅保存在本地** `user-insight-reports/` 目录
