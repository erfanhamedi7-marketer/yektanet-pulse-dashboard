/* Per-section defaults shared by all signed-in viewers. */
function dashboardSettings(api) {
  const prefix = 'preferences|' + api.page + '|';
  const presets = {All:null, Yesterday:'yesterday', Week:'week', LastWeek:'lastweek', 7:7, 30:30};
  const captions = {All:'کل بازه', Yesterday:'دیروز', Week:'از شنبه', LastWeek:'هفته قبل', 7:'۷ روز اخیر', 30:'۳۰ روز اخیر'};
  const configs = new Map();
  let owner = false, storageError = '';
  const config = p => configs.get(p.id) || {};
  const section = p => document.getElementById('section-' + p.id);
  const keyOf = (sheet, col) => JSON.stringify([sheet,col]);
  const el = (tag, label) => {
    const node = document.createElement(tag);
    if(label != null) node.textContent = label;
    return node;
  };
  function sourceLists(p) {
    if(p.kind === 'budget') return [[p.blendSheet,p.rawBlend],[p.budgetSheet,p.rawBudget]];
    const lists = [];
    const refs = Array.isArray(p.refSheet) ? p.refSheet : [p.refSheet];
    for(const ref of refs){
      const sheet = ref.sheet || ref;
      lists.push([sheet,p.rawRef, 'ref']);
    }
    lists.push([p.costSheet,p.rawCost,'cost']);
    if(p.compareConversion) lists.push([p.compareConversion.sheet,p.rawCmpConv,'comparison']);
    if(p.sessionsCompare) lists.push([p.sessionsCompare.sheet,p.rawCompare,'sessions']);
    (p.dimensionTables || []).forEach((d,i)=>lists.push([d.sheet,p.rawDims[i],'dimension']));
    return lists;
  }
  function catalog(p){
    if(p.settingsFields) return p.settingsFields;
    const fields = new Map();
    for(const [sheet,rows,type] of sourceLists(p)){
      const sample = type === 'ref' ? rows.find(r=>r.sourceSheet===sheet) : rows[0];
      for(const col of (p.sourceHeaders?.get(sheet) || Object.keys(sample?.sourceRow || {}))){
        fields.set(keyOf(sheet,col), sheet + ' · ' + col);
      }
    }
    p.settingsFields = fields;
    return fields;
  }
  function filteredSources(p, joined, wanted){
    const result = new Map();
    const {from,to} = api.sectionRange(p);
    const inDate = r => !r.date || ((!from || r.date>=from) && (!to || r.date<=to));
    let segments, allowed;
    if(joined){
      const campaign = api.campaignFilter(p);
      const visible = r => inDate(r) && campaign(r.campaign);
      segments = api.applySegFilter(p,p.rawRef.filter(visible),p.rawCost.filter(visible));
      allowed = new Set(joined.map(r=>r.date+'|'+r.campaign));
    }
    for(const [sheet,rows,type] of sourceLists(p)){
      if(result.has(sheet) || !wanted.has(sheet)) continue;
      let selected;
      if(!type){
        const name = api.budgetNameFilter(p), campaign = api.budgetCampaignFilter(p);
        selected = rows.filter(r=>inDate(r) && name(r.campaignName) && campaign(r.campaign));
      }else if(type==='ref' || type==='cost'){
        const list = type==='ref' ? segments.refRows : segments.costRows;
        selected = list.filter(r=>(type!=='ref' || r.sourceSheet===sheet) && allowed.has(r.date+'|'+r.campaign));
      }else {
        const campaign = api.campaignFilter(p);
        selected = rows.filter(r=>inDate(r) && (type!=='comparison' || campaign(r.campaign)));
      }
      result.set(sheet,selected);
    }
    return result;
  }
  function operation(a,b,op){
    if(a==null || (op && b==null)) return null;
    if(op==='/') return b===0 ? null : a/b;
    if(op==='*') return a*b;
    if(op==='+') return a+b;
    if(op==='-') return a-b;
    return a;
  }
  function cards(p,cards,dates,joined){
    p.settingsCards = cards.map(c=>[c.metric?.id || c.label,c.label,!!c.metric]);
    const cfg = config(p);
    const hidden = new Set(cfg.hiddenCards || []);
    const visible = cards.filter(c=>!hidden.has(c.metric?.id || c.label));
    const defs = cfg.metrics || [], columns = cfg.columns || [];
    if(defs.length || columns.length){
      const keys = new Set([...defs.flatMap(m=>[m.left,m.right].filter(Boolean)),...columns]);
      const sources = filteredSources(p,joined,new Set([...keys].map(k=>JSON.parse(k)[0])));
      const sums = new Map();
      function sum(key){
        if(sums.has(key)) return sums.get(key);
        const [sheet,col] = JSON.parse(key);
        let total = null;
        const days = new Map();
        for(const row of sources.get(sheet) || []){
          const raw = row.sourceRow[col];
          if(typeof raw !== 'number' && !/^\s*[(+−–—-]?[\d۰-۹٠-٩][\d۰-۹٠-٩,.٫٬،\s'eE+−–—-]*[)-]?\s*(?:IRT|IRR|تومان|ریال|%)?\s*$/i.test(String(raw ?? ''))) continue;
          const n = api.toNumber(raw)*(row.sourceWeight ?? 1);
          total = (total ?? 0)+n;
          if(row.date) days.set(row.date,(days.get(row.date)||0)+n);
        }
        const value = {total,days};
        sums.set(key,value);
        return value;
      }
      for(const m of defs){
        const left = sum(m.left), right = m.op ? sum(m.right) : {};
        const value = operation(left.total,right.total,m.op);
        const series = dates.map(d=>operation(left.days.get(d),right.days?.get(d),m.op));
        visible.push({label:api.escapeHtml(m.name), value:value==null?'—':api.fmtNum(value,2),series,
          metric:series.some(v=>v!=null)?{id:m.id,label:m.name,data:series}:null});
      }
      drawSources(p,columns,sources);
    }else section(p).querySelector('.settings-source')?.remove();
    cards.splice(0,cards.length,...visible);
  }
  function drawSources(p,columns,sources){
    section(p).querySelector('.settings-source')?.remove();
    if(!columns.length) return;
    const wrap=el('div'); wrap.className='card settings-source'; section(p).append(wrap);
    for(const [sheet,rows] of sources){
      const cols=columns.map(k=>JSON.parse(k)).filter(k=>k[0]===sheet).map(k=>k[1]);
      if(!cols.length) continue;
      wrap.append(el('h2',sheet));
      const scroll=el('div'); scroll.className='cpa-table-wrap'; wrap.append(scroll);
      const table=el('table'); table.className='cpa-table'; scroll.append(table);
      const head=table.createTHead().insertRow(); cols.forEach(c=>head.append(el('th',c)));
      const body=table.createTBody(); let offset=0;
      const more=el('button','ردیف‌های بیشتر');
      function next(){
        for(const r of rows.slice(offset,offset+50)){
          const tr=body.insertRow(); cols.forEach(c=>tr.insertCell().textContent=r.sourceRow[c] ?? '—');
        }
        offset+=50; more.hidden=offset>=rows.length;
      }
      more.onclick=next; wrap.append(more); next();
    }
  }
  function initialize(p){
    const cfg=config(p), state=api.projectState[p.id];
    for(const slot of api.filterSlots(p)){
      const keys=cfg.filters?.[slot.stateKey];
      if(!keys) continue;
      const available=new Set(slot.universe().map(o=>o.key));
      const kept=keys.filter(k=>available.has(k));
      state[slot.stateKey]=kept.length ? new Set(kept) : 'ALL';
    }
    for(const dim of ['adgroup','creative']){
      if(cfg.filters?.[dim]?.length) api.segSel(p)[dim]=new Set(cfg.filters[dim]);
    }
    if(Array.isArray(cfg.chart)) state.chartPicks=cfg.chart.slice();
    if(!owner) return;
    const button=el('button','تنظیمات'); button.className='preset-btn settings-open';
    button.onclick=()=>editor(p); section(p).querySelector('.section-controls').append(button);
  }
  function applyDate(p){
    const preset=config(p).preset || String(p.defaultRangeDays || 30);
    api.setOwnPreset(p,presets[preset],document.getElementById('ownPreset'+preset+'-'+p.id));
  }
  function layoutItems(p){
    const root=section(p), items=[];
    for(const card of root.querySelectorAll('.card:not(.settings-source):not(.report-card)')){
      const title=card.querySelector('h2,h3,summary')?.textContent.trim();
      if(!title) continue;
      const key=card.id || card.querySelector('[id]')?.id || title;
      items.push({key:'section|'+key,label:title,nodes:[card]});
      for(const table of card.querySelectorAll('table')){
        const columns=Array.from(table.tHead?.rows[0]?.cells || []);
        columns.forEach((th,i)=>{
          const label=th.textContent.trim();
          const id=table.closest('[id]')?.id || key;
          items.push({key:'column|'+id+'|'+label,label:title+' · '+label,
            nodes:Array.from(table.rows).filter(r=>r.cells.length===columns.length).map(r=>r.cells[i])});
        });
      }
    }
    return items;
  }
  function layout(p){
    const hidden=new Set(config(p).hiddenLayout || []);
    if(!hidden.size && !section(p).querySelector('[data-settings-hidden]')) return;
    for(const item of layoutItems(p)){
      item.nodes.forEach(n=>n.toggleAttribute('data-settings-hidden',hidden.has(item.key)));
    }
  }
  async function load(user){
    owner=String(user).toLowerCase()==='e.hamedi';
    try{
      const response=await fetch('/api/store?prefix='+encodeURIComponent(prefix),{cache:'no-store'});
      if(!response.ok) throw Error();
      const {items}=await response.json();
      for(const [key,entry] of Object.entries(items)) configs.set(key.slice(prefix.length),entry.value);
    }catch{storageError='اتصال به شیت تنظیمات برقرار نشد. دسترسی و تنظیم STORE_SPREADSHEET_ID را بررسی و صفحه را تازه کنید.';}
    if(storageError){
      const status=el('div',owner ? storageError : 'تنظیمات مشترک بارگذاری نشد. پیش‌فرض اولیه نمایش داده می‌شود.'); status.className='settings-warning';
      document.body.prepend(status);
    }
  }
  async function save(p,value){
    const res=await fetch('/api/store',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({items:[{key:prefix+p.id,value}]})});
    if(!res.ok) throw Error('ذخیره انجام نشد ('+res.status+').');
    if(value) configs.set(p.id,value); else configs.delete(p.id);
  }
  function editor(p){
    const cfg=config(p);
    const dialog=el('dialog'); dialog.className='settings-dialog'; dialog.dir='rtl';
    const form=el('form'); dialog.append(form); document.body.append(dialog);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    const title=el('h2','تنظیمات '+p.title); form.append(title);
    dialog.setAttribute('aria-label',title.textContent);
    form.append(el('p',api.page==='weekly'?'گزارش هفتگی · پیش‌فرض مشترک همه‌ی کاربران':'داشبورد · پیش‌فرض مشترک همه‌ی کاربران'));
    function group(title){
      const box=el('details'), heading=el('summary',title); box.append(heading); form.append(box); return box;
    }
    function labeled(parent,text,node){
      const label=el('label'); label.append(el('span',text),node); parent.append(label); return node;
    }
    function select(options,value){
      const sel=el('select');
      options.forEach(([k,v])=>sel.add(new Option(v,k)));
      if(value!=null) sel.value=value;
      return sel;
    }
    function checks(box,options,initial){
      const inputs=new Map();
      options.forEach(([id,label])=>{
        if(inputs.has(id)) return;
        const input=el('input'); input.type='checkbox'; input.checked=initial(id);
        labeled(box,label,input); inputs.set(id,input);
      });
      return inputs;
    }
    const chosen=(map,checked=true)=>[...map].filter(([,i])=>i.checked===checked).map(([key])=>key);
    const filters=group('فیلترهای پیش‌فرض'); filters.open=true;
    const preset=labeled(filters,'بازه‌ی زمانی',select(Object.entries(captions),cfg.preset || String(p.defaultRangeDays || 30)));
    const slots=api.filterSlots(p).map(slot=>[slot.stateKey,slot.unit,slot.universe().map(o=>[o.key,o.label || o.key])]);
    if(p.rawRef?.length && !p.hideSegmentAnalysis){
      for(const dim of ['adgroup','creative']){
        const values=new Set(p.rawRef.map(r=>r[dim]).filter(Boolean));
        if(values.size) slots.push([dim,dim,[...values].sort().map(v=>[v,v])]);
      }
    }
    const picks=new Map();
    for(const [key,label,options] of slots){
      const defaults=cfg.filters?.[key] ?? (key==='campaigns' ? (p.defaultCampaigns||[]).map(api.normCampaign) : []);
      const sel=select(options); sel.multiple=true;
      for(const o of sel.options) o.selected=defaults.includes(o.value);
      labeled(filters,label+' (بدون انتخاب = همه)',sel);
      const all=el('button','همه'); all.type='button';
      all.onclick=()=>{ for(const o of sel.options) o.selected=false; };
      filters.append(all);
      picks.set(key,sel);
    }
    const kpis=group('کارت‌های شاخص');
    const visible=checks(kpis,(p.settingsCards||[]).map(([k,v])=>[k,v]),id=>!cfg.hiddenCards?.includes(id));
    const fieldOptions=[...catalog(p)];
    const sources=group('ستون‌های جدول داده‌های منبع');
    const fields=checks(sources,fieldOptions,id=>cfg.columns?.includes(id));
    const parts=group('بخش‌ها و ستون‌های جدول‌ها');
    const layoutChecks=checks(parts,layoutItems(p).map(i=>[i.key,i.label]),id=>!cfg.hiddenLayout?.includes(id));
    const metrics=group('شاخص‌های شیت و فرمول‌های سفارشی');
    metrics.append(el('p','ستون عددی را برای جمع انتخاب کنید یا دو مجموع را با هم محاسبه کنید. مثلاً هزینه ÷ سشن.'));
    const entries=[];
    const charts=group('سری‌های پیش‌فرض نمودار');
    const chartOptions=(p.settingsCards||[]).filter(c=>c[2]).map(([id,label])=>[id,label]);
    const chart=checks(charts,chartOptions,id=>(cfg.chart || p._chart?.defaults || []).includes(id));
    function metricRow(m){
      const row=el('fieldset'), name=el('input'); name.required=true; name.maxLength=96; name.value=m?.name||'';
      labeled(row,'نام شاخص',name);
      const left=labeled(row,'ستون اول',select(fieldOptions,m?.left));
      const op=labeled(row,'محاسبه',select([['','جمع ستون'],['/','÷'],['*','×'],['+','+'],['-','−']],m?.op||''));
      const right=labeled(row,'ستون دوم',select(fieldOptions,m?.right));
      op.onchange=()=>right.parentElement.hidden=!op.value; op.onchange();
      const id=m?.id || 'custom-'+crypto.randomUUID();
      const plot=el('input'); plot.type='checkbox'; plot.checked=cfg.chart?.includes(id) || false;
      labeled(charts,name.value || 'شاخص جدید',plot); chart.set(id,plot);
      name.oninput=()=>plot.parentNode.firstChild.textContent=name.value || 'شاخص جدید';
      const remove=el('button','حذف شاخص'); remove.type='button';
      remove.onclick=()=>{ row.remove(); plot.parentNode.remove(); chart.delete(id); };
      row.append(remove); metrics.append(row);
      entries.push({row,name,left,op,right,id});
    }
    for(const m of cfg.metrics||[]) metricRow(m);
    const add=el('button','افزودن شاخص'); add.type='button'; add.onclick=()=>metricRow(); add.disabled=!fieldOptions.length; metrics.append(add);
    const footer=el('footer'), msg=el('p',storageError); msg.setAttribute('role','status');
    const submit=el('button','ذخیره'), cancel=el('button','انصراف'), reset=el('button','بازگردانی پیش‌فرض اولیه');
    submit.type='submit'; cancel.type=reset.type='button'; cancel.onclick=()=>dialog.close();
    footer.append(submit,cancel,reset); form.append(msg,footer);
    async function persist(value){
      if(storageError) return;
      for(const b of footer.children) b.disabled=true;
      try{
        await save(p,value);
        const state=api.projectState[p.id];
        delete state.chartPicks;
        for(const slot of api.filterSlots(p)){
          const keys=value?.filters?.[slot.stateKey] ?? (slot.key==='main'?(p.defaultCampaigns||[]).map(api.normCampaign):[]);
          const available=new Set(slot.universe().map(o=>o.key));
          const kept=keys.filter(k=>available.has(k));
          state[slot.stateKey]=kept.length ? new Set(kept) : 'ALL';
        }
        for(const dim of ['creative','adgroup']){
          const keys=value?.filters?.[dim]||[];
          api.segSel(p)[dim]=keys.length ? new Set(keys) : 'ALL';
        }
        if(Array.isArray(value?.chart)) state.chartPicks=value.chart.slice();
        if(p.ownDateFilter) applyDate(p); else api.updateSection(p);
        dialog.close();
      }catch(e){ msg.textContent=e.message; }
      finally{for(const b of footer.children) b.disabled=false;}
    }
    reset.onclick=()=>{if(confirm('تنظیمات همین بخش به حالت اولیه برگردد؟')) persist(null);};
    form.onsubmit=e=>{
      e.preventDefault();
      const chartIds=chosen(chart).filter(id=>!visible.has(id)||visible.get(id).checked);
      if(chartIds.length>4){msg.textContent='حداکثر چهار سری نمودار را انتخاب کنید.';return;}
      const formulas=entries.filter(r=>r.row.isConnected).map(r=>({
        id:r.id,name:r.name.value.trim(),left:r.left.value,op:r.op.value,right:r.op.value?r.right.value:null
      }));
      if(formulas.some(m=>!m.name)){msg.textContent='نام شاخص را وارد کنید.';return;}
      persist({preset:preset.value,filters:Object.fromEntries([...picks].map(([k,s])=>[k,[...s.selectedOptions].map(o=>o.value)])),
        hiddenCards:chosen(visible,false),hiddenLayout:[...(cfg.hiddenLayout||[]).filter(k=>!layoutChecks.has(k)),...chosen(layoutChecks,false)],
        metrics:formulas,columns:chosen(fields),chart:chartIds});
    };
    submit.disabled=reset.disabled=!!storageError;
    dialog.showModal();
  }
  return {load,initialize,applyDate,layout,cards};
}
