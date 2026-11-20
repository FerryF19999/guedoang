const ink = '#262720';
const secondary = '#4d4b44';
const display = '"Bricolage Grotesque", Arial, sans-serif';
const body = '"DM Sans", Arial, sans-serif';
const sans = 'Arial, Helvetica, sans-serif';
const graphemes = new Intl.Segmenter('id', {granularity:'grapheme'});
const number = new Intl.NumberFormat('id-ID');

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

// A speech bubble groups the text that belongs to the person speaking.
function drawBubble(ctx, top, height) {
  const left = 72, right = 1008, bottom = top + height, radius = 40;
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(right - radius, top);
  ctx.quadraticCurveTo(right, top, right, top + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(right - 100, bottom);
  ctx.quadraticCurveTo(right - 88, bottom + 28, right - 65, bottom + 52);
  ctx.quadraticCurveTo(right - 127, bottom + 43, right - 169, bottom);
  ctx.lineTo(left + radius, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.closePath();
  ctx.fillStyle = '#fffdf4';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = ink;
  ctx.stroke();
}

function cardStatistic(poll, selected) {
  const optionsLabel = poll.options.length + ' pilihan';
  const counts = poll.counts;
  if (poll.archived || !Array.isArray(counts) || counts.length !== poll.options.length) return optionsLabel;
  let total = 0;
  for (const count of counts) {
    if (!Number.isSafeInteger(count) || count < 0) return optionsLabel;
    total += count;
  }
  if (!Number.isSafeInteger(total)) return optionsLabel;
  if (selected === null) return number.format(total) + ' suara masuk';
  const chosen = counts[selected];
  if (chosen === 0) return optionsLabel;
  const percent = Math.round(100 * chosen / total);
  return percent + '% · ' + number.format(chosen) + ' dari ' + number.format(total) + ' suara';
}

export function renderResultCard(poll, state, canvas = document.createElement('canvas'), assets = {}) {
  const votes = state?.votes;
  const vote = votes && Object.hasOwn(votes, poll.id) ? votes[poll.id] : null;
  const personal = Number.isInteger(vote?.index) && vote.index >= 0 && vote.index < poll.options.length;
  const reason = personal && typeof vote.reason === 'string' ? vote.reason : '';
  canvas.width = 1080;
  const ctx = canvas.getContext('2d');
  const layout = [];

  function block(text, role, y, {x = 72, w = 936, size, min = size, maxLines = Infinity,
    family = display, weight = 800, color = ink, leading = 1.13, balance = false}) {
    let lines;
    for (;;) {
      ctx.font = `${weight} ${size}px ${family}`;
      lines = balance ? balancedLines(ctx, text, w) : wrapText(ctx, text, w);
      if (lines.length <= maxLines || size <= min) break;
      size = Math.max(min, size - 2);
    }
    const lineHeight = size * leading;
    const item = {role, lines, x, y, w, h: lines.length * lineHeight, font: ctx.font,
      size, lineHeight, color};
    layout.push(item);
    return item;
  }

  const brandX = assets.mark ? 146 : 72;
  block('gue doang?', 'brand', 70, {x: brandX, w: 430, size: 46});
  let topicChip;
  if (poll.topic) {
    ctx.font = `600 32px ${body}`;
    const textWidth = Math.ceil(ctx.measureText(poll.topic).width) + 2;
    topicChip = {x: 1008 - textWidth - 52, w: textWidth + 52};
    block(poll.topic, 'topic', 77, {x: topicChip.x + 26, w: textWidth, size: 32, family: body, weight: 600});
  }

  // Measure the conversation first. Short posts share a square format. Longer
  // posts extend the paper so the question, answer and reason stay readable.
  const bodyStart = layout.length;
  let bubbleTop = 0;
  const inset = {x: 122, w: 836};
  if (personal) {
    const question = block(poll.question, 'question', 0,
      {size: 49, min: 43, maxLines: 4, family: body, weight: 600, leading: 1.19, balance: true});
    bubbleTop = question.h + 42;
  }
  let cursor = bubbleTop + 46;
  if (personal) {
    const label = block('Pilihanku', 'choice-label', cursor,
      {...inset, size: 31, weight: 600, family: body, color: secondary});
    cursor += label.h + 13;
  }
  const spoken = personal ? poll.options[vote.index] : poll.question;
  const minSize = personal ? 70 : 72;
  ctx.font = `800 ${minSize}px ${display}`;
  const shortAnswer = personal && !spoken.includes('\n') && ctx.measureText(spoken).width <= inset.w;
  const headline = block(spoken, personal ? 'choice' : 'question', cursor, {
    ...inset, size: 89, min: minSize, maxLines: shortAnswer ? 1 : (personal ? 3 : 6),
    balance: true, leading: 1.08,
  });
  cursor += headline.h;
  if (reason.trim()) {
    const explanation = block(reason, 'reason', cursor + 26,
      {...inset, size: 36, family: body, weight: 400, leading: 1.32});
    cursor = explanation.y + explanation.h;
  }
  const bubbleBottom = cursor + 47;
  // The public tally sits outside the speaker's bubble, clear of its tail.
  const statistic = block(cardStatistic(poll, personal ? vote.index : null), 'statistic', bubbleBottom + 25,
    {w: 740, size: 44, min: 38, maxLines: 1, weight: 700, color: ink});
  const conversationHeight = statistic.y + statistic.h;
  const contentTop = 200;
  const footerSpace = 258;
  canvas.height = Math.ceil(Math.max(1080, contentTop + conversationHeight + footerSpace));
  const extraSpace = canvas.height - (contentTop + conversationHeight + footerSpace);
  const conversationY = contentTop + Math.round(extraSpace * .52);
  for (const item of layout.slice(bodyStart)) item.y += conversationY;

  const footerY = canvas.height - footerSpace;
  if (poll.archived) {
    block('Kalau kamu?', 'cta', footerY + 102, {w: 545, size: 56});
  } else {
    const cta = block(personal ? 'Kita satu tim?' : 'Lu pilih mana?', 'cta', footerY + 78,
      {w: 545, size: 56, min: 48, maxLines: 1});
    block('guedoang.vercel.app', 'site', cta.y + cta.h + 6,
      {w: 545, size: 32, family: body, weight: 600, color: secondary});
  }

  ctx.fillStyle = personal ? '#e4d6f6' : '#ffeba7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.moveTo(72, 155);
  ctx.lineTo(1008, 155);
  ctx.lineWidth = 2;
  ctx.strokeStyle = personal ? '#a695b8' : '#bcaa76';
  ctx.stroke();

  if (assets.mark) ctx.drawImage(assets.mark, 68, 62, 65, 65);
  if (topicChip) {
    ctx.fillStyle = personal ? '#efe6fb' : '#fff4cd';
    ctx.beginPath();
    ctx.roundRect(topicChip.x, 65, topicChip.w, 62, 31);
    ctx.fill();
  }
  drawBubble(ctx, bubbleTop + conversationY, bubbleBottom - bubbleTop);
  if (assets.mascots) {
    const width = Math.min(336, 181 * assets.mascots.naturalWidth / assets.mascots.naturalHeight);
    const height = width * assets.mascots.naturalHeight / assets.mascots.naturalWidth;
    ctx.drawImage(assets.mascots, 1008 - width, canvas.height - 68 - height, width, height);
  }
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (const item of layout) {
    ctx.font = item.font;
    ctx.fillStyle = item.color;
    item.lines.forEach((line, index) => ctx.fillText(line, item.x, item.y + index * item.lineHeight));
  }
  return {canvas, layout, mode: personal ? 'personal' : 'invitation'};
}
