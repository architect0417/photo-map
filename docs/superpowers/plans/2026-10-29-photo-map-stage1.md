# photo-map 第1弾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhone の Safari で動く、写真を地図に表示する Webアプリ（第1弾）を作り、GitHub Pages に公開する。

**Architecture:** ビルド不要の静的サイト（HTML＋CSS＋ES modules）。計算だけの処理（日付まとめ・重複判定・近くの写真・検索結果の解釈）は DOM に依存しない純粋な関数にして Node.js の標準テスト（`node --test`）で確かめる。写真の読み取り・画像縮小・保存・地図は薄いラッパーにして、ブラウザで確認する。

**Tech Stack:** Leaflet 1.9.4（cdnjs）、exifr 7.1.3（jsDelivr, `full.umd.js`）、OpenStreetMap タイル、Nominatim、IndexedDB、Node.js LTS（テストのみ）、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-10-29-photo-map-design.md`

## Global Constraints

- 費用は無料のみ。有料サービス・APIキーが要るものは使わない
- 写真はネットに送らない。外部への通信は地図タイルと Nominatim の地名検索だけ
- 画面の文言はすべて日本語
- 置き場所：GitHub Pages `architect0417.github.io/photo-map`（公開リポジトリ `architect0417/photo-map`）
- 重複判定：撮影日時＋位置＋ファイル名が同じなら二重登録しない
- 日付の区切り：撮影日（端末の時刻で 0 時区切り）
- 位置情報がない写真は追加せず「〇枚は位置情報がないため追加できませんでした」と表示
- 地名が見つからないとき「見つかりませんでした。別の言い方で試してください」と表示
- 第2弾（距離・時間）・第3弾（ルート再生）は作らない。ただし写真は「撮影日ごと・時間順」の形で持つ
- iPhone 幅（約 390px）で横スクロールが出ないこと

## Review Focus

1. 撮影日時が無く位置だけある写真 → `CreateDate`、それも無ければファイルの更新日時を使って追加する（Task 2 でテスト）
2. 緯度経度が数値でない・(0,0) の写真 → 「位置情報なし」として数える（Task 2 でテスト）
3. 1日に写真が1枚だけ → ルートの線は引かず、ピンだけ出す（Task 2 の `routeOf` でテスト）
4. 同じ写真を同じ選択の中で2回含めた／前回追加済み → どちらも1件だけ保存（Task 2 でテスト）
5. 保存容量の不足・地名検索の通信エラー → 画面に理由を出し、それまでの保存データは壊さない（Task 3・Task 5 でテスト／手動確認）

---

## File Structure

| ファイル | 役割 |
|---|---|
| `index.html` | 画面の骨組み、ライブラリ読み込み |
| `style.css` | 見た目（スマホ縦画面が基本） |
| `js/photos.js` | 純粋関数：メタ情報の整理、ID、日付まとめ、ルート、近くの写真 |
| `js/geocode.js` | 地名検索（Nominatim）と結果の解釈 |
| `js/images.js` | 画像の縮小（小 160px／中 1200px） |
| `js/store.js` | IndexedDB への保存・読み出し |
| `js/map.js` | Leaflet の地図・ピン・ルート線 |
| `js/app.js` | 画面の操作と各部品のつなぎ込み |
| `tests/photos.test.js` | `photos.js` のテスト |
| `tests/geocode.test.js` | `geocode.js` の解釈部分のテスト |
| `package.json` | `"type": "module"` と `npm test` → `node --test tests/` |

### 写真データの形（全タスク共通）

```js
// Photo
{
  id: string,          // makeId() の結果
  takenAt: number,     // ミリ秒（Date.getTime()）
  lat: number,
  lon: number,
  name: string,        // 元のファイル名
  thumb: Blob,         // 長辺 160px JPEG
  medium: Blob         // 長辺 1200px JPEG
}
```

---

### Task 1: 準備（道具の導入とリポジトリの初期化）

**Files:**
- Create: `package.json`, `.gitignore`（`node_modules/`）

- [ ] **Step 1:** 玉ちゃんに確認を取ってから、Node.js LTS と GitHub CLI を入れる
  Run: `winget install OpenJS.NodeJS.LTS` と `winget install GitHub.cli`
  Expected: 新しいシェルで `node -v` と `gh --version` が表示される
- [ ] **Step 2:** `package.json` を作る（`"name": "photo-map"`, `"private": true`, `"type": "module"`, `"scripts": {"test": "node --test tests/"}`）。依存パッケージは入れない
- [ ] **Step 3:** `git init` して、既存の `docs/` と `package.json`, `.gitignore` をコミット
  `git commit -m "chore: 設計書と計画書、テスト設定を追加"`

### Task 2: 写真データの整理（純粋関数）

**Files:**
- Create: `js/photos.js`
- Test: `tests/photos.test.js`

**Interfaces:**
- Produces:
  - `pickMeta(raw: object|null, file: {name: string, lastModified: number}) -> {takenAt: number, lat: number, lon: number, name: string} | null`
    raw は `exifr.parse()` の結果。位置が無効なら `null`
  - `makeId(meta) -> string` 形式：`` `${takenAt}_${lat.toFixed(6)}_${lon.toFixed(6)}_${name}` ``
  - `dayKey(takenAt: number) -> string` 形式 `"YYYY-MM-DD"`（端末の時刻）
  - `groupByDay(photos: Photo[]) -> {day: string, photos: Photo[]}[]` 日付は新しい順、各日の中は撮影時刻の古い順
  - `routeOf(photos: Photo[]) -> [number, number][]` 時刻順の `[lat, lon]`。2枚未満なら `[]`
  - `uniqueNew(metas: Meta[], existingIds: Set<string>) -> Meta[]` 既存と、選択内の重複を除く
  - `inBounds(photos: Photo[], b: {south, west, north, east}) -> Photo[]` 範囲内の写真を新しい順で

- [ ] **Step 1: 失敗するテストを書く**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickMeta, makeId, dayKey, groupByDay, routeOf, uniqueNew, inBounds } from "../js/photos.js";

const file = { name: "IMG_1.jpeg", lastModified: new Date(2026, 9, 1, 9, 0).getTime() };
const at = (h, m = 0, d = 29) => new Date(2026, 9, d, h, m).getTime();

test("pickMeta: 撮影日時と位置を取り出す", () => {
  const m = pickMeta({ latitude: 26.25594, longitude: 127.75073, DateTimeOriginal: new Date(2026, 9, 29, 20, 6) }, file);
  assert.deepEqual(m, { takenAt: at(20, 6), lat: 26.25594, lon: 127.75073, name: "IMG_1.jpeg" });
});
test("pickMeta: DateTimeOriginal が無ければ CreateDate、それも無ければ lastModified", () => {
  assert.equal(pickMeta({ latitude: 26, longitude: 127, CreateDate: new Date(2026, 9, 29, 8) }, file).takenAt, at(8));
  assert.equal(pickMeta({ latitude: 26, longitude: 127 }, file).takenAt, file.lastModified);
});
test("pickMeta: 位置が無い・数値でない・(0,0) なら null", () => {
  assert.equal(pickMeta(null, file), null);
  assert.equal(pickMeta({ DateTimeOriginal: new Date() }, file), null);
  assert.equal(pickMeta({ latitude: NaN, longitude: 127 }, file), null);
  assert.equal(pickMeta({ latitude: 0, longitude: 0 }, file), null);
});
test("dayKey: 0時で区切る", () => {
  assert.equal(dayKey(at(23, 59)), "2026-10-29");
  assert.equal(dayKey(at(0, 0, 30)), "2026-10-30");
});
test("groupByDay: 日付は新しい順、日の中は古い順", () => {
  const p = (h, d) => ({ id: `${d}-${h}`, takenAt: at(h, 0, d) });
  const g = groupByDay([p(15, 12), p(10, 29), p(9, 29), p(8, 12)]);
  assert.deepEqual(g.map(x => x.day), ["2026-10-29", "2026-10-12"]);
  assert.deepEqual(g[0].photos.map(x => x.id), ["29-9", "29-10"]);
});
test("routeOf: 時刻順、2枚未満は空", () => {
  assert.deepEqual(routeOf([{ takenAt: 2, lat: 2, lon: 2 }, { takenAt: 1, lat: 1, lon: 1 }]), [[1, 1], [2, 2]]);
  assert.deepEqual(routeOf([{ takenAt: 1, lat: 1, lon: 1 }]), []);
});
test("uniqueNew: 既存と選択内の重複を除く", () => {
  const a = { takenAt: 1, lat: 26, lon: 127, name: "a.jpeg" };
  const b = { takenAt: 2, lat: 26, lon: 127, name: "b.jpeg" };
  assert.deepEqual(uniqueNew([a, a, b], new Set([makeId(b)])), [a]);
});
test("inBounds: 範囲内だけを新しい順で", () => {
  const ps = [{ id: "in-old", takenAt: 1, lat: 26.2, lon: 127.7 }, { id: "out", takenAt: 3, lat: 35, lon: 139 }, { id: "in-new", takenAt: 2, lat: 26.3, lon: 127.8 }];
  const r = inBounds(ps, { south: 26, west: 127, north: 27, east: 128 });
  assert.deepEqual(r.map(x => x.id), ["in-new", "in-old"]);
});
```

