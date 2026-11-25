const pagesTab = 'Dashboard Pages', paramsTab = 'Dashboard Parameters', prefsTab = 'Dashboard Views';
const prefsHeader = ['page_id','setting','key','value_or_label','source','column','operation','second_source','second_column'];
const field = (sheet,col) => JSON.stringify([sheet,col]);
function decodeViews(rows) {
  const settings = Object.create(null);
  for (const [id,kind,key,val,sheet,col,op,rightSheet,rightCol] of rows) {
    if (!id) continue;
    if (kind === 'defaults' || !settings[id]) settings[id] = {};
    const cfg = settings[id];
    if (kind === 'preset') cfg.preset = String(val);
    if (kind === 'filter') {
      cfg.filters ||= Object.create(null);
      (cfg.filters[key] ||= []);
      if (val != null && val !== '') cfg.filters[key].push(String(val));
    }
    if (['hiddenCards','hiddenLayout','chart'].includes(kind)) {
      cfg[kind] ||= [];
      if (key) cfg[kind].push(String(key));
    }
    if (kind === 'columns' && sheet && col) (cfg.columns ||= []).push(field(sheet,col));
    if (kind === 'metric') (cfg.metrics ||= []).push({id:key,name:val,left:field(sheet,col),op:op||'',right:op?field(rightSheet,rightCol):null});
  }
  return settings;
}
function encodeView(id,cfg) {
  const rows = [[id,'defaults']];
  if (!cfg) return rows;
  if (cfg.preset) rows.push([id,'preset','',cfg.preset]);
  for (const [key,values] of Object.entries(cfg.filters || {})) {
    for (const val of values.length ? values : ['']) rows.push([id,'filter',key,val]);
  }
  for (const kind of ['hiddenCards','hiddenLayout','chart']) {
    for (const key of cfg[kind] || []) rows.push([id,kind,key]);
    if (kind === 'chart' && cfg.chart?.length === 0) rows.push([id,kind]);
  }
  for (const k of cfg.columns || []) rows.push([id,'columns','','',...JSON.parse(k)]);
  for (const m of cfg.metrics || []) rows.push([id,'metric',m.id,m.name,...JSON.parse(m.left),m.op||'',...(m.right ? JSON.parse(m.right) : [])]);
  return rows;
}
async function readTabs(call,base,names) {
  const query = names.map(name=>'ranges='+encodeURIComponent("'"+name+"'")).join('&');
  const result = await call({url:base+'/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&'+query});
  return result.valueRanges.map(range=>(range.values || []).slice(1));
}
async function saveView(call,base,id,value) {
  const [rows] = await readTabs(call,base,[prefsTab]);
  const meta = await call({url:base+'?fields=sheets(properties(sheetId,title))'});
  const sheetId = meta.sheets.find(s=>s.properties.title===prefsTab).properties.sheetId;
  const requests = [];
  rows.forEach((row,i)=>{
    if (row[0] === id) requests.push({repeatCell:{range:{sheetId,startRowIndex:i+1,endRowIndex:i+2,startColumnIndex:0,endColumnIndex:prefsHeader.length},cell:{},fields:'userEnteredValue'}});
  });
  requests.push({appendCells:{sheetId,fields:'userEnteredValue',rows:encodeView(id,value).map(row=>({values:row.map(v=>({userEnteredValue:{stringValue:String(v)}}))}))}});
  await call({url:base+':batchUpdate',method:'POST',data:{requests}});
}
module.exports = {pagesTab,paramsTab,prefsTab,prefsHeader,encodeView,decodeViews,readTabs,saveView};
