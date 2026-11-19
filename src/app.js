import {renderResultCard} from './result-card.js';
import {topics,examples,validatePoll,encodePoll,decodePoll,vote,results} from './core.js';
const $=s=>document.querySelector(s);const key='gue-doang-demo-v1';let state={polls:[],votes:{},reports:{}};let activeTopic='Semua',active=null,toastTimer;
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
function button(text,fn,cls='button'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b}
function toast(message) {
  const notice = $('#toast');
  const container = document.querySelector('dialog[open]') || document.body;
  if (notice.parentElement !== container) container.append(notice);
  notice.textContent = message;
  notice.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => notice.classList.remove('visible'), 4500);
}
try{const saved=JSON.parse(localStorage.getItem(key));if(saved){state.polls=Array.isArray(saved.polls)?saved.polls.map(validatePoll):[];for(const [id,v] of Object.entries(saved.votes||{})){if(/^[\w-]{1,80}$/.test(id)&&v&&Number.isInteger(v.index)&&v.index>=0&&v.index<4&&typeof v.reason==='string'&&v.reason.length<=160)state.votes[id]=v}for(const [id,r] of Object.entries(saved.reports||{})){if(/^[\w-]{1,80}$/.test(id)&&typeof r==='string')state.reports[id]=r}}}catch{toast('Penyimpanan tidak terbaca. Demo dimulai ulang.')}
function save(){try{localStorage.setItem(key,JSON.stringify(state));return true}catch{toast('Penyimpanan browser penuh atau diblokir. Perubahan hanya berlaku sementara.');return false}}
function allPolls(){const map=new Map(examples.map(p=>[p.id,p]));for(const p of state.polls)map.set(p.id,p);return [...map.values()].sort((a,b)=>Number(a.example)-Number(b.example))}
const topicIconPaths = {
  'Sehari-hari': 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5 M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z',
  'Duit': 'M3 8.5 16 4a1.3 1.3 0 0 1 1.7.8l.7 2.4 M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z M21 12h-4a2 2 0 0 0 0 4h4',
  'Hubungan': 'M20.2 5.7a5 5 0 0 0-7.1 0L12 6.9l-1.2-1.2a5 5 0 1 0-7.1 7.1l8.3 8 8.2-8a5 5 0 0 0 0-7.1Z',
  'Kerja': 'M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7 M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z M3 12q9 4 18 0 M11 13.5v2h2v-2',
  'Makanan': 'M2.5 12h19a9.5 9.5 0 0 1-19 0Z M9 21h6 M8.5 9c-2-2 1.5-3.4 0-5.5 M13 9c-2-2 1.5-3.4 0-5.5 M17.5 9c-2-2 1.5-3.4 0-5.5',
  'Pertemanan': 'M4 4h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4.5 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M18.5 8.5h1.3A2.2 2.2 0 0 1 22 10.7v5.8a2 2 0 0 1-2 2h-.8l.1 2.5-4-2.5h-3a2.2 2.2 0 0 1-2.2-2.2'
};

function cardIcon(path) {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const line = document.createElementNS(namespace, 'path');
  line.setAttribute('d', path);
  icon.append(line);
  return icon;
}

function pollCard(poll) {
  const {total} = results(poll, state);
  const card = el('article', undefined, 'card');
  card.dataset.topic = poll.topic;
  card.dataset.pollId = poll.id;

  const top = el('div', undefined, 'card-top');
  const topic = el('span', poll.topic, 'tag');
  topic.prepend(cardIcon(topicIconPaths[poll.topic]));
  top.append(topic, el('span', poll.example ? 'Contoh' : 'Dilema lokal', 'example'));
  card.append(top, el('h3', poll.question));

  const options = el('div', undefined, 'card-options');
  poll.options.forEach((answer, index) => {
    const option = button(answer, () => openPoll(poll, total ? null : index), 'option-preview');
    if (total && state.votes[poll.id].index === index) {
      option.classList.add('is-chosen');
      option.setAttribute('aria-label', answer + ', pilihanmu');
    }
    const mark = el('span', undefined, 'choice-mark');
    mark.setAttribute('aria-hidden', 'true');
    option.prepend(mark);
    options.append(option);
  });

  const bottom = el('div', undefined, 'card-bottom');
  const detail = button('Lihat dilema', () => openPoll(poll), 'card-link');
  detail.append(cardIcon('M5 12h14m-6-6 6 6-6 6'));
  bottom.append(el('span', `${total} pilihan lokal`), detail);
  card.append(options, bottom);
  return card;
}

