import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { computeEmployeeMetrics, selectOvertimeCrew } from './algorithm.js';
import {
  ADMIN_PASSWORD,
  generateToken,
  requireAuth,
  requireAdmin,
  validateCredentials,
  verifyToken,
} from './auth.js';
import { initDb, pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Normalization middleware for proxy / serverless environments
app.use((req, res, next) => {
  if (!req.url.startsWith('/api') && !req.url.startsWith('/assets') && !req.url.includes('.')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

// --------------------------------------------------------------------------
// 0. Authentication Routes for Senior Employees / Supervisors
// --------------------------------------------------------------------------
app.get('/api/auth/supervisors', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, username, role FROM app_users WHERE active = true ORDER BY name ASC'
    );
    res.json({
      supervisors: result.rows.map((u) => ({
        id: String(u.id),
        name: u.name,
        username: u.username,
        role: u.role,
      })),
    });
  } catch (err) {
    console.error('Error fetching supervisors:', err.message);
    res.json({ supervisors: [] });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { passcode, supervisorId, username, name } = req.body || {};
  const result = await validateCredentials({ passcode, supervisorId, username, name, pool });
  if (!result.success) {
    return res.status(401).json({ error: result.message });
  }

  const token = generateToken(result.user);
  res.json({
    success: true,
    token,
    user: result.user,
  });
});

app.get('/api/auth/verify', (req, res) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ valid: false, error: 'Session expired or invalid' });
  }
  res.json({ valid: true, user });
});

// Protect all operational API endpoints with senior supervisor auth
app.use('/api', requireAuth);

