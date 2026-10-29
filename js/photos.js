// 写真データの整理（画面や保存に依存しない計算だけ）

const validCoord = (v) => typeof v === "number" && Number.isFinite(v);

// exifr.parse() の結果から、撮影日時・位置・名前を取り出す。位置が無効なら null
export function pickMeta(raw, file) {
  if (!raw) return null;
  const lat = raw.latitude, lon = raw.longitude;
  if (!validCoord(lat) || !validCoord(lon) || (lat === 0 && lon === 0)) return null;
  const date = [raw.DateTimeOriginal, raw.CreateDate].find((d) => d instanceof Date && !isNaN(d));
  return { takenAt: date ? date.getTime() : file.lastModified, lat, lon, name: file.name };
}

export function makeId(meta) {
  return `${meta.takenAt}_${meta.lat.toFixed(6)}_${meta.lon.toFixed(6)}_${meta.name}`;
}

// 端末の時刻で 0 時区切りの "YYYY-MM-DD"
export function dayKey(takenAt) {
  const d = new Date(takenAt);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const byOldest = (a, b) => a.takenAt - b.takenAt;

// 日付は新しい順、各日の中は撮影時刻の古い順
export function groupByDay(photos) {
  const days = new Map();
  for (const p of photos) {
    const key = dayKey(p.takenAt);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(p);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, list]) => ({ day, photos: list.sort(byOldest) }));
}

// 時刻順の [lat, lon]。2枚未満なら線は引かないので空
export function routeOf(photos) {
  if (photos.length < 2) return [];
  return [...photos].sort(byOldest).map((p) => [p.lat, p.lon]);
}

// 保存済みのものと、今回の選択の中での重複を除く
export function uniqueNew(metas, existingIds) {
  const seen = new Set(existingIds);
  return metas.filter((m) => {
    const id = makeId(m);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// 少しずつ保存するために n 件ずつに分ける
export function chunk(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

// 保存の失敗を、画面に出せる Error に直す
export function storageError(err) {
  if (err && err.name === "QuotaExceededError") return new Error("iPhoneの保存容量が足りません。写真を減らして試してください");
  return err instanceof Error ? err : new Error("写真を保存できませんでした");
}

// 地図の範囲内の写真を新しい順で
export function inBounds(photos, b) {
  return photos
    .filter((p) => p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east)
    .sort((a, b) => b.takenAt - a.takenAt);
}

// [lat, lon] の並びを、点と点をまっすぐ結んだ長さ（km）で合計する
export function distanceKm(latlngs) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  let km = 0;
  for (let i = 1; i < latlngs.length; i++) {
    const [lat1, lon1] = latlngs[i - 1], [lat2, lon2] = latlngs[i];
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    km += 2 * R * Math.asin(Math.sqrt(a));
  }
  return km;
}

// 1日分の移動距離と、最初・最後の撮影時刻
export function daySummary(photos) {
  const sorted = [...photos].sort(byOldest);
  return {
    km: distanceKm(sorted.map((p) => [p.lat, p.lon])),
    start: sorted[0].takenAt,
    end: sorted[sorted.length - 1].takenAt,
  };
}

// a から b へ t（0〜1）の割合だけ進んだ位置
export function lerpPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// 地名を調べるときの場所の区切り（小数3桁＝約100m四方）
export const placeKey = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

// 地名ごとの枚数を多い順に。地名が未取得・不明の写真は数えない
export function placesOf(photos) {
  const counts = new Map();
  for (const p of photos) if (p.place) counts.set(p.place, (counts.get(p.place) || 0) + 1);
  return [...counts.entries()]
    .map(([place, count]) => ({ place, count }))
    .sort((a, b) => b.count - a.count || (a.place < b.place ? -1 : 1));
}

// 一番最近に追加した分。batch の無い古い写真は、まとめて1回分として扱う
export function lastBatch(photos) {
  if (photos.length === 0) return [];
  const latest = Math.max(...photos.map((p) => p.batch || 0));
  return photos.filter((p) => (p.batch || 0) === latest);
}
