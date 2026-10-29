// 画面の操作と各部品のつなぎ込み

import { pickMeta, makeId, groupByDay, routeOf, uniqueNew, inBounds, chunk, daySummary, lerpPoint } from "./photos.js";
import { searchPlace } from "./geocode.js";
import { resizeAll } from "./images.js";
import { getAllPhotos, putPhotos } from "./store.js";
import { createMap } from "./map.js";

const $ = (id) => document.getElementById(id);
const view = createMap($("map"));
let photos = [];

// Blob の表示用 URL は写真ごとに1回だけ作る
const urlCache = new Map();
function blobUrl(p, kind) {
  const key = `${kind}:${p.id}`;
  if (!urlCache.has(key)) urlCache.set(key, URL.createObjectURL(p[kind]));
  return urlCache.get(key);
}
const thumbUrl = (p) => blobUrl(p, "thumb");

const pad = (n) => String(n).padStart(2, "0");
function fmtDateTime(t) {
  const d = new Date(t);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fmtTime = (t) => { const d = new Date(t); return `${d.getHours()}:${pad(d.getMinutes())}`; };
const fmtKm = (km) => (km < 10 ? km.toFixed(1) : Math.round(km)) + "km";
function fmtDay(day) {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5000);
}

// ---- 写真を大きく表示 ----
function openViewer(p) {
  $("viewerImg").src = blobUrl(p, "medium");
  $("viewerTime").textContent = fmtDateTime(p.takenAt);
  $("viewer").hidden = false;
}
$("viewerClose").addEventListener("click", () => ($("viewer").hidden = true));

// ---- ルート再生 ----
// 印がルートを進み、写真の場所に着くたびにその写真を約2秒出す
let playing = null;
let playGroup = null;
const MOVE_MS = 1200, SHOW_MS = 2000;

function stopPlay() {
  if (playing) playing.stopped = true;
  playing = null;
  $("play").textContent = "▶再生";
  $("playCard").hidden = true;
  view.clearMover();
}

