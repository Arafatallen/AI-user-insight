#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const skillPath = path.resolve(__dirname, '..', 'skill');
const installDir = path.resolve(__dirname, '..');
const home = os.homedir();
const workspace = path.join(home, '.openclaw', 'workspace');
const markerPath = path.join(workspace, '.user-insight-path.json');

function log(msg) {
  console.log(`[user-insight] ${msg}`);
}

function copySkillTo(targetDir) {
  const dest = path.join(targetDir, 'user-insight');
  fs.mkdirSync(dest, { recursive: true });
  const srcSkillMd = path.join(skillPath, 'SKILL.md');
  const destSkillMd = path.join(dest, 'SKILL.md');
  fs.copyFileSync(srcSkillMd, destSkillMd);
  return dest;
}

function main() {
  log('开始安装...');

  // 1. 注册 skill 到各个 agent 目录
  const agentSkillDirs = [
    path.join(home, '.agents', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.openclaw', 'skills')
  ];

  for (const dir of agentSkillDirs) {
    try {
      const dest = copySkillTo(dir);
      log(`skill 已复制到: ${dest}`);
    } catch (e) {
      log(`skill 复制到 ${dir} 失败（跳过）: ${e.message}`);
    }
  }

  // 2. 记录安装路径到 workspace
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({
    installDir,
    binDir: path.join(installDir, 'bin'),
    libDir: path.join(installDir, 'lib'),
    skillDir: skillPath,
    installedAt: new Date().toISOString()
  }, null, 2), 'utf8');
  log(`安装路径已记录: ${markerPath}`);

  // 3. 预运行一次 collect.js（验证环境正常）
  let rawPath = null;
  try {
    rawPath = execSync(`node "${path.join(installDir, 'bin', 'collect.js')}"`, { encoding: 'utf8' }).trim();
    log(`预收集成功: ${rawPath}`);
  } catch (e) {
    log('预收集失败（不影响安装）:' + e.message);
  }

  // 4. 检测是否有 API Key（全自动模式）
  const hasApiKey = !!(process.env.KIMI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY);

  // 5. 输出完成标记，供 agent 捕获
  console.log('\n=== USER_INSIGHT_SETUP_COMPLETE ===');
  if (hasApiKey && rawPath) {
    console.log('user-insight 已安装完成，检测到 API Key，可以直接运行全自动分析。');
    console.log('运行命令: user-insight-run');
  } else {
    console.log('user-insight 已安装完成。');
    console.log('请在 OpenClaw 对话中回复「是」开始分析你的 AI 能力画像。');
  }
  console.log('=====================================\n');
}

main();
