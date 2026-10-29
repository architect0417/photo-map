// 画像の縮小（長辺を maxSide 以下にして JPEG にする）

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

export async function resize(file, maxSide) {
  const src = await decode(file);
  const w = src.width, h = src.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src.close) src.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を作れませんでした"))), "image/jpeg", 0.8)
  );
}
