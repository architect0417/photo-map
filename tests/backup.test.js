import { test } from "node:test";
import assert from "node:assert/strict";
import { packBackup, unpackBackup, solid } from "../js/backup.js";

const jpg = (s) => new Blob([s], { type: "image/jpeg" });
const photos = [
  { id: "a", takenAt: 1, lat: 26.1, lon: 127.1, name: "あ.jpg", place: "沖縄県宜野湾市", area: "我如古", batch: 5, thumb: jpg("t1"), medium: jpg("medium-1") },
  { id: "b", takenAt: 2, lat: 26.2, lon: 127.2, name: "b.jpg", thumb: jpg("t22"), medium: jpg("m2") },
];

test("packBackup → unpackBackup：写真の情報と中身が元に戻る（batch は持ち出さない）", async () => {
  const back = await unpackBackup(packBackup(photos));
  assert.equal(back.length, 2);
  assert.deepEqual(
    { ...back[0], thumb: undefined, medium: undefined },
    { id: "a", takenAt: 1, lat: 26.1, lon: 127.1, name: "あ.jpg", place: "沖縄県宜野湾市", area: "我如古", thumb: undefined, medium: undefined },
  );
  assert.equal(await back[0].thumb.text(), "t1");
  assert.equal(await back[0].medium.text(), "medium-1");
  assert.equal(await back[1].thumb.text(), "t22");
  assert.equal(await back[1].medium.text(), "m2");
  const m = await solid(back[1].medium);
  assert.equal(m.type, "image/jpeg");
  assert.equal(await m.text(), "m2");
});

test("unpackBackup：写真が0枚でも読める", async () => {
  assert.deepEqual(await unpackBackup(packBackup([])), []);
});

test("unpackBackup：このアプリのファイルでなければ null", async () => {
  assert.equal(await unpackBackup(new Blob(["hello"])), null);
  assert.equal(await unpackBackup(new Blob(["PHOTOMAP1\n0000000005\n{bad}"])), null);
});
