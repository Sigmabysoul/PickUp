import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Prevent Node 20 IPv6 dual-stack timeouts on cloud platforms (AWS, Vercel, Neon)
if (net.setDefaultAutoSelectFamily) {
  net.setDefaultAutoSelectFamily(false);
}

// Automatically load .env.local or .env if present in local dev
try {
  if (fs.existsSync('.env.local') && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env.local');
  } else if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }
} catch (_) {}

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

export const DEFAULT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS warehouses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
    name TEXT NOT NULL,
    experience TEXT NOT NULL CHECK (experience IN ('Junior', 'Mid', 'Senior')),
    skill SMALLINT NOT NULL CHECK (skill >= 1 AND skill <= 5),
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    archived BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE INDEX IF NOT EXISTS employees_warehouse_idx ON employees(warehouse_id, active);

CREATE TABLE IF NOT EXISTS absences (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    reason TEXT,
    CONSTRAINT absences_check CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS absences_lookup_idx ON absences(employee_id, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS daily_requirements (
    warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
    duty_date DATE NOT NULL,
    worker_count SMALLINT NOT NULL CHECK (worker_count >= 1 AND worker_count <= 10),
    PRIMARY KEY (warehouse_id, duty_date)
);

CREATE TABLE IF NOT EXISTS assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
    duty_date DATE NOT NULL,
    status TEXT DEFAULT 'scheduled' NOT NULL CHECK (status IN ('scheduled', 'completed', 'absent')),
    selected_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    replaces_assignment_id BIGINT REFERENCES assignments(id),
    CONSTRAINT assignments_employee_id_duty_date_key UNIQUE (employee_id, duty_date)
);

CREATE INDEX IF NOT EXISTS assignments_history_idx ON assignments(warehouse_id, duty_date, status);

CREATE TABLE IF NOT EXISTS assignment_runs (
    warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
    duty_date DATE NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    warning TEXT,
    PRIMARY KEY (warehouse_id, duty_date)
);

CREATE TABLE IF NOT EXISTS daily_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id BIGINT REFERENCES warehouses(id),
    duty_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('overtime_stay', 'before_7pm', 'no_pickup', 'holiday', 'emergency_sunday')),
    notes TEXT,
    CONSTRAINT daily_logs_wh_date_key UNIQUE (warehouse_id, duty_date)
);

CREATE TABLE IF NOT EXISTS app_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    passcode TEXT NOT NULL,
    role TEXT DEFAULT 'senior' NOT NULL CHECK (role IN ('admin', 'senior')),
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

INSERT INTO warehouses (name, active)
VALUES ('Old Warehouse', true), ('New Warehouse', true)
ON CONFLICT (name) DO NOTHING;
`;

export async function initDb() {
  let sql = DEFAULT_SCHEMA_SQL;
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      sql = fs.readFileSync(schemaPath, 'utf8') + `
        INSERT INTO warehouses (name, active)
        VALUES ('Old Warehouse', true), ('New Warehouse', true)
        ON CONFLICT (name) DO NOTHING;
      `;
    }
  } catch (_) {}

  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}
