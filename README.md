# stuayu.github.io

あむ (stuayu) のポートフォリオサイトです。公開しているリポジトリを、テレビの番組表のような形で並べています。

https://stuayu.github.io/

## 番組表の更新

番組表（`index.html`）は、GitHub の公開リポジトリの情報から自動で作っています。

- 毎週月曜の朝 3 時に GitHub Actions が自動で更新します（`.github/workflows/refresh.yml`）
- 手元で更新するときは `node scripts/build.mjs` を実行します（Node.js 20 以上）
- ネットにつながない環境では `node scripts/build.mjs --offline` で、保存済みのデータ（`data/repos.json`）から作り直せます

## 番組の分け方や説明を変える

`data/channels.json` を編集します。

- `channels`: どのリポジトリをどのチャンネル（録画・チューナー・視聴・構築・その他）に載せるか
- `blurbs`: 番組表に表示する説明文
- `exclude`: 番組表に載せないリポジトリ

どのチャンネルにも書いていない新しいリポジトリは「構築・その他」に入ります。

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | 生成されたページ（直接編集しない） |
| `scripts/build.mjs` | ページを生成するスクリプト |
| `assets/style.css` | 見た目 |
| `assets/app.js` | 時計、「放送中」の判定、番組詳細の表示 |
| `assets/og.png` | SNS で共有したときに表示される画像 |
