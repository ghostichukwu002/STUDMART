/* STUDCHAT: campus group and listing chats. Messages refresh by polling. Photos load with the login token. */
(() => {
  const $ = (s) => document.querySelector(s);
  const API_BASE = (window.STUDMART_API_URL || "https://studmart.onrender.com").replace(/\/+$/, "");
  const TOKEN_KEY = "studmart_token";
  const token = (() => { try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; } })();
  const POLL_MS = 4000;
  const LIST_MS = 20000;
  const PHOTO_MAX_EDGE = 1600;           // px, longest side, before upload
  const PHOTO_MAX_BYTES = 3 * 1024 * 1024;

  // Build DOM nodes from data, never innerHTML with user text
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }

  // Same badges as the marketplace
  const tick = (v) => (v ? el("span", { class: "tick", title: "Verified student", "aria-label": "Verified student", text: "✓" }) : null);
  const devBadge = (v) => (v ? el("span", { class: "dev-badge", title: "STUDMART developer", "aria-label": "STUDMART developer", text: "✓" }) : null);
  const shopBadge = (v) => (v ? el("span", { class: "shop-badge", text: "SHOP" }) : null);

  async function api(path, { method = "GET", body } = {}) {
    let r;
    try {
      r = await fetch(API_BASE + path, {
        method,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new Error("We couldn't reach STUDMART. Check your connection."); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.message || `Request failed (${r.status})`); e.status = r.status; throw e; }
    return d;
  }

  async function apiBlob(path) {
    let r;
    try {
      r = await fetch(API_BASE + path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    } catch { throw new Error("We couldn't reach STUDMART. Check your connection."); }
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      const e = new Error(d.message || `Request failed (${r.status})`); e.status = r.status; throw e;
    }
    return r.blob();
  }

  const page = $("#chatPage");
  let activeId = null;
  let lastAt = null;
  const seen = new Set();
  const nodeById = new Map();            // message id -> { node, m }
  const photoUrls = new Map();           // message id -> object URL, for normal photos
  let viewerUrl = null;                  // object URL of the photo open in the viewer
  let viewerOwnsUrl = false;             // true for view-once photos, which are revoked on close
  let draftPhoto = null;                 // data URL of the photo waiting to be sent
  let pollTimer = 0;

  function timeLabel(iso) {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString("en-NG", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
  }

  function signedOut() {
    $("#convList").replaceChildren(el("p", { class: "chat-note" },
      "Log in to see your chats.", el("br"), el("a", { class: "plain", href: "./index.html" }, "Go to STUDMART ↗")));
    $("#threadEmpty").hidden = false;
    $("#threadBox").hidden = true;
  }

  async function loadList() {
    if (!token) return signedOut();
    try {
      const d = await api("/api/me/conversations");
      const list = d.conversations;
      if (!list.length) {
        $("#convList").replaceChildren(el("p", { class: "chat-note", text: "No chats yet. Open a listing and tap Message seller." }));
        return;
      }
      $("#convList").replaceChildren(...list.map((c) => el("a", {
        class: "conv" + (c.id === activeId ? " active" : ""),
        href: `./chat.html?c=${encodeURIComponent(c.id)}`,
        onclick: (e) => { e.preventDefault(); openChat(c.id); },
      },
        el("b", { text: c.otherName }),
        el("small", { text: c.listingTitle }),
        el("small", {}, c.lastMessage ? el("span", {}, c.lastMessage.mine ? el("em", { text: "You: " }) : null, c.lastMessage.text) : "No messages yet")
      )));
    } catch (err) {
      if (err.status === 401) return signedOut();
      $("#convList").replaceChildren(el("p", { class: "chat-note", text: `Couldn't load chats: ${err.message}` }));
    }
  }

  // ---------- profile sheet ----------
  function openProfile(id) {
    const modal = $("#peerModal");
    const body = $("#peerBody");
    body.replaceChildren(el("p", { class: "chat-note", text: "Loading…" }));
    modal.hidden = false;
    api(`/api/users/${encodeURIComponent(id)}/profile`)
      .then((d) => body.replaceChildren(profileView(d.profile)))
      .catch((err) => body.replaceChildren(el("p", { class: "chat-note", text: err.message })));
  }
  function closeProfile() { $("#peerModal").hidden = true; }

  function profileView(p) {
    const initials = (p.name || "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const avatar = el("div", { class: "peer-avatar" }, p.avatarUrl ? el("img", { src: API_BASE + p.avatarUrl, alt: "" }) : initials);
    const meta = [p.school, p.memberSince ? `Member since ${new Date(p.memberSince).toLocaleDateString("en-NG", { month: "short", year: "numeric" })}` : ""].filter(Boolean).join(" · ");
    const kids = [
      el("div", { class: "peer-head" }, avatar, el("div", {},
        el("div", { class: "peer-name" }, p.name, tick(p.verified), devBadge(p.developer), shopBadge(p.shop)),
        el("p", { class: "peer-meta", text: meta }))),
      p.bio ? el("p", { class: "peer-bio", text: p.bio }) : null,
    ];
    if (p.shop) {
      kids.push(el("div", { class: "peer-shop" },
        el("b", { text: p.shop.name || "Shop" }),
        p.shop.description ? el("div", { text: p.shop.description }) : null,
        p.shop.address ? el("div", { text: `📍 ${p.shop.address}` }) : null));
    }
    kids.push(el("h3", { text: "Listings" }));
    if (!p.listings.length) kids.push(el("p", { class: "chat-note", text: "No active listings right now." }));
    else kids.push(...p.listings.map((l) => el("a", { class: "peer-listing", href: `./index.html?listing=${encodeURIComponent(l.id)}` },
      el("b", { text: l.title }), el("span", { text: `₦${Number(l.price).toLocaleString("en-NG")}` }))));
    return el("div", {}, ...kids);
  }

  // ---------- photos ----------
  function closeViewer() {
    const full = $("#photoFull");
    if (viewerOwnsUrl && full.src) URL.revokeObjectURL(full.src);
    full.removeAttribute("src");
    viewerOwnsUrl = false;
    $("#photoView").hidden = true;
  }

  async function openPhoto(m, once) {
    const full = $("#photoFull");
    try {
      let url;
      if (!once && photoUrls.has(m.id)) {
        url = photoUrls.get(m.id);
      } else {
        // view-once photos are fetched fresh and never cached, so they can't be reopened from memory
        url = URL.createObjectURL(await apiBlob(`/api/messages/${encodeURIComponent(m.id)}/image`));
        if (!once) photoUrls.set(m.id, url);
      }
      closeViewer();
      full.src = url;
      viewerOwnsUrl = once;
      $("#photoNote").textContent = once && !m.mine ? "View once: this photo can't be opened again." : "";
      $("#photoView").hidden = false;
      if (once && !m.mine) markOpened(m.id);
    } catch (err) {
      if (err.status === 410) { markOpened(m.id); $("#chatErr").textContent = "This photo was already opened."; }
      else $("#chatErr").textContent = err.message;
    }
  }

  // swap a view-once bubble to its "opened" state
  function markOpened(id) {
    const entry = nodeById.get(id);
    if (!entry) return;
    const m = { ...entry.m, image: { ...entry.m.image, opened: true } };
    const next = bubble(m);
    entry.node.replaceWith(next);
  }

  async function loadPhoto(id, img) {
    try {
      let url = photoUrls.get(id);
      if (!url) {
        url = URL.createObjectURL(await apiBlob(`/api/messages/${encodeURIComponent(id)}/image`));
        photoUrls.set(id, url);
      }
      img.src = url;
    } catch {
      img.alt = "Photo unavailable";
    }
  }

  function photoPart(m) {
    const img = m.image;
    if (img.viewOnce && !m.mine && img.opened) return el("p", { class: "chat-gone", text: "📷 View-once photo · opened" });
    if (img.viewOnce && !m.mine) {
      return el("button", { class: "chat-open", type: "button", onclick: () => openPhoto(m, true) }, "📷 Photo", el("small", { text: "View once" }));
    }
    if (img.viewOnce && m.mine) {
      return el("button", { class: "chat-open", type: "button", onclick: () => openPhoto(m, false) },
        "📷 View-once photo", el("small", { text: img.opened ? "Opened" : "Not opened yet" }));
    }
    const pic = el("img", { class: "chat-photo", alt: "Photo", draggable: "false", onclick: () => openPhoto(m, false) });
    loadPhoto(m.id, pic);
    return pic;
  }

  // ---------- messages ----------
  function bubble(m) {
    const node = el("div", { class: "chat-msg" + (m.mine ? " mine" : "") },
      !m.mine && m.sender ? el("button", { class: "chat-who", type: "button", onclick: () => openProfile(m.sender.id) },
        el("b", { text: m.sender.name }), tick(m.sender.verified), devBadge(m.sender.developer), shopBadge(m.sender.shop)) : null,
      m.image ? photoPart(m) : null,
      m.text ? el("span", { class: "chat-text", text: m.text }) : null,
      el("time", { text: timeLabel(m.createdAt) }));
    nodeById.set(m.id, { node, m });
    return node;
  }

  function addMessages(list) {
    const box = $("#messages");
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    let added = 0;
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      box.append(bubble(m));
      if (!lastAt || m.createdAt > lastAt) lastAt = m.createdAt;
      added++;
    }
    if (added && (nearBottom || box.childElementCount <= added)) box.scrollTop = box.scrollHeight;
  }

  function setThreadName(conv) {
    const name = $("#threadName");
    name.textContent = conv.otherName;
    const peer = conv.other && conv.other.id;
    name.classList.toggle("tap", !!peer);
    name.onclick = peer ? () => openProfile(peer) : null;
  }

  async function openChat(id) {
    activeId = id;
    lastAt = null;
    seen.clear();
    nodeById.clear();
    $("#messages").replaceChildren(el("p", { class: "chat-note", text: "Loading…" }));
    $("#threadEmpty").hidden = true;
    $("#threadBox").hidden = false;
    $("#chatErr").textContent = "";
    page.classList.add("show-thread");
    history.replaceState(null, "", `./chat.html?c=${encodeURIComponent(id)}`);
    try {
      const d = await api(`/api/conversations/${encodeURIComponent(id)}/messages`);
      setThreadName(d.conversation);
      $("#threadListing").textContent = d.conversation.listingTitle;
      const isGroup = d.conversation.kind === "group";
      $("#threadLink").hidden = isGroup;
      if (!isGroup) $("#threadLink").href = `./index.html?listing=${encodeURIComponent(d.conversation.listingId)}`;
      $("#messages").replaceChildren();
      if (!d.messages.length) $("#messages").append(el("p", { class: "chat-note", text: isGroup ? "Welcome to the campus group. Say hello to students across STUDMART." : "Say hello. Ask if it's still available, and where you can meet on campus." }));
      addMessages(d.messages);
      $("#messages").scrollTop = $("#messages").scrollHeight;
    } catch (err) {
      $("#messages").replaceChildren(el("p", { class: "chat-note", text: err.message }));
    }
    loadList();
    restartPolling();
  }

  async function poll() {
    if (!activeId || document.hidden) return;
    try {
      const q = lastAt ? `?after=${encodeURIComponent(lastAt)}` : "";
      const d = await api(`/api/conversations/${encodeURIComponent(activeId)}/messages${q}`);
      if (d.messages.length) {
        const empty = $("#messages .chat-note");
        if (empty) empty.remove();
        addMessages(d.messages);
      }
    } catch { /* keep trying on the next tick */ }
  }

  function restartPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, POLL_MS);
  }

  // ---------- photo drafts ----------
  // Resize in the browser before upload: keeps phone photos well under the server limit.
  async function shrinkPhoto(file) {
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let quality = 0.85;
      let url = canvas.toDataURL("image/jpeg", quality);
      while (url.length * 0.75 > PHOTO_MAX_BYTES && quality > 0.5) {
        quality -= 0.1;
        url = canvas.toDataURL("image/jpeg", quality);
      }
      if (url.length * 0.75 > PHOTO_MAX_BYTES) throw new Error("That photo is too large. Try a smaller one.");
      return url;
    } catch (err) {
      throw err.message && err.message.startsWith("That photo") ? err : new Error("We couldn't read that photo. Try a JPEG, PNG or WebP image.");
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  function clearDraft() {
    draftPhoto = null;
    $("#photoPreview").removeAttribute("src");
    $("#photoDraft").hidden = true;
    $("#viewOnce").checked = false;
    $("#photoInput").value = "";
  }

  async function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    $("#chatErr").textContent = "";
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      $("#chatErr").textContent = "Please choose a JPEG, PNG or WebP photo.";
      e.target.value = "";
      return;
    }
    try {
      draftPhoto = await shrinkPhoto(file);
      $("#photoPreview").src = draftPhoto;
      $("#photoDraft").hidden = false;
    } catch (err) {
      $("#chatErr").textContent = err.message;
      clearDraft();
    }
  }

  async function send(e) {
    e.preventDefault();
    const input = $("#chatText");
    const text = input.value.trim();
    const err = $("#chatErr");
    err.textContent = "";
    if ((!text && !draftPhoto) || !activeId) return;
    const btn = $("#sendBtn");
    btn.disabled = true;
    const body = { text };
    if (draftPhoto) { body.image = draftPhoto; body.viewOnce = $("#viewOnce").checked; }
    try {
      const d = await api(`/api/conversations/${encodeURIComponent(activeId)}/messages`, { method: "POST", body });
      const empty = $("#messages .chat-note");
      if (empty) empty.remove();
      addMessages([d.message]);
      input.value = "";
      input.style.height = "";
      clearDraft();
      $("#messages").scrollTop = $("#messages").scrollHeight;
    } catch (error) {
      err.textContent = error.message;
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }

  // ---------- wiring ----------
  $("#chatForm").addEventListener("submit", send);
  $("#chatText").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatForm").requestSubmit(); }
  });
  $("#chatText").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  });
  $("#photoInput").addEventListener("change", pickPhoto);
  $("#photoCancel").addEventListener("click", clearDraft);
  $("#backBtn").addEventListener("click", () => {
    activeId = null;
    clearInterval(pollTimer);
    page.classList.remove("show-thread");
    history.replaceState(null, "", "./chat.html");
    loadList();
  });
  document.querySelectorAll("[data-peer-close]").forEach((b) => b.addEventListener("click", closeProfile));
  $("#photoClose").addEventListener("click", closeViewer);
  $("#photoView").addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#photoView").hidden) closeViewer();
    else if (!$("#peerModal").hidden) closeProfile();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

  const start = new URLSearchParams(location.search).get("c");
  loadList();
  setInterval(loadList, LIST_MS);
  if (!token) return signedOut();
  if (start && /^[0-9a-f-]{36}$/.test(start)) openChat(start);
  else {
    $("#threadEmpty").hidden = false;
    $("#threadBox").hidden = true;
    // on desktop, land in the campus group so there is always something to read
    if (window.matchMedia("(min-width: 721px)").matches) {
      api("/api/me/conversations").then((d) => {
        const g = d.conversations.find((c) => c.kind === "group");
        if (g && !activeId) openChat(g.id);
      }).catch(() => {});
    }
  }
})();
