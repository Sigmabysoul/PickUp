import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function filterMonthData(month, assignments = [], dailyLogs = []) {
  const monthAssignments = assignments
    .filter((a) => a.duty_date && a.duty_date.startsWith(month))
    .sort((a, b) => (a.duty_date < b.duty_date ? -1 : 1));

  const monthLogs = dailyLogs
    .filter((l) => l.duty_date && l.duty_date.startsWith(month))
    .sort((a, b) => (a.duty_date < b.duty_date ? -1 : 1));

  const completed = monthAssignments.filter((a) => a.status === 'completed');
  const scheduled = monthAssignments.filter((a) => a.status === 'scheduled');
  const absent = monthAssignments.filter((a) => a.status === 'absent');

  return {
    monthAssignments,
    monthLogs,
    stats: {
      total: monthAssignments.length,
      completed: completed.length,
      scheduled: scheduled.length,
      absent: absent.length,
      uniqueEmployees: new Set(monthAssignments.map((a) => a.employee_name)).size,
    },
  };
}

export function exportToCSV({ month, assignments = [], warehouses = [], dailyLogs = [] }) {
  const { monthAssignments, monthLogs, stats } = filterMonthData(month, assignments, dailyLogs);
  const logMap = new Map(monthLogs.map((l) => [l.duty_date, l]));

  const rows = [
    ['PickUp Logistics - Overtime Pickup Duty Report', `Month: ${month}`],
    ['Generated At:', new Date().toLocaleString()],
    [],
    [
      'Duty Date',
      'Day',
      'Warehouse',
      'Assigned Employee',
      'Experience',
      'Skill',
      'Duty Status',
      'Facility Outcome',
      'Notes',
    ],
  ];

  for (const a of monthAssignments) {
    const d = new Date(a.duty_date + 'T00:00:00');
    const day = dayNames[d.getDay()] || '';
    const log = logMap.get(a.duty_date);

    rows.push([
      a.duty_date,
      day,
      a.warehouse_name || 'Warehouse',
      a.employee_name,
      a.experience,
      `${a.skill}/5`,
      a.status.toUpperCase(),
      log ? log.status.replace('_', ' ').toUpperCase() : 'STANDARD',
      log?.notes || '',
    ]);
  }

  rows.push([]);
  rows.push(['--- MONTHLY SUMMARY STATISTICS ---']);
  rows.push(['Total Pickups Recorded', stats.total]);
  rows.push(['Completed Overtime Stays', stats.completed]);
  rows.push(['Scheduled Shifts', stats.scheduled]);
  rows.push(['Reported Absences', stats.absent]);
  rows.push(['Unique Staff Rostered', stats.uniqueEmployees]);

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
  const { monthAssignments, monthLogs, stats } = filterMonthData(month, assignments, dailyLogs);
  const logMap = new Map(monthLogs.map((l) => [l.duty_date, l]));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header Banner
  doc.setFillColor(14, 17, 24); // Dark background header
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('PickUp Logistics', 14, 15);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(56, 189, 248);
  doc.text('Overtime Pickup Duty Monthly Report', 14, 23);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.text(`Report Period: ${month}  ·  Generated: ${new Date().toLocaleDateString()}`, 14, 30);

  // Summary Metrics Cards
  let startY = 44;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);

  const metrics = [
    { label: 'Total Pickups', val: String(stats.total) },
    { label: 'Completed Stays', val: String(stats.completed) },
    { label: 'Scheduled', val: String(stats.scheduled) },
    { label: 'Absences', val: String(stats.absent) },
  ];

  metrics.forEach((m, idx) => {
    const x = 14 + idx * 47;
    doc.roundedRect(x, startY, 44, 18, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(m.label.toUpperCase(), x + 4, startY + 6);

    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(m.val, x + 4, startY + 14);
  });

  // Main Table
  const tableData = monthAssignments.map((a) => {
    const d = new Date(a.duty_date + 'T00:00:00');
    const day = dayNames[d.getDay()] || '';
    const log = logMap.get(a.duty_date);

    return [
      a.duty_date,
      day,
      a.warehouse_name || 'Warehouse',
      a.employee_name,
      a.experience,
      `${a.skill}/5`,
      a.status.toUpperCase(),
      log ? log.status.replace('_', ' ').toUpperCase() : 'STANDARD',
    ];
  });

  autoTable(doc, {
    startY: startY + 24,
    head: [['Date', 'Day', 'Warehouse', 'Assigned Staff', 'Rank', 'Skill', 'Status', 'Facility Outcome']],
    body: tableData.length > 0 ? tableData : [['No pickup duties recorded in this month.', '', '', '', '', '', '', '']],
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
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

  doc.save(`pickup-report-${month}.pdf`);
}

