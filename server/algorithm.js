/**
 * Pure selection algorithm for after-hours overtime pickup duty.
 *
 * Rules:
 * 1. Avoid assigning two high-rank/smart employees together. Prefer pairing one skilled with one junior when possible.
 * 2. Do not assign the same person again if they have already done a pickup, unless all other present employees have had their turn.
 * 3. If an employee is absent during their scheduled pickup, they get priority for the next day they are present.
 */

export function classifyEmployee(emp) {
  const isHighSkill = Number(emp.skill) >= 4 || emp.experience === 'Senior';
  const isJunior = Number(emp.skill) <= 2 || emp.experience === 'Junior';
  const isMid = !isHighSkill && !isJunior;
  return { isHighSkill, isJunior, isMid };
}

export function computeEmployeeMetrics(emp, pastAssignments = [], targetDutyDate = null) {
  // Filter assignments strictly prior to targetDutyDate if provided
  const relevantAssignments = pastAssignments.filter((a) => {
    if (String(a.employee_id) !== String(emp.id)) return false;
    if (targetDutyDate && a.duty_date >= targetDutyDate) return false;
    return true;
  });

  // Sort chronologically ascending
  relevantAssignments.sort((a, b) => (a.duty_date < b.duty_date ? -1 : 1));

  let completedCount = 0;
  let lastCompletedDate = null;
  let lastAbsentDate = null;

  for (const a of relevantAssignments) {
    if (a.status === 'completed') {
      completedCount += 1;
      if (!lastCompletedDate || a.duty_date > lastCompletedDate) {
        lastCompletedDate = a.duty_date;
      }
    } else if (a.status === 'absent') {
      if (!lastAbsentDate || a.duty_date > lastAbsentDate) {
        lastAbsentDate = a.duty_date;
      }
    }
  }

  // Missed duty priority is active if the employee was absent and hasn't completed any duty since
  const hasMissedPriority =
    Boolean(lastAbsentDate) &&
    (!lastCompletedDate || lastCompletedDate < lastAbsentDate);

  const { isHighSkill, isJunior, isMid } = classifyEmployee(emp);

  let selectionReason = `Fair turn cohort (${completedCount} prior stays)`;
  if (hasMissedPriority) {
    selectionReason = `Missed-duty priority (absent on ${lastAbsentDate}, catch-up queued)`;
  } else if (!lastCompletedDate) {
    selectionReason = `Never stayed overtime (first turn in rotation)`;
  } else if (targetDutyDate) {
    const diffMs = new Date(targetDutyDate).getTime() - new Date(lastCompletedDate).getTime();
    const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    selectionReason = `${completedCount} stays · Waited ${days} days since last stay (${lastCompletedDate})`;
  }

  return {
    ...emp,
    completedCount,
    lastCompletedDate,
    lastAbsentDate,
    hasMissedPriority,
    isHighSkill,
    isJunior,
    isMid,
    selectionReason,
  };
}

/**
 * Generates all combinations of size k from an array.
 */
function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0 || k > arr.length) return [];
  if (k === arr.length) return [arr.slice()];

  const head = arr[0];
  const tail = arr.slice(1);

  const withHead = getCombinations(tail, k - 1).map((comb) => [head, ...comb]);
  const withoutHead = getCombinations(tail, k);

  return withHead.concat(withoutHead);
}

/**
 * Scores a potential assignment set for Rule 1 (Pairing), Rule 3 (Missed Priority),
 * and recency tie-breaking.
 */
function scoreCandidateSet(selectedSet, candidateSlice, targetDate) {
  let score = 0;

  const highSkillCount = selectedSet.filter((e) => e.isHighSkill).length;
  const juniorCount = selectedSet.filter((e) => e.isJunior).length;
  const midCount = selectedSet.filter((e) => e.isMid).length;

  // Rule 3: Prioritize employees who missed past scheduled pickup
  for (const e of selectedSet) {
    if (e.hasMissedPriority) {
      score += 10000;
    }
  }

  // Rule 1: Avoid assigning two high-rank/smart employees together
  if (highSkillCount > 1) {
    score -= 3000 * (highSkillCount - 1);
  }

  // Rule 1: Prefer pairing one skilled with one junior when possible
  if (highSkillCount >= 1 && juniorCount >= 1) {
    score += 800;
  } else if (highSkillCount >= 1 && midCount >= 1) {
    score += 400;
  } else if (highSkillCount === 0 && midCount >= 1) {
    score += 200;
  } else if (highSkillCount === 0 && midCount === 0 && juniorCount > 1) {
    // Only juniors, no experienced anchor
    score -= 300;
  }

  // Fairness recency: prefer workers who haven't served in the longest time
  for (const e of selectedSet) {
    if (!e.lastCompletedDate) {
      score += 50; // Never served, give slight preference
    } else {
      // Days since last completed duty
      const diffMs =
        new Date(targetDate).getTime() - new Date(e.lastCompletedDate).getTime();
      const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      score += Math.min(days, 30);
    }
    // Deterministic tie-breaker using employee id
    score -= Number(e.id) * 0.0001;
  }

  return score;
}

