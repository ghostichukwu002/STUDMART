/* Fills the school suggestions (a datalist) so people pick their school instead of typing it in full. */
(() => {
  const list = document.getElementById("schoolList");
  if (!list || !Array.isArray(window.NG_UNIVERSITIES)) return;
  const frag = document.createDocumentFragment();
  for (const name of window.NG_UNIVERSITIES) {
    const o = document.createElement("option");
    o.value = name;
    frag.append(o);
  }
  list.append(frag);
  document.querySelectorAll('input[name="school"]').forEach((i) => {
    i.setAttribute("list", "schoolList");
    i.setAttribute("autocomplete", "off");
  });
})();
