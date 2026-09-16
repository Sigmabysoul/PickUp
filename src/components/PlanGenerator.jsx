import React, { useState } from 'react';
import {
  Calendar,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Users,
  ShieldCheck,
  Building2,
  ArrowRight,
} from 'lucide-react';

export default function PlanGenerator({
  warehouses = [],
  dailyRequirements = [],
  initialDate,
  initialWarehouseId,
  onSaveRequirement,
  onGeneratePlan,
  onViewCalendar,
}) {
  const [dutyDate, setDutyDate] = useState(() => {
    if (initialDate) return initialDate;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    initialWarehouseId || 'all'
  );

  // Requirements overrides map: { [whId]: count }
  const [reqs, setReqs] = useState(() => {
    const map = {};
    for (const wh of warehouses) {
      const match = dailyRequirements.find(
        (r) => r.duty_date === dutyDate && String(r.warehouse_id) === String(wh.id)
      );
      map[wh.id] = match ? match.worker_count : 2;
    }
    return map;
  });

  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleReqChange = (whId, val) => {
    const num = Math.max(1, Math.min(10, parseInt(val, 10) || 2));
    setReqs((prev) => ({ ...prev, [whId]: num }));
  };

  const runPreview = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      // Save any updated requirements first
      for (const wh of warehouses) {
        if (reqs[wh.id] != null) {
          await onSaveRequirement(wh.id, dutyDate, reqs[wh.id]);
        }
      }

      const res = await onGeneratePlan({
        duty_date: dutyDate,
        warehouse_id: selectedWarehouseId === 'all' ? null : selectedWarehouseId,
        dry_run: true,
      });

      setPreviewResult(res);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to preview plan');
    } finally {
      setLoading(false);
    }
  };

  const commitPlan = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await onGeneratePlan({
        duty_date: dutyDate,
        warehouse_id: selectedWarehouseId === 'all' ? null : selectedWarehouseId,
        dry_run: false,
      });

      setSuccessMessage(
        `Overtime shift plan committed for ${dutyDate}! Scheduled assignments have been logged to the database.`
      );
      setPreviewResult(res);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to commit plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Sparkles color="var(--accent-blue)" size={24} />
            Automated Overtime Duty Generator
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onViewCalendar}>
            <Calendar size={14} /> Back to Calendar
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          Select the shift date and configure required staffing. The algorithm strictly
          enforces fair turn rotation (Rule 2), prioritizes previously absent workers (Rule 3),
          and avoids pairing two high-skill workers together (Rule 1).
        </p>

        {/* Form controls */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div className="form-group">
            <label className="form-label">Shift Duty Date</label>
            <input
              type="date"
              className="form-input"
              value={dutyDate}
              onChange={(e) => {
                setDutyDate(e.target.value);
                setPreviewResult(null);
                setSuccessMessage(null);
              }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Target Warehouses</label>
            <select
              className="form-select"
              value={selectedWarehouseId}
              onChange={(e) => {
                setSelectedWarehouseId(e.target.value);
                setPreviewResult(null);
              }}
            >
              <option value="all">All Active Warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Staffing Requirements per warehouse */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            Workers Needed Per Warehouse for {dutyDate}
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
              gap: '0.75rem',
            }}
          >
            {warehouses.map((wh) => (
              <div
                key={wh.id}
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building2 size={16} color="var(--accent-blue)" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{wh.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Workers:</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="form-input"
                    style={{ width: '65px', padding: '0.25rem 0.5rem', textAlign: 'center' }}
                    value={reqs[wh.id] || 2}
                    onChange={(e) => handleReqChange(wh.id, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="plan-actions-group">
          <button
            className="btn btn-secondary"
            onClick={runPreview}
            disabled={loading}
          >
            <ShieldCheck size={16} />
            {loading ? 'Evaluating Rules...' : 'Preview Shift Plan (Dry Run)'}
          </button>

          <button
            className="btn btn-primary"
            onClick={commitPlan}
            disabled={loading}
          >
            <CheckCircle size={16} />
            Commit & Schedule Assignments
          </button>
        </div>

        {errorMessage && (
          <div className="alert-box alert-warning" style={{ marginTop: '1rem' }}>
            <AlertTriangle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="alert-box alert-success" style={{ marginTop: '1rem' }}>
            <CheckCircle size={18} />
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span>{successMessage}</span>
              <button
                className="btn btn-sm btn-primary"
                onClick={onViewCalendar}
                style={{ marginLeft: '1rem' }}
              >
                View in Calendar <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Preview Section */}
      {previewResult && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Users color="var(--accent-green)" size={22} />
              {previewResult.dry_run ? 'Dry Run Plan Preview' : 'Scheduled Shift Plan'} ({previewResult.duty_date})
            </div>
            {previewResult.dry_run && (
              <span className="badge badge-mid">Dry Run (Not Committed)</span>
            )}
          </div>

          {previewResult.warnings && previewResult.warnings.length > 0 && (
            <div className="alert-box alert-warning">
              <AlertTriangle size={18} />
              <div>
                <strong>Constraint Warnings:</strong>
                <ul style={{ paddingLeft: '1.25rem', marginTop: '0.25rem' }}>
                  {previewResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {previewResult.results.map((res) => (
              <div
                key={res.warehouse_id}
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{res.warehouse_name}</h4>
                  <span className="badge" style={{ backgroundColor: 'var(--bg-surface)' }}>
                    Needed: {res.required_count} workers
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '0.75rem',
                  }}
                >
                  {res.selected.map((emp) => (
                    <div
                      key={emp.id}
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        padding: '0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.35rem',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{emp.name}</span>
                        <span
                          className={`badge ${
                            emp.experience === 'Senior'
                              ? 'badge-senior'
                              : emp.experience === 'Mid'
                              ? 'badge-mid'
                              : 'badge-junior'
                          }`}
                        >
                          {emp.experience}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.2rem',
                        }}
                      >
                        <div>
                          Skill: <strong>{emp.skill}/5</strong> · Completed Stays:{' '}
                          <strong>{emp.completedCount}</strong>
                        </div>
                        {emp.hasMissedPriority && (
                          <div style={{ color: '#fcd34d', fontWeight: 600 }}>
                            ⭐ Missed-duty priority applied!
                          </div>
                        )}
                        <div>
                          Pairing Role:{' '}
                          {emp.isHighSkill
                            ? 'Experienced Lead'
                            : emp.isJunior
                            ? 'Junior Support'
                            : 'Mid Competent'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {res.warnings && res.warnings.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      fontSize: '0.8rem',
                      color: '#fcd34d',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <AlertTriangle size={14} />
                    <span>{res.warnings.join('; ')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
