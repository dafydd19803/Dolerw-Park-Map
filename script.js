import { containsPoint } from './modules/geo.js';
import {
  convertCoordinatesToWhat3Words,
  fetchGridSection,
  getWhat3WordsMapUrl
} from './modules/what3words.js';

const GEOJSON_URL = './open-newtown.geojson';
const WHAT3WORDS_MIN_ZOOM = 18;

const elements = {
  mapStatus: document.querySelector('#map-status'),
  gridStatus: document.querySelector('#grid-status'),
  selectionStatus: document.querySelector('#selection-status'),
  latitude: document.querySelector('#latitude'),
  longitude: document.querySelector('#longitude'),
  w3wAddress: document.querySelector('#w3w-address'),
  w3wLoading: document.querySelector('#w3w-loading'),
  findOnW3w: document.querySelector('#find-on-w3w'),
  copyCoordinates: document.querySelector('#copy-coordinates'),
  copyW3w: document.querySelector('#copy-w3w'),
  clearSelection: document.querySelector('#clear-selection'),
  resetView: document.querySelector('#reset-view'),
  layerSelect: document.querySelector('#layer-select'),
  toast: document.querySelector('#toast')
};

const map = L.map('map', {
  zoomControl: true,
  attributionControl: true
}).setView([52.514, -3.324], 14);

const openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
});

const esriWorldImagery = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution: 'Tiles &copy; <a href="https://www.esri.com/en-us/legal/terms/full-master-agreement">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  }
);

openStreetMap.addTo(map);
L.control.layers({
  'OpenStreetMap': openStreetMap,
  'Satellite imagery (Esri)': esriWorldImagery
}, null, { position: 'topright', collapsed: false }).addTo(map);

const selectedLocationIcon = L.divIcon({
  className: '',
  html: '<span class="on-selected-marker" aria-hidden="true"><span class="on-selected-marker__dot"></span></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

let dolerwFeature = null;
let dolerwLayer = null;
let parkBounds = null;
let optionalLayers = {};
let selectedMarker = null;
let selectedSquareLayer = null;
let selectedPoint = null;
let selectedWhat3Words = null;
let resetBounds = null;
let toastTimer = null;
let gridRefreshTimer = null;
let gridRequestId = 0;
let gridRequestController = null;
let lookupRequestId = 0;
let lookupRequestController = null;
let gridLayer = null;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}

async function copyText(
  text,
  label,
  successMessage = `${label} copied`,
  failureMessage = `Unable to copy ${label.toLowerCase()}`
) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch (error) {
    showToast(failureMessage);
  }
}

function isValidFeature(feature) {
  const geometry = feature && feature.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) return false;
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return false;
  if (geometry.type === 'Polygon') return geometry.coordinates.length > 0;
  return geometry.coordinates.length > 0;
}

function featureName(feature) {
  return String(feature?.properties?.name || '').trim();
}

function styleFeature(name) {
  if (name.toLowerCase() === 'dolerw') {
    return { color: '#1467a9', weight: 4, fillColor: '#1467a9', fillOpacity: 0.16 };
  }
  return { color: '#6b7280', weight: 2, fillColor: '#9ca3af', fillOpacity: 0.08 };
}

function addOptionalLayers(features) {
  optionalLayers = {};

  features.forEach((feature) => {
    const name = featureName(feature);
    if (!name || name.toLowerCase() === 'dolerw') return;
    if (!isValidFeature(feature)) return;

    const layer = L.geoJSON(feature, {
      interactive: false,
      style: styleFeature(name)
    });
    optionalLayers[name] = layer;

    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    elements.layerSelect.appendChild(option);
  });
}

function setSelectedPoint(latlng) {
  selectedPoint = latlng;

  if (selectedMarker) {
    selectedMarker.setLatLng(latlng);
  } else {
    selectedMarker = L.marker(latlng, {
      icon: selectedLocationIcon,
      title: 'Selected location',
      alt: 'Selected location marker',
      keyboard: true,
      riseOnHover: true
    }).addTo(map);
  }

  elements.latitude.textContent = latlng.lat.toFixed(6);
  elements.longitude.textContent = latlng.lng.toFixed(6);
  elements.selectionStatus.className = 'on-selection-status is-selected';
  elements.selectionStatus.querySelector('span:last-child').textContent = 'Location selected';
  elements.copyCoordinates.disabled = false;
  elements.clearSelection.disabled = false;
  elements.findOnW3w.disabled = false;
}

function clearSelectedSquare() {
  if (selectedSquareLayer) map.removeLayer(selectedSquareLayer);
  selectedSquareLayer = null;
}

