import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Lock,
  KeyRound,
  UserCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Truck,
  CheckCircle2,
} from 'lucide-react';

export default function AuthLockScreen({ onAuthenticated }) {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [supervisors, setSupervisors] = useState([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shake, setShake] = useState(false);

  // Load supervisor profiles on mount
  useEffect(() => {
    fetch('/api/auth/supervisors')
      .then((r) => r.json())
      .then((data) => {
        if (data.supervisors && Array.isArray(data.supervisors)) {
          setSupervisors(data.supervisors);
          if (data.supervisors.length > 0) {
            setSelectedSupervisor(data.supervisors[0].id);
          }
        }
      })
      .catch(() => {
        // Fallback if offline
      });
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setError('Please enter your senior passcode or PIN');
      triggerShake();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode: passcode.trim(),
          supervisorId: selectedSupervisor,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Access denied. Incorrect passcode.');
      }

      // Store credentials according to remember me preference
      if (rememberMe) {
        localStorage.setItem('pickup_auth_token', data.token);
        localStorage.setItem('pickup_auth_user', JSON.stringify(data.user));
      } else {
        sessionStorage.setItem('pickup_auth_token', data.token);
        sessionStorage.setItem('pickup_auth_user', JSON.stringify(data.user));
      }

      onAuthenticated(data.user, data.token);
    } catch (err) {
      setError(err.message);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen-container">
      <div className={`auth-screen-box ${shake ? 'shake-animation' : ''}`}>
        {/* Brand Icon / Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '18px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.25))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              boxShadow: '0 0 25px rgba(56, 189, 248, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              marginBottom: '1rem',
            }}
          >
            <Lock size={28} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Truck size={20} color="var(--accent-blue, #38bdf8)" />
            <h2
              style={{
                fontSize: '1.45rem',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                margin: 0,
                background: 'linear-gradient(135deg, #38bdf8, #818cf8, #c084fc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              PickUp Security Gate
            </h2>
          </div>

          <p
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-secondary, #94a3b8)',
              marginTop: '0.35rem',
              lineHeight: 1.4,
            }}
          >
            Restricted System · Complete Access For Authorized Senior Employees Only
          </p>
        </div>

        {/* Security Alert Badge */}
        <div
          style={{
            backgroundColor: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.25)',
            borderRadius: '0.5rem',
            padding: '0.75rem 0.85rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem',
          }}
        >
          <ShieldAlert size={16} color="var(--accent-amber, #eab308)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.4 }}>
            Only senior supervisors have permission to view rosters, plan duties, and confirm overtime pickups.
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          {/* Senior Profile Selector */}
          {supervisors.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  marginBottom: '0.45rem',
                  color: 'var(--text-primary, #f8fafc)',
                }}
              >
                Select Your Senior Profile:
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(supervisors.length, 3)}, 1fr)`,
                  gap: '0.5rem',
                }}
              >
                {supervisors.map((sup, idx) => {
                  const isSelected = selectedSupervisor === sup.id;
                  return (
                    <button
                      key={sup.id}
                      type="button"
                      onClick={() => {
                        setSelectedSupervisor(sup.id);
                        setError(null);
                      }}
                      style={{
                        padding: '0.6rem 0.4rem',
                        fontSize: '0.78rem',
                        fontWeight: isSelected ? 700 : 500,
                        backgroundColor: isSelected
                          ? 'rgba(56, 189, 248, 0.15)'
                          : 'var(--bg-surface-elevated, #1e293b)',
                        border: isSelected
                          ? '1.5px solid var(--accent-blue, #38bdf8)'
                          : '1px solid var(--border-color, #334155)',
                        color: isSelected
                          ? 'var(--accent-blue, #38bdf8)'
                          : 'var(--text-secondary, #94a3b8)',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <UserCheck
                        size={14}
                        style={{
                          display: 'block',
                          margin: '0 auto 0.25rem auto',
                          opacity: isSelected ? 1 : 0.6,
                        }}
                      />
                      Senior {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Passcode Input */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
              <label
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #f8fafc)',
                }}
              >
                Enter Access Passcode or PIN:
              </label>
            </div>

            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted, #64748b)',
                  display: 'flex',
                }}
              >
                <KeyRound size={16} />
              </div>

              <input
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter 4-digit PIN or master passcode"
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.75rem 2.5rem 0.75rem 2.4rem',
                  backgroundColor: 'var(--bg-surface-elevated, #1e293b)',
                  border: error
                    ? '1.5px solid var(--accent-red, #ef4444)'
                    : '1px solid var(--border-color, #334155)',
                  borderRadius: '0.5rem',
                  color: 'var(--text-primary, #f8fafc)',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />

              <button
                type="button"
                onClick={() => setShowPasscode((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #64748b)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
                title={showPasscode ? 'Hide' : 'Show'}
              >
                {showPasscode ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <div
                style={{
                  marginTop: '0.5rem',
                  color: 'var(--accent-red, #ef4444)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                ✕ {error}
              </div>
            )}
          </div>

          {/* Remember me checkbox */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.5rem',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Remember this device for 30 days
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '0.8rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              'Verifying Credentials...'
            ) : (
              <>
                Unlock Dispatcher <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Quick hint for initial login */}
        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color, #1e293b)',
            textAlign: 'center',
            fontSize: '0.72rem',
            color: 'var(--text-muted, #64748b)',
          }}
        >
          Default Senior Passcode: <code style={{ color: 'var(--accent-blue, #38bdf8)' }}>pickup2026</code> · Or PINs: <code style={{ color: 'var(--accent-blue, #38bdf8)' }}>1234</code>, <code style={{ color: 'var(--accent-blue, #38bdf8)' }}>5678</code>, <code style={{ color: 'var(--accent-blue, #38bdf8)' }}>9999</code>
        </div>
      </div>
    </div>
  );
}

