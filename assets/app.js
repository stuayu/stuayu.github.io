// 画面隅の時計、「放送中」の判定、番組詳細を開く処理
const ON_AIR_DAYS = 7;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const clock = document.getElementById("clock");
function tick() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  clock.textContent = `${hh}:${mm}`;
  clock.dateTime = now.toISOString();
}
if (clock) {
  tick();
  setInterval(tick, 15_000);
}

// 生成した日からずれていても、見ている日を基準に「放送中」を付け直す
const now = Date.now();
for (const el of document.querySelectorAll(".prog[data-pushed]")) {
  const live = now - Date.parse(el.dataset.pushed) < ON_AIR_DAYS * 864e5;
  el.classList.toggle("onair", live);
  const meta = el.querySelector(".prog-meta");
  const tag = meta.querySelector(".prog-live");
  if (live && !tag) meta.insertAdjacentHTML("afterbegin", '<span class="prog-live">放送中</span>');
  if (!live && tag) tag.remove();
}

const today = document.getElementById("today");
if (today) {
  const d = new Date();
  today.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
  today.dateTime = d.toISOString().slice(0, 10);
}

// Popover API がないブラウザ向けの簡易フォールバック
const hasPopover = typeof HTMLElement.prototype.showPopover === "function";
let openEl = null;
function open(el) {
  if (hasPopover) return el.showPopover();
  if (openEl) openEl.classList.remove("is-open");
  el.classList.add("is-open");
  openEl = el;
  el.querySelector(".pop-close")?.focus();
}
function close(el) {
  if (hasPopover) return el.hidePopover();
  el.classList.remove("is-open");
  openEl = null;
}

if (!hasPopover) {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[popovertarget]");
    if (!btn) return;
    const el = document.getElementById(btn.getAttribute("popovertarget"));
    if (!el) return;
    btn.getAttribute("popovertargetaction") === "hide" || el === openEl ? close(el) : open(el);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openEl) close(openEl);
  });
}

// テロップ帯から最新の番組詳細を開く
for (const a of document.querySelectorAll("[data-open]")) {
  a.addEventListener("click", (e) => {
    const el = document.getElementById(a.dataset.open);
    if (!el) return;
    e.preventDefault();
    open(el);
  });
}
