import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  Clock,
  Award,
  Users,
  CheckCircle2,
  Calendar,
  Menu,
  X,
} from 'lucide-react';

export default function FairnessAnalytics({
  employees = [],
  assignments = [],
  runs = [],
}) {
  // ── Month Selector ──────────────────────────────────────────────────────────
  const getTodayMonthStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  // Build list of months that have any assignment data, plus always include current month
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    monthSet.add(getTodayMonthStr());
    for (const a of assignments) {
      if (a.duty_date) {
        monthSet.add(a.duty_date.slice(0, 7));
      }
    }
    return Array.from(monthSet).sort().reverse(); // Most recent first
  }, [assignments]);

  const [selectedMonth, setSelectedMonth] = useState(() => getTodayMonthStr());
  const [showMobileMetrics, setShowMobileMetrics] = useState(false);

  const formatMonthLabel = (monthStr) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // ── Filter Assignments to Selected Month ────────────────────────────────────
  const monthAssignments = useMemo(
    () => assignments.filter((a) => a.duty_date && a.duty_date.startsWith(selectedMonth)),
    [assignments, selectedMonth]
  );

  const activeEmployees = employees.filter((e) => e.active && e.experience !== 'Super Senior');

  // Per-employee stay count for the selected month
  const monthStayByEmpId = useMemo(() => {
    const map = new Map();
    for (const a of monthAssignments) {
      if (a.status === 'completed') {
        const prev = map.get(String(a.employee_id)) || 0;
        map.set(String(a.employee_id), prev + 1);
      }
    }
    return map;
  }, [monthAssignments]);

  const totalCompleted = monthAssignments.filter((a) => a.status === 'completed').length;
  const totalScheduled = monthAssignments.filter((a) => a.status === 'scheduled').length;
  const totalAbsent = monthAssignments.filter((a) => a.status === 'absent').length;

  // Stays distribution (month-scoped)
  const stayCounts = activeEmployees.map((e) => monthStayByEmpId.get(String(e.id)) || 0);
  const minStays = stayCounts.length > 0 ? Math.min(...stayCounts) : 0;
  const maxStays = stayCounts.length > 0 ? Math.max(...stayCounts) : 1;
  const avgStays =
    stayCounts.length > 0
      ? (stayCounts.reduce((a, b) => a + b, 0) / stayCounts.length).toFixed(1)
      : 0;

  // Variance & Fairness Score (month-scoped)
  const variance = stayCounts.length > 0 ? maxStays - minStays : 0;
  const fairnessRating =
    variance <= 1
      ? 'Optimal Equity'
      : variance === 2
      ? 'Balanced Equity'
      : 'Rebalancing In Progress';

  const fairnessDesc =
    variance <= 1
      ? 'All active staff within 1 turn of each other'
      : variance === 2
      ? 'Minor turn variance across staff'
      : `Deviation spread: ${variance} shifts`;

  // Priority queue: missed duty this month
  const priorityWorkers = employees.filter((e) => e.hasMissedPriority);

  // Sorted by month stays desc
  const sortedActive = [...activeEmployees].sort(
    (a, b) =>
      (monthStayByEmpId.get(String(b.id)) || 0) - (monthStayByEmpId.get(String(a.id)) || 0)
  );

  // Filter runs to selected month
  const monthRuns = runs.filter((r) => r.duty_date && r.duty_date.startsWith(selectedMonth));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Month Selector Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.85rem 1.1rem',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Calendar size={18} color="var(--accent-cyan)" />
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            Showing: {formatMonthLabel(selectedMonth)}
          </span>
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface-elevated)',
              padding: '0.2rem 0.55rem',
              borderRadius: '999px',
              border: '1px solid var(--border-color)',
            }}
          >
            {totalCompleted} stays this month
          </span>
        </div>
        <div className="fairness-month-controls">
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: '160px', fontSize: '0.88rem', padding: '0.4rem 0.75rem' }}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>

          {/* Hamburger toggle button for 4 metric boxes on mobile */}
          <button
            type="button"
            className="mobile-fairness-metrics-toggle-btn"
            onClick={() => setShowMobileMetrics(!showMobileMetrics)}
            aria-label="Toggle Summary Statistics"
            title={showMobileMetrics ? 'Hide summary statistics' : 'Show summary statistics'}
          >
            {showMobileMetrics ? <X size={18} /> : <Menu size={18} />}
            <span className="mobile-toggle-btn-label">Stats</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Container (collapsible dropdown on mobile, grid on desktop) */}
      <div className={`fairness-metrics-container ${showMobileMetrics ? 'mobile-visible' : 'mobile-hidden'}`}>
        <div className="fairness-metrics-grid">
          <div className="metric-card metric-emerald">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                TOTAL STAYS
              </span>
              <div className="metric-icon-pod emerald">
                <ShieldCheck size={20} />
              </div>
            </div>
            <div className="metric-val" style={{ color: '#4ade80' }}>
              {totalCompleted}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: '#22c55e', fontWeight: 600 }}>● Confirmed</span> overtime stays
            </div>
          </div>

          <div className="metric-card metric-cyan">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                AVG STAYS / WORKER
              </span>
              <div className="metric-icon-pod cyan">
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="metric-val" style={{ color: '#38bdf8' }}>
              {avgStays}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Group range: <strong>{minStays}</strong> to <strong>{maxStays}</strong> stays
            </div>
          </div>

          <div className="metric-card metric-amber">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                FAIRNESS SPREAD
              </span>
              <div className="metric-icon-pod amber">
                <Award size={20} />
              </div>
            </div>
            <div className="metric-val" style={{ color: '#fbbf24', fontSize: '1.65rem', marginTop: '0.65rem' }}>
              {fairnessRating}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              {fairnessDesc}
            </div>
          </div>

          <div className="metric-card metric-rose">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                ABSENT CATCH-UPS
              </span>
              <div className="metric-icon-pod rose">
                <AlertCircle size={20} />
              </div>
            </div>
            <div className="metric-val" style={{ color: '#f87171' }}>
              {priorityWorkers.length}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Next-present auto-assigned (Rule 3)
            </div>
          </div>
        </div>
      </div>

      {/* Visual Worker Turn Equity Progress Tracker */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="card-title" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="var(--accent-cyan)" />
            Staff Turn Equity — {formatMonthLabel(selectedMonth)}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-surface-elevated)', padding: '0.25rem 0.65rem', borderRadius: '999px', border: '1px solid var(--border-color)' }}>
            {activeEmployees.length} Active Workers
          </span>
        </div>

        {activeEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No active employees found.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
            {sortedActive.map((emp) => {
              const count = monthStayByEmpId.get(String(emp.id)) || 0;
              const maxVal = maxStays > 0 ? maxStays : 1;
              const pct = Math.min(100, Math.round((count / maxVal) * 100));
              const badgeClass =
                emp.experience === 'Super Senior'
                  ? 'badge-super-senior'
                  : emp.experience === 'Senior'
                  ? 'badge-senior'
                  : emp.experience === 'Mid'
                  ? 'badge-mid'
                  : 'badge-junior';

              return (
                <div
                  key={emp.id}
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    padding: '0.9rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{emp.name}</span>
                      <span className={`badge ${badgeClass}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                        {emp.experience}
                      </span>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent-cyan)' }}>
                      {count} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>turns</span>
                    </span>
                  </div>

                  <div className="turn-progress-track">
                    <div className="turn-progress-fill" style={{ width: `${pct}%` }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>{emp.skill >= 4 ? 'Lead / Senior' : emp.skill <= 2 ? 'Junior' : 'Competent Mid'}</span>
                    <span>
                      Skill {emp.skill}/5 · All-time: {emp.completedCount || 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Priority Queue & Distribution */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* Priority Catch-Up Queue */}
        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={20} color="var(--accent-amber)" />
              Missed-Duty Priority Queue (Rule 3)
            </div>
          </div>

          {priorityWorkers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              ✨ No employees currently in the priority queue. Everyone who missed a past pickup has completed a makeup shift!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {priorityWorkers.map((emp) => (
                <div
                  key={emp.id}
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    boxShadow: '0 2px 10px rgba(245, 158, 11, 0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {emp.experience} · Skill {emp.skill}/5
                    </div>
                  </div>
                  <span className="badge badge-priority" style={{ animation: 'pulseGlow 2s infinite' }}>
                    Next Present Priority
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Run Logs */}
        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={20} color="var(--accent-blue)" />
              Generation Runs — {formatMonthLabel(selectedMonth)}
            </div>
          </div>

          {monthRuns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No automated runs recorded for {formatMonthLabel(selectedMonth)}.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {monthRuns.slice(0, 8).map((run, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600 }}>Date: {run.duty_date}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {new Date(run.generated_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {run.warning ? (
                    <div style={{ fontSize: '0.8rem', color: '#fcd34d', marginTop: '0.25rem' }}>
                      ⚠️ {run.warning}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#86efac', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CheckCircle2 size={14} color="#22c55e" /> Clean run (Balanced cohorts satisfied)
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
