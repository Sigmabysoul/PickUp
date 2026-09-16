import React, { useState, useEffect, useCallback } from 'react';
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
  ShieldCheck,
  LogOut,
  Lock,
} from 'lucide-react';
import CalendarView from './components/CalendarView.jsx';
import PlanGenerator from './components/PlanGenerator.jsx';
import EmployeeManager from './components/EmployeeManager.jsx';
import WarehouseManager from './components/WarehouseManager.jsx';
import FairnessAnalytics from './components/FairnessAnalytics.jsx';
import AuthLockScreen from './components/AuthLockScreen.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('calendar');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Senior Supervisor Authentication State
  const [authToken, setAuthToken] = useState(() => {
    return localStorage.getItem('pickup_auth_token') || sessionStorage.getItem('pickup_auth_token') || null;
  });
  const [authUser, setAuthUser] = useState(() => {
    try {
      const raw = localStorage.getItem('pickup_auth_user') || sessionStorage.getItem('pickup_auth_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(Boolean(authToken));

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

  const handleLogout = useCallback(() => {
    localStorage.removeItem('pickup_auth_token');
    localStorage.removeItem('pickup_auth_user');
    sessionStorage.removeItem('pickup_auth_token');
    sessionStorage.removeItem('pickup_auth_user');
    setAuthToken(null);
    setAuthUser(null);
    setData({
      warehouses: [],
      employees: [],
      absences: [],
      assignments: [],
      dailyRequirements: [],
      runs: [],
    });
  }, []);

  // Verify stored session token on startup
  useEffect(() => {
    if (!authToken) {
      setIsVerifyingAuth(false);
      return;
    }

    fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.valid) {
          handleLogout();
        } else if (res.user) {
          setAuthUser(res.user);
        }
      })
      .catch(() => {
        // Allow session persistence if offline
      })
      .finally(() => {
        setIsVerifyingAuth(false);
      });
  }, [authToken, handleLogout]);

  // Authenticated fetch wrapper passing Bearer token
  const authFetch = useCallback(
    async (url, options = {}) => {
      const headers = { ...(options.headers || {}) };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 && !url.includes('/api/auth/')) {
        handleLogout();
      }
      return res;
    },
    [authToken, handleLogout]
  );

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

  const fetchBootstrapData = useCallback(async () => {
    if (!authToken) return;
    try {
      setLoading(true);
      const res = await authFetch('/api/bootstrap');
      if (!res.ok) {
        let details = '';
        try {
          const errData = await res.json();
          details = errData.error || JSON.stringify(errData);
        } catch (_) {
          details = await res.text().catch(() => '');
        }
        throw new Error(`Bootstrap failed (${res.status}${res.statusText ? ' ' + res.statusText : ''}): ${details || 'Unable to reach backend API'}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authToken, authFetch]);

  useEffect(() => {
    if (authToken && !isVerifyingAuth) {
      fetchBootstrapData();
    }
  }, [authToken, isVerifyingAuth, fetchBootstrapData]);

  // Handlers
  const handleUpdateAssignmentStatus = async (id, status) => {
    try {
      const res = await authFetch(`/api/assignments/${id}`, {
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
      const res = await authFetch('/api/daily-status', {
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
    await authFetch('/api/requirements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouse_id, duty_date, worker_count }),
    });
  };

  const handleReportAbsence = async (assignment_id, reason) => {
    const res = await authFetch('/api/assignments/report-absence', {
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
    const res = await authFetch('/api/assignments/confirm-today', {
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
    const res = await authFetch('/api/assignments/swap', {
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
    const res = await authFetch('/api/historical-pickup', {
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
    const res = await authFetch(`/api/historical-pickup/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete historical pickup');
    await fetchBootstrapData();
    return json;
  };

  const handleToggleEmergencySunday = async (duty_date, enabled) => {
    const res = await authFetch('/api/daily-status/emergency-sunday', {
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
    const res = await authFetch('/api/generate', {
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
    const res = await authFetch('/api/employees', {
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
    const res = await authFetch(`/api/employees/${id}`, {
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
    const res = await authFetch(`/api/employees/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to archive employee');
    await fetchBootstrapData();
  };

  const handleAddAbsence = async (formData) => {
    const res = await authFetch('/api/absences', {
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
    const res = await authFetch(`/api/absences/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove absence');
    await fetchBootstrapData();
  };

  const handleAddWarehouse = async (formData) => {
    const res = await authFetch('/api/warehouses', {
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
    const res = await authFetch(`/api/warehouses/${id}`, {
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

  // Gate 1: If verifying authentication token on startup, show loading state
  if (isVerifyingAuth) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-app, #030712)',
        }}
      >
        <div style={{ textAlign: 'center', color: 'var(--text-secondary, #94a3b8)' }}>
          <RefreshCw
            size={28}
            className="spin"
            style={{ margin: '0 auto 0.75rem auto', display: 'block', color: 'var(--accent-blue, #38bdf8)' }}
          />
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Verifying Senior Credentials...</div>
        </div>
      </div>
    );
  }

  // Gate 2: If unauthenticated, show restricted lock screen
  if (!authToken) {
    return (
      <AuthLockScreen
        onAuthenticated={(user, token) => {
          setAuthUser(user);
          setAuthToken(token);
        }}
      />
    );
  }

  const activeEmployeeCount = data.employees.filter((e) => e.active).length;

  return (
    <div className="app-container">
      {/* Navigation Bar */}
      <header className="navbar">
        <div className="navbar-top-row">
          <div className="nav-brand">
            <div className="brand-icon">
              <Truck size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="brand-title">PickUp</span>
                <span className="brand-badge">Dispatcher</span>
              </div>
              <div className="brand-subtitle">
                {activeEmployeeCount} Active Staff · {data.warehouses.length} Warehouses
              </div>
            </div>
          </div>

          <div className="nav-actions">
            {/* Senior Supervisor Profile Badge */}
            <div className="senior-badge">
              <ShieldCheck size={14} color="var(--accent-blue)" />
              <span>{authUser?.name || 'Senior'}</span>
            </div>

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
              className="btn btn-secondary btn-sm nav-btn-refresh"
              onClick={fetchBootstrapData}
              title="Refresh application data"
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              <span className="nav-btn-text">Refresh</span>
            </button>

            {/* Lock / Log Out Button */}
            <button
              className="btn btn-secondary btn-sm nav-btn-lock"
              onClick={handleLogout}
              title="Lock session and log out"
            >
              <LogOut size={13} />
              <span className="nav-btn-text">Lock</span>
            </button>
          </div>
        </div>

        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            <Calendar size={15} />
            <span>Calendar & Dispatch</span>
          </button>
          <button
            className={`nav-tab ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveTab('employees')}
          >
            <Users size={15} />
            <span>Employees</span>
          </button>
          <button
            className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 size={15} />
            <span>Fairness</span>
          </button>
          <button
            className={`nav-tab ${activeTab === 'warehouses' ? 'active' : ''}`}
            onClick={() => setActiveTab('warehouses')}
          >
            <Building2 size={15} />
            <span>Settings</span>
          </button>
        </nav>
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
