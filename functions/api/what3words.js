const WHAT3WORDS_API = 'https://api.what3words.com/v3';
const PARK_BOUNDS = {
  south: 52.513042,
  west: -3.330628,
  north: 52.51723,
  east: -3.318169
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function readNumber(params, key, min, max) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function isWithinParkBounds(latitude, longitude) {
  return latitude >= PARK_BOUNDS.south &&
    latitude <= PARK_BOUNDS.north &&
    longitude >= PARK_BOUNDS.west &&
    longitude <= PARK_BOUNDS.east;
}

function distanceBetweenCorners(south, west, north, east) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(north - south);
  const longitudeDelta = radians(east - west);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(south)) * Math.cos(radians(north)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function callWhat3Words(url, apiKey) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Api-Key': apiKey
      }
    });
  } catch (error) {
    return jsonResponse({ error: { message: 'Unable to reach the what3words API' } }, 502);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    return jsonResponse({ error: { message: 'The what3words API returned invalid JSON' } }, 502);
  }

  if (!response.ok) {
    const message = data.error?.message || `what3words API request failed (${response.status})`;
    return jsonResponse({ error: { message } }, response.status >= 500 ? 502 : response.status);
  }
  return jsonResponse(data);
}

export async function onRequestGet({ request, env }) {
  if (!env.W3W_API_KEY) {
    return jsonResponse({ error: { message: 'what3words API key is not configured' } }, 503);
  }

  const params = new URL(request.url).searchParams;
  const operation = params.get('operation');
  const apiUrl = new URL(WHAT3WORDS_API);

  if (operation === 'grid') {
    const south = readNumber(params, 'south', -90, 90);
    const west = readNumber(params, 'west', -180, 180);
    const north = readNumber(params, 'north', -90, 90);
    const east = readNumber(params, 'east', -180, 180);
    if (
      south === null ||
      west === null ||
      north === null ||
      east === null ||
      south >= north ||
      west >= east ||
      !isWithinParkBounds(south, west) ||
      !isWithinParkBounds(north, east) ||
      distanceBetweenCorners(south, west, north, east) > 4000
    ) {
      return jsonResponse({ error: { message: 'Invalid or out-of-area grid bounds' } }, 400);
    }

    apiUrl.pathname += '/grid-section';
    apiUrl.searchParams.set('bounding-box', `${south},${west},${north},${east}`);
    apiUrl.searchParams.set('format', 'geojson');
    return callWhat3Words(apiUrl, env.W3W_API_KEY);
  }

  if (operation === 'convert') {
    const latitude = readNumber(params, 'lat', -90, 90);
    const longitude = readNumber(params, 'lng', -180, 180);
    if (
      latitude === null ||
      longitude === null ||
      !isWithinParkBounds(latitude, longitude)
    ) {
      return jsonResponse({ error: { message: 'Invalid or out-of-area location' } }, 400);
    }

    apiUrl.pathname += '/convert-to-3wa';
    apiUrl.searchParams.set('coordinates', `${latitude},${longitude}`);
    apiUrl.searchParams.set('language', 'en');
    return callWhat3Words(apiUrl, env.W3W_API_KEY);
  }

  return jsonResponse({ error: { message: 'Unsupported what3words operation' } }, 400);
}
