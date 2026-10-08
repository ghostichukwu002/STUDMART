const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(__dirname, 'db.json');
const SCHOOL_EMAIL_DOMAINS_FILE = path.join(__dirname, 'school-email-domains.json');
const FRONTEND = new Set(['index.html', 'styles.css', 'app.js', 'README.md']);

function loadLocalEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#') || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
loadLocalEnv();

function readDb() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2) + '\n'); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  const [scheme, salt, expectedHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', ...headers });
  res.end(payload);
}
function json(res, status, body) { send(res, status, body); }
function notFound(res) { json(res, 404, { error: 'Not found' }); }
function safeUser(user) { if (!user) return null; const { passwordHash, ...publicUser } = user; return publicUser; }
function schoolEmailDomains() {
  try { return JSON.parse(fs.readFileSync(SCHOOL_EMAIL_DOMAINS_FILE, 'utf8')); }
  catch { return {}; }
}
function verificationCodeHash(userId, code) {
  return crypto.createHmac('sha256', process.env.STUDMART_VERIFICATION_SECRET).update(`${userId}:${code}`).digest('hex');
}
function tokenFor(userId) { return crypto.createHash('sha256').update(`${userId}:${Date.now()}:${crypto.randomUUID()}`).digest('hex'); }
function authUser(req, db) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const session = db.sessions.find(item => item.token === token);
  return session ? db.users.find(user => user.id === session.userId) || null : null;
}
async function body(req, maxBytes = 1024 * 1024) {
  let raw = '';
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxBytes) throw Object.assign(new Error('Request body is too large'), { statusCode: 413 });
    raw += chunk;
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('Request body must be valid JSON'); }
}
function requireUser(req, res, db) {
  const user = authUser(req, db);
  if (!user) { json(res, 401, { error: 'Authentication required' }); return null; }
  return user;
}
function queryArray(value) { return value ? String(value).split(',').map(item => item.trim()).filter(Boolean) : []; }
function publicListing(listing, userId) { return { ...listing, saved: Boolean(userId && listing.savedBy.includes(userId)), savedBy: undefined }; }
function seedSchools(db) {
  if (db.schools.length) return;
  const schoolsByState = {
    'Abia':['Abia State University','Michael Okpara University of Agriculture'], 'Adamawa':['Modibbo Adama University','American University of Nigeria'], 'Akwa Ibom':['University of Uyo','Akwa Ibom State University'], 'Anambra':['Nnamdi Azikiwe University','Chukwuemeka Odumegwu Ojukwu University'], 'Bauchi':['Abubakar Tafawa Balewa University','Bauchi State University'], 'Bayelsa':['Niger Delta University','Federal University Otuoke'], 'Benue':['Benue State University','University of Agriculture, Makurdi'], 'Borno':['University of Maiduguri','Borno State University'], 'Cross River':['University of Calabar','Cross River University of Technology'], 'Delta':['Delta State University','Federal University of Petroleum Resources'], 'Ebonyi':['Alex Ekwueme Federal University','Ebonyi State University'], 'Edo':['University of Benin','Edo State University'], 'Ekiti':['Federal University Oye-Ekiti','Ekiti State University'], 'Enugu':['University of Nigeria, Nsukka','Enugu State University of Science and Technology'], 'Gombe':['Gombe State University','Federal University of Kashere'], 'Imo':['Imo State University','Federal University of Technology, Owerri'], 'Jigawa':['Federal University Dutse','Sule Lamido University'], 'Kaduna':['Ahmadu Bello University','Kaduna State University'], 'Kano':['Bayero University Kano','Northwest University Kano'], 'Katsina':['Federal University Dutsin-Ma','Umaru Musa Yar’Adua University'], 'Kebbi':['Federal University Birnin Kebbi','Kebbi State University of Science and Technology'], 'Kogi':['Federal University Lokoja','Kogi State University'], 'Kwara':['University of Ilorin','Kwara State University'], 'Lagos':['University of Lagos','Lagos State University','Yaba College of Technology'], 'Nasarawa':['Nasarawa State University','Federal University of Lafia'], 'Niger':['Federal University of Technology, Minna','Ibrahim Badamasi Babangida University'], 'Ogun':['Covenant University','Federal University of Agriculture, Abeokuta','Olabisi Onabanjo University'], 'Ondo':['Federal University of Technology, Akure','Adekunle Ajasin University'], 'Osun':['Obafemi Awolowo University','Osun State University'], 'Oyo':['University of Ibadan','Ladoke Akintola University of Technology'], 'Plateau':['University of Jos','Plateau State University'], 'Rivers':['University of Port Harcourt','Rivers State University'], 'Sokoto':['Usmanu Danfodiyo University','Sokoto State University'], 'Taraba':['Taraba State University','Federal University Wukari'], 'Yobe':['Yobe State University','Federal University Gashua'], 'Zamfara':['Federal University Gusau','Zamfara State University'], 'Federal Capital Territory':['University of Abuja','Baze University','Nile University of Nigeria']
  };
  for (const [state, names] of Object.entries(schoolsByState)) for (const name of names) db.schools.push({ id: id('school'), name, state });
  writeDb(db);
}

