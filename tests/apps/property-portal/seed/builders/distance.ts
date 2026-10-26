type Point = { latitude: number; longitude: number }

const earthRadiusKm = 6371

/** The great-circle distance between two points, in kilometres (haversine): which places a search around one takes in. */
export const distanceKm = (a: Point, b: Point) => {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h))
}
