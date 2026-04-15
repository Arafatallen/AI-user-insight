#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const home = os.homedir();
const installDir = path.resolve(__dirname, '..');
const workspace = path.join(home, '.openclaw', 'workspace');
const outputDir = path.join(workspace, 'user-insight-reports');

function log(msg) {
  console.log(`[user-insight-run] ${msg}`);
}

function main() {
  // 检查 API Key
  const hasKimi = !!process.env.KIMI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
  
  if (!hasKimi && !hasOpenAI && !hasDeepSeek) {
    console.error('[user-insight-run] 错误：未检测到任何 LLM API Key');
    console.error('请设置 KIMI_API_KEY、OPENAI_API_KEY 或 DEEPSEEK_API_KEY 后重试');
    console.error('或者使用 agent 模式：在 OpenClaw 对话中回复「是」开始分析');
    process.exit(1);
  }

  log('开始全自动分析流程...');

  // Step 1: 收集数据
  log('Step 1/3: 收集 workspace 数据...');
  let rawPath;
  try {
    rawPath = execSync(`node "${path.join(installDir, 'bin', 'collect.js')}"`, { encoding: 'utf8' }).trim();
    log(`数据已保存: ${rawPath}`);
  } catch (e) {
    console.error('[user-insight-run] 数据收集失败:', e.message);
    process.exit(1);
  }

  // Step 2: 分析数据（调用外部 API）
  log('Step 2/3: AI 分析数据...');
  const { analyze } = require('../lib/analyzer');
  const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  
  analyze(rawData).then(analysis => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const analysisPath = path.join(outputDir, `analysis-${timestamp}.json`);
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf8');
    log(`分析结果已保存: ${analysisPath}`);

    // Step 3: 生成报告
    log('Step 3/3: 生成 HTML 报告...');
    try {
      const htmlPath = execSync(
        `node "${path.join(installDir, 'bin', 'report.js')}" "${analysisPath}" "${rawPath}"`,
        { encoding: 'utf8' }
      ).trim();
      log(`报告已生成: ${htmlPath}`);
      console.log('\n=== USER_INSIGHT_COMPLETE ===');
      console.log(`报告地址: ${htmlPath}`);
      console.log('=============================');
    } catch (e) {
      console.error('[user-insight-run] 报告生成失败:', e.message);
      process.exit(1);
    }
  }).catch(err => {
    console.error('[user-insight-run] AI 分析失败:', err.message);
    process.exit(1);
  });
}

main();
