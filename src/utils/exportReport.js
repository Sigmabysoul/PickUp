import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function filterMonthData(month, assignments = [], dailyLogs = []) {
  const [yearStr, monthStr] = (month || '').split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const monthNum = parseInt(monthStr, 10) || new Date().getMonth() + 1;
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const monthAssignments = assignments
    .filter((a) => a.duty_date && a.duty_date.startsWith(month))
    .sort((a, b) => (a.duty_date < b.duty_date ? -1 : 1));

  const monthLogs = dailyLogs
    .filter((l) => l.duty_date && l.duty_date.startsWith(month))
    .sort((a, b) => (a.duty_date < b.duty_date ? -1 : 1));

  const logMap = new Map(monthLogs.map((l) => [l.duty_date, l]));
  const assignmentMap = new Map();
  for (const a of monthAssignments) {
    if (!assignmentMap.has(a.duty_date)) {
      assignmentMap.set(a.duty_date, []);
    }
    assignmentMap.get(a.duty_date).push(a);
  }

  const dailyRecords = [];
  let totalStays = 0;
  let before7pmDays = 0;
  let noPickupDays = 0;
  let sundaysOffDays = 0;
  let holidayDays = 0;

  // Track per-employee completed overtime stays (including super seniors)
  const perStaffStays = new Map();

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0');
    const dateStr = `${month}-${dayStr}`;
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayName = dayNames[dateObj.getDay()];
    const isSunday = dateObj.getDay() === 0;

    const dayAssigns = assignmentMap.get(dateStr) || [];
    const activeAssigns = dayAssigns.filter((a) => a.status !== 'absent');
    const normalWorkers = activeAssigns.filter((a) => a.experience !== 'Super Senior');
    const superSeniors = activeAssigns.filter((a) => a.experience === 'Super Senior');

    const log = logMap.get(dateStr);
    let outcome = 'no_pickup';

    if (log) {
      outcome = log.status;
    } else if (activeAssigns.length > 0) {
      outcome = 'overtime_stay';
    } else if (isSunday) {
      outcome = 'sunday_off';
    } else {
      outcome = 'no_pickup';
    }

    if (outcome === 'overtime_stay') totalStays++;
    else if (outcome === 'before_7pm') before7pmDays++;
    else if (outcome === 'no_pickup') noPickupDays++;
    else if (outcome === 'sunday_off') sundaysOffDays++;
    else if (outcome === 'holiday') holidayDays++;

    // Track per-employee stays for days that stayed overtime
    for (const a of activeAssigns) {
      if (a.status === 'completed' || outcome === 'overtime_stay') {
        const existing = perStaffStays.get(a.employee_name) || {
          count: 0,
          experience: a.experience || 'Worker',
        };
        existing.count += 1;
        perStaffStays.set(a.employee_name, existing);
      }
    }

    dailyRecords.push({
      date: dateStr,
      day: dayName,
      staff1: normalWorkers[0]?.employee_name || '-',
      staff2: normalWorkers[1]?.employee_name || '-',
      superSenior: superSeniors.map((s) => s.employee_name).join(', ') || '-',
      outcome: outcome.replace('_', ' ').toUpperCase(),
      notes: log?.notes || '',
    });
  }

  const staffBreakdown = Array.from(perStaffStays.entries())
    .map(([name, data]) => ({
      name,
      experience: data.experience,
      stays: data.count,
    }))
    .sort((a, b) => b.stays - a.stays);

  const completed = monthAssignments.filter((a) => a.status === 'completed');
  const scheduled = monthAssignments.filter((a) => a.status === 'scheduled');
  const absent = monthAssignments.filter((a) => a.status === 'absent');

  return {
    dailyRecords,
    monthAssignments,
    monthLogs,
    stats: {
      total: monthAssignments.length,
      completed: completed.length,
      scheduled: scheduled.length,
      absent: absent.length,
      uniqueEmployees: new Set(monthAssignments.map((a) => a.employee_name)).size,
    },
    summary: {
      totalStays,
      before7pmDays,
      noPickupDays,
      sundaysOffDays,
      noPickupPlusSundays: noPickupDays + sundaysOffDays,
      holidayDays,
      staffBreakdown,
    },
  };
}

