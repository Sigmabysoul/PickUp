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
