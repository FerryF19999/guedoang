import {renderResultCard} from './result-card.js';
import {topics, examples, validatePoll, encodePoll, decodePoll, voteReaction} from './core.js';
const $ = selector => document.querySelector(selector);
let polls = new Map();
let reports = new Map();
let activeTopic = 'Semua', active = null, toastTimer;
let feedReady = false, feedError = '', revision = 0;
let detailSession = 0;
let nextPage = null, paging = false;
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
// Previous releases kept questions and reasons solely in this browser.
const archive = new Map();
try {
  const saved = JSON.parse(localStorage.getItem('gue-doang-demo-v1'));
  if (saved) {
    const questions = [...examples, ...(Array.isArray(saved.polls) ? saved.polls : [])];
    for (const item of questions) {
      if (!item) continue;
      if (item.example && !Object.hasOwn(saved.votes || {}, item.id) && !Object.hasOwn(saved.reports || {}, item.id)) continue;
      try {
        const poll = validatePoll(item);
        const vote = Object.hasOwn(saved.votes || {}, poll.id) ? saved.votes[poll.id] : null;
        poll.myVote = Number.isInteger(vote?.index) && vote.index >= 0 && vote.index < poll.options.length
          ? {index: vote.index, reason: typeof vote.reason === 'string' ? vote.reason : ''} : null;
        poll.archived = true;
        archive.set(poll.id, poll);
      } catch { /* Other saved questions can still be read. */ }
    }
  }
} catch { /* A fresh public session also works with storage disabled. */ }

