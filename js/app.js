// 画面の操作と各部品のつなぎ込み

import { pickMeta, makeId, groupByDay, routeOf, uniqueNew, inBounds, chunk, daySummary, lerpPoint, placeKey, placesOf, lastBatch, mainArea, wareki } from "./photos.js";
import { searchPlace, reversePlace } from "./geocode.js";
import { resizeAll } from "./images.js";
import { getAllPhotos, putPhotos, deletePhotos } from "./store.js";
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
  return `${wareki(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fmtTime = (t) => { const d = new Date(t); return `${d.getHours()}:${pad(d.getMinutes())}`; };
const fmtKm = (km) => (km < 10 ? km.toFixed(1) : Math.round(km)) + "km";
function fmtDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  return wareki(new Date(y, m - 1, d));
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

// 大きい写真は読み込みに時間がかかるので、先に読み込んでおく
function preload(url) {
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => {});
}

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
  // 上半分は写真で隠れるので、ルートを下半分に収める
  view.fitTo(routeOf(list), window.innerHeight * 0.5);
  for (const [i, p] of list.entries()) {
    const here = [p.lat, p.lon];
    const url = blobUrl(p, "medium");
    const ready = preload(url); // 印が動いている間に読み込む
    if (i === 0) view.setMover(here);
    else {
      $("playCard").hidden = true;
      await moveAlong([list[i - 1].lat, list[i - 1].lon], here, run);
    }
    await ready;
    if (run.stopped) return;
    $("playImg").src = url;
    await $("playImg").decode().catch(() => {});
    if (run.stopped) return;
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
  $("undo").hidden = photos.length === 0;
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
  dayCards = [];
  for (const g of groupByDay(photos)) {
    const card = document.createElement("div");
    card.className = "day";
    const s = daySummary(g.photos);
    const span = s.start === s.end ? fmtTime(s.start) : `${fmtTime(s.start)}〜${fmtTime(s.end)}`;
    card.innerHTML = `<button class="day-pick" type="button"><img src="${thumbUrl(g.photos[0])}" alt=""><b>${fmtDay(g.day)}</b><span>${g.photos.length}枚${g.photos.length > 1 ? "・" + fmtKm(s.km) : ""}</span><span>${span}</span></button><button class="day-place" type="button"></button>`;
    card.querySelector(".day-pick").addEventListener("click", () => selectDay(g, card));
    const placeBtn = card.querySelector(".day-place");
    placeBtn.addEventListener("click", () => openDayPlaces(g));
    dayCards.push({ group: g, placeBtn });
    list.appendChild(card);
  }
  updatePlaceLabels();
}

// ---- 地名（日付カードの「沖縄県宜野湾市我如古」） ----
let dayCards = [];

// 「沖縄県」と「宜野湾市我如古ほか」の2行。2行目は少し小さく、長ければ「…」で切る
function setPlaceLabel(btn, top, rest) {
  btn.innerHTML = `<span class="pref"></span><span class="rest"></span>`;
  btn.firstChild.textContent = top;
  btn.lastChild.textContent = rest;
}

function updatePlaceLabels() {
  for (const { group, placeBtn } of dayCards) {
    const places = placesOf(group.photos);
    const pending = group.photos.some((p) => p.area === undefined);
    placeBtn.disabled = places.length === 0;
    placeBtn.hidden = places.length === 0 && !pending;
    if (places.length === 0) {
      setPlaceLabel(placeBtn, "地名を", "調べ中…");
      continue;
    }
    const top = places[0].place;
    const m = /^(北海道|.+?[都府県])(.+)$/.exec(top);
    const [pref, city] = m ? [m[1], m[2]] : ["", top];
    setPlaceLabel(placeBtn, pref, city + mainArea(group.photos, top) + (places.length > 1 ? "ほか" : ""));
  }
}

// 写真の位置から市町村名と字名を調べて、写真と一緒に保存する
// 地名サービスの決まりで1秒に1回まで。同じ場所（約100m四方）は1回だけ調べる
// 字名が入る前に調べた写真（area が無い）も、もう一度調べる
const placeCache = new Map();
let filling = false;
async function fillPlaces() {
  if (filling) return;
  filling = true;
  try {
    for (const p of photos) if (p.area !== undefined) placeCache.set(placeKey(p.lat, p.lon), { place: p.place, area: p.area });
    let p;
    while ((p = photos.find((x) => x.area === undefined))) {
      const key = placeKey(p.lat, p.lon);
      if (!placeCache.has(key)) {
        try {
          placeCache.set(key, (await reversePlace(p.lat, p.lon)) || { place: "", area: "" });
        } catch {
          break; // 通信できないときは、次に開いたときに続きを調べる
        }
        await wait(1100);
      }
      // 調べている間に「元に戻す」で消された写真は photos に無いので、保存し直さない
      for (const q of photos.filter((x) => x.area === undefined && placeKey(x.lat, x.lon) === key)) {
        Object.assign(q, placeCache.get(key));
        await putPhotos([q]).catch(() => {});
      }
      updatePlaceLabels();
    }
  } finally {
    filling = false;
    updatePlaceLabels();
  }
}

// その日に行った市町村が1つならすぐ写真を、複数なら選ぶ一覧を出す
function openDayPlaces(group) {
  const places = placesOf(group.photos);
  if (places.length === 1) return showPlace(places[0].place);
  showPlayButton(null);
  openResults(`${fmtDay(group.day)} に行った場所`);
  const ul = $("resultsList");
  for (const { place, count } of places) {
    const li = document.createElement("li");
    li.innerHTML = `<button class="choice" type="button"></button>`;
    li.firstChild.textContent = `${place}（${count}枚）`;
    li.firstChild.addEventListener("click", () => showPlace(place));
    ul.appendChild(li);
  }
}

// その市町村で撮った写真（全日付）を地図と一覧に出す
function showPlace(place) {
  showPlayButton(null);
  const found = photos.filter((p) => p.place === place).sort((a, b) => b.takenAt - a.takenAt);
  openResults(`${place}：${found.length}枚`);
  view.refresh();
  view.showPhotos(found, thumbUrl, openViewer);
  view.showRoute([]);
  view.fitTo(found.map((p) => [p.lat, p.lon]));
  fillResults(found);
}

// ---- 下の欄：検索結果（地図の範囲内の写真） ----
// 先に欄を出して地図の大きさを確定させてから、範囲を合わせて写真を探す
function openResults(title) {
  $("days").hidden = true;
  $("results").hidden = false;
  $("resultsTitle").textContent = title;
  $("resultsList").innerHTML = "";
}

function renderResults(place) {
  openResults("");
  view.refresh();
  view.fitBounds(place.bounds);
  const found = inBounds(photos, view.getBounds());
  $("resultsTitle").textContent = `${place.name.split(",")[0]} 周辺：${found.length}枚`;
  fillResults(found);
}

function fillResults(found) {
  const ul = $("resultsList");
  for (const p of found) {
    const li = document.createElement("li");
    li.innerHTML = `<button><img src="${thumbUrl(p)}" alt=""><span></span></button>`;
    li.querySelector("span").textContent = `${fmtDateTime(p.takenAt)}　${p.area || ""}`;
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
  $("undo").disabled = busy;
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
  const batchId = Date.now(); // 「元に戻す」で、この回の追加分をまとめて消すための印
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
        const [thumb, medium] = await resizeAll(fileOf.get(m), [320, 1200]);
        batch.push({ id: makeId(m), ...m, thumb, medium, batch: batchId });
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
  fillPlaces();
}

// ---- 元に戻す（一番最近の追加分を消す。押すたびに1回前へ） ----
$("undo").addEventListener("click", async () => {
  const target = lastBatch(photos);
  if (target.length === 0) return;
  const when = target[0].batch ? `${fmtDateTime(target[0].batch)} に追加した` : "以前に追加した";
  if (!confirm(`${when}${target.length}枚を取り消しますか？\n（iPhoneの写真アプリの写真は消えません）`)) return;
  setBusy(true);
  try {
    await deletePhotos(target.map((p) => p.id));
  } catch {
    toast("取り消せませんでした");
    return;
  } finally {
    setBusy(false);
  }
  const gone = new Set(target);
  photos = photos.filter((p) => !gone.has(p));
  for (const p of target) {
    for (const kind of ["thumb", "medium"]) {
      const key = `${kind}:${p.id}`;
      if (urlCache.has(key)) URL.revokeObjectURL(urlCache.get(key));
      urlCache.delete(key);
    }
  }
  renderDays();
  showAll();
  toast(`${target.length}枚を取り消しました`);
});

// ---- 起動 ----
(async () => {
  try {
    photos = await getAllPhotos();
  } catch {
    toast("保存した写真を読み込めませんでした");
  }
  renderDays();
  if (photos.length) showAll();
  fillPlaces();
})();
