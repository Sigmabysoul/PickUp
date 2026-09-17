import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db.js';

/**
 * Generic CSV Line Parser handling quotes, commas, and line endings.
 */
function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = [];

  for (const line of lines) {
    const row = [];
    let insideQuotes = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        row.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    rows.push(row);
  }
  return rows;
}

const monthMap = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function parseDateToISO(str) {
  if (!str) return null;
  str = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, '0');
  const mo = monthMap[m[2].toLowerCase()];
  const y = m[3];
  if (!mo) return null;
  return `${y}-${mo}-${d}`;
}

function toTitleCase(str) {
  return str.trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Helper to normalize experience levels to valid DB check constraint values.
 */
function normalizeExperience(exp) {
  if (!exp) return 'Mid';
  const clean = exp.trim();
  if (/super\s*senior/i.test(clean)) return 'Super Senior';
  if (/senior/i.test(clean)) return 'Senior';
  if (/junior/i.test(clean)) return 'Junior';
  if (/mid/i.test(clean)) return 'Mid';
  return 'Mid';
}

/**
 * Helper to extract integer skill from values like "3/5" or "3".
 */
function parseSkill(skillStr) {
  if (!skillStr) return 3;
  const num = parseInt(String(skillStr).split('/')[0].trim(), 10);
  if (isNaN(num) || num < 1) return 3;
  if (num > 5) return 5;
  return num;
}

/**
 * Helper to map CSV duty status to DB constraint.
 */
function normalizeDutyStatus(status) {
  if (!status) return 'completed';
  const lower = status.trim().toLowerCase();
  if (lower === 'absent') return 'absent';
  if (lower === 'scheduled') return 'scheduled';
  return 'completed';
}

/**
 * Helper to map CSV facility outcome to DB constraint.
 */
function normalizeFacilityOutcome(outcome) {
  if (!outcome) return 'overtime_stay';
  const clean = outcome.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (clean.includes('before_7') || clean.includes('7pm')) return 'before_7pm';
  if (clean.includes('no_pickup')) return 'no_pickup';
  if (clean.includes('holiday')) return 'holiday';
  if (clean.includes('sunday')) return 'emergency_sunday';
  return 'overtime_stay';
}

export async function importCSV(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`CSV file not found at: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const allRows = parseCSV(raw);

  let dataRows = [];
  let distinctEmployees = new Map(); // key -> { name, experience, skill, warehouseName }
  let dayGroups = new Map();

  // 1. Detect if this is an Attendance Grid / Matrix sheet (dates in column 0, names in header columns)
  const matrixNameRowIdx = allRows.findIndex((row) => {
    const first = (row[0] || '').toLowerCase().trim();
    if (first === 'name') return true;
    return row.slice(0, 3).some((c) => (c || '').toLowerCase().trim() === 'name');
  });

  if (matrixNameRowIdx !== -1) {
    console.log(`Detected Attendance Matrix Grid format (header at row ${matrixNameRowIdx + 1}).`);
    const nameRow = allRows[matrixNameRowIdx];
    const tagRow = matrixNameRowIdx > 0 ? allRows[matrixNameRowIdx - 1] : [];
    const colToEmp = new Map();

    for (let c = 2; c < nameRow.length; c++) {
      const rawTag = (tagRow[c] || '').toLowerCase().trim();
      if (rawTag === 'backup') {
        continue;
      }
      const rawName = nameRow[c];
      if (!rawName) continue;
      const cleanName = toTitleCase(rawName);
      const key = cleanName.toLowerCase();

      if (!distinctEmployees.has(key)) {
        distinctEmployees.set(key, {
          name: cleanName,
          experience: 'Mid',
          skill: 3,
          warehouseName: 'Main Warehouse',
        });
      }
      colToEmp.set(c, distinctEmployees.get(key).name);
    }

    console.log(`Found ${distinctEmployees.size} unique employee columns in matrix.`);

    for (let i = matrixNameRowIdx + 1; i < allRows.length; i++) {
      const cells = allRows[i];
      const isoDate = parseDateToISO(cells[0]);
      if (!isoDate) continue;

      let shiftsOnDate = 0;
      for (let c = 2; c < cells.length; c++) {
        const val = cells[c];
        if (val === '1' || Number(val) > 0) {
          const empName = colToEmp.get(c);
          if (empName) {
            dataRows.push({
              dutyDate: isoDate,
              warehouseName: 'Main Warehouse',
              employeeName: empName,
              experience: 'Mid',
              skill: 3,
              dutyStatus: 'completed',
              facilityOutcome: 'overtime_stay',
              notes: 'Historical overtime record backfilled',
            });
            shiftsOnDate++;
          }
        }
      }

      if (shiftsOnDate > 0) {
        dayGroups.set(`Main Warehouse_${isoDate}`, {
          warehouseName: 'Main Warehouse',
          dutyDate: isoDate,
          status: 'overtime_stay',
          notes: 'Historical overtime record backfilled',
        });
      }
    }
  } else {
    // 2. Standard List / Table format
    console.log('Detected Standard List Report format.');
    let headerIndex = -1;
    for (let i = 0; i < allRows.length; i++) {
      const rowStr = allRows[i].map((c) => c.toLowerCase()).join(' ');
      if (rowStr.includes('duty date') || (rowStr.includes('date') && rowStr.includes('employee'))) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      throw new Error('Could not recognize CSV format (neither Attendance Matrix nor Standard List).');
    }

    const headers = allRows[headerIndex].map((h) => h.toLowerCase().trim());
    const dateColIdx = headers.findIndex((h) => h.includes('date'));
    const whColIdx = headers.findIndex((h) => h.includes('warehouse'));
    const empColIdx = headers.findIndex((h) => h.includes('employee'));
    const expColIdx = headers.findIndex((h) => h.includes('experience'));
    const skillColIdx = headers.findIndex((h) => h.includes('skill'));
    const statusColIdx = headers.findIndex((h) => h.includes('status') && !h.includes('outcome'));
    const outcomeColIdx = headers.findIndex((h) => h.includes('outcome'));
    const notesColIdx = headers.findIndex((h) => h.includes('note'));

    for (let i = headerIndex + 1; i < allRows.length; i++) {
      const row = allRows[i];
      const isoDate = parseDateToISO(row[dateColIdx]);
      if (isoDate) {
        const empName = row[empColIdx] || '';
        if (!empName) continue;
        const cleanEmpName = toTitleCase(empName);
        const whName = row[whColIdx] || 'Main Warehouse';
        const exp = normalizeExperience(row[expColIdx]);
        const skill = parseSkill(row[skillColIdx]);
        const status = normalizeDutyStatus(row[statusColIdx]);
        const outcome = normalizeFacilityOutcome(row[outcomeColIdx]);
        const notes = (row[notesColIdx] || '').trim() || null;

        dataRows.push({
          dutyDate: isoDate,
          warehouseName: whName,
          employeeName: cleanEmpName,
          experience: exp,
          skill: skill,
          dutyStatus: status,
          facilityOutcome: outcome,
          notes: notes,
        });

        const key = cleanEmpName.toLowerCase();
        if (!distinctEmployees.has(key)) {
          distinctEmployees.set(key, {
            name: cleanEmpName,
            experience: exp,
            skill: skill,
            warehouseName: whName,
          });
        }

        const dayKey = `${whName}_${isoDate}`;
        if (!dayGroups.has(dayKey)) {
          dayGroups.set(dayKey, {
            warehouseName: whName,
            dutyDate: isoDate,
            status: outcome,
            notes: notes,
          });
        }
      }
    }
  }

  console.log(`Parsed ${dataRows.length} duty assignments for ${distinctEmployees.size} employees across ${dayGroups.size} shift dates.`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete full employee and assignment database
    console.log('Resetting employees, assignments, absences, runs, requirements, and daily logs...');
    await client.query('DELETE FROM assignment_runs');
    await client.query('DELETE FROM assignments');
    await client.query('DELETE FROM absences');
    await client.query('DELETE FROM daily_requirements');
    await client.query('DELETE FROM daily_logs');
    await client.query('DELETE FROM employees');

    // Reset sequences
    await client.query('ALTER TABLE employees ALTER COLUMN id RESTART WITH 1');
    await client.query('ALTER TABLE assignments ALTER COLUMN id RESTART WITH 1');
    await client.query('ALTER TABLE daily_logs ALTER COLUMN id RESTART WITH 1');

    // 2. Ensure warehouses exist
    const uniqueWarehouses = [
      'Main Warehouse',
      ...new Set([...dataRows.map((r) => r.warehouseName), ...dayGroups.values().map((d) => d.warehouseName)]),
    ];
    for (const wh of uniqueWarehouses) {
      await client.query(
        'INSERT INTO warehouses (name, active) VALUES ($1, true) ON CONFLICT (name) DO NOTHING',
        [wh]
      );
    }

    const { rows: dbWarehouses } = await client.query('SELECT id, name FROM warehouses');
    const whMap = new Map(dbWarehouses.map((w) => [w.name, w.id]));
    const fallbackWhId = whMap.get('Main Warehouse') || dbWarehouses[0]?.id || '1';

    // 3. Insert unique employees dynamically
    const empIdMap = new Map();
    console.log(`Creating ${distinctEmployees.size} employees in database...`);
    for (const emp of distinctEmployees.values()) {
      const whId = whMap.get(emp.warehouseName) || fallbackWhId;
      const res = await client.query(
        `INSERT INTO employees (warehouse_id, name, experience, skill, initial_completed_count, can_hold_key, active, archived)
         VALUES ($1, $2, $3, $4, 0, false, true, false)
         RETURNING id, name, experience, skill`,
        [whId, emp.name, emp.experience, emp.skill]
      );
      const created = res.rows[0];
      empIdMap.set(created.name.toLowerCase(), created.id);
      console.log(`  ✓ #${created.id}: ${created.name} (${created.experience}, Skill: ${created.skill}/5)`);
    }

    // 4. Insert Assignments
    console.log(`Inserting ${dataRows.length} assignments...`);
    let assignedCount = 0;
    for (const r of dataRows) {
      const empId = empIdMap.get(r.employeeName.toLowerCase());
      const whId = whMap.get(r.warehouseName) || fallbackWhId;
      if (!empId) continue;

      await client.query(
        `INSERT INTO assignments (employee_id, warehouse_id, duty_date, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (employee_id, duty_date)
         DO UPDATE SET warehouse_id = $2, status = $4, updated_at = NOW()`,
        [empId, whId, r.dutyDate, r.dutyStatus]
      );
      assignedCount++;
    }

    // 5. Insert Daily Logs
    console.log(`Inserting ${dayGroups.size} daily log outcomes...`);
    for (const log of dayGroups.values()) {
      const whId = whMap.get(log.warehouseName) || fallbackWhId;
      await client.query(
        `INSERT INTO daily_logs (warehouse_id, duty_date, status, notes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (warehouse_id, duty_date)
         DO UPDATE SET status = $3, notes = COALESCE(EXCLUDED.notes, daily_logs.notes)`,
        [whId, log.dutyDate, log.status, log.notes]
      );
    }

    await client.query('COMMIT');
    console.log('\n=============================================');
    console.log(' DATABASE REBUILT & SEEDED FROM GOOGLE SHEET!');
    console.log(` Total Employees Created: ${distinctEmployees.size}`);
    console.log(` Total Assignments Imported: ${assignedCount}`);
    console.log(` Total Shift Dates Logged: ${dayGroups.size}`);
    console.log('=============================================\n');

    return {
      employeesCount: distinctEmployees.size,
      assignmentsCount: assignedCount,
      dailyLogsCount: dayGroups.size,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('import-csv.js')) {
  const targetFile = process.argv[2] || './server/data/google_sheet.csv';
  importCSV(targetFile)
    .then(() => pool.end())
    .catch((err) => {
      console.error('Import script failed:', err);
      process.exit(1);
    });
}
