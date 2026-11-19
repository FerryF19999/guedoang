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
test('unvoted card invites without inventing a choice or aggregate',()=>{
 const card=renderResultCard(poll,{votes:{}},canvas());
 assert.equal(card.mode,'invitation');
 assert.equal(card.layout.filter(b=>b.role==='choice').length,0);
 assert.equal(card.layout.filter(b=>['percentage','count','reason','disclosure'].includes(b.role)).length,0);
 assert.ok(card.layout.some(b=>b.role==='cta'&&b.lines.join(' ')==='Kalau kamu?'));
});
test('personal card shows only exact selected option and actual optional reason',()=>{
 const card=renderResultCard(poll,{votes:{test:{index:1,reason:'Biar simpel.'}}},canvas());
 assert.equal(card.mode,'personal');
 assert.equal(card.layout.find(b=>b.role==='choice').lines.join(''),poll.options[1]);
 assert.equal(card.layout.find(b=>b.role==='reason').lines.join(''),'Biar simpel.');
 assert.ok(!card.layout.some(b=>['percentage','count','option','disclosure'].includes(b.role)));
 assert.ok(!JSON.stringify(card.layout).includes(poll.options[0]));
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
