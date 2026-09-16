import React from 'react';
import {
  BarChart3,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  Clock,
  Award,
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
  const maxStays = stayCounts.length > 0 ? Math.max(...stayCounts) : 0;
  const avgStays =
    stayCounts.length > 0
      ? (stayCounts.reduce((a, b) => a + b, 0) / stayCounts.length).toFixed(1)
      : 0;

  // Variance & Fairness Score
  const variance = maxStays - minStays;
  const fairnessRating =
    variance <= 1
      ? 'Optimal Equity (All workers within 1 turn)'
      : variance === 2
      ? 'Balanced Equity (Minor turn variance)'
      : 'Rebalancing In Progress';

  const priorityWorkers = employees.filter((e) => e.hasMissedPriority);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>TOTAL STAYS</span>
            <ShieldCheck size={18} color="var(--accent-green)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.5rem', color: '#86efac' }}>
            {totalCompleted}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Confirmed overtime pickups
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>AVG STAYS / WORKER</span>
            <TrendingUp size={18} color="var(--accent-blue)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.5rem', color: '#7dd3fc' }}>
            {avgStays}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Range: {minStays} to {maxStays} stays
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>FAIRNESS SPREAD</span>
            <Award size={18} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.75rem', color: '#fcd34d' }}>
            {fairnessRating}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Max turn deviation: {variance}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>ABSENT CATCH-UPS</span>
            <AlertCircle size={18} color="var(--accent-red)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.5rem', color: '#fca5a5' }}>
            {priorityWorkers.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Queued for next present shift
          </div>
        </div>
      </div>

      {/* Priority Queue & Distribution */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* Priority Catch-Up Queue */}
        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ fontSize: '1.1rem' }}>
              <Clock size={20} color="var(--accent-amber)" />
              Missed-Duty Priority Queue (Rule 3)
            </div>
          </div>

          {priorityWorkers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No employees currently in the missed-duty priority queue. Everyone who missed a past pickup has completed a makeup shift!
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
                    border: '1px solid #f59e0b40',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {emp.warehouse_name} · {emp.experience} (Skill {emp.skill}/5)
                    </div>
                  </div>
                  <span className="badge badge-priority">
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
            <div className="card-title" style={{ fontSize: '1.1rem' }}>
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
                    <div style={{ fontSize: '0.8rem', color: '#86efac', marginTop: '0.25rem' }}>
                      ✔ Clean run (Balanced pairings & fairness cohorts satisfied)
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
