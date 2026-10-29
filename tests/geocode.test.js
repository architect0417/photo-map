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

import { parsePlace } from "../js/geocode.js";

test("parsePlace: 都道府県＋市町村", () => {
  assert.equal(parsePlace({ address: { city: "宜野湾市", province: "沖縄県", "ISO3166-2-lvl4": "JP-47" } }), "沖縄県宜野湾市");
  assert.equal(parsePlace({ address: { town: "本部町", county: "国頭郡", province: "沖縄県", "ISO3166-2-lvl4": "JP-47" } }), "沖縄県本部町");
  assert.equal(parsePlace({ address: { village: "宜野座村", "ISO3166-2-lvl4": "JP-47" } }), "沖縄県宜野座村");
});
test("parsePlace: 都道府県名が無くても番号から付ける（東京など）", () => {
  assert.equal(parsePlace({ address: { city: "新宿区", "ISO3166-2-lvl4": "JP-13" } }), "東京都新宿区");
  assert.equal(parsePlace({ address: { city: "札幌市", "ISO3166-2-lvl4": "JP-01" } }), "北海道札幌市");
});
test("parsePlace: 地名が無ければ null（海の上など）", () => {
  assert.equal(parsePlace({ error: "Unable to geocode" }), null);
  assert.equal(parsePlace({ address: {} }), null);
  assert.equal(parsePlace(null), null);
});
