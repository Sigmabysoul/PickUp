import React, { useState } from 'react';
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
} from 'lucide-react';
import { exportToCSV, exportToPDF, filterMonthData } from '../utils/exportReport.js';

export default function WarehouseManager({
  warehouses = [],
  employees = [],
  assignments = [],
  dailyLogs = [],
  onAddWarehouse,
  onUpdateWarehouse,
}) {
  const [name, setName] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          SECTION 2: WAREHOUSES MANAGEMENT (Old Warehouse & New Warehouse)
          ========================================================================= */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Building2 color="var(--accent-blue)" size={24} />
            Warehouse Management
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
            <Plus size={14} /> Add Warehouse
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          Configure warehouse locations where delivery trucks arrive after hours. Overtime pickup duty is dispatched across all active locations.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: '1rem',
          }}
        >
          {warehouses.map((wh) => {
            const whEmployees = employees.filter(
              (e) => String(e.warehouse_id) === String(wh.id)
            );
            const activeCount = whEmployees.filter((e) => e.active).length;

            return (
              <div
                key={wh.id}
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{wh.name}</span>
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
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                  }}
                >
                  <Users size={14} />
                  <span>
                    <strong>{activeCount}</strong> active workers ({whEmployees.length} total rostered)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
    </div>
  );
}
