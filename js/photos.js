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

// 地図の範囲内の写真を新しい順で
export function inBounds(photos, b) {
  return photos
    .filter((p) => p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east)
    .sort((a, b) => b.takenAt - a.takenAt);
}
