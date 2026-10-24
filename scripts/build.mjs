// GitHub の公開リポジトリから番組表を組み立てて index.html を書き出す。
// 使い方: node scripts/build.mjs            (API から取得して data/repos.json を更新)
//         node scripts/build.mjs --offline  (data/repos.json だけで生成)
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://stuayu.github.io/";
const cfg = JSON.parse(await readFile(path.join(root, "data/channels.json"), "utf8"));
const cachePath = path.join(root, "data/repos.json");
const offline = process.argv.includes("--offline");

async function gh(url) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "stuayu.github.io-build" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/${url}`, { headers });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchRepos() {
  // users/{user}/repos は認証の有無にかかわらず公開リポジトリだけを返す
  const list = await gh(`users/${cfg.user}/repos?per_page=100&type=owner`);
  const repos = [];
  for (const r of list) {
    if (r.private || cfg.exclude.includes(r.name)) continue;
    let parent = null;
    if (r.fork) {
      const full = await gh(`repos/${r.full_name}`);
      parent = full.parent?.full_name ?? null;
    }
    repos.push({
      name: r.name,
      url: r.html_url,
      description: r.description ?? "",
      language: r.language ?? "",
      stars: r.stargazers_count,
      fork: r.fork,
      parent,
      created: r.created_at,
      pushed: r.pushed_at,
    });
  }
  return repos;
}

let repos;
if (offline) {
  repos = JSON.parse(await readFile(cachePath, "utf8"));
} else {
  try {
    repos = await fetchRepos();
    await writeFile(cachePath, JSON.stringify(repos, null, 2) + "\n");
  } catch (err) {
    console.warn(`GitHub API に接続できないため、保存済みのデータを使います: ${err.message}`);
    repos = JSON.parse(await readFile(cachePath, "utf8"));
  }
}

// ---- 整形 ----
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const jst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3); // 表示は日本時間
const ymd = (iso) => {
  const d = jst(iso);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};
const fmtDate = (iso) => {
  const { y, m, d } = ymd(iso);
  return `${y}年${m}月${d}日`;
};
const slug = (name) => name.replace(/[^A-Za-z0-9_-]/g, "-");
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const now = new Date();
const today = ymd(now.toISOString());
const todayLabel = `${today.y}年${today.m}月${today.d}日（${WEEK[jst(now.toISOString()).getUTCDay()]}）`;

const channelOf = new Map();
for (const ch of cfg.channels) for (const n of ch.repos) channelOf.set(n, ch.id);
const chName = Object.fromEntries(cfg.channels.map((c) => [c.id, c.name]));

for (const r of repos) {
  r.channel = channelOf.get(r.name) ?? "etc";
  r.blurb = cfg.blurbs[r.name] ?? r.description;
  r.onAir = now - new Date(r.pushed) < cfg.onAirDays * 864e5;
  r.id = `p-${slug(r.name)}`;
}
repos.sort((a, b) => new Date(b.pushed) - new Date(a.pushed));

// 月ごとの行にまとめる（番組表の「時」の列にあたる）
const rows = [];
for (const r of repos) {
  const { y, m } = ymd(r.pushed);
  const key = `${y}-${m}`;
  let row = rows.at(-1);
  if (!row || row.key !== key) rows.push((row = { key, y, m, items: [] }));
  row.items.push(r);
}
const recentFrom = today.y - (cfg.recentYears - 1);
const recentRows = rows.filter((r) => r.y >= recentFrom);
const olderRows = rows.filter((r) => r.y < recentFrom);

function program(r) {
  const { d } = ymd(r.pushed);
  const fork = r.fork ? `<span class="prog-fork">フォーク</span>` : "";
  return `<button type="button" class="prog${r.fork ? " fork" : ""}${r.onAir ? " onair" : ""}" popovertarget="${r.id}" data-pushed="${r.pushed}">
              <span class="prog-day" aria-hidden="true">${d}</span>
              <span class="prog-body">
                <span class="prog-name">${esc(r.name).replace(/([_-])/g, "$1<wbr>")}</span>
                <span class="prog-desc">${esc(r.blurb)}</span>
                <span class="prog-meta">${r.onAir ? `<span class="prog-live">放送中</span>` : ""}${fork}${r.language ? `<span>${esc(r.language)}</span>` : ""}</span>
              </span>
            </button>`;
}

function grid(rowsToShow, withHead) {
  let prevYear = null;
  const head = withHead
    ? `<div class="epg-head" role="presentation">
          <div class="epg-corner"><span class="now-label">いま</span></div>
          ${cfg.channels
            .map((c) => `<div class="ch-head ch-${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.note)}</span></div>`)
            .join("\n          ")}
        </div>`
    : "";
  const body = rowsToShow
    .map((row) => {
      const showYear = row.y !== prevYear;
      prevYear = row.y;
      const cells = cfg.channels
        .map((c) => {
          const items = row.items.filter((r) => r.channel === c.id);
          return `<div class="cell ch-${c.id}" data-ch="${c.id}">${items.length ? "\n            " + items.map(program).join("\n            ") + "\n          " : ""}</div>`;
        })
        .join("\n          ");
      return `<div class="epg-row">
          <div class="hour"><span class="hour-m">${row.m}<small>月</small></span>${showYear ? `<span class="hour-y">${row.y}</span>` : ""}</div>
          ${cells}
        </div>`;
    })
    .join("\n        ");
  return `<div class="epg-grid">
        ${head}
        ${body}
      </div>`;
}

function popover(r) {
  const parent = r.parent
    ? `<p class="pop-parent">元のプロジェクト <a href="https://github.com/${esc(r.parent)}" rel="noopener">${esc(r.parent)}</a></p>`
    : `<p class="pop-parent">自分で一から作ったもの</p>`;
  return `<section class="pop ch-${r.channel}" id="${r.id}" popover aria-label="${esc(r.name)} の番組詳細">
      <header class="pop-head">
        <span class="pop-ch">${esc(chName[r.channel])}</span>
        <button type="button" class="pop-close" popovertarget="${r.id}" popovertargetaction="hide" aria-label="閉じる">×</button>
      </header>
      <h3 class="pop-title">${esc(r.name)}</h3>
      ${parent}
      <p class="pop-desc">${esc(r.blurb || "説明はまだありません。")}</p>
      <dl class="pop-facts">
        ${r.language ? `<div><dt>プログラミング言語</dt><dd>${esc(r.language)}</dd></div>` : ""}
        <div><dt>GitHub のスター</dt><dd>${r.stars}</dd></div>
        <div><dt>作成</dt><dd><time datetime="${r.created}">${fmtDate(r.created)}</time></dd></div>
        <div><dt>最終更新</dt><dd><time datetime="${r.pushed}">${fmtDate(r.pushed)}</time></dd></div>
      </dl>
      <a class="pop-link" href="${esc(r.url)}" rel="noopener">GitHub でリポジトリを開く</a>
    </section>`;
}

// 言語の内訳
const langCount = new Map();
for (const r of repos) if (r.language) langCount.set(r.language, (langCount.get(r.language) ?? 0) + 1);
const langs = [...langCount].sort((a, b) => b[1] - a[1]);
const langTotal = langs.reduce((s, [, n]) => s + n, 0);
const LANG_COLORS = {
  "C++": "#F34B7D", TypeScript: "#3178C6", Python: "#3572A5", Rust: "#DEA584", JavaScript: "#F1E05A",
  C: "#555555", Kotlin: "#A97BFF", Dart: "#00B4AB", Shell: "#89E051", CSS: "#663399",
};
const langBar = langs
  .map(([l, n]) => `<span style="--w:${((n / langTotal) * 100).toFixed(2)}%;--c:${LANG_COLORS[l] ?? "#8A93AD"}" title="${esc(l)} ${n}"></span>`)
  .join("");
