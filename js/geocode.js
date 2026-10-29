// 地名検索（OpenStreetMap の Nominatim）

// Nominatim の結果の先頭を使う。boundingbox は [south, north, west, east] の文字列
export function parseResult(json) {
  if (!Array.isArray(json) || json.length === 0) return null;
  const r = json[0];
  const [south, north, west, east] = r.boundingbox.map(Number);
  return { name: r.display_name, lat: Number(r.lat), lon: Number(r.lon), bounds: { south, north, west, east } };
}

export async function searchPlace(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ja&q=${encodeURIComponent(q)}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    res = null;
  }
  if (!res || !res.ok) throw new Error("通信できませんでした。電波の良い場所で試してください");
  return parseResult(await res.json());
}
