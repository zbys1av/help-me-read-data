// Runs only in the selected, already authenticated Gyro page. No network calls.
async function scanGyro(options = {}) {
  const norm = s => String(s ?? '').replace(/\s+/g,' ').trim().toLowerCase();
  const text = el => el?.innerText?.trim() ?? '';
  const warnings = [], diagnostics = {tables:[], url:location.origin + location.pathname};
  const selector = (s) => s ? document.querySelector(s) : null;
  const context = () => {
    const read = s => { const e=selector(s); return e ? (e.value ?? text(e)) : ''; };
    let user = read(options.userSelector), period = read(options.periodSelector);
    if (!user) {
      const labels=[...document.querySelectorAll('label')].filter(e=>/^user\s*id\s*:?$/i.test(text(e)));
      if(labels.length===1) { const l=labels[0], e=l.control || (l.htmlFor && document.getElementById(l.htmlFor)); user=e?.value ?? ''; }
      if(!user) { const params=new URL(location.href).searchParams; user=params.get('userId') || params.get('user_id') || ''; }
    }
    return {user,period};
  };
  window.__gyroRtpObserver?.disconnect(); clearTimeout(window.__gyroRtpTimer);
  const initial=context();
  if(!initial.user) warnings.push('User ID не визначено. Вкажіть селектор поля User ID у діагностиці.');
  if(!initial.period) warnings.push('Вибраний період не визначено. Діапазон дат рядків не підтверджує період фільтра.');
  const aliases={date:['date'],from:['date from','date from parameter'],provider:['game provider'],game:['game name'],bets:['bets (sum)'],wins:['wins (sum)'],count:['bets (count)']};
  function inspect(table) {
    const rows=[...table.querySelectorAll('tr,[role="row"]')].filter(r=>r.closest('table,[role="grid"],[role="table"]')===table);
    for(let i=0;i<rows.length;i++) {
      const cells=[...rows[i].querySelectorAll('th,td,[role="columnheader"],[role="gridcell"],[role="cell"]')];
      const headers=cells.map(c=>norm(text(c))), map={};
      for(const [key,names] of Object.entries(aliases)) map[key]=headers.findIndex(h=>names.includes(h));
      if(map.date<0) map.date=map.from;
      if(['date','provider','game','bets','wins','count'].every(k=>map[k]>=0)) return {rows,index:i,map,headers};
    }
    return null;
  }
  let tables=options.tableSelector ? [selector(options.tableSelector)].filter(Boolean) : [...document.querySelectorAll('table,[role="grid"],[role="table"]')];
  const matches=tables.map(t=>({t,data:inspect(t)}));
  diagnostics.tables=matches.map(({t,data})=>({role:t.getAttribute('role')||t.tagName,headers:data?.headers ?? [...t.querySelectorAll('th,[role="columnheader"]')].map(text),rows:t.querySelectorAll('tr,[role="row"]').length}));
  const candidates=matches.filter(x=>x.data);
  if(candidates.length!==1) return {rows:[],...initial,warnings:[...warnings,`Знайдено відповідних таблиць: ${candidates.length}. Потрібна адаптація селекторів.`],diagnostics,complete:false};
  const table=candidates[0].t;
  const collected=[], seenPages=new Set(); let carriedDate='', pages=0, aborted=false;
  // Generic DOM fallback cannot prove server-side completeness. Explicit UI next selector
  // is opt-in; no guessed buttons or undocumented API endpoints are used.
  warnings.push('Повноту набору не підтверджено: DOM-зчитування може не включати приховані, згорнуті або серверні рядки.');
  if(table.querySelector('[rowspan],[colspan]')) warnings.push('Таблиця містить об’єднані клітинки. Перевірте відповідність колонок; потрібен спеціальний адаптер для rowspan/colspan.');
  const fingerprint=()=>JSON.stringify([...table.querySelectorAll('tr,[role="row"]')].map(text));
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  while(pages<200) {
    const data=inspect(table); if(!data) {warnings.push('Структура таблиці змінилася.');break;}
    const signature=fingerprint(); if(seenPages.has(signature)) {warnings.push('Повтор сторінки; обхід зупинено.');break;} seenPages.add(signature); pages++;
    for(const row of data.rows.slice(data.index+1)) {
      const cells=[...row.querySelectorAll('td,[role="gridcell"],[role="cell"]')]; if(!cells.length) continue;
      if(cells.some(c=>c.colSpan>1 || c.rowSpan>1)) continue;
      const get=k=>{const c=cells[data.map[k]];return c?.getAttribute('title') || text(c);};
      if(/^total$|^grand total$|^всього$/i.test(get('date')) || /^total$/i.test(get('game'))) continue;
      const d=get('date'); if(d) carriedDate=d;
      if (/[.…]{2,}$|…$/.test(get('game')) || /[.…]{2,}$|…$/.test(get('provider'))) { warnings.push('Пропущено скорочену назву без повного title. Потрібен адаптер повної назви гри / провайдера.'); continue; }
      collected.push({date:carriedDate,provider:get('provider'),game:get('game'),bets:get('bets'),wins:get('wins'),count:get('count')});
    }
    if(!options.nextSelector) break;
    const next=selector(options.nextSelector);
    if(!next || next.disabled || next.getAttribute('aria-disabled')==='true') break;
    next.click();
    let changed=false;
    for(let i=0;i<80;i++) {await pause(100);if(JSON.stringify(context())!==JSON.stringify(initial)){aborted=true;break;}if(fingerprint()!==signature){changed=true;break;}}
    if(aborted) break;
    if(!changed){warnings.push('Наступна сторінка не завантажилася за 8 секунд.');break;}
    // Wait for DOM to settle before reading asynchronous row updates.
    let previous=fingerprint(), stable=0;
    for(let i=0;i<40 && stable<5;i++){await pause(100);const now=fingerprint();stable=now===previous?stable+1:0;previous=now;}
  }
  if(JSON.stringify(context())!==JSON.stringify(initial)) aborted=true;
  if(aborted) return {rows:[],...context(),warnings:['User ID або період змінено під час сканування. Повторіть Scan Data.'],diagnostics,complete:false};
  if(pages===200) warnings.push('Досягнуто обмеження 200 сторінок.');
  const signatures=collected.map(r=>JSON.stringify(r));
  if(new Set(signatures).size<signatures.length) warnings.push('Є однакові рядки без стабільного ID. Вони збережені як окремі записи: неможливо відрізнити дубль від двох однакових операцій без адаптера Gyro.');
  diagnostics.pages=pages; diagnostics.rawRows=collected.length;
  diagnostics.virtualizationHints=!!table.querySelector('[aria-rowindex]') || !!table.getAttribute('aria-rowcount');
  if(diagnostics.virtualizationHints) warnings.push('Можлива віртуалізація. Потрібен адаптер прокручування для фактичної структури Gyro; отримано лише доступні DOM-рядки.');
  return {rows:collected,...initial,warnings,diagnostics,complete:false};
}
