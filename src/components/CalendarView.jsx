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
  Users,
  Building2,
  Coffee,
  Sparkles,
  ArrowLeftRight,
  Info,
  Plus,
  Trash2,
  AlertCircle,
  Key,
  RotateCw,
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
  onAssignSuperSenior,
  onSwapWarehouses,
  onLogHistoricalPickup,
  onDeleteHistoricalPickup,
  onToggleEmergencySunday,
  onGeneratePlan,
}) {
  const todayStr = '2026-09-16'; // Anchor date
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 8, 16)); // September 2026
  const [selectedDateStr, setSelectedDateStr] = useState('2026-09-16');
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'

  // Super Senior Modal State (Emergency Big Shipments)
  const [isSuperSeniorModalOpen, setIsSuperSeniorModalOpen] = useState(false);
  const [superSeniorId, setSuperSeniorId] = useState('');
  const [superSeniorCrewMode, setSuperSeniorCrewMode] = useState('with_2');
  const [isSubmittingSuperSenior, setIsSubmittingSuperSenior] = useState(false);

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
  const [seniorRiskAcknowledged, setSeniorRiskAcknowledged] = useState(false);
  const [mobileTab, setMobileTab] = useState('today'); // 'today' | 'calendar'
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
    const log = dailyLogs.find((l) => l.duty_date === dateStr);

    if (log) {
      return { type: log.status, notes: log.notes };
    }

    // 2. Check assignments
    const dayAssignments = assignments.filter((a) => a.duty_date === dateStr);

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

  // Helper: check if a Super Senior is on duty for this date
  const hasSuperSeniorOnDate = (dateStr) => {
    return assignments.some(
      (a) => a.duty_date === dateStr && a.status !== 'absent' && a.experience === 'Super Senior'
    );
  };

  const selectedStatus = getDateStatus(selectedDateStr);
  const isPastDate = selectedDateStr < todayStr;
  const isToday = selectedDateStr === todayStr;
  const isSelectedSunday = new Date(selectedDateStr + 'T00:00:00').getDay() === 0;

  // Selected date's assignments (single warehouse)
  const selectedAssignments = assignments.filter((a) => a.duty_date === selectedDateStr);
  const activeSelectedWorkers = selectedAssignments.filter((a) => a.status !== 'absent');
  const hasAbsentWorker = selectedAssignments.some((a) => a.status === 'absent');
  const allTodayConfirmed =
    activeSelectedWorkers.length >= 2 &&
    activeSelectedWorkers.every((a) => a.status === 'completed');

  const keyHolderNames = activeSelectedWorkers
    .filter((a) => {
      if (a.can_hold_key) return true;
      const emp = employees.find((e) => String(e.id) === String(a.employee_id));
      return Boolean(emp?.can_hold_key);
    })
    .map((a) => a.employee_name);
  const hasKeyHolderCoverage = keyHolderNames.length > 0;

  // Emergency Sunday status
  const isEmergencySundayActive =
    isSelectedSunday &&
    (selectedStatus.type === 'scheduled' ||
      (selectedStatus.notes && selectedStatus.notes.includes('Emergency Sunday')) ||
      selectedAssignments.length > 0);

  // Single active warehouse reference
  const activeWarehouse =
    warehouses.find((w) => w.name === 'Main Warehouse' || w.active) ||
    warehouses[0] || { id: '1', name: 'Main Warehouse' };

  const superSeniorList = employees.filter((e) => e.experience === 'Super Senior' && e.active);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Handlers
  const handleSetDayOutcome = async (newStatus) => {
    await onUpdateDailyStatus(activeWarehouse.id, selectedDateStr, newStatus);
    showToast(`Marked facility outcome as "${newStatus.replace('_', ' ')}"`);
  };

  const handleQuickAutoSelect = async () => {
    await onGeneratePlan({
      duty_date: selectedDateStr,
      warehouse_id: activeWarehouse.id,
      dry_run: false,
    });
    showToast('Auto-selected fair overtime crew.');
  };

  const handleConfirmTodayClick = async (riskAcknowledged = false) => {
    if (!onConfirmToday) return;
    try {
      setIsConfirmingToday(true);
      await onConfirmToday(selectedDateStr, riskAcknowledged);
      showToast('Confirmed! Both employees are recorded as staying overtime today.');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsConfirmingToday(false);
    }
  };

  const handleOpenSuperSeniorModal = (dateStr = selectedDateStr) => {
    setSelectedDateStr(dateStr);
    const existingSs = assignments.find(
      (a) => a.duty_date === dateStr && a.status !== 'absent' && a.experience === 'Super Senior'
    );
    if (existingSs) {
      setSuperSeniorId(String(existingSs.employee_id));
    } else if (superSeniorList.length > 0) {
      setSuperSeniorId(String(superSeniorList[0].id));
    } else {
      setSuperSeniorId('');
    }
    setSuperSeniorCrewMode('with_2');
    setIsSuperSeniorModalOpen(true);
  };

  const handleConfirmSuperSenior = async (e) => {
    e.preventDefault();
    if (!onAssignSuperSenior) return;
    if (superSeniorCrewMode !== 'remove' && !superSeniorId) {
      alert('Please select an active Super Senior employee.');
      return;
    }
    try {
      setIsSubmittingSuperSenior(true);
      await onAssignSuperSenior({
        duty_date: selectedDateStr,
        super_senior_id: superSeniorId,
        crew_mode: superSeniorCrewMode,
      });
      setIsSuperSeniorModalOpen(false);
      showToast(
        superSeniorCrewMode === 'remove'
          ? 'Super Senior removed for this date.'
          : `Super Senior scheduled (${superSeniorCrewMode.replace('_', ' ')})!`
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmittingSuperSenior(false);
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

  return (
    <div className="calendar-view-container">
      {/* Mobile Top Segmented Mode Switcher (Visible on <= 768px only) */}
      <div className="mobile-calendar-mode-bar">
        <button
          type="button"
          className={`mobile-calendar-mode-btn ${mobileTab === 'today' ? 'active' : ''}`}
          onClick={() => {
            setMobileTab('today');
            setSelectedDateStr(todayStr);
          }}
        >
          <span className="legend-dot dot-overtime" style={{ animation: 'liveBeacon 1.8s infinite', width: '8px', height: '8px' }} />
          <span>⚡ Today's Dispatch</span>
        </button>

        <button
          type="button"
          className={`mobile-calendar-mode-btn ${mobileTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setMobileTab('calendar')}
        >
          <CalendarIcon size={15} />
          <span>📅 Month Calendar</span>
        </button>
      </div>

      <div className={`dashboard-split-layout ${mobileTab === 'today' ? 'mobile-mode-today' : 'mobile-mode-calendar'}`}>
        {/* =========================================================================
            LEFT SIDE: AESTHETIC ATTENDANCE CALENDAR (MATCHING USER SCREENSHOT)
            ========================================================================= */}
        <div className="calendar-left-col">
        <div className="card app-calendar-card">
          {/* Header Bar */}
          <div className="attendance-header-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h2 className="attendance-app-title">Calendar</h2>
              <span className="brand-badge" style={{ fontSize: '0.74rem' }}>
                Main Warehouse (2 OT Crew)
              </span>
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
                  const hasSuperSenior = hasSuperSeniorOnDate(cell.dateStr);

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
                      title={`${cell.dateStr}: ${statusInfo.type.replace('_', ' ')}${hasSuperSenior ? ' · 👑 Super Senior on duty' : ''}`}
                    >
                      <span className="day-number">{cell.dayNum}</span>
                      {hasSuperSenior && (
                        <span className="day-super-senior-crown" title="👑 Super Senior on duty (Emergency/Big Shipment)">
                          👑
                        </span>
                      )}
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
                  <span style={{ fontSize: '0.85rem' }}>👑</span>
                  <span className="legend-text">Super Senior</span>
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {hasSuperSeniorOnDate(cell.dateStr) && (
                          <span className="badge badge-super-senior" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            👑 Super Senior
                          </span>
                        )}
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
                <CheckCircle2 size={14} /> OverTime Stay
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
                <XCircle size={14} /> No Pickup
              </button>
              <button
                type="button"
                className={`outcome-btn btn-holiday ${selectedStatus.type === 'holiday' ? 'active' : ''}`}
                onClick={() => handleSetDayOutcome('holiday')}
                title="Entire warehouse was closed for holiday"
              >
                <Coffee size={14} /> Holiday
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
                    Emergency pickup is active for this Sunday. Staff can be scheduled for overtime pickup as needed.
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
                <strong>Facility Holiday (Closed):</strong>
                <p style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                  The facility was closed for holiday on this date. No pickups were scheduled or required.
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
                                a.experience === 'Super Senior'
                                  ? 'badge-super-senior'
                                  : a.experience === 'Senior'
                                  ? 'badge-senior'
                                  : a.experience === 'Mid'
                                  ? 'badge-mid'
                                  : 'badge-junior'
                              }`}
                            >
                              {a.experience === 'Super Senior' ? '👑 Super Senior' : a.experience}
                            </span>
                            <span className="badge badge-status-completed">
                              <CheckCircle2 size={12} /> Stayed Overtime
                            </span>
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
                TODAY OR FUTURE: OVERTIME STAFFING OR NON-OVERTIME CLEARING
                ========================================================================= */
            (selectedStatus.type === 'no_pickup' ||
              selectedStatus.type === 'before_7pm' ||
              selectedStatus.type === 'holiday' ||
              (selectedStatus.type === 'sunday_off' && !isEmergencySundayActive)) ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem 1rem',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-color)',
                  marginTop: '0.5rem',
                }}
              >
                <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: '0.35rem' }}>
                  No overtime stay required for this date (marked as <strong>{selectedStatus.type.replace('_', ' ')}</strong>).
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
                  Participant crew is cleared. To schedule overtime workers, select "Overtime Stay Required" above.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {/* Card Header with Small Generate / Rerun Rotation Button */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem',
                      borderBottom: '1px solid var(--border-color)',
                      paddingBottom: '0.65rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={18} color="var(--accent-blue)" />
                      <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Overtime Crew</span>
                      <span className="badge badge-mid" style={{ fontSize: '0.72rem' }}>
                        2 Workers Required
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {/* Small Generate / Rerun Rotation Button at Top */}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{
                          fontSize: '0.78rem',
                          padding: '0.28rem 0.65rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontWeight: 700,
                        }}
                        onClick={() => handleQuickAutoSelect()}
                        title={
                          hasAbsentWorker
                            ? 'Participant absent: click to rerun rotation and select fair replacement'
                            : selectedAssignments.length > 0
                            ? 'Rerun fair rotation algorithm'
                            : 'Auto-select fair overtime crew (2 workers)'
                        }
                      >
                        {hasAbsentWorker ? (
                          <>
                            <RotateCw size={13} /> <span>🔄 Rerun Rotation</span>
                          </>
                        ) : selectedAssignments.length > 0 ? (
                          <>
                            <RotateCw size={13} /> <span>🔄 Rerun</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={13} /> <span>Generate Crew</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenSuperSeniorModal(selectedDateStr)}
                        style={{
                          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.2))',
                          border: '1px solid rgba(245, 158, 11, 0.5)',
                          color: '#fbbf24',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          padding: '0.28rem 0.65rem',
                        }}
                        title="Dispatch on-call Super Senior for emergency big shipments"
                      >
                        👑 Super Senior
                      </button>
                    </div>
                  </div>

                  {/* Head Office Key Coverage Status Banner */}
                  {activeSelectedWorkers.length > 0 && (
                    <div
                      style={{
                        marginBottom: '0.9rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: hasKeyHolderCoverage
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'rgba(239, 68, 68, 0.12)',
                        border: `1px solid ${
                          hasKeyHolderCoverage ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.4)'
                        }`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        fontSize: '0.84rem',
                      }}
                    >
                      <Key
                        size={16}
                        color={hasKeyHolderCoverage ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)'}
                        style={{ flexShrink: 0 }}
                      />
                      {hasKeyHolderCoverage ? (
                        <div>
                          <strong>Head Office Key Covered:</strong>{' '}
                          <span style={{ color: 'var(--accent-green, #10b981)', fontWeight: 700 }}>
                            {keyHolderNames.join(', ')}
                          </span>{' '}
                          is authorized to deliver keys to Head Office.
                        </div>
                      ) : (
                        <div>
                          <strong style={{ color: 'var(--accent-red, #ef4444)' }}>
                            ⚠️ Missing Key Holder:
                          </strong>{' '}
                          Neither worker has key option. Senior supervisor must acknowledge personal key delivery risk below to confirm.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Workers Assigned / Scheduled */}
                  <div>
                    {selectedAssignments.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '0.85rem' }}>
                          No overtime workers selected yet for this date.
                        </p>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleQuickAutoSelect()}
                        >
                          <Sparkles size={14} /> Auto-Select Today's Overtime Crew (2 Workers)
                        </button>
                      </div>
                    ) : (
                      selectedAssignments.map((a) => {
                        const isStayed = a.status === 'completed';
                        const isAbsent = a.status === 'absent';
                        const isScheduled = a.status === 'scheduled';
                        const isSuperSenior = a.experience === 'Super Senior';
                        const empRecord = employees.find((e) => String(e.id) === String(a.employee_id));
                        const isKeyHolder = Boolean(a.can_hold_key || empRecord?.can_hold_key);

                        return (
                          <div
                            key={a.id}
                            style={{
                              backgroundColor: isSuperSenior ? 'rgba(245, 158, 11, 0.05)' : 'var(--bg-surface)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.95rem 1.1rem',
                              border: isSuperSenior ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color)',
                              marginBottom: '0.75rem',
                              boxShadow: isSuperSenior ? '0 0 12px rgba(245, 158, 11, 0.1)' : 'none',
                            }}
                          >
                            {/* Worker Profile Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div>
                                <div style={{ fontSize: '1.08rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                  {isSuperSenior && <span>👑</span>}
                                  <span>{a.employee_name}</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.3rem', alignItems: 'center' }}>
                                  {isSuperSenior ? (
                                    <span className="badge badge-super-senior">
                                      👑 Super Senior (On-Call)
                                    </span>
                                  ) : (
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
                                  )}
                                  <span className="badge" style={{ background: 'var(--bg-surface-elevated)' }}>
                                    Skill: {a.skill}/5
                                  </span>
                                  {isKeyHolder && (
                                    <span
                                      className="badge"
                                      style={{
                                        background: 'rgba(245, 158, 11, 0.15)',
                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                        color: '#f59e0b',
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        fontSize: '0.72rem',
                                      }}
                                    >
                                      <Key size={11} /> 🔑 Key Holder
                                    </span>
                                  )}
                                  {isSuperSenior && (
                                    <span className="badge badge-mid" style={{ fontSize: '0.72rem' }}>
                                      Big Shipment Crew
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
                                    <Clock size={12} /> Assigned for Shift
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Deterministic Logic Explanation */}
                            <div
                              style={{
                                fontSize: '0.78rem',
                                color: isSuperSenior ? 'var(--accent-amber)' : 'var(--accent-blue)',
                                marginTop: '0.55rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                backgroundColor: isSuperSenior ? 'rgba(245, 158, 11, 0.08)' : 'rgba(56, 189, 248, 0.08)',
                                padding: '0.35rem 0.55rem',
                                borderRadius: '4px',
                              }}
                            >
                              <Info size={12} />
                              <span>
                                {isSuperSenior
                                  ? 'Super Senior on-duty for emergency big shipment (excluded from regular algorithm)'
                                  : 'Deterministic fair rotation: lowest completed count, anti-consecutive rest & key coverage'}
                              </span>
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
                                <span>Priority queued for makeup duty on next present day. Click "🔄 Rerun Rotation" above to select replacement!</span>
                              </div>
                            )}

                            {/* Actions: ONLY Mark Absent / Unable (NO separate confirm stay button per employee) */}
                            {!isAbsent && (
                              <div style={{ marginTop: '0.75rem' }}>
                                {!isSuperSenior ? (
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    style={{ width: '100%', justifyContent: 'center', gap: '0.4rem' }}
                                    onClick={() => handleOpenAbsenceModal(a)}
                                    title="Employee is absent or unable today. Click to log reason and auto-select replacement!"
                                  >
                                    <UserX size={14} /> Mark Absent / Unable
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ width: '100%', justifyContent: 'center', gap: '0.4rem' }}
                                    onClick={() => handleOpenSuperSeniorModal(selectedDateStr)}
                                    title="Adjust crew mode or remove Super Senior"
                                  >
                                    👑 Adjust / Remove Super Senior
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Bottom: Confirm Those 2 Will Really Stay Today Button */}
                  {activeSelectedWorkers.length >= 2 && (
                    allTodayConfirmed ? (
                      <div
                        style={{
                          marginTop: '1.25rem',
                          padding: '0.85rem 1rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <CheckCircle2 size={18} color="#10b981" />
                        <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.92rem' }}>
                          ✓ Overtime stay confirmed for today! Both employees verified.
                        </span>
                      </div>
                    ) : (
                      <>
                        {/* Senior Risk Acknowledgment when no key holder is available */}
                        {!hasKeyHolderCoverage && (
                          <div
                            style={{
                              marginTop: '1rem',
                              padding: '0.85rem 1rem',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                              <AlertTriangle size={18} color="var(--accent-red)" style={{ marginTop: '2px', flexShrink: 0 }} />
                              <div style={{ fontSize: '0.84rem' }}>
                                <strong style={{ color: 'var(--accent-red)' }}>Senior Supervisor Key Delivery Liability:</strong>
                                <p style={{ margin: '0.35rem 0 0.6rem 0', color: 'var(--text-secondary)' }}>
                                  Neither selected employee has Head Office key submission authority. If you confirm this crew, you (Senior Supervisor) assume full personal responsibility to deliver the facility keys yourself if they fail to do so.
                                </p>
                                <label
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={seniorRiskAcknowledged}
                                    onChange={(e) => setSeniorRiskAcknowledged(e.target.checked)}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                  />
                                  <span>I accept personal responsibility to deliver keys to Head Office</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        )}

                        <div style={{ marginTop: '1rem' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={isConfirmingToday || (!hasKeyHolderCoverage && !seniorRiskAcknowledged)}
                            onClick={() => handleConfirmTodayClick(seniorRiskAcknowledged)}
                            style={{
                              width: '100%',
                              padding: '0.8rem 1.25rem',
                              fontSize: '0.95rem',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.6rem',
                              boxShadow: '0 4px 14px rgba(56, 189, 248, 0.25)',
                              opacity: (!hasKeyHolderCoverage && !seniorRiskAcknowledged) ? 0.6 : 1,
                              cursor: (!hasKeyHolderCoverage && !seniorRiskAcknowledged) ? 'not-allowed' : 'pointer',
                            }}
                            title={
                              !hasKeyHolderCoverage && !seniorRiskAcknowledged
                                ? 'Acknowledge key delivery liability above to confirm without a key holder'
                                : 'Confirm that these 2 employees will really stay overtime today'
                            }
                          >
                            <UserCheck size={18} />
                            <span>{isConfirmingToday ? 'Confirming Overtime Stay...' : '✓ Confirm Those 2 Will Really Stay Today'}</span>
                          </button>
                        </div>
                      </>
                    )
                  )}
                </div>
              </div>
            )
          )}

          {/* Mobile Switch Footer Button */}
          <div className="mobile-calendar-switch-footer">
            {mobileTab === 'today' ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', justifyContent: 'center', minHeight: '44px', gap: '0.5rem', marginTop: '1rem' }}
                onClick={() => setMobileTab('calendar')}
              >
                <CalendarIcon size={16} />
                <span>Switch to Month Calendar Grid</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', justifyContent: 'center', minHeight: '44px', gap: '0.5rem', marginTop: '1rem' }}
                onClick={() => {
                  setMobileTab('today');
                  setSelectedDateStr(todayStr);
                }}
              >
                <span className="legend-dot dot-overtime" style={{ width: '8px', height: '8px' }} />
                <span>Jump back to Today's Crew</span>
              </button>
            )}
          </div>
        </div>
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

      {/* =========================================================================
          EMERGENCY SUPER SENIOR MODAL (USER REQUEST)
          ========================================================================= */}
      {isSuperSeniorModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSuperSeniorModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24' }}>
                <span style={{ fontSize: '1.25rem' }}>👑</span>
                Emergency Super Senior Dispatch
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsSuperSeniorModalOpen(false)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Super Seniors are on-call leaders who only stay for emergency big shipments. The regular rotation algorithm never schedules them. They can stay <strong>alone</strong>, with <strong>1 worker</strong>, or with <strong>2 workers</strong>.
            </p>

            <form onSubmit={handleConfirmSuperSenior}>
              <div className="form-group">
                <label className="form-label">Duty Date:</label>
                <input
                  type="date"
                  className="form-input"
                  value={selectedDateStr}
                  onChange={(e) => setSelectedDateStr(e.target.value)}
                  required
                />
              </div>

              {superSeniorCrewMode !== 'remove' && (
                <div className="form-group">
                  <label className="form-label">Select On-Call Super Senior:</label>
                  {superSeniorList.length === 0 ? (
                    <div className="alert-box alert-warning" style={{ fontSize: '0.84rem' }}>
                      No active Super Senior configured yet. Please edit or add an employee with experience level <strong>Super Senior</strong> in the Staff / Employees roster first.
                    </div>
                  ) : (
                    <select
                      className="form-select"
                      value={superSeniorId}
                      onChange={(e) => setSuperSeniorId(e.target.value)}
                      required
                    >
                      {superSeniorList.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          👑 {emp.name} (Skill: {emp.skill}/5)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Select Crew Mode for This Big Shipment:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[
                    { mode: 'alone', title: '👑 Super Senior Stays ALONE', desc: '0 normal workers. Only the Super Senior stays for the shipment.' },
                    { mode: 'with_1', title: '👑 Super Senior + 1 Normal Worker', desc: '1 regular worker stays alongside the Super Senior.' },
                    { mode: 'with_2', title: '👑 Super Senior + 2 Normal Workers', desc: '2 regular workers stay alongside the Super Senior (Full crew of 3).' },
                    { mode: 'remove', title: '✕ Remove Super Senior', desc: 'Reset this date to normal 2 regular overtime workers.' },
                  ].map((option) => (
                    <label
                      key={option.mode}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.65rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: superSeniorCrewMode === option.mode ? 'rgba(245, 158, 11, 0.7)' : 'var(--border-color)',
                        backgroundColor: superSeniorCrewMode === option.mode ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-surface-elevated)',
                        cursor: 'pointer',
                        transition: 'all 0.18s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="superSeniorCrewMode"
                        value={option.mode}
                        checked={superSeniorCrewMode === option.mode}
                        onChange={() => setSuperSeniorCrewMode(option.mode)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: superSeniorCrewMode === option.mode ? '#fbbf24' : 'var(--text-primary)' }}>
                          {option.title}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {option.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsSuperSeniorModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingSuperSenior || (superSeniorCrewMode !== 'remove' && superSeniorList.length === 0)}
                  style={{
                    background: superSeniorCrewMode === 'remove'
                      ? 'var(--accent-red)'
                      : 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  {isSubmittingSuperSenior
                    ? 'Saving...'
                    : superSeniorCrewMode === 'remove'
                    ? 'Remove Super Senior'
                    : 'Confirm Super Senior Duty'}
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
