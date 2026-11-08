// Replace the GitHub trending list with our own ranking; keep the original behind a toggle.
(() => {
  const first = document.querySelector("article.Box-row");
  const box = first?.parentElement;
  if (!box) return;
  const root = document.createElement("div");
  box.parentElement.insertBefore(root, box);
  mountLens(root, { openOriginal: show => { box.style.display = show ? "" : "none"; } });
})();
