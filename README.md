# PickUp overtime planner

PickUp is a working React and Node application for planning after-hours pickup duty across warehouses. It tracks **scheduled** assignments separately from **actual stays**, so the calendar is also an attendance log.

## Run locally

1. `docker compose up -d postgres`
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:5173`

The local default database connection matches `docker-compose.yml`. For another PostgreSQL instance, set `DATABASE_URL` and `PORT`. The API creates tables from `server/schema.sql` on startup. `npm test` runs the selector checks and `npm run build` creates the production UI. For a single production process, build then run `npm start` behind HTTPS and company SSO.

## Technical specification

- **Frontend:** React/Vite dashboard with four modules: Overview, month calendar, Employees, and Warehouses. Overview and calendar let an operator mark each assignment as stayed or absent. The calendar displays the ratio of actual stays to assigned workers on each date.
- **Backend:** Express JSON API in `server/index.js`. It validates writes, runs selection inside a PostgreSQL transaction, serializes generation for each date with an advisory lock, and refuses a second generation to protect attendance history. `server/algorithm.js` has no database dependency.
- **Database:** PostgreSQL 16. `warehouses` identifies locations; `employees` holds name, home warehouse, experience, skill 1–5, active flag, and archive flag; `absences` holds date ranges; `daily_requirements` overrides the default of two workers per active warehouse; `assignments` stores scheduled/completed/absent statuses; `assignment_runs` stores generation warnings. Foreign keys and a unique `(employee_id,duty_date)` prevent duplicate same-day duty. Removing an employee archives them so calendar history remains readable.
- **Scale:** At 10–50 employees the selector sorts a small candidate set per warehouse. Indexed histories and a stateless API support more locations and workers. Warehouse eligibility is currently a single home warehouse; a later cross-location roster can use an `employee_warehouses` join table without replacing the selector.

### API

`GET /api/bootstrap` returns calendar, roster, requirements, absences, and metrics. `POST/PATCH /api/warehouses`, `POST/PATCH/DELETE /api/employees`, `POST/DELETE /api/absences`, `PUT /api/requirements`, `POST /api/generate`, and `PATCH /api/assignments/:id` support the operator flows. Write endpoints need company authentication before deployment; the local MVP has no identity system.

## Assignment algorithm

Completed pickups, rather than scheduled pickups, determine an employee's rotation count. An absent assignment creates a missed-duty priority that remains until a later completed pickup. Disabled employees and date-range absences are not present and never enter selection. A skill of 4 or 5 is considered high capability. The selector treats the rotation cohort as a hard fairness constraint; a missed-duty priority applies inside that cohort. This resolves conflicts where an employee who missed a pickup has already completed more turns than present colleagues.

```text
for each active warehouse on duty_date:
    needed = daily_requirement or 2
    present = active employees at warehouse without an absence on duty_date
    for each employee in present:
        completed = number of earlier assignments marked completed
        missed_priority = earlier absent assignment with no later completed pickup
        last_completed = date of most recent completed pickup

    sort present by:
        fewest completed pickups,
        missed_priority first,
        oldest last_completed first,
        stable employee ID

    lock in everyone from completed-count cohorts below the cutoff cohort
    fill remaining seats from cutoff cohort:
        select missed-priority workers first
        if a high-skill person is selected, prefer a lower-skill person next
        otherwise follow fairness order

    save assignments and warnings in one transaction
    warn if fewer workers are available than needed
    warn if two high-skill workers cannot be avoided within the fairness cohort
```

**Examples:** If A has completed one pickup and B/C none, B/C go before A. If B missed yesterday and is present today, B goes ahead of C when both have zero completed pickups. If two high-skill employees and one junior are in the same cohort, the selector chooses one high-skill employee and the junior for a two-person shift.

## UI wireframe

```text
┌──────── Sidebar ────────┐ ┌──────── Operations overview ─────────────┐
│ Overview               │ │ Generate plan · View calendar             │
│ Calendar               │ │ Active warehouses | Roster | Scheduled   │
│ Employees              │ │ Date picker                                │
│ Warehouses             │ │ Warehouse card: workers + Stayed/Absent   │
└────────────────────────┘ └────────────────────────────────────────────┘

Calendar: month grid with assignment-status dots and actual-stay ratios;
selected-day panel shows each warehouse's people and attendance controls.
Employees: roster with skill and completed counts, active toggles, add form,
and absence form. Warehouses: locations and worker count for selected date.
```

## Suggested next improvements

- Add SSO, role-based admin/operator permissions, and an audit table recording who changed attendance. These are deployment prerequisites for a real company.
- Add notifications after a plan is approved, and a confirmation deadline so workers can decline before truck arrival.
- Add fairness metrics: completed pickups per person, days since last stay, and warning frequency. Flag persistent gaps in skill or capacity.
- Add truck arrival time, overtime hours, and payroll export; these should be separate from selection so hours do not accidentally become an implied fairness turn.
- Add a preview/approve workflow and an explicit reassignment action. Current generation is one-shot to keep actual attendance immutable.