function render() {
  const polls = allPolls().filter(poll =>
    !Object.hasOwn(state.reports, poll.id) && (activeTopic === 'Semua' || poll.topic === activeTopic)
  );
  $('#feed-count').textContent = `${polls.length} dilema`;
  const feed = $('#feed');
  feed.replaceChildren(...polls.map(pollCard));
  if (!polls.length) {
    feed.append(el('div', 'Belum ada dilema di sini. Lempar yang pertama, yuk.', 'empty'));
  }
  for (const filter of $('#filters').children) {
    filter.setAttribute('aria-pressed', String(filter.dataset.topic === activeTopic));
  }
}
for(const t of ['Semua',...topics]){const b=button(t,()=>{activeTopic=t;render()},'filter');b.dataset.topic=t;$('#filters').append(b)}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (dialog.contains($('#toast'))) document.body.append($('#toast'));
    if (document.querySelector('dialog[open]')) return;
    if (document.activeElement !== document.body && !dialog.contains(document.activeElement)) return;
    const pollButton = active && document.querySelector(`.card[data-poll-id="${CSS.escape(active.id)}"] .card-bottom button`);
    (pollButton || $('#create-top')).focus();
  });
}
function show(d){if(!d.open)d.showModal()}
function addOption(value = '') {
  const row = el('div', undefined, 'option-field');
  const input = el('input');
  input.required = true;
  input.maxLength = 60;
  input.value = value;
  row.append(input, button('Hapus', () => {
    const neighbor = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    syncOptions();
    neighbor?.querySelector('input').focus();
  }, 'remove-option'));
  $('#option-fields').append(row);
  syncOptions();
  return input;
}
function syncOptions(){const rows=[...$('#option-fields').children];rows.forEach((r,i)=>{r.firstChild.setAttribute('aria-label',`Pilihan ${i+1}`);r.firstChild.placeholder=`Pilihan ${i+1}`;r.lastChild.disabled=rows.length<=2;r.lastChild.setAttribute('aria-label',`Hapus pilihan ${i+1}`)});$('#add-option').disabled=rows.length>=4}
function compose() {
  $('#compose-form').reset();
  $('#compose-error').textContent = '';
  $('#option-fields').replaceChildren();
  addOption();
  addOption();
  show($('#compose'));
  $('#compose').scrollTop = 0;
}
for(const id of ['create-top','create-bottom']) $('#'+id).onclick=compose;
for(const t of topics){const o=el('option',t);o.value=t;$('#topic').append(o)}
$('#add-option').onclick = () => {
  if ($('#option-fields').children.length < 4) addOption().focus();
};
$('#compose-form').onsubmit=e=>{e.preventDefault();try{const p=validatePoll({id:globalThis.crypto?.randomUUID?.()||`poll-${Date.now()}-${Math.random().toString(36).slice(2)}`,question:$('#question').value,topic:$('#topic').value,options:[...document.querySelectorAll('#option-fields input')].map(x=>x.value),example:false});state.polls.unshift(p);const stored=save();activeTopic='Semua';render();$('#compose').close();openPoll(p);toast(stored?'Dilema dibuat dan tersimpan di browser ini.':'Dilema dibuat sementara. Penyimpanan tidak tersedia.')}catch(err){$('#compose-error').textContent=err.message}};
function voteForm(poll, selected) {
  const form = el('form');
  form.id = 'vote-form';
  const options = el('fieldset', undefined, 'vote-fields');
  options.setAttribute('aria-label', 'Pilihan jawaban');
  poll.options.forEach((answer, index) => {
    const label = el('label', undefined, 'vote-option');
    const input = el('input');
    input.type = 'radio';
    input.name = 'vote';
    input.value = index;
    input.required = true;
    input.checked = selected === index;
    label.append(input, document.createTextNode(answer));
    options.append(label);
  });

  const label = el('label', 'Kenapa pilih itu?');
  label.htmlFor = 'reason';
  label.append(el('span', 'Opsional · Maks. 160 karakter'));
  const reason = el('textarea');
  reason.id = 'reason';
  reason.maxLength = 160;
  reason.rows = 2;
  reason.placeholder = 'Ceritain alasanmu…';
  const error = el('p', undefined, 'form-error');
  error.setAttribute('role', 'alert');
  const submit = el('button', 'Pilih & lihat hasil', 'button coral full');
  submit.type = 'submit';
  form.append(options, label, reason, error, submit);
  form.onsubmit = event => {
    event.preventDefault();
    try {
      const chosen = form.querySelector('input:checked');
      state = vote(state, poll, chosen ? Number(chosen.value) : -1, reason.value);
      save();
      render();
      openPoll(poll);
    } catch (err) {
      error.textContent = err.message;
    }
  };
  return form;
}

