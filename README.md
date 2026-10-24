# stuayu.github.io

あむ (stuayu) のポートフォリオサイトです。主な作品と、公開しているすべてのリポジトリを紹介しています。

https://stuayu.github.io/

## ページの更新

ページ（`index.html`）は、GitHub の公開リポジトリの情報から自動で作っています。

- 毎週月曜の朝 3 時に GitHub Actions が自動で更新します（`.github/workflows/refresh.yml`）
- 手元で更新するときは `node scripts/build.mjs` を実行します（Node.js 20 以上）
- ネットにつながない環境では `node scripts/build.mjs --offline` で、保存済みのデータ（`data/repos.json`）から作り直せます

## 載せる作品や説明を変える

`data/channels.json` を編集します。

- `featured`: 「主な作品」に大きく載せるリポジトリ（上から順に表示）
- `channels`: どのリポジトリをどの分類（録画・チューナー・視聴・その他）に載せるか
- `blurbs`: 表示する説明文
- `exclude`: ページに載せないリポジトリ

どの分類にも書いていない新しいリポジトリは「その他」に入ります。

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | 生成されたページ（直接編集しない） |
| `scripts/build.mjs` | ページを生成するスクリプト |
| `assets/style.css` | 見た目 |
| `assets/og.png` | SNS で共有したときに表示される画像 |
