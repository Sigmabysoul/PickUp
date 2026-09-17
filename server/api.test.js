import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { pool } from './db.js';
import app from './index.js';

let server;
let baseUrl;
let testEmployees = [];
let testWarehouses = [];
let authToken = '';

test('API Server Lifecycle & Endpoints', async (t) => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // Ensure standard test warehouses exist without altering existing data
  await pool.query(`
    INSERT INTO warehouses (name, active)
    VALUES ('Old Warehouse', true), ('New Warehouse', true)
    ON CONFLICT (name) DO NOTHING;
  `);

  // Query test warehouses
  const wRes = await pool.query("SELECT * FROM warehouses WHERE name IN ('Old Warehouse', 'New Warehouse') ORDER BY id ASC");
  testWarehouses = wRes.rows;

  // Insert isolated hermetic test fixture employees
  const empRes = await pool.query(`
    INSERT INTO employees (name, experience, skill, warehouse_id, active)
    VALUES
      ('__Test_Alice__', 'Senior', 5, $1, true),
      ('__Test_Bob__', 'Junior', 1, $1, true),
      ('__Test_Charlie__', 'Mid', 4, $2, true),
      ('__Test_Diana__', 'Junior', 2, $2, true),
      ('__Test_SuperSenior__', 'Super Senior', 5, $1, true)
    RETURNING id, name, warehouse_id, experience;
  `, [testWarehouses[0].id, testWarehouses[1].id]);
  testEmployees = empRes.rows;

  t.after(async () => {
    // Only clean up the isolated test fixtures created by this test run!
    // NEVER delete user or production data!
    try {
      await pool.query("DELETE FROM app_users WHERE username LIKE '__test_%'");
      await pool.query("DELETE FROM absences WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE '__Test_%')");
      await pool.query("UPDATE assignments SET replaces_assignment_id = NULL WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE '__Test_%')");
      await pool.query("DELETE FROM assignments WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE '__Test_%')");
      await pool.query("DELETE FROM employees WHERE name LIKE '__Test_%'");
      await pool.query("DELETE FROM assignment_runs WHERE duty_date IN ('2026-09-25', '2026-09-28', '2026-09-29')");
      await pool.query("DELETE FROM assignments WHERE duty_date IN ('2026-09-25', '2026-09-28', '2026-09-01', '2026-09-27', '2026-09-29')");
      await pool.query("DELETE FROM daily_logs WHERE duty_date IN ('2026-09-25', '2026-09-28', '2026-09-01', '2026-09-27', '2026-09-29')");
      await pool.query("DELETE FROM absences WHERE starts_on = '2026-09-28'");
    } catch (e) {
      console.error('Test cleanup error:', e);
    }
    server.close();
    await pool.end();
  });

  await t.test('Unauthenticated GET /api/bootstrap returns 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.includes('Unauthorized'));
  });

  await t.test('POST /api/auth/login rejects wrong passcode with 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'wrongpassword' }),
    });
    assert.equal(res.status, 401);
  });

  await t.test('POST /api/auth/login authenticates administrator with 1877472806 and provides session token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: '1877472806' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token);
    assert.ok(data.user);
    assert.equal(data.user.role, 'admin');
    authToken = data.token;
  });

  const apiFetch = (url, opts = {}) =>
    fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        Authorization: `Bearer ${authToken}`,
      },
    });

  await t.test('GET /api/auth/verify confirms valid session token', async () => {
    const res = await apiFetch(`${baseUrl}/api/auth/verify`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.valid, true);
  });

  await t.test('GET /api/bootstrap returns warehouses, employees, assignments when authenticated', async () => {
    const res = await apiFetch(`${baseUrl}/api/bootstrap`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.warehouses));
    assert.ok(Array.isArray(data.employees));
    assert.ok(Array.isArray(data.assignments));
    assert.ok(data.warehouses.length > 0);
    assert.ok(data.employees.length >= testEmployees.length);
    assert.ok(testEmployees.every((te) => data.employees.some((e) => e.id === te.id)));
  });

  await t.test('POST /api/generate previews shift plan for tomorrow', async () => {
    const res = await apiFetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duty_date: '2026-09-25',
        dry_run: true,
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.duty_date, '2026-09-25');
    assert.ok(Array.isArray(data.results));
    assert.ok(data.results.length > 0);
    // Old Warehouse should have selected workers
    assert.ok(data.results[0].selected.length >= 1);
  });

  await t.test('POST /api/assignments/report-absence marks employee absent and selects replacement', async () => {
    // 0. Clean test date
    await pool.query("DELETE FROM absences WHERE starts_on = '2026-09-28'");
    await pool.query("DELETE FROM assignments WHERE duty_date = '2026-09-28'");
    await pool.query("DELETE FROM assignment_runs WHERE duty_date = '2026-09-28'");

    // 1. First generate an assignment for test date
    const genRes = await apiFetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duty_date: '2026-09-28',
        dry_run: false,
      }),
    });
    assert.equal(genRes.status, 200);

    // 2. Fetch assignments
    const bootRes = await apiFetch(`${baseUrl}/api/bootstrap`);
    const bootData = await bootRes.json();
    const testAssignment = bootData.assignments.find((a) => a.duty_date === '2026-09-28' && a.status === 'scheduled');
    assert.ok(testAssignment, 'Test assignment should exist');

    // 3. Report absence
    const absRes = await apiFetch(`${baseUrl}/api/assignments/report-absence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignment_id: testAssignment.id,
        reason: 'Called in sick / Fever',
      }),
    });
    assert.equal(absRes.status, 200);
    const absData = await absRes.json();
    assert.equal(absData.success, true);
    assert.ok(absData.replacement, 'Should automatically select replacement');
    assert.notEqual(absData.replacement.id, testAssignment.employee_id, 'Replacement must be a different employee');
  });

  await t.test('POST /api/assignments/confirm-today locks today crew and sets completed', async () => {
    const res = await apiFetch(`${baseUrl}/api/assignments/confirm-today`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date: '2026-09-28' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.confirmed_workers));
  });

  await t.test('POST /api/assignments/swap swaps warehouse locations between the two assigned workers', async () => {
    const res = await apiFetch(`${baseUrl}/api/assignments/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date: '2026-09-28' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  await t.test('POST /api/historical-pickup logs pre-app overtime duty and updates status', async () => {
    const res = await apiFetch(`${baseUrl}/api/historical-pickup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: testEmployees[0].id,
        warehouse_id: testWarehouses[0].id,
        duty_date: '2026-09-01',
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.assignment.status, 'completed');
    assert.equal(data.assignment.duty_date, '2026-09-01');

    // Verify daily_logs reflects overtime_stay
    const bootRes = await apiFetch(`${baseUrl}/api/bootstrap`);
    const bootData = await bootRes.json();
    const log = bootData.dailyLogs.find((l) => l.duty_date === '2026-09-01');
    assert.ok(log, 'Daily log should be created');
    assert.equal(log.status, 'overtime_stay');

    // Now test deletion
    const delRes = await apiFetch(`${baseUrl}/api/historical-pickup/${data.assignment.id}`, {
      method: 'DELETE',
    });
    assert.equal(delRes.status, 200);
    const delData = await delRes.json();
    assert.equal(delData.success, true);

    // Verify daily log was cleaned up since 0 completed pickups remain on 2026-09-01
    const postDelBoot = await (await apiFetch(`${baseUrl}/api/bootstrap`)).json();
    const postDelLog = postDelBoot.dailyLogs.find((l) => l.duty_date === '2026-09-01');
    assert.equal(postDelLog, undefined, 'Daily log should be removed after removing last record');
  });

  await t.test('POST /api/daily-status/emergency-sunday activates and deactivates emergency Sunday', async () => {
    // 1. Activate
    const actRes = await apiFetch(`${baseUrl}/api/daily-status/emergency-sunday`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date: '2026-09-27', enabled: true }),
    });
    assert.equal(actRes.status, 200);
    const actData = await actRes.json();
    assert.equal(actData.enabled, true);

    // Verify daily log exists
    let boot = await (await apiFetch(`${baseUrl}/api/bootstrap`)).json();
    let log = boot.dailyLogs.find((l) => l.duty_date === '2026-09-27');
    assert.ok(log);
    assert.ok(log.notes.includes('Emergency Sunday'));

    // 2. Deactivate
    const deactRes = await apiFetch(`${baseUrl}/api/daily-status/emergency-sunday`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date: '2026-09-27', enabled: false }),
    });
    assert.equal(deactRes.status, 200);

    // Verify cleaned up
    boot = await (await apiFetch(`${baseUrl}/api/bootstrap`)).json();
    log = boot.dailyLogs.find((l) => l.duty_date === '2026-09-27');
    assert.equal(log, undefined);
  });

  await t.test('GET /api/export returns CSV data with default previous month when authenticated', async () => {
    const exportRes = await apiFetch(`${baseUrl}/api/export?format=csv`);
    assert.equal(exportRes.status, 200);
    assert.ok(exportRes.headers.get('content-type').includes('text/csv'));
    const csvText = await exportRes.text();
    assert.ok(csvText.includes('Monthly Overtime Duty Report'));
    assert.ok(csvText.includes('Duty Date'));
  });

  // --------------------------------------------------------------------------
  // User & Password Management Tests (Admin Exclusive)
  // --------------------------------------------------------------------------
  let createdSeniorId = null;
  let seniorToken = null;

  await t.test('Admin can create a senior staff user via POST /api/users', async () => {
    const res = await apiFetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '__test_senior_user__',
        name: 'Test Senior Supervisor',
        passcode: 'seniorpass123',
        role: 'senior',
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.user);
    assert.equal(data.user.username, '__test_senior_user__');
    assert.equal(data.user.role, 'senior');
    assert.equal(data.user.passcode, 'seniorpass123');
    createdSeniorId = data.user.id;
  });

  await t.test('Created senior user can log in with their assigned passcode', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'seniorpass123' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.role, 'senior');
    assert.equal(data.user.name, 'Test Senior Supervisor');
    seniorToken = data.token;
  });

  await t.test('Non-admin senior user is rejected with 403 when accessing GET /api/users', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${seniorToken}` },
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('Only the administrator'));
  });

  await t.test('Admin can update senior user passcode via PUT /api/users/:id', async () => {
    const res = await apiFetch(`${baseUrl}/api/users/${createdSeniorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passcode: 'updatedpass456',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.passcode, 'updatedpass456');

    // Verify login with updated passcode
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'updatedpass456' }),
    });
    assert.equal(loginRes.status, 200);
  });

  await t.test('Admin can delete senior user via DELETE /api/users/:id', async () => {
    const res = await apiFetch(`${baseUrl}/api/users/${createdSeniorId}`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    // Verify user can no longer log in
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'updatedpass456' }),
    });
    assert.equal(loginRes.status, 401);
  });

  await t.test('POST /api/assignments/super-senior deploys Super Senior in "alone" mode', async () => {
    const superSenior = testEmployees.find((e) => e.experience === 'Super Senior');
    assert.ok(superSenior);

    const res = await apiFetch(`${baseUrl}/api/assignments/super-senior`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duty_date: '2026-09-29',
        warehouse_id: testWarehouses[0].id,
        super_senior_id: superSenior.id,
        crew_mode: 'alone',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.crew_mode, 'alone');
    assert.equal(data.assignments.length, 1);
    assert.equal(data.assignments[0].employee_id, superSenior.id);
  });

  await t.test('POST /api/assignments/super-senior deploys Super Senior in "with_1" mode', async () => {
    const superSenior = testEmployees.find((e) => e.experience === 'Super Senior');

    const res = await apiFetch(`${baseUrl}/api/assignments/super-senior`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duty_date: '2026-09-29',
        warehouse_id: testWarehouses[0].id,
        super_senior_id: superSenior.id,
        crew_mode: 'with_1',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.crew_mode, 'with_1');
    assert.equal(data.assignments.length, 2);
    assert.ok(data.assignments.some((a) => a.employee_id === superSenior.id));
  });

  await t.test('POST /api/assignments/super-senior deploys Super Senior in "with_2" mode', async () => {
    const superSenior = testEmployees.find((e) => e.experience === 'Super Senior');

    const res = await apiFetch(`${baseUrl}/api/assignments/super-senior`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duty_date: '2026-09-29',
        warehouse_id: testWarehouses[0].id,
        super_senior_id: superSenior.id,
        crew_mode: 'with_2',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.crew_mode, 'with_2');
    assert.equal(data.assignments.length, 3);
    assert.ok(data.assignments.some((a) => a.employee_id === superSenior.id));
  });

  await t.test('POST /api/assignments/super-senior removes Super Senior duty when crew_mode is "remove"', async () => {
    const res = await apiFetch(`${baseUrl}/api/assignments/super-senior`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duty_date: '2026-09-29',
        warehouse_id: testWarehouses[0].id,
        crew_mode: 'remove',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.crew_mode, 'remove');
    assert.equal(data.assignments.length, 2);
    const superSenior = testEmployees.find((e) => e.experience === 'Super Senior');
    assert.ok(!data.assignments.some((a) => a.employee_id === superSenior.id));
  });
});
