import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  CalendarOff,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Star,
  Key,
} from 'lucide-react';

export default function EmployeeManager({
  employees = [],
  warehouses = [],
  absences = [],
  authUser = null,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onAddAbsence,
  onDeleteAbsence,
}) {
  const isAdmin = authUser?.role === 'admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table');

  // Modals state
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empForm, setEmpForm] = useState({
    name: '',
    warehouse_id: warehouses[0]?.id || '',
    experience: 'Junior',
    skill: 2,
    can_hold_key: false,
    eligible_for_normal_pickup: false,
    active: true,
  });

  const [absenceForm, setAbsenceForm] = useState({
    employee_id: '',
    starts_on: new Date().toISOString().split('T')[0],
    ends_on: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    reason: 'Annual Vacation',
  });

  // Filter employees
  const filteredEmployees = employees.filter((emp) => {
    if (searchTerm && !emp.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (experienceFilter !== 'all' && emp.experience !== experienceFilter) {
      return false;
    }
    if (statusFilter === 'active' && !emp.active) return false;
    if (statusFilter === 'disabled' && emp.active) return false;
    return true;
  });

  const openAddEmployeeModal = () => {
    setEditingEmp(null);
    setEmpForm({
      name: '',
      warehouse_id: warehouses[0]?.id || '',
      experience: 'Junior',
      skill: 2,
      can_hold_key: false,
      eligible_for_normal_pickup: false,
      active: true,
    });
    setIsEmpModalOpen(true);
  };

  const openEditEmployeeModal = (emp) => {
    setEditingEmp(emp);
    setEmpForm({
      name: emp.name,
      warehouse_id: emp.warehouse_id,
      experience: emp.experience,
      skill: emp.skill,
      can_hold_key: Boolean(emp.can_hold_key),
      eligible_for_normal_pickup: Boolean(emp.eligible_for_normal_pickup),
      active: emp.active,
    });
    setIsEmpModalOpen(true);
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (!empForm.name.trim()) return;

    if (editingEmp) {
      await onUpdateEmployee(editingEmp.id, empForm);
    } else {
      await onAddEmployee(empForm);
    }
    setIsEmpModalOpen(false);
  };

  const handleToggleActive = async (emp) => {
    await onUpdateEmployee(emp.id, { active: !emp.active });
  };

  const openAbsenceModalForEmp = (emp) => {
    setAbsenceForm({
      employee_id: emp.id,
      starts_on: new Date().toISOString().split('T')[0],
      ends_on: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
      reason: 'Vacation',
    });
    setIsAbsenceModalOpen(true);
  };

  const handleSaveAbsence = async (e) => {
    e.preventDefault();
    if (!absenceForm.employee_id) return;
    await onAddAbsence(absenceForm);
    setIsAbsenceModalOpen(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Users color="var(--accent-blue)" size={24} />
            Employee Roster & Availability Management
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setIsAbsenceModalOpen(true)}>
              <CalendarOff size={14} /> Log Vacation/Absence
            </button>
            <button className="btn btn-primary btn-sm" onClick={openAddEmployeeModal}>
              <UserPlus size={14} /> Add Employee
            </button>
          </div>
        </div>

        {/* Filters and search */}
        <div className="filter-bar-grid">
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search by name..."
              className="form-input"
              style={{ width: '100%', paddingLeft: '2rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={experienceFilter}
              onChange={(e) => setExperienceFilter(e.target.value)}
            >
              <option value="all">All Roles & Levels</option>
              <option value="Super Senior">👑 Super Seniors (On-Call)</option>
              <option value="Senior">Senior (Skill 4-5)</option>
              <option value="Mid">Mid (Skill 3)</option>
              <option value="Junior">Junior (Skill 1-2)</option>
            </select>
          </div>

          <div>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="disabled">Disabled Only</option>
            </select>
          </div>
        </div>

        {/* Desktop Employees Table (Hidden on Mobile <= 768px) */}
        <div className="desktop-table-container table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Role / Seniority</th>
                <th>Skill Rating</th>
                <th>Fairness Stays</th>
                <th>Status / Availability</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No employees matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const empAbsences = absences.filter(
                    (ab) =>
                      String(ab.employee_id) === String(emp.id) &&
                      ab.ends_on >= todayStr
                  );
                  const isOnLeave = empAbsences.length > 0;

                  return (
                    <tr key={emp.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{emp.name}</div>
                        {emp.hasMissedPriority && (
                          <span
                            className="badge badge-priority"
                            style={{ marginTop: '0.2rem' }}
                          >
                            <Star size={10} /> Queued Priority (Missed Duty)
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            emp.experience === 'Super Senior'
                              ? 'badge-super-senior'
                              : emp.experience === 'Senior'
                              ? 'badge-senior'
                              : emp.experience === 'Mid'
                              ? 'badge-mid'
                              : 'badge-junior'
                          }`}
                        >
                          {emp.experience === 'Super Senior'
                            ? emp.eligible_for_normal_pickup
                              ? '👑 Super Senior · Normal Rotation'
                              : '👑 Super Senior · On-Call Only'
                            : emp.experience}
                        </span>
                        {emp.can_hold_key && (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: 'rgba(234, 179, 8, 0.15)',
                              color: '#facc15',
                              border: '1px solid rgba(234, 179, 8, 0.35)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              marginLeft: '0.35rem',
                            }}
                            title="Authorized Key Holder: Can submit facility keys to Head Office"
                          >
                            <Key size={11} /> Key
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span style={{ fontWeight: 600 }}>{emp.skill}/5</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {emp.experience === 'Super Senior' ? '(On-Call Leader)' : emp.skill >= 4 ? '(Lead/Smart)' : emp.skill <= 2 ? '(Junior)' : '(Competent)'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{ backgroundColor: 'var(--bg-surface-elevated)' }}>
                          {emp.experience === 'Super Senior' && !emp.eligible_for_normal_pickup
                            ? 'On-Call (Emergency Only)'
                            : `${emp.completedCount || 0} completed (${emp.effectiveCompletedCount || emp.completedCount || 0} total)`}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <button
                            className={`btn btn-sm ${emp.active ? 'btn-success' : 'btn-danger'}`}
                            onClick={() => handleToggleActive(emp)}
                            title="Click to toggle active status"
                          >
                            {emp.active ? (
                              <>
                                <CheckCircle size={12} /> Active
                              </>
                            ) : (
                              <>
                                <XCircle size={12} /> Disabled
                              </>
                            )}
                          </button>

                          {isOnLeave && (
                            <span
                              className="badge"
                              style={{ backgroundColor: '#f59e0b20', color: '#fcd34d' }}
                              title={`${empAbsences[0].reason} (${empAbsences[0].starts_on} to ${empAbsences[0].ends_on})`}
                            >
                              <CalendarOff size={10} /> On Leave
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditEmployeeModal(emp)}
                            title="Edit employee"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openAbsenceModalForEmp(emp)}
                            title="Log vacation or leave"
                          >
                            <CalendarOff size={13} />
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (window.confirm(`Archive ${emp.name}? Duty history will remain intact.`)) {
                                onDeleteEmployee(emp.id);
                              }
                            }}
                            title="Archive employee"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Employee Cards List (Rendered on Mobile <= 768px) */}
        <div className="mobile-employee-cards-list">
          {filteredEmployees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No employees matching filter criteria.
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const empAbsences = absences.filter(
                (ab) =>
                  String(ab.employee_id) === String(emp.id) &&
                  ab.ends_on >= todayStr
              );
              const isOnLeave = empAbsences.length > 0;
              const badgeClass =
                emp.experience === 'Super Senior'
                  ? 'badge-super-senior'
                  : emp.experience === 'Senior'
                  ? 'badge-senior'
                  : emp.experience === 'Mid'
                  ? 'badge-mid'
                  : 'badge-junior';

              return (
                <div key={emp.id} className="mobile-emp-card">
                  {/* Card Header: Name & Seniority */}
                  <div className="mobile-emp-header">
                    <div>
                      <div className="mobile-emp-name">{emp.name}</div>
                      <div className="mobile-emp-sub">
                        <span>
                          Skill {emp.skill}/5 {emp.experience === 'Super Senior' ? '(Super Senior)' : emp.skill >= 4 ? '(Lead)' : emp.skill <= 2 ? '(Junior)' : '(Mid)'}
                        </span>
                      </div>
                    </div>
                    <span className={`badge ${badgeClass}`}>
                      {emp.experience === 'Super Senior'
                        ? emp.eligible_for_normal_pickup
                          ? '👑 Super Senior · Normal'
                          : '👑 Super Senior · On-Call'
                        : emp.experience}
                    </span>
                  </div>

                  {/* Badges & Stats */}
                  <div className="mobile-emp-stats-row">
                    <span className="mobile-emp-stat-pill">
                      {emp.experience === 'Super Senior' && !emp.eligible_for_normal_pickup
                        ? '👑 On-Call Emergency Crew'
                        : `🔥 ${emp.completedCount || 0} completed stays`}
                    </span>
                    {emp.can_hold_key && (
                      <span
                        className="badge"
                        style={{
                          backgroundColor: 'rgba(234, 179, 8, 0.15)',
                          color: '#facc15',
                          border: '1px solid rgba(234, 179, 8, 0.35)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Key size={10} /> Key Holder
                      </span>
                    )}
                    {isOnLeave && (
                      <span className="mobile-emp-leave-pill" title={`${empAbsences[0].reason} (${empAbsences[0].starts_on} to ${empAbsences[0].ends_on})`}>
                        <CalendarOff size={11} /> On Leave
                      </span>
                    )}
                    {emp.hasMissedPriority && (
                      <span className="badge badge-priority" style={{ animation: 'pulseGlow 2s infinite' }}>
                        <Star size={10} /> Queued Priority
                      </span>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div className="mobile-emp-actions-row">
                    <button
                      className={`btn btn-sm ${emp.active ? 'btn-success' : 'btn-danger'}`}
                      onClick={() => handleToggleActive(emp)}
                      style={{ flex: 1.2, minHeight: '40px', justifyContent: 'center' }}
                      title="Toggle active status"
                    >
                      {emp.active ? (
                        <>
                          <CheckCircle size={13} /> Active
                        </>
                      ) : (
                        <>
                          <XCircle size={13} /> Disabled
                        </>
                      )}
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openAbsenceModalForEmp(emp)}
                      style={{ minHeight: '40px', padding: '0 0.85rem' }}
                      title="Log vacation or leave"
                    >
                      <CalendarOff size={14} /> Leave
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEditEmployeeModal(emp)}
                      style={{ minHeight: '40px', padding: '0 0.85rem' }}
                      title="Edit employee"
                    >
                      <Edit2 size={14} />
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (window.confirm(`Archive ${emp.name}? Duty history will remain intact.`)) {
                          onDeleteEmployee(emp.id);
                        }
                      }}
                      style={{ minHeight: '40px', padding: '0 0.85rem' }}
                      title="Archive employee"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Absences / Scheduled Leaves Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ fontSize: '1.1rem' }}>
            <CalendarOff color="var(--accent-amber)" size={20} />
            Scheduled Absences & Vacations ({absences.length})
          </div>
        </div>
        {absences.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No absence periods logged.</p>
        ) : (
          <>
            <div className="desktop-table-container table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {absences.map((ab) => (
                    <tr key={ab.id}>
                      <td style={{ fontWeight: 600 }}>{ab.employee_name}</td>
                      <td>{ab.starts_on}</td>
                      <td>{ab.ends_on}</td>
                      <td>{ab.reason || 'Not specified'}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => onDeleteAbsence(ab.id)}
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Absences Cards */}
            <div className="mobile-absence-cards-list">
              {absences.map((ab) => (
                <div key={ab.id} className="mobile-absence-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ab.employee_name}</span>
                    <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                      {ab.reason || 'Vacation'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={13} /> {ab.starts_on} → {ab.ends_on}
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    style={{ width: '100%', justifyContent: 'center', minHeight: '38px', marginTop: '0.35rem' }}
                    onClick={() => onDeleteAbsence(ab.id)}
                  >
                    <Trash2 size={13} /> Remove Absence
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Employee Modal */}
      {isEmpModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEmpModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingEmp ? 'Edit Employee' : 'Add New Employee'}
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsEmpModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEmployee}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Alex Morgan"
                  value={empForm.name}
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Experience Level</label>
                <select
                  className="form-select"
                  value={empForm.experience}
                  onChange={(e) => setEmpForm({ ...empForm, experience: e.target.value })}
                >
                  <option value="Junior">Junior</option>
                  <option value="Mid">Mid</option>
                  <option value="Senior">Senior</option>
                  {isAdmin && (
                    <option value="Super Senior">👑 Super Senior (On-Call for Big Shipments)</option>
                  )}
                </select>
                {empForm.experience === 'Super Senior' && (
                  <div style={{
                    marginTop: '0.65rem',
                    padding: '0.85rem',
                    borderRadius: '8px',
                    background: 'rgba(234, 179, 8, 0.12)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}>
                    <div style={{ color: '#eab308', fontSize: '0.82rem', lineHeight: '1.4' }}>
                      👑 <strong>Super Senior Mode:</strong> Reserved for supervisor-level staff. Stays on-call during emergency/big shipments.
                    </div>

                    {/* Admin Checkbox: Can do normal pickup */}
                    {isAdmin && (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.65rem',
                          cursor: 'pointer',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '6px',
                          background: empForm.eligible_for_normal_pickup ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                          border: empForm.eligible_for_normal_pickup ? '1.5px solid #22c55e' : '1px solid var(--border-color)',
                          transition: 'all 0.18s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(empForm.eligible_for_normal_pickup)}
                          onChange={(e) =>
                            setEmpForm({ ...empForm, eligible_for_normal_pickup: e.target.checked })
                          }
                          style={{ width: '16px', height: '16px', accentColor: '#22c55e', cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: empForm.eligible_for_normal_pickup ? '#4ade80' : 'var(--text-primary)' }}>
                            Can do normal pickup too
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            Include this Super Senior in standard automatic daily overtime rotation.
                          </div>
                        </div>
                      </label>
                    )}

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {empForm.eligible_for_normal_pickup
                        ? '✅ Active in rotation: The algorithm will schedule this Super Senior for regular pickups as an anchor.'
                        : '🔒 On-Call Only: The algorithm will NEVER automatically schedule this Super Senior. Only assigned via Emergency Dispatch.'}
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  Actual Skill Rating (1: Junior, 3: Competent, 4-5: Smart/Understands Everything)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    style={{ flex: 1 }}
                    value={empForm.skill}
                    onChange={(e) => setEmpForm({ ...empForm, skill: parseInt(e.target.value, 10) })}
                  />
                  <span style={{ fontWeight: 700, minWidth: '40px' }}>{empForm.skill} / 5</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Key size={15} color="#eab308" /> Head Office Key Authorization
                </label>
                <div
                  onClick={() => setEmpForm({ ...empForm, can_hold_key: !empForm.can_hold_key })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    backgroundColor: empForm.can_hold_key ? 'rgba(234, 179, 8, 0.15)' : 'var(--bg-surface-elevated)',
                    border: empForm.can_hold_key ? '1.5px solid #eab308' : '1px solid var(--border-color)',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '6px',
                      backgroundColor: empForm.can_hold_key ? '#eab308' : 'transparent',
                      border: empForm.can_hold_key ? 'none' : '2px solid var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#000',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      flexShrink: 0,
                    }}
                  >
                    {empForm.can_hold_key && '✓'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: empForm.can_hold_key ? '#fef08a' : 'var(--text-primary)' }}>
                      🔑 Authorized Key Holder
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      Can lock up and submit facility keys to Head Office after overtime duty. Overtime shifts require at least 1 key holder.
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Availability Status</label>
                <select
                  className="form-select"
                  value={empForm.active ? 'true' : 'false'}
                  onChange={(e) => setEmpForm({ ...empForm, active: e.target.value === 'true' })}
                >
                  <option value="true">Active (Eligible for pickup)</option>
                  <option value="false">Disabled (Temporarily exempt / leave)</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEmpModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingEmp ? 'Save Changes' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Absence Modal */}
      {isAbsenceModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAbsenceModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Log Vacation or Scheduled Absence</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsAbsenceModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAbsence}>
              <div className="form-group">
                <label className="form-label">Employee</label>
                <select
                  className="form-select"
                  required
                  value={absenceForm.employee_id}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, employee_id: e.target.value })}
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.experience}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  required
                  className="form-input"
                  value={absenceForm.starts_on}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, starts_on: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  required
                  className="form-input"
                  value={absenceForm.ends_on}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, ends_on: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reason</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Annual Leave, Medical, Training"
                  value={absenceForm.reason}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, reason: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAbsenceModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Record Absence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
