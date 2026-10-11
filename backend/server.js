'use strict';
// STUDMART API. Zero dependencies: only Node built-ins, so there is nothing to npm install.
// Routes:
//   GET   /health
//   POST  /api/auth/register
//   POST  /api/auth/login
//   POST  /api/auth/forgot-password
//   POST  /api/auth/reset-password
//   GET   /api/auth/me                 (auth)
//   PATCH /api/auth/profile            (auth) name, school, bio
//   POST  /api/auth/change-password    (auth)

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---------- configuration ----------
const PORT = Number(process.env.PORT) || 10000; // Render sets PORT automatically
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS) || 7 * 24 * 60 * 60;
const RESET_TTL_MS = 60 * 60 * 1000; // password reset links last 1 hour
const MAX_BODY_BYTES = 10 * 1024;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map((s) => s.trim()).filter(Boolean);

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[studmart] JWT_SECRET is not set. Using a temporary secret: all sessions reset on restart.');
}

// ---------- tiny JSON file store ----------
// Fine for launch and demos. On Render's free disk, data is lost on redeploy,
// so move to Postgres (or another database) before going live with real users.
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { users: [], resets: [] };
  }
}
const db = loadDb();
db.users ||= [];
db.resets ||= [];

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic replace: a crash never leaves a half-written file
}

// ---------- helpers ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// Minimal HS256 JWT (header.payload.signature), signed with JWT_SECRET
function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    sub: user.id, email: user.email, iat: now, exp: now + TOKEN_TTL_SECONDS,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Never send password hashes or reset data to the client.
function publicUser(u) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    name: u.name,
    email: u.email,
    school: u.school || '',
    bio: u.bio || '',
    createdAt: u.createdAt,
    updatedAt: u.updatedAt || u.createdAt,
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new HttpError(400, 'Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

function currentUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Please log in first.');
  const payload = verifyToken(token);
  if (!payload) throw new HttpError(401, 'Your session has expired. Please log in again.');
  const user = db.users.find((u) => u.id === payload.sub);
  if (!user) throw new HttpError(401, 'Account not found. Please log in again.');
  return user;
}

// ---------- route handlers ----------
function register(body, res) {
  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const school = clean(body.school);
  const email = clean(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!firstName || !lastName) throw new HttpError(400, 'Please enter your first and last name.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (password.length < 6) throw new HttpError(400, 'Your password must be at least 6 characters.');
  if (!school) throw new HttpError(400, 'Please enter your school or campus.');
  if (db.users.some((u) => u.email === email)) {
    throw new HttpError(409, 'An account with this email already exists. Try logging in.');
  }

  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email,
    school,
    bio: '',
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(user);
  saveDb();

  send(res, 201, {
    message: 'Account created successfully!',
    token: issueToken(user),
    user: publicUser(user),
  });
}

function login(body, res) {
  const email = clean(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const user = db.users.find((u) => u.email === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  send(res, 200, {
    message: 'Logged in successfully!',
    token: issueToken(user),
    user: publicUser(user),
  });
}

// Always answers the same way, so the endpoint can't be used to check which emails have accounts.
function forgotPassword(body, res) {
  const email = clean(body.email).toLowerCase();
  const user = db.users.find((u) => u.email === email);

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.resets = db.resets.filter((r) => r.userId !== user.id && r.expiresAt > Date.now());
    db.resets.push({ userId: user.id, tokenHash: sha256(token), expiresAt: Date.now() + RESET_TTL_MS });
    saveDb();
    // TODO: email the reset link (Resend, SendGrid, SMTP, etc.). Until then, log it outside production only.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[studmart][dev] password reset token for ${email}: ${token}`);
    }
  }

  send(res, 200, { message: 'If an account exists for that email, reset instructions will be sent.' });
}

function resetPassword(body, res) {
  const token = clean(body.token);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 6) throw new HttpError(400, 'Your password must be at least 6 characters.');

  const record = db.resets.find((r) => r.tokenHash === sha256(token) && r.expiresAt > Date.now());
  const user = record && db.users.find((u) => u.id === record.userId);
  if (!user) throw new HttpError(400, 'This reset link is invalid or has expired.');

  user.passwordHash = hashPassword(password);
  user.updatedAt = new Date().toISOString();
  db.resets = db.resets.filter((r) => r.userId !== user.id);
  saveDb();
  send(res, 200, { message: 'Password updated. You can log in now.' });
}

function updateProfile(user, body, res) {
  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const school = clean(body.school);
  const bio = clean(body.bio);

  if (!firstName || firstName.length > 40) throw new HttpError(400, 'First name must be between 1 and 40 characters.');
  if (!lastName || lastName.length > 40) throw new HttpError(400, 'Last name must be between 1 and 40 characters.');
  if (!school || school.length > 80) throw new HttpError(400, 'School must be between 1 and 80 characters.');
  if (bio.length > 300) throw new HttpError(400, 'Bio must be 300 characters or fewer.');

  Object.assign(user, {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    school,
    bio,
    updatedAt: new Date().toISOString(),
  });
  saveDb();
  send(res, 200, { message: 'Profile saved.', user: publicUser(user) });
}

function changePassword(user, body, res) {
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    // 400 (not 401) so the app doesn't treat a wrong current password as an expired session
    throw new HttpError(400, 'Your current password is incorrect.');
  }
  if (newPassword.length < 6) throw new HttpError(400, 'Your new password must be at least 6 characters.');

  user.passwordHash = hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  saveDb();
  send(res, 200, { message: 'Password changed.' });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';

  try {
    if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
      return send(res, 200, { service: 'studmart-api', status: 'ok' });
    }
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      return send(res, 200, { user: publicUser(currentUser(req)) });
    }
    if (req.method === 'PATCH' && pathname === '/api/auth/profile') {
      const user = currentUser(req);
      return updateProfile(user, await readJson(req), res);
    }
    if (req.method === 'POST' && pathname === '/api/auth/change-password') {
      const user = currentUser(req);
      return changePassword(user, await readJson(req), res);
    }
    if (req.method === 'POST') {
      const routes = {
        '/api/auth/register': register,
        '/api/auth/login': login,
        '/api/auth/forgot-password': forgotPassword,
        '/api/auth/reset-password': resetPassword,
      };
      if (routes[pathname]) {
        return routes[pathname](await readJson(req), res);
      }
    }
    return send(res, 404, { message: 'Route not found.' });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { message: err.message });
    console.error(err);
    return send(res, 500, { message: 'Something went wrong. Please try again.' });
  }
});

server.listen(PORT, () => {
  console.log(`[studmart] API listening on port ${PORT}`);
});
