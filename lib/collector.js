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

// 分析 SOUL.md - 提取价值观和调教方向
function analyzeSoul(soulContent) {
  if (!soulContent) return null;
  
  const analysis = {
    coreValues: [],
    personality: '',
    boundaries: [],
    evolutionHints: [],
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
  
  return analysis;
}

// 分析 AGENTS.md - 提取使用习惯和工作模式
function analyzeAgents(agentsContent) {
  if (!agentsContent) return null;
  
  const analysis = {
    workPatterns: [],
    safetyRules: [],
    communicationStyle: '',
    preferences: [],
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
  
  // 提取沟通偏好
  const commMatch = agentsContent.match(/(?:respond|speak|group chat|message)[\s\S]*?(?=\n##|$)/i);
  if (commMatch) {
    analysis.communicationStyle = '有明确的群体沟通准则';
  }
  
  // 提取偏好
  const prefMatches = agentsContent.match(/^(?:safe|ask first|don't|never|always)[\s\S]*?$/gim);
  if (prefMatches) {
    analysis.preferences = prefMatches.slice(0, 5);
  }
  
  return analysis;
}

// 智能提取 memory 文件的关键信息（用于最近记录）
function extractMemoryHighlights(content, maxLines = 30) {
  if (!content) return null;
  const lines = content.split('\n');
  const highlights = [];
  let inTask = false;
  let inDecision = false;
  let inLearning = false;
  
  for (const line of lines.slice(0, 150)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 提取完成任务
    if (/^[-*]\s*[✅✓✔\[x\]]/.test(trimmed)) {
      highlights.push(trimmed);
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
      highlights.push(`[决策] ${trimmed}`);
    } else if (inLearning && trimmed.startsWith('-')) {
      highlights.push(`[洞察] ${trimmed}`);
    }
    
    if (highlights.length >= maxLines) break;
  }
  
  return highlights.join('\n') || content.slice(0, 2000);
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

function getCoreContent(workspace, filename, maxLen = 30000) {
  const content = readFileSafe(path.join(workspace, filename));
  if (!content) return null;
  if (content.length > maxLen) {
    return content.slice(0, maxLen) + '\n\n[文件较长，已截断]';
  }
  return content;
}

function collect({ workspace, projects, home }) {
  // 获取所有历史 memory（不只是最近几天）
  const allMemories = getAllMemoryFiles(workspace, 90); // 最多90天
  
  // 长期行为分析
  const skillFrequency = analyzeSkillFrequency(allMemories);
  const longTermProjects = extractLongTermProjects(allMemories);
  
  // 核心文件内容
  const soulContent = getCoreContent(workspace, 'SOUL.md', 20000);
  const agentsContent = getCoreContent(workspace, 'AGENTS.md', 40000);
  
  // 深度分析 SOUL 和 AGENTS
  const soulAnalysis = analyzeSoul(soulContent);
  const agentsAnalysis = analyzeAgents(agentsContent);
  
  // 其他核心文件
  const coreFiles = {
    agents: agentsContent,
    soul: soulContent,
    user: getCoreContent(workspace, 'USER.md', 15000),
    memory: getCoreContent(workspace, 'MEMORY.md', 20000),
    heartbeat: getCoreContent(workspace, 'HEARTBEAT.md', 10000),
    tools: getCoreContent(workspace, 'TOOLS.md', 15000),
    identity: getCoreContent(workspace, 'IDENTITY.md', 5000),
  };

  // 技能统计
  const userSkills = getUserSkills(home);
  const allSkills = getAllSkills(home);
  const projectsList = getProjects(projects);
  const agentModel = getAgentModel(home);

  // 技能分类（基于所有可用技能）
  const skillCategories = {
    coding: allSkills.filter(s => /coding|github|git|dev|api|crawler|scrap|agent/i.test(s)).length,
    content: allSkills.filter(s => /video|image|audio|tts|blog|news|stock|interview|remotion/i.test(s)).length,
    data: allSkills.filter(s => /analysis|expert|aggregator|pdf|search|insight/i.test(s)).length,
    social: allSkills.filter(s => /discord|slack|telegram|whatsapp|imsg/i.test(s)).length,
    finance: allSkills.filter(s => /stock|investment|buffett|finance/i.test(s)).length,
    productivity: allSkills.filter(s => /feishu|notion|todo|calendar|email|reminder/i.test(s)).length,
  };

  // 最近几天的 memory 摘要（用于短期上下文）
  const recentMemories = allMemories.slice(0, 3).map(m => {
    const content = readFileSafe(m.path);
    return {
      date: m.date,
      highlights: extractMemoryHighlights(content, 20),
      size: m.size
    };
  }).filter(m => m.highlights);

  return {
    collectedAt: new Date().toISOString(),
    stats: {
      userSkills: userSkills.length,
      totalSkills: allSkills.length,
      memoryFiles: allMemories.length,
      memorySpanDays: allMemories.length > 0 ? 
        Math.ceil((new Date(allMemories[0].mtime) - new Date(allMemories[allMemories.length-1].mtime)) / (1000*60*60*24)) : 0,
      projects: projectsList.length,
      model: agentModel.alias,
      totalSkillCalls: skillFrequency.totalSkillCalls,
      uniqueSkillsUsed: skillFrequency.uniqueSkills,
    },
    agentModel,
    coreFiles,
    soulAnalysis,
    agentsAnalysis,
    userSkills,
    // 长期行为数据
    longTermBehavior: {
      skillFrequency: skillFrequency.topSkills,
      longTermProjects,
      memoryHistory: allMemories.map(m => ({ date: m.date, size: m.size })),
    },
    // 短期上下文（最近3天）
    recentMemories,
    skillCategories,
    topSkills: allSkills.slice(0, 30),
    recentProjects: projectsList.slice(0, 15),
  };
}

module.exports = { collect };