export function exportToCSV({ month, assignments = [], warehouses = [], dailyLogs = [] }) {
  const { dailyRecords, summary, stats } = filterMonthData(month, assignments, dailyLogs);

  const rows = [
    ['PickUp Logistics - Monthly Overtime Duty Report', `Month: ${month}`],
    ['Generated At:', new Date().toLocaleString()],
    [],
    [
      'Duty Date',
      'Day',
      'Assigned Staff 1',
      'Assigned Staff 2',
      'Super Senior (Emergency)',
      'Facility Outcome / Status',
      'Notes',
    ],
  ];

  for (const r of dailyRecords) {
    rows.push([
      r.date,
      r.day,
      r.staff1,
      r.staff2,
      r.superSenior,
      r.outcome,
      r.notes,
    ]);
  }

  rows.push([]);
  rows.push(['--- MONTHLY SUMMARY STATISTICS ---']);
  rows.push(['Total Pickups Recorded', stats.total]);
  rows.push(['Completed Overtime Stays', stats.completed]);
  rows.push(['Scheduled Shifts', stats.scheduled]);
  rows.push(['Reported Absences', stats.absent]);
  rows.push(['Unique Staff Rostered', stats.uniqueEmployees]);
  rows.push(['Total Overtime Pickup Stays (Days)', summary.totalStays]);
  rows.push(['Total Days Pickup Happened Before 7 PM', summary.before7pmDays]);
  rows.push(['Total Days No Pickup Happened', summary.noPickupDays]);
  rows.push(['Total Sundays (Facility Off)', summary.sundaysOffDays]);
  rows.push(['Combined Days: No Pickup Happened + Sundays', summary.noPickupPlusSundays]);
  rows.push(['Total Facility Holidays (Closed)', summary.holidayDays]);
  rows.push([]);
  rows.push(['--- TOTAL NUMBER OF DAYS STAFF STAYED (PER EMPLOYEE + SUPER SENIOR) ---']);
  rows.push(['Employee Name', 'Rank / Experience', 'Total Overtime Stays (Days)']);

  if (summary.staffBreakdown.length > 0) {
    for (const s of summary.staffBreakdown) {
      rows.push([s.name, s.experience, s.stays]);
    }
  } else {
    rows.push(['No completed overtime stays logged for this month', '', 0]);
  }

  const csvContent =
    '\uFEFF' +
    rows
      .map((r) =>
        r
          .map((cell) => {
            const str = String(cell ?? '');
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `pickup-report-${month}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToPDF({ month, assignments = [], warehouses = [], dailyLogs = [] }) {
  const { dailyRecords, summary, stats } = filterMonthData(month, assignments, dailyLogs);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header Banner
  doc.setFillColor(14, 17, 24);
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('PickUp Logistics', 14, 15);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(56, 189, 248);
  doc.text('Monthly Overtime Pickup Duty Report', 14, 23);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.text(`Report Period: ${month}  ·  Generated: ${new Date().toLocaleDateString()}`, 14, 30);

  // Summary Metrics Cards (2 rows of 4 cards)
  const startY = 44;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);

  const metrics = [
    { label: 'Total Pickups', val: String(stats.total) },
    { label: 'Completed Stays', val: String(stats.completed) },
    { label: 'Scheduled', val: String(stats.scheduled) },
    { label: 'Absences', val: String(stats.absent) },
    { label: 'Total OT Stays', val: String(summary.totalStays) },
    { label: 'Before 7 PM', val: String(summary.before7pmDays) },
    { label: 'No Pickup+Sun', val: String(summary.noPickupPlusSundays) },
    { label: 'Holidays', val: String(summary.holidayDays) },
  ];

  metrics.forEach((m, idx) => {
    const x = 14 + (idx % 4) * 47;
    const y = startY + Math.floor(idx / 4) * 22;
    doc.roundedRect(x, y, 44, 18, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(m.label.toUpperCase(), x + 4, y + 6);

    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(m.val, x + 4, y + 14);
  });

  // Main Daily Roster Table
  const tableData = dailyRecords.map((r) => [
    r.date,
    r.day.slice(0, 3),
    r.staff1,
    r.staff2,
    r.superSenior,
    r.outcome,
  ]);

  autoTable(doc, {
    startY: startY + 48,
    head: [['Date', 'Day', 'Assigned Staff 1', 'Assigned Staff 2', 'Super Senior', 'Outcome']],
    body: tableData.length > 0 ? tableData : [['No pickup duties recorded in this month.', '', '', '', '', '']],
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      // Footer page numbers
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}  ·  PickUp Dispatcher`,
        14,
        doc.internal.pageSize.height - 8
      );
    },
  });

  // Staff Stays Breakdown Table (on next page or after main table)
  const staffData = summary.staffBreakdown.map((s) => [
    s.name,
    s.experience,
    `${s.stays} days`,
  ]);

  if (staffData.length > 0) {
    const finalY = doc.lastAutoTable.finalY + 10;
    const currentY = finalY > 240 ? 20 : finalY;
    if (finalY > 240) doc.addPage();

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Total Days Staff Stayed Overtime (Per Employee Breakdown):', 14, currentY);

    autoTable(doc, {
      startY: currentY + 4,
      head: [['Employee Name', 'Experience Level', 'Total Overtime Stays']],
      body: staffData,
      theme: 'grid',
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 8,
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}  ·  PickUp Dispatcher`,
          14,
          doc.internal.pageSize.height - 8
        );
      },
    });
  }

  doc.save(`pickup-report-${month}.pdf`);
}
