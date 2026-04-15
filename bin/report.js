const fs = require('fs');
const path = require('path');
const { generate } = require('../lib/reporter');

const [,, analysisPath, rawPath, outPath] = process.argv;

if (!analysisPath || !rawPath) {
  console.error('Usage: node report.js <analysis-json> <raw-json> [output-html]');
  process.exit(1);
}

const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
const data = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const htmlPath = outPath || path.join(path.dirname(analysisPath), `report-${timestamp}.html`);

generate(analysis, data, htmlPath);
console.log(htmlPath);
