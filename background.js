importScripts("classify.js", "radar.js");
const CACHE_TTL = 30 * 60 * 1000;

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("trending.html") }));

async function ghSearch(q, page, token) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`;
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (r.status === 403 || r.status === 429) {
    const reset = +r.headers.get("X-RateLimit-Reset") * 1000;
    throw new Error(`rate limited${token ? "" : "（未配置 token，未认证限额 10 次/分钟）"}，${Math.max(0, Math.ceil((reset - Date.now()) / 1000))}s 后重置`);
  }
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return (await r.json()).items || [];
}

async function loadRadar(days, force, notify) {
  const key = `radar:${days}`;
  if (!force) {
    const c = (await chrome.storage.local.get(key))[key];
    if (c && Date.now() - c.at < CACHE_TTL) return c.repos;
  }
  const { token, extra } = await chrome.storage.sync.get(["token", "extra"]);
  const qs = buildQueries(days);
  const seen = new Map();
  let i = 0;
  for (const { q, page, tag } of qs) {
    notify?.(++i, qs.length);
    let items;
    try { items = await ghSearch(q, page, token); }
    catch (e) { if (seen.size) { console.warn(e); break; } throw e; }
    for (const it of items) {
      const prev = seen.get(it.full_name);
      if (prev) prev.tags.push(tag); else seen.set(it.full_name, normalize(it, tag));
    }
    if (!token) await new Promise(r => setTimeout(r, 400));
  }
  const repos = scoreAll([...seen.values()]);
  for (const r of repos) {
    const doc = { name: r.name, description: `${r.description} ${r.topics.join(" ")}` };
    r.cat = classifyRepo(doc, extra || {});
    r.sub = classifySub(r.cat, doc, extra || {});
  }
  await chrome.storage.local.set({ [key]: { at: Date.now(), repos } });
  return repos;
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === "openLens") { chrome.tabs.create({ url: chrome.runtime.getURL("trending.html") }); return; }
  if (msg.type === "openOptions") { chrome.runtime.openOptionsPage(); return; }
  if (msg.type === "radar") {
    loadRadar(msg.days, msg.force, (i, n) => sender.tab && chrome.tabs.sendMessage(sender.tab.id, { type: "progress", i, n }).catch(() => {}))
      .then(repos => respond({ ok: true, repos }))
      .catch(e => respond({ ok: false, error: String(e.message || e) }));
    return true;
  }
});