async function request(path, method = 'GET', body, headers = {}) {
  let response;
  try {
    response = await fetch('/api/' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body ? {'Content-Type': 'application/json', ...headers} : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Koneksi terputus. Periksa jaringan dan coba lagi.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message = typeof data?.error === 'string' ? data.error : data?.message;
    const error = new Error(message || 'Layanan voting belum bisa dihubungi. Coba lagi.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function publicPoll(item) {
  const poll = validatePoll(item);
  if (!Array.isArray(item.counts) || item.counts.length !== poll.options.length ||
      !item.counts.every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error('Hasil voting gagal dimuat. Coba lagi.');
  }
  return {...poll, counts: item.counts, myVote: item.myVote || null, hidden: item.hidden === true};
}

function totalVotes(poll) {
  return poll.counts.reduce((sum, count) => sum + count, 0);
}

function acceptPoll(item) {
  const poll = publicPoll(item);
  ++revision;
  if (polls.has(poll.id)) polls.set(poll.id, poll);
  else polls = new Map([[poll.id, poll], ...polls]);
  render();
  return poll;
}

async function loadFeed() {
  const current = ++revision;
  try {
    const data = await request('polls');
    const next = data.polls.map(publicPoll);
    if (current !== revision) return false;
    polls = new Map(next.map(poll => [poll.id, poll]));
    reports = new Map(data.reports.map(report => [report.id, report]));
    nextPage = data.next || null;
    feedReady = true;
    feedError = '';
    render();
    return true;
  } catch (err) {
    if (current !== revision) return false;
    feedError = err.message;
    render();
    return false;
  }
}
async function loadMore() {
  if (!nextPage || paging) return;
  const current = revision;
  paging = true;
  render();
  try {
    const data = await request('polls?before=' + encodeURIComponent(nextPage));
    if (current !== revision) return;
    for (const item of data.polls) {
      const poll = publicPoll(item);
      polls.set(poll.id, poll);
    }
    nextPage = data.next || null;
  } catch (err) {
    toast(err.message);
  } finally {
    paging = false;
    render();
  }
}

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
  const total = totalVotes(poll);
  const card = el('article', undefined, 'card');
  card.dataset.topic = poll.topic;
  card.dataset.pollId = poll.id;

  const top = el('div', undefined, 'card-top');
  const topic = el('span', poll.topic, 'tag');
  topic.prepend(cardIcon(topicIconPaths[poll.topic]));
  top.append(topic, el('span', poll.example ? 'Gue Doang?' : 'Komunitas', 'example'));
  card.append(top, el('h3', poll.question));

  const options = el('div', undefined, 'card-options');
  poll.options.forEach((answer, index) => {
    const option = button(answer, () => openFeedPoll(poll, poll.myVote ? null : index), 'option-preview');
    if (poll.myVote?.index === index) {
      option.classList.add('is-chosen');
      option.setAttribute('aria-label', answer + ', pilihanmu');
    }
    const mark = el('span', undefined, 'choice-mark');
    mark.setAttribute('aria-hidden', 'true');
    option.prepend(mark);
    options.append(option);
  });

  const bottom = el('div', undefined, 'card-bottom');
  const detail = button('Lihat dilema', () => openFeedPoll(poll), 'card-link');
  detail.append(cardIcon('M5 12h14m-6-6 6 6-6 6'));
  const status = total + ' suara' + (poll.myVote ? ' · Sudah memilih' : '');
  bottom.append(el('span', status), detail);
  card.append(options, bottom);
  return card;
}

function render() {
  const visible = [...polls.values()].filter(poll =>
    !poll.hidden && !reports.has(poll.id) && (activeTopic === 'Semua' || poll.topic === activeTopic)
  );
  $('#feed-count').textContent = feedReady ? visible.length + ' dilema' : '';
  const feed = $('#feed');
  feed.replaceChildren(...visible.map(pollCard));
  if (feedError || !feedReady) {
    const status = el('div', undefined, 'empty');
    status.setAttribute('role', 'status');
    status.append(el('p', feedError || 'Memuat dilema…'));
    if (feedError) status.append(button('Coba lagi', async () => {
      if (await loadFeed()) openLinkedPoll();
    }, 'text-button'));
    feed.prepend(status);
  } else if (!visible.length) {
    feed.append(el('div', nextPage ? 'Belum ada dilema dengan topik ini di daftar yang dimuat.' :
      'Belum ada dilema di sini. Lempar yang pertama, yuk.', 'empty'));
  }
  const more = $('#more-polls');
  more.hidden = !nextPage;
  more.disabled = paging;
  more.textContent = paging ? 'Memuat…' : 'Muat dilema lainnya';
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
let composeSession = 0;
let creationKey, creationPayload;
function compose(draft) {
  composeSession++;
  creationKey = creationPayload = null;
  $('#compose-form').reset();
  $('#compose-error').textContent = '';
  $('#compose-form [type="submit"]').disabled = false;
  $('#option-fields').replaceChildren();
  if (draft) {
    $('#question').value = draft.question;
    $('#topic').value = draft.topic;
    draft.options.forEach(addOption);
  } else {
    addOption();
    addOption();
  }
  show($('#compose'));
  $('#compose').scrollTop = 0;
}
for (const id of ['create-top', 'create-bottom']) $('#' + id).onclick = () => compose();
for(const t of topics){const o=el('option',t);o.value=t;$('#topic').append(o)}
$('#add-option').onclick = () => {
  if ($('#option-fields').children.length < 4) addOption().focus();
};
$('#compose-form').onsubmit = async event => {
  event.preventDefault();
  const session = composeSession;
  const submit = $('#compose-form [type="submit"]');
  if (submit.disabled) return;
  submit.disabled = true;
  $('#compose-error').textContent = '';
  try {
    const draft = validatePoll({
      id: 'draft', question: $('#question').value, topic: $('#topic').value,
      options: [...document.querySelectorAll('#option-fields input')].map(input => input.value),
    });
    const payload = {question: draft.question, topic: draft.topic, options: draft.options};
    const serialized = JSON.stringify(payload);
    if (serialized !== creationPayload) {
      creationPayload = serialized;
      creationKey = crypto.randomUUID();
    }
    await initialLoad;
    const data = await request('polls', 'POST', payload, {'Idempotency-Key': creationKey});
    activeTopic = 'Semua';
    const poll = acceptPoll(data.poll);
    if (session === composeSession && $('#compose').open) {
      $('#compose').close();
      openPoll(poll);
    }
    toast('Dilema sudah terbit.');
  } catch (err) {
    if (session === composeSession) $('#compose-error').textContent = err.message;
  } finally {
    if (session === composeSession) submit.disabled = false;
  }
};
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
  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    error.textContent = '';
    const chosen = form.querySelector('input:checked');
    try {
      const data = await request('vote', 'POST', {id: poll.id, index: Number(chosen.value), reason: reason.value.trim()});
      const updated = acceptPoll(data.poll);
      if ($('#detail').open && active?.id === poll.id) openPoll(updated);
    } catch (err) {
      error.textContent = err.message;
      if (err.status === 409 && await loadFeed() && polls.get(poll.id)?.myVote &&
          $('#detail').open && active?.id === poll.id) openPoll(polls.get(poll.id));
    } finally {
      submit.disabled = false;
    }
  };
  return form;
}

function pollResults(poll) {
  const content = document.createDocumentFragment();
  const total = totalVotes(poll);
  const summary = el('p', undefined, 'muted');
  const reaction = voteReaction(poll.counts, poll.myVote.index);
  if (reaction) summary.append(el('strong', reaction), ' ');
  summary.append(total + ' suara masuk.');
  content.append(summary);
  const answers = el('div', undefined, 'result-list');
  poll.options.forEach((answer, index) => {
    const selected = index === poll.myVote.index;
    const percent = total ? Math.round(100 * poll.counts[index] / total) : 0;
    const row = el('div', undefined, selected ? 'result-row is-selected' : 'result-row');
    const fill = el('div', undefined, 'result-fill');
    fill.style.width = percent + '%';
    const label = el('div', undefined, 'result-label');
    const name = el('span', answer);
    if (selected) {
      const marker = el('small', 'Pilihanmu', 'own-choice');
      name.append(marker);
    }
    label.append(name, el('b', percent + '%'));
    row.append(fill, label);
    answers.append(row);
  });
  content.append(answers);
  const reason = poll.myVote.reason;
  if (reason) content.append(el('h3', 'Alasanmu'), el('p', reason, 'reason'));
  const refresh = button('Perbarui hasil', async () => {
    refresh.disabled = true;
    try {
      const data = await request('polls?id=' + encodeURIComponent(poll.id));
      const latest = acceptPoll(data.poll);
      if ($('#detail').open && active?.id === poll.id) openPoll(latest);
    } catch (err) { toast(err.message); }
    finally { refresh.disabled = false; }
  }, 'text-button');
  content.append(refresh);
  return content;
}

async function openFeedPoll(poll, selected = null) {
  openPoll(poll, selected);
  const session = detailSession;
  const current = revision;
  try {
    const data = await request('polls?id=' + encodeURIComponent(poll.id));
    if (!$('#detail').open || session !== detailSession || current !== revision) return;
    const updated = publicPoll(data.poll);
    if (updated.hidden) {
      polls.set(poll.id, updated);
      render();
      $('#detail').close();
      toast('Dilema ini disembunyikan dari daftarmu.');
      return;
    }
    const changed = updated.counts.some((count, i) => count !== poll.counts[i]) ||
      updated.myVote?.index !== poll.myVote?.index;
    if (!changed) return;
    polls.set(updated.id, updated);
    render();
    // Existing input and reason stay in place while a visitor is deciding.
    if (updated.myVote) openPoll(updated);
  } catch (err) {
    if ($('#detail').open && session === detailSession) toast(err.message);
  }
}

function openPoll(poll, selected = null) {
  ++detailSession;
  active = poll;
  $('#detail-topic').textContent = poll.topic + (poll.archived ? ' · Arsip pribadi' : '');
  const body = $('#detail-body');
  const title = el('h2', poll.question);
  title.id = 'detail-title';
  title.tabIndex = -1;
  body.replaceChildren(title);
  if (poll.archived) {
    body.append(el('p', 'Arsip pribadi dari versi sebelumnya.', 'muted'));
    if (poll.myVote) {
      body.append(el('h3', 'Pilihanmu'), el('p', poll.options[poll.myVote.index], 'reason'));
      if (poll.myVote.reason) body.append(el('h3', 'Alasanmu'), el('p', poll.myVote.reason, 'reason'));
    }
    body.append(button('Buat versi publik', () => {
      $('#detail').close();
      compose(poll);
    }, 'button coral full'));
    body.append(el('p', 'Periksa pertanyaan dan opsi sebelum menerbitkan. Pilihan lama dan alasanmu tetap pribadi.', 'result-caption'));
  } else if (poll.myVote) {
    body.append(pollResults(poll));
  } else {
    body.append(el('p', 'Pilih satu jawaban.', 'muted'), voteForm(poll, selected));
  }
  const actions = el('div', undefined, 'actions');
  actions.append(
    button(poll.myVote ? 'Bagikan pilihanku' : 'Bagikan pertanyaan', () => download(poll)),
    button('Salin tautan', () => share(poll))
  );
  const pngHint = poll.myVote
    ? 'PNG berisi pilihanmu' + (poll.myVote.reason ? ' dan alasanmu.' : '.')
    : 'PNG berisi pertanyaan.';
  body.append(actions, el('p', pngHint, 'result-caption'));
  if (!poll.archived) body.append(button('Laporkan & sembunyikan', () => report(poll), 'text-button'));
  const dialog = $('#detail');
  show(dialog);
  dialog.scrollTop = 0;
  title.focus({preventScroll: true});
}
async function share(poll) {
  const url = new URL(location.pathname, location.origin);
  url.hash = poll.archived ? 'poll=' + encodePoll(poll) : 'id=' + encodeURIComponent(poll.id);
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Tautan dilema tersalin.');
  } catch {
    let input = $('#share-link');
    if (!input) {
      input = el('input', undefined, 'link-fallback');
      input.id = 'share-link';
      input.readOnly = true;
      input.setAttribute('aria-label', 'Tautan dilema untuk disalin');
      $('#detail-body').append(input);
    }
    input.value = url.href;
    input.focus();
    input.select();
    toast('Salin tautan dari kotak yang muncul.');
  }
}
let shareMascots;
async function download(poll) {
  const votesAtClick = poll.myVote ? {[poll.id]: poll.myVote} : {};
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
    toast(mode === 'personal' ? 'Kartu pilihanmu siap diunduh.' : 'Kartu pertanyaan siap diunduh.');
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
function report(poll) {
  $('#detail').close();
  const body = info('Laporkan dilema');
  body.append(el('p', 'Alasan laporan dikirim ke pengelola. Dilema akan disembunyikan dari daftarmu.'));
  const form = el('form');
  const label = el('label', 'Alasan laporan');
  label.htmlFor = 'report-reason';
  const select = el('select');
  select.id = 'report-reason';
  for (const reason of ['Spam atau promosi', 'Merendahkan / ujaran kebencian', 'Data pribadi', 'Konten tidak pantas', 'Lainnya']) {
    select.append(el('option', reason));
  }
  const error = el('p', undefined, 'form-error');
  error.setAttribute('role', 'alert');
  const submit = el('button', 'Simpan laporan & sembunyikan', 'button dark full');
  submit.type = 'submit';
  form.append(label, select, error, submit);
  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    error.textContent = '';
    const reason = select.value;
    try {
      await request('report', 'POST', {id: poll.id, reason});
      ++revision;
      reports.set(poll.id, {id: poll.id, question: poll.question, reason});
      render();
      if (form.isConnected) $('#info').close();
      toast('Laporan tersimpan. Dilema disembunyikan dari daftarmu.');
    } catch (err) { error.textContent = err.message; }
    finally { submit.disabled = false; }
  };
  body.append(form);
}

