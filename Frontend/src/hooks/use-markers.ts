import { useMemo } from "react";
import type { MapMarker, MarkerKind } from "@/components/map/kinds";
import type { HazardType } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { useFacilities, useReports, useRescues, useShelters } from "./use-data";

export interface MarkerDetail {
  marker: MapMarker;
  district: string;
  municipality?: string;
  description: string;
  source: string;
  status: string;
  reportedAt: string;
  verifiedAt?: string | undefined;
  isDemo: boolean;
}

export const hazardKind = (h: HazardType): MarkerKind =>
  h === "flood" || h === "river_rise" ? "flood" : h === "landslide" || h === "blocked_road" || h === "damaged_bridge" ? h : "other_hazard";

export function useMarkers() {
  const reports = useReports();
  const shelters = useShelters();
  const facilities = useFacilities();
  const rescues = useRescues();
  const { can } = useAuth();
  const privileged = can("responder", "admin");

  const items = useMemo<MarkerDetail[]>(() => {
    const out: MarkerDetail[] = [];
    for (const r of reports.data ?? []) {
      if (r.status === "rejected") continue;
      if (!r.location) continue;
      out.push({
        marker: { id: `rep-${r.id}`, kind: hazardKind(r.hazard), lat: r.location.lat, lng: r.location.lng, title: `${r.municipality} — ${r.hazard.replace("_", " ")}`, verified: r.status === "verified" },
        district: r.district,
        municipality: r.municipality,
        description: r.description,
        source: r.source === "official" ? "Official report" : "Community report",
        status: r.status,
        reportedAt: r.createdAt,
        verifiedAt: r.status === "verified" ? r.updatedAt : undefined,
        isDemo: r.isDemo,
      });
    }
    for (const s of shelters.data ?? [])
      out.push({
        marker: { id: `sh-${s.id}`, kind: "shelter", lat: s.location.lat, lng: s.location.lng, title: s.name, verified: s.verified },
        district: s.district,
        municipality: s.municipality,
        description: `${s.address}. ${s.capacity ? `Capacity ${s.capacity}, occupancy ${s.occupancy ?? "unconfirmed"}.` : "Capacity unconfirmed."}`,
        source: "Shelter registry (demo)",
        status: s.verified ? "verified" : "unverified",
        reportedAt: s.updatedAt,
        verifiedAt: s.verified ? s.updatedAt : undefined,
        isDemo: s.isDemo,
      });
    for (const f of facilities.data ?? [])
      out.push({
        marker: { id: `fa-${f.id}`, kind: f.kind, lat: f.location.lat, lng: f.location.lng, title: f.name, verified: f.verified },
        district: f.district,
        description: f.kind === "medical" ? "Medical facility" : "Relief distribution point",
        source: "Facility registry (demo)",
        status: f.verified ? "verified" : "unverified",
        reportedAt: f.updatedAt,
        verifiedAt: f.verified ? f.updatedAt : undefined,
        isDemo: f.isDemo,
      });
    // Emergency requests contain vulnerable-person locations: responders/admins only, rounded.
    if (privileged)
      for (const r of rescues.data ?? []) {
        if (!r.location || r.status === "resolved") continue;
        out.push({
          marker: { id: `rq-${r.id}`, kind: "emergency", lat: +r.location.lat.toFixed(2), lng: +r.location.lng.toFixed(2), title: `${r.reference} — ${r.people} people`, verified: r.status !== "submitted" },
          district: r.district,
          municipality: r.municipality,
          description: r.description,
          source: "Emergency request (approximate location)",
          status: r.status,
          reportedAt: r.createdAt,
          isDemo: r.isDemo,
        });
      }
    return out;
  }, [reports.data, shelters.data, facilities.data, rescues.data, privileged]);

  const isLoading = reports.isLoading || shelters.isLoading || facilities.isLoading;
  const isError = reports.isError || shelters.isError || facilities.isError;
  const refetch = () => {
    reports.refetch();
    shelters.refetch();
    facilities.refetch();
    rescues.refetch();
  };
  return {
    items,
    isLoading,
    isError,
    hazardsLoading: reports.isLoading,
    hazardsError: reports.isError,
    refetch,
    privileged,
  };
}
