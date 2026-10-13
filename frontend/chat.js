/* STUDCHAT: buyer and seller chats about listings. Messages refresh by polling. */
(() => {
  const $ = (s) => document.querySelector(s);
  const API_BASE = (window.STUDMART_API_URL || "https://studmart.onrender.com").replace(/\/+$/, "");
  const TOKEN_KEY = "studmart_token";
  const token = (() => { try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; } })();
  const POLL_MS = 4000;
  const LIST_MS = 20000;

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

  const page = $("#chatPage");
  let activeId = null;
  let lastAt = null;
  const seen = new Set();
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

  function bubble(m) {
    return el("div", { class: "chat-msg" + (m.mine ? " mine" : "") },
      m.senderName ? el("span", { class: "chat-sender", text: m.senderName }) : null,
      m.text, el("time", { text: timeLabel(m.createdAt) }));
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

  async function openChat(id) {
    activeId = id;
    lastAt = null;
    seen.clear();
    $("#messages").replaceChildren(el("p", { class: "chat-note", text: "Loading…" }));
    $("#threadEmpty").hidden = true;
    $("#threadBox").hidden = false;
    $("#chatErr").textContent = "";
    page.classList.add("show-thread");
    history.replaceState(null, "", `./chat.html?c=${encodeURIComponent(id)}`);
    try {
      const d = await api(`/api/conversations/${encodeURIComponent(id)}/messages`);
      $("#threadName").textContent = d.conversation.otherName;
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

  async function send(e) {
    e.preventDefault();
    const input = $("#chatText");
    const text = input.value.trim();
    const err = $("#chatErr");
    err.textContent = "";
    if (!text || !activeId) return;
    const btn = $("#sendBtn");
    btn.disabled = true;
    try {
      const d = await api(`/api/conversations/${encodeURIComponent(activeId)}/messages`, { method: "POST", body: { text } });
      const empty = $("#messages .chat-note");
      if (empty) empty.remove();
      addMessages([d.message]);
      input.value = "";
      input.style.height = "";
      $("#messages").scrollTop = $("#messages").scrollHeight;
    } catch (error) {
      err.textContent = error.message;
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }

  $("#chatForm").addEventListener("submit", send);
  $("#chatText").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatForm").requestSubmit(); }
  });
  $("#chatText").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  });
  $("#backBtn").addEventListener("click", () => {
    activeId = null;
    clearInterval(pollTimer);
    page.classList.remove("show-thread");
    history.replaceState(null, "", "./chat.html");
    loadList();
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
