import { describe, expect, it } from "vitest";

import { buildRoadRouteRecommendation } from "@/lib/road-routing";
import type { RoadConditionIncident } from "@/services/api";

const roads: RoadConditionIncident[] = [
  {
    id: "open-kathmandu",
    road: "Prithvi Rajmarg",
    district: "Nuwakot",
    location: "Naubise–Mugling",
    status: "open",
    raw_status: "Opened",
    reason: "Public access reopened after disruption.",
    source: "Department of Roads",
    last_updated: "2026-09-28T10:45:00+05:45",
    latitude: 27.8897,
    longitude: 84.5474,
    is_stale: true,
  },
  {
    id: "closed-kaligandaki",
    road: "Kali Gandaki corridor",
    district: "Gandaki",
    location: "River washout area",
    status: "closed",
    raw_status: "Closed",
    reason: "Highway washout by the Kaligandaki River.",
    source: "Department of Roads",
    last_updated: "2026-09-27T02:12:00+05:45",
    latitude: 28.2514,
    longitude: 84.8722,
    is_stale: true,
  },
  {
    id: "partial-nh58",
    road: "Karnali Rajmarg",
    district: "Banke",
    location: "Nepalgunj–Surkhet corridor",
    status: "partially_open",
    raw_status: "Partially Opened",
    reason: "Restricted movement with intermittent access.",
    source: "Department of Roads",
    last_updated: "2026-09-28T09:15:00+05:45",
    latitude: 28.0681,
    longitude: 81.7519,
    is_stale: true,
  },
];

describe("Road route recommendation", () => {
  it("prefers open roads and flags any closed links in the route plan", () => {
    const plan = buildRoadRouteRecommendation(roads, "open-kathmandu", "partial-nh58");

    expect(plan.primaryRoute.status).toBe("partially_open");
    expect(plan.warning.toLowerCase()).toContain("avoid");
    expect(plan.primaryRoute.roadNames).toContain("Prithvi Rajmarg");
  });

  it("marks the route as unsafe when the selected road itself is closed", () => {
    const plan = buildRoadRouteRecommendation(roads, "closed-kaligandaki", "partial-nh58");

    expect(plan.primaryRoute.status).toBe("unsafe");
    expect(plan.warning).toMatch(/closed|unsafe/i);
  });
});
