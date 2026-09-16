import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Sparkles,
  Users,
  Building2,
  BarChart3,
  Truck,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import CalendarView from './components/CalendarView.jsx';
import PlanGenerator from './components/PlanGenerator.jsx';
import EmployeeManager from './components/EmployeeManager.jsx';
import WarehouseManager from './components/WarehouseManager.jsx';
import FairnessAnalytics from './components/FairnessAnalytics.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('calendar');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Theme Management: Defaults to dark (prioritizing true blacks), with full light mode
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('pickup_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pickup_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // App Data
  const [data, setData] = useState({
    warehouses: [],
    employees: [],
    absences: [],
    assignments: [],
    dailyRequirements: [],
    runs: [],
  });

  // Generator prefill
  const [generatorDate, setGeneratorDate] = useState(null);
  const [generatorWarehouseId, setGeneratorWarehouseId] = useState(null);

  const fetchBootstrapData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error(`Bootstrap failed: ${res.statusText}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBootstrapData();
  }, []);

  // Handlers
  const handleUpdateAssignmentStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to update assignment status');
      }
      await fetchBootstrapData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenPlanGenerator = (date, whId = null) => {
    setGeneratorDate(date);
    setGeneratorWarehouseId(whId);
    setActiveTab('generator');
  };

  const handleUpdateDailyStatus = async (warehouse_id, duty_date, status, notes = '') => {
    try {
      const res = await fetch('/api/daily-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse_id, duty_date, status, notes }),
      });
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error || 'Failed to update daily status');
      }
      await fetchBootstrapData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveRequirement = async (warehouse_id, duty_date, worker_count) => {
    await fetch('/api/requirements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouse_id, duty_date, worker_count }),
    });
  };

  const handleReportAbsence = async (assignment_id, reason) => {
    const res = await fetch('/api/assignments/report-absence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignment_id, reason }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to report absence');
    await fetchBootstrapData();
    return json;
  };

  const handleConfirmToday = async (duty_date) => {
    const res = await fetch('/api/assignments/confirm-today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to confirm today');
    await fetchBootstrapData();
    return json;
  };

  const handleSwapWarehouses = async (duty_date) => {
    const res = await fetch('/api/assignments/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to swap assignments');
    await fetchBootstrapData();
    return json;
  };

  const handleLogHistoricalPickup = async ({ employee_id, warehouse_id, duty_date }) => {
    const res = await fetch('/api/historical-pickup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id, warehouse_id, duty_date }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to log historical pickup');
    await fetchBootstrapData();
    return json;
  };

  const handleDeleteHistoricalPickup = async (id) => {
    const res = await fetch(`/api/historical-pickup/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete historical pickup');
    await fetchBootstrapData();
    return json;
  };

  const handleToggleEmergencySunday = async (duty_date, enabled) => {
    const res = await fetch('/api/daily-status/emergency-sunday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date, enabled }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to toggle emergency Sunday');
    await fetchBootstrapData();
    return json;
  };

  const handleGeneratePlan = async ({ duty_date, warehouse_id, dry_run }) => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date, warehouse_id, dry_run }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Plan generation failed');
    if (!dry_run) {
      await fetchBootstrapData();
    }
    return json;
  };

  const handleAddEmployee = async (formData) => {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const b = await res.json();
      throw new Error(b.error || 'Failed to add employee');
    }
    await fetchBootstrapData();
  };

  const handleUpdateEmployee = async (id, formData) => {
    const res = await fetch(`/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const b = await res.json();
      throw new Error(b.error || 'Failed to update employee');
    }
    await fetchBootstrapData();
  };

  const handleDeleteEmployee = async (id) => {
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to archive employee');
    await fetchBootstrapData();
  };

  const handleAddAbsence = async (formData) => {
    const res = await fetch('/api/absences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const b = await res.json();
      throw new Error(b.error || 'Failed to log absence');
    }
    await fetchBootstrapData();
  };

  const handleDeleteAbsence = async (id) => {
    const res = await fetch(`/api/absences/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove absence');
    await fetchBootstrapData();
  };

  const handleAddWarehouse = async (formData) => {
    const res = await fetch('/api/warehouses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const b = await res.json();
      throw new Error(b.error || 'Failed to add warehouse');
    }
    await fetchBootstrapData();
  };

  const handleUpdateWarehouse = async (id, formData) => {
    const res = await fetch(`/api/warehouses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const b = await res.json();
      throw new Error(b.error || 'Failed to update warehouse');
    }
    await fetchBootstrapData();
  };

  const activeEmployeeCount = data.employees.filter((e) => e.active).length;

  return (
    <div className="app-container">
      {/* Navigation Bar */}
      <header className="navbar">
        <div className="nav-brand">
          <div className="brand-icon">
            <Truck size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="brand-title">PickUp</span>
              <span className="brand-badge">Overtime Dispatcher</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {activeEmployeeCount} Active Staff · {data.warehouses.length} Warehouses
            </div>
          </div>
        </div>

        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            <Calendar size={15} /> Calendar & Dispatch
          </button>
          <button
            className={`nav-tab ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveTab('employees')}
          >
            <Users size={15} /> Employees & Availability
          </button>
          <button
            className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 size={15} /> Fairness & Metrics
          </button>
          <button
            className={`nav-tab ${activeTab === 'warehouses' ? 'active' : ''}`}
            onClick={() => setActiveTab('warehouses')}
          >
            <Building2 size={15} /> Settings (Warehouses)
          </button>
        </nav>

        <div className="nav-actions">
          {/* Theme Switcher */}
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <Sun size={17} color="var(--accent-amber)" />
            ) : (
              <Moon size={17} color="var(--accent-blue)" />
            )}
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchBootstrapData}
            title="Refresh application data"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {error && (
          <div className="alert-box alert-warning">
            <span>Unable to connect to backend server: {error}</span>
          </div>
        )}

        <div className="tab-panel">
          {activeTab === 'calendar' && (
            <CalendarView
              assignments={data.assignments}
              warehouses={data.warehouses}
              employees={data.employees}
              dailyRequirements={data.dailyRequirements}
              dailyLogs={data.dailyLogs || []}
              onUpdateStatus={handleUpdateAssignmentStatus}
              onUpdateDailyStatus={handleUpdateDailyStatus}
              onReportAbsence={handleReportAbsence}
              onConfirmToday={handleConfirmToday}
              onSwapWarehouses={handleSwapWarehouses}
              onLogHistoricalPickup={handleLogHistoricalPickup}
              onDeleteHistoricalPickup={handleDeleteHistoricalPickup}
              onToggleEmergencySunday={handleToggleEmergencySunday}
              onGeneratePlan={handleGeneratePlan}
              onOpenPlanGenerator={handleOpenPlanGenerator}
            />
          )}

          {activeTab === 'generator' && (
            <PlanGenerator
              warehouses={data.warehouses}
              dailyRequirements={data.dailyRequirements}
              initialDate={generatorDate}
              initialWarehouseId={generatorWarehouseId}
              onSaveRequirement={handleSaveRequirement}
              onGeneratePlan={handleGeneratePlan}
              onViewCalendar={() => setActiveTab('calendar')}
            />
          )}

          {activeTab === 'employees' && (
            <EmployeeManager
              employees={data.employees}
              warehouses={data.warehouses}
              absences={data.absences}
              onAddEmployee={handleAddEmployee}
              onUpdateEmployee={handleUpdateEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              onAddAbsence={handleAddAbsence}
              onDeleteAbsence={handleDeleteAbsence}
            />
          )}

          {activeTab === 'warehouses' && (
            <WarehouseManager
              warehouses={data.warehouses}
              employees={data.employees}
              assignments={data.assignments}
              dailyLogs={data.dailyLogs || []}
              onAddWarehouse={handleAddWarehouse}
              onUpdateWarehouse={handleUpdateWarehouse}
            />
          )}

          {activeTab === 'analytics' && (
            <FairnessAnalytics
              employees={data.employees}
              assignments={data.assignments}
              runs={data.runs}
            />
          )}
        </div>
      </main>
    </div>
  );
}
