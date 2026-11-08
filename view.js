// Shared renderer used by the standalone page and the injected trending view.
// mount(root, { openOriginal }) -> { setProgress, setError, setData }
function mountLens(root, opts = {}) {
  const ALL = [...CATEGORIES, OTHER];
  const st = { days: 30, mode: "fresh", cat: "all", sub: "all", hidden: new Set(), lang: "", q: "", overrides: {}, repos: [] };
  const h = (s) => (s || "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  root.classList.add("lens");
  root.innerHTML = `
    <div class="lens-bar">
      <span class="lens-title">Trending Lens</span>
      <span class="lens-seg" data-k="mode">
        <button data-v="fresh" class="on">新星</button><button data-v="rising">上升</button>${opts.openOriginal ? '<button data-v="orig">GitHub 原榜</button>' : ""}
      </span>
      <span class="lens-seg" data-k="days">
        <button data-v="7">7 天</button><button data-v="30" class="on">30 天</button><button data-v="90">90 天</button>
      </span>
      <select class="lens-lang"><option value="">全部语言</option></select>
      <input class="lens-q" type="search" placeholder="搜索">
      <button class="lens-refresh" title="忽略缓存重新抓取">刷新</button>
      <a class="lens-opt" href="#">设置</a>
    </div>
    <div class="lens-chips"></div>
    <div class="lens-subchips" hidden></div>
    <div class="lens-status"></div>
    <div class="lens-list"></div>`;
  const $ = s => root.querySelector(s);

  chrome.storage.sync.get(["hidden", "overrides", "days", "mode"]).then(p => {
    if (p.hidden) st.hidden = new Set(p.hidden);
    st.overrides = p.overrides || {};
    if (p.days && p.days !== st.days) { st.days = p.days; }
    if (p.mode && p.mode !== "orig") st.mode = p.mode;
    syncSeg(); load();
  });
  const savePrefs = () => chrome.storage.sync.set({ hidden: [...st.hidden], overrides: st.overrides, days: st.days, mode: st.mode });
  const syncSeg = () => root.querySelectorAll(".lens-seg").forEach(seg =>
    seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v == st[seg.dataset.k])));
  const catOf = r => (st.overrides[r.name] || r.cat).split("/")[0];
  const subOf = r => { const o = st.overrides[r.name]; return o && o.includes("/") ? o.split("/")[1] : (catOf(r) === r.cat ? r.sub : "misc"); };

  async function load(force = false) {
    $(".lens-status").textContent = "从 GitHub 搜索新仓库…";
    $(".lens-list").innerHTML = "";
    const res = await chrome.runtime.sendMessage({ type: "radar", days: st.days, force });
    if (!res?.ok) { $(".lens-status").innerHTML = `抓取失败：${h(res?.error || "未知错误")}。<a href="#" class="lens-opt">配置 token</a> 可提高限额。`; return; }
    st.repos = res.repos;
    const langs = [...new Set(st.repos.map(r => r.language).filter(Boolean))].sort();
    $(".lens-lang").innerHTML = '<option value="">全部语言</option>' + langs.map(l => `<option ${l === st.lang ? "selected" : ""}>${h(l)}</option>`).join("");
    render();
  }

  function render() {
    if (st.mode === "orig") { opts.openOriginal?.(true); $(".lens-list").innerHTML = ""; $(".lens-chips").innerHTML = ""; $(".lens-status").textContent = ""; return; }
    opts.openOriginal?.(false);
    const b = buckets(st.repos, st.days)[st.mode];
    const counts = {};
    for (const r of b) counts[catOf(r)] = (counts[catOf(r)] || 0) + 1;
    $(".lens-chips").innerHTML = `<span class="lens-chip ${st.cat === "all" ? "on" : ""}" data-cat="all">全部 <i>${b.length}</i></span>` +
      ALL.filter(c => counts[c.id]).map(c => `<span class="lens-chip ${st.cat === c.id ? "on" : ""} ${st.hidden.has(c.id) ? "hid" : ""}" data-cat="${c.id}" title="⌥+点击 / 右键：在“全部”中隐藏">
        <b style="background:${c.color}"></b>${c.label} <i>${counts[c.id]}</i></span>`).join("");
    const subs = SUBCATEGORIES[st.cat];
    const subEl = $(".lens-subchips");
    if (subs) {
      const sc = {};
      for (const r of b) if (catOf(r) === st.cat) sc[subOf(r)] = (sc[subOf(r)] || 0) + 1;
      const inCat = Object.values(sc).reduce((a, n) => a + n, 0);
      subEl.hidden = false;
      subEl.innerHTML = `<span class="lens-hint">↳ 子类</span><span class="lens-chip lens-sub ${st.sub === "all" ? "on" : ""}" data-sub="all">全部 <i>${inCat}</i></span>` +
        [...subs, MISC_SUB].filter(x => sc[x.id]).map(x => `<span class="lens-chip lens-sub ${st.sub === x.id ? "on" : ""}" data-sub="${x.id}">${x.label} <i>${sc[x.id]}</i></span>`).join("");
    } else if (st.cat === "all") {
      subEl.hidden = false;
      subEl.innerHTML = `<span class="lens-hint">↳ 点击上面某个大类，这里会出现它的子类筛选</span>`;
    } else { subEl.hidden = true; subEl.innerHTML = ""; }
    const q = st.q.toLowerCase();
    const xs = b.filter(r => {
      const c = catOf(r);
      if (st.cat === "all" ? st.hidden.has(c) : c !== st.cat) return false;
      if (subs && st.sub !== "all" && subOf(r) !== st.sub) return false;
      if (st.lang && r.language !== st.lang) return false;
      return !q || `${r.name} ${r.description}`.toLowerCase().includes(q);
    });
    const note = st.mode === "fresh" ? `创建 ≤${st.days} 天、≤${NEW_STAR_MAX} star，按潜力得分` : `创建 ≤1 年、>${NEW_STAR_MAX} star，按增速`;
    $(".lens-status").textContent = `${xs.length} 个仓库 · ${note} · 候选池 ${st.repos.length} · 缓存 30 分钟`;
    const opt = (cid, sid) => ALL.map(c => {
      const subs = SUBCATEGORIES[c.id];
      if (!subs) return `<option value="${c.id}" ${c.id === cid ? "selected" : ""}>${c.label}</option>`;
      return `<optgroup label="${c.label}">` + [...subs, MISC_SUB].map(x =>
        `<option value="${c.id}/${x.id}" ${c.id === cid && x.id === sid ? "selected" : ""}>${c.label} · ${x.label}</option>`).join("") + "</optgroup>";
    }).join("");
    $(".lens-list").innerHTML = xs.length ? xs.map((r, i) => {
      const c = ALL.find(c => c.id === catOf(r)) || OTHER;
      const sl = SUBCATEGORIES[c.id] ? subLabel(c.id, subOf(r)) : "";
      return `<article class="lens-row">
        <div class="lens-rank">${i + 1}</div>
        <div class="lens-main">
          <a class="lens-name" href="${r.url}" target="_blank" rel="noopener">${h(r.name)}</a>
          <span class="lens-badge" style="background:${c.color}">${c.label}${sl ? " · " + sl : ""}</span>
          <button class="lens-edit" title="改分类">✎</button>
          <select class="lens-cat" data-name="${h(r.name)}" hidden>${opt(c.id, subOf(r))}</select>
          <div class="lens-desc">${h(r.description) || "<span class='lens-muted'>（无描述）</span>"}</div>
          <div class="lens-meta">
            ${r.language ? `<span>${h(r.language)}</span>` : ""}
            <span>★ ${r.stars.toLocaleString()}</span><span>⑂ ${r.forks}</span>
            <span>${r.age} 天</span><span>${r.spd.toFixed(1)} ★/天</span>
            ${r.topics.slice(0, 4).map(t => `<span class="lens-topic">${h(t)}</span>`).join("")}
          </div>
        </div>
        <div class="lens-score" title="潜力得分">${r.score.toFixed(2)}</div>
      </article>`;
    }).join("") : `<div class="lens-empty">没有匹配的仓库</div>`;
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

  chrome.runtime.onMessage.addListener(m => { if (m.type === "progress") $(".lens-status").textContent = `搜索中 ${m.i}/${m.n}…`; });
  return { reload: load };
}
