let state = { token: "", extra: {} };

function paintFields() {
  document.getElementById("fields").innerHTML = CATEGORIES.map(c =>
    `<label>${catLabel(c.id)}</label><textarea data-cat="${c.id}">${(state.extra[c.id] || []).join(", ")}</textarea>` +
    (SUBCATEGORIES[c.id] || []).map(x =>
      `<label class="sub">↳ ${subLabel(c.id, x.id)}</label><textarea data-cat="${c.id}/${x.id}">${(state.extra[`${c.id}/${x.id}`] || []).join(", ")}</textarea>`).join("")
  ).join("");
}

function paint() {
  document.documentElement.lang = getLang() === "zh" ? "zh" : "en";
  document.title = t("options.title");
  document.getElementById("title").textContent = t("options.title");
  document.getElementById("lang-label").textContent = t("options.language");
  document.getElementById("lang-hint").textContent = t("options.languageHint");
  document.getElementById("token-label").textContent = t("options.token");
  document.getElementById("token").placeholder = t("options.tokenPlaceholder");
  document.getElementById("token-hint").textContent = t("options.tokenHint");
  document.getElementById("extra-title").textContent = t("options.extra");
  document.getElementById("extra-hint").textContent = t("options.extraHint");
  document.getElementById("save").textContent = t("options.save");
  const sel = document.getElementById("lang");
  sel.innerHTML = LANGS.map(([id, name]) => `<option value="${id}" ${id === getLang() ? "selected" : ""}>${name}</option>`).join("");
  paintFields();
}

chrome.storage.sync.get(["token", "extra", "lang"]).then(p => {
  state.token = p.token || "";
  state.extra = p.extra || {};
  setLang(p.lang);
  document.getElementById("token").value = state.token;
  paint();
});

document.getElementById("lang").addEventListener("change", async e => {
  setLang(e.target.value);
  await chrome.storage.sync.set({ lang: getLang() });
  paint();
});

document.getElementById("save").addEventListener("click", async () => {
  const extra = {};
  for (const ta of document.querySelectorAll("textarea"))
    extra[ta.dataset.cat] = ta.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  await chrome.storage.sync.set({ token: document.getElementById("token").value.trim(), extra });
  const keys = Object.keys(await chrome.storage.local.get(null)).filter(k => k.startsWith("radar:"));
  await chrome.storage.local.remove(keys);
  document.getElementById("msg").textContent = t("options.saved");
});
