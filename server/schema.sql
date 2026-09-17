-- PickUp Database Schema for PostgreSQL 16

CREATE TABLE IF NOT EXISTS warehouses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
    name TEXT NOT NULL,
    experience TEXT NOT NULL CHECK (experience IN ('Junior', 'Mid', 'Senior', 'Super Senior')),
    skill SMALLINT NOT NULL CHECK (skill >= 1 AND skill <= 5),
    initial_completed_count INTEGER DEFAULT 0 NOT NULL,
    can_hold_key BOOLEAN DEFAULT FALSE NOT NULL,
    eligible_for_normal_pickup BOOLEAN DEFAULT FALSE NOT NULL,
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
    role TEXT DEFAULT 'mod' NOT NULL CHECK (role IN ('admin', 'senior', 'mod')),
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