function showAbout() {
  const body = info('Cara kerja');
  const list = el('ul');
  for (const note of [
    'Lempar pertanyaan untuk diterbitkan di daftar publik, atau pilih salah satu dilema yang ada.',
    'Setiap browser bisa memilih sekali per dilema. Setelah memilih, kamu bisa melihat perolehan suara dari semua perangkat.',
    'Cookie mengingat pilihanmu di browser ini. Alasanmu hanya tampil untukmu, kecuali kamu membagikannya lewat kartu PNG.',
    'Salin tautan agar orang lain bisa membuka dan menjawab dilema yang sama.',
  ]) list.append(el('li', note));
  body.append(list);
}
for (const trigger of document.querySelectorAll('[data-about]')) trigger.onclick = showAbout;

function showReports() {
  const body = info('Aturan & laporan');
  body.append(el('p', 'Hindari data pribadi, ancaman, kebencian, dan tuduhan terhadap individu. Laporkan dilema yang melanggar lewat halaman dilemanya.'));
  body.append(el('h3', 'Laporanmu'));
  if (!feedReady || feedError) body.append(el('p', 'Daftar laporan belum bisa dimuat.'));
  else if (!reports.size) body.append(el('p', 'Belum ada laporan.'));
  for (const entry of reports.values()) {
    const row = el('div', undefined, 'hidden-report');
    row.append(el('b', entry.question || polls.get(entry.id)?.question || 'Dilema tersembunyi'), el('p', entry.reason));
    const restore = button('Tampilkan lagi', async () => {
      restore.disabled = true;
      try {
        await request('report', 'DELETE', {id: entry.id});
        ++revision;
        reports.delete(entry.id);
        const poll = polls.get(entry.id);
        if (poll) poll.hidden = false;
        render();
        if (row.isConnected) showReports();
      } catch (err) { toast(err.message); }
      finally { restore.disabled = false; }
    }, 'text-button');
    row.append(restore);
    body.append(row);
  }
}
$('#moderation').onclick = showReports;

