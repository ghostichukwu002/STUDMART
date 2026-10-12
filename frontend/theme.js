/* STUDMART light/dark theme. Loaded in <head> so the saved theme applies before first paint. */
(() => {
  const KEY = "studmart_theme";
  const root = document.documentElement;
  const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark"
    : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  function apply(t) {
    if (t === "light" || t === "dark") root.dataset.theme = t;
    else delete root.dataset.theme;
  }
  apply(saved());

  const SUN = '<svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
  const MOON = '<svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

  function label(btn) {
    const dark = isDark();
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.title = dark ? "Light mode" : "Dark mode";
  }
  function toggle() {
    const next = isDark() ? "light" : "dark";
    apply(next);
    try { localStorage.setItem(KEY, next); } catch {}
    document.querySelectorAll(".theme-toggle").forEach(label);
  }
  window.StudmartTheme = { toggle, isDark };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("header.nav").forEach((h) => {
      if (h.querySelector(".theme-toggle")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-toggle";
      btn.innerHTML = SUN + MOON;
      btn.addEventListener("click", toggle);
      label(btn);
      const actions = h.querySelector(".nav-actions");
      if (actions) actions.prepend(btn); else h.append(btn);
    });
  });
})();
