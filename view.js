// Shared renderer used by the standalone page and the injected trending view.
// mount(root, { openOriginal }) -> { setProgress, setError, setData }
function mountLens(root, opts = {}) {
  const ALL = [...CATEGORIES, OTHER];
  const st = { days: 30, mode: "fresh", cat: "all", sub: "all", hidden: new Set(), lang: "", q: "", overrides: {}, repos: [] };
  const h = (s) => (s || "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  root.classList.add("lens");
  const $ = s => root.querySelector(s);

  // The shell is painted after the language preference is read, so the first
  // frame is already in the right language.
  const paint = () => {
    document.documentElement.lang = getLang() === "zh" ? "zh" : "en";
    root.innerHTML = `
    <div class="lens-bar">
      <span class="lens-title">${t("brand")}</span>
      <span class="lens-seg" data-k="mode">
        <button data-v="fresh" class="on">${t("mode.fresh")}</button><button data-v="rising">${t("mode.rising")}</button>${opts.openOriginal ? `<button data-v="orig">${t("mode.orig")}</button>` : ""}
      </span>
      <span class="lens-seg" data-k="days">
        <button data-v="7">${t("days.7")}</button><button data-v="30" class="on">${t("days.30")}</button><button data-v="90">${t("days.90")}</button>
      </span>
      <select class="lens-lang"><option value="">${t("filter.langAll")}</option></select>
      <input class="lens-q" type="search" placeholder="${t("filter.search")}">
      <button class="lens-refresh">${t("action.refresh")}</button>
      <a class="lens-opt" href="#">${t("action.settings")}</a>
    </div>
    <div class="lens-chips"></div>
    <div class="lens-subchips" hidden></div>
    <div class="lens-status"></div>
    <div class="lens-list"></div>`;
  };
  paint();

  chrome.storage.sync.get(["hidden", "overrides", "days", "mode", "lang"]).then(p => {
    if (p.hidden) st.hidden = new Set(p.hidden);
    st.overrides = p.overrides || {};
    if (p.days && p.days !== st.days) { st.days = p.days; }
    if (p.mode && p.mode !== "orig") st.mode = p.mode;
    const prevLang = getLang();
    if (setLang(p.lang) !== prevLang) paint();
    syncSeg(); load();
  });
  const savePrefs = () => chrome.storage.sync.set({ hidden: [...st.hidden], overrides: st.overrides, days: st.days, mode: st.mode });
  const syncSeg = () => root.querySelectorAll(".lens-seg").forEach(seg =>
    seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v == st[seg.dataset.k])));
  const catOf = r => (st.overrides[r.name] || r.cat).split("/")[0];
  const subOf = r => { const o = st.overrides[r.name]; return o && o.includes("/") ? o.split("/")[1] : (catOf(r) === r.cat ? r.sub : "misc"); };

  async function load(force = false) {
    $(".lens-status").textContent = t("status.loading");
    $(".lens-list").innerHTML = "";
    const res = await chrome.runtime.sendMessage({ type: "radar", days: st.days, force });
    if (!res?.ok) { $(".lens-status").textContent = t("status.error", { error: res?.error || "?" }); return; }
    st.repos = res.repos;
    const langs = [...new Set(st.repos.map(r => r.language).filter(Boolean))].sort();
    $(".lens-lang").innerHTML = `<option value="">${t("filter.langAll")}</option>` + langs.map(l => `<option ${l === st.lang ? "selected" : ""}>${h(l)}</option>`).join("");
    render();
  }

  function render() {
    if (st.mode === "orig") { opts.openOriginal?.(true); $(".lens-list").innerHTML = ""; $(".lens-chips").innerHTML = ""; $(".lens-status").textContent = ""; return; }
    opts.openOriginal?.(false);
    const b = buckets(st.repos, st.days)[st.mode];
    const counts = {};
    for (const r of b) counts[catOf(r)] = (counts[catOf(r)] || 0) + 1;
    $(".lens-chips").innerHTML = `<span class="lens-chip ${st.cat === "all" ? "on" : ""}" data-cat="all">${t("chip.all")} <i>${b.length}</i></span>` +
      ALL.filter(c => counts[c.id]).map(c => `<span class="lens-chip ${st.cat === c.id ? "on" : ""} ${st.hidden.has(c.id) ? "hid" : ""}" data-cat="${c.id}" title="${t("title.hide")}">
        <b style="background:${c.color}"></b>${catLabel(c.id)} <i>${counts[c.id]}</i></span>`).join("");
    const subs = SUBCATEGORIES[st.cat];
    const subEl = $(".lens-subchips");
    if (subs) {
      const sc = {};
      for (const r of b) if (catOf(r) === st.cat) sc[subOf(r)] = (sc[subOf(r)] || 0) + 1;
      const inCat = Object.values(sc).reduce((a, n) => a + n, 0);
      subEl.hidden = false;
      subEl.innerHTML = `<span class="lens-hint">↳ ${t("hint.sub")}</span><span class="lens-chip lens-sub ${st.sub === "all" ? "on" : ""}" data-sub="all">${t("chip.all")} <i>${inCat}</i></span>` +
        [...subs, MISC_SUB].filter(x => sc[x.id]).map(x => `<span class="lens-chip lens-sub ${st.sub === x.id ? "on" : ""}" data-sub="${x.id}">${subLabel(st.cat, x.id)} <i>${sc[x.id]}</i></span>`).join("");
    } else if (st.cat === "all") {
      subEl.hidden = false;
      subEl.innerHTML = `<span class="lens-hint">↳ ${t("hint.subIdle")}</span>`;
    } else { subEl.hidden = true; subEl.innerHTML = ""; }
    const q = st.q.toLowerCase();
    const xs = b.filter(r => {
      const c = catOf(r);
      if (st.cat === "all" ? st.hidden.has(c) : c !== st.cat) return false;
      if (subs && st.sub !== "all" && subOf(r) !== st.sub) return false;
      if (st.lang && r.language !== st.lang) return false;
      return !q || `${r.name} ${r.description}`.toLowerCase().includes(q);
    });
    $(".lens-status").textContent = t(st.mode === "fresh" ? "status.count" : "status.countRising",
      { n: xs.length, days: st.days, max: NEW_STAR_MAX, pool: st.repos.length });
    const opt = (cid, sid) => ALL.map(c => {
      const subs = SUBCATEGORIES[c.id];
      if (!subs) return `<option value="${c.id}" ${c.id === cid ? "selected" : ""}>${catLabel(c.id)}</option>`;
      return `<optgroup label="${catLabel(c.id)}">` + [...subs, MISC_SUB].map(x =>
        `<option value="${c.id}/${x.id}" ${c.id === cid && x.id === sid ? "selected" : ""}>${catLabel(c.id)} · ${subLabel(c.id, x.id)}</option>`).join("") + "</optgroup>";
    }).join("");
    $(".lens-list").innerHTML = xs.length ? xs.map((r, i) => {
      const c = ALL.find(c => c.id === catOf(r)) || OTHER;
      const sl = SUBCATEGORIES[c.id] ? (subOf(r) === "misc" ? t("sub.misc") : subLabel(c.id, subOf(r))) : "";
      return `<article class="lens-row">
        <div class="lens-rank">${i + 1}</div>
        <div class="lens-main">
          <a class="lens-name" href="${r.url}" target="_blank" rel="noopener">${h(r.name)}</a>
          <span class="lens-badge" style="background:${c.color}">${catLabel(c.id)}${sl ? " · " + sl : ""}</span>
          <button class="lens-edit" title="${t("title.edit")}">✎</button>
          <select class="lens-cat" data-name="${h(r.name)}" hidden>${opt(c.id, subOf(r))}</select>
          <div class="lens-desc">${h(r.description) || `<span class='lens-muted'>${t("desc.none")}</span>`}</div>
          <div class="lens-meta">
            ${r.language ? `<span>${h(r.language)}</span>` : ""}
            <span>★ ${r.stars.toLocaleString()}</span><span>⑂ ${r.forks}</span>
            <span>${t("meta.age", { n: r.age })}</span><span>${t("meta.spd", { n: r.spd.toFixed(1) })}</span>
            ${r.topics.slice(0, 4).map(t => `<span class="lens-topic">${h(t)}</span>`).join("")}
          </div>
        </div>
        <div class="lens-score" title="${t("title.score")}">${r.score.toFixed(2)}</div>
      </article>`;
    }).join("") : `<div class="lens-empty">${t("empty")}</div>`;
  }

  root.addEventListener("click", e => {
    const seg = e.target.closest(".lens-seg button");
    if (seg) {
      const k = seg.parentElement.dataset.k;
      st[k] = k === "days" ? +seg.dataset.v : seg.dataset.v;
      syncSeg(); savePrefs();
      k === "days" ? load() : render();
      return;
    }
    const chip = e.target.closest(".lens-chip");
    if (chip) {
      const id = chip.dataset.cat;
      if (chip.classList.contains("lens-sub")) { st.sub = chip.dataset.sub; render(); return; }
      if (e.altKey && id !== "all") { st.hidden.has(id) ? st.hidden.delete(id) : st.hidden.add(id); savePrefs(); }
      else { st.cat = id; st.sub = "all"; }
      render(); return;
    }
    if (e.target.closest(".lens-refresh")) load(true);
    const edit = e.target.closest(".lens-edit");
    if (edit) { const sel = edit.nextElementSibling; sel.hidden = !sel.hidden; if (!sel.hidden) sel.focus(); }
    if (e.target.closest(".lens-opt")) { e.preventDefault(); chrome.runtime.sendMessage({ type: "openOptions" }); }
  });
  root.addEventListener("contextmenu", e => {
    const chip = e.target.closest(".lens-chip"); if (!chip || chip.dataset.cat === "all") return;
    e.preventDefault();
    const id = chip.dataset.cat;
    st.hidden.has(id) ? st.hidden.delete(id) : st.hidden.add(id); savePrefs(); render();
  });
  root.addEventListener("change", e => {
    if (e.target.classList.contains("lens-cat")) { st.overrides[e.target.dataset.name] = e.target.value; savePrefs(); render(); }
    if (e.target.classList.contains("lens-lang")) { st.lang = e.target.value; render(); }
  });
  root.addEventListener("input", e => { if (e.target.classList.contains("lens-q")) { st.q = e.target.value; render(); } });

  chrome.runtime.onMessage.addListener(m => { if (m.type === "progress") $(".lens-status").textContent = t("status.progress", { i: m.i, n: m.n }); });

  // Switching the language on the options page repaints an open lens immediately.
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== "sync" || !changes.lang) return;
    setLang(changes.lang.newValue);
    paint();
    syncSeg();
    if (st.repos.length) render();
  });
  return { reload: load, repaint: () => { paint(); syncSeg(); render(); } };
}
