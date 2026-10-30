// 他の機器へ移すための書き出し・読み込み（ファイル1つにまとめる）
// 形式：先頭の印 "PHOTOMAP1\n" → 目次の長さ（10桁＋改行） → 目次（JSON） → 写真の中身を順に並べたもの

const MAGIC = "PHOTOMAP1\n";
const HEAD = MAGIC.length + 11;

// 写真の一覧から、書き出すファイルの中身（Blob）を作る
export function packBackup(photos) {
  const list = photos.map(({ thumb, medium, batch, ...meta }) => ({ ...meta, thumbSize: thumb.size, mediumSize: medium.size }));
  const index = new TextEncoder().encode(JSON.stringify({ photos: list }));
  const len = String(index.length).padStart(10, "0") + "\n";
  const parts = [MAGIC, len, index];
  for (const p of photos) parts.push(p.thumb, p.medium);
  return new Blob(parts, { type: "application/octet-stream" });
}

// 書き出したファイルを読み、写真の一覧に戻す。違うファイルなら null
// thumb・medium は元のファイルの一部分を指すだけなので、保存する前に solid() で中身を取り出す
export async function unpackBackup(file) {
  const head = await file.slice(0, HEAD).text();
  if (!head.startsWith(MAGIC) || !/^\d{10}\n$/.test(head.slice(MAGIC.length))) return null;
  const len = Number(head.slice(MAGIC.length, MAGIC.length + 10));
  let index;
  try {
    index = JSON.parse(await file.slice(HEAD, HEAD + len).text());
  } catch {
    return null;
  }
  if (!index || !Array.isArray(index.photos)) return null;
  let pos = HEAD + len;
  const cut = (size) => file.slice(pos, (pos += size), "image/jpeg");
  return index.photos.map(({ thumbSize, mediumSize, ...meta }) => ({ ...meta, thumb: cut(thumbSize), medium: cut(mediumSize) }));
}

export async function solid(blob) {
  return new Blob([await blob.arrayBuffer()], { type: blob.type || "image/jpeg" });
}