function pollResults(poll, result) {
  const content = document.createDocumentFragment();
  content.append(el('p', '1 pilihan lokal di browser ini.', 'muted'));
  const answers = el('div', undefined, 'result-list');
  poll.options.forEach((answer, index) => {
    const selected = index === state.votes[poll.id].index;
    const row = el('div', undefined, selected ? 'result-row is-selected' : 'result-row');
    const fill = el('div', undefined, 'result-fill');
    fill.style.width = `${result.percentages[index]}%`;
    const label = el('div', undefined, 'result-label');
    const name = el('span', answer);
    if (selected) {
      const marker = el('small', 'Pilihanmu', 'own-choice');
      name.append(marker);
    }
    label.append(name, el('b', `${result.percentages[index]}%`));
    row.append(fill, label);
    answers.append(row);
  });
  content.append(answers);
  const reason = state.votes[poll.id].reason;
  if (reason) content.append(el('h3', 'Alasanmu'), el('p', reason, 'reason'));
  else content.append(el('p', 'Kamu memilih tanpa menambahkan alasan.', 'result-caption'));
  return content;
}

function openPoll(poll, selected = null) {
  active = poll;
  $('#detail-topic').textContent = `${poll.topic} · ${poll.example ? 'Contoh' : 'Dilema lokal'}`;
  const body = $('#detail-body');
  const title = el('h2', poll.question);
  title.id = 'detail-title';
  title.tabIndex = -1;
  body.replaceChildren(title);
  const result = results(poll, state);
  if (result.total) body.append(pollResults(poll, result));
  else body.append(el('p', 'Pilih satu jawaban.', 'muted'), voteForm(poll, selected));

  const actions = el('div', undefined, 'actions');
  actions.append(
    button(result.total ? 'Bagikan pilihanku' : 'Bagikan pertanyaan', () => download(poll)),
    button('Salin tautan', () => share(poll))
  );
  const pngHint = result.total
    ? 'PNG berisi pilihanmu' + (state.votes[poll.id].reason ? ' dan alasanmu.' : '.')
    : 'PNG berisi ajakan menjawab.';
  body.append(
    actions,
    el('p', pngHint + ' Tautan berisi pertanyaan dan opsi.', 'result-caption'),
    el('p', 'Demo ini belum terhubung ke server bersama. Hasil hanya ada di browser ini.', 'result-caption'),
    button('Laporkan & sembunyikan', () => report(poll), 'text-button')
  );
  const dialog = $('#detail');
  show(dialog);
  dialog.scrollTop = 0;
  title.focus({preventScroll: true});
}
async function share(p){const url=new URL(location.origin+location.pathname);url.hash='poll='+encodePoll(p);try{await navigator.clipboard.writeText(url.href);toast('Tautan tersalin. Yang dibagikan hanya pertanyaannya.')}catch{let input=$('#share-link');if(!input){input=el('input',undefined,'link-fallback');input.id='share-link';input.readOnly=true;input.setAttribute('aria-label','Tautan dilema — salin manual');$('#detail-body').append(input)}input.value=url.href;input.focus();input.select();toast('Salin tautan dari kotak yang muncul.')}}
let shareMascots;
async function download(poll) {
  const votesAtClick = state.votes;
  try {
    const mark = document.querySelector('.site-header .logo img');
    if (!shareMascots || (shareMascots.complete && !shareMascots.naturalWidth)) {
      shareMascots = new Image();
      shareMascots.src = new URL('./assets/share-mascots.webp', import.meta.url);
    }
    const mascots = shareMascots;
    await Promise.allSettled([
      mark?.decode?.(),
      mascots.decode?.(),
      document.fonts?.load('800 64px "Bricolage Grotesque"'),
      document.fonts?.load('400 32px "DM Sans"'),
      document.fonts?.load('600 32px "DM Sans"'),
    ]);
    const {canvas, mode} = renderResultCard(poll, {votes: votesAtClick}, undefined, {
      mark: mark?.complete && mark.naturalWidth ? mark : null,
      mascots: mascots.complete && mascots.naturalWidth ? mascots : null,
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gue-doang-${mode === 'personal' ? 'pilihanku' : 'pertanyaan'}-${poll.id}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(mode === 'personal' ? 'PNG pilihanmu dibuat, berlabel Demo lokal.' : 'PNG ajakan dibuat. Belum ada pilihan yang dibagikan.');
  } catch {
    toast('Kartu gagal dibuat. Coba browser lain.');
  }
}
function info(title) {
  const heading = $('#info-title');
  heading.textContent = title;
  const body = $('#info-body');
  body.replaceChildren();
  show($('#info'));
  $('#info').scrollTop = 0;
  heading.focus({preventScroll: true});
  return body;
}
function report(p){$('#detail').close();const b=info('Bantu jaga ruang ini.');b.append(el('p','Laporan demo tidak dikirim ke moderator. Dilema akan disembunyikan hanya di browser ini.'));const form=el('form');const label=el('label','Alasan laporan');label.htmlFor='report-reason';const select=el('select');select.id='report-reason';for(const t of ['Spam atau promosi','Merendahkan / ujaran kebencian','Data pribadi','Konten tidak pantas','Lainnya'])select.append(el('option',t));const submit=el('button','Simpan laporan & sembunyikan','button dark full');submit.style.marginTop='20px';submit.type='submit';form.append(label,select,submit);form.onsubmit=e=>{e.preventDefault();state.reports[p.id]=select.value;save();render();$('#info').close();toast('Disembunyikan di browser ini. Laporan tidak dikirim.')};b.append(form)}
function showAbout() {
  const body = info('Cara kerja');
  const list = el('ul');
  const notes = [
    'Setiap contoh mulai dari nol pilihan. Kamu juga bisa bikin dilema sendiri.',
    'Kamu bisa pilih sekali per dilema di browser ini. Menghapus data browser juga menghapus pilihan dan alasanmu.',
    'Tautan memuat pertanyaan dan opsi. Siapa pun yang punya tautannya bisa membacanya, jadi hindari informasi pribadi.',
    'Sebelum memilih, kartu PNG berisi pertanyaan. Sesudah memilih, kartu berisi pilihan dan alasanmu jika diisi.',
    'Semua hasil dan laporan disimpan di browser ini. Belum ada perhitungan suara bersama atau moderator aktif.'
  ];
  for (const note of notes) list.append(el('li', note));
  body.append(list);
}
for (const trigger of document.querySelectorAll('[data-about]')) trigger.onclick = showAbout;
$('#moderation').onclick=()=>{const b=info('Beda pendapat, tetap baik.');b.append(el('p','Jangan unggah data pribadi, ancaman, kebencian, atau tuduhan terhadap individu. Moderasi demo hanya menyembunyikan dilema di perangkat ini; tidak ada laporan yang dikirim.'));const entries=Object.entries(state.reports);b.append(el('h3',`Laporan lokal (${entries.length})`));if(!entries.length)b.append(el('p','Belum ada laporan tersimpan.'));for(const [id,reason] of entries){const p=allPolls().find(p=>p.id===id);const row=el('div',undefined,'hidden-report');row.append(el('b',p?.question||'Dilema tidak tersedia'),el('p',reason),button('Tampilkan lagi',()=>{delete state.reports[id];save();render();$('#moderation').click()},'text-button'));b.append(row)}};
function importHash(){if(!location.hash.startsWith('#poll='))return;try{const p=decodePoll(location.hash.slice(6));const existing=allPolls().find(x=>x.id===p.id);if(existing&&(existing.question!==p.question||existing.topic!==p.topic||JSON.stringify(existing.options)!==JSON.stringify(p.options)))throw Error('Identitas tautan bentrok dengan dilema tersimpan.');if(!existing){state.polls.unshift({...p,example:false});save()}$('#shared-note').hidden=false;$('#shared-note').textContent='Dilema dari tautan. Pertanyaannya sama, pilihanmu tetap lokal — bukan voting bersama.';render();if(!Object.hasOwn(state.reports,p.id))openPoll(existing||p);else toast('Dilema ini kamu sembunyikan. Pulihkan lewat laporan lokal.')}catch(err){toast(err.message)}}
render();importHash();addEventListener('hashchange',importHash);
