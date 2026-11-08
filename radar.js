// Shared: search queries, scoring, buckets. Pure logic; fetching is done by background.js.
const WINDOWS = { 7: "7 天", 30: "30 天", 90: "90 天" };
const STAR_MIN = { 7: 30, 30: 50, 90: 80 };
const NEW_STAR_MAX = 2000;
const RISING_STAR_MIN = 2000;

// Keyword groups that need dedicated queries: a generic "new + stars" search is
// dominated by AI repos, so hardware / games / security would otherwise be empty.
// GitHub allows at most 5 OR operators per query, so each group has <= 6 words.
const KEYWORD_QUERIES = [
  ["ai",       ["agent", "llm", "mcp", "agentic", "rag", "inference"]],
  ["hardware", ["esp32", "arduino", "fpga", "firmware", "embedded", "stm32"]],
  ["security", ["security", "pentest", "cve", "malware", "exploit", "fuzzing"]],
  ["games",    ["game", "gamedev", "emulator", "godot", "roguelike", "engine"]],
  ["data",     ["database", "sql", "analytics", "duckdb", "postgres", "olap"]],
  ["software", ["cli", "terminal", "self-hosted", "editor", "compiler", "browser"]],
];

function buildQueries(days) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const min = STAR_MIN[days];
  const qs = [];
  // generic pool first (3 pages), then rising, then keyword groups; if the
  // unauthenticated rate limit (10/min) hits, the tail is what gets dropped.
  for (let p = 1; p <= 3; p++) qs.push({ q: `created:>=${since} stars:>=${min} fork:false`, page: p, tag: "generic" });
  const year = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  for (let p = 1; p <= 2; p++) qs.push({ q: `created:>=${year} stars:>=${RISING_STAR_MIN} fork:false`, page: p, tag: "rising" });
  for (const [cat, words] of KEYWORD_QUERIES)
    qs.push({ q: `${words.join(" OR ")} in:name,description,topics created:>=${since} stars:>=${Math.max(10, min / 3 | 0)} fork:false`, page: 1, tag: cat });
  return qs;
}

function normalize(item, tag) {
  return {
    name: item.full_name, url: item.html_url, description: item.description || "",
    language: item.language || "", stars: item.stargazers_count, forks: item.forks_count,
    issues: item.open_issues_count, created: item.created_at, pushed: item.pushed_at,
    topics: item.topics || [], license: item.license?.spdx_id || "", ownerType: item.owner?.type || "",
    archived: !!item.archived, tags: [tag],
  };
}


function scoreAll(repos) {
  const now = Date.now();
  const feats = repos.map(r => {
    const age = Math.max((now - Date.parse(r.created)) / 864e5, 1);
    const sincePush = (now - Date.parse(r.pushed)) / 864e5;
    return {
      spd: r.stars / age,
      forkRatio: r.forks / Math.max(r.stars, 1),
      issueRatio: r.issues / Math.max(r.stars, 1),
      fresh: sincePush <= 3 ? 1 : sincePush <= 14 ? 0.7 : sincePush <= 45 ? 0.3 : 0,
      complete: (r.description ? 0.4 : 0) + (r.license ? 0.3 : 0) + (r.topics.length ? 0.3 : 0),
      org: r.ownerType === "Organization" ? 1 : 0,
      age,
    };
  });
  const pct = key => {
    const s = feats.map(f => f[key]).sort((a, b) => a - b);
    return v => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; s[m] < v ? lo = m + 1 : hi = m; } return s.length > 1 ? lo / (s.length - 1) : 0.5; };
  };
  const P = { spd: pct("spd"), forkRatio: pct("forkRatio"), issueRatio: pct("issueRatio") };
  repos.forEach((r, i) => {
    const f = feats[i];
    r.age = Math.round(f.age);
    r.spd = f.spd;
    r.score = 0.40 * P.spd(f.spd) + 0.15 * P.forkRatio(f.forkRatio) + 0.10 * P.issueRatio(f.issueRatio)
           + 0.20 * f.fresh + 0.10 * f.complete + 0.05 * f.org;
    r.score = Math.round(r.score * 100) / 100;
  });
  return repos;
}

function buckets(repos, days) {
  const cutoff = Date.now() - days * 864e5;
  const ok = r => !r.archived;   // nothing is filtered by content; use categories to hide what you don't want
  return {
    fresh:  repos.filter(r => ok(r) && Date.parse(r.created) >= cutoff && r.stars <= NEW_STAR_MAX).sort((a, b) => b.score - a.score),
    rising: repos.filter(r => ok(r) && r.stars > NEW_STAR_MAX).sort((a, b) => b.score - a.score),
  };
}

if (typeof module !== "undefined") module.exports = { buildQueries, normalize, scoreAll, buckets, WINDOWS };
