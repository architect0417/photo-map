// 写真データの保存（Safari の中の IndexedDB）

import { storageError } from "./photos.js";

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
    // onerror の時点では tx.error がまだ空のことがあるので、abort で理由を受け取る
    tx.onabort = () => reject(storageError(tx.error));
  });
}

export async function deletePhotos(ids) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("取り消せませんでした"));
  });
}
