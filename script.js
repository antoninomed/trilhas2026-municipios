
const CONFIG = {

  GOOGLE_SHEETS_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSmt2xY2g29WLrKdh1CUbTUA2dL_D_AD_5O2N42mFQSMM5wrhqs5m6Z7FYNJs0NjrLwD2I1imA_ke2K/pub?gid=0&single=true&output=csv",
  GOOGLE_SHEET_GID: "0",

  CITY_COLUMN_NAME: "Município",

  DATE_COLUMN_NAME: "Data",

  COUNT_COLUMN_NAME: "",

  MUNICIPALITIES_GEOJSON_URL: "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-21-mun.json",

  PAGE_SIZE: 10,
  CHART_WINDOW_DAYS: 7,
  PROJECTION_WINDOW_DAYS: 7,
  REGISTRATION_GOAL: 4000,
  MUNICIPALITY_GOAL: 217,
  REGISTRATION_DEADLINE: "2026-07-27",
};


const FALLBACK_CITY_COORDS = {
  "sao luis": { name: "São Luís", lat: -2.5307, lng: -44.3068 },
  "pinheiro": { name: "Pinheiro", lat: -2.5222, lng: -45.0788 },
  "imperatriz": { name: "Imperatriz", lat: -5.5264, lng: -47.4919 },
  "codo": { name: "Codó", lat: -4.4556, lng: -43.8856 },
  "caxias": { name: "Caxias", lat: -4.8589, lng: -43.3561 },
  "santa ines": { name: "Santa Inês", lat: -3.6667, lng: -45.3800 },
  "chapadinha": { name: "Chapadinha", lat: -3.7417, lng: -43.3603 },
  "barra do corda": { name: "Barra do Corda", lat: -5.5056, lng: -45.2433 },
  "balsas": { name: "Balsas", lat: -7.5325, lng: -46.0356 },
  "tutoia": { name: "Tutóia", lat: -2.7619, lng: -42.2744 },
  "ze doca": { name: "Zé Doca", lat: -3.2700, lng: -45.6550 },
};

const ALIASES = {
  "sao luiz": "sao luis",
  "s luiz": "sao luis",
  "s luis": "sao luis",
  "slz": "sao luis",
  "tutoia": "tutoia",
  "presidente dutra ma": "presidente dutra",
  "santa ines ma": "santa ines",
};

const state = {
  map: null,
  markersLayer: null,
  boundaryLayer: null,
  cityIndex: new Map(),
  registeredCities: [],
  missingCities: [],
  allCities: [],
  filteredCities: [],
  viewMode: "registered",
  totalRegistrations: 0,
  markers: new Map(),
  activeCityKey: null,
  sortDirection: "desc",
  page: 1,
  search: "",
  dailyRegistrations: [],
  chartStartIndex: 0,
};

const els = {
  status: document.getElementById("dashboard-status"),
  tableBody: document.getElementById("city-table-body"),
  search: document.getElementById("city-search"),
  sortButton: document.getElementById("sort-button"),
  sortIcon: document.getElementById("sort-icon"),
  paginationInfo: document.getElementById("pagination-info"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  pageNumbers: document.getElementById("page-numbers"),
  exportToggle: document.getElementById("export-toggle"),
  exportOptions: document.getElementById("export-options"),
  showRegistered: document.getElementById("show-registered"),
  showMissing: document.getElementById("show-missing"),
  registeredCount: document.getElementById("registered-count"),
  missingCount: document.getElementById("missing-count"),
  totalRegistrations: document.getElementById("total-registrations"),
  trendChart: document.getElementById("trend-chart"),
  trendRange: document.getElementById("trend-range"),
  trendTotal: document.getElementById("trend-total"),
  trendPrev: document.getElementById("trend-prev"),
  trendNext: document.getElementById("trend-next"),
  projectionStatus: document.getElementById("projection-status"),
  projectedRegistrations: document.getElementById("projected-registrations"),
  projectionRegistrationGap: document.getElementById("projection-registration-gap"),
  projectedMunicipalities: document.getElementById("projected-municipalities"),
  municipalityProgress: document.getElementById("municipality-progress"),
  municipalityProgressFill: document.getElementById("municipality-progress-fill"),
  municipalityProgressCount: document.getElementById("municipality-progress-count"),
  projectionBasis: document.getElementById("projection-basis"),
};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  setupMap();
  setupEvents();

  try {
    const geojson = await loadMunicipalitiesGeoJson();
    buildCityIndex(geojson);
    drawBoundary(geojson);

    const rows = await loadRowsFromGoogleSheets();
    state.totalRegistrations = rows.length;
    state.dailyRegistrations = aggregateRowsByDate(rows);
    state.chartStartIndex = Math.max(0, state.dailyRegistrations.length - CONFIG.CHART_WINDOW_DAYS);

    const { cities, unmatched } = aggregateRowsByCity(rows);

    state.registeredCities = cities;
    state.missingCities = getMissingMunicipalities(cities);
    updateViewData();

    renderMarkers();
    applyFiltersAndRender();
    updateModeButtons();
    renderGoalProjection(rows);
    renderRegistrationChart();
    fitMapToMarkers();
    forceMapResize();

    /*if (unmatched.length > 0) {
      const preview = unmatched.slice(0, 5).join(", ");
      setStatus(`${unmatched.length} munícipio(s) não localizada(s) após normalização: ${preview}${unmatched.length > 5 ? "..." : ""}`);
      console.warn("Cidades não localizadas:", unmatched);
    }*/
  } catch (error) {
    console.error(error);
    setStatus("Não foi possível carregar os dados. Confira o link da planilha e a publicação como CSV.");
    els.tableBody.innerHTML = `<tr><td colspan="3" class="empty-state">Erro ao carregar os dados.</td></tr>`;
    renderRegistrationChart();
  }
}


