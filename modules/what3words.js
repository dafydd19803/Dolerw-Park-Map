const WHAT3WORDS_PROXY = '/api/what3words';

export function getWhat3WordsMapUrl() {
  return 'https://what3words.com/';
}

async function requestWhat3Words(params, signal) {
  const url = new URL(WHAT3WORDS_PROXY, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal
  });
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`what3words proxy returned invalid JSON (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(data.error?.message || `what3words request failed (${response.status})`);
  }
  return data;
}

export async function fetchGridSection(bounds, signal) {
  const data = await requestWhat3Words({
    operation: 'grid',
    south: bounds.getSouth().toFixed(6),
    west: bounds.getWest().toFixed(6),
    north: bounds.getNorth().toFixed(6),
    east: bounds.getEast().toFixed(6)
  }, signal);

  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('what3words returned an invalid grid section');
  }
  return data;
}

export async function convertCoordinatesToWhat3Words(latitude, longitude, signal) {
  const data = await requestWhat3Words({
    operation: 'convert',
    lat: latitude.toFixed(6),
    lng: longitude.toFixed(6)
  }, signal);

  const southwest = data.square?.southwest;
  const northeast = data.square?.northeast;
  if (
    typeof data.words !== 'string' ||
    !data.words ||
    !Number.isFinite(southwest?.lat) ||
    !Number.isFinite(southwest?.lng) ||
    !Number.isFinite(northeast?.lat) ||
    !Number.isFinite(northeast?.lng)
  ) {
    throw new Error('what3words returned incomplete square data');
  }
  return data;
}
