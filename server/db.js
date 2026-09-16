import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://pickup:pickup_local_only@127.0.0.1:55432/pickup';

const isLocal = connectionString.includes('127.0.0.1') || connectionString.includes('localhost') || connectionString.includes('postgres:');
const useSsl = !isLocal && (process.env.NODE_ENV === 'production' || connectionString.includes('sslmode=require'));

export const pool = new pg.Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  return res;
}

export async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}
