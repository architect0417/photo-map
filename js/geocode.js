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

// ISO3166-2 の JP-01〜JP-47 の順
const PREFS = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
  "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

// 逆ジオコーディングの結果から { place: "沖縄県宜野湾市", area: "我如古" } の形にする。地名が無ければ null
// 字名は quarter。無ければ neighbourhood から「〇丁目」を除いたもの
export function parsePlace(json) {
  const a = json && json.address;
  if (!a) return null;
  const m = /^JP-(\d\d)$/.exec(a["ISO3166-2-lvl4"] || "");
  const pref = (m && PREFS[Number(m[1]) - 1]) || a.province || a.state || "";
  const city = a.city || a.town || a.village || a.county || "";
  if (!(pref + city)) return null;
  const area = a.quarter || (a.neighbourhood || "").replace(/[一二三四五六七八九十]+丁目$/, "");
  return { place: pref + city, area };
}

// 位置（緯度・経度）だけを送って、市町村名と字名を調べる
export async function reversePlace(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=ja&lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("地名を調べられませんでした");
  return parsePlace(await res.json());
}
