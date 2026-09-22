import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
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
  Download,
  Smartphone,
  Share2,
  X,
} from 'lucide-react';
import CalendarView from './components/CalendarView.jsx';
import EmployeeManager from './components/EmployeeManager.jsx';
import WarehouseManager from './components/WarehouseManager.jsx';
import FairnessAnalytics from './components/FairnessAnalytics.jsx';
import AuthLockScreen from './components/AuthLockScreen.jsx';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('PickUp UI Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: 'var(--bg-app, #030712)',
            color: 'var(--text-primary, #f8fafc)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: '460px',
              width: '100%',
              backgroundColor: 'var(--bg-surface, #0f172a)',
              padding: '2rem',
              borderRadius: '1rem',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', color: '#f87171' }}>
              Display Render Notice
            </h2>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary, #94a3b8)',
                marginBottom: '1.25rem',
                lineHeight: 1.5,
              }}
            >
              {this.state.error?.message || 'A visual display error occurred while rendering the page.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.location.reload()}
                style={{ padding: '0.6rem 1.25rem', fontWeight: 700 }}
              >
                Reload Page
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  localStorage.removeItem('pickup_auth_token');
                  localStorage.removeItem('pickup_auth_user');
                  sessionStorage.clear();
                  window.location.reload();
                }}
                style={{ padding: '0.6rem 1.25rem' }}
              >
                Reset Session
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [activeTab, setActiveTab] = useState('calendar');
  const [calendarFocusDate, setCalendarFocusDate] = useState(null);
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

  // Progressive Web App (PWA) Install Handling
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isRunningStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setIsStandalone(Boolean(isRunningStandalone));

    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
    setIsIOS(isIosDevice);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSInstallModal(true);
    }
  };

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

  const handleUpdateDailyStatus = async (warehouse_id, duty_date, status, notes = '') => {
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
  };

  const handleRevertDailyStatus = async (duty_date) => {
    const res = await authFetch('/api/daily-status', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date }),
    });
    if (!res.ok) {
      const b = await res.json();
      throw new Error(b.error || 'Failed to revert daily status');
    }
    await fetchBootstrapData();
  };

  const handleOpenCalendarDate = (date) => {
    setCalendarFocusDate(date);
    setActiveTab('calendar');
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

  const handleConfirmToday = async (duty_date, senior_risk_acknowledged = false) => {
    const res = await authFetch('/api/assignments/confirm-today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date, senior_risk_acknowledged }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to confirm today');
    await fetchBootstrapData();
    return json;
  };

  const handleAssignSuperSenior = async ({ duty_date, super_senior_id, crew_mode }) => {
    const res = await authFetch('/api/assignments/super-senior', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date, super_senior_id, crew_mode }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update Super Senior assignment');
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

  const handleManualOverride = async ({ duty_date, employee_ids }) => {
    const res = await authFetch('/api/assignments/manual-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duty_date, employee_ids }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Manual override failed');
    await fetchBootstrapData();
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
          {/* Desktop Unified Navigation Tabs */}
          <nav className="nav-tabs desktop-only-nav">
            <button
              type="button"
              className={`nav-tab ${activeTab === 'employees' ? 'active' : ''}`}
              onClick={() => setActiveTab('employees')}
              title="Employee Staff Roster"
            >
              <Users size={15} />
              <span>Employees</span>
              <span className="nav-pill-count">{activeEmployeeCount}</span>
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
              title="Fairness & Rotation Analytics"
            >
              <BarChart3 size={15} />
              <span>Fairness</span>
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`}
              onClick={() => setActiveTab('calendar')}
              title="Calendar & Overtime Dispatch"
            >
              <Calendar size={15} />
              <span>Calendar & Dispatch</span>
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === 'warehouses' ? 'active' : ''}`}
              onClick={() => setActiveTab('warehouses')}
              title="Settings, Reports & Passcodes"
            >
              <Building2 size={15} />
              <span>Settings</span>
            </button>
          </nav>

          {/* Mobile Top Options: Employees & Fairness where logo was */}
          <div className="mobile-only-nav-top">
            <button
              type="button"
              className={`nav-tab ${activeTab === 'employees' ? 'active' : ''}`}
              onClick={() => setActiveTab('employees')}
            >
              <Users size={14} />
              <span>Staff ({activeEmployeeCount})</span>
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <BarChart3 size={14} />
              <span>Fairness</span>
            </button>
          </div>

          <div className="nav-actions">
            {/* Theme Switcher */}
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun size={16} color="var(--accent-amber)" />
              ) : (
                <Moon size={16} color="var(--accent-blue)" />
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

            {/* Install PWA App Button */}
            {!isStandalone && (deferredPrompt || isIOS) && (
              <button
                className="btn btn-primary btn-sm nav-btn-install"
                onClick={handleInstallClick}
                title="Install PickUp App on your phone"
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: '0 2px 10px rgba(56, 189, 248, 0.35)',
                }}
              >
                <Download size={13} />
                <span className="nav-btn-text">Install App</span>
              </button>
            )}

            {/* User Role Badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: authUser?.role === 'admin' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(168, 85, 247, 0.12)',
                border: authUser?.role === 'admin' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(168, 85, 247, 0.3)',
                color: authUser?.role === 'admin' ? 'var(--accent-blue)' : '#c084fc',
              }}
              title={authUser?.role === 'admin' ? 'Administrator Master Account' : `Mod Account: ${authUser?.name}`}
            >
              {authUser?.role === 'admin' ? '🛡️ Admin' : `👤 Mod: ${authUser?.name || 'Staff'}`}
            </div>

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
                authUser={authUser}
                focusedDate={calendarFocusDate}
                onUpdateDailyStatus={handleUpdateDailyStatus}
                onRevertDailyStatus={handleRevertDailyStatus}
                onUpdateAssignmentStatus={handleUpdateAssignmentStatus}
                onReportAbsence={handleReportAbsence}
                onConfirmToday={handleConfirmToday}
                onAssignSuperSenior={handleAssignSuperSenior}
                onSwapWarehouses={handleSwapWarehouses}
                onLogHistoricalPickup={handleLogHistoricalPickup}
                onDeleteHistoricalPickup={handleDeleteHistoricalPickup}
                onToggleEmergencySunday={handleToggleEmergencySunday}
                onGeneratePlan={handleGeneratePlan}
                onManualOverride={handleManualOverride}
              />
            )}

          {activeTab === 'employees' && (
            <EmployeeManager
              employees={data.employees}
              warehouses={data.warehouses}
              absences={data.absences}
              authUser={authUser}
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
              authUser={authUser}
              authFetch={authFetch}
              onAddWarehouse={handleAddWarehouse}
              onUpdateWarehouse={handleUpdateWarehouse}
            />
          )}

          {activeTab === 'analytics' && (
            <FairnessAnalytics
              employees={data.employees}
              assignments={data.assignments}
              runs={data.runs}
              onOpenCalendarDate={handleOpenCalendarDate}
            />
          )}
        </div>
      </main>

      {/* iOS Safari Install Guide Modal */}
      {showIOSInstallModal && (
        <div className="modal-overlay" onClick={() => setShowIOSInstallModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '420px', padding: '1.5rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.1rem' }}>
                <Smartphone color="var(--accent-blue)" size={22} />
                <span>Install on Phone (iOS)</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowIOSInstallModal(false)}
                style={{ padding: '0.25rem 0.5rem', minWidth: '32px' }}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              To install PickUp as a standalone app on your iPhone or iPad:
            </p>
            <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              <li>
                Tap the <strong>Share</strong> button <Share2 size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> in the Safari toolbar.
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top-right corner.
              </li>
            </ol>
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center' }}
              onClick={() => setShowIOSInstallModal(false)}
            >
              Got It!
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (4-Tab Bar) */}
      <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <div className="mobile-nav-icon-pod">
            <Calendar size={18} />
          </div>
          <span>Dispatch</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'employees' ? 'active' : ''}`}
          onClick={() => setActiveTab('employees')}
        >
          <div className="mobile-nav-icon-pod">
            <Users size={18} />
          </div>
          <span>Staff</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <div className="mobile-nav-icon-pod">
            <BarChart3 size={18} />
          </div>
          <span>Fairness</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'warehouses' ? 'active' : ''}`}
          onClick={() => setActiveTab('warehouses')}
        >
          <div className="mobile-nav-icon-pod">
            <Building2 size={18} />
          </div>
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}