function selectPoint(latlng) {
  if (lookupRequestController) lookupRequestController.abort();
  lookupRequestId += 1;
  selectedWhat3Words = null;
  clearSelectedSquare();
  setSelectedPoint(latlng);
  elements.w3wLoading.hidden = true;
  elements.copyW3w.disabled = true;
  elements.w3wAddress.textContent = map.getZoom() >= WHAT3WORDS_MIN_ZOOM
    ? 'Click a what3words square to retrieve its address.'
    : 'Zoom to level 18 or closer to select a what3words square.';
}

async function selectWhat3WordsSquare(latlng) {
  if (!dolerwFeature ||
      !containsPoint(dolerwFeature, latlng.lat, latlng.lng)) {
    showToast('Please select a square inside the Dolerw boundary');
    return;
  }

  if (lookupRequestController) lookupRequestController.abort();
  lookupRequestController = new AbortController();
  const requestId = ++lookupRequestId;
  selectedWhat3Words = null;
  clearSelectedSquare();
  setSelectedPoint(latlng);
  elements.w3wAddress.textContent = '';
  elements.w3wLoading.hidden = false;
  elements.copyW3w.disabled = true;

  try {
    const result = await convertCoordinatesToWhat3Words(
      latlng.lat,
      latlng.lng,
      lookupRequestController.signal
    );
    if (requestId !== lookupRequestId) return;

    selectedWhat3Words = `///${result.words}`;
    elements.w3wAddress.textContent = selectedWhat3Words;
    selectedSquareLayer = L.rectangle([
      [result.square.southwest.lat, result.square.southwest.lng],
      [result.square.northeast.lat, result.square.northeast.lng]
    ], {
      color: '#bd2430',
      weight: 3,
      fillColor: '#e83f4b',
      fillOpacity: 0.3,
      interactive: false
    }).addTo(map);
    elements.copyW3w.disabled = false;
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== lookupRequestId) return;
    elements.w3wAddress.textContent = `Lookup failed: ${error.message}`;
  } finally {
    if (requestId === lookupRequestId) {
      elements.w3wLoading.hidden = true;
    }
  }
}

function clearSelection() {
  if (lookupRequestController) lookupRequestController.abort();
  lookupRequestId += 1;
  if (selectedMarker) map.removeLayer(selectedMarker);
  selectedMarker = null;
  selectedPoint = null;
  selectedWhat3Words = null;
  clearSelectedSquare();

  elements.latitude.textContent = '--';
  elements.longitude.textContent = '--';
  elements.w3wAddress.textContent = 'Zoom to level 18 and click a square to select it.';
  elements.w3wLoading.hidden = true;
  elements.selectionStatus.className = 'on-selection-status';
  elements.selectionStatus.querySelector('span:last-child').textContent = 'No location selected';
  elements.copyCoordinates.disabled = true;
  elements.copyW3w.disabled = true;
  elements.findOnW3w.disabled = true;
  elements.clearSelection.disabled = true;
}

function setGridStatus(message, isError = false) {
  elements.gridStatus.textContent = message;
  elements.gridStatus.hidden = false;
  elements.gridStatus.setAttribute('role', isError ? 'alert' : 'status');
}

function removeGridLayer() {
  if (gridLayer) map.removeLayer(gridLayer);
  gridLayer = null;
}

function scheduleGridRefresh() {
  window.clearTimeout(gridRefreshTimer);
  gridRefreshTimer = window.setTimeout(updateGridSection, 180);
}

async function updateGridSection() {
  if (!dolerwLayer || !parkBounds) return;
  if (gridRequestController) gridRequestController.abort();
  const requestId = ++gridRequestId;

  if (map.getZoom() < WHAT3WORDS_MIN_ZOOM) {
    removeGridLayer();
    setGridStatus('Zoom to level 18 or closer to display the what3words grid.');
    return;
  }

  const visibleBounds = map.getBounds();
  const south = Math.max(visibleBounds.getSouth(), parkBounds.getSouth());
  const west = Math.max(visibleBounds.getWest(), parkBounds.getWest());
  const north = Math.min(visibleBounds.getNorth(), parkBounds.getNorth());
  const east = Math.min(visibleBounds.getEast(), parkBounds.getEast());
  if (south >= north || west >= east) {
    removeGridLayer();
    setGridStatus('The visible map area does not overlap Dolerw Park.');
    return;
  }

  const bounds = L.latLngBounds([south, west], [north, east]);
  gridRequestController = new AbortController();
  removeGridLayer();
  setGridStatus('Loading what3words grid for the visible park area...');

  try {
    const data = await fetchGridSection(bounds, gridRequestController.signal);
    if (requestId !== gridRequestId) return;

    gridLayer = L.geoJSON(data, {
      style: {
        color: '#245b7a',
        weight: 0.7,
        opacity: 0.8,
        fillColor: '#75b9df',
        fillOpacity: 0.025
      },
      bubblingMouseEvents: false,
      onEachFeature(feature, layer) {
        layer.on('click', (event) => {
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
          selectWhat3WordsSquare(event.latlng);
        });
      }
    }).addTo(map);
    setGridStatus('what3words grid loaded. Click a square inside the park to select it.');
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== gridRequestId) return;
    setGridStatus(`Unable to load what3words grid: ${error.message}`, true);
  }
}