function setViewMode(mode) {
  if (!["registered", "missing"].includes(mode)) return;
  if (state.viewMode === mode) return;

  state.viewMode = mode;
  state.page = 1;
  state.activeCityKey = null;

  updateViewData();
  renderMarkers();
  applyFiltersAndRender();
  updateModeButtons();
  fitMapToMarkers();
  forceMapResize();
}

function updateViewData() {
  state.allCities = state.viewMode === "missing"
    ? state.missingCities
    : state.registeredCities;

  state.filteredCities = state.allCities;
}

function updateModeButtons() {
  const isMissingMode = state.viewMode === "missing";

  els.showRegistered.classList.toggle("active", !isMissingMode);
  els.showMissing.classList.toggle("active", isMissingMode);

  els.showRegistered.setAttribute("aria-pressed", String(!isMissingMode));
  els.showMissing.setAttribute("aria-pressed", String(isMissingMode));

  els.registeredCount.textContent = formatNumber(state.registeredCities.length);
  els.missingCount.textContent = formatNumber(state.missingCities.length);

  if (els.totalRegistrations) {
    els.totalRegistrations.textContent = formatNumber(state.totalRegistrations);
  }

  if (isMissingMode) {
    setStatus(`${formatNumber(state.missingCities.length)} municípios ainda não possuem inscrições no Trilhas 2026.`);
  } else {
    setStatus(`${formatNumber(state.registeredCities.length)} municípios já registraram inscrições no Trilhas 2026.`);
  }
}

function getMissingMunicipalities(registeredCities) {
  const registeredKeys = new Set(registeredCities.map((city) => city.key));

  return Array.from(state.cityIndex.entries())
    .filter(([key]) => !registeredKeys.has(key))
    .map(([key, info]) => ({
      key,
      city: info.name,
      lat: info.lat,
      lng: info.lng,
      count: 0,
      isMissing: true,
    }))
    .sort((a, b) => a.city.localeCompare(b.city, "pt-BR"));
}

