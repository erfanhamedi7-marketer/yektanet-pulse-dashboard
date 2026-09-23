// Checks a generated dashboard before it is handed over. Node only, no installs:
//   node scripts/check_dashboard.mjs dashboard.html
// Catches the failures that actually happen — a syntax error in the inline
// script, a placeholder left behind, a config that doesn't parse, a tab named
// in the config with no snapshot rows behind it.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = process.argv[2];
if (!file) { console.error('usage: node check_dashboard.mjs <dashboard.html>'); process.exit(2); }
const html = readFileSync(file, 'utf8');
const problems = [], notes = [];

for (const ph of ['__DASHBOARD_CONFIG__', '__EMBEDDED_DATA__', '__DASHBOARD_TITLE__', '__DASHBOARD_SUBTITLE__'])
  if (html.includes(ph)) problems.push(`placeholder ${ph} was never filled in`);

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) problems.push('no inline script found');
const body = scripts.sort((a, b) => b.length - a.length)[0] || '';
const tmp = join(tmpdir(), `dash-check-${process.pid}.js`);
writeFileSync(tmp, body);
try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
catch (e) { problems.push('the dashboard script has a syntax error:\n' + String(e.stderr || e)); }
finally { try { unlinkSync(tmp); } catch {} }

const grab = (name) => {
  const at = body.indexOf(`const ${name} = `);
  if (at < 0) { problems.push(`${name} is missing from the file`); return null; }
  let i = at, start = -1, depth = 0;
  for (; i < body.length; i++) {
    const c = body[i];
    if (start < 0) { if (c === '{' || c === '[') { start = i; depth = 1; } continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (!depth) { i++; break; } }
    else if (c === '"') { while (++i < body.length && body[i] !== '"') if (body[i] === '\\') i++; }
  }
  try { return JSON.parse(body.slice(start, i)); }
  catch (e) { problems.push(`${name} is not valid JSON: ${e.message}`); return null; }
};

const config = grab('CONFIG');
const snapshot = grab('SNAPSHOT');

if (config) {
  const projects = config.projects || [];
  if (!projects.length) problems.push('the config has no projects');
  const ids = new Set();
  for (const p of projects) {
    if (!p.id) problems.push('a project has no id');
    if (ids.has(p.id)) problems.push(`two projects share the id "${p.id}"`);
    ids.add(p.id);
    if (!p.spreadsheetId) problems.push(`${p.id}: no spreadsheetId`);
    if (p.kind === 'budget') {
      if (!p.blendSheet || !p.budgetSheet) problems.push(`${p.id}: a budget section needs blendSheet and budgetSheet`);
    } else {
      if (!p.refSheet) problems.push(`${p.id}: no refSheet`);
      if (!p.costSheet) problems.push(`${p.id}: no costSheet`);
      if (!p.conversionCol) problems.push(`${p.id}: no conversionCol`);
    }
    if (p.kind === 'cpi' && !(p.cpiGroups || []).length) problems.push(`${p.id}: a cpi section needs cpiGroups`);
  }
  // Every tab the config names should have rows behind it, or the file only
  // works online — worth saying out loud rather than discovering in the browser.
  if (snapshot) {
    const have = new Set(Object.keys(snapshot.tabs || {}));
    const named = new Set();
    for (const p of projects) {
      [].concat(p.refSheet || [], p.costSheet || [], p.blendSheet || [], p.budgetSheet || [],
                p.sessionsCompare ? p.sessionsCompare.sheet : [])
        .forEach(t => named.add(typeof t === 'string' ? t : t.sheet));
    }
    const missing = [...named].filter(t => t && !have.has(t));
    if (missing.length) notes.push(`no snapshot rows for: ${missing.join(', ')} — these tabs need the sheet to be readable online`);
    for (const [tab, t] of Object.entries(snapshot.tabs || {})){
      const n = Array.isArray(t) ? t.length : (t.rows || []).length;
      if (!n) notes.push(`snapshot tab "${tab}" is empty`);
    }
  }
}

const mb = Buffer.byteLength(html) / 1e6;
if (mb > 25) problems.push(`the file is ${mb.toFixed(1)} MB — too heavy for a browser to open comfortably`);
else if (mb > 8) notes.push(`the file is ${mb.toFixed(1)} MB; opening it will be slow on a modest laptop`);

for (const n of notes) console.log('note: ' + n);
if (problems.length) { console.error('\nFAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
const snapRows = Object.values((snapshot || {}).tabs || {})
  .reduce((n, t) => n + (Array.isArray(t) ? t.length : (t.rows || []).length), 0);
console.log(`OK — ${(config.projects || []).length} section(s), ${snapRows.toLocaleString('en-US')} snapshot rows, ${mb.toFixed(2)} MB`);
