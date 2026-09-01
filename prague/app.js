(() => {
  const data = window.PRAGUE_DATA;
  const state = { view: "itinerary", day: "all", category: "all", search: "", itineraryDay: 1 };
  let map;
  let markerLayer;
  const markers = new Map();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const category = id => data.categories[id] || { label: id, icon: "•" };
  const mapUrl = place => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} Prague ${place.lat},${place.lng}`)}`;
  const dayLabel = place => place.days.length === 4 ? "每日" : place.days.map(day => `D${day}`).join(" · ");
  const firstDay = place => data.days.find(day => place.days.includes(day.id)) || data.days[0];
  const timeForDay = (place, dayId) => place.timeByDay?.[dayId] || place.time || "彈性";
  const searchable = place => `${place.name} ${place.zh} ${place.area} ${place.description}`.toLowerCase();

  function filteredPlaces() {
    const term = state.search.trim().toLowerCase();
    return data.places.filter(place => {
      const dayMatch = state.day === "all" || place.days.includes(Number(state.day));
      const categoryMatch = state.category === "all" || place.category === state.category;
      const searchMatch = !term || searchable(place).includes(term);
      return dayMatch && categoryMatch && searchMatch;
    });
  }

  function createFilters() {
    const holder = $("#day-filters");
    holder.innerHTML = `<button class="filter-chip is-active" data-day="all">全部日子</button>` + data.days.map(day => `<button class="filter-chip" data-day="${day.id}">${day.short}</button>`).join("");
    const select = $("#category-filter");
    Object.entries(data.categories).forEach(([id, item]) => select.insertAdjacentHTML("beforeend", `<option value="${id}">${item.label}</option>`));
  }

  function createItineraryTabs() {
    $("#itinerary-tabs").innerHTML = data.days.map(day => `<button class="day-tab ${day.id === 1 ? "is-active" : ""}" data-itinerary-day="${day.id}"><small>${day.date}</small><strong>${day.title}</strong></button>`).join("");
  }

  function renderItinerary() {
    const day = data.days.find(item => item.id === state.itineraryDay);
    const places = data.places
      .filter(place => place.days.includes(day.id) && (place.time || place.category === "stay"))
      .sort((a, b) => {
        const aIndex = day.order?.indexOf(a.id) ?? -1;
        const bIndex = day.order?.indexOf(b.id) ?? -1;
        return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
      });
    $("#day-summary").innerHTML = `<strong>${day.short} · ${day.date}</strong>${escapeHtml(day.summary)}`;
    $("#day-summary").style.borderColor = day.color;
    $("#timeline").innerHTML = places.map(place => `
      <article class="timeline-item">
        <div class="timeline-time">${escapeHtml(timeForDay(place, day.id))}</div>
        <div class="timeline-card">
          <img src="web-assets/${escapeHtml(place.image)}" alt="${escapeHtml(place.name)}" loading="lazy"${place.imagePosition ? ` style="object-position:${escapeHtml(place.imagePosition)}"` : ""}>
          <div class="timeline-content">
            <div class="meta-row"><span class="meta-badge">${category(place.category).icon} ${category(place.category).label}</span><span class="meta-badge">${escapeHtml(place.area)}</span>${place.duration ? `<span class="meta-badge">${escapeHtml(place.duration)}</span>` : ""}</div>
            <h3>${escapeHtml(place.name)}</h3>
            <div class="zh">${escapeHtml(place.zh)}</div>
            <p>${escapeHtml(place.description)}</p>
            <a class="inline-link" href="${mapUrl(place)}" target="_blank" rel="noopener">Google Maps 導航 ↗</a>
          </div>
        </div>
      </article>`).join("");
  }

  function buildPlaceCard(place) {
    const fragment = $("#place-card-template").content.cloneNode(true);
    const card = $(".place-card", fragment);
    const image = $(".place-image", fragment);
    image.src = `web-assets/${place.image}`;
    image.alt = place.name;
    if (place.imagePosition) image.style.objectPosition = place.imagePosition;
    $(".place-day", fragment).textContent = dayLabel(place);
    $(".place-category", fragment).textContent = `${category(place.category).icon} ${category(place.category).label}`;
    $(".place-area", fragment).textContent = place.area;
    $(".place-title", fragment).textContent = place.name;
    $(".place-zh", fragment).textContent = place.zh;
    $(".place-description", fragment).textContent = place.description;
    $(".place-time", fragment).textContent = place.time || place.duration || "";
    const link = $(".map-link", fragment);
    link.href = mapUrl(place);
    if (place.approximate) link.textContent = "區域位置（約）↗";
    card.dataset.placeId = place.id;
    return fragment;
  }

  function renderPlaces() {
    const places = filteredPlaces();
    const grid = $("#places-grid");
    grid.innerHTML = "";
    places.forEach(place => grid.append(buildPlaceCard(place)));
    $("#places-result-count").textContent = `顯示 ${places.length}／${data.places.length} 個地點`;
    $("#empty-state").hidden = places.length > 0;
  }

  function markerHtml(place) {
    const day = firstDay(place);
    return `<div class="map-marker" style="background:${day.color}"><span>${category(place.category).icon}</span></div>`;
  }

  function popupHtml(place) {
    return `<img class="popup-image" src="web-assets/${escapeHtml(place.image)}" alt=""${place.imagePosition ? ` style="object-position:${escapeHtml(place.imagePosition)}"` : ""}><h3 class="popup-title">${escapeHtml(place.name)}</h3><div class="popup-sub">${escapeHtml(place.zh)}</div><p class="popup-text">${escapeHtml(place.description)}</p><a class="inline-link" href="${mapUrl(place)}" target="_blank" rel="noopener">Google Maps ↗</a>`;
  }

  function initMap() {
    if (map || !window.L) return;
    map = L.map("map", { zoomControl: true }).setView([50.0865, 14.4206], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  function renderMap() {
    initMap();
    if (!map) return;
    markerLayer.clearLayers();
    markers.clear();
    const places = filteredPlaces();
    const bounds = [];
    places.forEach(place => {
      const marker = L.marker([place.lat, place.lng], { icon: L.divIcon({ className: "", html: markerHtml(place), iconSize: [31, 31], iconAnchor: [15, 31], popupAnchor: [0, -28] }) });
      marker.bindPopup(popupHtml(place));
      marker.addTo(markerLayer);
      markers.set(place.id, marker);
      bounds.push([place.lat, place.lng]);
    });
    $("#map-results").innerHTML = places.map(place => `<button class="map-result" data-map-place="${place.id}"><img src="web-assets/${escapeHtml(place.image)}" alt=""${place.imagePosition ? ` style="object-position:${escapeHtml(place.imagePosition)}"` : ""}><span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.zh)} · ${escapeHtml(place.area)}${place.approximate ? " · 約" : ""}</small></span></button>`).join("") || `<div class="empty-state">沒有符合條件的地點</div>`;
    if (bounds.length === 1) map.setView(bounds[0], 16);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    setTimeout(() => map.invalidateSize(), 40);
  }

  function renderSouvenirs() {
    const list = data.souvenirs;
    $("#souvenir-shortlist").innerHTML = ["最穩陣：Manufaktura", "最天然：Botanicus", "最獨特：LOCAL ARTISTS", "最有設計感：Deelive", "男性實用：Baťa／PRAVA KUZE", "大量派：dm"].map(item => `<span class="shortlist-pill">${item}</span>`).join("");
    $("#souvenir-grid").innerHTML = list.map(item => `
      <article class="souvenir-card" id="souvenir-${item.id}">
        <img src="web-assets/${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
        <div class="souvenir-content">
          <p class="souvenir-type">${escapeHtml(item.type)}</p>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="souvenir-intro">${escapeHtml(item.intro)}</p>
          <p class="signature-title">SIGNATURE 推介</p>
          <ul class="signature-list">${item.signature.map(product => `<li>${escapeHtml(product)}</li>`).join("")}</ul>
          <p class="souvenir-for"><strong>適合：</strong>${escapeHtml(item.forWhom)}</p>
          <p class="souvenir-tip">${escapeHtml(item.tip)}</p>
          ${item.official ? `<p><a class="inline-link" href="${item.official}" target="_blank" rel="noopener">官方網站 ↗</a></p>` : ""}
        </div>
      </article>`).join("");
  }

  function renderFilterState() {
    $$(".filter-chip").forEach(button => button.classList.toggle("is-active", button.dataset.day === String(state.day)));
    $("#category-filter").value = state.category;
    $("#search-input").value = state.search;
    renderPlaces();
    if (state.view === "map") renderMap();
  }

  function switchView(view, updateHash = true) {
    state.view = view;
    $$('[data-view-panel]').forEach(panel => {
      const active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    $$(".nav-link").forEach(button => button.classList.toggle("is-active", button.dataset.view === view));
    $("#toolbar").hidden = !["map", "places"].includes(view);
    $("#main-nav").classList.remove("is-open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    if (view === "map") renderMap();
    if (view === "places") renderPlaces();
    if (updateHash) history.replaceState(null, "", `#${view}`);
    window.scrollTo({ top: $(".hero").offsetHeight + $(".site-header").offsetHeight, behavior: "smooth" });
  }

  function bindEvents() {
    $("#main-nav").addEventListener("click", event => {
      const button = event.target.closest("[data-view]");
      if (button) switchView(button.dataset.view);
    });
    $("#menu-toggle").addEventListener("click", () => {
      const nav = $("#main-nav");
      nav.classList.toggle("is-open");
      $("#menu-toggle").setAttribute("aria-expanded", String(nav.classList.contains("is-open")));
    });
    $("#day-filters").addEventListener("click", event => {
      const button = event.target.closest("[data-day]");
      if (!button) return;
      state.day = button.dataset.day;
      renderFilterState();
    });
    $("#category-filter").addEventListener("change", event => { state.category = event.target.value; renderFilterState(); });
    $("#search-input").addEventListener("input", event => { state.search = event.target.value; renderFilterState(); });
    $("#clear-filters").addEventListener("click", () => { state.day = "all"; state.category = "all"; state.search = ""; renderFilterState(); });
    $("#itinerary-tabs").addEventListener("click", event => {
      const button = event.target.closest("[data-itinerary-day]");
      if (!button) return;
      state.itineraryDay = Number(button.dataset.itineraryDay);
      $$(".day-tab").forEach(tab => tab.classList.toggle("is-active", tab === button));
      renderItinerary();
    });
    $("#map-results").addEventListener("click", event => {
      const button = event.target.closest("[data-map-place]");
      const marker = button && markers.get(button.dataset.mapPlace);
      if (marker) { map.setView(marker.getLatLng(), 16); marker.openPopup(); }
    });
    window.addEventListener("hashchange", () => {
      const target = location.hash.slice(1);
      if (["itinerary", "map", "places", "souvenirs"].includes(target)) switchView(target, false);
    });
  }

  function init() {
    $("#place-count").textContent = data.places.length;
    createFilters();
    createItineraryTabs();
    renderItinerary();
    renderPlaces();
    renderSouvenirs();
    bindEvents();
    const initial = location.hash.slice(1);
    switchView(["itinerary", "map", "places", "souvenirs"].includes(initial) ? initial : "itinerary", false);
  }

  init();
})();
