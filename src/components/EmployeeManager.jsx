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
} from 'lucide-react';

export default function EmployeeManager({
  employees = [],
  warehouses = [],
  absences = [],
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onAddAbsence,
  onDeleteAbsence,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals state
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empForm, setEmpForm] = useState({
    name: '',
    warehouse_id: warehouses[0]?.id || '',
    experience: 'Junior',
    skill: 2,
    active: true,
  });

  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
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
    if (warehouseFilter !== 'all' && String(emp.warehouse_id) !== String(warehouseFilter)) {
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
          <div style={{ display: 'flex', gap: '0.75rem' }}>
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
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
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
            >
              <option value="all">All Warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
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

        {/* Employees Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Warehouse</th>
                <th>Experience Level</th>
                <th>Skill Rating</th>
                <th>Fairness Stays</th>
                <th>Status / Availability</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
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
                      <td>{emp.warehouse_name || 'Unassigned'}</td>
                      <td>
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
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span style={{ fontWeight: 600 }}>{emp.skill}/5</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {emp.skill >= 4 ? '(Lead/Smart)' : emp.skill <= 2 ? '(Junior)' : '(Competent)'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{ backgroundColor: 'var(--bg-surface-elevated)' }}>
                          {emp.completedCount || 0} completed
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
          <div className="table-responsive">
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
                <label className="form-label">Warehouse</label>
                <select
                  className="form-select"
                  value={empForm.warehouse_id}
                  onChange={(e) => setEmpForm({ ...empForm, warehouse_id: e.target.value })}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
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
                </select>
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
                      {emp.name} ({emp.warehouse_name})
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
