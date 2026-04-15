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

// 获取所有历史 memory 文件（不只是最近几天）
function getAllMemoryFiles(workspace, maxFiles = 90) {
  const memDir = path.join(workspace, 'memory');
  try {
    const entries = fs.readdirSync(memDir, { withFileTypes: true });
    return entries
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
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, maxFiles);
  } catch (e) {
    return [];
  }
}

// 从 memory 内容中提取 skill 调用
function extractSkillUsage(content) {
  if (!content) return [];
  const skills = [];
  
  // 匹配 skill 调用模式
  const patterns = [
    // ## skill-name 章节
    /^##?\s+([\w-]+)(?:\s*-\s*.*)?$/gim,
    // [skill-name] 标记
    /\[([\w-]+)\]/g,
    // 使用了 xxx skill
    /使用[了过]?\s*["']?([\w-]+)["']?\s*(?:skill|工具)/gi,
    // 调用 xxx
    /调用[了过]?\s*["']?([\w-]+)["']?/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const skillName = match[1]?.toLowerCase().trim();
      if (skillName && skillName.length > 2 && !['the', 'and', 'for', 'notes', 'tasks', 'morning', 'afternoon', 'evening'].includes(skillName)) {
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

// 分析 SOUL.md - 提取价值观和调教方向（保留关键原文片段）
function analyzeSoul(soulContent) {
  if (!soulContent) return null;
  
  const analysis = {
    coreValues: [],
    personality: '',
    boundaries: [],
    rawExcerpt: '',
  };
  
  // 提取核心价值观（通常是粗体列表项）
  const valueMatches = soulContent.match(/^\*\*([^*]+)\*\*/gm);
  if (valueMatches) {
    analysis.coreValues = valueMatches
      .map(v => v.replace(/^\*\*|\*\*$/g, '').trim())
      .filter(v => v.length > 5 && v.length < 100)
      .slice(0, 5);
  }
  
  // 提取 Vibe / Personality
  const vibeMatch = soulContent.match(/## Vibe\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (vibeMatch) {
    analysis.personality = vibeMatch[1].trim().slice(0, 200);
  }
  
  // 提取边界
  const boundaryMatch = soulContent.match(/## Boundaries\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (boundaryMatch) {
    const lines = boundaryMatch[1].match(/^[-*]\s*(.+)$/gm);
    if (lines) {
      analysis.boundaries = lines
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .slice(0, 4);
    }
  }
  
  // 保留 SOUL 前 500 字符作为原文参考
  analysis.rawExcerpt = soulContent.slice(0, 500) + (soulContent.length > 500 ? '...' : '');
  
  return analysis;
}

// 分析 AGENTS.md - 提取使用习惯和工作模式
function analyzeAgents(agentsContent) {
  if (!agentsContent) return null;
  
  const analysis = {
    workPatterns: [],
    safetyRules: [],
    keyPrinciples: [],
    rawExcerpt: '',
  };
  
  // 提取主要章节标题作为工作模式
  const sectionMatches = agentsContent.match(/^##\s+(.+)$/gm);
  if (sectionMatches) {
    analysis.workPatterns = sectionMatches
      .map(s => s.replace(/^##\s*/, '').trim())
      .filter(s => !s.startsWith('#') && s.length < 50)
      .slice(0, 8);
  }
  
  // 提取安全规则
  const safetyMatch = agentsContent.match(/## Safety\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (safetyMatch) {
    const lines = safetyMatch[1].match(/^[-*]\s*(.+)$/gm);
    if (lines) {
      analysis.safetyRules = lines
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .slice(0, 4);
    }
  }
  
  // 提取关键原则（Don't / Never / Always 开头的句子）
  const principles = agentsContent.match(/^(?:Don't|Never|Always|Be)\s+[^.]+/gim);
  if (principles) {
    analysis.keyPrinciples = principles.slice(0, 5);
  }
  
  // 保留 AGENTS 关键段落（Safety + External vs Internal）
  const safetySection = agentsContent.match(/## Safety[\s\S]*?(?=\n##|$)/);
  const externalSection = agentsContent.match(/## External vs Internal[\s\S]*?(?=\n##|$)/);
  const groupChatSection = agentsContent.match(/## Group Chats[\s\S]*?(?=\n##|$)/);
  
  let excerpt = '';
  if (safetySection) excerpt += safetySection[0].slice(0, 600) + '\n\n';
  if (externalSection) excerpt += externalSection[0].slice(0, 600) + '\n\n';
  if (groupChatSection) excerpt += groupChatSection[0].slice(0, 400);
  
  analysis.rawExcerpt = excerpt.slice(0, 1500);
  
  return analysis;
}

// 智能提取 memory 文件的关键信息
function extractMemoryHighlights(content, maxLines = 15) {
  if (!content) return null;
  const lines = content.split('\n');
  const highlights = [];
  let inDecision = false;
  let inLearning = false;
  
  for (const line of lines.slice(0, 100)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 提取完成任务
    if (/^[-*]\s*[✅✓✔\[x\]]/.test(trimmed)) {
      highlights.push({ type: 'task', content: trimmed.slice(0, 100) });
      continue;
    }
    
    // 检测决策章节
    if (/^##?\s*Decisions?/i.test(trimmed)) {
      inDecision = true; inLearning = false; continue;
    }
    // 检测洞察章节
    if (/^##?\s*(Learnings?|Insights?)/i.test(trimmed)) {
      inDecision = false; inLearning = true; continue;
    }
    if (/^##?\s/.test(trimmed)) {
      inDecision = false; inLearning = false;
    }
    
    // 提取决策和学习（限制长度）
    if ((inDecision || inLearning) && trimmed.startsWith('-')) {
      const prefix = inDecision ? '[决策]' : '[洞察]';
      highlights.push({ type: inDecision ? 'decision' : 'insight', content: prefix + ' ' + trimmed.slice(0, 100) });
    }
    
    if (highlights.length >= maxLines) break;
  }
  
  return highlights;
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
    return { name, description: description.slice(0, 100) };
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

function collect({ workspace, projects, home }) {
  // 获取所有历史 memory
  const allMemories = getAllMemoryFiles(workspace, 90);
  
  // 长期行为分析
  const skillFrequency = analyzeSkillFrequency(allMemories);
  const longTermProjects = extractLongTermProjects(allMemories);
  
  // 读取并分析核心文件
  const soulContent = readFileSafe(path.join(workspace, 'SOUL.md'));
  const agentsContent = readFileSafe(path.join(workspace, 'AGENTS.md'));
  const userContent = readFileSafe(path.join(workspace, 'USER.md'));
  
  const soulAnalysis = analyzeSoul(soulContent);
  const agentsAnalysis = analyzeAgents(agentsContent);
  
  // 从 USER.md 提取关键信息
  const userProfile = userContent ? {
    hasContent: userContent.length > 50,
    hasName: /name:\s*\w+/i.test(userContent),
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

  // 最近 memory 精简摘要
  const recentMemories = allMemories.slice(0, 3).map(m => {
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
        Math.ceil((new Date(allMemories[0].mtime) - new Date(allMemories[allMemories.length-1].mtime)) / (1000*60*60*24)) : 0,
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
  };
  
  // 估算输出体积
  const jsonStr = JSON.stringify(result);
  result._meta = {
    dataSizeBytes: jsonStr.length,
    estimatedTokens: estimateTokens(jsonStr),
    version: '2.0-optimized',
  };
  
  return result;
}

module.exports = { collect };