- [ ] **Step 2:** `npm test` → FAIL（`js/photos.js` が無い）
- [ ] **Step 3:** `js/photos.js` に上の関数を実装（`dayKey` は `getFullYear/getMonth/getDate` を使う）
- [ ] **Step 4:** `npm test` → すべて PASS
- [ ] **Step 5:** `git commit -m "feat: 写真データの整理処理を追加"`

### Task 3: 地名検索

**Files:**
- Create: `js/geocode.js`
- Test: `tests/geocode.test.js`

**Interfaces:**
- Produces:
  - `parseResult(json: any[]) -> {name: string, lat: number, lon: number, bounds: {south, west, north, east}} | null`
    Nominatim の先頭の結果を使う。`boundingbox` は `[south, north, west, east]` の文字列配列
  - `searchPlace(q: string) -> Promise<上と同じ | null>` 通信失敗時は `Error("通信できませんでした。電波の良い場所で試してください")` を投げる
    URL：`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ja&q=<encodeURIComponent(q)>`

- [ ] **Step 1: 失敗するテストを書く**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResult } from "../js/geocode.js";

test("parseResult: 先頭の結果を数値に変換", () => {
  const r = parseResult([{ display_name: "本部町, 沖縄県", lat: "26.65", lon: "127.88", boundingbox: ["26.6", "26.7", "127.8", "127.95"] }]);
  assert.deepEqual(r, { name: "本部町, 沖縄県", lat: 26.65, lon: 127.88, bounds: { south: 26.6, north: 26.7, west: 127.8, east: 127.95 } });
});
test("parseResult: 結果なしは null", () => {
  assert.equal(parseResult([]), null);
  assert.equal(parseResult(null), null);
});
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** `js/geocode.js` を実装（`searchPlace` は `fetch` → `res.ok` でなければ上の Error → `parseResult`）
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** `git commit -m "feat: 地名検索を追加"`