const langList = langs
  .map(([l, n]) => `<li><span class="sw" style="--c:${LANG_COLORS[l] ?? "#8A93AD"}"></span>${esc(l)}<span class="n">${n}</span></li>`)
  .join("\n            ");

const own = repos.filter((r) => !r.fork);
const latest = repos[0];
const stack = ["Mirakurun", "EPGStation", "EDCB", "KonomiTV", "BonDriver", "Docker"];

// CSS の :has() で、表示中のチャンネルに番組がない行を隠すルールを生成する
const chFilterCss = cfg.channels
  .map(
    (c) => `  .epg:has(#tab-${c.id}:checked) .cell:not(.ch-${c.id}),
  .epg:has(#tab-${c.id}:checked) .ch-head:not(.ch-${c.id}) { display: none; }
  .epg:has(#tab-${c.id}:checked) .epg-row:not(:has(.ch-${c.id} .prog)),
  .epg:has(#tab-${c.id}:checked):has(#own-only:checked) .epg-row:not(:has(.ch-${c.id} .prog:not(.fork))) { display: none; }`
  )
  .join("\n");

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  url: SITE,
  name: "あむ (stuayu) のポートフォリオ",
  inLanguage: "ja",
  dateModified: now.toISOString(),
  mainEntity: {
    "@type": "Person",
    "@id": `${SITE}#me`,
    name: cfg.displayName,
    alternateName: cfg.user,
    url: SITE,
    image: `https://avatars.githubusercontent.com/${cfg.user}`,
    sameAs: [`https://github.com/${cfg.user}`, `https://x.com/${cfg.x}`],
    knowsAbout: ["テレビ録画", "ISDB", ...stack, "Rust", "C++", "TypeScript", "Python"],
  },
  hasPart: {
    "@type": "ItemList",
    name: "公開リポジトリ",
    itemListElement: repos.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SoftwareSourceCode",
        name: r.name,
        description: r.blurb || undefined,
        codeRepository: r.url,
        programmingLanguage: r.language || undefined,
        dateCreated: r.created,
        dateModified: r.pushed,
        ...(r.fork ? { isBasedOn: `https://github.com/${r.parent}` } : { author: { "@id": `${SITE}#me` } }),
      },
    })),
  },
};

