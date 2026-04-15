const fs = require('fs');

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generate(analysis, data, outputPath) {
  const score = analysis.aiMaturity?.score || 0;
  const scoreColor = score >= 8 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444';
  
  const tags = (analysis.personalityTags || [])
    .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');
  
  const tools = analysis.toolingStack || {};
  const toolItems = Object.entries(tools)
    .map(([k, v]) => {
      const labels = {
        feishu: '飞书生态',
        codingAgents: '编程代理',
        contentCreation: '内容创作',
        dataAnalysis: '数据分析',
        socialAutomation: '社交自动化',
        financialTools: '金融工具'
      };
      return `<div class="tool-item ${v ? 'active' : 'inactive'}">${escapeHtml(labels[k] || k)}</div>`;
    })
    .join('');
  
  const focusItems = (analysis.recentFocusAreas || [])
    .map(f => `<li>${escapeHtml(f)}</li>`)
    .join('');
  
  const quotes = (analysis.keyQuotes || [])
    .map(q => `<blockquote>"${escapeHtml(q)}"</blockquote>`)
    .join('');
  
  const insights = (analysis.insights || [])
    .map(i => `<div class="insight-card"><div class="insight-icon">💡</div><div>${escapeHtml(i)}</div></div>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Insight - 用户画像报告</title>
<style>
:root{--bg:#f8fafc;--card:#fff;--text:#1e293b;--muted:#64748b;--border:#e2e8f0;--accent:#6366f1;--accent-light:#e0e7ff;}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.container{max-width:900px;margin:0 auto;padding:24px}
header{text-align:center;padding:48px 24px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:16px;margin-bottom:32px;box-shadow:0 10px 30px rgba(99,102,241,.2)}
header .title-line1{font-size:1.2rem;opacity:0.9;margin-bottom:8px}
header .title-line2{font-size:2.5rem;font-weight:800;margin-bottom:12px;text-shadow:0 2px 4px rgba(0,0,0,0.1)}
header .title-line3{font-size:1.1rem;opacity:0.85;font-style:italic;max-width:600px;margin:0 auto;line-height:1.5}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-bottom:24px}
.card{background:var(--card);border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.05);border:1px solid var(--border)}
.card h3{font-size:1rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
.score{font-size:3.5rem;font-weight:800;color:${scoreColor};line-height:1}
.score-label{font-size:.875rem;color:var(--muted);margin-top:4px}
.level-badge{display:inline-block;background:var(--accent-light);color:var(--accent);padding:4px 12px;border-radius:20px;font-size:.875rem;font-weight:600;margin-top:8px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.tag{background:#f1f5f9;color:#334155;padding:6px 14px;border-radius:20px;font-size:.875rem;font-weight:500}
.tool-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
.tool-item{text-align:center;padding:14px;border-radius:10px;font-size:.875rem;font-weight:500;border:1px solid var(--border);transition:.2s}
.tool-item.active{background:var(--accent-light);color:var(--accent);border-color:var(--accent-light)}
.tool-item.inactive{background:#f8fafc;color:var(--muted)}
.section-title{font-size:1.25rem;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
ul.clean{list-style:none;padding:0}
ul.clean li{padding:10px 0;border-bottom:1px solid var(--border)}
ul.clean li:last-child{border-bottom:none}
blockquote{border-left:4px solid var(--accent);background:var(--accent-light);padding:16px 20px;margin:12px 0;border-radius:0 8px 8px 0;color:#3730a3;font-style:italic}
.insight-card{display:flex;gap:12px;align-items:flex-start;background:#f0fdf4;border:1px solid #bbf7d0;padding:16px;border-radius:10px;margin-bottom:12px}
.insight-icon{font-size:1.25rem;flex-shrink:0}
.cognitive-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.cognitive-item{text-align:center;padding:20px;background:#faf5ff;border-radius:10px;border:1px solid #f3e8ff}
.cognitive-item h4{color:#7e22ce;font-size:.875rem;margin-bottom:6px;text-transform:uppercase}
.cognitive-item p{color:#581c87;font-weight:600}
.growth-box{background:#fffbeb;border:1px solid #fde68a;padding:20px;border-radius:10px;color:#92400e}
.relationship-box{background:#eff6ff;border:1px solid #bfdbfe;padding:20px;border-radius:10px;color:#1e40af;text-align:center;font-size:1.125rem;font-weight:600}
footer{text-align:center;padding:32px;color:var(--muted);font-size:.875rem}
.indicators{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.indicator{background:#f1f5f9;color:#475569;padding:4px 10px;border-radius:6px;font-size:.75rem}
.collapse-toggle{color:var(--accent);cursor:pointer;font-size:.875rem;font-weight:500;margin-top:16px;display:inline-block}
.raw-data{display:none;margin-top:16px;background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;font-family:monospace;font-size:.8rem;overflow:auto;max-height:400px;white-space:pre-wrap}
@media(max-width:600px){.tool-grid{grid-template-columns:repeat(2,1fr)}header h1{font-size:1.5rem}}
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="title-line1">你是你，agent是agent</div>
    <div class="title-line2">你+agent=${escapeHtml(analysis.archetype?.name || '未知')}</div>
    <div class="title-line3">${escapeHtml(analysis.archetype?.quote || '暂无评价')}</div>
  </header>

  <div class="grid">
    <div class="card">
      <h3>AI 使用成熟度</h3>
      <div class="score">${score}</div>
      <div class="score-label">满分 10 分</div>
      <div class="level-badge">${escapeHtml(analysis.aiMaturity?.level || 'unknown')}</div>
      <div class="indicators">
        ${(analysis.aiMaturity?.indicators || []).map(i => `<span class="indicator">${escapeHtml(i)}</span>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3>业务方向推断</h3>
      <p style="font-size:1.125rem;font-weight:700;margin-bottom:4px">${escapeHtml(analysis.businessDirection?.primary || '未知')}</p>
      <p style="color:var(--muted);font-size:.875rem">次要方向：${escapeHtml(analysis.businessDirection?.secondary || '未知')}</p>
      <div style="margin-top:12px">
        <div style="background:var(--border);height:6px;border-radius:3px;overflow:hidden">
          <div style="width:${Math.round((analysis.businessDirection?.confidence || 0)*100)}%;background:var(--accent);height:100%"></div>
        </div>
        <p style="font-size:.75rem;color:var(--muted);margin-top:4px">置信度 ${Math.round((analysis.businessDirection?.confidence || 0)*100)}%</p>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <h3>性格与行为标签</h3>
    <div class="tags">${tags}</div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <h3>工具栈画像</h3>
    <div class="tool-grid">${toolItems}</div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <div class="section-title">🎯 最近关注领域</div>
    <ul class="clean">${focusItems}</ul>
  </div>

  <div class="card" style="margin-bottom:24px">
    <div class="section-title">🧠 认知风格</div>
    <div class="cognitive-grid">
      <div class="cognitive-item">
        <h4>决策方式</h4>
        <p>${escapeHtml(analysis.cognitiveStyle?.decisionMaking || '未知')}</p>
      </div>
      <div class="cognitive-item">
        <h4>信息处理</h4>
        <p>${escapeHtml(analysis.cognitiveStyle?.informationProcessing || '未知')}</p>
      </div>
      <div class="cognitive-item">
        <h4>风险偏好</h4>
        <p>${escapeHtml(analysis.cognitiveStyle?.riskAppetite || '未知')}</p>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <div class="section-title">🤖 与 AI 的关系定位</div>
    <div class="relationship-box">${escapeHtml(analysis.relationshipWithAI || '未知')}</div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <div class="section-title">🧪 模型偏好分析</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
      <div style="flex:1;min-width:200px;background:#f5f3ff;border:1px solid #ddd6fe;padding:16px;border-radius:10px">
        <p style="font-size:.75rem;color:#7c3aed;text-transform:uppercase;font-weight:600;margin-bottom:4px">当前默认模型</p>
        <p style="font-size:1.125rem;font-weight:700;color:#5b21b6">${escapeHtml(analysis.modelPreference?.primaryModel || data.agentModel?.alias || data.agentModel?.primary || '未知')}</p>
      </div>
    </div>
    <div class="growth-box" style="background:#f5f3ff;border-color:#ddd6fe;color:#5b21b6;margin-bottom:12px">
      <strong>偏好分析：</strong> ${escapeHtml(analysis.modelPreference?.preferenceAnalysis || '未提供')}
    </div>
    <div class="growth-box" style="background:#faf5ff;border-color:#f3e8fe;color:#7e22ce">
      <strong>业务匹配度：</strong> ${escapeHtml(analysis.modelPreference?.businessFit || '未提供')}
    </div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <div class="section-title">📈 成长轨迹</div>
    <div class="growth-box">${escapeHtml(analysis.growthTrajectory || '未知')}</div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <div class="section-title">💬 关键原话</div>
    ${quotes}
  </div>

  <div class="card" style="margin-bottom:24px">
    <div class="section-title">🔍 分析师洞察</div>
    ${insights}
  </div>

  <div class="card">
    <div class="section-title">📊 原始数据摘要</div>
    <p style="color:var(--muted);font-size:.875rem">
      记忆文件：${data.stats?.memories ?? 0} 个 · 
      Skills：${data.stats?.skills ?? 0} 个 · 
      项目：${data.stats?.projects ?? 0} 个 · 
      默认模型：${escapeHtml(data.agentModel?.alias || data.agentModel?.primary || '未知')} · 
      分析时间：${new Date(data.collectedAt).toLocaleString('zh-CN')}
    </p>
    <span class="collapse-toggle" onclick="document.getElementById('raw').style.display=document.getElementById('raw').style.display==='block'?'none':'block';this.textContent=document.getElementById('raw').style.display==='block'?'隐藏原始 JSON':'查看原始 JSON'">查看原始 JSON</span>
    <pre id="raw" class="raw-data">${escapeHtml(JSON.stringify(analysis, null, 2))}</pre>
  </div>

  <footer>
    <p>Generated by user-insight-cli · 数据仅保存在本地</p>
  </footer>
</div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf8');
}

module.exports = { generate };
