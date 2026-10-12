'use strict';
// STUDMART API. Only Node built-ins (Node 18+), so there is nothing to npm install.
//
// Auth:     POST /api/auth/register · POST /api/auth/login · POST /api/auth/forgot-password
//           POST /api/auth/reset-password · GET /api/auth/me · PATCH /api/auth/profile
//           POST /api/auth/change-password
// Listings: GET /api/listings?category=&q= · POST /api/listings · GET /api/listings/:id
//           PATCH /api/listings/:id · DELETE /api/listings/:id · POST /api/listings/:id/save
//           GET /api/me/listings · GET /api/me/saved
// Other:    GET /health

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---------- configuration ----------
const PORT = Number(process.env.PORT) || 10000; // Render sets PORT automatically
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS) || 7 * 24 * 60 * 60;
const RESET_TTL_MS = 60 * 60 * 1000; // password reset links last 1 hour
const MAX_BODY_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;       // uploaded photos, after decoding
const MAX_UPLOAD_BODY_BYTES = 5 * 1024 * 1024; // base64 adds about a third on top
const UPLOAD_DIR = path.join(path.dirname(DATA_FILE), 'uploads');
const MAX_BILLBOARD_SLIDES = 8;
const BILLBOARD_THEMES = ['orange', 'deep', 'amber', 'crimson'];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map((s) => s.trim()).filter(Boolean);
const FRONTEND_URL = (process.env.FRONTEND_URL || ALLOWED_ORIGINS.find((o) => o !== '*') || '')
  .replace(/\/+$/, '');
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails';
const EMAIL_FROM = process.env.EMAIL_FROM || 'STUDMART <onboarding@resend.dev>';
// Comma-separated emails of admins, e.g. "you@gmail.com,partner@school.edu.ng". Set on Render only.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const CATEGORIES = ['Electronics', 'Books', 'Fashion', 'Hostel'];
const CONDITIONS = ['New', 'Like new', 'Good', 'Fair'];
const MAX_PRICE = 10000000;

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[studmart] JWT_SECRET is not set. Using a temporary secret: all sessions reset on restart.');
}
if (!FRONTEND_URL) console.warn('[studmart] FRONTEND_URL is not set. Password reset links will be broken.');
if (!RESEND_API_KEY) console.warn('[studmart] RESEND_API_KEY is not set. Password reset emails will not be sent.');

