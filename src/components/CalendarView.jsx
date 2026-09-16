import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  UserX,
  Building2,
  Coffee,
  Sparkles,
  ArrowLeftRight,
  Info,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';

export default function CalendarView({
  assignments = [],
  warehouses = [],
  employees = [],
  dailyRequirements = [],
  dailyLogs = [],
  onUpdateStatus,
  onUpdateDailyStatus,
  onReportAbsence,
  onConfirmToday,
  onSwapWarehouses,
  onLogHistoricalPickup,
  onDeleteHistoricalPickup,
  onToggleEmergencySunday,
  onGeneratePlan,
}) {
  const todayStr = '2026-09-16'; // Anchor date
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 8, 16)); // September 2026
  const [selectedDateStr, setSelectedDateStr] = useState('2026-09-16');
  const [filterWarehouseId, setFilterWarehouseId] = useState('all');
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'

  // Absence modal state
  const [reportingAssignment, setReportingAssignment] = useState(null);
  const [absenceReason, setAbsenceReason] = useState('Called in sick / Fever');
  const [customReason, setCustomReason] = useState('');
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);

  // Manual Historical Backfill state
  const [isBackfillModalOpen, setIsBackfillModalOpen] = useState(false);
  const [backfillDate, setBackfillDate] = useState('2026-09-15');
  const [backfillWhId, setBackfillWhId] = useState('');
  const [backfillEmpId, setBackfillEmpId] = useState('');
  const [isSubmittingBackfill, setIsSubmittingBackfill] = useState(false);

  // Loading & Feedback states
  const [isConfirmingToday, setIsConfirmingToday] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Month navigation
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => {
    setCurrentDate(new Date(2026, 8, 16));
    setSelectedDateStr('2026-09-16');
  };

  // Month grid setup
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = lastDayOfMonth.getDate();

  const calendarCells = [];
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const prevDate = new Date(year, month - 1, d);
    calendarCells.push({
      dateStr: prevDate.toISOString().split('T')[0],
      dayNum: d,
      isCurrentMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    calendarCells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }
  const totalSlots = calendarCells.length <= 35 ? 35 : 42;
  const trailingNeeded = totalSlots - calendarCells.length;
  for (let d = 1; d <= trailingNeeded; d++) {
    const nextDate = new Date(year, month + 1, d);
    calendarCells.push({
      dateStr: nextDate.toISOString().split('T')[0],
      dayNum: d,
      isCurrentMonth: false,
    });
  }

  // Determine status for each date
  const getDateStatus = (dateStr) => {
    // 1. Check daily_logs
    const log = dailyLogs.find((l) => {
      if (l.duty_date !== dateStr) return false;
      if (filterWarehouseId === 'all') return true;
      return l.warehouse_id == null || String(l.warehouse_id) === String(filterWarehouseId);
    });

    if (log) {
      return { type: log.status, notes: log.notes };
    }

    // 2. Check assignments
    const dayAssignments = assignments.filter((a) => {
      if (a.duty_date !== dateStr) return false;
      if (filterWarehouseId === 'all') return true;
      return String(a.warehouse_id) === String(filterWarehouseId);
    });

    const hasCompleted = dayAssignments.some((a) => a.status === 'completed');
    const hasScheduled = dayAssignments.some((a) => a.status === 'scheduled');
    const hasAbsent = dayAssignments.some((a) => a.status === 'absent');

    if (hasCompleted) return { type: 'overtime_stay' };
    if (hasScheduled) return { type: 'scheduled' };
    if (hasAbsent && !hasCompleted) return { type: 'no_pickup' };

    // 3. Sunday Rule: Sundays default to Sunday Off (standard weekly closure)
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    if (dayOfWeek === 0) {
      return { type: 'sunday_off', notes: 'Sunday (Weekly Facility Day Off)' };
    }

    // Default for past vs future
    if (dateStr < todayStr) {
      return { type: 'no_pickup' };
    }
    return { type: 'neutral' };
  };

  const selectedStatus = getDateStatus(selectedDateStr);
  const isPastDate = selectedDateStr < todayStr;
  const isToday = selectedDateStr === todayStr;
  const isSelectedSunday = new Date(selectedDateStr + 'T00:00:00').getDay() === 0;

  // Selected date's assignments
  const selectedAssignments = assignments.filter((a) => {
    if (a.duty_date !== selectedDateStr) return false;
    if (filterWarehouseId === 'all') return true;
    return String(a.warehouse_id) === String(filterWarehouseId);
  });

  // Emergency Sunday status
  const isEmergencySundayActive =
    isSelectedSunday &&
    (selectedStatus.type === 'scheduled' ||
      (selectedStatus.notes && selectedStatus.notes.includes('Emergency Sunday')) ||
      selectedAssignments.length > 0);

  // Filter warehouses to the 2 target warehouses
  const displayWarehouses =
    filterWarehouseId === 'all'
      ? warehouses
      : warehouses.filter((w) => String(w.id) === String(filterWarehouseId));

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Handlers
  const handleSetDayOutcome = async (newStatus) => {
    const whId = filterWarehouseId === 'all' ? null : filterWarehouseId;
    await onUpdateDailyStatus(whId, selectedDateStr, newStatus);
    showToast(`Marked facility outcome as "${newStatus.replace('_', ' ')}"`);
  };

  const handleQuickAutoSelect = async (warehouseId = null) => {
    await onGeneratePlan({
      duty_date: selectedDateStr,
      warehouse_id: warehouseId,
      dry_run: false,
    });
    showToast('Auto-selected fair overtime crew.');
  };

  const handleConfirmTodayClick = async () => {
    if (!onConfirmToday) return;
    try {
      setIsConfirmingToday(true);
      await onConfirmToday(selectedDateStr);
      showToast('Confirmed! Both employees are recorded as staying overtime today.');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsConfirmingToday(false);
    }
  };

  const handleSwapClick = async () => {
    if (!onSwapWarehouses) return;
    try {
      setIsSwapping(true);
      await onSwapWarehouses(selectedDateStr);
      showToast('Swapped assigned warehouses between the two workers.');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSwapping(false);
    }
  };

  const handleOpenAbsenceModal = (assignment) => {
    setReportingAssignment(assignment);
    setAbsenceReason('Called in sick / Fever');
    setCustomReason('');
  };

  const handleConfirmAbsence = async (e) => {
    e.preventDefault();
    if (!reportingAssignment) return;
    setIsSubmittingAbsence(true);
    try {
      const finalReason = customReason.trim() || absenceReason;
      await onReportAbsence(reportingAssignment.id, finalReason);
      setReportingAssignment(null);
      showToast('Marked absent & fair replacement assigned immediately.');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmittingAbsence(false);
    }
  };

  // Backfill Modal Handlers
  const handleOpenBackfillModal = (dateToUse = selectedDateStr) => {
    setBackfillDate(dateToUse);
    setBackfillWhId(warehouses[0]?.id || '2');
    const firstActive = employees.find((e) => e.active);
    setBackfillEmpId(firstActive ? firstActive.id : '');
    setIsBackfillModalOpen(true);
  };

  const handleConfirmBackfill = async (e) => {
    e.preventDefault();
    if (!backfillEmpId || !backfillWhId || !backfillDate) return;
    setIsSubmittingBackfill(true);
    try {
      await onLogHistoricalPickup({
        employee_id: backfillEmpId,
        warehouse_id: backfillWhId,
        duty_date: backfillDate,
      });
      setIsBackfillModalOpen(false);
      showToast(`Logged historical pickup for ${backfillDate}!`);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmittingBackfill(false);
    }
  };

  const handleDeleteHistoricalRecord = async (assignmentId) => {
    if (!window.confirm('Delete this historical pickup record?')) return;
    try {
      await onDeleteHistoricalPickup(assignmentId);
      showToast('Historical pickup record removed.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleSundayEmergency = async (enabled) => {
    if (!onToggleEmergencySunday) return;
    try {
      await onToggleEmergencySunday(selectedDateStr, enabled);
      showToast(
        enabled
          ? 'Emergency Sunday pickup activated for this date!'
          : 'Sunday reset to standard closed day off.'
      );
    } catch (err) {
      alert(err.message);
    }
  };

  // Compute active today crew for the command banner
  const activeTodayWorkers = selectedAssignments.filter((a) => a.status !== 'absent');
  const allTodayConfirmed =
    activeTodayWorkers.length >= 2 &&
    activeTodayWorkers.every((a) => a.status === 'completed');

  // Check if both workers are from the same warehouse
  const bothSameHome =
    activeTodayWorkers.length >= 2 &&
    activeTodayWorkers[0].home_warehouse_name &&
    activeTodayWorkers[0].home_warehouse_name === activeTodayWorkers[1].home_warehouse_name;

  return (
    <div className="dashboard-split-layout">
      {/* =========================================================================
          LEFT SIDE: AESTHETIC ATTENDANCE CALENDAR (MATCHING USER SCREENSHOT)
          ========================================================================= */}
      <div className="calendar-left-col">
        <div className="card app-calendar-card">
          {/* Header Bar */}
          <div className="attendance-header-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h2 className="attendance-app-title">Calendar</h2>
              <select
                className="form-select attendance-wh-filter"
                value={filterWarehouseId}
                onChange={(e) => setFilterWarehouseId(e.target.value)}
              >
                <option value="all">Both Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="segmented-view-toggle">
              <button
                className={`segmented-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                onClick={() => setViewMode('calendar')}
                title="Calendar Grid View"
              >
                <CalendarIcon size={17} />
              </button>
              <button
                className={`segmented-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="Monthly List View"
              >
                <List size={17} />
              </button>
            </div>
          </div>

          {/* Month Navigation */}
          <div className="attendance-month-nav">
            <button className="nav-arrow-btn" onClick={prevMonth} title="Previous month">
              <ChevronLeft size={20} color="var(--accent-blue)" />
            </button>

            <div style={{ textAlign: 'center' }}>
              <h3 className="month-heading">
                {monthNames[month]} {year}
              </h3>
              {!isToday && (
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ marginTop: '0.2rem', padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                  onClick={goToToday}
                >
                  Jump to Today
                </button>
              )}
            </div>

            <button className="nav-arrow-btn" onClick={nextMonth} title="Next month">
              <ChevronRight size={20} color="var(--accent-blue)" />
            </button>
          </div>

          {viewMode === 'calendar' ? (
            <div className="attendance-calendar-container">
              {/* Weekdays */}
              <div className="attendance-weekdays-row">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="attendance-weekday-label">
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Boxes Grid */}
              <div className="attendance-days-grid">
                {calendarCells.map((cell, idx) => {
                  const statusInfo = getDateStatus(cell.dateStr);
                  const isSelected = cell.dateStr === selectedDateStr;

                  let cellClass = 'day-box';
                  if (!cell.isCurrentMonth) cellClass += ' day-other-month';

                  if (statusInfo.type === 'overtime_stay') {
                    cellClass += ' day-status-overtime';
                  } else if (statusInfo.type === 'before_7pm') {
                    cellClass += ' day-status-before7pm';
                  } else if (statusInfo.type === 'holiday') {
                    cellClass += ' day-status-holiday';
                  } else if (statusInfo.type === 'no_pickup') {
                    cellClass += ' day-status-nopickup';
                  } else if (statusInfo.type === 'sunday_off') {
                    cellClass += ' day-status-sunday';
                  } else if (statusInfo.type === 'scheduled') {
                    cellClass += ' day-status-scheduled';
                  } else {
                    cellClass += ' day-status-neutral';
                  }

                  if (cell.isToday) cellClass += ' day-is-today';
                  if (isSelected) cellClass += ' day-is-selected';

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={cellClass}
                      onClick={() => setSelectedDateStr(cell.dateStr)}
                      title={`${cell.dateStr}: ${statusInfo.type.replace('_', ' ')}`}
                    >
                      <span className="day-number">{cell.dayNum}</span>
                    </button>
                  );
                })}
              </div>

              {/* Attendance Legend Bar */}
              <div className="attendance-legend-bar">
                <div className="legend-item">
                  <span className="legend-ring-today"></span>
                  <span className="legend-text">Today</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-overtime"></span>
                  <span className="legend-text">Overtime Stay</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-before7pm"></span>
                  <span className="legend-text">Done Before 7pm</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-nopickup"></span>
                  <span className="legend-text">No Pickup</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-holiday"></span>
                  <span className="legend-text">Holiday (Closed)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-sunday"></span>
                  <span className="legend-text">Sunday Off</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-scheduled"></span>
                  <span className="legend-text">Scheduled</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="attendance-list-container">
              {calendarCells
                .filter((c) => c.isCurrentMonth)
                .map((cell) => {
                  const statusInfo = getDateStatus(cell.dateStr);
                  const isSelected = cell.dateStr === selectedDateStr;

                  return (
                    <div
                      key={cell.dateStr}
                      className={`list-day-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedDateStr(cell.dateStr)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className={`list-day-badge ${statusInfo.type}`}>
                          {cell.dayNum}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                            {new Date(cell.dateStr + 'T00:00:00').toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {statusInfo.notes || (cell.dateStr === todayStr ? "Today's Dispatch" : 'Daily Record')}
                          </div>
                        </div>
                      </div>

                      <div>
                        {statusInfo.type === 'overtime_stay' && (
                          <span className="badge badge-status-completed">Overtime Stay</span>
                        )}
                        {statusInfo.type === 'before_7pm' && (
                          <span className="badge badge-mid">Before 7pm (No OT)</span>
                        )}
                        {statusInfo.type === 'holiday' && (
                          <span className="badge badge-senior">Holiday (Closed)</span>
                        )}
                        {statusInfo.type === 'sunday_off' && (
                          <span className="badge" style={{ background: 'var(--bg-surface-elevated)' }}>
                            Sunday Off
                          </span>
                        )}
                        {statusInfo.type === 'no_pickup' && (
                          <span className="badge badge-status-absent">No Pickup</span>
                        )}
                        {statusInfo.type === 'scheduled' && (
                          <span className="badge badge-status-scheduled">Scheduled</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          RIGHT SIDE: TODAY'S DISPATCH & SELECTED DAY INSPECTOR
          ========================================================================= */}
      <div className="inspector-right-col">
        <div className="card day-details-card" style={{ height: '100%' }}>
          {/* Day Header */}
          <div className="card-header" style={{ marginBottom: '1rem', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  {isToday ? "Today's Pickup Command" : isPastDate ? 'Historical Overtime Log' : 'Upcoming Duty Plan'}
                </span>
                {isToday && (
                  <span className="badge badge-status-scheduled" style={{ fontSize: '0.7rem' }}>
                    TODAY
                  </span>
                )}
                {isSelectedSunday && (
                  <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--bg-surface-elevated)' }}>
                    SUNDAY
                  </span>
                )}
              </div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.2rem', letterSpacing: '-0.02em' }}>
                {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {isPastDate && (
                <button
                  type="button"
                  className="btn-backfill"
                  onClick={() => handleOpenBackfillModal(selectedDateStr)}
                  title="Manually log people who did pickup on this past day before the app was installed"
                >
                  <Plus size={14} /> Log Past Pickup
                </button>
              )}
              <span className="badge badge-mid">{selectedDateStr}</span>
            </div>
          </div>

          {/* Quick Outcome Toggles */}
          <div className="outcome-selector-box" style={{ marginBottom: '1.25rem' }}>
            <span className="outcome-label">Facility Pickup Outcome:</span>
            <div className="outcome-buttons-group">
              <button
                type="button"
                className={`outcome-btn btn-overtime ${selectedStatus.type === 'overtime_stay' ? 'active' : ''}`}
                onClick={() => handleSetDayOutcome('overtime_stay')}
                title="Truck arrived after hours; 1 person stayed overtime"
              >
                <CheckCircle2 size={14} /> Overtime Stay
              </button>
              <button
                type="button"
                className={`outcome-btn btn-before7pm ${selectedStatus.type === 'before_7pm' ? 'active' : ''}`}
                onClick={() => handleSetDayOutcome('before_7pm')}
                title="Done during regular hours before 7pm; no overtime needed"
              >
                <Clock size={14} /> Before 7pm (No OT)
              </button>
              <button
                type="button"
                className={`outcome-btn btn-nopickup ${selectedStatus.type === 'no_pickup' ? 'active' : ''}`}
                onClick={() => handleSetDayOutcome('no_pickup')}
                title="No delivery arrived; no pickup done"
              >
                <XCircle size={14} /> No Pickup Done
              </button>
              <button
                type="button"
                className={`outcome-btn btn-holiday ${selectedStatus.type === 'holiday' ? 'active' : ''}`}
                onClick={() => handleSetDayOutcome('holiday')}
                title="Entire warehouse was closed for holiday"
              >
                <Coffee size={14} /> Warehouse Holiday
              </button>
            </div>
          </div>

          {/* =========================================================================
              SUNDAY RULE & EMERGENCY CASE OVERRIDE
              ========================================================================= */}
          {isSelectedSunday && !isEmergencySundayActive && (
            <div className="sunday-emergency-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Coffee size={22} color="var(--accent-amber)" />
                <div>
                  <strong style={{ fontSize: '0.98rem' }}>Sunday — Standard Facility Day Off</strong>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                    Deliveries and overtime pickups are generally not scheduled on Sundays.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn-emergency"
                onClick={() => handleToggleSundayEmergency(true)}
                title="Activate emergency overtime dispatch for this Sunday"
              >
                <AlertCircle size={15} /> Enable Emergency Sunday Pickup
              </button>
            </div>
          )}

          {isSelectedSunday && isEmergencySundayActive && (
            <div className="alert-box alert-warning" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <AlertTriangle size={20} color="var(--accent-amber)" />
                <div>
                  <strong>Emergency Sunday Pickup Activated:</strong>
                  <p style={{ fontSize: '0.82rem', margin: 0 }}>
                    Emergency pickup is active for this Sunday. Both warehouses can be staffed as needed.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleToggleSundayEmergency(false)}
                title="Deactivate emergency and reset Sunday to standard off day"
              >
                Reset to Sunday Off
              </button>
            </div>
          )}

          {/* If marked as Warehouse Holiday */}
          {selectedStatus.type === 'holiday' && (
            <div className="alert-box alert-info">
              <Coffee size={18} color="var(--accent-purple)" />
              <div>
                <strong>Warehouse Holiday (Facility Closed):</strong>
                <p style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                  The entire warehouse was closed for holiday on this date. No pickups were scheduled or required.
                </p>
              </div>
            </div>
          )}

          {/* If marked as Done Before 7pm */}
          {selectedStatus.type === 'before_7pm' && (
            <div className="alert-box alert-info">
              <Clock size={18} color="var(--accent-blue)" />
              <div>
                <strong>Truck Unloaded Before 7 PM:</strong>
                <p style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                  Delivery was handled during regular hours before 7pm. No employee needed to stay overtime.
                </p>
              </div>
            </div>
          )}

          {/* If marked as No Pickup Done */}
          {selectedStatus.type === 'no_pickup' && (
            <div className="alert-box alert-warning">
              <XCircle size={18} color="var(--accent-amber)" />
              <div>
                <strong>No Pickup Done:</strong>
                <p style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                  No delivery truck arrived on this date.
                </p>
              </div>
            </div>
          )}

          {/* =========================================================================
              TODAY'S SPECIAL DISPATCH COMMAND CARD (CONFIRMATION & SWAP ACTIONS)
              ========================================================================= */}
          {isToday && (!isSelectedSunday || isEmergencySundayActive) && (
            <div className="today-action-card">
              <div className="today-action-header">
                <div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles size={18} color="var(--accent-blue)" />
                    Today's Overtime Crew (1 Old + 1 New)
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem', marginBottom: 0 }}>
                    Employees from either warehouse can stay at any location. Both can be from the same warehouse.
                  </p>
                  {bothSameHome && (
                    <div style={{ marginTop: '0.4rem' }}>
                      <span className="cross-cover-badge">
                        Notice: Both workers are based at {activeTodayWorkers[0].home_warehouse_name} (cross-covering is active)
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {/* Swap Button if 2 active workers exist */}
                  {activeTodayWorkers.length >= 2 && (
                    <button
                      type="button"
                      className="swap-btn"
                      onClick={handleSwapClick}
                      disabled={isSwapping}
                      title="Swap assigned warehouse locations between the two workers"
                    >
                      <ArrowLeftRight size={15} />
                      {isSwapping ? 'Swapping...' : 'Swap Locations'}
                    </button>
                  )}

                  {/* Prominent Confirm Button */}
                  {allTodayConfirmed ? (
                    <div className="today-confirmed-badge">
                      <CheckCircle2 size={16} /> Both Confirmed Staying Overtime
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="today-confirm-btn"
                      onClick={handleConfirmTodayClick}
                      disabled={isConfirmingToday || activeTodayWorkers.length === 0}
                      title="Confirm that these two employees will stay overtime today"
                    >
                      <CheckCircle2 size={18} />
                      {isConfirmingToday ? 'Locking in...' : 'Confirm Those 2 Will Stay Today'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              PAST DAYS: CLEAN FACT VIEW WITH MANUAL BACKFILL ENTRIES
              ========================================================================= */}
          {isPastDate ? (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Recorded Overtime Pickups on This Date:
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleOpenBackfillModal(selectedDateStr)}
                  style={{ fontSize: '0.78rem' }}
                >
                  <Plus size={13} /> Add Past Record
                </button>
              </div>

              {selectedAssignments.filter((a) => a.status === 'completed').length > 0 ? (
                <div className="past-records-container">
                  {selectedAssignments
                    .filter((a) => a.status === 'completed')
                    .map((a) => (
                      <div key={a.id} className="past-record-item">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.98rem' }}>{a.employee_name}</span>
                            <span
                              className={`badge ${
                                a.experience === 'Senior'
                                  ? 'badge-senior'
                                  : a.experience === 'Mid'
                                  ? 'badge-mid'
                                  : 'badge-junior'
                              }`}
                            >
                              {a.experience}
                            </span>
                            <span className="badge badge-status-completed">
                              <CheckCircle2 size={12} /> Stayed Overtime
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Duty at: <strong>{a.warehouse_name}</strong> · Home Base: {a.home_warehouse_name || 'Standard'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--accent-red)', padding: '0.35rem 0.6rem' }}
                          onClick={() => handleDeleteHistoricalRecord(a.id)}
                          title="Remove this historical record"
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '1.75rem 1rem',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-color)',
                  }}
                >
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '0.85rem' }}>
                    No overtime pickups were logged for this date.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleOpenBackfillModal(selectedDateStr)}
                  >
                    <Plus size={14} /> Record Who Did Pickup on This Date
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* =========================================================================
                TODAY OR FUTURE: WAREHOUSE STAFFING CARDS
                ========================================================================= */
            (!isSelectedSunday || isEmergencySundayActive) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {displayWarehouses.map((warehouse) => {
                  const whAssignments = selectedAssignments.filter(
                    (a) => String(a.warehouse_id) === String(warehouse.id)
                  );

                  return (
                    <div
                      key={warehouse.id}
                      style={{
                        backgroundColor: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.15rem',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {/* Warehouse Header */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.85rem',
                          borderBottom: '1px solid var(--border-color)',
                          paddingBottom: '0.5rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Building2 size={17} color="var(--accent-blue)" />
                          <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{warehouse.name}</span>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Need: <strong>1 worker</strong> (standard)
                        </div>
                      </div>

                      {/* Workers Assigned / Scheduled */}
                      <div>
                        {whAssignments.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '0.75rem' }}>
                              No pickup worker selected yet for {warehouse.name}.
                            </p>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleQuickAutoSelect(warehouse.id)}
                            >
                              <Sparkles size={14} /> Auto-Select Today's Overtime Worker
                            </button>
                          </div>
                        ) : (
                          whAssignments.map((a) => {
                            const isStayed = a.status === 'completed';
                            const isAbsent = a.status === 'absent';
                            const isScheduled = a.status === 'scheduled';
                            const isCrossCover =
                              a.home_warehouse_id &&
                              String(a.home_warehouse_id) !== String(warehouse.id);

                            return (
                              <div
                                key={a.id}
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '0.85rem',
                                  border: '1px solid var(--border-color)',
                                  marginBottom: '0.65rem',
                                }}
                              >
                                {/* Worker Profile Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  <div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                                      {a.employee_name}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem', alignItems: 'center' }}>
                                      <span
                                        className={`badge ${
                                          a.experience === 'Senior'
                                            ? 'badge-senior'
                                            : a.experience === 'Mid'
                                            ? 'badge-mid'
                                            : 'badge-junior'
                                        }`}
                                      >
                                        {a.experience}
                                      </span>
                                      <span className="badge" style={{ background: 'var(--bg-surface-elevated)' }}>
                                        Skill: {a.skill}/5
                                      </span>
                                      {isCrossCover ? (
                                        <span className="cross-cover-badge" title="Employee is based at another warehouse and covering duty here">
                                          Covering from: {a.home_warehouse_name}
                                        </span>
                                      ) : (
                                        <span className="badge" style={{ background: 'var(--bg-surface-elevated)' }}>
                                          Home: {a.home_warehouse_name || warehouse.name}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    {isStayed && (
                                      <span className="badge badge-status-completed">
                                        <CheckCircle2 size={12} /> Stayed Overtime
                                      </span>
                                    )}
                                    {isAbsent && (
                                      <span className="badge badge-status-absent">
                                        <XCircle size={12} /> Absent Today
                                      </span>
                                    )}
                                    {isScheduled && (
                                      <span className="badge badge-status-scheduled">
                                        <Clock size={12} /> Assigned for Today
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Deterministic Logic Explanation */}
                                <div
                                  style={{
                                    fontSize: '0.78rem',
                                    color: 'var(--accent-blue)',
                                    marginTop: '0.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    backgroundColor: 'rgba(56, 189, 248, 0.08)',
                                    padding: '0.3rem 0.5rem',
                                    borderRadius: '4px',
                                  }}
                                >
                                  <Info size={12} />
                                  <span>Deterministic fair selection: next in rotation with lowest prior completed turns</span>
                                </div>

                                {isAbsent && (
                                  <div
                                    style={{
                                      fontSize: '0.78rem',
                                      color: '#fca5a5',
                                      marginTop: '0.4rem',
                                      padding: '0.3rem 0.5rem',
                                      backgroundColor: 'var(--badge-absent-bg)',
                                      borderRadius: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.3rem',
                                    }}
                                  >
                                    <AlertTriangle size={12} />
                                    <span>Priority queued for makeup duty on their next present day!</span>
                                  </div>
                                )}

                                {/* Actions for Today */}
                                {!isAbsent && (
                                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                    {!isStayed && (
                                      <button
                                        className="btn btn-success btn-sm"
                                        style={{ flex: 1 }}
                                        onClick={() => onUpdateStatus(a.id, 'completed')}
                                      >
                                        <UserCheck size={14} /> Confirm Stayed
                                      </button>
                                    )}

                                    {/* Mark Absent / Sick with instant replacement */}
                                    <button
                                      className="btn btn-danger btn-sm"
                                      style={{ flex: 1 }}
                                      onClick={() => handleOpenAbsenceModal(a)}
                                      title="Employee is absent today. Click to log sick/custom reason and auto-select replacement!"
                                    >
                                      <UserX size={14} /> Mark Absent / Sick
                                    </button>

                                    {isStayed && (
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => onUpdateStatus(a.id, 'scheduled')}
                                      >
                                        Revert
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* One-Click Today Sync */}
          {isToday && (!isSelectedSunday || isEmergencySundayActive) && (
            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.65rem 1rem', fontSize: '0.92rem' }}
                onClick={() => handleQuickAutoSelect(null)}
              >
                <Sparkles size={16} /> Auto-Generate Fair Pickup Crew for Both Warehouses
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          SAME-PAGE MODAL: MARK ABSENT / SICK & AUTO-SELECT REPLACEMENT
          ========================================================================= */}
      {reportingAssignment && (
        <div className="modal-overlay" onClick={() => setReportingAssignment(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserX size={20} color="var(--accent-red)" />
                Mark Employee Absent Today
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setReportingAssignment(null)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              <strong>{reportingAssignment.employee_name}</strong> will be marked absent for today.
              Rule 3 will queue priority for them on their next present day, and the algorithm will
              immediately select the next fair candidate to replace them today.
            </p>

            <form onSubmit={handleConfirmAbsence}>
              <div className="form-group">
                <label className="form-label">Select Absence Reason:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {[
                    'Called in sick / Fever',
                    'Family emergency',
                    'Transportation issue',
                    'Personal leave / Unplanned off',
                  ].map((r) => (
                    <label
                      key={r}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '6px',
                        backgroundColor: absenceReason === r ? 'var(--bg-surface-elevated)' : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        name="absenceReason"
                        checked={absenceReason === r}
                        onChange={() => {
                          setAbsenceReason(r);
                          setCustomReason('');
                        }}
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Or Enter Custom Reason:</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Doctor appointment, emergency shift cover"
                  value={customReason}
                  onChange={(e) => {
                    setCustomReason(e.target.value);
                    setAbsenceReason('');
                  }}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReportingAssignment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={isSubmittingAbsence}
                >
                  {isSubmittingAbsence ? 'Reassigning...' : 'Mark Absent & Auto-Reassign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MANUAL HISTORICAL BACKFILL MODAL (USER REQUEST)
          ========================================================================= */}
      {isBackfillModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBackfillModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={20} color="var(--accent-blue)" />
                Log Past Pickup (Historical Backfill)
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsBackfillModalOpen(false)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Record who stayed overtime for pickups prior to this app's launch. This feeds historical fairness data into the algorithm so future rotations start accurately.
            </p>

            <form onSubmit={handleConfirmBackfill}>
              <div className="form-group">
                <label className="form-label">Date of Pickup:</label>
                <input
                  type="date"
                  className="form-input"
                  value={backfillDate}
                  max={todayStr}
                  onChange={(e) => setBackfillDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Warehouse Where Duty Was Done:</label>
                <select
                  className="form-select"
                  value={backfillWhId}
                  onChange={(e) => setBackfillWhId(e.target.value)}
                  required
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Employee Who Stayed Overtime:</label>
                <select
                  className="form-select"
                  value={backfillEmpId}
                  onChange={(e) => setBackfillEmpId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    -- Select Employee --
                  </option>
                  {employees
                    .filter((e) => e.active)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.experience} · Skill {e.skill}/5)
                      </option>
                    ))}
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsBackfillModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingBackfill || !backfillEmpId}
                >
                  {isSubmittingBackfill ? 'Saving Record...' : 'Save Historical Pickup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="toast-banner">
          <CheckCircle2 size={18} color="var(--accent-green)" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
