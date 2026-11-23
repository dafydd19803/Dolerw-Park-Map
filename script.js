import { containsPoint, getFeatureBounds } from './modules/geo.js';
import { getWhat3WordsMapUrl, lookupWhat3Words } from './modules/what3words.js';

const GEOJSON_URL = './open-newtown.geojson';
const W3W_ENDPOINT = null;

const elements = {
  mapStatus: document.querySelector('#map-status'),
  selectionStatus: document.querySelector('#selection-status'),
  latitude: document.querySelector('#latitude'),
  longitude: document.querySelector('#longitude'),
  w3wAddress: document.querySelector('#w3w-address'),
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
let optionalLayers = {};
let selectedMarker = null;
let selectedPoint = null;
let selectedWhat3Words = null;
let resetBounds = null;
let toastTimer = null;

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

function clearSelection() {
  if (selectedMarker) {
    map.removeLayer(selectedMarker);
  }
  selectedMarker = null;
  selectedPoint = null;
  selectedWhat3Words = null;

  elements.latitude.textContent = '--';
  elements.longitude.textContent = '--';
  elements.w3wAddress.textContent = 'what3words lookup not configured';
  elements.selectionStatus.className = 'on-selection-status';
  elements.selectionStatus.querySelector('span:last-child').textContent = 'No location selected';
  elements.copyCoordinates.disabled = true;
  elements.copyW3w.disabled = true;
  elements.findOnW3w.disabled = true;
  elements.clearSelection.disabled = true;
}

async function selectPoint(latlng) {
  selectedPoint = latlng;
  selectedWhat3Words = null;

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
  elements.copyW3w.disabled = true;
  elements.w3wAddress.textContent = W3W_ENDPOINT
    ? 'Looking up what3words address...'
    : 'what3words lookup not configured';

  if (!W3W_ENDPOINT) return;

  const result = await lookupWhat3Words(W3W_ENDPOINT, latlng.lat, latlng.lng);
  if (!selectedPoint ||
      selectedPoint.lat !== latlng.lat ||
      selectedPoint.lng !== latlng.lng) return;

  if (result.ok) {
    selectedWhat3Words = result.address;
    elements.w3wAddress.textContent = result.address;
    elements.copyW3w.disabled = false;
  } else {
    elements.w3wAddress.textContent = result.message;
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

  } catch (error) {
    elements.mapStatus.textContent = `Data error: ${error.message}`;
    elements.mapStatus.setAttribute('role', 'alert');
  }
}

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
