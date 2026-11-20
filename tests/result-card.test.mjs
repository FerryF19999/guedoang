import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapText,fitText,renderResultCard} from '../src/result-card.js';
function canvas() {
  const ctx = context();
  for (const method of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo',
    'closePath', 'stroke', 'fill', 'roundRect', 'drawImage']) ctx[method] = () => {};
  return {getContext: () => ctx};
}
const poll={id:'test',question:'Makan bareng, bayarnya gimana?',topic:'Duit',options:['Bayar pesanan sendiri','Bagi rata']};
test('an unvoted public card shows the total without revealing the split',()=>{
 const card=renderResultCard({...poll,counts:[10,2]},{votes:{}},canvas());
 assert.equal(card.mode,'invitation');
 assert.equal(card.layout.filter(b=>b.role==='choice').length,0);
 assert.equal(card.layout.find(b=>b.role==='statistic').lines.join(' '),'12 suara masuk');
 assert.ok(!card.layout.some(b=>b.role==='reason'||b.lines.join(' ').includes('%')));
 assert.equal(card.layout.find(b=>b.role==='cta').lines.join(' '),'Lu pilih mana?');
 assert.equal(card.layout.find(b=>b.role==='site').lines.join(''),'guedoang.vercel.app');
});
test('personal card shows only exact selected option and actual optional reason',()=>{
 const card=renderResultCard({...poll,counts:[2,1]},{votes:{test:{index:1,reason:'Biar simpel.'}}},canvas());
 assert.equal(card.mode,'personal');
 assert.equal(card.layout.find(b=>b.role==='choice').lines.join(''),poll.options[1]);
 assert.equal(card.layout.find(b=>b.role==='reason').lines.join(''),'Biar simpel.');
 assert.equal(card.layout.find(b=>b.role==='cta').lines.join(' '),'Kita satu tim?');
 assert.equal(card.layout.find(b=>b.role==='site').lines.join(''),'guedoang.vercel.app');
 assert.equal(card.layout.find(b=>b.role==='statistic').lines.join(' '),'33% · 1 dari 3 suara');
 assert.ok(!JSON.stringify(card.layout).includes(poll.options[0]));
});
test('a card distinguishes zero, the first voter, and an evenly split vote',()=>{
 for(const [counts,votes,expected] of [
  [[0,0],{},'0 suara masuk'],
  [[0,1],{test:{index:1}},'100% · 1 dari 1 suara'],
  [[500,500],{test:{index:0}},'50% · 500 dari 1.000 suara'],
 ]) {
  const card=renderResultCard({...poll,counts},{votes},canvas());
  assert.equal(card.layout.find(b=>b.role==='statistic').lines.join(' '),expected);
 }
});
test('missing, invalid and inconsistent counts show only the known option count',()=>{
 for(const counts of [undefined,[],[0],[0,0],[4,0],[-1,1],[0,'1'],[1.5,1],[Number.MAX_SAFE_INTEGER,1]]) {
  const card=renderResultCard({...poll,counts},{votes:{test:{index:1}}},canvas());
  assert.equal(card.layout.find(b=>b.role==='statistic').lines.join(' '),'2 pilihan');
 }
});
test('private archives show an option count even if public vote counts are present',()=>{
 for(const votes of [{},{test:{index:0}}]) {
  const card=renderResultCard({...poll,counts:[8,2],archived:true},{votes},canvas());
  assert.equal(card.layout.find(b=>b.role==='statistic').lines.join(' '),'2 pilihan');
  assert.equal(card.layout.find(b=>b.role==='cta').lines.join(' '),'Kalau kamu?');
  assert.ok(!card.layout.some(b=>b.role==='site'));
 }
});
test('absent reason is omitted; invalid and inherited votes never select an option',()=>{
 assert.ok(!renderResultCard(poll,{votes:{test:{index:0,reason:''}}},canvas()).layout.some(b=>b.role==='reason'));
 for(const v of [null,{index:-1},{index:2},{index:'0'},{index:NaN}]) assert.equal(renderResultCard(poll,{votes:{test:v}},canvas()).mode,'invitation');
 assert.equal(renderResultCard(poll,{votes:Object.create({test:{index:0}})},canvas()).mode,'invitation');
});
function context(){return {font:'20px Arial',draws:[],measureText(s){return {width:Array.from(s).length*Number(this.font.match(/(\d+)px/)[1])*.7}},fillText(...args){this.draws.push(args)}}}
test('wraps words, retains literal markup, and breaks oversized Unicode tokens',()=>{
 const ctx=context();
 assert.deepEqual(wrapText(ctx,'one two three',100),['one two','three']);
 for(const s of ['W'.repeat(180),'😀'.repeat(90),'<img src=x onerror=alert(1)>']){
  const lines=wrapText(ctx,s,100);
  assert.equal(lines.join('').replaceAll(' ',''),s.replaceAll(' ',''));
  assert.ok(lines.every(line=>ctx.measureText(line).width<=100));
 }
});
test('bounded fitting preserves all long text within its allocated rectangle',()=>{
 const ctx=context();const text='W'.repeat(180);
 const fit=fitText(ctx,text,{x:72,y:211,w:936,h:295},{size:68,weight:'bold',leading:1.12});
 assert.equal(fit.lines.join(''),text);
 assert.ok(fit.size<68);assert.ok(fit.lines.length*fit.lineHeight<=fit.h);
 assert.equal(ctx.draws.length,fit.lines.length);
 assert.ok(ctx.draws.every(([line,x,y])=>x===72&&y>=211&&y+fit.lineHeight<=506&&ctx.measureText(line).width<=936));
});
test('empty text is safe and never produces undefined canvas text',()=>{
 const ctx=context();assert.deepEqual(wrapText(ctx,'   ',100),[]);
 fitText(ctx,'',{x:0,y:0,w:100,h:100});assert.equal(ctx.draws.length,0);
});
test('wraps Unicode graphemes without splitting emoji families or accents',()=>{
 const ctx=context();
 for(const cluster of ['e\u0301','👩🏽‍💻','👨‍👩‍👧‍👦']){
  const width=ctx.measureText(cluster).width*1.1;
  assert.deepEqual(wrapText(ctx,cluster.repeat(3),width),[cluster,cluster,cluster]);
 }
 assert.deepEqual(wrapText(ctx,'one\ntwo',100),['one','two']);
});
test('impossibly small fit throws rather than silently clipping content',()=>{
 assert.throws(()=>fitText(context(),'cannot fit',{x:0,y:0,w:1,h:1}),RangeError);
});
test('short content gets a smaller canvas rather than fixed empty poster space',()=>{
 const short=renderResultCard({...poll,question:'Pilih apa?'},{votes:{}},canvas());
 const long=renderResultCard({...poll,question:'W'.repeat(180)},{votes:{}},canvas());
 assert.ok(short.canvas.height<long.canvas.height);
 assert.equal(short.canvas.width,1080);
});
test('a short chosen answer fits on one line at display size', () => {
  const pollWithAnswer = {...poll, options: ['Mending dibagi', 'Bayar sendiri']};
  const card = renderResultCard(pollWithAnswer, {votes: {test: {index: 0}}}, canvas());
  const answer = card.layout.find(block => block.role === 'choice');
  assert.deepEqual(answer.lines, ['Mending dibagi']);
  assert.ok(answer.size >= 70);
});