const description =
  "あむ (stuayu) のポートフォリオ。Mirakurun、EPGStation、EDCB、KonomiTV など、自宅でテレビを録画して見るためのソフトを改造したり、チューナーやカード共有のツールを自作したりしています。";

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>あむ (stuayu) | テレビ録画・視聴ツールをつくる人</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}">
  <meta name="author" content="あむ (stuayu)">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#1B3BD1">
  <meta name="color-scheme" content="light dark">
  <meta property="og:type" content="profile">
  <meta property="og:locale" content="ja_JP">
  <meta property="og:site_name" content="stuayu.github.io">
  <meta property="og:title" content="あむ (stuayu) | テレビ録画・視聴ツールをつくる人">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${SITE}">
  <meta property="og:image" content="${SITE}assets/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="ブルーバックの画面に「あむ」のテロップ">
  <meta property="profile:username" content="${cfg.user}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@${cfg.x}">
  <meta name="twitter:creator" content="@${cfg.x}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=Dela+Gothic+One&display=swap">
  <link rel="stylesheet" href="/assets/style.css">
  <style>
  @media (max-width: 760px) {
${chFilterCss}
  }
  </style>
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  <script type="module" src="/assets/app.js"></script>
</head>
<body>
  <a class="skip" href="#epg">番組表へ移動</a>

  <header class="tv" id="top">
    <div class="osd">
      <p class="osd-station"><span class="osd-num">011</span>${esc(cfg.user)}</p>
      <p class="osd-clock"><time id="clock" datetime="${now.toISOString()}">--:--</time></p>
    </div>

    <div class="tv-main">
      <h1 class="telop">${esc(cfg.displayName)}</h1>
      <p class="tv-lede">テレビを録って、配って、見るための道具をつくっています。</p>
      <p class="tv-sub">Mirakurun、EPGStation、EDCB、KonomiTV など、自宅でテレビを録画して見るためのオープンソースソフトを改造したり、足りない部品を Rust や C++、Python で自作したりしています。</p>
    </div>

    <a class="lower-third" href="#${latest.id}" data-open="${latest.id}">
      <span class="lt-tag">放送中</span>
      <span class="lt-title">${esc(latest.name)}</span>
      <span class="lt-time">${ymd(latest.pushed).m}月${ymd(latest.pushed).d}日に更新</span>
    </a>

    <nav class="dkeys" aria-label="ページ内リンク">
      <a class="dkey k-blue" href="#epg"><i aria-hidden="true"></i>番組表</a>
      <a class="dkey k-red" href="#about"><i aria-hidden="true"></i>プロフィール</a>
      <a class="dkey k-green" href="#langs"><i aria-hidden="true"></i>言語</a>
      <a class="dkey k-yellow" href="#links"><i aria-hidden="true"></i>リンク</a>
    </nav>
  </header>

  <main>
    <section class="epg" id="epg" aria-labelledby="epg-title">
      <input type="radio" name="ch" id="tab-${cfg.channels[0].id}" class="vh" checked>
      ${cfg.channels
        .slice(1)
        .map((c) => `<input type="radio" name="ch" id="tab-${c.id}" class="vh">`)
        .join("\n      ")}
      <input type="checkbox" id="own-only" class="vh">

      <div class="epg-bar">
        <div>
          <h2 id="epg-title" class="sec-title">番組表</h2>
          <p class="epg-date"><time id="today" datetime="${now.toISOString().slice(0, 10)}">${todayLabel}</time>現在。公開しているリポジトリ ${repos.length} 本を、最後に更新した月ごとに並べています。番組を押すと詳しい説明が出ます。「フォーク」は、ほかの人のプロジェクトを複製して手を加えたものです。</p>
        </div>
        <div class="epg-controls">
          <div class="tabs" role="group" aria-label="チャンネル">
            ${cfg.channels.map((c) => `<label for="tab-${c.id}" class="tab ch-${c.id}">${esc(c.name)}</label>`).join("\n            ")}
          </div>
          <label for="own-only" class="toggle"><span class="toggle-box" aria-hidden="true"></span>自分で作ったものだけ表示（${own.length} 本）</label>
        </div>
      </div>

      ${grid(recentRows, true)}

      ${
        olderRows.length
          ? `<details class="older">
        <summary>${recentFrom - 1}年までの番組（${olderRows.reduce((s, r) => s + r.items.length, 0)} 本）</summary>
        ${grid(olderRows, false)}
      </details>`
          : ""
      }
    </section>

    <section class="about" id="about" aria-labelledby="about-title">
      <h2 id="about-title" class="sec-title">プロフィール</h2>
      <div class="about-body">
        <img class="avatar" src="https://avatars.githubusercontent.com/u/60843145?v=4&amp;s=240" width="120" height="120" alt="あむのアイコン" loading="lazy" decoding="async">
        <div>
          <p class="about-name">${esc(cfg.displayName)} <span>@${esc(cfg.user)}</span></p>
          <p>自宅でテレビを録画して見る環境を組むのが好きです。使っているオープンソースソフトに手を入れるうちに、改造版と自作のツールが少しずつ増えていきました。</p>
          <p>チューナーの制御、B-CAS カードの共有、録画の管理、テレビ以外の端末で見る仕組みまで、放送を受けてから見るまでの流れを一通り触っています。最近は、それらをコマンド一つでまとめて立ち上げられるようにしています。</p>
          <ul class="stack" aria-label="よく触るソフトウェア">
            ${stack.map((s) => `<li>${esc(s)}</li>`).join("\n            ")}
          </ul>
        </div>
      </div>
    </section>

    <section class="langs" id="langs" aria-labelledby="langs-title">
      <h2 id="langs-title" class="sec-title">使っている言語</h2>
      <p class="langs-note">番組表に載せたリポジトリで、いちばん多く使われているプログラミング言語を数えました。フォークは元のプロジェクトの言語で数えています。</p>
      <div class="lang-bar" role="img" aria-label="${langs.map(([l, n]) => `${l} ${n}本`).join("、")}">${langBar}</div>
      <ul class="lang-list">
            ${langList}
      </ul>
    </section>

    <section class="links" id="links" aria-labelledby="links-title">
      <h2 id="links-title" class="sec-title">リンク</h2>
      <ul class="link-list">
        <li><a href="https://github.com/${cfg.user}" rel="me noopener"><span class="link-k k-blue" aria-hidden="true"></span><strong>GitHub</strong><span>github.com/${cfg.user}</span></a></li>
        <li><a href="https://x.com/${cfg.x}" rel="me noopener"><span class="link-k k-red" aria-hidden="true"></span><strong>X</strong><span>@${cfg.x}</span></a></li>
      </ul>
    </section>
  </main>

  <footer class="foot">
    <p>© ${today.y} ${esc(cfg.displayName)} (${esc(cfg.user)})</p>
    <p>番組表は GitHub の公開リポジトリから毎週自動で更新しています。最終更新 <time datetime="${now.toISOString()}">${fmtDate(now.toISOString())}</time></p>
  </footer>

  <div class="pops">
    ${repos.map(popover).join("\n    ")}
  </div>
</body>
</html>
`;

await writeFile(path.join(root, "index.html"), html);
console.log(`index.html を生成しました（${repos.length} 本、${recentRows.length + olderRows.length} 行）`);