function setupMap() {
  state.map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: true,
  }).setView([-4.8, -45.1], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);

  state.markersLayer = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    removeOutsideVisibleBounds: true,
    disableClusteringAtZoom: 8,
    maxClusterRadius: 55,
    iconCreateFunction(cluster) {
      const children = cluster.getAllChildMarkers();
      const totalOccurrences = children.reduce((sum, marker) => sum + (marker.options.cityData?.count || 0), 0);
      const citiesCount = children.length;
      const isMissingCluster = children.every((marker) => marker.options.cityData?.isMissing);
      const bucket = isMissingCluster ? "empty" : getBucket(totalOccurrences);
      const mainValue = isMissingCluster ? citiesCount : totalOccurrences;
      const metaLabel = isMissingCluster
        ? "sem inscrição"
        : `${citiesCount} município${citiesCount > 1 ? "s" : ""}`;

      return L.divIcon({
        html: `
          <div class="cluster-marker ${bucket}">
            <span class="cluster-total">${formatNumber(mainValue)}</span>
            <span class="cluster-meta">${metaLabel}</span>
          </div>
        `,
        className: "cluster-div-icon",
        iconSize: [64, 64],
      });
    },
  }).addTo(state.map);

  const HomeControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const container = L.DomUtil.create("a", "home-control leaflet-bar-part");
      container.href = "#";
      container.title = "Centralizar mapa";
      container.setAttribute("aria-label", "Centralizar mapa");
      container.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.2 3 11.1l1.32 1.5L6 11.13V20h5v-5h2v5h5v-8.87l1.68 1.47L21 11.1 12 3.2Z"/>
        </svg>
      `;
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(container, "click", (event) => {
        L.DomEvent.preventDefault(event);
        fitMapToMarkers();
      });
      return container;
    },
  });

  state.map.addControl(new HomeControl());

  state.map.on("zoomend", updateMapVisualDensity);

  requestAnimationFrame(() => {
    state.map.invalidateSize();
    updateMapVisualDensity();
  });

  window.addEventListener("load", () => {
    setTimeout(() => {
      state.map.invalidateSize();
      updateMapVisualDensity();
    }, 200);
  });

  window.addEventListener("resize", () => {
    setTimeout(() => {
      state.map.invalidateSize();
      updateMapVisualDensity();
    }, 150);
  });
}


function forceMapResize() {
  if (!state.map) return;

  requestAnimationFrame(() => {
    state.map.invalidateSize({ animate: false });

    setTimeout(() => {
      state.map.invalidateSize({ animate: false });
    }, 180);
  });
}

function debounce(callback, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function updateMapVisualDensity() {
  const mapElement = document.getElementById("map");
  if (!mapElement || !state.map) return;
  mapElement.classList.toggle("show-city-labels", state.map.getZoom() >= 8);
}

function setupEvents() {
  els.showRegistered.addEventListener("click", () => {
    setViewMode("registered");
  });

  els.showMissing.addEventListener("click", () => {
    setViewMode("missing");
  });

  els.search.addEventListener("input", () => {
    state.search = els.search.value;
    state.page = 1;
    applyFiltersAndRender();
  });

  els.sortButton.addEventListener("click", () => {
    state.sortDirection = state.sortDirection === "desc" ? "asc" : "desc";
    state.page = 1;
    applyFiltersAndRender();
  });

  els.prevPage.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderTable();
    }
  });

  els.nextPage.addEventListener("click", () => {
    const totalPages = getTotalPages();
    if (state.page < totalPages) {
      state.page += 1;
      renderTable();
    }
  });

  els.exportToggle.addEventListener("click", () => {
    const expanded = els.exportToggle.getAttribute("aria-expanded") === "true";
    els.exportToggle.setAttribute("aria-expanded", String(!expanded));
    els.exportOptions.hidden = expanded;
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".export-menu")) {
      els.exportToggle.setAttribute("aria-expanded", "false");
      els.exportOptions.hidden = true;
    }
  });

  els.exportOptions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-export]");
    if (!button) return;

    exportData(button.dataset.export);
    els.exportToggle.setAttribute("aria-expanded", "false");
    els.exportOptions.hidden = true;
  });

  els.trendPrev.addEventListener("click", () => {
    if (state.chartStartIndex <= 0) return;
    state.chartStartIndex -= 1;
    renderRegistrationChart();
  });

  els.trendNext.addEventListener("click", () => {
    const lastStart = Math.max(0, state.dailyRegistrations.length - CONFIG.CHART_WINDOW_DAYS);
    if (state.chartStartIndex >= lastStart) return;
    state.chartStartIndex += 1;
    renderRegistrationChart();
  });

  window.addEventListener("resize", debounce(() => {
    if (state.dailyRegistrations.length > 0) renderRegistrationChart();
  }, 140));
}

async function loadMunicipalitiesGeoJson() {
  try {
    const response = await fetch(CONFIG.MUNICIPALITIES_GEOJSON_URL);
    if (!response.ok) throw new Error("Falha ao carregar GeoJSON dos municípios.");
    return response.json();
  } catch (error) {
    console.warn("Usando coordenadas fallback. Motivo:", error);
    return null;
  }
}

function buildCityIndex(geojson) {
  state.cityIndex.clear();

  if (geojson?.features?.length) {
    geojson.features.forEach((feature) => {
      const name = getCityNameFromFeature(feature);
      if (!name) return;

      const center = getFeatureCenter(feature);
      if (!center) return;

      const key = normalizeCityName(name);
      state.cityIndex.set(key, { name, lat: center.lat, lng: center.lng, feature });
    });
  }

  Object.entries(FALLBACK_CITY_COORDS).forEach(([key, value]) => {
    if (!state.cityIndex.has(key)) {
      state.cityIndex.set(key, value);
    }
  });
}

function drawBoundary(geojson) {
  if (!geojson?.features?.length) return;

  state.boundaryLayer = L.geoJSON(geojson, {
    interactive: false,
    style: {
      color: "#64748b",
      weight: 0.7,
      opacity: 0.25,
      fillColor: "#ffffff",
      fillOpacity: 0,
    },
  }).addTo(state.map);
}

function getCityNameFromFeature(feature) {
  const properties = feature?.properties || {};
  return properties.name
    || properties.NM_MUN
    || properties.NM_MUNICIP
    || properties.municipio
    || properties.MUNICIPIO
    || properties.nome
    || properties.NOME
    || "";
}

function getFeatureCenter(feature) {
  try {
    const layer = L.geoJSON(feature);
    const center = layer.getBounds().getCenter();
    if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return null;
    return center;
  } catch {
    return null;
  }
}

async function loadRowsFromGoogleSheets() {
  if (!CONFIG.GOOGLE_SHEETS_URL.trim()) {
    setStatus("Usando dados de demonstração. Cole o link da sua planilha em CONFIG.GOOGLE_SHEETS_URL no arquivo script.js.");
    return SAMPLE_ROWS;
  }

  const csvUrl = normalizeGoogleSheetsUrl(CONFIG.GOOGLE_SHEETS_URL, CONFIG.GOOGLE_SHEET_GID);
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Falha ao carregar CSV: ${response.status}`);
  }

  const text = await response.text();
  return csvToObjects(text);
}