### Task 4: 画像の縮小と保存

**Files:**
- Create: `js/images.js`, `js/store.js`

**Interfaces:**
- Produces:
  - `resize(file: File, maxSide: number) -> Promise<Blob>` `createImageBitmap(file)` → canvas → `toBlob("image/jpeg", 0.8)`。縦横比を保つ。元が小さければ拡大しない
  - `store.js`：DB 名 `photo-map`、ストア `photos`（keyPath `id`）
    - `getAllPhotos() -> Promise<Photo[]>`
    - `putPhotos(photos: Photo[]) -> Promise<void>` 1トランザクションで保存。失敗時は `QuotaExceededError` なら `Error("iPhoneの保存容量が足りません。写真を減らして試してください")`、それ以外は元のエラーを投げる

ブラウザ専用の処理なので自動テストはせず、Task 6 の手動確認で確かめる。

- [ ] **Step 1:** 2ファイルを実装
- [ ] **Step 2:** `git commit -m "feat: 画像の縮小と保存を追加"`

### Task 5: 画面と地図

**Files:**
- Create: `index.html`, `style.css`, `js/map.js`, `js/app.js`

**Interfaces:**
- Consumes: Task 2〜4 のすべての関数
- Produces（`map.js`）:
  - `createMap(el: HTMLElement) -> MapView` 初期表示は沖縄本島（中心 26.5, 127.9、ズーム 9）
  - `MapView.showPhotos(photos: Photo[], onTap: (p: Photo) => void)` 小さい画像のピン（`L.divIcon`＋`<img>`、`URL.createObjectURL(thumb)`）。前回のピンは消す
  - `MapView.showRoute(latlngs)` 線を1本だけ表示（前回の線は消す。空配列なら線なし）
  - `MapView.fitTo(latlngs)` / `MapView.fitBounds(bounds)` / `MapView.getBounds() -> {south, west, north, east}`

