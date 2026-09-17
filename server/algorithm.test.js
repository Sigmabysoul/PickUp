import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyEmployee,
  computeEmployeeMetrics,
  selectOvertimeCrew,
} from './algorithm.js';

test('Rule 1: Avoid pairing two high-skill employees together; prefer senior + junior', () => {
  const employees = [
    { id: 1, name: 'Alice', experience: 'Senior', skill: 5, warehouse_id: 10 },
    { id: 2, name: 'Bob', experience: 'Senior', skill: 5, warehouse_id: 10 },
    { id: 3, name: 'Charlie', experience: 'Junior', skill: 1, warehouse_id: 10 },
    { id: 4, name: 'Diana', experience: 'Junior', skill: 2, warehouse_id: 10 },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-20',
    warehouseId: 10,
    employees,
    pastAssignments: [],
    requiredCount: 2,
  });

  assert.equal(result.selected.length, 2);
  const highSkill = result.selected.filter((e) => e.isHighSkill);
  const junior = result.selected.filter((e) => e.isJunior);

  // Exactly one high skill and one junior
  assert.equal(highSkill.length, 1, 'Should select exactly one high-skill worker');
  assert.equal(junior.length, 1, 'Should select exactly one junior worker');
  assert.ok(
    !result.selected.some((e) => e.id === 1) || !result.selected.some((e) => e.id === 2),
    'Alice and Bob must not be paired together'
  );
});

test('Rule 2: Fair round-robin rotation ensures all present employees get a turn before repeats', () => {
  const employees = [
    { id: 1, name: 'Alice', experience: 'Senior', skill: 4, warehouse_id: 1 },
    { id: 2, name: 'Bob', experience: 'Mid', skill: 3, warehouse_id: 1 },
    { id: 3, name: 'Charlie', experience: 'Junior', skill: 2, warehouse_id: 1 },
    { id: 4, name: 'Diana', experience: 'Junior', skill: 1, warehouse_id: 1 },
  ];

  // Alice and Bob already completed 1 pickup each
  const pastAssignments = [
    { employee_id: 1, duty_date: '2026-09-10', status: 'completed' },
    { employee_id: 2, duty_date: '2026-09-10', status: 'completed' },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-11',
    warehouseId: 1,
    employees,
    pastAssignments,
    requiredCount: 2,
  });

  const selectedIds = result.selected.map((e) => e.id).sort();
  assert.deepEqual(
    selectedIds,
    [3, 4],
    'Charlie and Diana (0 turns) must be selected before Alice and Bob (1 turn)'
  );
});

test('Rule 3: Absent employee during scheduled pickup gets immediate priority next present day', () => {
  const employees = [
    { id: 1, name: 'Alice', experience: 'Mid', skill: 3, warehouse_id: 1 },
    { id: 2, name: 'Bob', experience: 'Junior', skill: 2, warehouse_id: 1 },
    { id: 3, name: 'Charlie', experience: 'Junior', skill: 2, warehouse_id: 1 },
  ];

  // Alice was scheduled on Sep 10 and marked absent. None of them have completed any duty yet.
  const pastAssignments = [
    { employee_id: 1, duty_date: '2026-09-10', status: 'absent' },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-11',
    warehouseId: 1,
    employees,
    pastAssignments,
    requiredCount: 2,
  });

  const selectedIds = result.selected.map((e) => e.id);
  assert.ok(
    selectedIds.includes(1),
    'Alice must be selected first because she was absent during her scheduled pickup'
  );
});

test('Missed priority is cleared once the employee completes a pickup', () => {
  const emp = { id: 1, name: 'Alice', experience: 'Senior', skill: 5 };
  const history = [
    { employee_id: 1, duty_date: '2026-09-01', status: 'absent' },
    { employee_id: 1, duty_date: '2026-09-05', status: 'completed' },
  ];

  const metrics = computeEmployeeMetrics(emp, history, '2026-09-10');
  assert.equal(metrics.hasMissedPriority, false);
  assert.equal(metrics.completedCount, 1);
});

test('Edge Case: Insufficient workers generates warning', () => {
  const employees = [
    { id: 1, name: 'Solo Worker', experience: 'Mid', skill: 3, warehouse_id: 1 },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-15',
    warehouseId: 1,
    employees,
    pastAssignments: [],
    requiredCount: 3,
  });

  assert.equal(result.selected.length, 1);
  assert.ok(
    result.warnings.some((w) => w.includes('Insufficient workers')),
    'Should contain insufficient workers warning'
  );
});

