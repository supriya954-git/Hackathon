import type { RoadConditionIncident, RoadStatus } from "@/services/api";

export type RouteRecommendationStatus = RoadStatus | "unsafe";

export interface RoadRouteRecommendation {
  primaryRoute: {
    status: RouteRecommendationStatus;
    roadNames: string[];
    summary: string;
  };
  alternatives: Array<{
    label: string;
    status: RouteRecommendationStatus;
    roadNames: string[];
    reason: string;
  }>;
  warning: string;
}

const statusPriority: Record<RoadStatus, number> = {
  open: 0,
  partially_open: 1,
  unknown: 2,
  closed: 3,
};

export function buildRoadRouteRecommendation(
  roads: RoadConditionIncident[],
  originId?: string | null,
  destinationId?: string | null,
): RoadRouteRecommendation {
  const origin = roads.find((road) => road.id === originId) ?? null;
  const destination = roads.find((road) => road.id === destinationId) ?? null;

  if (!origin || !destination) {
    return {
      primaryRoute: {
        status: "unsafe",
        roadNames: [],
        summary: "Select both a starting road and a destination to review the route.",
      },
      alternatives: [],
      warning: "Avoid making travel decisions from incomplete route data. This preview uses verified road-status snapshots only.",
    };
  }

  const alternatives = roads
    .filter((road) => road.id !== origin.id && road.id !== destination.id)
    .sort((a, b) => statusPriority[a.status] - statusPriority[b.status])
    .slice(0, 3)
    .map((road, index) => ({
      label: `Alternative ${index + 1}`,
      status: road.status,
      roadNames: [road.road],
      reason: road.reason ?? "No detailed reason reported by the official source.",
    }));

  const hasClosedLink = origin.status === "closed" || destination.status === "closed";
  const hasUnverifiedLink = origin.status === "unknown" || destination.status === "unknown";

  if (hasClosedLink) {
    return {
      primaryRoute: {
        status: "unsafe",
        roadNames: [origin.road, destination.road],
        summary: `Unsafe route: ${origin.road} or ${destination.road} is marked closed by the official snapshot.`,
      },
      alternatives,
      warning: "Avoid this route until the closed section is reopened or a verified alternative is confirmed. This planner does not replace official road advisories or live navigation.",
    };
  }

  const primaryStatus: RouteRecommendationStatus =
    origin.status === "partially_open" || destination.status === "partially_open"
      ? "partially_open"
      : "open";

  if (hasUnverifiedLink) {
    return {
      primaryRoute: {
        status: "unknown",
        roadNames: [origin.road, destination.road],
        summary: "Status is not fully confirmed for one or both route points.",
      },
      alternatives,
      warning: "Avoid assuming a route is safe when either corridor has an unverified status. Treat this as a cautionary planner, not live navigation.",
    };
  }

  return {
    primaryRoute: {
      status: primaryStatus,
      roadNames: [origin.road, destination.road],
      summary:
        primaryStatus === "partially_open"
          ? "Route is partially open, but movement may still be restricted or slow."
          : "Route is available based on the latest verified snapshot and has no confirmed closure.",
    },
    alternatives,
    warning: "Avoid relying on this as live navigation. This route preview only screens roads against the latest official snapshot and does not confirm every section is open.",
  };
}
