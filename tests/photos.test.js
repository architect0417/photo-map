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
