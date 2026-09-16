import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { computeEmployeeMetrics, selectOvertimeCrew } from './algorithm.js';
import { initDb, pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Initialize DB schema on startup
await initDb().catch((err) => {
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
    const warehousesRes = await pool.query(
      'SELECT id, name, active FROM warehouses ORDER BY name'
    );
    const employeesRes = await pool.query(
      `SELECT e.id, e.warehouse_id, e.name, e.experience, e.skill, e.active, e.created_at, w.name as warehouse_name
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
              e.name as employee_name, e.experience, e.skill, e.warehouse_id as home_warehouse_id,
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
      `SELECT id, warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status, notes
       FROM daily_logs`
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

// --------------------------------------------------------------------------
// 3. Employees API
// --------------------------------------------------------------------------
app.post('/api/employees', async (req, res) => {
  try {
    const { warehouse_id, name, experience, skill, active } = req.body;
    if (!name || !warehouse_id || !experience || skill == null) {
      return res.status(400).json({ error: 'Missing required employee fields' });
    }
    const result = await pool.query(
      `INSERT INTO employees (warehouse_id, name, experience, skill, active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [warehouse_id, name.trim(), experience, Number(skill), active ?? true]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouse_id, name, experience, skill, active } = req.body;
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

    const whId = warehouse_id ? Number(warehouse_id) : null;
    const result = await pool.query(
      `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (warehouse_id, duty_date)
       DO UPDATE SET status = $3, notes = $4
       RETURNING id, warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status, notes`,
      [whId, duty_date, status, notes || null]
    );
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
        `SELECT id, warehouse_id, name, experience, skill, active, archived
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

    // Fetch all active employees across both warehouses
    const allCandidates = employees.filter((emp) => {
      // Check if on vacation / absent
      if (isEmployeeAbsentOnDate(absences, emp.id, duty_date)) return false;
      return true;
    });

    const results = [];
    const allWarnings = [];

    if (!warehouse_id) {
      // UNIFIED CROSS-WAREHOUSE SELECTION:
      // People from both warehouses can stay at any warehouse.
      // At one time both employees could be from New or Old Warehouse.
      let totalNeeded = 0;
      for (const wh of warehouses) {
        totalNeeded += (reqMap.get(String(wh.id)) || 1);
      }

      const { selected, warnings } = selectOvertimeCrew({
        dutyDate: duty_date,
        warehouseId: null, // Unified across both warehouses
        employees: allCandidates,
        pastAssignments,
        requiredCount: totalNeeded,
      });

      if (warnings.length > 0) {
        allWarnings.push(...warnings);
      }

      // Distribute the selected candidates to the warehouses
      // (1 per warehouse by default, up to each warehouse's required count)
      const unassignedCrew = [...selected];
      
      if (!dry_run) {
        await client.query(
          `DELETE FROM assignments WHERE duty_date = $1 AND status = 'scheduled'`,
          [duty_date]
        );
      }
      
      for (const wh of warehouses) {
        const needed = reqMap.get(String(wh.id)) || 1;
        const whSelected = [];

        // Prefer matching employee's home warehouse if possible, otherwise cross-cover
        for (let i = 0; i < unassignedCrew.length && whSelected.length < needed; i++) {
          if (String(unassignedCrew[i].warehouse_id) === String(wh.id)) {
            whSelected.push(unassignedCrew.splice(i, 1)[0]);
            i--;
          }
        }
        // Fill remaining slots with anyone from the selected crew (cross-warehouse cover)
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
      const needed = reqMap.get(String(wh.id)) || 1;

      const { selected, warnings } = selectOvertimeCrew({
        dutyDate: duty_date,
        warehouseId: null, // Allow cross-warehouse selection
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
        await client.query(
          `DELETE FROM assignments WHERE duty_date = $1 AND warehouse_id = $2 AND status = 'scheduled'`,
          [duty_date, wh.id]
        );
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
    const result = await pool.query(
      `UPDATE assignments
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, employee_id, warehouse_id, to_char(duty_date, 'YYYY-MM-DD') as duty_date, status`,
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
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
      `SELECT id, warehouse_id, name, experience, skill, active, archived
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
  const { duty_date } = req.body;
  if (!duty_date) {
    return res.status(400).json({ error: 'duty_date is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure daily log is set to 'overtime_stay'
    await client.query(
      `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
       VALUES (NULL, $1, 'overtime_stay', 'Confirmed by dispatcher')
       ON CONFLICT (warehouse_id, duty_date)
       DO UPDATE SET status = 'overtime_stay', notes = 'Confirmed by dispatcher'`,
      [duty_date]
    );

    // Update scheduled assignments for this date to 'completed'
    await client.query(
      `UPDATE assignments SET status = 'completed', updated_at = NOW()
       WHERE duty_date = $1 AND status = 'scheduled'`,
      [duty_date]
    );

    // Fetch confirmed assignments
    const confirmed = await client.query(
      `SELECT a.*, e.name as employee_name, e.warehouse_id as home_warehouse_id,
              hw.name as home_warehouse_name, w.name as warehouse_name
       FROM assignments a
       JOIN employees e ON a.employee_id = e.id
       JOIN warehouses w ON a.warehouse_id = w.id
       LEFT JOIN warehouses hw ON e.warehouse_id = hw.id
       WHERE a.duty_date = $1 AND a.status != 'absent'`,
      [duty_date]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      duty_date,
      confirmed_workers: confirmed.rows,
      message: 'Overtime crew confirmed for today.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
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
        'Day of Week',
        'Warehouse',
        'Assigned Employee',
        'Experience',
        'Skill Rating',
        'Duty Status',
        'Facility Outcome',
        'Notes',
      ],
    ];

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const r of records) {
      const d = new Date(r.duty_date + 'T00:00:00');
      const dayOfWeek = dayNames[d.getDay()] || '';
      const dayLog = logMap.get(r.duty_date);

      rows.push([
        r.duty_date,
        dayOfWeek,
        r.warehouse_name,
        r.employee_name,
        r.experience,
        `${r.skill}/5`,
        r.status.toUpperCase(),
        dayLog ? dayLog.status.replace('_', ' ').toUpperCase() : 'STANDARD',
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
