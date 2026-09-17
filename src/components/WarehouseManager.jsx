import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Plus,
  CheckCircle,
  XCircle,
  Users,
  Download,
  FileText,
  FileSpreadsheet,
  Calendar,
  Check,
  UserCog,
  UserPlus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { exportToCSV, exportToPDF, filterMonthData } from '../utils/exportReport.js';

export default function WarehouseManager({
  warehouses = [],
  employees = [],
  assignments = [],
  dailyLogs = [],
  authUser = null,
  authFetch,
  onAddWarehouse,
  onUpdateWarehouse,
}) {
  const [name, setName] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Senior User Management State (Admin Only)
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userError, setUserError] = useState(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [revealedPasscodes, setRevealedPasscodes] = useState({});

  // Add User form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPasscode, setNewUserPasscode] = useState('');
  const [newUserRole, setNewUserRole] = useState('senior');

  // Edit User form state
  const [editName, setEditName] = useState('');
  const [editPasscode, setEditPasscode] = useState('');
  const [editRole, setEditRole] = useState('senior');
  const [editActive, setEditActive] = useState(true);

  const fetchUsers = useCallback(async () => {
    if (!authFetch || authUser?.role !== 'admin') return;
    try {
      setLoadingUsers(true);
      setUserError(null);
      const res = await authFetch('/api/users');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to fetch users');
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setUserError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  }, [authFetch, authUser?.role]);

  useEffect(() => {
    if (authUser?.role === 'admin') {
      fetchUsers();
    }
  }, [authUser?.role, fetchUsers]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserUsername.trim() || !newUserPasscode.trim()) {
      alert('Please fill out all user fields');
      return;
    }
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName.trim(),
          username: newUserUsername.trim(),
          passcode: newUserPasscode.trim(),
          role: newUserRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }
      setNewUserName('');
      setNewUserUsername('');
      setNewUserPasscode('');
      setNewUserRole('senior');
      setIsAddUserModalOpen(false);
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenEditUser = (u) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditPasscode(u.passcode);
    setEditRole(u.role || 'senior');
    setEditActive(u.active);
    setIsEditUserModalOpen(true);
  };

  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const res = await authFetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          passcode: editPasscode.trim(),
          role: editRole,
          active: editActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user');
      }
      setIsEditUserModalOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Are you sure you want to delete senior user "${u.name}" (@${u.username})?`)) {
      return;
    }
    try {
      const res = await authFetch(`/api/users/${u.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleUserActive = async (u) => {
    try {
      const res = await authFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: !u.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update status');
      }
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleRevealPasscode = (id) => {
    setRevealedPasscodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Export Modal State (Defaults to previous month based on current anchor date 2026-09)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => {
    // Current application anchor is September 2026 -> Previous month is August 2026 (2026-08)
    const now = new Date(2026, 8, 16);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = prev.getFullYear();
    const m = String(prev.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [exportFormat, setExportFormat] = useState('pdf'); // 'pdf' | 'csv'
  const [isExporting, setIsExporting] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAddWarehouse({ name: name.trim() });
    setName('');
    setIsModalOpen(false);
  };

  const handleToggle = async (wh) => {
    await onUpdateWarehouse(wh.id, { active: !wh.active });
  };

  // Monthly stats preview for selected month
  const monthPreview = filterMonthData(exportMonth, assignments, dailyLogs);

  const handleExecuteExport = () => {
    setIsExporting(true);
    try {
      if (exportFormat === 'csv') {
        exportToCSV({
          month: exportMonth,
          assignments,
          warehouses,
          dailyLogs,
        });
      } else {
        exportToPDF({
          month: exportMonth,
          assignments,
          warehouses,
          dailyLogs,
        });
      }
      setIsExportModalOpen(false);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* =========================================================================
          SECTION 1: DATA EXPORT & REPORTS (FOR BOSS / AUDITING / PAYROLL)
          ========================================================================= */}
      <div className="card" style={{ border: '1px solid rgba(56, 189, 248, 0.3)' }}>
        <div className="card-header" style={{ marginBottom: '0.75rem' }}>
          <div className="card-title">
            <Download color="var(--accent-blue)" size={22} />
            Monthly Data Export & Reports
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ fontWeight: 700 }}
            onClick={() => setIsExportModalOpen(true)}
          >
            <Download size={14} /> Download Data Report
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Download monthly overtime pickup logs, worker stays, and facility attendance outcomes for management reviews, auditing, or payroll accounting.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-surface-elevated)',
            padding: '0.85rem 1.15rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Calendar size={18} color="var(--accent-blue)" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>
                Default Report Period: Previous Month ({exportMonth})
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Export formats available: Official PDF Document or Excel CSV Spreadsheet
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsExportModalOpen(true)}
          >
            Configure & Download
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: FACILITY & OVERTIME DISPATCH SETTINGS (Single Main Warehouse)
          ========================================================================= */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Building2 color="var(--accent-blue)" size={24} />
            Warehouse Facility & Overtime Rules
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setIsModalOpen(true)}>
            <Plus size={14} /> Add Location
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.92rem' }}>
          Overtime pickup operations run out of <strong>Main Warehouse</strong>, requiring a standard shift of <strong>2 employees</strong> each evening. Emergency / big shipment coverage is handled by on-call <strong>👑 Super Seniors</strong>.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
            gap: '1rem',
          }}
        >
          {warehouses.map((wh) => {
            const whEmployees = employees.filter(
              (e) => String(e.warehouse_id) === String(wh.id)
            );
            const activeCount = whEmployees.filter((e) => e.active).length;
            const superSeniorCount = whEmployees.filter((e) => e.active && e.experience === 'Super Senior').length;
            const regularCount = activeCount - superSeniorCount;

            return (
              <div
                key={wh.id}
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  border: wh.active ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  boxShadow: wh.active ? '0 4px 16px rgba(0, 0, 0, 0.2)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                      {wh.name}
                    </div>
                    {wh.active && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', fontWeight: 600, marginTop: '2px' }}>
                        Primary Facility • 2 Staff Overtime Standard
                      </div>
                    )}
                  </div>
                  <button
                    className={`btn btn-sm ${wh.active ? 'btn-success' : 'btn-danger'}`}
                    onClick={() => handleToggle(wh)}
                    title="Toggle active status"
                  >
                    {wh.active ? (
                      <>
                        <CheckCircle size={12} /> Active
                      </>
                    ) : (
                      <>
                        <XCircle size={12} /> Disabled
                      </>
                    )}
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.84rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={14} color="var(--accent-blue)" />
                    <span>
                      <strong>{regularCount}</strong> regular rotation workers ({whEmployees.length} total)
                    </span>
                  </div>
                  {superSeniorCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#eab308' }}>
                      <span>👑</span>
                      <span>
                        <strong>{superSeniorCount}</strong> Super Senior (On-call for big shipments)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: SENIOR USER & PASSCODE MANAGEMENT (ADMIN ACCESS)
          ========================================================================= */}
      {authUser?.role === 'admin' ? (
        <div className="card" style={{ border: '1px solid rgba(192, 132, 252, 0.3)' }}>
          <div className="card-header" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div className="card-title">
              <UserCog color="var(--accent-purple, #c084fc)" size={22} />
              Senior User & Passcode Management
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={fetchUsers}
                title="Refresh user accounts"
              >
                <RefreshCw size={13} className={loadingUsers ? 'spin' : ''} />
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ fontWeight: 700 }}
                onClick={() => setIsAddUserModalOpen(true)}
              >
                <UserPlus size={14} /> Add Senior User
              </button>
            </div>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            As Administrator, you control senior employee accounts and passwords. Created senior supervisors can sign in with their assigned passcodes to access the calendar, dispatch duties, and update staff.
          </p>

          {userError && (
            <div className="alert-box alert-warning" style={{ marginBottom: '1rem' }}>
              <span>{userError}</span>
            </div>
          )}

          {users.length === 0 ? (
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                padding: '2rem 1rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px dashed var(--border-color)',
              }}
            >
              <UserCog size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.5rem auto', opacity: 0.6 }} />
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
                No senior employee accounts created yet
              </p>
              <p style={{ margin: '0.35rem 0 1rem 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Click below to create senior staff accounts with custom passcodes or PINs.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsAddUserModalOpen(true)}
              >
                <UserPlus size={14} /> Create First Senior User
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: '1rem' }}>
              {users.map((u) => {
                const isPasscodeShown = Boolean(revealedPasscodes[u.id]);
                return (
                  <div
                    key={u.id}
                    style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.15rem',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                          {u.name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          @{u.username} · <span style={{ textTransform: 'capitalize', color: 'var(--accent-purple, #c084fc)', fontWeight: 600 }}>{u.role || 'senior'}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`btn btn-sm ${u.active ? 'btn-success' : 'btn-danger'}`}
                        onClick={() => toggleUserActive(u)}
                        title={u.active ? 'Account active (click to disable)' : 'Account disabled (click to activate)'}
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
                      >
                        {u.active ? (
                          <>
                            <CheckCircle size={11} /> Active
                          </>
                        ) : (
                          <>
                            <XCircle size={11} /> Disabled
                          </>
                        )}
                      </button>
                    </div>

                    {/* Passcode Row */}
                    <div
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.5rem 0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <KeyRound size={14} color="var(--accent-amber, #eab308)" />
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Passcode:</span>
                        <code
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            letterSpacing: isPasscodeShown ? 'normal' : '0.15em',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {isPasscodeShown ? u.passcode : '••••••••'}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleRevealPasscode(u.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '3px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title={isPasscodeShown ? 'Hide passcode' : 'Show passcode'}
                      >
                        {isPasscodeShown ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenEditUser(u)}
                        title="Edit User Details / Change Passcode"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                      >
                        <Edit3 size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteUser(u)}
                        title="Delete User"
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ border: '1px solid rgba(56, 189, 248, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ShieldCheck size={20} color="var(--accent-blue)" />
            <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Logged in as <strong>{authUser?.name || 'Senior Employee'}</strong>. User credentials and accounts are managed by the Administrator.
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADD WAREHOUSE
          ========================================================================= */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add Warehouse Location</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAdd}>
              <div className="form-group">
                <label className="form-label">Warehouse Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. South Logistics Depot"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Warehouse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: MONTHLY DATA EXPORT (BOSS REQUEST: MONTH SELECTOR + PDF/CSV OPTIONS)
          ========================================================================= */}
      {isExportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsExportModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Download size={20} color="var(--accent-blue)" />
                Download Monthly Data Report
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsExportModalOpen(false)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Select the month and preferred report format. Previous month is selected by default.
            </p>

            <div className="form-group">
              <label className="form-label">Which month of data do you want?</label>
              <input
                type="month"
                className="form-input"
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                style={{ fontSize: '1rem', fontWeight: 700 }}
                required
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                * Defaults to previous month ({exportMonth}). Change if you need another period.
              </span>
            </div>

            <div className="form-group" style={{ marginTop: '1.25rem' }}>
              <label className="form-label">Choose Export Format:</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                  gap: '0.75rem',
                  marginTop: '0.35rem',
                }}
              >
                {/* PDF Card */}
                <div
                  onClick={() => setExportFormat('pdf')}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: exportFormat === 'pdf' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                    backgroundColor: exportFormat === 'pdf' ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FileText size={20} color={exportFormat === 'pdf' ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                    {exportFormat === 'pdf' && <Check size={16} color="var(--accent-blue)" />}
                  </div>
                  <strong style={{ fontSize: '0.95rem', marginTop: '0.2rem' }}>PDF Document</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Printable executive report with styling & summary
                  </span>
                </div>

                {/* CSV Card */}
                <div
                  onClick={() => setExportFormat('csv')}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: exportFormat === 'csv' ? '2px solid var(--accent-green)' : '1px solid var(--border-color)',
                    backgroundColor: exportFormat === 'csv' ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FileSpreadsheet size={20} color={exportFormat === 'csv' ? 'var(--accent-green)' : 'var(--text-muted)'} />
                    {exportFormat === 'csv' && <Check size={16} color="var(--accent-green)" />}
                  </div>
                  <strong style={{ fontSize: '0.95rem', marginTop: '0.2rem' }}>CSV Spreadsheet</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Raw data for Microsoft Excel & Google Sheets
                  </span>
                </div>
              </div>
            </div>

            {/* Stats preview for selected month */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                marginTop: '1.25rem',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
              }}
            >
              Found <strong>{monthPreview.stats.total}</strong> pickup duties recorded for {exportMonth} ({monthPreview.stats.completed} completed stays, {monthPreview.stats.absent} absences).
            </div>

            <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsExportModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExecuteExport}
                disabled={isExporting}
                style={{ fontWeight: 700 }}
              >
                <Download size={15} />
                {isExporting ? 'Generating File...' : `Download ${exportFormat.toUpperCase()} Report`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADD SENIOR USER (ADMIN ONLY)
          ========================================================================= */}
      {isAddUserModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddUserModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={20} color="var(--accent-purple, #c084fc)" />
                Add Senior Staff User
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsAddUserModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  className="form-input"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Username (Unique ID)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. sarah"
                  className="form-input"
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Passcode / PIN</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 4821 or secure-passcode"
                  className="form-input"
                  value={newUserPasscode}
                  onChange={(e) => setNewUserPasscode(e.target.value)}
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  The senior employee will use this passcode to unlock the dispatcher.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">System Role</label>
                <select
                  className="form-input"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                >
                  <option value="senior">Senior Supervisor (Rosters & Dispatches)</option>
                  <option value="admin">Administrator (Full Access & User Management)</option>
                </select>
              </div>

              <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddUserModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: 700 }}>
                  Create Senior User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: EDIT SENIOR USER (ADMIN ONLY)
          ========================================================================= */}
      {isEditUserModalOpen && editingUser && (
        <div className="modal-overlay" onClick={() => setIsEditUserModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={18} color="var(--accent-blue)" />
                Edit User: @{editingUser.username}
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsEditUserModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Passcode / PIN</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={editPasscode}
                  onChange={(e) => setEditPasscode(e.target.value)}
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  Update the user's passcode or PIN here.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">System Role</label>
                <select
                  className="form-input"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  <option value="senior">Senior Supervisor</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <input
                  type="checkbox"
                  id="editUserActive"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="editUserActive" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                  Account Active (Uncheck to temporarily disable login)
                </label>
              </div>

              <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditUserModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: 700 }}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