function normalizeGoogleSheetsUrl(url, gid = "0") {
  const trimmed = url.trim();

  if (/output=csv|tqx=out:csv|format=csv/i.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid)}`;
  }

  return trimmed;
}

function csvToObjects(csvText) {
  const rows = parseCSV(csvText).filter((row) => row.some((cell) => String(cell).trim() !== ""));
  if (rows.length <= 1) return [];

  const headers = rows[0].map((header) => String(header).trim());

  return rows.slice(1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] ?? "";
    });
    return item;
  });
}

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);
  return rows;
}

function aggregateRowsByCity(rows) {
  const cityHeader = findHeader(rows, CONFIG.CITY_COLUMN_NAME);
  const countHeader = CONFIG.COUNT_COLUMN_NAME ? findHeader(rows, CONFIG.COUNT_COLUMN_NAME) : null;
  const totals = new Map();
  const unmatched = new Set();

  rows.forEach((row) => {
    const rawCity = cityHeader ? row[cityHeader] : Object.values(row)[0];
    const normalizedCity = normalizeCityName(rawCity);
    if (!normalizedCity) return;

    const canonicalKey = ALIASES[normalizedCity] || normalizedCity;
    const cityInfo = state.cityIndex.get(canonicalKey);

    if (!cityInfo) {
      unmatched.add(String(rawCity).trim());
      return;
    }

    const increment = countHeader ? parseCount(row[countHeader]) : 1;
    const existing = totals.get(canonicalKey) || {
      key: canonicalKey,
      city: cityInfo.name,
      lat: cityInfo.lat,
      lng: cityInfo.lng,
      count: 0,
    };

    existing.count += increment;
    totals.set(canonicalKey, existing);
  });

  const cities = Array.from(totals.values())
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "pt-BR"));

  return { cities, unmatched: Array.from(unmatched) };
}

function aggregateRowsByDate(rows) {
  const dateHeader = findHeader(rows, CONFIG.DATE_COLUMN_NAME);
  if (!dateHeader) return [];

  const totals = new Map();
  let firstDate = null;
  let lastDate = null;

  rows.forEach((row) => {
    const date = parseRegistrationDate(row[dateHeader]);
    if (!date) return;

    const key = toDateKey(date);
    totals.set(key, (totals.get(key) || 0) + 1);

    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;
  });

  if (!firstDate || !lastDate) return [];

  const minimumStart = addDays(lastDate, -(CONFIG.CHART_WINDOW_DAYS - 1));
  const rangeStart = firstDate > minimumStart ? minimumStart : firstDate;
  const series = [];

  for (let cursor = new Date(rangeStart); cursor <= lastDate; cursor = addDays(cursor, 1)) {
    const date = new Date(cursor);
    series.push({
      key: toDateKey(date),
      date,
      count: totals.get(toDateKey(date)) || 0,
    });
  }

  return series;
}

function renderGoalProjection(rows) {
  if (!els.projectedRegistrations) return;

  const dateHeader = findHeader(rows, CONFIG.DATE_COLUMN_NAME);
  const cityHeader = findHeader(rows, CONFIG.CITY_COLUMN_NAME);
  const deadline = parseRegistrationDate(CONFIG.REGISTRATION_DEADLINE);

  const datedRows = rows
    .map((row) => ({
      date: dateHeader ? parseRegistrationDate(row[dateHeader]) : null,
      city: cityHeader ? row[cityHeader] : Object.values(row)[0],
    }))
    .filter((item) => item.date);

  if (datedRows.length === 0 || !deadline) {
    els.projectionStatus.textContent = "Sem dados";
    els.projectionStatus.className = "projection-status unavailable";
    els.projectedRegistrations.textContent = "—";
    els.projectedMunicipalities.textContent = "—";
    els.projectionRegistrationGap.textContent = "Meta: 4.000";
    els.projectionBasis.textContent = "A coluna Data precisa estar preenchida";
    updateMunicipalityProgress(state.registeredCities.length);
    return;
  }

  const asOfDate = datedRows.reduce(
    (latest, item) => item.date > latest ? item.date : latest,
    datedRows[0].date,
  );
  const recentStart = addDays(asOfDate, -(CONFIG.PROJECTION_WINDOW_DAYS - 1));
  const recentRegistrations = datedRows.filter(
    (item) => item.date >= recentStart && item.date <= asOfDate,
  ).length;
  const registrationsPerDay = recentRegistrations / CONFIG.PROJECTION_WINDOW_DAYS;
  const remainingDays = Math.max(0, differenceInCalendarDays(deadline, asOfDate));
  const projectedRegistrations = Math.round(
    state.totalRegistrations + (registrationsPerDay * remainingDays),
  );

  const firstRegistrationByCity = new Map();
  datedRows.forEach((item) => {
    const cityKey = normalizeCityName(item.city);
    if (!cityKey || !state.cityIndex.has(cityKey)) return;

    const currentFirstDate = firstRegistrationByCity.get(cityKey);
    if (!currentFirstDate || item.date < currentFirstDate) {
      firstRegistrationByCity.set(cityKey, item.date);
    }
  });

  const newCitiesInWindow = Array.from(firstRegistrationByCity.values())
    .filter((date) => date >= recentStart && date <= asOfDate)
    .length;
  const newCitiesPerDay = newCitiesInWindow / CONFIG.PROJECTION_WINDOW_DAYS;
  const projectedMunicipalities = Math.min(
    CONFIG.MUNICIPALITY_GOAL,
    Math.round(state.registeredCities.length + (newCitiesPerDay * remainingDays)),
  );

  const registrationGap = projectedRegistrations - CONFIG.REGISTRATION_GOAL;
  const reachesGoal = registrationGap >= 0;

  els.projectedRegistrations.textContent = formatNumber(projectedRegistrations);
  els.projectedMunicipalities.textContent = formatNumber(projectedMunicipalities);
  els.projectionRegistrationGap.textContent = reachesGoal
    ? `+${formatNumber(registrationGap)} acima da meta`
    : `Faltariam ${formatNumber(Math.abs(registrationGap))}`;
  els.projectionStatus.textContent = reachesGoal ? "Meta projetada" : "Abaixo da meta";
  els.projectionStatus.className = `projection-status ${reachesGoal ? "on-track" : "at-risk"}`;
  els.projectionBasis.textContent = `${formatNumber(recentRegistrations)} inscrições e ${formatNumber(newCitiesInWindow)} novo(s) município(s) nos últimos 7 dias`;

  updateMunicipalityProgress(state.registeredCities.length);
}

function updateMunicipalityProgress(currentMunicipalities) {
  const safeCurrent = Math.min(Math.max(0, currentMunicipalities), CONFIG.MUNICIPALITY_GOAL);
  const percentage = (safeCurrent / CONFIG.MUNICIPALITY_GOAL) * 100;

  els.municipalityProgressCount.textContent = `${formatNumber(safeCurrent)} de ${formatNumber(CONFIG.MUNICIPALITY_GOAL)} · ${formatPercentage(percentage)}`;
  els.municipalityProgressFill.style.width = `${Math.min(100, percentage)}%`;
  els.municipalityProgress.setAttribute("aria-valuenow", String(safeCurrent));
  els.municipalityProgress.setAttribute("aria-valuetext", `${formatPercentage(percentage)} dos municípios alcançados`);
}

function differenceInCalendarDays(endDate, startDate) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const endUtc = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const startUtc = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  return Math.round((endUtc - startUtc) / millisecondsPerDay);
}

function formatPercentage(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value) + "%";
}

function parseRegistrationDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const ptBrMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ptBrMatch) {
    return createValidatedDate(Number(ptBrMatch[3]), Number(ptBrMatch[2]), Number(ptBrMatch[1]));
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return createValidatedDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  return null;
}

function createValidatedDate(year, month, day) {
  const date = new Date(year, month - 1, day, 12);
  const isValid = date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
  return isValid ? date : null;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderRegistrationChart() {
  if (!els.trendChart) return;

  const series = state.dailyRegistrations;
  const lastStart = Math.max(0, series.length - CONFIG.CHART_WINDOW_DAYS);
  state.chartStartIndex = Math.min(Math.max(0, state.chartStartIndex), lastStart);

  els.trendPrev.disabled = series.length === 0 || state.chartStartIndex === 0;
  els.trendNext.disabled = series.length === 0 || state.chartStartIndex >= lastStart;

  if (series.length === 0) {
    els.trendRange.textContent = "Nenhuma data de inscrição disponível";
    els.trendTotal.textContent = "0";
    els.trendChart.setAttribute("aria-label", "Sem dados de inscrições por dia");
    els.trendChart.innerHTML = `<div class="trend-empty">A coluna “Data” ainda não possui datas válidas.</div>`;
    return;
  }

  const visibleData = series.slice(
    state.chartStartIndex,
    state.chartStartIndex + CONFIG.CHART_WINDOW_DAYS,
  );
  const periodTotal = visibleData.reduce((sum, item) => sum + item.count, 0);
  const firstVisible = visibleData[0].date;
  const lastVisible = visibleData[visibleData.length - 1].date;

  els.trendRange.textContent = `${formatFullDate(firstVisible)} — ${formatFullDate(lastVisible)}`;
  els.trendTotal.textContent = formatNumber(periodTotal);
  els.trendChart.setAttribute(
    "aria-label",
    `Inscrições por dia, de ${formatFullDate(firstVisible)} a ${formatFullDate(lastVisible)}. ${formatNumber(periodTotal)} inscrições no período.`,
  );

  const width = Math.max(320, Math.round(els.trendChart.clientWidth || 680));
  const height = 258;
  const margin = { top: 42, right: 18, bottom: 58, left: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const baselineY = margin.top + plotHeight;
  const maximum = Math.max(1, ...visibleData.map((item) => item.count));
  const stepX = visibleData.length > 1 ? plotWidth / (visibleData.length - 1) : 0;

  const points = visibleData.map((item, index) => {
    const x = margin.left + (stepX * index);
    const y = baselineY - ((item.count / maximum) * plotHeight);
    return { ...item, x, y };
  });

  const gridLines = [0, 0.5, 1].map((ratio) => {
    const y = baselineY - (ratio * plotHeight);
    const value = Math.round(maximum * ratio);
    return `
      <line class="trend-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text class="trend-axis-value" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${value}</text>
    `;
  }).join("");

  const guides = points.map((point) => `
    <line class="trend-day-guide" x1="${point.x}" y1="${margin.top}" x2="${point.x}" y2="${baselineY}"></line>
  `).join("");

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const pointElements = points.map((point) => {
    const weekday = formatWeekday(point.date);
    const shortDate = formatShortDate(point.date);
    const countLabelY = Math.max(20, point.y - 14);

    return `
      <g class="trend-point">
        <title>${formatNumber(point.count)} inscrições em ${formatFullDate(point.date)}</title>
        <text class="trend-point-value" x="${point.x}" y="${countLabelY}" text-anchor="middle">${formatNumber(point.count)}</text>
        <circle class="trend-point-halo" cx="${point.x}" cy="${point.y}" r="8"></circle>
        <circle class="trend-point-dot" cx="${point.x}" cy="${point.y}" r="4.5"></circle>
        <text class="trend-day-label" x="${point.x}" y="${baselineY + 24}" text-anchor="middle">${weekday}</text>
        <text class="trend-date-label" x="${point.x}" y="${baselineY + 43}" text-anchor="middle">${shortDate}</text>
      </g>
    `;
  }).join("");

  els.trendChart.innerHTML = `
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="presentation" aria-hidden="true">
      ${gridLines}
      ${guides}
      <polyline class="trend-line" points="${linePoints}"></polyline>
      ${pointElements}
    </svg>
  `;
}

function formatWeekday(date) {
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date).replace(/\./g, "");
}

function findHeader(rows, expectedHeader) {
  if (!rows.length) return null;

  const sample = rows[0];
  const headers = Object.keys(sample);
  const expected = normalizeLoose(expectedHeader);

  return headers.find((header) => normalizeLoose(header) === expected) || null;
}

function parseCount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const clean = String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeCityName(value) {
  let normalized = normalizeLoose(value);

  normalized = normalized
    .replace(/\b(estado do maranhao|maranhao|brasil)\b/g, " ")
    .replace(/\bma\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return ALIASES[normalized] || normalized;
}

function normalizeLoose(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBucket(count) {
  if (count <= 0) return "empty";
  if (count >= 80) return "danger";
  if (count >= 30) return "warning";
  if (count >= 10) return "notice";
  return "success";
}

function getBubbleSize(count) {
  if (count <= 0) return 34;
  const size = 30 + Math.log10(count + 1) * 18;
  return Math.max(34, Math.min(62, Math.round(size)));
}

function renderMarkers() {
  state.markersLayer.clearLayers();
  state.markers.clear();

  state.allCities.forEach((item) => {
    const bucket = getBucket(item.count);
    const size = getBubbleSize(item.count);

    const icon = L.divIcon({
      className: "city-div-icon",
      html: `
        <div class="city-marker" data-city-key="${escapeAttribute(item.key)}">
          <div class="bubble ${bucket}" style="width:${size}px;height:${size}px;font-size:${size >= 52 ? 1.03 : 0.94}rem">
            ${formatNumber(item.count)}
          </div>
          <div class="city-label">${escapeHtml(item.city)}</div>
        </div>
      `,
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });

    const tooltipText = item.count > 0
      ? `${formatNumber(item.count)} inscrições`
      : "Sem inscrições";

    const marker = L.marker([item.lat, item.lng], { icon, cityData: item })
      .bindTooltip(`<strong>${escapeHtml(item.city)}</strong><br>${tooltipText}`, {
        direction: "top",
        offset: [0, -20],
        opacity: 0.95,
      })
      .on("click", () => selectCity(item.key, true));

    state.markersLayer.addLayer(marker);
    state.markers.set(item.key, marker);
  });

  updateMapVisualDensity();
}

function applyFiltersAndRender() {
  const search = normalizeLoose(state.search);

  state.filteredCities = state.allCities
    .filter((item) => !search || normalizeLoose(item.city).includes(search))
    .sort((a, b) => {
      const byCount = state.sortDirection === "desc" ? b.count - a.count : a.count - b.count;
      return byCount || a.city.localeCompare(b.city, "pt-BR");
    });

  els.sortIcon.textContent = state.sortDirection === "desc" ? "⌄" : "⌃";

  const totalPages = getTotalPages();
  if (state.page > totalPages) state.page = totalPages;

  renderTable();
}

function renderTable() {
  const total = state.filteredCities.length;
  const totalPages = getTotalPages();
  const startIndex = (state.page - 1) * CONFIG.PAGE_SIZE;
  const pageItems = state.filteredCities.slice(startIndex, startIndex + CONFIG.PAGE_SIZE);

  if (pageItems.length === 0) {
    const emptyMessage = state.viewMode === "missing"
      ? "Nenhum município sem inscrição encontrado."
      : "Nenhum município encontrado.";
    els.tableBody.innerHTML = `<tr><td colspan="3" class="empty-state">${emptyMessage}</td></tr>`;
  } else {
    els.tableBody.innerHTML = pageItems.map((item, index) => {
      const bucket = getBucket(item.count);
      const rank = startIndex + index + 1;
      const activeClass = state.activeCityKey === item.key ? "active-row" : "";

      return `
        <tr class="${activeClass}" data-city-key="${escapeAttribute(item.key)}">
          <td class="rank-column">${rank}.</td>
          <td>
            <div class="city-cell">
              <span class="city-dot ${bucket}" aria-hidden="true"></span>
              <span>${escapeHtml(item.city)}</span>
            </div>
          </td>
          <td class="count-cell ${bucket}">${formatNumber(item.count)}</td>
        </tr>
      `;
    }).join("");
  }

  els.tableBody.querySelectorAll("tr[data-city-key]").forEach((row) => {
    row.addEventListener("click", () => selectCity(row.dataset.cityKey, true));
  });

  const endIndex = Math.min(startIndex + pageItems.length, total);
  els.paginationInfo.textContent = total > 0
    ? `Mostrando ${startIndex + 1} a ${endIndex} de ${total} municípios`
    : "Mostrando 0 municípios";

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;

  const pages = buildVisiblePages(state.page, totalPages);
  els.pageNumbers.innerHTML = pages.map((page) => {
    if (page === "...") return `<span class="page-ellipsis">...</span>`;
    return `<button type="button" class="page-number ${page === state.page ? "active" : ""}" data-page="${page}">${page}</button>`;
  }).join("");

  els.pageNumbers.querySelectorAll("button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.page = Number(button.dataset.page);
      renderTable();
    });
  });
}

function buildVisiblePages(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const result = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("...");
    result.push(page);
  });

  return result;
}

function getTotalPages() {
  return Math.max(1, Math.ceil(state.filteredCities.length / CONFIG.PAGE_SIZE));
}

function selectCity(cityKey, moveMap = false) {
  state.activeCityKey = cityKey;

  document.querySelectorAll(".city-marker").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.cityKey === cityKey);
  });

  const marker = state.markers.get(cityKey);
  if (marker) {
    const revealMarker = () => {
      marker.openTooltip();
      if (moveMap) {
        state.map.flyTo(marker.getLatLng(), Math.max(state.map.getZoom(), 8), { duration: 0.65 });
      }
    };

    if (moveMap && typeof state.markersLayer.zoomToShowLayer === "function") {
      state.markersLayer.zoomToShowLayer(marker, revealMarker);
    } else {
      revealMarker();
    }
  }

  renderTable();
}

function fitMapToMarkers() {
  if (state.markersLayer) {
    const bounds = state.markersLayer.getBounds();
    if (bounds && bounds.isValid()) {
      state.map.fitBounds(bounds.pad(0.16), { maxZoom: 8 });
      return;
    }
  }

  if (state.boundaryLayer) {
    state.map.fitBounds(state.boundaryLayer.getBounds().pad(0.06));
    return;
  }

  state.map.setView([-4.8, -45.1], 7);
}

function exportData(type) {
  const isMissingMode = state.viewMode === "missing";
  const payload = state.filteredCities.map((item, index) => ({
    posicao: index + 1,
    municipio: item.city,
    inscricoes: item.count,
    situacao: isMissingMode ? "Sem inscrições" : "Com inscrições",
  }));

  const baseFilename = isMissingMode
    ? "trilhas-2026-municipios-sem-inscricao"
    : "trilhas-2026-mapa-alcance";

  if (type === "json") {
    downloadFile(`${baseFilename}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    return;
  }

  const csv = [
    ["Posição", "Município", "Inscrições", "Situação"],
    ...payload.map((item) => [item.posicao, item.municipio, item.inscricoes, item.situacao]),
  ].map((row) => row.map(escapeCsvCell).join(",")).join("\n");

  downloadFile(`${baseFilename}.csv`, csv, "text/csv;charset=utf-8");
}

function escapeCsvCell(value) {
  const stringValue = String(value ?? "");
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setStatus(message) {
  els.status.hidden = false;
  els.status.textContent = message;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
