import {aggregate} from './core.mjs';
const $=id=>document.getElementById(id), fmt=n=>n===null?'—':new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(n);
let games=[], selected='', sourceTab=null, generation=0;
function clear(message){generation++;games=[];selected='';$('tabs').replaceChildren();$('result').replaceChildren();$('status').textContent=message;$('context').textContent='Дані потребують нового сканування';}
function element(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function tabs(){
 $('tabs').replaceChildren();const q=$('search').value.toLowerCase();const visible=games.filter(g=>(g.name+' '+g.provider).toLowerCase().includes(q));
 if(!visible.some(g=>g.key===selected))selected=visible[0]?.key;
 for(const g of visible){const b=element('button',g.name+' · '+g.provider);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(g.key===selected));b.onclick=()=>{selected=g.key;tabs();};$('tabs').append(b);}render();
}
function render(){
 const root=$('result');root.replaceChildren();const g=games.find(g=>g.key===selected);if(!g){root.append(element('p','Ігор не знайдено. Перевірте дані та діагностику.'));return;}
 root.append(element('h2',g.name),element('p',g.provider));const stats=element('div');stats.className='stats';
 for(const [label,value] of [['Загальний RTP',g.rtp===null?'—':fmt(g.rtp)+'%'],['Сума ставок',fmt(g.bets)],['Сума виграшів',fmt(g.wins)],['Ігрові дні',g.days.length]]){const d=element('div');d.append(element('small',label),element('strong',value));stats.append(d);}root.append(stats);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 290');svg.setAttribute('role','img');svg.setAttribute('aria-label','Денний RTP. Точки доступні з клавіатури; значення також у таблиці нижче.');
 const add=(tag,attrs,txt)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(txt)e.textContent=txt;svg.append(e);return e;};
 const max=Math.max(110,...g.days.map(d=>d.rtp??0))*1.12, y=v=>245-v/max*220;
 const times=g.days.map(d=>Date.parse(d.date)), first=times[0], span=times.at(-1)-first;
 const x=i=>span?60+(times[i]-first)/span*510:315;
 for(let i=0;i<5;i++){const v=max*i/4;add('line',{x1:60,x2:570,y1:y(v),y2:y(v),stroke:'#28364d'});add('text',{x:52,y:y(v)+4,'text-anchor':'end'},fmt(v)+'%');}
 add('line',{x1:60,x2:570,y1:y(100),y2:y(100),stroke:'#e9bc74','stroke-dasharray':'5 5'});add('text',{x:570,y:y(100)-6,'text-anchor':'end'},'100%');
 let path='',pen=false;g.days.forEach((d,i)=>{if(d.rtp===null){pen=false;return;}path+=`${pen?'L':'M'}${x(i)},${y(d.rtp)} `;pen=true;});add('path',{d:path,fill:'none',stroke:'#55d9ca','stroke-width':2.5});
 const tip=element('div','Наведіть на точку або виберіть її клавішею Tab.');tip.id='tooltip';
 g.days.forEach((d,i)=>{if(d.rtp===null)return;const description=`${d.date} · RTP ${fmt(d.rtp)}%\nСтавки: ${fmt(d.bets)} · Виграші: ${fmt(d.wins)} · Кількість: ${fmt(d.count)}`;const c=add('circle',{cx:x(i),cy:y(d.rtp),r:5,tabindex:0,'aria-label':description});const title=document.createElementNS(ns,'title');title.textContent=description;c.append(title);c.onmouseenter=c.onfocus=()=>tip.textContent=description;});
 add('text',{x:60,y:275},g.days[0].date);if(g.days.length>1)add('text',{x:570,y:275,'text-anchor':'end'},g.days.at(-1).date);root.append(svg,tip);
 const details=element('details'),table=element('table'),head=element('tr');for(const v of ['Дата','RTP','Ставки','Виграші','К-сть'])head.append(element('th',v));table.append(head);
 for(const d of g.days){const tr=element('tr');for(const v of [d.date,d.rtp===null?'—':fmt(d.rtp)+'%',fmt(d.bets),fmt(d.wins),fmt(d.count)])tr.append(element('td',v));table.append(tr);}details.append(element('summary','Денні значення'),table);root.append(details);
}
$('search').oninput=tabs;
$('scan').onclick=async()=>{
 clear('Зчитування…');const run=generation;$('scan').disabled=true;
 try{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id || !tab.url?.startsWith('https://gyro.dataplat.site/'))throw Error('Виберіть вкладку https://gyro.dataplat.site/ з таблицею Games.');sourceTab=tab.id;
 const options=Object.fromEntries(['tableSelector','userSelector','periodSelector','nextSelector'].map(k=>[k,$(k).value.trim()]));
 const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:scanGyro,args:[options]});if(run!==generation)return;
 const data=aggregate(result.rows);games=data.games;$('diagnostics').textContent=JSON.stringify(result.diagnostics,null,2);
 const dates=games.flatMap(g=>g.days.map(d=>d.date)).sort();$('context').textContent=`User ID: ${result.user||'не визначено'} · Період: ${result.period||'не визначено'} · Ігор: ${games.length}`;
 const warnings=[...result.warnings];if(dates.length)warnings.push(`Дати прочитаних рядків: ${dates[0]} — ${dates.at(-1)}`);if(data.rejected)warnings.push(`Пропущено некоректних / неповних рядків: ${data.rejected}.`);if(!games.length)warnings.push('Дані ігор не знайдено.');$('status').textContent=warnings.join('\n');tabs();
 // Invalidate every snapshot when the page changes, including filters and SPA navigation.
 await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
 window.__gyroRtpObserver?.disconnect();clearTimeout(window.__gyroRtpTimer);
 const notify=()=>{clearTimeout(window.__gyroRtpTimer);window.__gyroRtpTimer=setTimeout(()=>chrome.runtime.sendMessage({type:'gyro-data-invalidated'}).catch(()=>{}),150);};
 window.__gyroRtpObserver=new MutationObserver(notify);window.__gyroRtpObserver.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
 if(!window.__gyroRtpListening){document.addEventListener('change',notify,true);document.addEventListener('input',notify,true);window.__gyroRtpListening=true;}
 }});
 }catch(e){if(run===generation)clear(`Помилка зчитування: ${e.message}`);}finally{$('scan').disabled=false;}
};
chrome.runtime.onMessage.addListener((m,s)=>{if(m.type==='gyro-data-invalidated'&&s.tab?.id===sourceTab)clear('Сторінка змінилася. Повторіть Scan Data для актуального користувача та періоду.');});
chrome.tabs.onActivated.addListener(()=>clear('Активну вкладку змінено. Повторіть Scan Data.'));
chrome.tabs.onUpdated.addListener((id,change)=>{if(id===sourceTab&&(change.url||change.status==='loading'))clear('Сторінка оновлюється. Повторіть Scan Data.');});