// ---------- tiny JSON file store ----------
// Fine for launch and demos. On Render's free disk, data is lost on redeploy,
// so move to Postgres (or another database) before going live with real users.
function emptyDb() {
  return { users: [], resets: [], listings: [], saves: [], billboard: [] };
}
function loadDb() {
  try {
    return { ...emptyDb(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return emptyDb();
  }
}
const db = loadDb();

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
const now = () => new Date().toISOString();
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

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
  const t = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    sub: user.id, email: user.email, iat: t, exp: t + TOKEN_TTL_SECONDS,
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
    accountType: u.accountType === 'shop' ? 'shop' : 'individual',
    shop: u.accountType === 'shop' ? { ...(u.shop || {}) } : null,
    avatarUrl: u.avatarUrl || '',
    developer: !!u.developer,
    isAdmin: ADMIN_EMAILS.includes(u.email),
    verification: {
      status: (u.verification || {}).status || 'none',
      verified: (u.verification || {}).status === 'approved',
    },
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (message) => new HttpError(400, message);

function readJson(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
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

// Public pages can show more (e.g. "saved" flags) when the visitor is logged in
function optionalUser(req) {
  try {
    return currentUser(req);
  } catch {
    return null;
  }
}

// ---------- email (Resend HTTP API, no SDK needed) ----------
async function sendEmail({ to, subject, text, html }) {
  try {
    const r = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      console.error(`[studmart] email failed (${r.status}): ${await r.text().catch(() => '')}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[studmart] email error:', err.message);
    return false;
  }
}

function resetEmail(user, link) {
  const name = escapeHtml(user.firstName);
  return {
    subject: 'Reset your STUDMART password',
    text: `Hi ${user.firstName},\n\nUse this link to set a new STUDMART password. It expires in 1 hour:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: `<p>Hi ${name},</p>
<p>Use this link to set a new STUDMART password. It expires in 1 hour.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 18px;border-radius:99px;text-decoration:none;font-weight:bold">Reset my password</a></p>
<p style="color:#78716c;font-size:12px">If you didn't ask for this, you can ignore this email.</p>`,
  };
}

// ---------- auth handlers ----------
// Shop details: a shop account is a separate kind of account with its own name, address and contact
function readShop(body, current) {
  const pick = (k, max) => (Object.prototype.hasOwnProperty.call(body, k) ? clean(body[k]) : clean(current[k] || ''));
  const name = pick('shopName'), address = pick('shopAddress'), phone = pick('shopPhone'), description = pick('shopDescription');
  if (!name || name.length > 60) throw bad('Shop name must be between 1 and 60 characters.');
  if (!address || address.length > 120) throw bad('Shop address must be between 1 and 120 characters.');
  if (!phone || phone.length > 40) throw bad('Shop phone or WhatsApp must be between 1 and 40 characters.');
  if (description.length > 400) throw bad('Shop description must be 400 characters or fewer.');
  return { name, address, phone, description };
}

async function register(body, res) {
  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const school = clean(body.school);
  const email = clean(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!firstName || !lastName) throw bad('Please enter your first and last name.');
  if (!EMAIL_RE.test(email)) throw bad('Please enter a valid email address.');
  if (password.length < 6) throw bad('Your password must be at least 6 characters.');
  const accountType = body.accountType === 'shop' ? 'shop' : 'individual';
  if (!school && accountType !== 'shop') throw bad('Please enter your school or campus.');
  const shop = accountType === 'shop' ? readShop(body, {}) : null;
  if (db.users.some((u) => u.email === email)) {
    throw new HttpError(409, 'An account with this email already exists. Try logging in.');
  }

  const t = now();
  const user = {
    id: crypto.randomUUID(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email,
    school,
    bio: '',
    accountType,
    ...(shop ? { shop } : {}),
    passwordHash: hashPassword(password),
    createdAt: t,
    updatedAt: t,
  };
  db.users.push(user);
  saveDb();

  send(res, 201, { message: 'Account created successfully!', token: issueToken(user), user: publicUser(user) });
}

function login(body, res) {
  const email = clean(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const user = db.users.find((u) => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  send(res, 200, { message: 'Logged in successfully!', token: issueToken(user), user: publicUser(user) });
}

// Always answers the same way, so the endpoint can't be used to check which emails have accounts.
async function forgotPassword(body, res) {
  const email = clean(body.email).toLowerCase();
  const user = db.users.find((u) => u.email === email);

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.resets = db.resets.filter((r) => r.userId !== user.id && r.expiresAt > Date.now());
    db.resets.push({ userId: user.id, tokenHash: sha256(token), expiresAt: Date.now() + RESET_TTL_MS });
    saveDb();

    const link = `${FRONTEND_URL}/#reset=${token}`;
    if (RESEND_API_KEY) {
      await sendEmail({ to: user.email, ...resetEmail(user, link) });
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[studmart][dev] password reset link for ${email}: ${link}`);
    }
  }

  send(res, 200, { message: 'If an account exists for that email, reset instructions will be sent.' });
}

function resetPassword(body, res) {
  const token = clean(body.token);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 6) throw bad('Your password must be at least 6 characters.');

  const record = db.resets.find((r) => r.tokenHash === sha256(token) && r.expiresAt > Date.now());
  const user = record && db.users.find((u) => u.id === record.userId);
  if (!user) throw bad('This reset link is invalid or has expired.');

  user.passwordHash = hashPassword(password);
  user.updatedAt = now();
  db.resets = db.resets.filter((r) => r.userId !== user.id);
  saveDb();
  send(res, 200, { message: 'Password updated. You can log in now.' });
}

function updateProfile(user, body, res) {
  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const school = clean(body.school);
  const bio = clean(body.bio);

  if (!firstName || firstName.length > 40) throw bad('First name must be between 1 and 40 characters.');
  if (!lastName || lastName.length > 40) throw bad('Last name must be between 1 and 40 characters.');
  if (school.length > 80 || (!school && user.accountType !== 'shop')) throw bad('School must be between 1 and 80 characters.');
  if (bio.length > 300) throw bad('Bio must be 300 characters or fewer.');
  const shopPatch = user.accountType === 'shop' ? { shop: readShop(body, user.shop || {}) } : {};
  const avatarUrl = Object.prototype.hasOwnProperty.call(body, 'avatarUrl') ? clean(body.avatarUrl) : null;
  if (avatarUrl && !(avatarUrl.startsWith('/uploads/') && isAllowedImage(avatarUrl))) throw bad('Profile photo must be an uploaded image.');
  const avatarPatch = avatarUrl === null ? {} : { avatarUrl };

  Object.assign(user, { firstName, lastName, name: `${firstName} ${lastName}`, school, bio, updatedAt: now() }, shopPatch, avatarPatch);
  saveDb();
  send(res, 200, { message: 'Profile saved.', user: publicUser(user) });
}

function changePassword(user, body, res) {
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    // 400 (not 401) so the app doesn't treat a wrong current password as an expired session
    throw bad('Your current password is incorrect.');
  }
  if (newPassword.length < 6) throw bad('Your new password must be at least 6 characters.');
  user.passwordHash = hashPassword(newPassword);
  user.updatedAt = now();
  saveDb();
  send(res, 200, { message: 'Password changed.' });
}

// ---------- listings ----------
const LIMITS = { title: 80, description: 1000, pickup: 80, contact: 40, imageUrl: 500 };

function sellerName(u) {
  return `${u.firstName} ${(u.lastName || '')[0] || ''}.`.trim();
}

// What the public sees. Seller email and any password data are never included.
function publicListing(l, viewerId) {
  const seller = db.users.find((u) => u.id === l.sellerId);
  return {
    id: l.id,
    title: l.title,
    category: l.category,
    condition: l.condition,
    price: l.price,
    pickup: l.pickup,
    contact: l.contact,
    description: l.description,
    imageUrl: l.imageUrl,
    status: l.status,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    seller: seller
      ? {
          name: seller.accountType === 'shop' && seller.shop ? seller.shop.name : sellerName(seller),
          school: seller.school,
          type: seller.accountType === 'shop' ? 'shop' : 'individual',
          verified: (seller.verification || {}).status === 'approved',
          developer: !!seller.developer,
          avatarUrl: seller.avatarUrl || '',
        }
      : { name: 'Student seller', school: '' },
    isOwner: !!viewerId && viewerId === l.sellerId,
    saved: !!viewerId && db.saves.some((s) => s.userId === viewerId && s.listingId === l.id),
  };
}

// On create every field is validated; on update only the fields sent are checked.
function validateListing(body, { partial = false } = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const out = {};

  if (!partial || has('title')) {
    const v = clean(body.title);
    if (!v || v.length > LIMITS.title) throw bad(`Title must be 1–${LIMITS.title} characters.`);
    out.title = v;
  }
  if (!partial || has('category')) {
    if (!CATEGORIES.includes(body.category)) throw bad('Choose a valid category.');
    out.category = body.category;
  }
  if (!partial || has('condition')) {
    if (!CONDITIONS.includes(body.condition)) throw bad('Choose a valid condition.');
    out.condition = body.condition;
  }
  if (!partial || has('price')) {
    const raw = typeof body.price === 'string' ? body.price.trim() : body.price;
    const p = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
    if (!Number.isInteger(p) || p < 0 || p > MAX_PRICE) {
      throw bad(`Price must be a whole number of naira, from 0 to ${MAX_PRICE.toLocaleString('en-US')}.`);
    }
    out.price = p;
  }
  if (!partial || has('pickup')) {
    const v = clean(body.pickup);
    if (!v || v.length > LIMITS.pickup) throw bad(`Enter a pickup location (up to ${LIMITS.pickup} characters).`);
    out.pickup = v;
  }
  if (!partial || has('description')) {
    const v = clean(body.description);
    if (!v || v.length > LIMITS.description) throw bad(`Description must be 1–${LIMITS.description} characters.`);
    out.description = v;
  }
  if (!partial || has('contact')) {
    const v = clean(body.contact);
    if (v.length > LIMITS.contact) throw bad(`Contact must be ${LIMITS.contact} characters or fewer.`);
    out.contact = v;
  }
  if (!partial || has('imageUrl')) {
    const v = clean(body.imageUrl);
    if (v && !isAllowedImage(v)) {
      throw bad('Photo must be an uploaded image or an https:// link, under 500 characters.');
    }
    out.imageUrl = v;
  }
  if (partial && has('status')) {
    if (!['active', 'sold'].includes(body.status)) throw bad('Status must be "active" or "sold".');
    out.status = body.status;
  }
  return out;
}

function listListings(viewer, query, res) {
  const category = query.get('category');
  const q = (query.get('q') || '').trim().toLowerCase().slice(0, 80);

  let items = db.listings.filter((l) => !category || category === 'All' || l.category === category);
  if (q) {
    items = items.filter((l) => [l.title, l.description, l.pickup, l.category]
      .some((v) => v.toLowerCase().includes(q)));
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  send(res, 200, { listings: items.slice(0, 200).map((l) => publicListing(l, viewer && viewer.id)) });
}

// ---------- shops (public storefronts) ----------
function publicShop(u) {
  const shop = u.shop || {};
  const listingCount = db.listings.filter((l) => l.sellerId === u.id && l.status === 'active').length;
  return {
    id: u.id,
    name: shop.name,
    address: shop.address,
    phone: shop.phone,
    description: shop.description || '',
    school: u.school || '',
    verified: (u.verification || {}).status === 'approved',
    listingCount,
    createdAt: u.createdAt,
  };
}
function listShops(res) {
  const shops = db.users.filter((u) => u.accountType === 'shop' && u.shop).map(publicShop);
  shops.sort((a, b) => b.listingCount - a.listingCount || a.name.localeCompare(b.name));
  send(res, 200, { shops });
}
function getShop(viewer, id, res) {
  const u = db.users.find((x) => x.id === id && x.accountType === 'shop' && x.shop);
  if (!u) throw new HttpError(404, 'Shop not found.');
  const listings = db.listings
    .filter((l) => l.sellerId === u.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200)
    .map((l) => publicListing(l, viewer && viewer.id));
  send(res, 200, { shop: publicShop(u), listings });
}

function getListing(viewer, id, res) {
  const l = db.listings.find((x) => x.id === id);
  if (!l) throw new HttpError(404, 'Listing not found.');
  send(res, 200, { listing: publicListing(l, viewer && viewer.id) });
}

function createListing(user, body, res) {
  const data = validateListing(body);
  const t = now();
  const listing = { id: crypto.randomUUID(), sellerId: user.id, ...data, status: 'active', createdAt: t, updatedAt: t };
  db.listings.push(listing);
  saveDb();
  send(res, 201, { message: 'Listing posted.', listing: publicListing(listing, user.id) });
}

function ownListing(user, id) {
  const l = db.listings.find((x) => x.id === id);
  if (!l) throw new HttpError(404, 'Listing not found.');
  if (l.sellerId !== user.id) throw new HttpError(403, 'You can only change your own listings.');
  return l;
}

function updateListing(user, id, body, res) {
  const l = ownListing(user, id);
  Object.assign(l, validateListing(body, { partial: true }), { updatedAt: now() });
  saveDb();
  send(res, 200, { message: 'Listing updated.', listing: publicListing(l, user.id) });
}

function deleteListing(user, id, res) {
  const l = ownListing(user, id);
  db.listings = db.listings.filter((x) => x.id !== l.id);
  db.saves = db.saves.filter((s) => s.listingId !== l.id);
  saveDb();
  send(res, 200, { message: 'Listing deleted.' });
}

function toggleSave(user, id, res) {
  if (!db.listings.some((x) => x.id === id)) throw new HttpError(404, 'Listing not found.');
  const idx = db.saves.findIndex((s) => s.userId === user.id && s.listingId === id);
  let saved;
  if (idx >= 0) {
    db.saves.splice(idx, 1);
    saved = false;
  } else {
    db.saves.push({ userId: user.id, listingId: id, createdAt: now() });
    saved = true;
  }
  saveDb();
  send(res, 200, { saved });
}

function myListings(user, res) {
  const items = db.listings
    .filter((l) => l.sellerId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  send(res, 200, { listings: items.map((l) => publicListing(l, user.id)) });
}

function mySaved(user, res) {
  const items = db.saves
    .filter((s) => s.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => db.listings.find((l) => l.id === s.listingId))
    .filter(Boolean);
  send(res, 200, { listings: items.map((l) => publicListing(l, user.id)) });
}

// ---------- verification ----------
function requestVerification(user, body, res) {
  const studentIdUrl = clean(body.studentIdUrl);
  const note = clean(body.note).slice(0, 300);
  if (!/^https:\/\//.test(studentIdUrl) || studentIdUrl.length > 500) {
    throw bad('Student ID link must start with https:// and be under 500 characters.');
  }
  if ((user.verification || {}).status === 'approved') throw bad('Your account is already verified.');
  user.verification = { status: 'pending', studentIdUrl, note, requestedAt: now(), reviewedAt: null, reviewedBy: null };
  user.updatedAt = now();
  saveDb();
  send(res, 200, { message: 'Verification request sent. We will review it soon.', user: publicUser(user) });
}

// ---------- admin ----------
function requireAdmin(req) {
  const user = currentUser(req);
  if (!ADMIN_EMAILS.includes(user.email)) throw new HttpError(403, 'Admins only.');
  return user;
}

function adminUser(u) {
  const v = u.verification || {};
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    school: u.school || '',
    accountType: u.accountType === 'shop' ? 'shop' : 'individual',
    developer: !!u.developer,
    createdAt: u.createdAt,
    listingCount: db.listings.filter((l) => l.sellerId === u.id).length,
    verification: {
      status: v.status || 'none',
      studentIdUrl: v.studentIdUrl || '',
      note: v.note || '',
      requestedAt: v.requestedAt || null,
      reviewedAt: v.reviewedAt || null,
    },
  };
}

function adminListUsers(query, res) {
  const q = (query.get('q') || '').trim().toLowerCase();
  const status = query.get('status');
  let users = db.users;
  if (q) users = users.filter((u) => [u.name, u.email, u.school || ''].some((v) => v.toLowerCase().includes(q)));
  if (status) users = users.filter((u) => ((u.verification || {}).status || 'none') === status);
  users = [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  send(res, 200, { users: users.slice(0, 300).map(adminUser) });
}

async function adminSetDeveloper(userId, body, res) {
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new HttpError(404, 'User not found.');
  if (body.action !== 'grant' && body.action !== 'revoke') throw bad('Choose grant or revoke.');
  u.developer = body.action === 'grant';
  u.updatedAt = now();
  saveDb();
  send(res, 200, {
    message: u.developer ? `${u.name} now has the developer badge.` : `Developer badge removed from ${u.name}.`,
    user: adminUser(u),
  });
}

async function adminSetVerification(admin, userId, body, res) {
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new HttpError(404, 'User not found.');
  const actions = { approve: 'approved', reject: 'rejected', revoke: 'none' };
  const next = actions[body.action];
  if (!next) throw bad('Action must be approve, reject or revoke.');

  const t = now();
  u.verification = { ...(u.verification || {}), status: next, reviewedAt: t, reviewedBy: admin.email };
  u.updatedAt = t;
  saveDb();

  if (RESEND_API_KEY && (next === 'approved' || next === 'rejected')) {
    const approved = next === 'approved';
    await sendEmail({
      to: u.email,
      subject: approved ? 'Your STUDMART account is verified' : 'Your STUDMART verification was not approved',
      text: approved
        ? `Hi ${u.firstName}, your student verification was approved. Your account now shows a blue tick.`
        : `Hi ${u.firstName}, we could not approve your student verification. You can send a new request from your profile with a clearer student ID link.`,
      html: `<p>Hi ${escapeHtml(u.firstName)},</p><p>${approved
        ? 'Your student verification was approved. Your account now shows a blue tick.'
        : 'We could not approve your student verification. You can send a new request from your profile with a clearer student ID link.'}</p>`,
    });
  }
  const past = { approve: 'approved', reject: 'rejected', revoke: 'revoked' }[body.action];
  send(res, 200, { message: `Verification ${past}.`, user: adminUser(u) });
}

function adminListListings(res) {
  const items = [...db.listings]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 300)
    .map((l) => {
      const s = db.users.find((u) => u.id === l.sellerId);
      return {
        id: l.id, title: l.title, category: l.category, price: l.price, status: l.status, createdAt: l.createdAt,
        seller: s ? { name: s.name, email: s.email } : { name: 'Unknown', email: '' },
      };
    });
  send(res, 200, { listings: items });
}

function adminDeleteListing(id, res) {
  if (!db.listings.some((x) => x.id === id)) throw new HttpError(404, 'Listing not found.');
  db.listings = db.listings.filter((x) => x.id !== id);
  db.saves = db.saves.filter((s) => s.listingId !== id);
  saveDb();
  send(res, 200, { message: 'Listing removed.' });
}

// ---------- routing ----------
const UUID_PATH = '([0-9a-f-]{36})';

// ---------- uploads (photos for listings and billboard slides) ----------
const UPLOAD_NAME_RE = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;
const UPLOAD_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
function isAllowedImage(v) {
  if (!v) return true;
  if (v.startsWith('/uploads/')) return UPLOAD_NAME_RE.test(v.slice('/uploads/'.length)) && v.length <= LIMITS.imageUrl;
  return /^https:\/\//.test(v) && v.length <= LIMITS.imageUrl;
}
// Check the real file signature, not the type the browser claims
function detectImageExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
function saveUpload(user, body, res) {
  const match = typeof body.data === 'string' && body.data.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw bad('Please choose a JPEG, PNG or WebP image.');
  const buf = Buffer.from(match[2], 'base64');
  if (!buf.length) throw bad('That image is empty.');
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Photos must be 3 MB or smaller.');
  const ext = detectImageExt(buf);
  if (!ext) throw bad('That file is not a valid JPEG, PNG or WebP image.');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  send(res, 201, { message: 'Photo uploaded.', url: `/uploads/${name}` });
}
function serveUpload(name, res) {
  fs.readFile(path.join(UPLOAD_DIR, name), (err, buf) => {
    if (err) return send(res, 404, { message: 'Photo not found.' });
    res.writeHead(200, {
      'Content-Type': UPLOAD_TYPES[name.split('.').pop()],
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  });
}

// ---------- billboard (home page slideshow, edited by admins) ----------
const SLIDE_LINK_RE = /^(https:\/\/|\/(?!\/)|\.\/|#)/;
function validateSlide(s) {
  if (!s || typeof s !== 'object') throw bad('Each slide needs a title and a link.');
  const kicker = clean(s.kicker).slice(0, 40);
  const title = clean(s.title);
  const body = clean(s.body);
  const buttonText = clean(s.buttonText).slice(0, 30) || 'Learn more';
  const buttonLink = clean(s.buttonLink);
  const imageUrl = clean(s.imageUrl);
  const theme = BILLBOARD_THEMES.includes(s.theme) ? s.theme : 'orange';
  if (!title || title.length > 80) throw bad('Each slide needs a title of 1–80 characters.');
  if (body.length > 220) throw bad('Slide text must be 220 characters or fewer.');
  if (!buttonLink || buttonLink.length > 200 || !SLIDE_LINK_RE.test(buttonLink)) {
    throw bad('Slide links must be a page on STUDMART (like ./shops.html or #market) or an https:// link.');
  }
  if (imageUrl && !isAllowedImage(imageUrl)) throw bad('Slide image must be an uploaded image or an https:// link.');
  return { id: crypto.randomUUID(), kicker, title, body, buttonText, buttonLink, imageUrl, theme };
}
function getBillboard(res) {
  send(res, 200, { slides: db.billboard || [] });
}
function adminSetBillboard(body, res) {
  if (!Array.isArray(body.slides)) throw bad('Send the slides as a list.');
  if (body.slides.length > MAX_BILLBOARD_SLIDES) throw bad(`A billboard can have up to ${MAX_BILLBOARD_SLIDES} slides.`);
  db.billboard = body.slides.map(validateSlide);
  saveDb();
  send(res, 200, { message: 'Billboard saved.', slides: db.billboard });
}

async function dispatch(req, res, url) {
  const { pathname, searchParams: query } = url;
  const m = req.method;

  if (m === 'GET' && (pathname === '/' || pathname === '/health')) {
    return send(res, 200, { service: 'studmart-api', status: 'ok' });
  }

  // auth
  if (m === 'GET' && pathname === '/api/auth/me') return send(res, 200, { user: publicUser(currentUser(req)) });
  if (m === 'PATCH' && pathname === '/api/auth/profile') {
    const user = currentUser(req);
    return updateProfile(user, await readJson(req), res);
  }
  if (m === 'POST' && pathname === '/api/auth/change-password') {
    const user = currentUser(req);
    return changePassword(user, await readJson(req), res);
  }
  if (m === 'POST' && pathname === '/api/auth/register') return register(await readJson(req), res);
  if (m === 'POST' && pathname === '/api/auth/login') return login(await readJson(req), res);
  if (m === 'POST' && pathname === '/api/auth/forgot-password') return forgotPassword(await readJson(req), res);
  if (m === 'POST' && pathname === '/api/auth/reset-password') return resetPassword(await readJson(req), res);

  // listings
  if (m === 'GET' && pathname === '/api/listings') return listListings(optionalUser(req), query, res);
  if (m === 'POST' && pathname === '/api/listings') {
    const user = currentUser(req);
    return createListing(user, await readJson(req), res);
  }
  if (m === 'GET' && pathname === '/api/shops') return listShops(res);
  const shopMatch = pathname.match(new RegExp(`^/api/shops/${UUID_PATH}$`));
  if (m === 'GET' && shopMatch) return getShop(optionalUser(req), shopMatch[1], res);
  if (m === 'GET' && pathname === '/api/me/listings') return myListings(currentUser(req), res);
  if (m === 'GET' && pathname === '/api/me/saved') return mySaved(currentUser(req), res);

  let match = pathname.match(new RegExp(`^/api/listings/${UUID_PATH}/save$`));
  if (match && m === 'POST') return toggleSave(currentUser(req), match[1], res);

  match = pathname.match(new RegExp(`^/api/listings/${UUID_PATH}$`));
  if (match) {
    const id = match[1];
    if (m === 'GET') return getListing(optionalUser(req), id, res);
    if (m === 'PATCH') {
      const user = currentUser(req);
      return updateListing(user, id, await readJson(req), res);
    }
    if (m === 'DELETE') return deleteListing(currentUser(req), id, res);
  }

  // verification (members)
  if (m === 'POST' && pathname === '/api/verification') {
    const user = currentUser(req);
    return requestVerification(user, await readJson(req), res);
  }

  // admin
  if (m === 'GET' && pathname === '/api/admin/users') {
    requireAdmin(req);
    return adminListUsers(query, res);
  }
  if (m === 'GET' && pathname === '/api/admin/listings') {
    requireAdmin(req);
    return adminListListings(res);
  }
  match = pathname.match(new RegExp(`^/api/admin/users/${UUID_PATH}/verification$`));
  if (match && m === 'POST') {
    const admin = requireAdmin(req);
    return adminSetVerification(admin, match[1], await readJson(req), res);
  }
  match = pathname.match(new RegExp(`^/api/admin/listings/${UUID_PATH}$`));
  if (match && m === 'DELETE') {
    requireAdmin(req);
    return adminDeleteListing(match[1], res);
  }

  // developer badge (admins only)
  const devMatch = pathname.match(new RegExp(`^/api/admin/users/${UUID_PATH}/developer$`));
  if (m === 'POST' && devMatch) {
    requireAdmin(req);
    return adminSetDeveloper(devMatch[1], await readJson(req), res);
  }

  // uploads and billboard
  if (m === 'POST' && pathname === '/api/uploads') return saveUpload(currentUser(req), await readJson(req, MAX_UPLOAD_BODY_BYTES), res);
  match = pathname.match(/^\/uploads\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/);
  if (m === 'GET' && match) return serveUpload(match[1], res);
  if (m === 'GET' && pathname === '/api/billboard') return getBillboard(res);
  if (m === 'PUT' && pathname === '/api/admin/billboard') {
    requireAdmin(req);
    return adminSetBillboard(await readJson(req, MAX_UPLOAD_BODY_BYTES), res);
  }

  return send(res, 404, { message: 'Route not found.' });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url, 'http://localhost');
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';

  try {
    await dispatch(req, res, url);
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { message: err.message });
    console.error(err);
    return send(res, 500, { message: 'Something went wrong. Please try again.' });
  }
});

server.listen(PORT, () => {
  console.log(`[studmart] API listening on port ${PORT}`);
});
