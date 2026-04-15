---
name: user-insight
description: 分析 OpenClaw workspace 数据，生成本地用户画像 HTML 报告。触发于用户说"分析我的用户画像"、"user-insight"，或在安装完成后回复肯定回答。
---

# User Insight - 用户画像分析

## 触发条件

以下任意情况触发：

1. **直接触发**：用户说 "分析我的用户画像" / "user-insight" / "生成我的 AI 使用报告"
2. **安装后触发**：如果 `user-insight setup` 命令输出中包含 `USER_INSIGHT_SETUP_COMPLETE`，agent 应主动向用户发送邀请消息；用户回复肯定词后自动执行
3. **肯定词触发**：已安装状态下，用户说 "是" / "好" / "可以" / "开始" / "分析" / "yes" / "ok" 等（且上下文与 user-insight 相关）

## 安装后主动邀请规则

当你（agent）刚刚帮用户执行了 `user-insight setup`，且命令输出中出现 `USER_INSIGHT_SETUP_COMPLETE` 时，请在返回命令结果后，向用户发送：

> 🎉 **user-insight 安装完成！**
>
> 我已经准备好分析你的 OpenClaw workspace 了。
> 是否立即获取你的 AI 能力画像？回复 **「是」** 即可开始分析并生成本地 HTML 报告。

如果用户回复**肯定词**（是/好/可以/开始/分析/yes/ok/行），则**立即执行下方的完整分析流程**。

## 完整分析执行流程（严格按顺序）

### Step 1: 获取安装路径
读取文件：`~/.openclaw/workspace/.user-insight-path.json`
提取 `binDir` 字段。

### Step 2: 收集数据
执行命令：
```bash
node "<binDir>/collect.js"
```
捕获 stdout 中的 `raw-*.json` 路径，记为 `RAW_PATH`。

### Step 3: 读取原始数据
用 `read` 工具读取 `RAW_PATH` 的完整内容。

### Step 4: 模型分析（由当前 agent 直接完成）
你不需要调用外部 LLM API，直接基于读取到的 JSON 数据生成结构化分析。

**分析维度：**
1. **aiMaturity**: AI 使用成熟度评分（1-10）和水平分级
2. **businessDirection**: 主要业务方向、次要方向、置信度（0-1）
3. **personalityTags**: 5-8 个性格/行为标签
4. **toolingStack**: { feishu, codingAgents, contentCreation, dataAnalysis, socialAutomation, financialTools }
5. **recentFocusAreas**: 最近 14 天内的 3-5 个核心关注领域
6. **cognitiveStyle**: { decisionMaking, informationProcessing, riskAppetite }
7. **relationshipWithAI**: 用户与 AI 的关系定位
8. **growthTrajectory**: 成长轨迹推断
9. **modelPreference**: { primaryModel, preferenceAnalysis, businessFit }
10. **keyQuotes**: 3-5 条代表性原话/观点
11. **insights**: 3-5 条独家洞察

**输出格式（严格 JSON）：**
```json
{
  "aiMaturity": { "score": number, "level": "beginner|intermediate|advanced|expert", "indicators": [string] },
  "businessDirection": { "primary": string, "secondary": string, "confidence": number },
  "personalityTags": [string],
  "toolingStack": { "feishu": boolean, "codingAgents": boolean, "contentCreation": boolean, "dataAnalysis": boolean, "socialAutomation": boolean, "financialTools": boolean },
  "recentFocusAreas": [string],
  "cognitiveStyle": { "decisionMaking": string, "informationProcessing": string, "riskAppetite": string },
  "relationshipWithAI": string,
  "growthTrajectory": string,
  "modelPreference": { "primaryModel": string, "preferenceAnalysis": string, "businessFit": string },
  "keyQuotes": [string],
  "insights": [string]
}
```

### Step 5: 保存分析结果
将 JSON 保存到 `RAW_PATH` 同目录，文件名为 `analysis-YYYY-MM-DDTHH-MM-SS.json`。
记为 `ANALYSIS_PATH`。

### Step 6: 生成 HTML 报告
执行命令：
```bash
node "<binDir>/report.js" "ANALYSIS_PATH" "RAW_PATH"
```
捕获 stdout 中的 HTML 路径，记为 `REPORT_PATH`。

### Step 7: 告知用户
向用户展示 `REPORT_PATH`，并列出 3-5 条核心发现摘要。

## 隐私说明

- 所有原始文件仅在本地处理
- 分析由当前 agent 模型在本地完成
- 最终报告仅保存在 `~/.openclaw/workspace/user-insight-reports/`
