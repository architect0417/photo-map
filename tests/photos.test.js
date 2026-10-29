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

import { chunk, storageError } from "../js/photos.js";

test("chunk: 指定の枚数ずつに分ける", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 10), []);
});
test("storageError: 容量不足は日本語の理由、エラーが無くても必ず Error を返す", () => {
  assert.equal(storageError({ name: "QuotaExceededError" }).message, "iPhoneの保存容量が足りません。写真を減らして試してください");
  assert.equal(storageError(null).message, "写真を保存できませんでした");
  assert.ok(storageError(new Error("x")) instanceof Error);
});

import { distanceKm, daySummary, lerpPoint } from "../js/photos.js";

test("distanceKm: 点と点をまっすぐ結んだ長さの合計", () => {
  assert.ok(Math.abs(distanceKm([[26, 127], [27, 127]]) - 111.19) < 0.01);
  assert.ok(Math.abs(distanceKm([[26, 127], [27, 127], [26, 127]]) - 222.39) < 0.01);
  assert.equal(distanceKm([]), 0);
  assert.equal(distanceKm([[26, 127]]), 0);
});
test("daySummary: 距離と最初・最後の撮影時刻", () => {
  const s = daySummary([{ takenAt: at(17, 40), lat: 27, lon: 127 }, { takenAt: at(9, 5), lat: 26, lon: 127 }]);
  assert.equal(s.start, at(9, 5));
  assert.equal(s.end, at(17, 40));
  assert.ok(Math.abs(s.km - 111.19) < 0.01);
  assert.deepEqual(daySummary([{ takenAt: at(9), lat: 26, lon: 127 }]), { km: 0, start: at(9), end: at(9) });
});
test("lerpPoint: 2点の間を t の割合で進んだ位置", () => {
  assert.deepEqual(lerpPoint([0, 0], [10, 20], 0), [0, 0]);
  assert.deepEqual(lerpPoint([0, 0], [10, 20], 0.5), [5, 10]);
  assert.deepEqual(lerpPoint([0, 0], [10, 20], 1), [10, 20]);
});

import { placeKey, placesOf, lastBatch } from "../js/photos.js";

test("placeKey: 約100m四方で同じ場所とみなす", () => {
  assert.equal(placeKey(26.28162, 127.77809), "26.282,127.778");
  assert.equal(placeKey(26.28171, 127.77812), placeKey(26.28158, 127.77791));
  assert.notEqual(placeKey(26.2812, 127.778), placeKey(26.2832, 127.778));
});
test("placesOf: 地名ごとの枚数を多い順に、地名の無い写真は数えない", () => {
  const ps = [{ place: "沖縄県本部町" }, { place: "沖縄県名護市" }, { place: "沖縄県本部町" }, { place: "" }, {}];
  assert.deepEqual(placesOf(ps), [{ place: "沖縄県本部町", count: 2 }, { place: "沖縄県名護市", count: 1 }]);
  assert.deepEqual(placesOf([{}]), []);
});
test("lastBatch: 一番最近の追加分。batch の無い古い写真はまとめて1回分", () => {
  const ps = [{ id: "old1" }, { id: "a", batch: 100 }, { id: "old2" }, { id: "b", batch: 200 }, { id: "c", batch: 200 }];
  assert.deepEqual(lastBatch(ps).map((p) => p.id), ["b", "c"]);
  assert.deepEqual(lastBatch(ps.filter((p) => p.batch !== 200 && p.batch !== 100)).map((p) => p.id), ["old1", "old2"]);
  assert.deepEqual(lastBatch([]), []);
});
