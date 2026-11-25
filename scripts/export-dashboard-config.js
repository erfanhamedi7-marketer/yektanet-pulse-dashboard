// Seed an empty settings workbook from the original project catalogue.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'),'utf8');
const code = html.slice(html.indexOf('const BRAND_INK'),html.indexOf('const PROJECTS ='));
const projects = vm.runInNewContext(code + ';ALL_PROJECTS');
const pages = [['page_id','enabled','title','group_id','group_title','section_title','spreadsheet_id','conversion_tab','cost_tab','conversion_column','conversion_label']];
const params = [['page_id','parameter','type','value']];
const pageFields = new Set(['id','hidden','title','group','groupTitle','partTitle','spreadsheetId']);
function add(id, key, value) {
  if (value === undefined) return;
  if (typeof value === 'function') params.push([id,key,'rule',id+'.'+key]);
  else if (value !== null && typeof value === 'object') {
    if (Array.isArray(value) && !value.length) params.push([id,key,'array','']);
    Object.entries(value).forEach(([child,v]) => add(id,key+'.'+child,v));
  } else params.push([id,key,typeof value === 'string' ? 'text' : typeof value,value]);
}
for (const p of projects) {
  const simple = ['refSheet','costSheet','conversionCol','conversionLabel'].filter(k=>typeof p[k]==='string');
  pages.push([p.id,!p.hidden,p.title,p.group || '',p.groupTitle || '',p.partTitle || '',p.spreadsheetId,...['refSheet','costSheet','conversionCol','conversionLabel'].map(k=>simple.includes(k)?p[k]:'')]);
  for (const [k,v] of Object.entries(p)) if (!pageFields.has(k) && !simple.includes(k)) add(p.id,k,v);
}
const registry = require('../dashboard-registry');
const result = registry(pages.slice(1),params.slice(1),projects);
for (const project of projects.filter(p=>!p.hidden)) {
  const loaded = result.find(p=>p.id===project.id);
  for (const key of Object.keys(project)) {
    const sort = (k,v) => typeof v === 'function' ? String(v) : v && Object.prototype.toString.call(v)==='[object Object]' ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v;
    if (JSON.stringify(project[key],sort)!==JSON.stringify(loaded[key],sort)) throw Error(project.id+'.'+key);
  }
}
console.log(JSON.stringify({pages,params}));
