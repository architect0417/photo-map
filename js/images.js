// 画像の縮小（1回だけ読み込み、長辺 maxSide 以下の JPEG を複数サイズ作る）

async function decode(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    // createImageBitmap が読めない形式は <img> で読む
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toJpeg(src, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(src.width * scale);
  canvas.height = Math.round(src.height * scale);
  canvas.getContext("2d").drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => {
      // iPhone はキャンバスのメモリ上限が厳しいので、すぐ手放す
      canvas.width = canvas.height = 0;
      b ? resolve(b) : reject(new Error("画像を作れませんでした"));
    }, "image/jpeg", 0.8)
  );
}

export async function resizeAll(file, sizes) {
  const src = await decode(file);
  try {
    const out = [];
    for (const s of sizes) out.push(await toJpeg(src, s));
    return out;
  } finally {
    if (src.close) src.close();
  }
}