if (archive.size) {
  const link = $('#archive');
  link.hidden = false;
  link.onclick = () => {
    const body = info('Arsip perangkat');
    for (const poll of archive.values()) {
      const row = el('div', undefined, 'hidden-report');
      row.append(button(poll.question, () => {
        $('#info').close();
        openPoll(poll);
      }, 'text-button'));
      body.append(row);
    }
  };
}

function sameQuestion(a, b) {
  return a.question === b.question && a.topic === b.topic &&
    a.options.length === b.options.length && a.options.every((option, index) => option === b.options[index]);
}

async function openLinkedPoll() {
  await initialLoad;
  const hash = location.hash;
  const note = $('#shared-note');
  note.hidden = true;
  const isOldLink = hash.startsWith('#poll=');
  if (!isOldLink && !hash.startsWith('#id=')) return;
  try {
    const old = isOldLink ? decodePoll(hash.slice(6)) : null;
    const id = old ? old.id : decodeURIComponent(hash.slice(4));
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Tautan dilema tidak valid.');
    let poll;
    try { poll = publicPoll((await request('polls?id=' + encodeURIComponent(id))).poll); }
    catch (err) {
      if (!old) throw err;
      // Legacy links contain the full original question, even if it was never published.
    }
    if (location.hash !== hash) return;
    if (old && (!poll || !sameQuestion(old, poll))) {
      const saved = archive.get(id);
      poll = saved && sameQuestion(saved, old) ? saved : {...old, myVote: null, archived: true};
    }
    if (poll.hidden || (!poll.archived && reports.has(id))) {
      throw new Error('Dilema ini kamu sembunyikan. Pulihkan lewat Aturan & laporan.');
    }
    openPoll(poll);
  } catch (err) {
    if (location.hash !== hash) return;
    note.textContent = err.message;
    note.hidden = false;
  }
}

render();
$('#more-polls').onclick = loadMore;
const initialLoad = loadFeed();
initialLoad.then(openLinkedPoll);
addEventListener('hashchange', openLinkedPoll);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && feedReady && !document.querySelector('dialog[open]')) loadFeed();
});
