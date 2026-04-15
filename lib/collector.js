const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

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

// 智能提取 memory 文件的关键信息
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
  
  // 先尝试 fs 方法，失败则使用 shell
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

function getMemoryFiles(workspace) {
  const memDir = path.join(workspace, 'memory');
  try {
    const entries = fs.readdirSync(memDir, { withFileTypes: true });
    const files = entries
      .filter(f => f.isFile() && f.name.endsWith('.md') && /^\d{4}-\d{2}-\d{2}/.test(f.name))
      .map(f => {
        const fp = path.join(memDir, f.name);
        const stat = fs.statSync(fp);
        return { name: f.name, mtime: stat.mtime, size: stat.size, path: fp };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 7);

    return files.map(f => {
      const content = readFileSafe(f.path);
      return {
        date: f.name.replace('.md', ''),
        highlights: extractMemoryHighlights(content, 25),
        size: f.size
      };
    }).filter(f => f.highlights);
  } catch (e) {
    return [];
  }
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
      .map(d => d.name)
      .slice(0, 30);
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
  const coreFiles = {
    agents: getCoreContent(workspace, 'AGENTS.md', 40000),
    soul: getCoreContent(workspace, 'SOUL.md', 20000),
    user: getCoreContent(workspace, 'USER.md', 15000),
    memory: getCoreContent(workspace, 'MEMORY.md', 20000),
    heartbeat: getCoreContent(workspace, 'HEARTBEAT.md', 10000),
    tools: getCoreContent(workspace, 'TOOLS.md', 15000),
    identity: getCoreContent(workspace, 'IDENTITY.md', 5000),
  };

  const userSkills = getUserSkills(home);
  const allSkills = getAllSkills(home);
  const recentMemories = getMemoryFiles(workspace);
  const projectsList = getProjects(projects);
  const agentModel = getAgentModel(home);

  const skillCategories = {
    coding: allSkills.filter(s => /coding|github|git|dev|api|crawler|scrap/i.test(s)).length,
    content: allSkills.filter(s => /video|image|audio|tts|blog|news|stock|interview|remotion/i.test(s)).length,
    data: allSkills.filter(s => /analysis|expert|aggregator|pdf|search/i.test(s)).length,
    social: allSkills.filter(s => /discord|slack|telegram|whatsapp|imsg/i.test(s)).length,
    finance: allSkills.filter(s => /stock|investment|buffett|finance/i.test(s)).length,
    productivity: allSkills.filter(s => /feishu|notion|todo|calendar|email|reminder/i.test(s)).length,
  };

  return {
    collectedAt: new Date().toISOString(),
    stats: {
      userSkills: userSkills.length,
      totalSkills: allSkills.length,
      memoryFiles: recentMemories.length,
      projects: projectsList.length,
      model: agentModel.alias,
    },
    agentModel,
    coreFiles,
    userSkills,
    recentMemories,
    skillCategories,
    topSkills: allSkills.slice(0, 30),
    recentProjects: projectsList.slice(0, 15),
  };
}

module.exports = { collect };
