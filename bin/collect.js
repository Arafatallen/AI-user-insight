const fs = require('fs');
const path = require('path');
const os = require('os');
const { collect } = require('../lib/collector');

const HOME = os.homedir();
const WORKSPACE = path.join(HOME, '.openclaw', 'workspace');
const PROJECTS = 'E:\\OpenClaw';
const OUTPUT_DIR = path.join(WORKSPACE, 'user-insight-reports');

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const data = collect({ workspace: WORKSPACE, projects: PROJECTS, home: HOME });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rawPath = path.join(OUTPUT_DIR, `raw-${timestamp}.json`);
  fs.writeFileSync(rawPath, JSON.stringify(data, null, 2), 'utf8');
  
  console.log(rawPath);
}

main();
