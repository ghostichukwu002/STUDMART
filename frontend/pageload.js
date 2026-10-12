/* STUDMART loading feedback, loaded on every page.
   1. Page change: a full-screen overlay with the logo and a top progress bar
      shows when a same-site link is followed or a page is about to unload.
      It hides when the new page is shown (including back/forward cache).
   2. Button clicks: the button that was just clicked gets a spinner until the
      request it started (window.fetch) finishes.
   Skips: external links, new-tab links, downloads, in-page anchors, chips,
   close/menu buttons, disabled buttons, and anything marked data-no-busy.
   Respects prefers-reduced-motion (spinners and pulses stop, state still shows). */
(() => {
  if (window.__studmartPageload) return;
  window.__studmartPageload = true;

  // ---------- styles (injected so every page gets them) ----------
  const style = document.createElement("style");
  style.textContent = `
#pl-bar{position:fixed;top:0;left:0;right:0;height:3px;z-index:10000;background:#ea580c;transform:scaleX(0);transform-origin:0 50%;opacity:0;pointer-events:none;transition:opacity .2s}
#pl-bar.on{opacity:1;animation:pl-bar 1.1s ease-in-out infinite}
@keyframes pl-bar{0%{transform:scaleX(0);transform-origin:0 50%}50%{transform:scaleX(.8);transform-origin:0 50%}51%{transform-origin:100% 50%}100%{transform:scaleX(0);transform-origin:100% 50%}}
#pl-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(255,250,245,.9);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .2s}
#pl-overlay.on{opacity:1;pointer-events:auto}
#pl-overlay img{width:64px;height:auto;animation:pl-pulse 1.1s ease-in-out infinite}
@keyframes pl-pulse{0%,100%{transform:scale(.9) rotate(-5deg);opacity:.55}50%{transform:scale(1.06) rotate(3deg);opacity:1}}
.is-loading{pointer-events:none!important;cursor:progress!important;opacity:.78}
.is-loading,.is-loading *{color:transparent!important}
.is-loading::after{content:"";position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid #ea580c;border-right-color:transparent;border-radius:50%;animation:pl-spin .7s linear infinite;box-sizing:border-box}
.is-loading.dark::after,.is-loading.btn.dark::after{border-color:#fff;border-right-color:transparent}
@keyframes pl-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){
  #pl-overlay,#pl-bar{transition:none}
  #pl-overlay img,#pl-bar.on,.is-loading::after{animation:none!important}
  .is-loading{opacity:.6}
}`;
  document.head.append(style);

  // ---------- 1. page-change overlay ----------
  let overlay = null;
  let bar = null;
  let hideTimer = 0;

  function ensure() {
    if (overlay) return;
    bar = document.createElement("div");
    bar.id = "pl-bar";
    overlay = document.createElement("div");
    overlay.id = "pl-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    img.src = "./logo.png";
    img.alt = "";
    overlay.append(img);
    document.body.append(bar, overlay);
  }

  function showPage() {
    if (!document.body) return;
    ensure();
    overlay.classList.add("on");
    bar.classList.add("on");
    // safety net: if the navigation never happens (download, cancelled), clear it
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePage, 15000);
  }

  function hidePage() {
    clearTimeout(hideTimer);
    if (!overlay) return;
    overlay.classList.remove("on");
    bar.classList.remove("on");
  }

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.hasAttribute("download") || a.hasAttribute("data-no-busy")) return;
    if (a.target && a.target !== "_self") return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    // same page with only a hash change is not a page change
    if (url.pathname === location.pathname && url.search === location.search) return;
    showPage();
  });

  // covers form submits and any other real navigation
  window.addEventListener("beforeunload", showPage);
  window.addEventListener("pageshow", hidePage);

  // ---------- 2. click spinners on requests ----------
  const BUSY_SKIP = ".chip, .close, [data-close], .hamb, [data-no-busy], .is-loading";
  let lastBusy = null;
  let lastBusyAt = 0;

  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("button, .btn, [role=button]");
    lastBusy = t && !t.matches(BUSY_SKIP) && !t.disabled ? t : null;
    lastBusyAt = Date.now();
  }, true);

  function busyStart(el) {
    el.classList.add("is-loading");
    el.setAttribute("aria-busy", "true");
    if (getComputedStyle(el).position === "static") {
      el.dataset.plPos = "1";
      el.style.position = "relative";
    }
  }

  function busyEnd(el) {
    el.classList.remove("is-loading");
    el.removeAttribute("aria-busy");
    if (el.dataset.plPos) {
      el.style.position = "";
      delete el.dataset.plPos;
    }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    // only the element clicked just before this request gets the spinner
    const el = lastBusy && lastBusy.isConnected && Date.now() - lastBusyAt < 2000 ? lastBusy : null;
    lastBusy = null;
    if (!el) return nativeFetch(input, init);
    busyStart(el);
    return nativeFetch(input, init).finally(() => busyEnd(el));
  };
})();
