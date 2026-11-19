import { createHash, createHmac, randomBytes } from 'node:crypto';
import { database } from './database.js';
import { ApiError, castVote, createPoll, getPoll, listPolls, setReport } from './polls.js';

const maxBytes = 8192;
const methods = {
  '/api/polls': ['GET', 'POST'],
  '/api/vote': ['POST'],
  '/api/report': ['POST', 'DELETE'],
};
const networkSecret = process.env.DATABASE_URL || randomBytes(32);

function visitorFor(req, res, secure) {
  const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)gd_visitor=([\da-f]{64})(?:;|$)/);
  const token = cookie ? cookie[1] : randomBytes(32).toString('hex');
  if (!cookie) {
    res.setHeader('Set-Cookie', `gd_visitor=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    if (req.method !== 'GET') throw new ApiError(428, 'Buka daftar dilema dan izinkan cookie sebelum memilih.');
  }
  return createHash('sha256').update(token).digest('hex');
}

async function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    throw new ApiError(415, 'Gunakan format JSON.');
  }
  if (Number(req.headers['content-length']) > maxBytes) throw new ApiError(413, 'Isi permintaan terlalu panjang.');
  // The Vercel runtime may have parsed the body before dispatch. Local Node
  // passes the original stream. Both paths enforce the same shape and size.
  let raw;
  try {
    if (req.body !== undefined) {
      raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') :
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    } else {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk);
        length += buffer.length;
        if (length > maxBytes) throw new ApiError(413, 'Isi permintaan terlalu panjang.');
        chunks.push(buffer);
      }
      raw = Buffer.concat(chunks).toString('utf8');
    }
    if (Buffer.byteLength(raw) > maxBytes) throw new ApiError(413, 'Isi permintaan terlalu panjang.');
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid JSON object');
    return value;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'Isi permintaan tidak valid.');
  }
}

let lastPrune = -1;
async function throttle(db, req, visitor, action) {
  const hour = Math.floor(Date.now() / 3600000);
  if (lastPrune !== hour) {
    await db.query('DELETE FROM gd_limits WHERE window_start < $1', [hour - 1]);
    lastPrune = hour;
  }
  const address = process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] : req.socket?.remoteAddress;
  const quotas = action === 'create' ? [8, 48] : action === 'vote' ? [120, 480] : [24, 120];
  const buckets = [[`${action}:v:${visitor}`, quotas[0]]];
  if (address) {
    const network = createHmac('sha256', networkSecret).update(`${hour}:${String(address).split(',')[0].trim()}`).digest('hex');
    buckets.push([`${action}:n:${network}`, quotas[1]]);
  }
  const rows = await Promise.all(buckets.map(([key, limit]) => db.query(`INSERT INTO gd_limits
    (bucket,window_start,hits) VALUES ($1,$2,1)
    ON CONFLICT (bucket) DO UPDATE SET window_start=excluded.window_start,
      hits=CASE WHEN gd_limits.window_start=excluded.window_start THEN gd_limits.hits+1 ELSE 1 END
    WHERE gd_limits.window_start <> excluded.window_start OR gd_limits.hits < $3 RETURNING hits`,
    [key,hour,limit])));
  if (rows.some(row => !row.length)) throw new ApiError(429, 'Terlalu banyak permintaan. Coba lagi nanti.');
}

export async function handleApi(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const secure = Boolean(req.socket?.encrypted) || (Boolean(process.env.VERCEL) && req.headers['x-forwarded-proto'] === 'https');
    const origin = `${secure ? 'https' : 'http'}://${req.headers.host}`;
    const url = new URL(req.url, origin);
    const path = url.pathname.replace(/\/$/, '');
    if (!Object.hasOwn(methods, path)) throw new ApiError(404, 'Halaman tidak ditemukan.');
    if (!methods[path].includes(req.method)) {
      res.setHeader('Allow', methods[path].join(', '));
      throw new ApiError(405, 'Metode tidak tersedia.');
    }
    const write = req.method !== 'GET';
    if (write && ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site')) {
      throw new ApiError(403, 'Permintaan harus berasal dari situs ini.');
    }
    const body = write ? await jsonBody(req) : null;
    const visitor = visitorFor(req, res, secure);
    const db = await database();
    let result;
    let status = 200;
    if (!write) {
      result = url.searchParams.has('id') ? {poll: await getPoll(db, visitor, url.searchParams.get('id'))} :
        await listPolls(db, visitor, url.searchParams.get('before'));
    } else if (path === '/api/polls') {
      result = {poll: await createPoll(db, visitor, req.headers['idempotency-key'], body, () => throttle(db, req, visitor, 'create'))};
      status = 201;
    } else if (path === '/api/vote') {
      result = {poll: await castVote(db, visitor, body, () => throttle(db, req, visitor, 'vote'))};
    } else {
      await setReport(db, visitor, body, req.method === 'DELETE', () => throttle(db, req, visitor, 'report'));
      result = {ok: true};
    }
    res.writeHead(status);
    res.end(JSON.stringify(result));
  } catch (err) {
    const known = err instanceof ApiError;
    if (!known) console.error('Voting storage request failed', err.code || err.name);
    if (err.status === 429) res.setHeader('Retry-After', String(3600 - Math.floor(Date.now() / 1000) % 3600));
    res.writeHead(known ? err.status : 503);
    res.end(JSON.stringify({error: known ? err.message : 'Layanan voting sedang tidak tersedia. Coba lagi.'}));
  }
}
