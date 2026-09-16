import crypto from 'node:crypto';

// Secret key for signing session tokens
const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.DATABASE_URL ||
  'pickup-overtime-dispatcher-secure-key-2026';

// Admin password (user configured: 1877472806)
export const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  '1877472806';

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
 * Validates login credentials against either the Master Admin password or user accounts in the database
 */
export async function validateCredentials({ passcode, username, supervisorId, pool }) {
  if (!passcode) return { success: false, message: 'Passcode or password is required' };

  const cleanPasscode = String(passcode).trim();

  // 1. Check if matching Admin Password
  if (cleanPasscode === ADMIN_PASSWORD.trim()) {
    return {
      success: true,
      user: {
        id: 'admin',
        name: 'Administrator',
        username: 'admin',
        role: 'admin',
      },
    };
  }

  // 2. Check against database users created by Admin
  if (pool) {
    try {
      let userRow = null;

      if (supervisorId) {
        const res = await pool.query(
          'SELECT * FROM app_users WHERE id = $1 AND active = true',
          [supervisorId]
        );
        userRow = res.rows[0];
      } else if (username) {
        const res = await pool.query(
          'SELECT * FROM app_users WHERE LOWER(username) = LOWER($1) AND active = true',
          [username.trim()]
        );
        userRow = res.rows[0];
      } else {
        // Direct passcode lookup across active users
        const res = await pool.query(
          'SELECT * FROM app_users WHERE passcode = $1 AND active = true',
          [cleanPasscode]
        );
        userRow = res.rows[0];
      }

      if (userRow && userRow.passcode === cleanPasscode) {
        return {
          success: true,
          user: {
            id: String(userRow.id),
            name: userRow.name,
            username: userRow.username,
            role: userRow.role || 'senior',
          },
        };
      }
    } catch (err) {
      console.error('Database auth validation error:', err.message);
    }
  }

  return { success: false, message: 'Invalid admin password or senior employee credentials' };
}

/**
 * Express middleware enforcing authentication on protected API endpoints
 */
export function requireAuth(req, res, next) {
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
      error: 'Unauthorized: Complete access is restricted. Please sign in.',
    });
  }

  req.user = user;
  next();
}

/**
 * Express middleware enforcing Administrator access (for User Management)
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: Only the administrator can manage users and passwords.',
    });
  }
  next();
}
