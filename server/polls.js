import { randomUUID } from 'node:crypto';
import { validatePoll } from '../src/core.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw new ApiError(400, 'Identitas dilema tidak valid.');
  }
  return id;
}

const countColumns = [0,1,2,3].map(i =>
  `(SELECT COUNT(*) FROM gd_votes c WHERE c.poll_id = p.id AND c.option_index = ${i}) AS n${i}`
).join(', ');
const selectPoll = `SELECT p.id,p.question,p.topic,p.options_json,p.example,
  v.option_index AS my_index,v.reason AS my_reason,r.poll_id AS hidden_id,${countColumns}
  FROM gd_polls p
  LEFT JOIN gd_votes v ON v.poll_id = p.id AND v.visitor_key = $1
  LEFT JOIN gd_reports r ON r.poll_id = p.id AND r.visitor_key = $1`;

function publicPoll(row) {
  const options = JSON.parse(row.options_json);
  return {
    id: row.id, question: row.question, topic: row.topic, options, example: Boolean(Number(row.example)),
    counts: options.map((_,i) => Number(row[`n${i}`])),
    myVote: row.my_index == null ? null : {index: Number(row.my_index), reason: row.my_reason},
    hidden: row.hidden_id != null,
  };
}

export async function getPoll(db, visitor, id) {
  const [row] = await db.query(selectPoll + ' WHERE p.id = $2', [visitor, validId(id)]);
  if (!row) throw new ApiError(404, 'Dilema ini tidak ditemukan.');
  return publicPoll(row);
}

export async function listPolls(db, visitor, before) {
  const where = before ? 'WHERE (p.created_at,p.id) < (SELECT created_at,id FROM gd_polls WHERE id = $2)' : '';
  const params = before ? [visitor, validId(before)] : [visitor];
  const [rows, reports] = await Promise.all([
    db.query(`${selectPoll} ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT 101`, params),
    db.query(`SELECT p.id,p.question,r.reason FROM gd_reports r JOIN gd_polls p ON p.id = r.poll_id
      WHERE r.visitor_key = $1 ORDER BY r.created_at DESC,p.id`, [visitor]),
  ]);
  const polls = rows.slice(0, 100).map(publicPoll);
  return {polls, reports, next: rows.length > 100 ? polls.at(-1).id : null};
}

export async function createPoll(db, visitor, requestKey, body, throttle) {
  let draft;
  try {
    draft = validatePoll({id: randomUUID(), question: body.question, topic: body.topic, options: body.options});
  } catch (err) {
    throw new ApiError(400, err.message);
  }
  if (requestKey != null && !/^[A-Za-z0-9_-]{1,80}$/.test(requestKey)) {
    throw new ApiError(400, 'Identitas permintaan tidak valid.');
  }
  const replay = async () => {
    if (!requestKey) return null;
    const [row] = await db.query('SELECT id FROM gd_polls WHERE creator_key=$1 AND request_key=$2', [visitor, requestKey]);
    if (!row) return null;
    const existing = await getPoll(db, visitor, row.id);
    if (existing.question !== draft.question || existing.topic !== draft.topic ||
        JSON.stringify(existing.options) !== JSON.stringify(draft.options)) {
      throw new ApiError(409, 'Permintaan ini telah digunakan untuk dilema lain.');
    }
    return existing;
  };
  const saved = await replay();
  if (saved) return saved;
  await throttle();
  const inserted = await db.query(`INSERT INTO gd_polls
    (id,question,topic,options_json,example,created_at,creator_key,request_key)
    VALUES ($1,$2,$3,$4,0,$5,$6,$7)
    ON CONFLICT (creator_key,request_key) DO NOTHING RETURNING id`,
    [draft.id,draft.question,draft.topic,JSON.stringify(draft.options),Date.now(),visitor,requestKey || null]);
  return inserted.length ? getPoll(db, visitor, draft.id) : replay();
}

export async function castVote(db, visitor, body, throttle) {
  const poll = await getPoll(db, visitor, body.id);
  if (poll.myVote) throw new ApiError(409, 'Kamu sudah memilih di dilema ini.');
  if (!Number.isInteger(body.index) || body.index < 0 || body.index >= poll.options.length) {
    throw new ApiError(400, 'Pilih salah satu jawaban.');
  }
  const reason = body.reason === undefined ? '' : body.reason;
  if (typeof reason !== 'string' || reason.trim().length > 160) throw new ApiError(400, 'Alasan maksimal 160 karakter.');
  await throttle();
  const rows = await db.query(`INSERT INTO gd_votes (poll_id,visitor_key,option_index,reason)
    VALUES ($1,$2,$3,$4) ON CONFLICT (poll_id,visitor_key) DO NOTHING RETURNING poll_id`,
    [poll.id,visitor,body.index,reason.trim()]);
  if (!rows.length) throw new ApiError(409, 'Kamu sudah memilih di dilema ini.');
  return getPoll(db, visitor, poll.id);
}

export async function setReport(db, visitor, body, remove, throttle) {
  validId(body.id);
  if (remove) {
    await db.query('DELETE FROM gd_reports WHERE visitor_key=$1 AND poll_id=$2', [visitor,body.id]);
    return;
  }
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 160) {
    throw new ApiError(400, 'Pilih alasan laporan.');
  }
  await getPoll(db, visitor, body.id);
  await throttle();
  await db.query(`INSERT INTO gd_reports (visitor_key,poll_id,reason,created_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (visitor_key,poll_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at`,
    [visitor,body.id,body.reason.trim(),Date.now()]);
}
