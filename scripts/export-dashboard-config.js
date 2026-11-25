// Seed an empty settings workbook from the original project catalogue.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'),'utf8');
const code = html.slice(html.indexOf('const BRAND_INK'),html.indexOf('const PROJECTS ='));
const projects = vm.runInNewContext(code + ';ALL_PROJECTS');
const pages = [['page_id','enabled','title','group_id','group_title','section_title','spreadsheet_id','conversion_tab','cost_tab','conversion_column','conversion_label']];
for (const p of projects) {
  const simple = ['refSheet','costSheet','conversionCol','conversionLabel'].filter(k=>typeof p[k]==='string');
  pages.push([p.id,!p.hidden,p.title,p.group || '',p.groupTitle || '',p.partTitle || '',p.spreadsheetId,...['refSheet','costSheet','conversionCol','conversionLabel'].map(k=>simple.includes(k)?p[k]:'')]);
}
console.log(JSON.stringify({pages}));