async function loadGeoJson() {
  try {
    const response = await fetch(GEOJSON_URL);
    if (!response.ok) throw new Error(`GeoJSON request failed (${response.status})`);
    const collection = await response.json();
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new Error('The supplied file is not a valid GeoJSON FeatureCollection');
    }

    const validFeatures = collection.features.filter(isValidFeature);
    const emptyCount = collection.features.length - validFeatures.length;
    const namedFeatures = validFeatures.filter((feature) => featureName(feature));
    const dolerwMatches = namedFeatures.filter(
      (feature) => featureName(feature).toLowerCase() === 'dolerw'
    );

    if (dolerwMatches.length === 0) {
      throw new Error('No valid feature named "Dolerw" was found');
    }
    if (dolerwMatches.length > 1) {
      throw new Error('Multiple features named "Dolerw" were found; selection requires clarification');
    }

    dolerwFeature = dolerwMatches[0];
    dolerwLayer = L.geoJSON(dolerwFeature, {
      style: styleFeature('Dolerw')
    }).addTo(map);
    resetBounds = dolerwLayer.getBounds();
    parkBounds = resetBounds;
    map.fitBounds(resetBounds, { padding: [20, 20] });

    addOptionalLayers(namedFeatures);

    const ambiguities = namedFeatures.filter(
      (feature) => /park|grounds/i.test(featureName(feature))
    ).filter((feature) => featureName(feature).toLowerCase() !== 'dolerw');
    let status = `Displaying Dolerw boundary. ${namedFeatures.length} named feature(s) available.`;
    if (emptyCount > 0) status += ` ${emptyCount} empty or invalid feature(s) ignored.`;
    if (ambiguities.length > 0) {
      status += ` Boundary ambiguity: "Park Grounds" is a separate named polygon and Dolerw is used as the exact boundary.`;
    }
    elements.mapStatus.textContent = status;
    scheduleGridRefresh();

  } catch (error) {
    elements.mapStatus.textContent = `Data error: ${error.message}`;
    elements.mapStatus.setAttribute('role', 'alert');
  }
}

map.on('moveend zoomend', scheduleGridRefresh);

map.on('click', (event) => {
  if (!dolerwFeature) {
    showToast('Park boundary is not available');
    return;
  }

  if (containsPoint(dolerwFeature, event.latlng.lat, event.latlng.lng)) {
    selectPoint(event.latlng);
  } else {
    showToast('Please select a location inside the Dolerw boundary');
  }
});

elements.copyCoordinates.addEventListener('click', () => {
  if (!selectedPoint) return;
  copyText(
    `${selectedPoint.lat.toFixed(6)}, ${selectedPoint.lng.toFixed(6)}`,
    'Coordinates'
  );
});

elements.copyW3w.addEventListener('click', () => {
  if (selectedWhat3Words) copyText(selectedWhat3Words, 'what3words address');
});

elements.findOnW3w.addEventListener('click', () => {
  if (!selectedPoint) return;
  window.open(getWhat3WordsMapUrl(), '_blank', 'noopener,noreferrer');
  copyText(
    `${selectedPoint.lat.toFixed(6)}, ${selectedPoint.lng.toFixed(6)}`,
    'Coordinates',
    'Coordinates copied. Paste them into the what3words search box to find the three word address.',
    'Could not copy coordinates. Copy them from the location panel and paste them into the what3words search box.'
  );
});

elements.clearSelection.addEventListener('click', clearSelection);

elements.resetView.addEventListener('click', () => {
  if (resetBounds) map.fitBounds(resetBounds, { padding: [20, 20] });
  else map.setView([52.514, -3.324], 14);
});

elements.layerSelect.addEventListener('change', () => {
  if (dolerwLayer) dolerwLayer.removeFrom(map);
  Object.values(optionalLayers).forEach((layer) => layer.removeFrom(map));

  if (elements.layerSelect.value === 'dolerw') {
    if (dolerwLayer) dolerwLayer.addTo(map);
  } else if (optionalLayers[elements.layerSelect.value]) {
    optionalLayers[elements.layerSelect.value].addTo(map);
  }
});

loadGeoJson();
