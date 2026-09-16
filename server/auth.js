import crypto from 'node:crypto';

// Secret key for signing session tokens
const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.DATABASE_URL ||
  'pickup-overtime-dispatcher-secure-key-2026';

// Master supervisor passcode (configurable in Vercel / .env)
export const MASTER_PASSCODE =
  process.env.SUPERVISOR_PASSCODE ||
  process.env.ADMIN_PASSWORD ||
  'pickup2026';

// Optional pre-configured senior supervisors (name + PIN)
export const SENIOR_SUPERVISORS = [
  { id: 'sup-1', name: 'Senior Supervisor 1', pin: process.env.SUPERVISOR_1_PIN || '1234' },
  { id: 'sup-2', name: 'Senior Supervisor 2', pin: process.env.SUPERVISOR_2_PIN || '5678' },
  { id: 'sup-3', name: 'Senior Supervisor 3', pin: process.env.SUPERVISOR_3_PIN || '9999' },
];

/**
 * Creates an HMAC-SHA256 signed session token (valid for 30 days)
 */
export function generateToken(payload) {
  const data = {
    ...payload,
    iat: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };

  const payloadB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies the HMAC-SHA256 signature and expiration of a session token
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');

  // Timing safe comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Validates login credentials against either the Master Passcode or Senior Supervisor PINs
 */
export function validateCredentials({ passcode, supervisorId, name }) {
  if (!passcode) return { success: false, message: 'Passcode is required' };

  // 1. Check if matching Master Passcode
  if (passcode.trim() === MASTER_PASSCODE.trim()) {
    return {
      success: true,
      user: {
        id: supervisorId || 'master',
        name: name || 'Senior Supervisor',
        role: 'supervisor',
      },
    };
  }

  // 2. Check if matching a specific senior supervisor PIN
  if (supervisorId) {
    const supervisor = SENIOR_SUPERVISORS.find((s) => s.id === supervisorId);
    if (supervisor && supervisor.pin === passcode.trim()) {
      return {
        success: true,
        user: {
          id: supervisor.id,
          name: supervisor.name,
          role: 'supervisor',
        },
      };
    }
  }

  // 3. Check any supervisor matching by PIN directly
  const matchedSupervisor = SENIOR_SUPERVISORS.find((s) => s.pin === passcode.trim());
  if (matchedSupervisor) {
    return {
      success: true,
      user: {
        id: matchedSupervisor.id,
        name: matchedSupervisor.name,
        role: 'supervisor',
      },
    };
  }

  return { success: false, message: 'Invalid supervisor passcode or PIN' };
}

/**
 * Express middleware enforcing authentication on protected API endpoints
 */
export function requireAuth(req, res, next) {
  // Extract token from header or query param
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  } else if (req.query && req.query.auth_token) {
    token = req.query.auth_token;
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({
      error: 'Unauthorized: Complete access is restricted to senior employees. Please sign in.',
    });
  }

  req.user = user;
  next();
}

