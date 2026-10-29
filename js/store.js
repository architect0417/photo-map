// 写真データの保存（Safari の中の IndexedDB）

const DB_NAME = "photo-map";
const STORE = "photos";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPhotos() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putPhotos(photos) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const p of photos) store.put(p);
    tx.oncomplete = () => resolve();
    const fail = () => {
      const err = tx.error;
      reject(err && err.name === "QuotaExceededError"
        ? new Error("iPhoneの保存容量が足りません。写真を減らして試してください")
        : err);
    };
    tx.onerror = fail;
    tx.onabort = fail;
  });
}
