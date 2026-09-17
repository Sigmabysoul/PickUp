/**
 * Pure selection algorithm for after-hours overtime pickup duty.
 *
 * Rules:
 * 1. Avoid assigning two high-rank/smart employees together. Prefer pairing one skilled with one junior when possible.
 * 2. Do not assign the same person again if they have already done a pickup, unless all other present employees have had their turn.
 * 3. If an employee is absent during their scheduled pickup, they get priority for the next day they are present.
 * 4. Super Seniors are on-call for emergency big shipments and are never scheduled automatically.
 * 5. Anti-consecutive rest rule: A person who worked yesterday must rest today (cannot be assigned daily back-to-back).
 * 6. New hire / vacation baseline: New employees inherit the current team baseline to prevent unfair daily assignments.
 */

export function classifyEmployee(emp) {
  const isSuperSenior = emp.experience === 'Super Senior';
  const eligibleForNormalPickup = Boolean(emp.eligible_for_normal_pickup);
  // If Super Senior is eligible for normal pickup, treat them as high-skill in normal crew pairing
  const isHighSkill =
    (isSuperSenior && eligibleForNormalPickup) ||
    (!isSuperSenior && (Number(emp.skill) >= 4 || emp.experience === 'Senior'));
  const isJunior = !isSuperSenior && (Number(emp.skill) <= 2 || emp.experience === 'Junior');
  const isMid = !isSuperSenior && !isHighSkill && !isJunior;
  return { isSuperSenior, isHighSkill, isJunior, isMid, eligibleForNormalPickup };
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

  // Base count for new employees joining an active rotation
  const initialCompletedCount = Number(emp.initial_completed_count) || 0;
  const effectiveCompletedCount = initialCompletedCount + completedCount;

  // Missed duty priority is active if the employee was absent and hasn't completed any duty since
  const hasMissedPriority =
    Boolean(lastAbsentDate) &&
    (!lastCompletedDate || lastCompletedDate < lastAbsentDate);

  // Check if this worker stayed yesterday (anti-consecutive rule)
  let workedYesterday = false;
  let daysSinceLastCompleted = null;
  if (targetDutyDate && lastCompletedDate) {
    const targetTime = new Date(targetDutyDate).getTime();
    const lastTime = new Date(lastCompletedDate).getTime();
    daysSinceLastCompleted = Math.max(0, Math.round((targetTime - lastTime) / (1000 * 60 * 60 * 24)));
    if (daysSinceLastCompleted === 1) {
      workedYesterday = true;
    }
  }

  const { isSuperSenior, isHighSkill, isJunior, isMid, eligibleForNormalPickup } = classifyEmployee(emp);

  let selectionReason = `In rotation (${completedCount} actual stays)`;
  if (isSuperSenior && !eligibleForNormalPickup) {
    selectionReason = 'Super Senior (Emergency / Big Shipment only)';
  } else if (hasMissedPriority) {
    selectionReason = `Missed-duty priority (absent on ${lastAbsentDate}, catch-up queued)`;
  } else if (workedYesterday) {
    selectionReason = `Worked yesterday (${lastCompletedDate}) · Rest day priority`;
  } else if (completedCount === 0) {
    selectionReason = 'New to rotation — first pickup pending';
  } else if (daysSinceLastCompleted !== null) {
    selectionReason = `${completedCount} stays · Waited ${daysSinceLastCompleted} days since last stay (${lastCompletedDate})`;
  }

  const can_hold_key = Boolean(emp.can_hold_key);
  const eligible_for_normal_pickup = Boolean(emp.eligible_for_normal_pickup);

  return {
    ...emp,
    can_hold_key,
    eligible_for_normal_pickup,
    completedCount,
    initialCompletedCount,
    effectiveCompletedCount,
    lastCompletedDate,
    lastAbsentDate,
    hasMissedPriority,
    workedYesterday,
    daysSinceLastCompleted,
    isSuperSenior,
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
 * anti-consecutive rest, and recency tie-breaking.
 */
function scoreCandidateSet(selectedSet, candidateSlice, targetDate) {
  let score = 0;

  const highSkillCount = selectedSet.filter((e) => e.isHighSkill).length;
  const juniorCount = selectedSet.filter((e) => e.isJunior).length;
  const midCount = selectedSet.filter((e) => e.isMid).length;

  for (const e of selectedSet) {
    // Heavy penalty for consecutive days (worked yesterday)
    if (e.workedYesterday) {
      score -= 50000;
    }

    // Rule 3: Prioritize employees who missed past scheduled pickup (if not resting)
    if (e.hasMissedPriority && !e.workedYesterday) {
      score += 10000;
    }
  }

  // Rule 1: Avoid assigning two high-rank/smart employees together
  if (highSkillCount > 1) {
    score -= 3000 * (highSkillCount - 1);
  }

  // Key Holder Rule: At least 1 staying employee must have key submission authority for Head Office
  const hasKeyHolder = selectedSet.some((e) => e.can_hold_key);
  if (hasKeyHolder) {
    score += 1500;
  } else {
    // Heavily penalize pairing candidates where neither has key authority
    score -= 25000;
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

  // Fairness recency: strongly prefer workers who haven't served recently
  for (const e of selectedSet) {
    if (e.completedCount === 0) {
      score += 500; // Strong bonus: never done a pickup in this system
    } else if (!e.lastCompletedDate) {
      score += 20; // First turn in rotation
    } else {
      const days = e.daysSinceLastCompleted || 0;
      if (days <= 3) {
        score -= 500; // Stronger penalty: avoid anyone who worked within 3 days
      } else if (days <= 7) {
        score += Math.min(days * 3, 30);
      } else {
        score += Math.min(days, 60); // Reward longer waits more
      }
    }
    // Deterministic tie-breaker using employee id
    score -= Number(e.id) * 0.0001;
  }

  return score;
}

/**
 * Selects overtime pickup crew for a warehouse and date.
 *
 * @param {Object} options
 * @param {string} options.dutyDate - Target date 'YYYY-MM-DD'
 * @param {number|string} options.warehouseId - Warehouse ID
 * @param {Array} options.employees - Candidate employees present & active
 * @param {Array} options.pastAssignments - History of assignments
 * @param {number} options.requiredCount - Number of workers needed (default: 2)
 * @returns {{ selected: Array, warnings: Array<string> }}
 */
export function selectOvertimeCrew({
  dutyDate,
  warehouseId,
  employees = [],
  pastAssignments = [],
  requiredCount = 2,
}) {
  const warnings = [];

  // 1. Filter eligible candidates: active, not archived, matching warehouse, and NOT Super Senior (unless eligible for normal pickup)
  const eligible = employees.filter(
    (e) =>
      !e.archived &&
      e.active !== false &&
      (e.experience !== 'Super Senior' || Boolean(e.eligible_for_normal_pickup)) &&
      (!warehouseId || e.warehouse_id == null || String(e.warehouse_id) === String(warehouseId))
  );

  if (eligible.length === 0) {
    warnings.push(`No active eligible employees available for duty on ${dutyDate}.`);
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
    const hasKey = enriched.some((e) => e.can_hold_key);
    const noKeyHolderAvailable = !hasKey;
    if (noKeyHolderAvailable) {
      warnings.push(
        '⚠️ No Key Holder Available: None of the present rested employees have Head Office key authority. Senior Supervisor risk authorization required.'
      );
    }
    return { selected: enriched, warnings, noKeyHolderAvailable };
  }

  // 3. Anti-consecutive rest filter:
  // If there are enough candidates who didn't work yesterday, exclude yesterday's workers from today's selection!
  const nonRestingCandidates = enriched.filter((e) => !e.workedYesterday);
  let poolToUse = enriched;

  if (nonRestingCandidates.length >= requiredCount) {
    poolToUse = nonRestingCandidates;
  } else {
    warnings.push('Some employees may work consecutive shifts due to limited rested staff available today.');
  }

  // 4. Key Holder check on available candidate pool
  const keyHoldersInPool = poolToUse.filter((e) => e.can_hold_key);
  let noKeyHolderAvailable = false;
  if (keyHoldersInPool.length === 0) {
    noKeyHolderAvailable = true;
    warnings.push(
      '⚠️ No Key Holder Available: None of the present rested employees have Head Office key authority. Senior Supervisor risk authorization required.'
    );
  }

  // 5. Group candidates by actual completedCount (real pickups done in this system)
  //    to enforce fair rotation (Rule 2). New employees start at 0 and get chosen first.
  //    initialCompletedCount is NOT used here — it is informational only and must NOT
  //    disadvantage new joiners by putting them in a later cohort.
  const cohortsMap = new Map();
  for (const emp of poolToUse) {
    const count = emp.completedCount;   // ← raw actual count, no baseline added
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

  // Guarantee Key Holder Coverage if key holders are available in the candidate pool
  if (keyHoldersInPool.length > 0 && selected.length > 0 && !selected.some((e) => e.can_hold_key)) {
    // Find the best key holder candidate in poolToUse
    const keyCandidates = [...keyHoldersInPool].sort((a, b) => {
      if (a.effectiveCompletedCount !== b.effectiveCompletedCount) {
        return a.effectiveCompletedCount - b.effectiveCompletedCount;
      }
      return (b.daysSinceLastCompleted || 0) - (a.daysSinceLastCompleted || 0);
    });

    const bestKeyHolder = keyCandidates[0];
    if (bestKeyHolder) {
      // Replace the least optimal non-key candidate in selected
      let replaceIdx = selected.length - 1;
      let worstScore = -Infinity;
      for (let i = 0; i < selected.length; i++) {
        const emp = selected[i];
        const val = emp.effectiveCompletedCount * 1000 - (emp.daysSinceLastCompleted || 0);
        if (val > worstScore) {
          worstScore = val;
          replaceIdx = i;
        }
      }
      selected[replaceIdx] = bestKeyHolder;
      warnings.push(
        `Selected ${bestKeyHolder.name} (authorized key holder) to ensure mandatory Head Office key submission coverage.`
      );
    }
  }

  // Final sanity checks & warnings
  const selectedHighSkill = selected.filter((e) => e.isHighSkill).length;
  if (selectedHighSkill > 1) {
    warnings.push(
      `Pairing includes ${selectedHighSkill} high-skill workers because junior/mid candidates were limited in the fairness cohort.`
    );
  }

  return { selected, warnings, noKeyHolderAvailable };
}
