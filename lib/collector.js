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
      rules: [
        "从自然界或生活中找一个物种、植物、物体或现象来对照用户行为",
        "必须精准反映用户的核心特征（启动模式、完成度、优化习惯、商业价值）",
        "选择依据必须基于数据（如项目跨度、完成率、技能分布等）",
        "必须尖锐但幽默，让人会心一笑",
        "给出核心讽刺点（一句话）和结尾扎心金句"
      ],
      options: [
        {
          archetype: "装修中的房子（House Under Renovation）",
          matchCondition: "永远在优化+从未入住+展示性质",
          familiarity: "common",
          comparison: [
            "不断换装修风格 = 持续切换技术栈",
            "家具搬来搬去 = 反复重构代码结构", 
            "客人只能参观 = 项目只能演示不能商用",
            "房主自己不住 = 开发者自己不用自己的产品"
          ],
          coreIrony: "它看起来是家，其实是个永不停工的工地。",
          punchline: "一栋装修了33个月的房子，每个房间都很完美——除了没人能住进去。"
        },
        {
          archetype: "松鼠（Squirrel）",
          matchCondition: "囤积skills多+项目分散+遗忘式放弃",
          familiarity: "common",
          comparison: [
            "到处埋松果 = 到处启动项目",
            "埋了忘记在哪 = 项目启动后遗忘",
            "囤积从不吃 = 工具收集但从不产出",
            "冬天饿死 = 关键时刻没有完成品可用"
          ],
          coreIrony: "它忙着为冬天储备，却忘了自己埋在哪。",
          punchline: "一只在秋天很忙、在冬天很慌的松鼠，藏了100个松果，最后饿死了。"
        },
        {
          archetype: "含羞草（Mimosa）",
          matchCondition: "遇到真正困难就退缩+频繁切换项目",
          familiarity: "common",
          comparison: [
            "一碰就闭合 = 遇到难点立即退缩",
            "叶子快速收起 = 项目遇到阻力秒放弃",
            "表面敏感防御 = 用新项目逃避困难",
            "从不真正生长 = 无法突破舒适区"
          ],
          coreIrony: "它对刺激反应过度，却忘了自己要长大。",
          punchline: "一株含羞草，碰一下就缩起来——碰了33次，还在原地。"
        },
        {
          archetype: "昙花（Epiphyllum）",
          matchCondition: "项目启动惊艳+完成度极低+存在时间极短",
          familiarity: "common",
          comparison: [
            "夜间短暂绽放 = 项目启动时惊艳",
            "花期仅4小时 = 项目存活时间极短",
            "美丽但无用 = 好看却无法持续",
            "人们只能拍照 = 没人能真正使用"
          ],
          coreIrony: "它把全部能量用来绽放，却忘了要结果。",
          punchline: "一朵昙花，开了33次，每次都说'这次一定结果'——现在还是一朵花。"
        },
        {
          archetype: "仓鼠跑轮（Hamster Wheel）",
          matchCondition: "重复性工作+无意义的循环+看起来很忙",
          familiarity: "common",
          comparison: [
            "疯狂奔跑 = 看起来很忙",
            "原地不动 = 实际上没有前进",
            "越跑越累 = 技术债务累积",
            "无法停下 = 陷入无限优化循环"
          ],
          coreIrony: "它以为自己在前进，其实只是在原地流汗。",
          punchline: "一只仓鼠跑了33天，每天都说'今天跑得更有效率了'——笼子还在原地，它也还在原地。"
        },
        {
          archetype: "陨石（Meteor）",
          matchCondition: "项目启动时轰动+快速燃烧殆尽+留下坑洞",
          familiarity: "common",
          comparison: [
            "进入大气层时闪亮 = 启动时高调宣布",
            "燃烧成灰烬 = 热情迅速耗尽",
            "落地成坑 = 留下技术债务",
            " nobody remembers = 没人记得它来过"
          ],
          coreIrony: "它以为自己在发光，其实只是在燃烧自己。",
          punchline: "一颗陨石，划过天空33次，每次都说'这次不一样'——现在地上有33个坑，天上没有星。"
        },
        {
          archetype: "健身房会员卡（Gym Membership）",
          matchCondition: "付费/投入后不使用+仪式感大于行动+持续续费但不出现",
          familiarity: "common",
          comparison: [
            "办卡时热血沸腾 = 启动项目时雄心勃勃",
            "只去了一次 = 项目只写了Hello World",
            "续费只为心安 = 持续投入时间但不产出",
            "身材永远不变 = 技术能力没有实质提升"
          ],
          coreIrony: "它买的不是健身服务，是'我会变好的'幻觉。",
          punchline: "一张续了33个月的健身卡，去了3次——店主认识你，你的脂肪也认识你。"
        },
        {
          archetype: "收藏夹里的'稍后阅读'（Read It Later）",
          matchCondition: "不断添加+永久堆积+从不查看+自我安慰",
          familiarity: "common",
          comparison: [
            "看到就收藏 = 想到就启动项目",
            "收藏即遗忘 = 添加后永不再看",
            "数量越多越焦虑 = 项目越多压力越大",
            "'稍后'变成'永不' = '下周完成'变成'明年再说'"
          ],
          coreIrony: "收藏行为给了自己'已处理'的错觉，实际上只是转移了注意力。",
          punchline: "一个收藏夹里有333篇文章，标记为'稍后阅读'——最早的一篇是3年前的，你至今'稍后'了1095天。"
        },
        {
          archetype: "样板房（Showroom）",
          matchCondition: "表面精美+无法居住+展示性质",
          familiarity: "common",
          comparison: [
            "家具全是塑料 = 代码只能演示不能生产",
            "水龙头不出水 = 功能看似完整实则不通",
            "禁止触碰 = 项目经不起真实使用",
            "只为拍照存在 = 只为发朋友圈，不为住人"
          ],
          coreIrony: "它看起来是房子，其实是个舞台布景。",
          punchline: "一栋样板房，装修了17个房间，每个都很美——但没一个能住人。"
        },
        {
          archetype: "贪吃蛇（Snake Game）",
          matchCondition: "不断吃新项目+身体越来越长+最终撞到自己",
          familiarity: "common",
          comparison: [
            "吃豆子变长 = 项目越来越多",
            "身体臃肿 = 技术债务累积",
            "撞墙/撞自己 = 被自己的项目困住",
            "游戏结束 = 崩溃或放弃"
          ],
          coreIrony: "它以为自己在成长，其实只是在给自己制造障碍。",
          punchline: "一条贪吃蛇，吃了33个项目，身体长到屏幕装不下——最后撞到了自己的尾巴，游戏结束。"
        }
      ],
      selectionGuide: "根据用户数据特征选择最匹配的比喻：项目完成度低+优化多=园丁鸟；囤积多+遗忘=松鼠；启动惊艳+快速消亡=昙花；重复循环=西西弗斯；表面完整+实际不可用=样板房",
      outputFormat: { 
        selectedArchetype: "string",
        matchReason: "string (为什么选这个)",
        comparison: "string array",
        coreIrony: "string",
        punchline: "string"
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
