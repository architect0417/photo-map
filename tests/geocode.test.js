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
