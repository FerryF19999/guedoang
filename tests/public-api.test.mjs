import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

async function startServer(database) {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: {...process.env, HOST: '127.0.0.1', PORT: '0', POLL_DB_PATH: database,
      DATABASE_URL: '', POSTGRES_URL: '', VERCEL: ''},
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const closed = once(child, 'exit');
  const lines = createInterface({input: child.stdout});
  for await (const line of lines) {
    const match = line.match(/listening on (127\.0\.0\.1:\d+)/);
    if (match) return {
      origin: 'http://' + match[1],
      async close() { child.kill(); await closed; },
    };
  }
  throw new Error('Preview server exited before listening');
}

test('public votes are atomic, private to each visitor, and durable after restart', {timeout: 30000}, async t => {
  const folder = await mkdtemp(join(tmpdir(), 'guedoang-api-'));
  const db = join(folder, 'polls.sqlite');
  let server = await startServer(db);
  t.after(async () => {
    await server.close();
    await rm(folder, {recursive: true, force: true});
  });
  const api = (route, cookie = '', method = 'GET', body, extra = {}) => fetch(server.origin + '/api/' + route, {
    method,
    headers: {'Cookie': cookie, 'Origin': server.origin, 'Content-Type': 'application/json', ...extra},
    body: body && JSON.stringify(body),
  });
  async function visit() {
    const response = await api('polls');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).polls.length, 6);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /httponly/i);
    return cookie.split(';')[0];
  }
  const left = await visit();
  const right = await visit();
  assert.notEqual(left, right);

  const draft = {question: 'Untuk jalan dekat, pilih apa?', topic: 'Sehari-hari', options: ['Jalan kaki', 'Sepeda']};
  const key = {'Idempotency-Key': randomUUID()};
  const created = await api('polls', left, 'POST', draft, key);
  assert.ok(created.ok, 'create poll: ' + created.status);
  const {id} = (await created.json()).poll;
  const repeated = await api('polls', left, 'POST', draft, key);
  assert.ok(repeated.ok, 'retry poll: ' + repeated.status);
  assert.equal((await repeated.json()).poll.id, id);

  const first = {id, index: 0, reason: 'Alasan pribadi pengunjung pertama.'};
  const races = await Promise.all([api('vote', left, 'POST', first), api('vote', left, 'POST', first)]);
  assert.equal(races.filter(response => response.ok).length, 1);
  assert.equal(races.filter(response => response.status === 409).length, 1);
  const otherPoll = (await (await api('polls?id=' + id, right)).json()).poll;
  assert.equal(otherPoll.myVote, null);
  assert.deepEqual(otherPoll.counts, [1, 0]);
  assert.ok(!JSON.stringify(otherPoll).includes(first.reason));
  assert.ok((await api('vote', right, 'POST', {id, index: 1})).ok);

  await server.close();
  server = await startServer(db);
  const restored = (await (await api('polls?id=' + id, left)).json()).poll;
  assert.deepEqual(restored.counts, [1, 1]);
  assert.deepEqual(restored.myVote, {index: 0, reason: first.reason});
  assert.equal((await api('vote', left, 'POST', first)).status, 409);
});
