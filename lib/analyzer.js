

function buildPrompt(data) {
  const memories = data.recentMemories.map(m => `### ${m.name} (${m.mtime})\n${m.content || '[无内容]'}`).join('\n\n');
  
  return `你是一位顶尖的人类行为分析师和数字人类学家。请根据以下 OpenClaw AI 助手的 workspace 数据，生成一份深度用户画像分析报告。

## 数据概况
- 记忆文件总数: ${data.fileStats.memoryFileCount}
- 安装 Skills 数量: ${data.fileStats.skillCount}
- Workspace 项目数: ${data.fileStats.projectCount}
- 默认 AI 模型: ${data.agentModel.primary} (${data.agentModel.alias})
- 可用模型数: ${data.agentModel.availableModels?.length || 0}
- 模型能力: reasoning=${data.agentModel.capabilities?.reasoning || false}, contextWindow=${data.agentModel.capabilities?.contextWindow || 'unknown'}, supportsImage=${data.agentModel.capabilities?.supportsImage || false}

## 核心文件内容

### SOUL.md (AI 人格定义)
${data.files.soul || '[未创建]'}

### USER.md (用户画像)
${data.files.user || '[未创建]'}

### MEMORY.md (长期记忆精华)
${data.files.memory || '[未创建]'}

### AGENTS.md (工作流规范)
${data.files.agents || '[未创建]'}

### HEARTBEAT.md (定期检查任务)
${data.files.heartbeat || '[未创建]'}

### TOOLS.md (环境与设备)
${data.files.tools || '[未创建]'}

### IDENTITY.md (AI 身份)
${data.files.identity || '[未创建]'}

## 最近记忆文件（按时间倒序）
${memories || '[无记忆文件]'}

## 已安装 Skills 列表
${data.skills.join(', ')}

## Skills 分类统计
- 生产力工具: ${data.skillCategories.productivity}
- 技术开发: ${data.skillCategories.coding}
- 内容创作: ${data.skillCategories.content}
- 数据分析: ${data.skillCategories.data}
- 社交沟通: ${data.skillCategories.social}
- 健康生活: ${data.skillCategories.health}
- 金融投资: ${data.skillCategories.finance}

## 分析要求
请从以下维度进行深度分析，并严格返回 JSON 格式：

1. **aiMaturity**: AI 使用成熟度评分（1-10）和水平分级
2. **businessDirection**: 根据 skills 和项目推断的主要业务方向、次要方向、置信度
3. **personalityTags**: 5-8 个性格/行为标签（如效率导向、结构化思维、长期主义者）
4. **toolingStack**: 高频使用工具类型的布尔映射
5. **recentFocusAreas**: 最近 14 天内的 3-5 个核心关注领域
6. **cognitiveStyle**: 认知风格分析（决策方式、信息处理偏好、风险偏好）
7. **relationshipWithAI**: 用户与 AI 的关系定位（工具 vs 伙伴 vs 代理人）
8. **growthTrajectory**: 成长轨迹推断（正在学习什么、试图解决什么问题）
9. **modelPreference**: 基于用户选择的默认模型和可用模型列表，分析用户对模型能力/成本/延迟的偏好，以及这种选择与用户业务方向的匹配度
10. **keyQuotes**: 从文件中提取的 3-5 条最能代表用户的原话或观点
11. **insights**: 3-5 条你作为分析师的独家洞察
12. **archetype**: 从以下100种物品中，选择最匹配用户画像的一个，并提供毒舌解说词

可选物品：松鼠、仓鼠、园丁鸟、孔雀、候鸟、蜘蛛、蜜蜂、蚂蚁、蜗牛、变色龙、猫头鹰、乌鸦、海豚、企鹅、章鱼、袋鼠、刺猬、狐狸、狼、熊猫、昙花、含羞草、竹子、葡萄藤、蒲公英、仙人掌、藤蔓、松树、柳树、荷花、向日葵、多肉植物、盆景、杂草、嫁接果树、装修中的房子、毛坯房、精装房、样板房、烂尾楼、玻璃房、地下室、阁楼、迷宫、城堡、帐篷、独木桥、隧道、灯塔、风车、方便面、自热火锅、压缩饼干、罐头食品、外卖盒、瑜伽裤、冲锋衣、高跟鞋、文化衫、折叠椅、懒人沙发、落地镜、手账本、荧光笔、贪吃蛇、俄罗斯方块、消消乐、跑酷游戏、模拟城市、沙盒游戏、收集卡牌、盲盒、扭蛋、抓娃娃机、瑞士军刀、万能钥匙、瑞士手表、古董车、乐高积木、魔方、拼图、模型套件、工具箱、厨房小家电、跑步机、按摩椅、咖啡机、相机镜头、旅行箱

archetype 格式：{ "name": "物品名", "quote": "一句毒舌解说词，吐槽用户的核心问题" }

请只返回 JSON，不要有任何 markdown 代码块标记或其他说明文字。JSON 结构如下：

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
  "insights": [string],
  "archetype": { "name": string, "quote": string }
}`;
}

async function analyze(data) {
  const prompt = buildPrompt(data);
  
  const kimiKey = process.env.KIMI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  
  let endpoint, apiKey, model;
  
  if (kimiKey) {
    endpoint = 'https://api.moonshot.cn/v1/chat/completions';
    apiKey = kimiKey;
    model = 'moonshot-v1-8k';
  } else if (openaiKey) {
    endpoint = 'https://api.openai.com/v1/chat/completions';
    apiKey = openaiKey;
    model = 'gpt-4o-mini';
  } else if (deepseekKey) {
    endpoint = 'https://api.deepseek.com/v1/chat/completions';
    apiKey = deepseekKey;
    model = 'deepseek-chat';
  } else {
    throw new Error('未配置任何 LLM API Key');
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是一位顶尖的人类行为分析师，擅长通过数字痕迹推断人格特质、业务方向和成长轨迹。你必须只输出 JSON。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API 请求失败: ${res.status} ${text}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || '';
  
  // 清理可能的 markdown 代码块
  const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('模型返回内容:', content);
    throw new Error('无法解析模型返回的 JSON');
  }
}

module.exports = { buildPrompt, analyze };
