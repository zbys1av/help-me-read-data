import {test} from 'node:test';
import assert from 'node:assert/strict';
import {number,date,aggregate} from '../gyro-rtp-analyzer/core.mjs';
const row=(extra={})=>({date:'07/10/2026',provider:'Provider A',game:'Game',bets:'100',wins:'50',count:'10',...extra});
test('currency and locale formats; blanks are not zero',()=>{
 assert.equal(number('$1,407.8'),1407.8);assert.equal(number('1 407,80'),1407.8);assert.equal(number('1.407,80'),1407.8);assert.equal(number(''),null);assert.equal(number('—'),null);assert.equal(number('0'),0);assert.equal(number('unknown'),null);
});
test('strict day-first dates and leap dates',()=>{assert.equal(date('07/10/2026'),'2026-10-07');assert.equal(date('31/02/2026'),null);assert.equal(date('2024-02-29'),'2024-02-29');});
test('weighted daily and period RTP, no mean of percentages',()=>{
 const {games:[g]}=aggregate([row(),row({bets:'900',wins:'1800',count:'90'}),row({date:'08/10/2026',bets:'100',wins:'0'})]);
 assert.equal(g.days[0].rtp,185);assert.equal(g.days[0].count,100);assert.equal(g.bets,1100);assert.equal(g.rtp,1850/1100*100);assert.equal(g.days.length,2);
});
test('same names with different providers remain separate',()=>{assert.equal(aggregate([row(),row({provider:'Provider B'})]).games.length,2);});
test('zero bets have null RTP, no invented dates',()=>{const {games:[g]}=aggregate([row({bets:'0',wins:'10'})]);assert.equal(g.rtp,null);assert.equal(g.days[0].rtp,null);assert.equal(g.days.length,1);});
test('missing or invalid inputs are rejected',()=>{assert.equal(aggregate([row({date:''}),row({bets:''}),row({provider:''}),row({count:'1.5'}),row({wins:'NaN'})]).rejected,5);});
test('fresh scan does not accumulate previous results; identical legitimate rows sum',()=>{const input=[row(),row()];assert.deepEqual(aggregate(input),aggregate(input));assert.equal(aggregate(input).games[0].bets,200);assert.equal(aggregate([row({game:'New'})]).games[0].name,'New');});