test('Edge Case: Only high-skill workers available generates warning and selects them', () => {
  const employees = [
    { id: 1, name: 'Senior A', experience: 'Senior', skill: 5, warehouse_id: 1 },
    { id: 2, name: 'Senior B', experience: 'Senior', skill: 4, warehouse_id: 1 },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-15',
    warehouseId: 1,
    employees,
    pastAssignments: [],
    requiredCount: 2,
  });

  assert.equal(result.selected.length, 2);
  assert.ok(
    result.warnings.some((w) => w.includes('high-skill')),
    'Should alert that pairing has multiple high-skill workers due to limited pool'
  );
});

test('Super Senior Rule: Super Seniors are completely excluded from automatic algorithm rotation', () => {
  const employees = [
    { id: 10, name: 'Chief Boss', experience: 'Super Senior', skill: 5, warehouse_id: 1 },
    { id: 11, name: 'Normal Senior', experience: 'Senior', skill: 4, warehouse_id: 1 },
    { id: 12, name: 'Normal Mid', experience: 'Mid', skill: 3, warehouse_id: 1 },
    { id: 13, name: 'Normal Junior', experience: 'Junior', skill: 1, warehouse_id: 1 },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-20',
    warehouseId: 1,
    employees,
    pastAssignments: [],
    requiredCount: 2,
  });

  assert.equal(result.selected.length, 2);
  const hasSuperSenior = result.selected.some((e) => e.id === 10 || e.experience === 'Super Senior');
  assert.equal(hasSuperSenior, false, 'Super Senior must never be chosen by automatic overtime algorithm');
});

test('Anti-Consecutive Rest Rule: Worker who worked yesterday is rested if other candidates are available', () => {
  const employees = [
    { id: 1, name: 'Worker A (Worked Yesterday)', experience: 'Mid', skill: 3, warehouse_id: 1 },
    { id: 2, name: 'Worker B', experience: 'Senior', skill: 4, warehouse_id: 1 },
    { id: 3, name: 'Worker C', experience: 'Junior', skill: 2, warehouse_id: 1 },
    { id: 4, name: 'Worker D', experience: 'Junior', skill: 1, warehouse_id: 1 },
  ];

  // Worker A worked yesterday (2026-09-14)
  const pastAssignments = [
    { employee_id: 1, duty_date: '2026-09-14', status: 'completed' },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-15',
    warehouseId: 1,
    employees,
    pastAssignments,
    requiredCount: 2,
  });

  assert.equal(result.selected.length, 2);
  assert.ok(
    !result.selected.some((e) => e.id === 1),
    'Worker A worked yesterday and must be given rest today'
  );
});

test('Fairness Pacing: Worker who did a pickup recently is not scheduled back-to-back', () => {
  const employees = [
    { id: 1, name: 'Veteran 1', experience: 'Senior', skill: 4, warehouse_id: 1 },
    { id: 2, name: 'Veteran 2', experience: 'Junior', skill: 2, warehouse_id: 1 },
    { id: 3, name: 'New Hire', experience: 'Junior', skill: 1, warehouse_id: 1 },
    { id: 4, name: 'Extra Worker', experience: 'Mid', skill: 3, warehouse_id: 1 },
  ];

  // Veterans completed 5 duties each; New Hire & Extra Worker join with 0 actual completions
  const pastAssignments = [
    { employee_id: 1, duty_date: '2026-09-01', status: 'completed' },
    { employee_id: 1, duty_date: '2026-09-04', status: 'completed' },
    { employee_id: 1, duty_date: '2026-09-07', status: 'completed' },
    { employee_id: 1, duty_date: '2026-09-10', status: 'completed' },
    { employee_id: 1, duty_date: '2026-09-13', status: 'completed' },
    { employee_id: 2, duty_date: '2026-09-02', status: 'completed' },
    { employee_id: 2, duty_date: '2026-09-05', status: 'completed' },
    { employee_id: 2, duty_date: '2026-09-08', status: 'completed' },
    { employee_id: 2, duty_date: '2026-09-11', status: 'completed' },
    { employee_id: 2, duty_date: '2026-09-14', status: 'completed' },
    // Extra Worker has a recent pickup but not yesterday relative to Sep 15
    { employee_id: 4, duty_date: '2026-09-12', status: 'completed' },
  ];

  // Day 1: 2026-09-15 -> Veteran 2 worked yesterday (14th), New Hire & Extra Worker have low stay counts
  const day1 = selectOvertimeCrew({
    dutyDate: '2026-09-15',
    warehouseId: 1,
    employees,
    pastAssignments,
    requiredCount: 2,
  });
  assert.ok(day1.selected.some((e) => e.id === 3), 'New Hire (0 actual stays) is selected for their first shift');

  // Day 2: 2026-09-16 -> New Hire AND Veteran 1 worked yesterday (Sep 15).
  // Extra Worker (last worked Sep 12) and Veteran 2 (last worked Sep 14) are rested → 2 rested available
  // Anti-consecutive filter: nonResting = [Vet2, Extra Worker] → exactly 2 → New Hire must be excluded
  const updatedAssignments = [
    ...pastAssignments,
    { employee_id: 1, duty_date: '2026-09-15', status: 'completed' },
    { employee_id: 3, duty_date: '2026-09-15', status: 'completed' },
  ];

  const day2 = selectOvertimeCrew({
    dutyDate: '2026-09-16',
    warehouseId: 1,
    employees,
    pastAssignments: updatedAssignments,
    requiredCount: 2,
  });

  assert.ok(
    !day2.selected.some((e) => e.id === 3),
    'New Hire must NOT be scheduled daily back-to-back when rested workers are available'
  );
});

