function pointInRing(longitude, latitude, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      (yi > latitude) !== (yj > latitude) &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

export function containsPoint(feature, latitude, longitude) {
  const geometry = feature?.geometry;
  if (!geometry) return false;

  if (geometry.type === 'Polygon') {
    if (!geometry.coordinates[0]) return false;
    if (!pointInRing(longitude, latitude, geometry.coordinates[0])) return false;
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (pointInRing(longitude, latitude, geometry.coordinates[i])) return false;
    }
    return true;
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) =>
      containsPoint({ geometry: { type: 'Polygon', coordinates: polygon } }, latitude, longitude)
    );
  }

  return false;
}

export function getFeatureBounds(feature) {
  const coordinates = [];

  function collect(value) {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      coordinates.push(value);
      return;
    }
    value.forEach(collect);
  }

  collect(feature?.geometry?.coordinates);
  if (coordinates.length === 0) return null;

  const longitudes = coordinates.map((point) => point[0]);
  const latitudes = coordinates.map((point) => point[1]);
  return [
    [Math.min(...latitudes), Math.min(...longitudes)],
    [Math.max(...latitudes), Math.max(...longitudes)]
  ];
}