// --------------------------------------------------------------------------
// User & Password Management (Admin Only)
// --------------------------------------------------------------------------
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, name, passcode, role, active, created_at FROM app_users ORDER BY id ASC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Error listing users:', err.message);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { username, name, passcode, role } = req.body || {};
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!passcode || !passcode.trim()) {
      return res.status(400).json({ error: 'Passcode / PIN is required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM app_users WHERE LOWER(username) = $1', [cleanUsername]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists. Please choose a different username.' });
    }

    const cleanRole = role === 'admin' ? 'admin' : 'senior';
    const insertRes = await pool.query(
      `INSERT INTO app_users (username, name, passcode, role, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, username, name, passcode, role, active, created_at`,
      [cleanUsername, name.trim(), passcode.trim(), cleanRole]
    );

    res.status(201).json({ user: insertRes.rows[0] });
  } catch (err) {
    console.error('Error creating user:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, passcode, role, active } = req.body || {};

    const existing = await pool.query('SELECT * FROM app_users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const current = existing.rows[0];
    const newName = name !== undefined ? String(name).trim() : current.name;
    const newPasscode = passcode !== undefined ? String(passcode).trim() : current.passcode;
    const newRole = role !== undefined ? (role === 'admin' ? 'admin' : 'senior') : current.role;
    const newActive = active !== undefined ? Boolean(active) : current.active;

    const updateRes = await pool.query(
      `UPDATE app_users
       SET name = $1, passcode = $2, role = $3, active = $4
       WHERE id = $5
       RETURNING id, username, name, passcode, role, active, created_at`,
      [newName, newPasscode, newRole, newActive, id]
    );

    res.json({ user: updateRes.rows[0] });
  } catch (err) {
    console.error('Error updating user:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const delRes = await pool.query('DELETE FROM app_users WHERE id = $1 RETURNING id', [id]);
    if (delRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Current date in Asia/Kolkata timezone
export function getTodayDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Security feature: Auto-close any unconfirmed past scheduled crew as 'before_7pm' (No OT)
export async function autoCloseUnconfirmedPastAssignments(clientOrPool = pool) {
  try {
    const todayStr = getTodayDateStr();
    const pastScheduledRes = await clientOrPool.query(
      `SELECT DISTINCT to_char(duty_date, 'YYYY-MM-DD') as duty_date
       FROM assignments
       WHERE duty_date < $1 AND status = 'scheduled'`,
      [todayStr]
    );

    for (const row of pastScheduledRes.rows) {
      const dDate = row.duty_date;
      const logRes = await clientOrPool.query(
        `SELECT status FROM daily_logs WHERE duty_date = $1`,
        [dDate]
      );
      const currentStatus = logRes.rows[0]?.status;

      if (currentStatus !== 'overtime_stay') {
        await clientOrPool.query(`DELETE FROM daily_logs WHERE duty_date = $1`, [dDate]);
        await clientOrPool.query(
          `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
           VALUES (NULL, $1, 'before_7pm', 'Auto-closed: Unconfirmed shift automatically marked as Before 7pm (No OT)')`,
          [dDate]
        );

        await clientOrPool.query(
          `DELETE FROM assignments WHERE duty_date = $1 AND status = 'scheduled'`,
          [dDate]
        );
      }
    }
  } catch (err) {
    console.error('Error auto-closing unconfirmed assignments:', err.message);
  }
}

// Initialize DB schema on startup & clean any duplicate historical log rows
initDb()
  .then(async () => {
    await pool.query(
      `DELETE FROM daily_logs a USING daily_logs b WHERE a.id < b.id AND a.duty_date = b.duty_date`
    );
    await autoCloseUnconfirmedPastAssignments(pool);
  })
  .catch((err) => {
    console.error('Database initialization warning:', err.message);
  });

// Helper: check absence on specific date
function isEmployeeAbsentOnDate(absences, employeeId, dutyDate) {
  return absences.some(
    (ab) =>
      String(ab.employee_id) === String(employeeId) &&
      dutyDate >= ab.starts_on &&
      dutyDate <= ab.ends_on
  );
}

// --------------------------------------------------------------------------
// 1. GET /api/bootstrap
// Loads all necessary initial data for the dashboard
// --------------------------------------------------------------------------
app.get('/api/bootstrap', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
      return res.status(500).json({
        error: 'DATABASE_URL is missing in environment variables. Please add your Neon connection string in your Vercel Project Settings (Settings -> Environment Variables).'
      });
    }

    // Auto-close any unconfirmed past scheduled assignments
    await autoCloseUnconfirmedPastAssignments(pool);

    let warehousesRes;
    try {
      warehousesRes = await pool.query(
        'SELECT id, name, active FROM warehouses ORDER BY name'
      );
    } catch (dbErr) {
      if (dbErr.code === '42P01') {
        // Table doesn't exist yet on new database, run initDb to create tables
        await initDb();
        warehousesRes = await pool.query(
          'SELECT id, name, active FROM warehouses ORDER BY name'
        );
      } else {
        throw dbErr;
      }
    }
    const employeesRes = await pool.query(
      `SELECT e.id, e.warehouse_id, e.name, e.experience, e.skill, e.initial_completed_count, e.can_hold_key, e.eligible_for_normal_pickup, e.active, e.created_at, w.name as warehouse_name
       FROM employees e
       LEFT JOIN warehouses w ON e.warehouse_id = w.id
       WHERE e.archived = false
       ORDER BY e.warehouse_id, e.name`
    );
    const absencesRes = await pool.query(
      `SELECT a.id, a.employee_id, to_char(a.starts_on, 'YYYY-MM-DD') as starts_on,
              to_char(a.ends_on, 'YYYY-MM-DD') as ends_on, a.reason, e.name as employee_name
       FROM absences a
       JOIN employees e ON a.employee_id = e.id
       ORDER BY a.starts_on DESC`
    );
    const assignmentsRes = await pool.query(
      `SELECT a.id, a.employee_id, a.warehouse_id, to_char(a.duty_date, 'YYYY-MM-DD') as duty_date,
              a.status, a.selected_at, a.updated_at, a.replaces_assignment_id,
              e.name as employee_name, e.experience, e.skill, e.can_hold_key, e.eligible_for_normal_pickup, e.warehouse_id as home_warehouse_id,
              hw.name as home_warehouse_name, w.name as warehouse_name
       FROM assignments a
       JOIN employees e ON a.employee_id = e.id
       JOIN warehouses w ON a.warehouse_id = w.id
       LEFT JOIN warehouses hw ON e.warehouse_id = hw.id
       ORDER BY a.duty_date DESC, w.name, e.name`
    );
    const reqsRes = await pool.query(
      `SELECT warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, worker_count
       FROM daily_requirements`
    );
    const runsRes = await pool.query(
      `SELECT warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, generated_at, warning
       FROM assignment_runs
       ORDER BY duty_date DESC`
    );
    const dailyLogsRes = await pool.query(
      `SELECT DISTINCT ON (duty_date) id, warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status, notes
       FROM daily_logs
       ORDER BY duty_date, id DESC`
    );

    // Compute live metrics for each employee
    const allAssignments = assignmentsRes.rows;
    const enrichedEmployees = employeesRes.rows.map((emp) =>
      computeEmployeeMetrics(emp, allAssignments)
    );

    res.json({
      warehouses: warehousesRes.rows,
      employees: enrichedEmployees,
      absences: absencesRes.rows,
      assignments: allAssignments,
      dailyRequirements: reqsRes.rows,
      runs: runsRes.rows,
      dailyLogs: dailyLogsRes.rows,
    });
  } catch (err) {
    console.error('GET /api/bootstrap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 2. Warehouses API
// --------------------------------------------------------------------------
app.post('/api/warehouses', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Warehouse name is required' });
    }
    const result = await pool.query(
      'INSERT INTO warehouses (name, active) VALUES ($1, true) RETURNING *',
      [name.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/warehouses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, active } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(name.trim());
    }
    if (active !== undefined) {
      fields.push(`active = $${idx++}`);
      values.push(Boolean(active));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const queryStr = `UPDATE warehouses SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(queryStr, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    let { warehouse_id, name, experience, skill, active, initial_completed_count, can_hold_key, eligible_for_normal_pickup } = req.body;
    if (!name || !experience || skill == null) {
      return res.status(400).json({ error: 'Missing required employee fields (name, experience, skill)' });
    }

    // Safety rule: Only administrators can assign Super Senior role or set normal pickup eligibility
    if (experience === 'Super Senior' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can assign the Super Senior experience level.' });
    }
    if (eligible_for_normal_pickup && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can modify normal pickup eligibility for Super Seniors.' });
    }

    // Default to active warehouse if warehouse_id not provided
    if (!warehouse_id) {
      const whRes = await pool.query(
        "SELECT id FROM warehouses WHERE active = true ORDER BY (name = 'Main Warehouse') DESC, id ASC LIMIT 1"
      );
      if (whRes.rows.length > 0) {
        warehouse_id = whRes.rows[0].id;
      } else {
        const anyWh = await pool.query("SELECT id FROM warehouses ORDER BY id ASC LIMIT 1");
        warehouse_id = anyWh.rows[0]?.id;
      }
    }

    // Fairness for newly added employees:
    // If initial_completed_count is not provided and employee is not an on-call-only Super Senior,
    // align initial count with the minimum effective completed stays among existing active staff
    // so they do not get picked on their very first consecutive days unfairly!
    if (initial_completed_count === undefined || initial_completed_count === null) {
      if (experience === 'Super Senior' && !eligible_for_normal_pickup) {
        initial_completed_count = 0;
      } else {
        const statsRes = await pool.query(`
          SELECT COALESCE(
            MIN(e.initial_completed_count + COALESCE(cnt.done, 0)),
            0
          ) as min_stays
          FROM employees e
          LEFT JOIN (
            SELECT employee_id, COUNT(*) as done
            FROM assignments
            WHERE status = 'completed'
            GROUP BY employee_id
          ) cnt ON e.id = cnt.employee_id
          WHERE e.archived = false AND e.active = true AND (e.experience != 'Super Senior' OR e.eligible_for_normal_pickup = true)
        `);
        initial_completed_count = Number(statsRes.rows[0]?.min_stays || 0);
      }
    }

    const result = await pool.query(
      `INSERT INTO employees (warehouse_id, name, experience, skill, initial_completed_count, can_hold_key, eligible_for_normal_pickup, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        warehouse_id,
        name.trim(),
        experience,
        Number(skill),
        Number(initial_completed_count),
        Boolean(can_hold_key),
        Boolean(eligible_for_normal_pickup),
        active ?? true,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouse_id, name, experience, skill, active, initial_completed_count, can_hold_key, eligible_for_normal_pickup } = req.body;

    // Safety rule: Only administrators can promote to Super Senior or modify normal pickup eligibility
    if ((experience === 'Super Senior' || eligible_for_normal_pickup !== undefined) && req.user?.role !== 'admin') {
      const curr = await pool.query('SELECT experience, eligible_for_normal_pickup FROM employees WHERE id = $1', [id]);
      if (curr.rows.length > 0) {
        if (experience === 'Super Senior' && curr.rows[0].experience !== 'Super Senior') {
          return res.status(403).json({ error: 'Forbidden: Only administrators can assign the Super Senior experience level.' });
        }
        if (eligible_for_normal_pickup !== undefined && Boolean(eligible_for_normal_pickup) !== Boolean(curr.rows[0].eligible_for_normal_pickup)) {
          return res.status(403).json({ error: 'Forbidden: Only administrators can modify normal pickup eligibility for Super Seniors.' });
        }
      }
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(name.trim());
    }
    if (warehouse_id !== undefined) {
      fields.push(`warehouse_id = $${idx++}`);
      values.push(warehouse_id);
    }
    if (experience !== undefined) {
      fields.push(`experience = $${idx++}`);
      values.push(experience);
    }
    if (skill !== undefined) {
      fields.push(`skill = $${idx++}`);
      values.push(Number(skill));
    }
    if (active !== undefined) {
      fields.push(`active = $${idx++}`);
      values.push(Boolean(active));
    }
    if (initial_completed_count !== undefined) {
      fields.push(`initial_completed_count = $${idx++}`);
      values.push(Number(initial_completed_count));
    }
    if (can_hold_key !== undefined) {
      fields.push(`can_hold_key = $${idx++}`);
      values.push(Boolean(can_hold_key));
    }
    if (eligible_for_normal_pickup !== undefined) {
      fields.push(`eligible_for_normal_pickup = $${idx++}`);
      values.push(Boolean(eligible_for_normal_pickup));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const queryStr = `UPDATE employees SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(queryStr, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft delete / archive employee to preserve duty history
app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE employees SET archived = true WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 4. Absences API (Vacations, Leave)
// --------------------------------------------------------------------------
app.post('/api/absences', async (req, res) => {
  try {
    const { employee_id, starts_on, ends_on, reason } = req.body;
    if (!employee_id || !starts_on || !ends_on) {
      return res.status(400).json({ error: 'Employee, start date, and end date required' });
    }
    const result = await pool.query(
      `INSERT INTO absences (employee_id, starts_on, ends_on, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [employee_id, starts_on, ends_on, reason || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/absences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM absences WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 5. Daily Requirements API
// --------------------------------------------------------------------------
app.put('/api/requirements', async (req, res) => {
  try {
    const { warehouse_id, duty_date, worker_count } = req.body;
    if (!warehouse_id || !duty_date || worker_count == null) {
      return res.status(400).json({ error: 'Warehouse, date, and worker count required' });
    }
    const count = Number(worker_count);
    if (count < 1 || count > 10) {
      return res.status(400).json({ error: 'Worker count must be between 1 and 10' });
    }
    const result = await pool.query(
      `INSERT INTO daily_requirements (warehouse_id, duty_date, worker_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (warehouse_id, duty_date)
       DO UPDATE SET worker_count = $3
       RETURNING warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, worker_count`,
      [warehouse_id, duty_date, count]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 5b. Daily Status API (Pickup outcome: overtime_stay, before_7pm, no_pickup, holiday)
// --------------------------------------------------------------------------
app.put('/api/daily-status', async (req, res) => {
  try {
    const { warehouse_id, duty_date, status, notes } = req.body;
    if (!duty_date || !status) {
      return res.status(400).json({ error: 'duty_date and status are required' });
    }
    const allowed = ['overtime_stay', 'before_7pm', 'no_pickup', 'holiday'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    // Safety rule: Only administrators can change status for past dates. Mods can only modify today's status.
    const todayStr = getTodayDateStr();
    if (duty_date < todayStr && req.user?.role !== 'admin') {
      return res.status(403).json({
        error: "Forbidden: Only administrators can change status for past dates. Mods can only modify today's status.",
      });
    }

    const whId = warehouse_id ? Number(warehouse_id) : null;

    // Clear any previous conflicting log entries for this duty date to ensure exactly 1 canonical record
    await pool.query('DELETE FROM daily_logs WHERE duty_date = $1', [duty_date]);

    const result = await pool.query(
      `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status, notes`,
      [whId, duty_date, status, notes || null]
    );

    // If day outcome is anything other than overtime stay, remove assignments so participant names disappear
    if (status !== 'overtime_stay') {
      if (whId) {
        await pool.query(
          `DELETE FROM assignments WHERE warehouse_id = $1 AND duty_date = $2`,
          [whId, duty_date]
        );
      } else {
        await pool.query(
          `DELETE FROM assignments WHERE duty_date = $1`,
          [duty_date]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 6. Overtime Plan Generator API
// --------------------------------------------------------------------------
app.post('/api/generate', async (req, res) => {
  const { duty_date, warehouse_id, dry_run = false } = req.body;
  if (!duty_date) {
    return res.status(400).json({ error: 'duty_date is required (YYYY-MM-DD)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Auto-close any unconfirmed past scheduled assignments
    await autoCloseUnconfirmedPastAssignments(client);

    // Advisory lock to serialize generation for target duty date
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`generate_pickup_${duty_date}`]
    );

    // Fetch active warehouses to plan for
    let whQuery = 'SELECT id, name FROM warehouses WHERE active = true';
    const whParams = [];
    if (warehouse_id) {
      whQuery += ' AND id = $1';
      whParams.push(warehouse_id);
    }
    whQuery += ' ORDER BY id';
    const warehouses = (await client.query(whQuery, whParams)).rows;

    // Fetch all active employees
    const employees = (
      await client.query(
        `SELECT id, warehouse_id, name, experience, skill, initial_completed_count, can_hold_key, eligible_for_normal_pickup, active, archived
         FROM employees
         WHERE archived = false AND active = true`
      )
    ).rows;

    // Fetch absences covering this date
    const absences = (
      await client.query(
        `SELECT employee_id, to_char(starts_on, 'YYYY-MM-DD') as starts_on,
                to_char(ends_on, 'YYYY-MM-DD') as ends_on
         FROM absences
         WHERE starts_on <= $1 AND ends_on >= $1`,
        [duty_date]
      )
    ).rows;

    // Fetch all assignments strictly before this date for fairness metrics
    const pastAssignments = (
      await client.query(
        `SELECT employee_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status
         FROM assignments
         WHERE duty_date < $1`,
        [duty_date]
      )
    ).rows;

    // Fetch daily requirements for this date
    const reqs = (
      await client.query(
        `SELECT warehouse_id, worker_count
         FROM daily_requirements
         WHERE duty_date = $1`,
        [duty_date]
      )
    ).rows;
    const reqMap = new Map(reqs.map((r) => [String(r.warehouse_id), r.worker_count]));

    // Fetch day absent employees to exclude
    const dayAbsentRes = await client.query(
      `SELECT employee_id FROM assignments WHERE duty_date = $1 AND status = 'absent'`,
      [duty_date]
    );
    const dayAbsentEmpIds = new Set(dayAbsentRes.rows.map((r) => String(r.employee_id)));

    // Fetch all active employees across both warehouses
    const allCandidates = employees.filter((emp) => {
      // Check if on vacation / absent
      if (isEmployeeAbsentOnDate(absences, emp.id, duty_date)) return false;
      if (dayAbsentEmpIds.has(String(emp.id))) return false;
      return true;
    });

    const results = [];
    const allWarnings = [];

    if (!warehouse_id) {
      // Check if an Emergency Super Senior is dispatched on this date
      const logRes = await client.query(
        `SELECT notes FROM daily_logs WHERE duty_date = $1`,
        [duty_date]
      );
      const notes = logRes.rows[0]?.notes || '';
      const isEmergencySuperSenior = notes.includes('Emergency Super Senior');

      let superSeniorCrewMode = 'with_2';
      if (isEmergencySuperSenior) {
        if (notes.includes('alone')) superSeniorCrewMode = 'alone';
        else if (notes.includes('with_1')) superSeniorCrewMode = 'with_1';
        else superSeniorCrewMode = 'with_2';
      }

      let defaultCount = 2;
      if (isEmergencySuperSenior) {
        defaultCount = superSeniorCrewMode === 'alone' ? 0 : superSeniorCrewMode === 'with_1' ? 1 : 2;
      }

      let totalNeeded = 0;
      for (const wh of warehouses) {
        totalNeeded += (reqMap.get(String(wh.id)) || defaultCount);
      }

      const { selected, warnings } = selectOvertimeCrew({
        dutyDate: duty_date,
        warehouseId: null, // Unified across active staff
        employees: allCandidates,
        pastAssignments,
        requiredCount: totalNeeded,
      });

      if (warnings.length > 0) {
        allWarnings.push(...warnings);
      }

      const unassignedCrew = [...selected];
      
      if (!dry_run) {
        if (isEmergencySuperSenior) {
          // Dispatched Emergency Super Senior is preserved, only replace normal helpers
          await client.query(
            `DELETE FROM assignments 
             WHERE duty_date = $1 
               AND status = 'scheduled' 
               AND employee_id NOT IN (SELECT id FROM employees WHERE experience = 'Super Senior')`,
            [duty_date]
          );
        } else {
          // Standard schedule recalculation
          await client.query(
            `DELETE FROM assignments 
             WHERE duty_date = $1 
               AND status = 'scheduled'`,
            [duty_date]
          );
        }
      }
      
      for (const wh of warehouses) {
        const needed = reqMap.get(String(wh.id)) || defaultCount;
        const whSelected = [];

        // Prefer matching employee's home warehouse if possible, otherwise cross-cover
        for (let i = 0; i < unassignedCrew.length && whSelected.length < needed; i++) {
          if (String(unassignedCrew[i].warehouse_id) === String(wh.id)) {
            whSelected.push(unassignedCrew.splice(i, 1)[0]);
            i--;
          }
        }
        // Fill remaining slots with anyone from the selected crew
        while (whSelected.length < needed && unassignedCrew.length > 0) {
          whSelected.push(unassignedCrew.shift());
        }

        results.push({
          warehouse_id: wh.id,
          warehouse_name: wh.name,
          required_count: needed,
          selected: whSelected,
          warnings,
        });

        if (!dry_run) {
          await client.query(
            `INSERT INTO assignment_runs (warehouse_id, duty_date, warning)
             VALUES ($1, $2, $3)
             ON CONFLICT (warehouse_id, duty_date)
             DO UPDATE SET warning = $3, generated_at = NOW()`,
            [wh.id, duty_date, warnings.join('; ') || null]
          );

          for (const emp of whSelected) {
            await client.query(
              `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status)
               VALUES ($1, $2, $3, 'scheduled')
               ON CONFLICT (employee_id, duty_date)
               DO UPDATE SET warehouse_id = $2, status = 'scheduled', updated_at = NOW()
               WHERE assignments.status = 'scheduled'`,
              [emp.id, wh.id, duty_date]
            );
          }
        }
      }
    } else {
      // Single warehouse target
      const wh = warehouses.find((w) => String(w.id) === String(warehouse_id)) || warehouses[0];
      const logRes = await client.query(`SELECT notes FROM daily_logs WHERE duty_date = $1`, [duty_date]);
      const notes = logRes.rows[0]?.notes || '';
      const isEmergencySuperSenior = notes.includes('Emergency Super Senior');

      let defaultCount = 2;
      if (isEmergencySuperSenior) {
        if (notes.includes('alone')) defaultCount = 0;
        else if (notes.includes('with_1')) defaultCount = 1;
        else defaultCount = 2;
      }

      const needed = reqMap.get(String(wh.id)) || defaultCount;

      const { selected, warnings } = selectOvertimeCrew({
        dutyDate: duty_date,
        warehouseId: null,
        employees: allCandidates,
        pastAssignments,
        requiredCount: needed,
      });

      results.push({
        warehouse_id: wh.id,
        warehouse_name: wh.name,
        required_count: needed,
        selected,
        warnings,
      });

      if (warnings.length > 0) allWarnings.push(...warnings);

      if (!dry_run) {
        if (isEmergencySuperSenior) {
          await client.query(
            `DELETE FROM assignments 
             WHERE duty_date = $1 
               AND warehouse_id = $2 
               AND status = 'scheduled'
               AND employee_id NOT IN (SELECT id FROM employees WHERE experience = 'Super Senior')`,
            [duty_date, wh.id]
          );
        } else {
          await client.query(
            `DELETE FROM assignments 
             WHERE duty_date = $1 
               AND warehouse_id = $2 
               AND status = 'scheduled'`,
            [duty_date, wh.id]
          );
        }
        for (const emp of selected) {
          await client.query(
            `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status)
             VALUES ($1, $2, $3, 'scheduled')
             ON CONFLICT (employee_id, duty_date)
             DO UPDATE SET warehouse_id = $2, status = 'scheduled', updated_at = NOW()
             WHERE assignments.status = 'scheduled'`,
            [emp.id, wh.id, duty_date]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({
      duty_date,
      dry_run,
      results,
      warnings: allWarnings,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/generate error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 6b. Manual Staff Override — Admin picks specific employees for a duty date
// --------------------------------------------------------------------------
app.post('/api/assignments/manual-override', requireAuth, async (req, res) => {
  const { duty_date, employee_ids } = req.body;

  if (!duty_date) {
    return res.status(400).json({ error: 'duty_date is required (YYYY-MM-DD)' });
  }
  if (!Array.isArray(employee_ids) || employee_ids.length === 0 || employee_ids.length > 2) {
    return res.status(400).json({ error: 'employee_ids must be an array of 1 or 2 employee IDs' });
  }

  // Security guardrail: Mods can only assign for today or upcoming dates
  const todayStr = getTodayDateStr();
  if (duty_date < todayStr && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: Only Administrator can manually assign past dates. Mods can only assign for today and upcoming dates.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve warehouse (Main Warehouse)
    const whRes = await client.query(
      "SELECT id, name FROM warehouses WHERE active = true ORDER BY (name = 'Main Warehouse') DESC, id ASC LIMIT 1"
    );
    if (!whRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No active warehouse found' });
    }
    const warehouse = whRes.rows[0];

    // Validate employees — must exist, be active, not archived, not on-call Super Senior
    const empRes = await client.query(
      `SELECT id, name, experience, active, archived, eligible_for_normal_pickup
       FROM employees
       WHERE id = ANY($1::int[])`,
      [employee_ids.map(Number)]
    );
    const empMap = new Map(empRes.rows.map((e) => [String(e.id), e]));

    const invalid = [];
    for (const eid of employee_ids) {
      const emp = empMap.get(String(eid));
      if (!emp) invalid.push(`Employee ID ${eid} not found`);
      else if (emp.archived) invalid.push(`${emp.name} is archived`);
      else if (!emp.active) invalid.push(`${emp.name} is inactive`);
      else if (emp.experience === 'Super Senior' && !emp.eligible_for_normal_pickup) {
        invalid.push(`${emp.name} is Super Senior (On-Call only) — enable "Can do normal pickup" or use Emergency Dispatch`);
      }
    }
    if (invalid.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: invalid.join('; ') });
    }

    // Delete existing scheduled assignments for this date (preserve absent/completed)
    await client.query(
      `DELETE FROM assignments
       WHERE duty_date = $1 AND status = 'scheduled'
         AND employee_id NOT IN (SELECT id FROM employees WHERE experience = 'Super Senior')`,
      [duty_date]
    );

    // Insert manual assignments
    const assignedNames = [];
    for (const eid of employee_ids) {
      const emp = empMap.get(String(eid));
      await client.query(
        `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status)
         VALUES ($1, $2, $3, 'scheduled')
         ON CONFLICT (employee_id, duty_date)
         DO UPDATE SET warehouse_id = $2, status = 'scheduled', updated_at = NOW()
         WHERE assignments.status = 'scheduled'`,
        [Number(eid), warehouse.id, duty_date]
      );
      assignedNames.push(emp.name);
    }

    // Log to assignment_runs for audit trail
    const callerName = req.user.role === 'admin' ? 'admin' : (req.user.name || 'Mod');
    const warningText = `Manual override by ${callerName}: ${assignedNames.join(' & ')} assigned`;
    await client.query(
      `INSERT INTO assignment_runs (warehouse_id, duty_date, warning)
       VALUES ($1, $2, $3)
       ON CONFLICT (warehouse_id, duty_date)
       DO UPDATE SET warning = $3, generated_at = NOW()`,
      [warehouse.id, duty_date, warningText]
    );

    await client.query('COMMIT');
    res.json({
      duty_date,
      warehouse_id: warehouse.id,
      warehouse_name: warehouse.name,
      assigned: assignedNames,
      message: `Manually assigned: ${assignedNames.join(' & ')} for ${duty_date}`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/assignments/manual-override error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 6c. Emergency Super Senior Assignment API (On-Call Big Shipments)
// --------------------------------------------------------------------------
app.post('/api/assignments/super-senior', async (req, res) => {

  const { duty_date, super_senior_id, crew_mode = 'with_2' } = req.body;
  if (!duty_date) {
    return res.status(400).json({ error: 'duty_date is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get active warehouse (Main Warehouse)
    const whRes = await client.query(
      "SELECT id, name FROM warehouses WHERE active = true ORDER BY (name = 'Main Warehouse') DESC, id ASC LIMIT 1"
    );
    const warehouse_id = whRes.rows[0]?.id;

    if (crew_mode === 'remove') {
      // Remove super senior assignment for this date
      await client.query(
        `DELETE FROM assignments 
         WHERE duty_date = $1 
           AND employee_id IN (SELECT id FROM employees WHERE experience = 'Super Senior')`,
        [duty_date]
      );
      
      // Clean up log note
      await client.query(
        `UPDATE daily_logs 
         SET notes = NULL 
         WHERE duty_date = $1 AND notes LIKE '%Emergency Super Senior%'`,
        [duty_date]
      );

      // Ensure standard 2 normal workers are scheduled
      const normalAssigned = (await client.query(
        `SELECT a.id, a.employee_id, a.status 
         FROM assignments a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.duty_date = $1 AND a.status != 'absent' AND e.experience != 'Super Senior'
         ORDER BY a.id ASC`,
        [duty_date]
      )).rows;

      if (normalAssigned.length < 2) {
        const neededCount = 2 - normalAssigned.length;
        const alreadyAssignedEmpIds = normalAssigned.map((a) => a.employee_id);

        const allCandidates = (await client.query(
          `SELECT id, warehouse_id, name, experience, skill, initial_completed_count, can_hold_key, eligible_for_normal_pickup, active, archived
           FROM employees
           WHERE archived = false AND active = true AND (experience != 'Super Senior' OR eligible_for_normal_pickup = true)
             AND ($1::bigint[] IS NULL OR id != ALL($1::bigint[]))`,
          [alreadyAssignedEmpIds.length > 0 ? alreadyAssignedEmpIds : null]
        )).rows;

        const pastRes = await client.query(
          `SELECT employee_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status
           FROM assignments WHERE duty_date < $1`,
          [duty_date]
        );

        const absences = (await client.query(
          `SELECT employee_id FROM absences WHERE starts_on <= $1 AND ends_on >= $1`,
          [duty_date]
        )).rows;
        const absentSet = new Set(absences.map((a) => String(a.employee_id)));
        const presentCandidates = allCandidates.filter((e) => !absentSet.has(String(e.id)));

        if (presentCandidates.length > 0) {
          const { selected } = selectOvertimeCrew({
            dutyDate: duty_date,
            warehouseId: null,
            employees: presentCandidates,
            pastAssignments: pastRes.rows,
            requiredCount: neededCount,
          });

          for (const emp of selected) {
            await client.query(
              `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status)
               VALUES ($1, $2, $3, 'scheduled')
               ON CONFLICT (employee_id, duty_date)
               DO UPDATE SET warehouse_id = $2, status = 'scheduled', updated_at = NOW()`,
              [emp.id, warehouse_id, duty_date]
            );
          }
        }
      }

      await client.query('COMMIT');

      const updatedAssignments = await pool.query(
        `SELECT a.id, a.employee_id, a.warehouse_id, to_char(a.duty_date, 'YYYY-MM-DD') as duty_date,
                a.status, e.name as employee_name, e.experience, e.skill, w.name as warehouse_name
         FROM assignments a
         JOIN employees e ON a.employee_id = e.id
         JOIN warehouses w ON a.warehouse_id = w.id
         WHERE a.duty_date = $1
         ORDER BY a.id ASC`,
        [duty_date]
      );

      return res.json({
        success: true,
        duty_date,
        crew_mode: 'remove',
        assignments: updatedAssignments.rows,
        message: 'Super Senior removed and standard 2-person rotation restored',
      });
    }

    let targetSuperSeniorId = super_senior_id;
    if (!targetSuperSeniorId) {
      const ssRes = await client.query(
        "SELECT id, name FROM employees WHERE experience = 'Super Senior' AND active = true AND archived = false LIMIT 1"
      );
      if (ssRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'No active Super Senior found. Please add or configure a Super Senior in Employee Staff roster first.'
        });
      }
      targetSuperSeniorId = ssRes.rows[0].id;
    } else {
      const ssRes = await client.query(
        "SELECT id, name FROM employees WHERE id = $1 AND experience = 'Super Senior'",
        [targetSuperSeniorId]
      );
      if (ssRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selected employee is not configured as a Super Senior.' });
      }
    }

    // Upsert Super Senior assignment for this date
    await client.query(
      `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status)
       VALUES ($1, $2, $3, 'scheduled')
       ON CONFLICT (employee_id, duty_date)
       DO UPDATE SET warehouse_id = $2, status = 'scheduled', updated_at = NOW()`,
      [targetSuperSeniorId, warehouse_id, duty_date]
    );

    // Fetch existing normal scheduled/completed workers on this date
    const normalAssigned = (await client.query(
      `SELECT a.id, a.employee_id, a.status 
       FROM assignments a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.duty_date = $1 AND a.status != 'absent' AND e.experience != 'Super Senior'
       ORDER BY a.id ASC`,
      [duty_date]
    )).rows;

    let targetNormalCount = 2;
    if (crew_mode === 'alone') {
      targetNormalCount = 0;
    } else if (crew_mode === 'with_1') {
      targetNormalCount = 1;
    } else if (crew_mode === 'with_2') {
      targetNormalCount = 2;
    }

    if (normalAssigned.length > targetNormalCount) {
      // Remove excess normal workers (delete from end)
      const toRemove = normalAssigned.slice(targetNormalCount);
      for (const item of toRemove) {
        await client.query('DELETE FROM assignments WHERE id = $1', [item.id]);
      }
    } else if (normalAssigned.length < targetNormalCount) {
      // Need to schedule remaining normal worker slots using algorithm
      const neededCount = targetNormalCount - normalAssigned.length;
      const alreadyAssignedEmpIds = [targetSuperSeniorId, ...normalAssigned.map((a) => a.employee_id)];

      const allCandidates = (await client.query(
        `SELECT id, warehouse_id, name, experience, skill, initial_completed_count, can_hold_key, eligible_for_normal_pickup, active, archived
         FROM employees
         WHERE archived = false AND active = true AND (experience != 'Super Senior' OR eligible_for_normal_pickup = true)
           AND id != ALL($1::bigint[])`,
        [alreadyAssignedEmpIds]
      )).rows;

      const pastRes = await client.query(
        `SELECT employee_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status
         FROM assignments WHERE duty_date < $1`,
        [duty_date]
      );

      const absences = (await client.query(
        `SELECT employee_id FROM absences WHERE starts_on <= $1 AND ends_on >= $1`,
        [duty_date]
      )).rows;
      const absentSet = new Set(absences.map((a) => String(a.employee_id)));
      const presentCandidates = allCandidates.filter((e) => !absentSet.has(String(e.id)));

      if (presentCandidates.length > 0) {
        const { selected } = selectOvertimeCrew({
          dutyDate: duty_date,
          warehouseId: null,
          employees: presentCandidates,
          pastAssignments: pastRes.rows,
          requiredCount: neededCount,
        });

        for (const emp of selected) {
          await client.query(
            `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status)
             VALUES ($1, $2, $3, 'scheduled')
             ON CONFLICT (employee_id, duty_date)
             DO UPDATE SET warehouse_id = $2, status = 'scheduled', updated_at = NOW()`,
            [emp.id, warehouse_id, duty_date]
          );
        }
      }
    }

    // Record note in daily_logs
    await client.query(
      `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
       VALUES ($1, $2, 'overtime_stay', $3)
       ON CONFLICT (warehouse_id, duty_date)
       DO UPDATE SET notes = $3`,
      [warehouse_id, duty_date, `👑 Emergency Super Senior on duty (${crew_mode})`]
    );

    await client.query('COMMIT');

    // Return updated assignments for this date
    const updatedAssignments = await pool.query(
      `SELECT a.id, a.employee_id, a.warehouse_id, to_char(a.duty_date, 'YYYY-MM-DD') as duty_date,
              a.status, e.name as employee_name, e.experience, e.skill, w.name as warehouse_name
       FROM assignments a
       JOIN employees e ON a.employee_id = e.id
       JOIN warehouses w ON a.warehouse_id = w.id
       WHERE a.duty_date = $1
       ORDER BY (e.experience = 'Super Senior') DESC, a.id ASC`,
      [duty_date]
    );

    res.json({
      success: true,
      duty_date,
      crew_mode,
      super_senior_id: targetSuperSeniorId,
      assignments: updatedAssignments.rows,
      message: `Super Senior scheduled for ${duty_date} (${crew_mode})`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error scheduling Super Senior:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 7. Assignments Status Update API (Tracking who actually stayed)
// --------------------------------------------------------------------------
app.patch('/api/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['scheduled', 'completed', 'absent'].includes(status)) {
      return res.status(400).json({
        error: "Status must be one of: 'scheduled', 'completed', 'absent'",
      });
    }

    // Safety rule: Only Administrator can modify assignment records on past dates
    const check = await pool.query(
      "SELECT to_char(duty_date, 'YYYY-MM-DD') as duty_date FROM assignments WHERE id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const todayStr = getTodayDateStr();
    if (check.rows[0].duty_date < todayStr && req.user?.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Only administrators can modify assignment records on past dates.',
      });
    }

    const result = await pool.query(
      `UPDATE assignments
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, employee_id, warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status`,
      [status, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 7b. Report Absent & Auto-Reassign Immediate Replacement
// --------------------------------------------------------------------------
app.post('/api/assignments/report-absence', async (req, res) => {
  const { assignment_id, reason = 'Reported Absent' } = req.body;
  if (!assignment_id) {
    return res.status(400).json({ error: 'assignment_id is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch current assignment
    const assignRes = await client.query(
      `SELECT a.*, e.name as employee_name, to_char(a.duty_date, 'YYYY-MM-DD') as duty_date
       FROM assignments a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.id = $1`,
      [assignment_id]
    );

    if (assignRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const currentAssignment = assignRes.rows[0];
    const { employee_id, warehouse_id, duty_date, status: currentStatus } = currentAssignment;

    if (currentStatus === 'absent') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Employee is already marked absent for this assignment.' });
    }

    // 2. Mark this assignment as 'absent'
    await client.query(
      `UPDATE assignments SET status = 'absent', updated_at = NOW() WHERE id = $1`,
      [assignment_id]
    );

    // 3. Insert into absences for this date
    await client.query(
      `INSERT INTO absences (employee_id, starts_on, ends_on, reason)
       VALUES ($1, $2, $2, $3)`,
      [employee_id, duty_date, reason]
    );

    // 4. Find immediate replacement candidate across BOTH warehouses on this date!
    const employeesRes = await client.query(
      `SELECT id, warehouse_id, name, experience, skill, initial_completed_count, can_hold_key, eligible_for_normal_pickup, active, archived
       FROM employees
       WHERE active = true AND archived = false`
    );

    const absencesRes = await client.query(
      `SELECT employee_id FROM absences WHERE starts_on <= $1 AND ends_on >= $1`,
      [duty_date]
    );
    const absentEmpIds = new Set(absencesRes.rows.map((a) => String(a.employee_id)));

    // Fetch who is already assigned on this date across either warehouse
    const currentDutyRes = await client.query(
      `SELECT employee_id FROM assignments WHERE duty_date = $1 AND status != 'absent'`,
      [duty_date]
    );
    const alreadyAssigned = new Set(currentDutyRes.rows.map((a) => String(a.employee_id)));

    const presentCandidates = employeesRes.rows.filter(
      (e) => !absentEmpIds.has(String(e.id)) && !alreadyAssigned.has(String(e.id))
    );

    const pastRes = await client.query(
      `SELECT employee_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status
       FROM assignments
       WHERE duty_date < $1`,
      [duty_date]
    );

    let replacement = null;
    if (presentCandidates.length > 0) {
      const { selected } = selectOvertimeCrew({
        dutyDate: duty_date,
        warehouseId: null, // Cross-warehouse eligible!
        employees: presentCandidates,
        pastAssignments: pastRes.rows,
        requiredCount: 1,
      });

      if (selected.length > 0) {
        replacement = selected[0];
        await client.query(
          `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status, replaces_assignment_id)
           VALUES ($1, $2, $3, 'scheduled', $4)`,
          [replacement.id, warehouse_id, duty_date, assignment_id]
        );
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      original_assignment_id: assignment_id,
      duty_date,
      absent_employee_id: employee_id,
      absent_employee_name: currentAssignment.employee_name,
      reason,
      replacement,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reporting absence:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 7c. Confirm Today's Overtime Crew
// --------------------------------------------------------------------------
app.post('/api/assignments/confirm-today', async (req, res) => {
  const { duty_date, senior_risk_acknowledged } = req.body;
  if (!duty_date) {
    return res.status(400).json({ error: 'duty_date is required' });
  }

  // Safety rule: Only administrators can confirm past shifts. Mods can only confirm today.
  const todayStr = getTodayDateStr();
  if (duty_date < todayStr && req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: Only administrators can confirm past shifts. Mods can only confirm today.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const notes = senior_risk_acknowledged
      ? 'Confirmed by dispatcher (Senior Supervisor acknowledged Head Office key delivery risk)'
      : 'Confirmed by dispatcher';

    // Ensure daily log is set to 'overtime_stay' and clear any conflicting previous records
    await client.query(`DELETE FROM daily_logs WHERE duty_date = $1`, [duty_date]);
    await client.query(
      `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
       VALUES (NULL, $1, 'overtime_stay', $2)`,
      [duty_date, notes]
    );

    // Update scheduled assignments for this date to 'completed'
    await client.query(
      `UPDATE assignments SET status = 'completed', updated_at = NOW()
       WHERE duty_date = $1 AND status = 'scheduled'`,
      [duty_date]
    );

    // Fetch confirmed assignments
    const confirmed = await client.query(
      `SELECT a.*, e.name as employee_name, e.can_hold_key, e.warehouse_id as home_warehouse_id,
              hw.name as home_warehouse_name, w.name as warehouse_name
       FROM assignments a
       JOIN employees e ON a.employee_id = e.id
       JOIN warehouses w ON a.warehouse_id = w.id
       LEFT JOIN warehouses hw ON e.warehouse_id = hw.id
       WHERE a.duty_date = $1
       ORDER BY w.name, e.name`,
      [duty_date]
    );

    await client.query('COMMIT');
    res.json({
      success: true,
      duty_date,
      confirmed_count: confirmed.rowCount,
      updatedCount: confirmed.rowCount,
      confirmed_workers: confirmed.rows,
      assignments: confirmed.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error confirming today assignments:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 7d. Swap Warehouse Assignments
// --------------------------------------------------------------------------
app.post('/api/assignments/swap', async (req, res) => {
  const { duty_date } = req.body;
  if (!duty_date) {
    return res.status(400).json({ error: 'duty_date is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const activeAssignments = (
      await client.query(
        `SELECT id, warehouse_id FROM assignments
         WHERE duty_date = $1 AND status != 'absent'
         ORDER BY id LIMIT 2`,
        [duty_date]
      )
    ).rows;

    if (activeAssignments.length === 2) {
      const [first, second] = activeAssignments;
      await client.query('UPDATE assignments SET warehouse_id = $1 WHERE id = $2', [
        second.warehouse_id,
        first.id,
      ]);
      await client.query('UPDATE assignments SET warehouse_id = $1 WHERE id = $2', [
        first.warehouse_id,
        second.id,
      ]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Swapped warehouse locations successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 7e. Manual Historical Pickup Backfill (For Pre-App History)
// --------------------------------------------------------------------------
app.post('/api/historical-pickup', async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can add historical pickup records.' });
  }

  const { employee_id, warehouse_id, duty_date } = req.body;
  if (!employee_id || !warehouse_id || !duty_date) {
    return res.status(400).json({ error: 'employee_id, warehouse_id, and duty_date are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert or update completed assignment
    const assignRes = await client.query(
      `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status)
       VALUES ($1, $2, $3, 'completed')
       ON CONFLICT (employee_id, duty_date)
       DO UPDATE SET warehouse_id = $2, status = 'completed', updated_at = NOW()
       RETURNING *`,
      [employee_id, warehouse_id, duty_date]
    );

    // 2. Ensure daily_logs records overtime_stay
    await client.query(
      `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
       VALUES (NULL, $1, 'overtime_stay', 'Historical overtime record backfilled')
       ON CONFLICT (warehouse_id, duty_date)
       DO UPDATE SET status = 'overtime_stay', notes = 'Historical overtime record backfilled'`,
      [duty_date]
    );

    await client.query('COMMIT');

    // Fetch enriched created row
    const enriched = await pool.query(
      `SELECT a.id, a.employee_id, a.warehouse_id, to_char(a.duty_date, 'YYYY-MM-DD') as duty_date,
              a.status, a.selected_at, a.updated_at, a.replaces_assignment_id,
              e.name as employee_name, e.experience, e.skill,
              e.warehouse_id as home_warehouse_id, hw.name as home_warehouse_name,
              w.name as warehouse_name
       FROM assignments a
       JOIN employees e ON a.employee_id = e.id
       JOIN warehouses w ON a.warehouse_id = w.id
       LEFT JOIN warehouses hw ON e.warehouse_id = hw.id
       WHERE a.id = $1`,
      [assignRes.rows[0].id]
    );

    res.status(201).json({
      success: true,
      assignment: enriched.rows[0],
      message: 'Historical pickup logged successfully.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error logging historical pickup:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/historical-pickup/:id', async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can delete historical pickup records.' });
  }

  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      `DELETE FROM assignments WHERE id = $1 RETURNING to_char(duty_date, 'YYYY-MM-DD') as duty_date`,
      [id]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Record not found' });
    }

    const duty_date = checkRes.rows[0].duty_date;

    // Check if any other completed pickups remain on this date
    const remaining = await client.query(
      `SELECT count(*) FROM assignments WHERE duty_date = $1 AND status = 'completed'`,
      [duty_date]
    );

    if (Number(remaining.rows[0].count) === 0) {
      await client.query(
        `DELETE FROM daily_logs WHERE duty_date = $1 AND status = 'overtime_stay'`,
        [duty_date]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, id, duty_date, message: 'Historical pickup record removed.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --------------------------------------------------------------------------
// 7f. Emergency Sunday Pickup Toggle
// --------------------------------------------------------------------------
app.post('/api/daily-status/emergency-sunday', async (req, res) => {
  const { duty_date, enabled } = req.body;
  if (!duty_date) {
    return res.status(400).json({ error: 'duty_date is required' });
  }

  const todayStr = getTodayDateStr();
  if (duty_date < todayStr && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can modify emergency Sunday status for past dates.' });
  }

  try {
    if (enabled) {
      await pool.query(
        `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
         VALUES (NULL, $1, 'emergency_sunday', 'Emergency Sunday Pickup Activated')
         ON CONFLICT (warehouse_id, duty_date)
         DO UPDATE SET status = 'emergency_sunday', notes = 'Emergency Sunday Pickup Activated'`,
        [duty_date]
      );
    } else {
      await pool.query(
        `DELETE FROM daily_logs WHERE duty_date = $1 AND (notes LIKE '%Emergency Sunday%' OR status = 'emergency_sunday')`,
        [duty_date]
      );
      await pool.query(
        `DELETE FROM assignments WHERE duty_date = $1 AND status = 'scheduled'`,
        [duty_date]
      );
    }
    res.json({ success: true, duty_date, enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 8. Monthly Report Export API (CSV & JSON)
// --------------------------------------------------------------------------
app.get('/api/export', async (req, res) => {
  try {
    let { month, format = 'csv' } = req.query;

    // Default to previous month if not specified
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    }

    const assignmentsRes = await pool.query(
      `SELECT a.id, to_char(a.duty_date, 'YYYY-MM-DD') as duty_date, a.status,
              e.name as employee_name, e.experience, e.skill,
              w.name as warehouse_name, hw.name as home_warehouse_name
       FROM assignments a
       JOIN employees e ON a.employee_id = e.id
       JOIN warehouses w ON a.warehouse_id = w.id
       LEFT JOIN warehouses hw ON e.warehouse_id = hw.id
       WHERE to_char(a.duty_date, 'YYYY-MM') = $1
       ORDER BY a.duty_date ASC, w.name ASC`,
      [month]
    );

    const logsRes = await pool.query(
      `SELECT to_char(duty_date, 'YYYY-MM-DD') as duty_date, status, notes
       FROM daily_logs
       WHERE to_char(duty_date, 'YYYY-MM') = $1
       ORDER BY duty_date ASC`,
      [month]
    );

    const logMap = new Map(logsRes.rows.map((l) => [l.duty_date, l]));
    const records = assignmentsRes.rows;

    const completedCount = records.filter((r) => r.status === 'completed').length;
    const scheduledCount = records.filter((r) => r.status === 'scheduled').length;
    const absentCount = records.filter((r) => r.status === 'absent').length;
    const uniqueEmployees = new Set(records.map((r) => r.employee_name)).size;

    if (format === 'json') {
      return res.json({
        month,
        records,
        daily_logs: logsRes.rows,
        summary: {
          total_records: records.length,
          completed_count: completedCount,
          scheduled_count: scheduledCount,
          absent_count: absentCount,
          unique_employees: uniqueEmployees,
        },
      });
    }

    // Format CSV
    const rows = [
      ['PickUp Logistics - Monthly Overtime Duty Report', `Month: ${month}`],
      ['Generated At:', new Date().toISOString()],
      [],
      [
        'Duty Date',
        'Day',
        'Assigned Staff 1',
        'Assigned Staff 2',
        'Super Senior (Emergency)',
        'Facility Outcome / Status',
        'Notes',
      ],
    ];

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Group records by duty_date
    const assignMap = new Map();
    for (const r of records) {
      if (!assignMap.has(r.duty_date)) {
        assignMap.set(r.duty_date, []);
      }
      assignMap.get(r.duty_date).push(r);
    }

    const [yearStr, monthStr] = month.split('-');
    const daysInMonth = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();

    let totalStays = 0;
    let before7pmDays = 0;
    let noPickupDays = 0;
    let sundaysOffDays = 0;
    let holidayDays = 0;
    const perStaffStays = new Map();

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${month}-${dayStr}`;
      const dateObj = new Date(dateStr + 'T00:00:00');
      const dayName = dayNames[dateObj.getDay()];
      const isSunday = dateObj.getDay() === 0;

      const dayAssigns = assignMap.get(dateStr) || [];
      const activeAssigns = dayAssigns.filter((a) => a.status !== 'absent');
      const normalWorkers = activeAssigns.filter((a) => a.experience !== 'Super Senior');
      const superSeniors = activeAssigns.filter((a) => a.experience === 'Super Senior');

      const dayLog = logMap.get(dateStr);
      let outcome = 'no_pickup';

      if (dayLog) {
        outcome = dayLog.status;
      } else if (activeAssigns.length > 0) {
        outcome = 'overtime_stay';
      } else if (isSunday) {
        outcome = 'sunday_off';
      } else {
        outcome = 'no_pickup';
      }

      if (outcome === 'overtime_stay') totalStays++;
      else if (outcome === 'before_7pm') before7pmDays++;
      else if (outcome === 'no_pickup') noPickupDays++;
      else if (outcome === 'sunday_off') sundaysOffDays++;
      else if (outcome === 'holiday') holidayDays++;

      for (const a of activeAssigns) {
        if (a.status === 'completed' || outcome === 'overtime_stay') {
          const existing = perStaffStays.get(a.employee_name) || { count: 0, experience: a.experience };
          existing.count += 1;
          perStaffStays.set(a.employee_name, existing);
        }
      }

      rows.push([
        dateStr,
        dayName,
        normalWorkers[0]?.employee_name || '-',
        normalWorkers[1]?.employee_name || '-',
        superSeniors.map((s) => s.employee_name).join(', ') || '-',
        outcome.replace('_', ' ').toUpperCase(),
        dayLog?.notes || '',
      ]);
    }

    rows.push([]);
    rows.push(['--- MONTHLY SUMMARY STATISTICS ---']);
    rows.push(['Total Pickups Recorded', records.length]);
    rows.push(['Completed Overtime Stays', completedCount]);
    rows.push(['Scheduled Shifts', scheduledCount]);
    rows.push(['Reported Absences', absentCount]);
    rows.push(['Unique Staff Dispatched', uniqueEmployees]);
    rows.push(['Total Overtime Pickup Stays (Days)', totalStays]);
    rows.push(['Total Days Pickup Happened Before 7 PM', before7pmDays]);
    rows.push(['Total Days No Pickup Happened', noPickupDays]);
    rows.push(['Total Sundays (Facility Off)', sundaysOffDays]);
    rows.push(['Combined Days: No Pickup Happened + Sundays', noPickupDays + sundaysOffDays]);
    rows.push(['Total Facility Holidays (Closed)', holidayDays]);
    rows.push([]);
    rows.push(['--- TOTAL NUMBER OF DAYS STAFF STAYED (PER EMPLOYEE + SUPER SENIOR) ---']);
    rows.push(['Employee Name', 'Rank / Experience', 'Total Overtime Stays (Days)']);

    const staffList = Array.from(perStaffStays.entries())
      .map(([name, data]) => ({ name, experience: data.experience, stays: data.count }))
      .sort((a, b) => b.stays - a.stays);

    if (staffList.length > 0) {
      for (const s of staffList) {
        rows.push([s.name, s.experience, s.stays]);
      }
    } else {
      rows.push(['No completed overtime stays logged for this month', '', 0]);
    }

    const csvContent =
      '\uFEFF' +
      rows
        .map((row) =>
          row
            .map((val) => {
              const str = String(val ?? '');
              return `"${str.replace(/"/g, '""')}"`;
            })
            .join(',')
        )
        .join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pickup-report-${month}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Graceful process shutdown
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

// Serve frontend build if dist exists
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start server if run directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  app.listen(PORT, () => {
    console.log(`PickUp server listening on port ${PORT}`);
  });
}

export default app;
