const validPageKey = key => typeof key === 'string' && /^[a-zA-Z0-9_-]+$/.test(key)
  && !(key in Object.prototype) && key !== 'prototype';

function pageFromRow(row,builtins) {
  const [id,,title,group,groupTitle,partTitle,spreadsheetId,refSheet,costSheet,conversionCol,conversionLabel] = row;
  if (!validPageKey(id) || (group && !validPageKey(group)) || !title || !/^[\w-]{20,}$/.test(spreadsheetId)) throw Error('شناسه، عنوان یا شناسهٔ شیت معتبر نیست');
  if ([title,groupTitle,partTitle,refSheet,costSheet,conversionCol,conversionLabel].some(v=>/[<>"]/.test(String(v||'')))) throw Error('مقدار نامعتبر');
  const base = builtins.find(p=>p.id===id);
  const project = {...(base || {ownDateFilter:true,theme:{accent:'#217357',ink:'#19543F',accent2:'#CF781D',accentSoft:'rgba(33,115,87,0.15)'}}),
    id,title,group,groupTitle,partTitle,spreadsheetId};
  if (base?.tabTitle === base?.title) project.tabTitle = title;
  if (refSheet) project.refSheet = refSheet;
  if (costSheet) project.costSheet = costSheet;
  if (conversionCol) project.conversionCol = conversionCol;
  if (conversionLabel || conversionCol) project.conversionLabel = conversionLabel || conversionCol;
  if (project.kind === 'budget' ? !project.budgetSheet || !project.blendSheet : !project.refSheet || !project.costSheet) throw Error('نام تب منبع خالی است');
  return project;
}

async function loadDashboardPages(projects,builtins,excluded=[]) {
  const issues = [], configured = [], seen = new Set();
  try {
    const response = await fetch('/api/store?dashboard=1',{cache:'no-store'});
    if (!response.ok) throw Error(String(response.status));
    const {pages} = await response.json();
    for (const row of pages) {
      if (!row[0] || String(row[1]).toLowerCase()==='false' || excluded.includes(row[0])) continue;
      try {
        const project = pageFromRow(row,builtins);
        if (seen.has(project.id)) throw Error('شناسهٔ تکراری');
        seen.add(project.id);
        configured.push(project);
      } catch (error) { issues.push(row[0]+' — '+error.message); }
    }
  } catch (error) { issues.push('خواندن فهرست مشتری‌ها ممکن نشد — '+error.message); }
  projects.splice(0,projects.length,...configured);
  if (issues.length) {
    const warning = document.createElement('div');
    warning.className = 'settings-warning';
    warning.textContent = issues.join('، ');
    document.body.prepend(warning);
  }
}
if (typeof module !== 'undefined') module.exports = {pageFromRow,loadDashboardPages};
