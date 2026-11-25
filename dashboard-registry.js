/* The settings workbook contains data. Rule names refer to existing functions. */
function dashboardRegistry(pages, parameters, builtins) {
  const fields = new Set(builtins.flatMap(Object.keys));
  const safeKey = key => /^[a-zA-Z0-9_-]+$/.test(key) && !(key in Object.prototype) && key !== 'prototype';
  const projects = new Map();
  for (const [id, enabled, title, group, groupTitle, partTitle, spreadsheetId,refSheet,costSheet,conversionCol,conversionLabel] of pages) {
    if (!id || String(enabled).toLowerCase() === 'false') continue;
    if (!safeKey(id) || (group && !safeKey(group)) || projects.has(id) || !title || !/^[\w-]{20,}$/.test(spreadsheetId)) throw Error('Dashboard Pages: ' + id);
    if ([title,groupTitle,partTitle,refSheet,costSheet,conversionCol,conversionLabel].some(v=>/[<>"]/.test(String(v||'')))) throw Error('Dashboard Pages: '+id);
    projects.set(id, {id, title, group, groupTitle, partTitle, spreadsheetId, refSheet:refSheet||undefined,costSheet:costSheet||undefined,conversionCol:conversionCol||undefined,conversionLabel:conversionLabel||conversionCol||undefined,ownDateFilter:true,
      theme:{accent:'#217357',ink:'#19543F',accent2:'#CF781D',accentSoft:'rgba(33,115,87,0.15)'}});
  }
  for (const [id, path, type, raw] of parameters) {
    const p = projects.get(id);
    if (!p) continue;
    const parts = String(path).split('.');
    if (!fields.has(parts[0]) || ['id','group','groupTitle','title','partTitle','spreadsheetId'].includes(parts[0]) || !parts.every(safeKey)) throw Error('Dashboard Parameters: ' + path);
    let value = raw ?? '';
    if (type === 'rule') {
      const [template,...keys] = String(value).split('.');
      const base = builtins.find(b => b.id === template);
      value = keys.reduce((v,k) => safeKey(k) && v && Object.hasOwn(v,k) ? v[k] : undefined, base);
      if (typeof value !== 'function') throw Error('Unknown rule: ' + raw);
    } else if (type === 'boolean') {
      if (!/^(true|false)$/i.test(String(value))) throw Error(path);
      value = String(value).toLowerCase() === 'true';
    } else if (type === 'number') {
      value = Number(value);
      if (!Number.isFinite(value)) throw Error(path);
    } else if (type === 'array') value = [];
    else if (type === 'text') {
      value = String(value);
      if (/[<>"\x00-\x08]/.test(value)) throw Error(path);
      if (path === 'logo' && !/^\/[\w .%-]+\.(png|jpe?g|svg|webp)$/i.test(value)) throw Error(path);
      if (parts[0] === 'theme' && !/^(#[\da-f]{6}|rgba\([\d,. ]+\))$/i.test(value)) throw Error(path);
    } else throw Error('Unknown parameter type: ' + type);
    let target = p;
    parts.slice(0,-1).forEach((key,i) => {
      if (!Object.hasOwn(target,key) || target[key] === undefined) target[key] = /^\d+$/.test(parts[i+1]) ? [] : {};
      target = target[key];
      if (!target || typeof target !== 'object') throw Error(path);
    });
    target[parts.at(-1)] = value;
  }
  return [...projects.values()];
}
if (typeof module !== 'undefined') module.exports = dashboardRegistry;