**画面（設計書 4章のとおり）**
- 上：検索欄（`<form>`、送信で `searchPlace`）＋「＋写真」ボタン（`<input type="file" accept="image/*" multiple>`）
- 中央：地図
- 下：横スクロールの日付カード「10/29 12枚」。押すと `showRoute(routeOf(...))` と `fitTo`
- 検索後：地図を `bounds` に合わせ、`inBounds` の写真を「日時＋小さい画像」で下の欄に一覧表示（「日付一覧に戻る」ボタン付き）
- ピンを押す：中サイズ画像と「2026/10/29 20:06」形式の撮影日時を重ねて表示、×で閉じる
- 写真追加の流れ：`exifr.parse(file, {gps: true})` → `pickMeta` → `uniqueNew` → `resize`（160 と 1200）→ `putPhotos` → 再描画。終了後に「〇枚追加しました」「〇枚は位置情報がないため追加できませんでした」を表示。処理中は「読み込み中 3/12」
- 写真が0枚のとき：下の欄に「右上の『＋写真』から iPhone の写真を追加してください」
- ライブラリ：`https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js` と `.css`、`https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js`
- 地図の下に OpenStreetMap の著作権表示（Leaflet 標準の attribution）
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` と `<meta name="apple-mobile-web-app-capable" content="yes">`、`<title>写真マップ</title>`

- [ ] **Step 1:** 4ファイルを実装
- [ ] **Step 2:** パソコンで `npx --yes http-server -p 8080` を起動し、ブラウザで開く。実験で使った写真（位置あり）と、位置なしの画像1枚を追加
  Expected：ピンが出る／「1枚は位置情報がないため追加できませんでした」／日付カードを押すと線が出る（2枚以上の日）／「本部町」で検索すると地図が移動する／再読み込み後も写真が残る／同じ写真を再追加しても枚数が増えない
- [ ] **Step 3:** ブラウザの開発ツールで幅 390px にして、横スクロールが出ないことを確認
- [ ] **Step 4:** `npm test` → PASS（既存テストが壊れていない）
- [ ] **Step 5:** `git commit -m "feat: 地図画面と写真追加を追加"`

### Task 6: 公開と iPhone での確認

- [ ] **Step 1:** 玉ちゃんに `gh auth login` をしてもらう（ブラウザで「許可」を押すだけ）
- [ ] **Step 2:** `gh repo create architect0417/photo-map --public --source . --push`
- [ ] **Step 3:** GitHub Pages を有効化
  Run: `gh api -X POST repos/architect0417/photo-map/pages -f "source[branch]=main" -f "source[path]=/"`
  Expected：数分後に `https://architect0417.github.io/photo-map/` が開く
- [ ] **Step 4:** 玉ちゃんが iPhone の Safari で開き、写真を5枚ほど追加 → 「位置あり」で追加されること、日付カード・検索・ピン表示を確認
- [ ] **Step 5:** Safari の共有ボタン →「ホーム画面に追加」で、アイコンから開けることを確認
