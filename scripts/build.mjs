// GitHub の公開リポジトリの情報から index.html を書き出す。
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
const ym = (iso) => {
  const d = jst(iso);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
};
const breakable = (name) => esc(name).replace(/([_-])/g, "$1<wbr>");
const now = new Date();
const year = jst(now.toISOString()).getUTCFullYear();

const channelOf = new Map();
for (const ch of cfg.channels) for (const n of ch.repos) channelOf.set(n, ch.id);
const chName = Object.fromEntries(cfg.channels.map((c) => [c.id, c.name]));
for (const r of repos) {
  r.channel = channelOf.get(r.name) ?? "etc";
  r.blurb = cfg.blurbs[r.name] ?? r.description;
}
repos.sort((a, b) => new Date(b.pushed) - new Date(a.pushed));
const byName = new Map(repos.map((r) => [r.name, r]));
const featured = cfg.featured.map((n) => byName.get(n)).filter(Boolean);

const ARROW = `<svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function work(r) {
  return `<li class="work">
          <a class="work-link" href="${esc(r.url)}" rel="noopener">
            <span class="work-cat">${esc(chName[r.channel])}</span>
            <span class="work-main">
              <span class="work-name">${breakable(r.name)}</span>
              <span class="work-desc">${esc(r.blurb)}</span>
            </span>
            <span class="work-meta">
              <span class="tag${r.fork ? "" : " tag-own"}">${r.fork ? "フォーク" : "自作"}</span>
              ${r.language ? `<span>${esc(r.language)}</span>` : ""}
              ${r.stars ? `<span>スター ${r.stars}</span>` : ""}
              <span><time datetime="${r.pushed}">${ym(r.pushed)}</time>に更新</span>
            </span>
            ${ARROW}
          </a>
        </li>`;
}

function group(ch) {
  const items = repos.filter((r) => r.channel === ch.id);
  if (!items.length) return "";
  return `<section class="group" aria-labelledby="g-${ch.id}">
          <h3 class="group-title" id="g-${ch.id}">${esc(ch.name)}<span>${items.length}</span></h3>
          <p class="group-note">${esc(ch.note)}</p>
          <ul class="repo-list" role="list">
            ${items
              .map(
                (r) => `<li>
              <a href="${esc(r.url)}" rel="noopener">
                <span class="repo-name">${breakable(r.name)}${r.fork ? `<span class="repo-fork">フォーク</span>` : ""}</span>
                <span class="repo-desc">${esc(r.blurb || "説明はまだありません。")}</span>
              </a>
            </li>`
              )
              .join("\n            ")}
          </ul>
        </section>`;
}

const own = repos.filter((r) => !r.fork);
const langCount = new Map();
for (const r of repos) if (r.language) langCount.set(r.language, (langCount.get(r.language) ?? 0) + 1);
const langs = [...langCount].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l);
const stack = ["Mirakurun", "EPGStation", "EDCB", "KonomiTV", "BonDriver", "Docker"];

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
    knowsAbout: ["テレビ録画", "ISDB", ...stack, ...langs],
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

const title = "あむ (stuayu) | テレビ録画・視聴ツールをつくる人";
const description =
  "あむ (stuayu) のポートフォリオ。Mirakurun、EPGStation、EDCB、KonomiTV など、自宅でテレビを録画して見るためのソフトを改造したり、チューナーやカード共有のツールを自作したりしています。";

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}">
  <meta name="author" content="あむ (stuayu)">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#0b1230">
  <meta name="color-scheme" content="dark">
  <meta property="og:type" content="profile">
  <meta property="og:locale" content="ja_JP">
  <meta property="og:site_name" content="stuayu.github.io">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${SITE}">
  <meta property="og:image" content="${SITE}assets/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="テレビを録って、配って、見るための道具をつくる。あむ (stuayu)">
  <meta property="profile:username" content="${cfg.user}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@${cfg.x}">
  <meta name="twitter:creator" content="@${cfg.x}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500&family=Zen+Kaku+Gothic+New:wght@300;400;500;700&display=swap">
  <link rel="stylesheet" href="/assets/style.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body>
  <a class="skip" href="#works">本文へ移動</a>

  <header class="site-head">
    <a class="brand" href="/" lang="en">stuayu</a>
    <nav aria-label="ページ内リンク">
      <a href="#works">作品</a>
      <a href="#about">プロフィール</a>
      <a href="#links">リンク</a>
    </nav>
  </header>

  <main>
    <section class="hero" aria-labelledby="hero-title">
      <p class="hero-who">あむ <span lang="en">stuayu</span></p>
      <h1 class="hero-title" id="hero-title">
        <span>テレビを録って、</span>
        <span>配って、見るための</span>
        <span>道具をつくる。</span>
      </h1>
      <div class="scan" aria-hidden="true"></div>
      <p class="hero-lede">Mirakurun、EPGStation、EDCB、KonomiTV など、自宅でテレビを録画して見るためのオープンソースソフトを改造したり、足りない部品を自作したりしています。</p>
    </section>

    <section class="works" id="works" aria-labelledby="works-title">
      <div class="sec-head">
        <h2 class="sec-title" id="works-title">主な作品</h2>
        <p class="sec-note">「フォーク」は、ほかの人のプロジェクトを複製して手を加えたものです。</p>
      </div>
      <ol class="work-list" role="list">
        ${featured.map(work).join("\n        ")}
      </ol>
    </section>

    <section class="all" id="all" aria-labelledby="all-title">
      <div class="sec-head">
        <h2 class="sec-title" id="all-title">すべてのリポジトリ</h2>
        <p class="sec-note">公開している ${repos.length} 本を用途ごとに分けて、新しく更新した順に並べています。自分で一から作ったものは ${own.length} 本です。</p>
      </div>
      <div class="groups">
        ${cfg.channels.map(group).join("\n        ")}
      </div>
    </section>

    <section class="about" id="about" aria-labelledby="about-title">
      <div class="sec-head">
        <h2 class="sec-title" id="about-title">プロフィール</h2>
      </div>
      <div class="about-body">
        <img class="avatar" src="https://avatars.githubusercontent.com/u/60843145?v=4&amp;s=192" width="96" height="96" alt="あむのアイコン" loading="lazy" decoding="async">
        <div class="about-text">
          <p class="about-name">あむ <span lang="en">@${esc(cfg.user)}</span></p>
          <p>自宅でテレビを録画して見る環境を組むのが好きです。使っているオープンソースソフトに手を入れるうちに、改造版と自作のツールが少しずつ増えていきました。</p>
          <p>チューナーの制御、B-CAS カードの共有、録画の管理、テレビ以外の端末で見る仕組みまで、放送を受けてから見るまでの流れを一通り触っています。最近は、それらをコマンド一つでまとめて立ち上げられるようにしています。</p>
          <dl class="facts">
            <div><dt>よく触るソフト</dt><dd>${stack.map(esc).join("、")}</dd></div>
            <div><dt>使っている言語</dt><dd>${langs.map(esc).join("、")}</dd></div>
          </dl>
        </div>
      </div>
    </section>

    <section class="links" id="links" aria-labelledby="links-title">
      <div class="sec-head">
        <h2 class="sec-title" id="links-title">リンク</h2>
      </div>
      <ul class="link-list" role="list">
        <li><a href="https://github.com/${cfg.user}" rel="me noopener"><span class="link-name" lang="en">GitHub</span><span class="link-sub">github.com/${cfg.user}</span>${ARROW}</a></li>
        <li><a href="https://x.com/${cfg.x}" rel="me noopener"><span class="link-name" lang="en">X</span><span class="link-sub">@${cfg.x}</span>${ARROW}</a></li>
      </ul>
    </section>
  </main>

  <footer class="site-foot">
    <p>© ${year} あむ (${esc(cfg.user)})</p>
    <p>リポジトリの情報は GitHub から毎週自動で更新しています。</p>
  </footer>
</body>
</html>
`;

await writeFile(path.join(root, "index.html"), html);
console.log(`index.html を生成しました（主な作品 ${featured.length} 本、全 ${repos.length} 本）`);
