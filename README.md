# THE RESIDENCE — 不動産紹介LP

提供された邸宅ウォークスルー動画（10秒）をもとに制作した、不動産紹介ランディングページです。

## 特徴

- **スクロール連動の動画スクラブ**：ページのスクロール量に合わせて動画が滑らかに再生されます。`requestAnimationFrame` + イージング（lerp）により、なめらかな映像送りを実現しています。
- **5つの紹介セクション**：動画の進行に合わせて、以下のキャプションがフェードで切り替わります。
  1. 外観（EXTERIOR）
  2. 玄関（ENTRANCE）
  3. リビング（LIVING）
  4. キッチン（KITCHEN）
  5. 中庭（COURTYARD）
- 物件概要、特長、お問い合わせ（CTA）セクション
- レスポンシブ対応 / `prefers-reduced-motion` 対応

## 構成

```
index.html          ページ本体
css/style.css       スタイル
js/main.js          スクロール連動・スクラブ制御
assets/walkthrough.mp4  ウォークスルー動画
```

## ローカルでの確認

ブラウザのオートプレイ/scrub制約のため、ローカルサーバー経由での表示を推奨します。

```bash
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

## カスタマイズ

- 紹介文・物件概要は `index.html` のテキストを編集してください。
- スクラブ速度は `css/style.css` の `.film { height: 600vh; }` で調整できます（値を大きくするとゆっくり）。
- 映像送りのなめらかさは `js/main.js` の lerp 係数 `0.12` で調整できます。