/**
 * Selects overtime pickup crew for a specific warehouse and date.
 *
 * @param {Object} options
 * @param {string} options.dutyDate - Target date 'YYYY-MM-DD'
 * @param {number|string} options.warehouseId - Warehouse ID
 * @param {Array} options.employees - Candidate employees present & active at this warehouse
 * @param {Array} options.pastAssignments - History of assignments
 * @param {number} options.requiredCount - Number of workers needed (default: 1)
 * @returns {{ selected: Array, warnings: Array<string> }}
 */
export function selectOvertimeCrew({
  dutyDate,
  warehouseId,
  employees = [],
  pastAssignments = [],
  requiredCount = 1,
}) {
  const warnings = [];

  // 1. Filter eligible candidates: active, not archived, matching warehouse
  const eligible = employees.filter(
    (e) =>
      !e.archived &&
      e.active !== false &&
      (!warehouseId || e.warehouse_id == null || String(e.warehouse_id) === String(warehouseId))
  );

  if (eligible.length === 0) {
    warnings.push(`No active employees available for warehouse on ${dutyDate}.`);
    return { selected: [], warnings };
  }

  // 2. Compute metrics for each candidate
  const enriched = eligible.map((emp) =>
    computeEmployeeMetrics(emp, pastAssignments, dutyDate)
  );

  // If total available is less than or equal to required, select all and report warnings
  if (enriched.length <= requiredCount) {
    if (enriched.length < requiredCount) {
      warnings.push(
        `Insufficient workers: needed ${requiredCount}, but only ${enriched.length} available.`
      );
    }
    const highSkillCount = enriched.filter((e) => e.isHighSkill).length;
    if (highSkillCount > 1) {
      warnings.push(
        `Assigned ${highSkillCount} high-skill workers together due to small candidate pool.`
      );
    }
    return { selected: enriched, warnings };
  }

  // 3. Group candidates by completedCount to strictly enforce Rule 2 (Fairness Cohorts)
  const cohortsMap = new Map();
  for (const emp of enriched) {
    const count = emp.completedCount;
    if (!cohortsMap.has(count)) {
      cohortsMap.set(count, []);
    }
    cohortsMap.get(count).push(emp);
  }

  const sortedCohortCounts = Array.from(cohortsMap.keys()).sort((a, b) => a - b);

  let selected = [];
  let remainingNeeded = requiredCount;

  for (const count of sortedCohortCounts) {
    const cohort = cohortsMap.get(count);

    if (cohort.length <= remainingNeeded) {
      // Entire cohort must be selected to satisfy Rule 2
      selected = selected.concat(cohort);
      remainingNeeded -= cohort.length;
      if (remainingNeeded === 0) break;
    } else {
      // Cutoff cohort: choose the best combination of size remainingNeeded
      const combinations = getCombinations(cohort, remainingNeeded);

      let bestCombination = combinations[0];
      let bestScore = -Infinity;

      for (const comb of combinations) {
        const fullCandidateSet = selected.concat(comb);
        const score = scoreCandidateSet(fullCandidateSet, comb, dutyDate);
        if (score > bestScore) {
          bestScore = score;
          bestCombination = comb;
        }
      }

      selected = selected.concat(bestCombination);
      remainingNeeded = 0;
      break;
    }
  }

  // Final sanity checks & warnings
  const selectedHighSkill = selected.filter((e) => e.isHighSkill).length;
  if (selectedHighSkill > 1) {
    warnings.push(
      `Pairing includes ${selectedHighSkill} high-skill workers because junior/mid candidates were limited in the fairness cohort.`
    );
  }

  return { selected, warnings };
}
