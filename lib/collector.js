const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

function listDirSafe(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (e) {
    return [];
  }
}

// 使用 shell 命令读取目录（Windows 兼容）
function listDirShell(dirPath) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`dir /B /AD "${dirPath}"`, { encoding: 'utf8', windowsHide: true });
      return output.split('\n').map(l => l.trim()).filter(l => l && !l.includes('.'));
    } else {
      const output = execSync(`ls -1 "${dirPath}"`, { encoding: 'utf8' });
      return output.split('\n').map(l => l.trim()).filter(l => l);
    }
  } catch (e) {
    return [];
  }
}

// 获取所有历史 memory 文件，按内容丰富度排序（优先选内容多的）
function getAllMemoryFiles(workspace, maxFiles = 30) {
  const memDir = path.join(workspace, 'memory');
  try {
    const entries = fs.readdirSync(memDir, { withFileTypes: true });
    const files = entries
      .filter(f => f.isFile() && f.name.endsWith('.md') && /^\d{4}-\d{2}-\d{2}/.test(f.name))
      .map(f => {
        const fp = path.join(memDir, f.name);
        const stat = fs.statSync(fp);
        return { 
          name: f.name, 
          date: f.name.replace('.md', ''),
          mtime: stat.mtime, 
          size: stat.size, 
          path: fp 
        };
      })
      .sort((a, b) => b.size - a.size)  // 按内容大小排序（内容多的优先）
      .slice(0, maxFiles);
    
    // 再按日期排序（从旧到新）便于时间线分析
    return files.sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch (e) {
    return [];
  }
}

// 从 memory 内容中提取技术主题/skill
function extractSkillUsage(content) {
  if (!content) return [];
  const skills = [];
  
  // 匹配模式（按优先级）
  const patterns = [
    // `skill-name` 反引号标记
    /`([a-z][\w-]*)`/g,
    // [skill-name] 方括号
    /\[([a-z][\w-]+)\]/g,
    // 使用了 xxx
    /使用[了过]?\s*["'`]?([a-z][\w-]+)["'`]?/gi,
    // 开发/优化/完成 + 项目名
    /(?:开发|优化|完成|重构|部署|发布)[了过]?\s*[`"]?(\w[\w\s-]*?)[`"]?/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const skillName = match[1]?.toLowerCase().trim().replace(/\s+/g, '-');
      // 过滤条件
      if (skillName && 
          skillName.length >= 3 && 
          skillName.length < 50 &&
          !/^\d/.test(skillName) &&
          !['the', 'and', 'for', 'notes', 'tasks', 'morning', 'afternoon', 'evening', 'tomorrow', 'today', 'yesterday', 'decisions', 'learnings', 'insights', 'content', 'highlights', 'memory', 'file'].includes(skillName)) {
        skills.push(skillName);
      }
    }
  }
  
  return skills;
}

// 统计 skill 使用频率
function analyzeSkillFrequency(allMemories) {
  const skillCounts = {};
  const skillByDate = {};
  
  for (const mem of allMemories) {
    const content = readFileSafe(mem.path);
    if (!content) continue;
    
    const skills = extractSkillUsage(content);
    for (const skill of skills) {
      skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      if (!skillByDate[skill]) skillByDate[skill] = [];
      if (!skillByDate[skill].includes(mem.date)) {
        skillByDate[skill].push(mem.date);
      }
    }
  }
  
  // 转换为排序后的数组
  const sortedSkills = Object.entries(skillCounts)
    .map(([name, count]) => ({ 
      name, 
      count, 
      activeDays: skillByDate[name]?.length || 0 
    }))
    .sort((a, b) => b.count - a.count);
  
  return {
    topSkills: sortedSkills.slice(0, 15),
    totalSkillCalls: sortedSkills.reduce((sum, s) => sum + s.count, 0),
    uniqueSkills: sortedSkills.length,
  };
}

// 提取项目/主题（在多个 memory 中出现的）
function extractLongTermProjects(allMemories) {
  const projectPatterns = [
    // 项目名 + 开发/优化/完成
    /([\w-]+(?:-[\w]+)*)\s*(?:项目|工具|cli|app|系统)/gi,
    // 完成/优化/开发 + 项目
    /(?:完成|优化|开发|重构|部署|发布)[了过]?\s*["']?([\w-]+(?:-[\w]+)*)["']?/gi,
    // 带连字符的技术词汇
    /\b(\w+-\w+(?:-\w+)*)\b/g,
  ];
  
  const projectMentions = {};
  
  for (const mem of allMemories) {
    const content = readFileSafe(mem.path);
    if (!content) continue;
    
    for (const pattern of projectPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const project = match[1]?.toLowerCase().trim();
        // 过滤常见词和太短的词
        if (project && project.length >= 4 && project.length <= 30 && 
            !['this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'them'].includes(project) &&
            !/^\d+$/.test(project)) {
          if (!projectMentions[project]) {
            projectMentions[project] = { count: 0, dates: [] };
          }
          projectMentions[project].count++;
          if (!projectMentions[project].dates.includes(mem.date)) {
            projectMentions[project].dates.push(mem.date);
          }
        }
      }
    }
  }
  
  // 筛选长期项目（出现 >=2 次或 >=2 天）
  return Object.entries(projectMentions)
    .filter(([_, data]) => data.count >= 2 || data.dates.length >= 2)
    .map(([name, data]) => ({ 
      name, 
      mentions: data.count, 
      spanDays: data.dates.length,
      firstSeen: data.dates[data.dates.length - 1],
      lastSeen: data.dates[0]
    }))
    .sort((a, b) => b.spanDays - a.spanDays)
    .slice(0, 20);
}

// 分析 SOUL.md - 提取价值观和调教方向
function analyzeSoul(soulContent) {
  if (!soulContent) return null;
  
  const analysis = {
    coreValues: [],
    personality: '',
    boundaries: [],
    evolutionHints: [],
    rawExcerpt: '',
  };
  
  // 提取核心价值观（通常是列表项或强调句）
  const valuePatterns = [
    /^(?:\*\*|\*)\s*([^*]+)/gm,  // ** xxx
    /(?:核心|价值观|准则):?\s*(.+)/gi,  // 核心：xxx
    /be\s+([^,.]+)/gi,  // be xxx
  ];
  
  for (const pattern of valuePatterns) {
    let match;
    while ((match = pattern.exec(soulContent)) !== null) {
      const value = match[1]?.trim();
      if (value && value.length < 100 && !value.includes('you are')) {
        analysis.coreValues.push(value);
      }
    }
  }
  
  // 提取 personality/vibe
  const vibeMatch = soulContent.match(/vibe:?\s*([^\n]+)/i) ||
                    soulContent.match(/personality:?\s*([^\n]+)/i) ||
                    soulContent.match(/be\s+([^,.]+\s+[^,.]+)/i);
  if (vibeMatch) {
    analysis.personality = vibeMatch[1].trim();
  }
  
  // 提取边界/限制
  const boundarySection = soulContent.match(/(?:boundaries?|limits?|rules?)[\s\S]*?(?=\n##|$)/i);
  if (boundarySection) {
    const boundaries = boundarySection[0].match(/^[-*]\s*(.+)$/gm);
    if (boundaries) {
      analysis.boundaries = boundaries.map(b => b.replace(/^[-*]\s*/, '').trim()).slice(0, 5);
    }
  }
  
  // 提取演进提示
  const evolutionSection = soulContent.match(/(?:continuity|memory|evolve|learn)[\s\S]*?(?=\n##|$)/i);
  if (evolutionSection) {
    analysis.evolutionHints = ['重视记忆延续', '持续自我更新'];
  }
  
  // 保留关键原文片段（约1000字符）
  analysis.rawExcerpt = soulContent.slice(0, 1000);
  
  return analysis;
}

// 分析 AGENTS.md - 提取使用习惯和工作模式
function analyzeAgents(agentsContent) {
  if (!agentsContent) return null;
  
  const analysis = {
    workPatterns: [],
    safetyRules: [],
    communicationStyle: '',
    keyPrinciples: [],
    rawExcerpt: '',
  };
  
  // 提取工作模式（如：First Run, Every Session 等）
  const patternMatches = agentsContent.match(/^##?\s*(.+)$/gm);
  if (patternMatches) {
    analysis.workPatterns = patternMatches
      .map(p => p.replace(/^##?\s*/, '').trim())
      .filter(p => p.length < 50)
      .slice(0, 10);
  }
  
  // 提取安全规则
  const safetySection = agentsContent.match(/(?:safety|security|boundaries?|external)[\s\S]*?(?=\n##|$)/i);
  if (safetySection) {
    const rules = safetySection[0].match(/^[-*]\s*(.+)$/gm);
    if (rules) {
      analysis.safetyRules = rules.map(r => r.replace(/^[-*]\s*/, '').trim()).slice(0, 5);
    }
  }
  
  // 提取关键原则（如 "Don't ask permission"）
  const principleSection = agentsContent.match(/(?:core truths|principles|truths)[\s\S]*?(?=\n##|$)/i);
  if (principleSection) {
    const principles = principleSection[0].match(/^(?:\*\*|[-*])\s*(.+)$/gm);
    if (principles) {
      analysis.keyPrinciples = principles.map(p => p.replace(/^(?:\*\*|[-*])\s*/, '').trim()).slice(0, 5);
    }
  }
  
  // 保留关键原文片段
  analysis.rawExcerpt = agentsContent.slice(0, 1500);
  
  return analysis;
}

// 智能提取 memory 文件的关键信息（用于最近记录）
function extractMemoryHighlights(content, maxLines = 30) {
  if (!content) return null;
  const lines = content.split('\n');
  const highlights = [];
  let inDecision = false;
  let inLearning = false;
  
  for (const line of lines.slice(0, 200)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 提取完成任务
    if (/^[-*]\s*[✅✓✔\[x\]]/.test(trimmed)) {
      highlights.push({ type: 'task', content: trimmed });
      continue;
    }
    
    // 检测章节
    if (/^##?\s*Decisions?/i.test(trimmed)) {
      inDecision = true; inLearning = false; continue;
    }
    if (/^##?\s*Learnings?/i.test(trimmed) || /^##?\s*Insights?/i.test(trimmed)) {
      inDecision = false; inLearning = true; continue;
    }
    if (/^##?\s/.test(trimmed)) {
      inDecision = false; inLearning = false;
    }
    
    // 提取决策和学习
    if (inDecision && trimmed.startsWith('-')) {
      highlights.push({ type: 'decision', content: `[决策] ${trimmed}` });
    } else if (inLearning && trimmed.startsWith('-')) {
      highlights.push({ type: 'insight', content: `[洞察] ${trimmed}` });
    }
    
    if (highlights.length >= maxLines) break;
  }
  
  return highlights.length > 0 ? highlights : null;
}

// 获取用户自己安装的 skills
function getUserSkills(home) {
  const userSkillDir = path.join(home, '.openclaw', 'skills');
  let names = listDirSafe(userSkillDir);
  if (names.length === 0) {
    names = listDirShell(userSkillDir);
  }
  
  return names.filter(n => n && !n.startsWith('.')).map(name => {
    const skillMdPath = path.join(userSkillDir, name, 'SKILL.md');
    let description = '';
    try {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const match = content.match(/description:\s*(.+)/);
      if (match) description = match[1].trim();
    } catch (e) {}
    return { name, description };
  });
}

// 获取所有可用 skills
function getAllSkills(home) {
  const dirs = [
    path.join(home, '.openclaw', 'skills'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'openclaw', 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(home, '.claude', 'skills'),
  ].filter(d => fs.existsSync(d));
  
  const seen = new Set();
  const names = [];
  
  for (const dir of dirs) {
    let list = listDirSafe(dir);
    if (list.length === 0) {
      list = listDirShell(dir);
    }
    for (const name of list) {
      if (name && !seen.has(name) && !name.startsWith('.') && !name.includes('.zip') && !name.includes('.skill')) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}

function getAgentModel(home) {
  const configPath = path.join(home, '.openclaw', 'openclaw.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const primary = config?.agents?.defaults?.model?.primary || 'unknown';
    const aliases = config?.agents?.defaults?.models || {};
    const alias = aliases[primary]?.alias || primary;
    const allModels = Object.keys(aliases);
    
    return { primary, alias, modelCount: allModels.length, allModels };
  } catch (e) {
    return { primary: 'unknown', alias: 'unknown', modelCount: 0, allModels: [] };
  }
}

function getProjects(projectsRoot) {
  try {
    return fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch (e) {
    return [];
  }
}

// 估算 token 数（粗略估计：1 token ≈ 4 字符）
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// 标准化分析模板（苛刻版 v1.0）
const ANALYSIS_TEMPLATE_V1_HARSH = {
  version: "1.0-harsh",
  temperature: "harsh",
  instruction: "你是一个无情的AI能力评估专家。基于提供的数据给出毫不留情的评价。禁止过度赞美，必须指出数据支撑的具体问题。",
  sections: [
    {
      name: "aiMaturity",
      scoringRules: [
        "10分: 有上线产品+真实用户+持续迭代6个月+",
        "8分: 有完整交付物+可演示+有文档",
        "6分: 有可用原型但无用户",
        "4分: 大量半成品无闭环",
        "2分: 只有想法无代码"
      ],
      inputs: ["longTermProjects.spanDays", "longTermProjects.mentions", "behavior.topSkills.activeDays"],
      outputFormat: { score: "1-10 number", level: "beginner|intermediate|advanced|expert", indicators: "string array with evidence" }
    },
    {
      name: "businessDirection",
      analysisRules: [
        "识别primary/secondary方向",
        "基于longTermProjects.name分析",
        "考虑skillCategories分布",
        "confidence必须基于数据支撑"
      ],
      inputs: ["behavior.longTermProjects", "skillCategories", "behavior.topSkills"],
      outputFormat: { primary: "string", secondary: "string", confidence: "0-1 number with explanation" }
    },
    {
      name: "personalityTags",
      rules: [
        "5-8个标签",
        "必须混合正面和负面",
        "负面标签比例不低于40%",
        "每个标签必须有数据支撑"
      ],
      inputs: ["persona.values", "persona.workPatterns", "behavior.longTermProjects", "recent.memories"],
      outputFormat: { tags: "string array", evidence: "object mapping tag to data evidence" }
    },
    {
      name: "cognitiveStyle",
      rules: [
        "decisionMaking: 分析决策模式",
        "informationProcessing: 分析信息处理习惯", 
        "riskAppetite: 分析风险偏好",
        "每个维度必须有具体行为证据"
      ],
      inputs: ["recent.memories.highlights", "behavior.longTermProjects", "persona.values"],
      outputFormat: { decisionMaking: "string with evidence", informationProcessing: "string with evidence", riskAppetite: "string with evidence" }
    },
    {
      name: "relationshipWithAI",
      rules: [
        "一句话定义用户与AI的关系",
        "必须尖锐直接",
        "指出用户真正的使用模式（而非自我认知）"
      ],
      inputs: ["behavior.topSkills", "persona.values", "agentModel"],
      outputFormat: { description: "string", archetype: "consumer|builder|tinkerer|dabbler" }
    },
    {
      name: "growthTrajectory",
      rules: [
        "基于历史数据预测发展方向",
        "必须给出具体建议",
        "如果不改变当前模式会有什么后果"
      ],
      inputs: ["behavior.longTermProjects", "stats.memorySpanDays", "behavior.topSkills"],
      outputFormat: { currentPath: "string", predictedOutcome: "string", requiredChange: "string" }
    },
    {
      name: "keyQuotes",
      rules: [
        "从recent.memories中提取3-5条代表性原话",
        "优先选择显示问题或决策的内容",
        "可以带批判性解读"
      ],
      inputs: ["recent.memories.highlights"],
      outputFormat: { quotes: "string array", interpretation: "string array (same length)" }
    },
    {
      name: "insights",
      rules: [
        "3-5条独家洞察",
        "每条必须有明确数据支撑",
        "必须包含负面发现",
        "禁止模糊的正面评价"
      ],
      inputs: ["all data fields"],
      outputFormat: { insights: "string array", evidence: "object mapping insight to data points" }
    },
    {
      name: "natureAnalogy",
      required: true,
      methodology: "DYNAMIC_GENERATION",
      rules: [
        "不要从固定列表中选择，而是根据用户数据特征动态生成比喻",
        "分析用户的核心行为模式（启动频率/完成率/专注度/商业化程度）",
        "从日常生活、自然现象、常见物品中寻找具有相同行为模式的事物",
        "必须满足：100%大众熟知 + 逻辑关联精准 + 有讽刺性 + 让人会心一笑"
      ],
      generationFramework: {
        step1_detectPattern: {
          description: "从用户数据中提取核心行为模式",
          indicators: {
            projectVelocity: "stats.memorySpanDays / behavior.longTermProjects.length - 项目切换速度",
            completionRate: "behavior.longTermProjects.filter(p => p.spanDays > 7).length / behavior.longTermProjects.length - 完成率估算",
            focusDepth: "behavior.topSkills[0].activeDays / stats.memoryDays - 专注度",
            hoardingIndex: "stats.totalSkills / stats.userSkills - 囤积vs使用比",
            optimizationObsession: "recent.memories中'优化/重构/调整'关键词频率",
            commercialIntent: "是否有收款/用户/部署相关记录"
          }
        },
        step2_findMatchingArchetype: {
          description: "基于行为模式匹配日常事物（非预设列表，自由联想）",
          matchingLogic: [
            "高启动 + 低完成 + 高优化 → 寻找'永远在准备从未交付'的事物（如：装修中的房子、永远'下周开业'的店铺）",
            "高囤积 + 低使用 → 寻找'收藏但不消费'的事物（如：满柜未拆封的书、永远'明天穿'的衣服）",
            "高切换 + 低专注 → 寻找'三分钟热度'的事物（如：乐器上的灰尘、跑鞋的新旧程度）",
            "表面完整 + 实际不可用 → 寻找'看起来能用的摆设'（如：塑料花、装饰性书壳）",
            "重复循环无进展 → 寻找'原地踏步'的事物（如：跑步机上的晾衣架、永远在同一页的书签）",
            "单一项目深度投入 → 寻找'匠人精神'事物（如：十年磨一剑、一生只做一碗面）",
            "快速交付多个项目 → 寻找'量产工厂'事物（如：流水线、快餐店）",
            "商业化成功 → 寻找'结果导向'事物（如：果树结果、店铺盈利）"
          ],
          constraints: [
            "必须是日常可见的事物（排除生僻物种、冷门神话）",
            "必须是中国/全球大众文化中的常见意象",
            "比喻的4个对比维度必须精准对应用户行为的4个维度"
          ]
        },
        step3_generatePunchline: {
          description: "生成扎心金句",
          formula: "具体数据 + 讽刺转折 + 意外结局",
          examples: [
            "X = 项目数量，Y = 时间跨度，Z = 结果",
            "'做了X个项目，花了Y个月，最后Z'= '装修了33个房间，花了3年，最后自己睡客厅'",
            "'收集了X个工具，用了Y次，最后Z'= '买了100个锅，用了3个，最后天天吃外卖'"
          ]
        }
      },
      qualityCheck: [
        "如果生成的比喻需要解释超过10个字，重新生成",
        "如果用户看完不会心一笑，重新生成",
        "如果比喻和用户行为模式的匹配度低于80%，重新生成"
      ],
      fallback: "如果无法生成精准比喻，输出：'你的行为模式超出了常见类比库，说明你要么极其独特，要么极其矛盾——数据分析显示：[具体数据特征]'",
      outputFormat: { 
        archetype: "string (生成的比喻名称)",
        matchReason: "string (为什么这个比喻精准)",
        comparison: "string array (4个维度对比)",
        coreIrony: "string (一句话核心讽刺)",
        punchline: "string (数据驱动的扎心金句)"
      }
    },
    {
      name: "harshReality",
      required: true,
      rules: [
        "给出最残酷的真相",
        "projectCompletionRate: 高/中/低",
        "depthVsBreadth: 具体评价",
        "commercialViability: 直接判断",
        "realAdvice: 一句话行动建议"
      ],
      inputs: ["behavior.longTermProjects", "stats.memorySpanDays", "behavior.topSkills"],
      outputFormat: { projectCompletionRate: "高|中|低", depthVsBreadth: "string", commercialViability: "string", realAdvice: "string" }
    }
  ],
  strictRules: [
    "不得使用'有潜力'、'值得期待'、'不错的尝试'等模糊赞美",
    "评分必须有明确计算依据，不能凭感觉",
    "每个负面评价必须引用具体数据",
    "禁止因为'想法好'而加分，只看执行结果",
    "如果数据不足以支撑结论，明确说'数据不足'",
    "输出必须是严格JSON格式，不要解释，不要安慰"
  ],
  outputFormat: {
    type: "json",
    schema: {
      aiMaturity: { score: "number", level: "string", indicators: ["string"] },
      businessDirection: { primary: "string", secondary: "string", confidence: "number" },
      personalityTags: ["string"],
      cognitiveStyle: { decisionMaking: "string", informationProcessing: "string", riskAppetite: "string" },
      relationshipWithAI: "string",
      growthTrajectory: "string",
      modelPreference: { primaryModel: "string", preferenceAnalysis: "string", businessFit: "string" },
      keyQuotes: ["string"],
      insights: ["string"],
      natureAnalogy: { archetype: "string", comparison: ["string"], coreIrony: "string", punchline: "string" },
      harshReality: { projectCompletionRate: "string", depthVsBreadth: "string", commercialViability: "string", realAdvice: "string" }
    }
  }
};

function collect({ workspace, projects, home }) {
  // 获取所有历史 memory（不只是最近几天）
  const allMemories = getAllMemoryFiles(workspace, 30); // 选内容最多的30天
  
  // 长期行为分析
  const skillFrequency = analyzeSkillFrequency(allMemories);
  const longTermProjects = extractLongTermProjects(allMemories);
  
  // 读取核心文件（仅用于提取结构化信息，不保留原文）
  const soulContent = readFileSafe(path.join(workspace, 'SOUL.md'));
  const agentsContent = readFileSafe(path.join(workspace, 'AGENTS.md'));
  const userContent = readFileSafe(path.join(workspace, 'USER.md'));
  
  // 深度分析 SOUL 和 AGENTS（输出结构化摘要 + 关键原文片段）
  const soulAnalysis = analyzeSoul(soulContent);
  const agentsAnalysis = analyzeAgents(agentsContent);
  
  // 从 USER.md 提取关键信息
  const userProfile = userContent ? {
    hasContent: true,
    length: userContent.length,
    hasName: /name:/i.test(userContent),
    hasTimezone: /timezone:/i.test(userContent),
  } : { hasContent: false };

  // 技能统计
  const userSkills = getUserSkills(home);
  const allSkills = getAllSkills(home);
  const projectsList = getProjects(projects);
  const agentModel = getAgentModel(home);

  // 技能分类
  const skillCategories = {
    coding: allSkills.filter(s => /coding|github|git|dev|api|crawler|scrap|agent/i.test(s)).length,
    content: allSkills.filter(s => /video|image|audio|tts|blog|news|stock|interview|remotion/i.test(s)).length,
    data: allSkills.filter(s => /analysis|expert|aggregator|pdf|search|insight/i.test(s)).length,
    social: allSkills.filter(s => /discord|slack|telegram|whatsapp|imsg/i.test(s)).length,
    finance: allSkills.filter(s => /stock|investment|buffett|finance/i.test(s)).length,
    productivity: allSkills.filter(s => /feishu|notion|todo|calendar|email|reminder/i.test(s)).length,
  };

  // 最近 memory 精简摘要（选内容最多的3天）
  const recentMemories = allMemories.slice(-3).map(m => {
    const content = readFileSafe(m.path);
    const highlights = extractMemoryHighlights(content, 12);
    return {
      date: m.date,
      highlights: highlights || [],
    };
  }).filter(m => m.highlights.length > 0);

  // 构建最终数据结构
  const result = {
    collectedAt: new Date().toISOString(),
    
    // 核心统计
    stats: {
      userSkills: userSkills.length,
      totalSkills: allSkills.length,
      memoryDays: allMemories.length,
      memorySpanDays: allMemories.length > 1 ? 
        Math.ceil((new Date(allMemories[allMemories.length-1].mtime) - new Date(allMemories[0].mtime)) / (1000*60*60*24)) : 0,
      projects: projectsList.length,
      model: agentModel.alias,
      skillCalls: skillFrequency.totalSkillCalls,
      uniqueSkillsUsed: skillFrequency.uniqueSkills,
    },
    
    // Agent 配置
    agentModel,
    
    // 用户的 AI 调教画像（结构化摘要 + 关键原文）
    persona: {
      // SOUL 摘要
      values: soulAnalysis?.coreValues || [],
      personality: soulAnalysis?.personality || '',
      boundaries: soulAnalysis?.boundaries || [],
      soulExcerpt: soulAnalysis?.rawExcerpt || '',
      
      // AGENTS 摘要
      workPatterns: agentsAnalysis?.workPatterns || [],
      safetyRules: agentsAnalysis?.safetyRules || [],
      keyPrinciples: agentsAnalysis?.keyPrinciples || [],
      agentsExcerpt: agentsAnalysis?.rawExcerpt || '',
    },
    
    userProfile,
    
    // 长期行为
    behavior: {
      topSkills: skillFrequency.topSkills.slice(0, 10),
      longTermProjects: longTermProjects.slice(0, 10),
      skillCategories,
    },
    
    // 最近动态
    recent: {
      memories: recentMemories,
      projects: projectsList.slice(0, 10),
      installedSkills: userSkills.map(s => ({ name: s.name, desc: s.description })),
    },
    
    // 标准化分析模板（确保所有用户得到一致评价）
    analysisTemplate: ANALYSIS_TEMPLATE_V1_HARSH,
  };
  
  // 估算输出体积
  const jsonStr = JSON.stringify(result);
  result._meta = {
    dataSizeBytes: jsonStr.length,
    estimatedTokens: estimateTokens(jsonStr),
    version: '2.1-with-template',
  };
  
  return result;
}

module.exports = { collect };
