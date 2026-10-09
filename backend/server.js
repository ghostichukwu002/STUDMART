// STUDMART API — clean starter backend. Node.js 18+; JSON file database for demo/small deployments.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "*").split(",").map(x => x.trim()).filter(Boolean);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "db.json");
const TOKEN_SECRET = process.env.TOKEN_SECRET || "";
const MAX_BODY = 1_000_000;
let db = { users: [], listings: [], saved: [], conversations: [], messages: [], revokedTokens: [] };

function readDb() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    db = { ...db, ...parsed };
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Could not read database:", e.message);
    saveDb();
  }
}
function saveDb() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, passwordSalt, ...safe } = u;
  return safe;
}
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
function cors(req, res) {
  const origin = req.headers.origin;
  const allow = FRONTEND_ORIGIN.includes("*") ? "*" : (FRONTEND_ORIGIN.includes(origin) ? origin : FRONTEND_ORIGIN[0]);
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = "", size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Request body too large."), { status: 413 })); req.destroy(); return; }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error("Invalid JSON body."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => crypto.scrypt(String(password), salt, 64, (e, key) => e ? reject(e) : resolve({ salt, hash: key.toString("hex") })));
}
async function passwordMatches(password, user) {
  const derived = await hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(derived.hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}
function signToken(user) {
  if (!TOKEN_SECRET) throw new Error("Server TOKEN_SECRET is not configured.");
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}
function verifyToken(token) {
  if (!TOKEN_SECRET || !token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest();
  let actual;
  try { actual = Buffer.from(sig, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  let p; try { p = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return null; }
  if (!p.sub || p.exp < Date.now() || db.revokedTokens.includes(token)) return null;
  return db.users.find(u => u.id === p.sub) || null;
}
function currentUser(req) {
  const header = req.headers.authorization || "";
  return verifyToken(header.startsWith("Bearer ") ? header.slice(7) : "");
}
function needUser(req, res) {
  const user = currentUser(req);
  if (!user) { json(res, 401, { error: "Please log in to continue." }); return null; }
  return user;
}
function cleanString(v, max = 120) { return String(v ?? "").trim().slice(0, max); }
function listingPublic(p) {
  const seller = db.users.find(u => u.id === p.sellerId);
  return { ...p, sellerName: seller?.name || "STUDMART student", seller: seller ? { id: seller.id, name: seller.name, campus: seller.campus } : null };
}
function ownedConversation(c, uid) { return c && (c.participantIds || []).includes(uid); }
function routeId(urlPath, pattern) { const m = urlPath.match(pattern); return m ? decodeURIComponent(m[1]) : null; }
async function handle(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;
  try {
    if (method === "GET" && p === "/api/health") return json(res, 200, { ok: true, service: "STUDMART API", timestamp: now() });
    if (method === "GET" && p === "/api/listings") {
      const items = db.listings.filter(x => x.status !== "deleted").slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(listingPublic);
      return json(res, 200, { listings: items });
    }
    if (method === "POST" && p === "/api/auth/register") {
      const b = await body(req), name = cleanString(b.name,80), email = cleanString(b.email,254).toLowerCase(), password = String(b.password || "");
      if (name.length < 2) return json(res,400,{error:"Please enter your full name."});
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res,400,{error:"Enter a valid email address."});
      if (password.length < 8) return json(res,400,{error:"Password must be at least 8 characters."});
      if (db.users.some(u=>u.email===email)) return json(res,409,{error:"An account with this email already exists. Please log in."});
      const h = await hashPassword(password);
      const user = { id:id(), name, email, department:cleanString(b.department,100), level:cleanString(b.level,30), campus:cleanString(b.campus,120), passwordSalt:h.salt, passwordHash:h.hash, createdAt:now() };
      db.users.push(user); saveDb();
      const token = signToken(user);
      return json(res,201,{token,user:publicUser(user)});
    }
    if (method === "POST" && p === "/api/auth/login") {
      const b = await body(req), email = cleanString(b.email,254).toLowerCase(), password = String(b.password || "");
      const user = db.users.find(u=>u.email===email);
      if (!user || !(await passwordMatches(password,user))) return json(res,401,{error:"Email or password is incorrect."});
      return json(res,200,{token:signToken(user),user:publicUser(user)});
    }
    if (method === "POST" && p === "/api/auth/logout") {
      const token = (req.headers.authorization || "").replace(/^Bearer\s+/,"");
      if (token && !db.revokedTokens.includes(token)) { db.revokedTokens.push(token); if(db.revokedTokens.length>5000) db.revokedTokens=db.revokedTokens.slice(-3000); saveDb(); }
      return json(res,200,{ok:true});
    }
    if (method === "GET" && p === "/api/me") {
      const u = needUser(req,res); if(!u)return;
      return json(res,200,{user:publicUser(u)});
    }
    if (method === "PATCH" && p === "/api/profile") {
      const u=needUser(req,res);if(!u)return;const b=await body(req);
      if (b.name !== undefined) { const n=cleanString(b.name,80); if(n.length<2)return json(res,400,{error:"Name must contain at least 2 characters."});u.name=n; }
      for(const k of ["department","level","campus"]) if(b[k]!==undefined)u[k]=cleanString(b[k],k==="department"?100: k==="level"?30:120);
      saveDb();return json(res,200,{user:publicUser(u)});
    }
    if (method === "POST" && p === "/api/listings") {
      const u=needUser(req,res);if(!u)return;const b=await body(req);
      const title=cleanString(b.title,100),description=cleanString(b.description,1500),category=cleanString(b.category,60),price=Number(b.price);
      if(title.length<3)return json(res,400,{error:"Title must contain at least 3 characters."});
      if(!description)return json(res,400,{error:"Please add a description."});
      if(!Number.isFinite(price)||price<0)return json(res,400,{error:"Enter a valid price."});
      const item={id:id(),title,description,category:category||"Other",price,location:cleanString(b.location,120),condition:cleanString(b.condition,40)||"Good",imageUrl:cleanString(b.imageUrl,1000),sellerId:u.id,campus:u.campus||"",status:"active",createdAt:now(),updatedAt:now()};
      db.listings.push(item);saveDb();return json(res,201,{listing:listingPublic(item)});
    }
    const listingMatch=routeId(p,/^\/api\/listings\/([^/]+)$/);
    if(listingMatch && method==="GET"){const item=db.listings.find(x=>x.id===listingMatch&&x.status!=="deleted");if(!item)return json(res,404,{error:"Listing not found."});return json(res,200,{listing:listingPublic(item)});}
    if(listingMatch && method==="PATCH"){const u=needUser(req,res);if(!u)return;const item=db.listings.find(x=>x.id===listingMatch&&x.sellerId===u.id);if(!item)return json(res,404,{error:"Listing not found or you do not own it."});const b=await body(req);for(const k of ["title","description","category","location","condition","imageUrl"])if(b[k]!==undefined)item[k]=cleanString(b[k],k==="description"?1500:k==="imageUrl"?1000:120);if(b.price!==undefined){const price=Number(b.price);if(!Number.isFinite(price)||price<0)return json(res,400,{error:"Enter a valid price."});item.price=price;}item.updatedAt=now();saveDb();return json(res,200,{listing:listingPublic(item)});}
    if(listingMatch && method==="DELETE"){const u=needUser(req,res);if(!u)return;const item=db.listings.find(x=>x.id===listingMatch&&x.sellerId===u.id);if(!item)return json(res,404,{error:"Listing not found or you do not own it."});item.status="deleted";saveDb();return json(res,200,{ok:true});}
    if (method === "GET" && p === "/api/saved") {
      const u=needUser(req,res);if(!u)return;const ids=db.saved.filter(s=>s.userId===u.id).map(s=>s.listingId);
      return json(res,200,{saved:ids.map(listingId=>({listingId,listing:db.listings.find(l=>l.id===listingId)})).filter(x=>x.listing?.status!=="deleted").map(x=>({listingId:x.listingId,id:x.listingId}))});
    }
    if (method === "POST" && p === "/api/saved") {
      const u=needUser(req,res);if(!u)return;const b=await body(req),listingId=cleanString(b.listingId,100);
      if(!db.listings.some(l=>l.id===listingId&&l.status!=="deleted"))return json(res,404,{error:"Listing not found."});
      if(!db.saved.some(s=>s.userId===u.id&&s.listingId===listingId)){db.saved.push({userId:u.id,listingId,createdAt:now()});saveDb();}
      return json(res,201,{ok:true,listingId});
    }
    const savedMatch=routeId(p,/^\/api\/saved\/([^/]+)$/);
    if(savedMatch&&method==="DELETE"){const u=needUser(req,res);if(!u)return;db.saved=db.saved.filter(s=>!(s.userId===u.id&&s.listingId===savedMatch));saveDb();return json(res,200,{ok:true});}
    if (method === "GET" && p === "/api/conversations") {
      const u=needUser(req,res);if(!u)return;const convs=db.conversations.filter(c=>ownedConversation(c,u.id)).map(c=>{const otherId=c.participantIds.find(x=>x!==u.id);const other=db.users.find(x=>x.id===otherId);const msgs=db.messages.filter(m=>m.conversationId===c.id);return {...c,otherUser:publicUser(other),lastMessage:msgs.at(-1)?.text||"",updatedAt:msgs.at(-1)?.createdAt||c.createdAt};}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
      return json(res,200,{conversations:convs});
    }
    if (method === "POST" && p === "/api/conversations") {
      const u=needUser(req,res);if(!u)return;const b=await body(req),listing=db.listings.find(x=>x.id===String(b.listingId)&&x.status!=="deleted");
      if(!listing)return json(res,404,{error:"Listing not found."});
      const otherId=listing.sellerId;if(otherId===u.id)return json(res,400,{error:"You cannot message yourself about your own listing."});
      if(!db.users.some(x=>x.id===otherId))return json(res,400,{error:"Seller account is no longer available."});
      let c=db.conversations.find(x=>x.listingId===listing.id&&x.participantIds.includes(u.id)&&x.participantIds.includes(otherId));
      if(!c){c={id:id(),listingId:listing.id,productTitle:listing.title,participantIds:[u.id,otherId],createdAt:now()};db.conversations.push(c);saveDb();}
      const other=db.users.find(x=>x.id===otherId);return json(res,200,{conversation:{...c,otherUser:publicUser(other)}});
    }
    const convMatch=routeId(p,/^\/api\/conversations\/([^/]+)$/);
    if(convMatch&&method==="GET"){const u=needUser(req,res);if(!u)return;const c=db.conversations.find(x=>x.id===convMatch);if(!ownedConversation(c,u.id))return json(res,404,{error:"Conversation not found."});return json(res,200,{conversation:c});}
    const messagesMatch=routeId(p,/^\/api\/conversations\/([^/]+)\/messages$/);
    if(messagesMatch&&method==="GET"){const u=needUser(req,res);if(!u)return;const c=db.conversations.find(x=>x.id===messagesMatch);if(!ownedConversation(c,u.id))return json(res,404,{error:"Conversation not found."});return json(res,200,{messages:db.messages.filter(m=>m.conversationId===c.id).map(m=>({...m,sender:publicUser(db.users.find(x=>x.id===m.senderId))}))});}
    if(messagesMatch&&method==="POST"){const u=needUser(req,res);if(!u)return;const c=db.conversations.find(x=>x.id===messagesMatch);if(!ownedConversation(c,u.id))return json(res,404,{error:"Conversation not found."});const b=await body(req),text=cleanString(b.text||b.message,2000);if(!text)return json(res,400,{error:"Message cannot be empty."});const msg={id:id(),conversationId:c.id,senderId:u.id,text,createdAt:now()};db.messages.push(msg);saveDb();return json(res,201,{message:msg});}
    return json(res,404,{error:"API route not found."});
  } catch (err) {
    console.error(err);
    return json(res,err.status||500,{error:err.status?err.message:"Server error. Please try again."});
  }
}
readDb();
const server=http.createServer((req,res)=>handle(req,res));
server.listen(PORT,"0.0.0.0",()=>console.log(`STUDMART API listening on port ${PORT}`));
