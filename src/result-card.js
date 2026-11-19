const C = {paper:'#faf9f5', ink:'#262720', muted:'#62625a', line:'#d9d7ce', accent:'#ae3b24'};
const sans = 'Arial, Helvetica, sans-serif';
const graphemes = new Intl.Segmenter('id', {granularity:'grapheme'});

// Literal canvas text, never HTML. Preserve paragraphs and complete grapheme
// clusters (including combining marks and family emoji); never ellipsize content.
export function wrapText(ctx, text, width) {
  if (!String(text).trim()) return [];
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const {segment} of graphemes.segment(word)) {
        if (line && ctx.measureText(line + segment).width > width) { lines.push(line); line = ''; }
        line += segment;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function fitText(ctx, text, box, {size=32, family=sans, weight='normal', leading=1.2}={}) {
  let lines, lineHeight;
  while (true) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapText(ctx, text, box.w); lineHeight = size * leading;
    if (lines.length * lineHeight <= box.h && lines.every(line => ctx.measureText(line).width <= box.w)) break;
    if (size <= 8) throw new RangeError('Text cannot fit without clipping.');
    size -= 1;
  }
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  lines.forEach((line, i) => ctx.fillText(line, box.x, box.y + i * lineHeight));
  return {...box, size, lineHeight, lines, font:ctx.font};
}

// Same line count, less ragged headline. Never drop or rewrite words.
function balancedLines(ctx, text, width) {
  let best = wrapText(ctx,text,width);
  const score = lines => {
    const widths=lines.map(line=>ctx.measureText(line).width);
    return Math.max(...widths)-Math.min(...widths);
  };
  for(let w=width-12; w>=width*.8; w-=12){
    const candidate=wrapText(ctx,text,w);
    if(candidate.length===best.length && score(candidate)<score(best))best=candidate;
  }
  return best;
}

// Personal opinion, not a polling dashboard. A missing/invalid vote produces
// an invitation containing the question only. Aggregate data is never read.
export function renderResultCard(p, state, canvas=document.createElement('canvas')) {
  const votes=state?.votes;
  const v=votes&&Object.hasOwn(votes,p.id)?votes[p.id]:null;
  const selected=v&&Number.isInteger(v.index)&&v.index>=0&&v.index<p.options.length;
  const mode=selected?'personal':'invitation';
  const reason=selected&&typeof v.reason==='string'?v.reason:'';
  canvas.width=1080;
  const ctx=canvas.getContext('2d'), layout=[];
  const block=(text,role,y,{x=72,w=936,size=30,weight='400',color=C.ink,leading=1.25,balance=false,min=size,maxLines=Infinity}={})=>{
    let lines;
    do{
      ctx.font=`${weight} ${size}px ${sans}`;
      lines=balance?balancedLines(ctx,text,w):wrapText(ctx,text,w);
      if(lines.length<=maxLines||size<=min)break;
      size-=2;
    }while(true);
    const lineHeight=size*leading;
    const b={x,y,w,h:lines.length*lineHeight,size,lineHeight,lines,font:ctx.font,color,role};
    layout.push(b);return b;
  };
  block('gue doang?','brand',62,{size:30,weight:'700'});
  const question=block(p.question,'question',154,{size:78,min:64,maxLines:5,weight:'700',leading:1.12,balance:true});
  let y=question.y+question.h+66;
  let accent;
  if(selected){
    const label=block('Pilihanku','choice-label',y,{x:102,w:906,size:26,color:C.muted});
    const choice=block(p.options[v.index],'choice',label.y+label.h+14,{x:102,w:906,size:56,min:48,maxLines:3,weight:'700',color:C.accent,leading:1.16,balance:true});
    accent={x:72,y,w:5,h:choice.y+choice.h-y};
    y=choice.y+choice.h+38;
    if(reason.trim()){
      const b=block(reason,'reason',y,{x:102,w:906,size:32,leading:1.4});
      y=b.y+b.h+12;
    }
  }else{
    const b=block('Buka dilemanya, lalu pilih sisimu.','invitation',y,{size:32,color:C.muted});
    y=b.y+b.h;
  }
  // A little breathing room, not a fixed oversized poster. Long content grows
  // the canvas instead of clipping or reducing everything to unreadable type.
  const footerY=y+72;
  block('Kalau kamu?','cta',footerY,{size:42,weight:'700',leading:1.2});
  const disclosure=block('Demo lokal · Bukan hasil komunitas.','disclosure',footerY+88,{size:24,color:C.muted});
  canvas.height=Math.ceil(disclosure.y+disclosure.h+64);
  ctx.fillStyle=C.paper;ctx.fillRect(0,0,canvas.width,canvas.height);
  if(accent){ctx.fillStyle=C.accent;ctx.fillRect(accent.x,accent.y,accent.w,accent.h);}
  ctx.strokeStyle=C.line;ctx.lineWidth=1;ctx.beginPath();
  ctx.moveTo(72,footerY-28);ctx.lineTo(1008,footerY-28);ctx.stroke();
  for(const b of layout){
    ctx.font=b.font;ctx.fillStyle=b.color;ctx.textBaseline='top';ctx.textAlign='left';
    b.lines.forEach((line,i)=>ctx.fillText(line,b.x,b.y+i*b.lineHeight));
  }
  return {canvas,layout,mode,accent};
}
