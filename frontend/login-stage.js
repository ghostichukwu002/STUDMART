/* Login panel lamp: pulling the cord lights the room and the mascot. Purely visual. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.addEventListener("click", (e) => {
    const pull = e.target.closest && e.target.closest(".lamp-stage .pull");
    if (!pull) return;
    const stage = pull.closest(".lamp-stage");
    const lit = !stage.classList.contains("lit");
    document.querySelectorAll(".lamp-stage").forEach((s) => {
      s.classList.toggle("lit", lit);
      const b = s.querySelector(".pull");
      if (b) b.setAttribute("aria-pressed", String(lit));
    });
    if (!reduce) {
      pull.classList.remove("swing");
      void pull.offsetWidth; // restart the swing animation
      pull.classList.add("swing");
    }
  });
})();
