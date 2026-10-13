import type { MarkerDetail } from "@/hooks/use-markers";

export type Coordinates = { lat: number; lng: number };
export type NearbyHazard = MarkerDetail & { distance: number; lastUpdated: string };

export const WARNING_RADIUS_METRES = 1000;
export const MAX_ACCURACY_METRES = 200;

export function distanceMetres(a: Coordinates, b: Coordinates) {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 + Math.sin(lngDelta / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function findDangerZoneEntries(
  hazards: MarkerDetail[],
  current: Coordinates,
  accuracy: number,
  previouslyInside: Set<string>,
) {
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_METRES) {
    return {
      nearby: [] as NearbyHazard[],
      entered: [] as NearbyHazard[],
      inside: previouslyInside,
    };
  }

  const nearby = hazards
    .map((item) => ({
      ...item,
      distance: distanceMetres(current, item.marker),
      lastUpdated: item.verifiedAt ?? item.reportedAt,
    }))
    .filter(({ distance }) => distance <= WARNING_RADIUS_METRES)
    .sort((a, b) => a.distance - b.distance);
  const nearbyIds = new Set(nearby.map(({ marker }) => marker.id));
  return {
    nearby,
    entered: nearby.filter(({ marker }) => !previouslyInside.has(marker.id)),
    inside: nearbyIds,
  };
}
