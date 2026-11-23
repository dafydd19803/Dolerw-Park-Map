export function getWhat3WordsMapUrl() {
  return 'https://what3words.com/';
}

export async function lookupWhat3Words(endpoint, latitude, longitude) {
  if (!endpoint) {
    return {
      ok: false,
      message: 'what3words lookup not configured'
    };
  }

  try {
    const url = new URL(endpoint, window.location.href);
    url.searchParams.set('lat', latitude.toFixed(6));
    url.searchParams.set('lng', longitude.toFixed(6));

    const response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Lookup failed (${response.status})`);

    const data = await response.json();
    if (!data.address || typeof data.address !== 'string') {
      return { ok: false, message: 'No what3words address returned' };
    }
    return { ok: true, address: data.address };
  } catch (error) {
    return { ok: false, message: 'what3words lookup unavailable' };
  }
}