test('New Employee Fairness: New hire (0 actual pickups) is chosen before veteran even if veteran has high initial_completed_count baseline', () => {
  // Scenario: A veteran employee joins with initial_completed_count:6 from a paper record
  // but has 0 actual pickups recorded in this system.
  // A newer employee has 3 actual pickups.
  // The employee with 0 actual pickups should be chosen first (lower cohort).
  const employees = [
    { id: 1, name: 'Actual Veteran', experience: 'Senior', skill: 4, warehouse_id: 1, initial_completed_count: 6 },
    { id: 2, name: 'Active Employee', experience: 'Mid', skill: 3, warehouse_id: 1, initial_completed_count: 0 },
    { id: 3, name: 'New Hire', experience: 'Junior', skill: 2, warehouse_id: 1, initial_completed_count: 0 },
  ];

  const pastAssignments = [
    // Active Employee has 3 real pickups recorded
    { employee_id: 2, duty_date: '2026-09-01', status: 'completed' },
    { employee_id: 2, duty_date: '2026-09-05', status: 'completed' },
    { employee_id: 2, duty_date: '2026-09-10', status: 'completed' },
    // Actual Veteran has 0 pickups in the system (initial_completed_count is just a baseline, not real history)
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-20',
    warehouseId: 1,
    employees,
    pastAssignments,
    requiredCount: 2,
  });

  assert.equal(result.selected.length, 2);

  // Actual Veteran (0 actual picks, cohort 0) and New Hire (0 actual picks, cohort 0)
  // must be chosen over Active Employee (3 actual picks, cohort 3)
  assert.ok(
    result.selected.some((e) => e.id === 1),
    'Actual Veteran with 0 real pickups must be in cohort 0 and selected'
  );
  assert.ok(
    result.selected.some((e) => e.id === 3),
    'New Hire with 0 real pickups must be selected before someone with 3 actual stays'
  );
  assert.ok(
    !result.selected.some((e) => e.id === 2),
    'Active Employee with 3 real pickups must NOT be chosen when others have 0 actual stays'
  );
});


test('Key Holder Rule: Algorithm always pairs at least 1 key holder when available', () => {
  const employees = [
    { id: 1, name: 'NonKey 1', experience: 'Junior', skill: 2, can_hold_key: false },
    { id: 2, name: 'NonKey 2', experience: 'Mid', skill: 3, can_hold_key: false },
    { id: 3, name: 'Key Holder 1', experience: 'Senior', skill: 4, can_hold_key: true },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-16',
    warehouseId: null,
    employees,
    pastAssignments: [],
    requiredCount: 2,
  });

  assert.equal(result.selected.length, 2);
  const keyHolderCount = result.selected.filter((e) => e.can_hold_key).length;
  assert.ok(keyHolderCount >= 1, 'At least 1 selected employee must be a key holder');
  assert.equal(result.noKeyHolderAvailable, false);
});

test('Key Holder Rule: Emits senior risk warning when all key holders are unavailable', () => {
  const employees = [
    { id: 1, name: 'NonKey 1', experience: 'Junior', skill: 2, can_hold_key: false },
    { id: 2, name: 'NonKey 2', experience: 'Mid', skill: 3, can_hold_key: false },
  ];

  const result = selectOvertimeCrew({
    dutyDate: '2026-09-16',
    warehouseId: null,
    employees,
    pastAssignments: [],
    requiredCount: 2,
  });

  assert.equal(result.selected.length, 2);
  assert.equal(result.noKeyHolderAvailable, true);
  assert.ok(
    result.warnings.some((w) => w.includes('No Key Holder Available')),
    'Must warn senior that no key holder is available'
  );
});