function showPlayButton(group) {
  stopPlay();
  playGroup = group && group.photos.length > 1 ? group : null;
  $("play").hidden = !playGroup;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function moveAlong(a, b, run) {
  return new Promise((done) => {
    const t0 = performance.now();
    const step = (now) => {
      if (run.stopped) return done();
      const t = Math.min(1, (now - t0) / MOVE_MS);
      view.setMover(lerpPoint(a, b, t));
      if (t < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
}

async function play(group) {
  stopPlay();
  const run = { stopped: false };
  playing = run;
  $("play").textContent = "■停止";
  const list = group.photos;
  for (const [i, p] of list.entries()) {
    const here = [p.lat, p.lon];
    if (i === 0) view.setMover(here);
    else {
      $("playCard").hidden = true;
      await moveAlong([list[i - 1].lat, list[i - 1].lon], here, run);
    }
    if (run.stopped) return;
    $("playImg").src = blobUrl(p, "medium");
    $("playTime").textContent = `${fmtDateTime(p.takenAt)}（${i + 1}/${list.length}）`;
    $("playCard").hidden = false;
    await wait(SHOW_MS);
    if (run.stopped) return;
  }
  stopPlay();
}

$("play").addEventListener("click", () => {
  if (playing) stopPlay();
  else if (playGroup) play(playGroup);
});

// ---- 下の欄：日付一覧 ----
function showAll() {
  showPlayButton(null);
  view.refresh();
  view.showPhotos(photos, thumbUrl, openViewer);
  view.showRoute([]);
  view.fitTo(photos.map((p) => [p.lat, p.lon]));
}

function selectDay(group, card) {
  for (const c of document.querySelectorAll(".day")) c.classList.toggle("active", c === card);
  showPlayButton(group);
  view.refresh();
  view.showPhotos(group.photos, thumbUrl, openViewer);
  const route = routeOf(group.photos);
  view.showRoute(route);
  view.fitTo(group.photos.map((p) => [p.lat, p.lon]));
}

function renderDays() {
  showPlayButton(null);
  $("results").hidden = true;
  const list = $("days");
  list.hidden = false;
  list.innerHTML = "";
  if (photos.length === 0) {
    list.innerHTML = `<p class="empty">右上の「＋写真」から iPhone の写真を追加してください</p>`;
    return;
  }
  const all = document.createElement("button");
  all.className = "day active";
  all.innerHTML = `<b>すべて</b><span>${photos.length}枚</span>`;
  all.addEventListener("click", () => {
    for (const c of document.querySelectorAll(".day")) c.classList.toggle("active", c === all);
    showAll();
  });
  list.appendChild(all);
  for (const g of groupByDay(photos)) {
    const card = document.createElement("button");
    card.className = "day";
    const s = daySummary(g.photos);
    const span = s.start === s.end ? fmtTime(s.start) : `${fmtTime(s.start)}〜${fmtTime(s.end)}`;
    card.innerHTML = `<img src="${thumbUrl(g.photos[0])}" alt=""><b>${fmtDay(g.day)}</b><span>${g.photos.length}枚${g.photos.length > 1 ? "・" + fmtKm(s.km) : ""}</span><span>${span}</span>`;
    card.addEventListener("click", () => selectDay(g, card));
    list.appendChild(card);
  }
}

// ---- 下の欄：検索結果（地図の範囲内の写真） ----
// 先に欄を出して地図の大きさを確定させてから、範囲を合わせて写真を探す
function renderResults(place) {
  $("days").hidden = true;
  $("results").hidden = false;
  $("resultsList").innerHTML = "";
  view.refresh();
  view.fitBounds(place.bounds);
  const placeName = place.name;
  const found = inBounds(photos, view.getBounds());
  $("resultsTitle").textContent = `${placeName.split(",")[0]} 周辺：${found.length}枚`;
  const ul = $("resultsList");
  ul.innerHTML = "";
  for (const p of found) {
    const li = document.createElement("li");
    li.innerHTML = `<button><img src="${thumbUrl(p)}" alt=""><span>${fmtDateTime(p.takenAt)}</span></button>`;
    li.querySelector("button").addEventListener("click", () => openViewer(p));
    ul.appendChild(li);
  }
  if (found.length === 0) ul.innerHTML = `<li class="empty">この範囲で撮った写真はありません</li>`;
}
$("backToDays").addEventListener("click", () => {
  renderDays();
  showAll();
});

$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (!q) return;
  $("q").blur();
  try {
    const place = await searchPlace(q);
    if (!place) return toast("見つかりませんでした。別の言い方で試してください");
    showPlayButton(null);
    view.showPhotos(photos, thumbUrl, openViewer);
    view.showRoute([]);
    renderResults(place);
  } catch (err) {
    toast(err.message);
  }
});

// ---- 写真の追加 ----
// 処理中に2回目の追加をさせない（重複判定が前回分を知らないため）
function setBusy(busy) {
  $("pick").disabled = busy;
  document.querySelector(".add").classList.toggle("busy", busy);
}

$("pick").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (files.length === 0) return;
  setBusy(true);
  try {
    await addFiles(files);
  } finally {
    setBusy(false);
  }
});

async function addFiles(files) {
  const metas = [];
  const fileOf = new Map();
  let noGps = 0;
  for (const [i, file] of files.entries()) {
    toast(`読み込み中 ${i + 1}/${files.length}`);
    let raw = null;
    try {
      raw = await exifr.parse(file, { gps: true });
    } catch {
      raw = null;
    }
    const meta = pickMeta(raw, file);
    if (!meta) { noGps++; continue; }
    metas.push(meta);
    fileOf.set(meta, file);
  }

  // 10枚ずつ保存し、途中で失敗してもそれまでの分は残す
  const fresh = uniqueNew(metas, new Set(photos.map((p) => p.id)));
  let done = 0, broken = 0, countAdded = 0, stopReason = null;
  for (const group of chunk(fresh, 10)) {
    const batch = [];
    for (const m of group) {
      toast(`画像を準備中 ${++done}/${fresh.length}`);
      try {
        const [thumb, medium] = await resizeAll(fileOf.get(m), [160, 1200]);
        batch.push({ id: makeId(m), ...m, thumb, medium });
      } catch {
        broken++;
      }
    }
    try {
      await putPhotos(batch);
      photos = photos.concat(batch);
      countAdded += batch.length;
    } catch (err) {
      stopReason = (err && err.message) || "写真を保存できませんでした";
      break;
    }
  }

  renderDays();
  showAll();
  const msgs = [];
  if (stopReason) msgs.push(stopReason);
  msgs.push(`${countAdded}枚追加しました`);
  if (metas.length > fresh.length) msgs.push(`${metas.length - fresh.length}枚は追加済みでした`);
  if (noGps) msgs.push(`${noGps}枚は位置情報がないため追加できませんでした`);
  if (broken) msgs.push(`${broken}枚は画像を読み込めませんでした`);
  toast(msgs.join("／"));
}

// ---- 起動 ----
(async () => {
  try {
    photos = await getAllPhotos();
  } catch {
    toast("保存した写真を読み込めませんでした");
  }
  renderDays();
  if (photos.length) showAll();
})();
