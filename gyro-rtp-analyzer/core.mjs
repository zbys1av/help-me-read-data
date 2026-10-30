export function number(value) {
  let s = String(value ?? '').trim().replace(/[\s\u00a0\u202f$€£₴%]/g, '');
  if (!s || /^[-—–]+$/.test(s)) return null;
  const negative = /^\(.*\)$/.test(s); s = s.replace(/[()]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /^[-+]?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s); return Number.isFinite(n) ? (negative ? -n : n) : null;
}
export function date(value) {
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) { const x = s.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/); if (x) m = [s,x[3],x[2],x[1]]; }
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(iso); return !isNaN(d) && d.toISOString().slice(0,10) === iso ? iso : null;
}
export function aggregate(rows) {
  const games = new Map(); let rejected = 0;
  for (const r of rows) {
    const day = date(r.date), bets = number(r.bets), wins = number(r.wins), count = number(r.count);
    if (!day || !r.game?.trim() || !r.provider?.trim() || bets === null || bets < 0 || wins === null || wins < 0 || count === null || count < 0 || !Number.isInteger(count)) { rejected++; continue; }
    const key = JSON.stringify([r.provider.trim(), r.game.trim()]);
    if (!games.has(key)) games.set(key, {key, name:r.game.trim(), provider:r.provider.trim(), days:new Map()});
    const game = games.get(key);
    const point = game.days.get(day) ?? {date:day,bets:0,wins:0,count:0};
    point.bets += bets; point.wins += wins; point.count += count; game.days.set(day,point);
  }
  return {rejected, games:[...games.values()].map(g => {
    const days = [...g.days.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({...d,rtp:d.bets ? d.wins/d.bets*100 : null}));
    const bets = days.reduce((s,d)=>s+d.bets,0), wins=days.reduce((s,d)=>s+d.wins,0);
    return {...g,days,bets,wins,rtp:bets ? wins/bets*100 : null};
  })};
}