async function handleApi(req, res, pathname, url) {
  const db = readDb();
  seedSchools(db);
  const segments = pathname.split('/').filter(Boolean).slice(1);
  const resource = segments[0];
  const itemId = segments[1];
  const user = authUser(req, db);

  if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, service: 'studmart-api', time: new Date().toISOString() });
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const input = await body(req); const email = String(input.email || '').trim().toLowerCase();
    if (!email || !input.password || !input.name) return json(res, 400, { error: 'name, email, and password are required' });
    if (String(input.password).length < 8) return json(res, 400, { error: 'password must be at least 8 characters' });
    if (db.users.some(item => item.email === email)) return json(res, 409, { error: 'email already registered' });
    const newUser = { id: id('user'), name: String(input.name).trim(), email, passwordHash: hashPassword(input.password), department: '', level: '', campus: '', school: '', state: '', verified: false, memberSince: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }), stats: { listings: 0, rating: 0, sales: 0, saved: 0 } };
    db.users.push(newUser); const token = tokenFor(newUser.id); db.sessions.push({ token, userId: newUser.id, createdAt: new Date().toISOString() }); writeDb(db);
    return json(res, 201, { user: safeUser(newUser), token });
  }
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const input = await body(req); const email = String(input.email || '').trim().toLowerCase();
    const found = db.users.find(item => item.email === email && verifyPassword(input.password || '', item.passwordHash));
    if (!found) return json(res, 401, { error: 'invalid email or password' });
    const token = tokenFor(found.id); db.sessions.push({ token, userId: found.id, createdAt: new Date().toISOString() }); writeDb(db); return json(res, 200, { user: safeUser(found), token });
  }
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    if (!user) return json(res, 401, { error: 'Authentication required' });
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    db.sessions = db.sessions.filter(session => session.token !== token);
    writeDb(db);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && pathname === '/api/verification/email/start') {
    const owner = requireUser(req, res, db); if (!owner) return;
    if (owner.verified) return json(res, 409, { error: 'Your school email is already verified.' });
    if (!owner.school || !owner.state) return json(res, 400, { error: 'Choose your state and school in your profile first.' });
    const school = db.schools.find(item => item.name === owner.school && item.state === owner.state);
    if (!school) return json(res, 400, { error: 'Choose a valid school and state.' });
    const input = await body(req);
    const schoolEmail = String(input.schoolEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(schoolEmail)) return json(res, 400, { error: 'Enter your school-issued email address.' });
    const domain = schoolEmail.split('@').pop();
    const allowedDomains = (schoolEmailDomains()[school.name] || []).map(value => String(value).toLowerCase());
    if (!allowedDomains.some(value => domain === value || domain.endsWith(`.${value}`))) return json(res, 400, { error: 'This school email domain is not configured yet. You can still use StudMart without verification.' });
    const { RESEND_API_KEY, STUDMART_FROM_EMAIL, STUDMART_VERIFICATION_SECRET } = process.env;
    if (!RESEND_API_KEY || !STUDMART_FROM_EMAIL || !STUDMART_VERIFICATION_SECRET) return json(res, 503, { error: 'Email verification is not configured yet.' });
    if (!Array.isArray(db.emailChallenges)) db.emailChallenges = [];
    const previous = db.emailChallenges.find(item => item.userId === owner.id);
    if (previous && Date.now() - Date.parse(previous.sentAt) < 60_000) return json(res, 429, { error: 'Please wait a minute before requesting another code.' });
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const sentAt = new Date().toISOString();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: STUDMART_FROM_EMAIL,
        to: [schoolEmail],
        subject: 'Your StudMart verification code',
        text: `Your StudMart school email verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, 502, { error: result.message || 'Could not send the verification email.' });
    db.emailChallenges = db.emailChallenges.filter(item => item.userId !== owner.id);
    db.emailChallenges.push({ userId: owner.id, email: schoolEmail, school: owner.school, state: owner.state, codeHash: verificationCodeHash(owner.id, code), sentAt, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), attempts: 0 });
    writeDb(db);
    return json(res, 200, { ok: true, message: `A verification code was sent to ${schoolEmail}.` });
  }
  if (req.method === 'POST' && pathname === '/api/verification/email/confirm') {
    const owner = requireUser(req, res, db); if (!owner) return;
    if (owner.verified) return json(res, 200, { user: safeUser(owner) });
    const input = await body(req); const code = String(input.code || '').trim();
    if (!/^\d{6}$/.test(code)) return json(res, 400, { error: 'Enter the six-digit code from your email.' });
    if (!Array.isArray(db.emailChallenges)) db.emailChallenges = [];
    const challenge = db.emailChallenges.find(item => item.userId === owner.id);
    if (!challenge) return json(res, 400, { error: 'Request a verification code first.' });
    if (challenge.school !== owner.school || challenge.state !== owner.state) return json(res, 409, { error: 'Your saved school changed. Request a new code.' });
    if (Date.now() > Date.parse(challenge.expiresAt)) { db.emailChallenges = db.emailChallenges.filter(item => item.userId !== owner.id); writeDb(db); return json(res, 400, { error: 'That code expired. Request a new one.' }); }
    if (challenge.attempts >= 5) { db.emailChallenges = db.emailChallenges.filter(item => item.userId !== owner.id); writeDb(db); return json(res, 429, { error: 'Too many attempts. Request a new code.' }); }
    const actual = Buffer.from(verificationCodeHash(owner.id, code), 'hex'); const expected = Buffer.from(challenge.codeHash, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) { challenge.attempts += 1; writeDb(db); return json(res, 400, { error: 'That code is incorrect. Check it and try again.' }); }
    owner.verified = true; owner.verificationStatus = 'verified'; owner.verifiedSchoolEmail = challenge.email;
    db.emailChallenges = db.emailChallenges.filter(item => item.userId !== owner.id);
    writeDb(db);
    return json(res, 200, { user: safeUser(owner) });
  }
  if (req.method === 'POST' && pathname === '/api/uploads') {
    const owner = requireUser(req, res, db); if (!owner) return;
    const input = await body(req, 7 * 1024 * 1024);
    const match = String(input.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);
    if (!match) return json(res, 400, { error: 'Choose a JPG, PNG, or WebP image.' });
    const imageBytes = Buffer.from(match[2], 'base64');
    if (!imageBytes.length || imageBytes.length > 5 * 1024 * 1024) return json(res, 413, { error: 'Each image must be 5 MB or smaller.' });
    const validSignature = match[1] === 'image/jpeg' ? imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff
      : match[1] === 'image/png' ? imageBytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : imageBytes.subarray(0, 4).toString() === 'RIFF' && imageBytes.subarray(8, 12).toString() === 'WEBP';
    if (!validSignature) return json(res, 400, { error: 'The selected file is not a valid image.' });
    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
    if (!cloudName || !apiKey || !apiSecret) return json(res, 503, { error: 'Image storage is not configured yet.' });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'studmart/listings';
    const publicId = `${owner.id}_${crypto.randomUUID()}`;
    const signatureInput = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureInput).digest('hex');
    const form = new FormData();
    form.append('file', input.dataUrl);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('public_id', publicId);
    form.append('signature', signature);
    const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, { method: 'POST', body: form });
    const uploaded = await cloudResponse.json();
    if (!cloudResponse.ok) return json(res, 502, { error: uploaded.error?.message || 'Image storage rejected the upload.' });
    return json(res, 201, { image: { url: uploaded.secure_url, publicId: uploaded.public_id } });
  }
  if (req.method === 'GET' && pathname === '/api/me') { if (!user) return json(res, 401, { error: 'Authentication required' }); return json(res, 200, { user: safeUser(user) }); }

  if (resource === 'states' && req.method === 'GET') return json(res, 200, { states: [...new Set(db.schools.map(school => school.state))].sort() });
  if (resource === 'schools' && req.method === 'GET') {
    const state = url.searchParams.get('state'); const search = (url.searchParams.get('search') || '').toLowerCase();
    const schools = db.schools.filter(school => (!state || school.state === state) && (!search || school.name.toLowerCase().includes(search)));
    return json(res, 200, { schools });
  }
  if (resource === 'listings' && req.method === 'GET' && !itemId) {
    let listings = [...db.listings]; const category = url.searchParams.get('category'); const search = (url.searchParams.get('search') || '').toLowerCase(); const school = url.searchParams.get('school'); const state = url.searchParams.get('state'); const sort = url.searchParams.get('sort') || 'newest';
    if (category && category !== 'All') listings = listings.filter(item => item.category === category); if (school) listings = listings.filter(item => item.school === school); if (state) listings = listings.filter(item => item.state === state); if (search) listings = listings.filter(item => `${item.title} ${item.category} ${item.seller} ${item.school}`.toLowerCase().includes(search));
    if (sort === 'low') listings.sort((a,b) => a.price - b.price); if (sort === 'high') listings.sort((a,b) => b.price - a.price);
    return json(res, 200, { listings: listings.map(item => publicListing(item, user?.id)), total: listings.length });
  }
  if (resource === 'listings' && req.method === 'GET' && itemId) { const listing = db.listings.find(item => String(item.id) === itemId); return listing ? json(res, 200, { listing: publicListing(listing, user?.id) }) : notFound(res); }
  if (resource === 'listings' && req.method === 'POST') {
    const owner = requireUser(req, res, db); if (!owner) return; const input = await body(req); if (!input.title || !input.price || !input.category) return json(res, 400, { error: 'title, price, and category are required' });
    const images = Array.isArray(input.images) ? input.images.slice(0, 5).map(image => String(image?.url || '')).filter(imageUrl => /^https:\/\/res\.cloudinary\.com\//.test(imageUrl)) : [];
    const listing = { id: Math.max(0, ...db.listings.map(item => Number(item.id))) + 1, title: String(input.title), price: Number(input.price), category: String(input.category), emoji: input.emoji || '＋', images, seller: owner.name, sellerId: owner.id, initials: owner.name.split(/\s+/).map(word => word[0]).join('').slice(0,2).toUpperCase(), location: input.location || owner.campus || 'Main Campus', condition: input.condition || 'New', school: input.school || owner.school || '', state: input.state || owner.state || '', savedBy: [], desc: input.desc || '' };
    db.listings.unshift(listing); owner.stats.listings += 1; writeDb(db); return json(res, 201, { listing: publicListing(listing, owner.id) });
  }
  if (resource === 'listings' && req.method === 'PATCH' && itemId) { const owner = requireUser(req, res, db); if (!owner) return; const listing = db.listings.find(item => String(item.id) === itemId); if (!listing) return notFound(res); if (listing.sellerId !== owner.id) return json(res, 403, { error: 'only the seller can edit this listing' }); const input = await body(req); Object.assign(listing, Object.fromEntries(['title','price','category','location','condition','school','state','desc','emoji'].filter(key => input[key] !== undefined).map(key => [key, key === 'price' ? Number(input[key]) : String(input[key])] ))); writeDb(db); return json(res, 200, { listing: publicListing(listing, owner.id) }); }

  if (resource === 'saved' && req.method === 'GET') { const owner = requireUser(req, res, db); if (!owner) return; return json(res, 200, { listings: db.listings.filter(item => item.savedBy.includes(owner.id)).map(item => publicListing(item, owner.id)) }); }
  if (resource === 'saved' && req.method === 'POST' && itemId) { const owner = requireUser(req, res, db); if (!owner) return; const listing = db.listings.find(item => String(item.id) === itemId); if (!listing) return notFound(res); if (!listing.savedBy.includes(owner.id)) listing.savedBy.push(owner.id); writeDb(db); return json(res, 201, { saved: true, listing: publicListing(listing, owner.id) }); }
  if (resource === 'saved' && req.method === 'DELETE' && itemId) { const owner = requireUser(req, res, db); if (!owner) return; const listing = db.listings.find(item => String(item.id) === itemId); if (!listing) return notFound(res); listing.savedBy = listing.savedBy.filter(idValue => idValue !== owner.id); writeDb(db); return json(res, 200, { saved: false }); }

  if (resource === 'users' && itemId && req.method === 'GET') { const found = db.users.find(item => item.id === itemId); return found ? json(res, 200, { user: safeUser(found) }) : notFound(res); }
  if (resource === 'profile' && req.method === 'PATCH') {
    const owner = requireUser(req, res, db); if (!owner) return;
    const input = await body(req);
    if ((input.school !== undefined || input.state !== undefined) && owner.verified && (String(input.school ?? owner.school) !== owner.school || String(input.state ?? owner.state) !== owner.state)) return json(res, 409, { error: 'Verified school details cannot be changed.' });
    const school = String(input.school ?? owner.school ?? ''); const state = String(input.state ?? owner.state ?? '');
    if ((input.school !== undefined || input.state !== undefined) && school && state && !db.schools.some(item => item.name === school && item.state === state)) return json(res, 400, { error: 'Choose a valid school and state.' });
    Object.assign(owner, Object.fromEntries(['name','department','level','campus'].filter(key => input[key] !== undefined).map(key => [key, String(input[key])] )));
    if (input.school !== undefined || input.state !== undefined) { owner.school = school; owner.state = state; }
    writeDb(db); return json(res, 200, { user: safeUser(owner) });
  }

  if (resource === 'conversations' && req.method === 'POST' && !itemId) {
    const owner = requireUser(req, res, db); if (!owner) return;
    const input = await body(req); const listing = db.listings.find(item => String(item.id) === String(input.listingId || ''));
    if (!listing) return notFound(res);
    if (!listing.sellerId) return json(res, 400, { error: 'This listing has no seller account to message.' });
    if (listing.sellerId === owner.id) return json(res, 400, { error: 'You cannot start a conversation with yourself.' });
    if (!db.users.some(item => item.id === listing.sellerId)) return json(res, 409, { error: 'This seller has not joined StudMart yet.' });
    let conversation = db.conversations.find(item => item.listingId === listing.id && item.userIds.includes(owner.id) && item.userIds.includes(listing.sellerId));
    if (!conversation) {
      conversation = { id: id('conversation'), userIds: [owner.id, listing.sellerId], listingId: listing.id, messages: [] };
      db.conversations.unshift(conversation); writeDb(db);
    }
    const otherUser = db.users.find(item => item.id === listing.sellerId);
    return json(res, 201, { conversation: { ...conversation, otherUserName: otherUser?.name || listing.seller, listingTitle: listing.title } });
  }
  if (resource === 'conversations' && req.method === 'GET' && !itemId) {
    const owner = requireUser(req, res, db); if (!owner) return;
    const conversations = db.conversations.filter(item => item.userIds.includes(owner.id)).map(item => {
      const otherId = item.userIds.find(userId => userId !== owner.id);
      const otherUser = db.users.find(userItem => userItem.id === otherId);
      const listing = db.listings.find(listingItem => listingItem.id === item.listingId);
      return { ...item, otherUserName: otherUser?.name || listing?.seller || 'Student', listingTitle: listing?.title || '', messages: item.messages.slice(-1) };
    });
    return json(res, 200, { conversations });
  }
  if (resource === 'conversations' && itemId && req.method === 'GET') {
    const owner = requireUser(req, res, db); if (!owner) return;
    const conversation = db.conversations.find(item => item.id === itemId && item.userIds.includes(owner.id));
    if (!conversation) return notFound(res);
    const otherId = conversation.userIds.find(userId => userId !== owner.id);
    const otherUser = db.users.find(item => item.id === otherId);
    const listing = db.listings.find(item => item.id === conversation.listingId);
    return json(res, 200, { conversation: { ...conversation, otherUserName: otherUser?.name || listing?.seller || 'Student', listingTitle: listing?.title || '' } });
  }
  if (resource === 'conversations' && itemId && req.method === 'POST') { const owner = requireUser(req, res, db); if (!owner) return; const conversation = db.conversations.find(item => item.id === itemId && item.userIds.includes(owner.id)); if (!conversation) return notFound(res); const input = await body(req); const text = String(input.text || '').trim(); if (!text) return json(res, 400, { error: 'text is required' }); if (text.length > 2000) return json(res, 400, { error: 'messages must be 2,000 characters or fewer' }); const message = { id: id('message'), senderId: owner.id, text, createdAt: new Date().toISOString() }; conversation.messages.push(message); writeDb(db); return json(res, 201, { message }); }

  return notFound(res);
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!FRONTEND.has(requested) && !requested.startsWith('assets/')) return notFound(res);
  const file = path.resolve(ROOT, requested); if (!file.startsWith(ROOT)) return notFound(res);
  fs.readFile(file, (error, content) => { if (error) return notFound(res); const ext = path.extname(file); const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.md':'text/markdown; charset=utf-8' }; res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); const pathname = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '');
  try { if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, url); return serveStatic(req, res, pathname); } catch (error) { console.error(error); return json(res, error.statusCode || 400, { error: error.message || 'Request failed' }); }
});
server.listen(PORT, HOST, () => console.log(`STUDMART API running at http://localhost:${PORT}`));
