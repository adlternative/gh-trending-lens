chrome.storage.sync.get(["token", "extra"]).then(p => {
  document.getElementById("token").value = p.token || "";
  const ex = p.extra || {};
  document.getElementById("fields").innerHTML = CATEGORIES.map(c =>
    `<label>${c.label}</label><textarea data-cat="${c.id}">${(ex[c.id] || []).join(", ")}</textarea>` +
    (SUBCATEGORIES[c.id] || []).map(x => `<label class="sub">↳ ${x.label}</label><textarea data-cat="${c.id}/${x.id}">${(ex[`${c.id}/${x.id}`] || []).join(", ")}</textarea>`).join("")
  ).join("");
});
document.getElementById("save").addEventListener("click", async () => {
  const extra = {};
  for (const ta of document.querySelectorAll("textarea")) extra[ta.dataset.cat] = ta.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  await chrome.storage.sync.set({ token: document.getElementById("token").value.trim(), extra });
  const keys = Object.keys(await chrome.storage.local.get(null)).filter(k => k.startsWith("radar:"));
  await chrome.storage.local.remove(keys);
  document.getElementById("msg").textContent = "已保存，缓存已清空";
});
