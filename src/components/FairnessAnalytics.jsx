import React from 'react';
import {
  BarChart3,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  Clock,
  Award,
  Users,
  CheckCircle2,
} from 'lucide-react';

export default function FairnessAnalytics({
  employees = [],
  assignments = [],
  runs = [],
}) {
  const activeEmployees = employees.filter((e) => e.active);
  const totalCompleted = assignments.filter((a) => a.status === 'completed').length;
  const totalScheduled = assignments.filter((a) => a.status === 'scheduled').length;
  const totalAbsent = assignments.filter((a) => a.status === 'absent').length;

  // Stays distribution
  const stayCounts = activeEmployees.map((e) => e.completedCount || 0);
  const minStays = stayCounts.length > 0 ? Math.min(...stayCounts) : 0;
  const maxStays = stayCounts.length > 0 ? Math.max(...stayCounts) : 1;
  const avgStays =
    stayCounts.length > 0
      ? (stayCounts.reduce((a, b) => a + b, 0) / stayCounts.length).toFixed(1)
      : 0;

  // Variance & Fairness Score
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

  const priorityWorkers = employees.filter((e) => e.hasMissedPriority);

  // Sorted by completed stays desc
  const sortedActive = [...activeEmployees].sort(
    (a, b) => (b.completedCount || 0) - (a.completedCount || 0)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: '1rem',
        }}
      >
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

      {/* Visual Worker Turn Equity Progress Tracker */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="card-title" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="var(--accent-cyan)" />
            Active Staff Turn Equity Tracker
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
              const count = emp.completedCount || 0;
              const maxVal = maxStays > 0 ? maxStays : 1;
              const pct = Math.min(100, Math.round((count / maxVal) * 100));
              const badgeClass =
                emp.experience === 'Senior'
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
                    <span>Skill {emp.skill}/5</span>
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
              Recent Generation Runs & Warnings
            </div>
          </div>

          {runs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No automated runs recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {runs.slice(0, 5).map((run, i) => (
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
