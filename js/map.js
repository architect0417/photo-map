// 地図（Leaflet。グローバルの L を使う）

export function createMap(el) {
  const map = L.map(el, { zoomControl: false }).setView([26.5, 127.9], 9);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const pins = L.layerGroup().addTo(map);
  let route = null;

  return {
    showPhotos(photos, thumbUrl, onTap) {
      pins.clearLayers();
      for (const p of photos) {
        const icon = L.divIcon({
          className: "pin",
          html: `<img src="${thumbUrl(p)}" alt="">`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });
        L.marker([p.lat, p.lon], { icon }).on("click", () => onTap(p)).addTo(pins);
      }
    },
    showRoute(latlngs) {
      if (route) route.remove();
      route = latlngs.length ? L.polyline(latlngs, { color: "#0f7c6e", weight: 4, opacity: 0.85 }).addTo(map) : null;
    },
    fitTo(latlngs) {
      if (latlngs.length === 1) map.setView(latlngs[0], 15, { animate: false });
      else if (latlngs.length > 1) map.fitBounds(latlngs, { padding: [40, 40], animate: false });
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
