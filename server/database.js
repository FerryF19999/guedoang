import { examples } from '../src/core.js';

const schema = [
  `CREATE TABLE IF NOT EXISTS gd_polls (
    id TEXT PRIMARY KEY, question TEXT NOT NULL, topic TEXT NOT NULL, options_json TEXT NOT NULL,
    example INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL,
    creator_key TEXT, request_key TEXT, UNIQUE (creator_key, request_key)
  )`,
  'CREATE INDEX IF NOT EXISTS gd_polls_newest ON gd_polls (created_at DESC, id DESC)',
  `CREATE TABLE IF NOT EXISTS gd_votes (
    poll_id TEXT NOT NULL REFERENCES gd_polls(id), visitor_key TEXT NOT NULL,
    option_index INTEGER NOT NULL CHECK (option_index BETWEEN 0 AND 3), reason TEXT NOT NULL,
    PRIMARY KEY (poll_id, visitor_key)
  )`,
  'CREATE INDEX IF NOT EXISTS gd_votes_counts ON gd_votes (poll_id, option_index)',
  `CREATE TABLE IF NOT EXISTS gd_reports (
    visitor_key TEXT NOT NULL, poll_id TEXT NOT NULL REFERENCES gd_polls(id),
    reason TEXT NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY (visitor_key, poll_id)
  )`,
  `CREATE TABLE IF NOT EXISTS gd_limits (
    bucket TEXT PRIMARY KEY, window_start BIGINT NOT NULL, hits INTEGER NOT NULL
  )`,
];

const initialStatements = schema.map(sql => ({sql, params: []}));
examples.forEach((poll, i) => initialStatements.push({
  sql: `INSERT INTO gd_polls (id, question, topic, options_json, example, created_at)
    VALUES ($1,$2,$3,$4,1,$5) ON CONFLICT (id) DO NOTHING`,
  params: [poll.id, poll.question, poll.topic, JSON.stringify(poll.options), -i],
}));

async function openPostgres(connectionString) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString);
  // Serialize first application setup across concurrently starting functions.
  // Subsequent cold starts use one inexpensive existence check.
  const [meta] = await sql.query("SELECT to_regclass('gd_limits') AS present", []);
  if (!meta.present) {
    await sql.transaction([
      sql.query('SELECT pg_advisory_xact_lock(736422091)'),
      ...initialStatements.map(stmt => sql.query(stmt.sql, stmt.params)),
    ]);
  }
  return {query: (statement, params = []) => sql.query(statement, params)};
}

async function openSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdirSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const filename = process.env.POLL_DB_PATH || resolve('.data', 'guedoang.sqlite');
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), {recursive: true});
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  const query = (sql, values = []) => {
    const stmt = db.prepare(sql);
    if (!values.length) return stmt.all();
    const params = Object.fromEntries(values.map((value, i) => [`$${i + 1}`, value]));
    return stmt.all(params);
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const stmt of initialStatements) query(stmt.sql, stmt.params);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    db.close();
    throw err;
  }
  return {query};
}

let pending;
export function database() {
  if (!pending) {
    let open;
    if (process.env.DATABASE_URL) open = openPostgres(process.env.DATABASE_URL);
    else if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      throw new Error('Missing durable database configuration');
    } else open = openSqlite();
    pending = open.catch(err => { pending = undefined; throw err; });
  }
  return pending;
}
