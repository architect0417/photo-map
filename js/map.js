// 地図（Leaflet。グローバルの L を使う）

export function createMap(el) {
  const map = L.map(el, { zoomControl: false }).setView([26.5, 127.9], 9);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // 拡大するほど写真のピンを大きくする（大きさは CSS の --pin で決める）
  const pinSize = (z) => (z <= 13 ? 44 : z === 14 ? 56 : z === 15 ? 72 : z === 16 ? 96 : 128);
  const setPinSize = () => el.style.setProperty("--pin", `${pinSize(map.getZoom())}px`);
  map.on("zoomend", setPinSize);
  setPinSize();

  // 下の欄の高さが変わったら、地図の大きさを測り直す
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el);

  const pins = L.layerGroup().addTo(map);
  let route = null;
  let mover = null;

  return {
    showPhotos(photos, thumbUrl, onTap) {
      pins.clearLayers();
      for (const p of photos) {
        // 大きさ0の点を撮影地点に置き、写真はその上に三角の先で指すように出す
        const icon = L.divIcon({
          className: "pin",
          html: `<img src="${thumbUrl(p)}" alt="">`,
          iconSize: null,
        });
        L.marker([p.lat, p.lon], { icon }).on("click", () => onTap(p)).addTo(pins);
      }
    },
    showRoute(latlngs) {
      if (route) route.remove();
      route = latlngs.length ? L.polyline(latlngs, { color: "#0f7c6e", weight: 4, opacity: 0.85 }).addTo(map) : null;
    },
    // 再生中に動く印（写真のピンより手前に出す）
    setMover(latlng) {
      if (mover) return mover.setLatLng(latlng);
      const icon = L.divIcon({ className: "mover", iconSize: [18, 18], iconAnchor: [9, 9] });
      mover = L.marker(latlng, { icon, zIndexOffset: 1000, interactive: false }).addTo(map);
    },
    clearMover() {
      if (mover) mover.remove();
      mover = null;
    },
    refresh() {
      map.invalidateSize({ pan: false });
    },
    // top：上に重なる表示の高さ（その下の部分に収める）
    fitTo(latlngs, top = 0) {
      if (latlngs.length === 1) map.setView(latlngs[0], 15, { animate: false });
      else if (latlngs.length > 1) map.fitBounds(latlngs, { paddingTopLeft: [40, 40 + top], paddingBottomRight: [40, 40], maxZoom: 17, animate: false });
    },
    fitBounds(b) {
      map.fitBounds([[b.south, b.west], [b.north, b.east]], { animate: false });
    },
    getBounds() {
      const b = map.getBounds();
      return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
    },
  };
}
