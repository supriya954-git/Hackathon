import "leaflet/dist/leaflet.css";
import { createFileRoute, Link } from "@tanstack/react-router";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import {
  AlertTriangle,
  BellRing,
  CarFront,
  ExternalLink,
  FileWarning,
  House,
  MapPin,
  MapPinned,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DemoBadge,
  EmptyState,
  ErrorState,
  Freshness,
  ListSkeleton,
  QueryState,
  Section,
  SeverityBadge,
  StatusBadge,
  VerifiedBadge,
} from "@/components/common";
import { LazyMap } from "@/components/map/LazyMap";
import { useAlerts, useDashboard, useOnline, useReports, useRoadConditions } from "@/hooks/use-data";
import { useMarkers } from "@/hooks/use-markers";
import { useI18n } from "@/lib/i18n";
import { buildRoadRouteRecommendation } from "@/lib/road-routing";
import { FloodImageCarousel } from "@/components/FloodImageCarousel";
import type { Alert, HazardReport } from "@/lib/types";
import type { RoadStatus } from "@/services/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JalRakshak — Nepal Flood Resilience & Recovery" },
      {
        name: "description",
        content:
          "Flood alerts, emergency help, shelters, relief and recovery support across Nepal (prototype).",
      },
    ],
  }),
  component: Index,
});

function SummaryCard({
  to,
  label,
  value,
  icon: Icon,
}: {
  to: string;
  label: string;
  value: number;
  icon: typeof AlertTriangle;
}) {
  return (
    <Link
      to={to}
      className="card-surface group block min-w-0 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex items-center justify-between gap-3">
        <Icon className="size-5 text-teal" />
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground group-hover:text-foreground">{label}</p>
    </Link>
  );
}

const severityStyles = {
  severe: "border-l-destructive bg-destructive/[0.04]",
  high: "border-l-orange-500 bg-orange-500/[0.04]",
  moderate: "border-l-amber-500 bg-amber-500/[0.04]",
  low: "border-l-sky-500 bg-sky-500/[0.04]",
} as const;

const severityIconStyles = {
  severe: "bg-destructive/10 text-destructive",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  moderate: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
} as const;

function AlertCard({ alert }: { alert: Alert }) {
  const severity =
    alert.severity in severityStyles ? (alert.severity as keyof typeof severityStyles) : "low";
  return (
    <article
      className={`group min-h-36 rounded-lg border border-l-4 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${severityStyles[severity]}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${severityIconStyles[severity]}`}
        >
          <BellRing className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-5 text-foreground">{alert.title}</h3>
            <SeverityBadge severity={alert.severity} />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {alert.district} · {alert.municipality}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {alert.isDemo ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldAlert className="size-3.5" />
                Sample record
              </span>
            ) : (
              <StatusBadge status={alert.verified ? "verified" : "unverified"} />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function IncidentCard({ report }: { report: HazardReport }) {
  return (
    <article
      className={`min-h-36 rounded-lg border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${report.status === "verified" ? "bg-card shadow-sm" : "border-dashed bg-muted/20"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${report.status === "verified" ? "bg-success/10 text-success" : "bg-warning/15 text-warning-foreground"}`}
        >
          <Siren className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-5">
              {report.municipality || report.district || "Location pending"}
            </h3>
            {report.isDemo ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                <ShieldAlert className="size-3" />
                Sample record
              </span>
            ) : (
              <VerifiedBadge verified={report.status === "verified"} />
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {report.description}
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {report.district || "Location pending"}
            <span aria-hidden="true">·</span>
            <span>{new Date(report.observedAt).toLocaleDateString()}</span>
          </p>
        </div>
      </div>
    </article>
  );
}

const roadStatusStyles: Record<RoadStatus, string> = {
  open: "border-success/30 bg-success/10 text-success",
  partially_open: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  closed: "border-destructive/30 bg-destructive/10 text-destructive",
  unknown: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

const roadMarkerColors: Record<RoadStatus, string> = {
  open: "#16a34a",
  partially_open: "#f59e0b",
  closed: "#ef4444",
  unknown: "#64748b",
};

function roadMarkerIcon(status: RoadStatus) {
  return L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div style="background:${roadMarkerColors[status]};width:18px;height:18px;border-radius:999px;border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(15,23,42,0.2);"></div>`,
  });
}

function RoadConditionsSection() {
  const { t } = useI18n();
  const roadQuery = useRoadConditions();
  const online = useOnline();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RoadStatus>("all");
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null);
  const [routeFromId, setRouteFromId] = useState<string | null>(null);
  const [routeToId, setRouteToId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!roadQuery.data?.items.length) return;
    if (!selectedRoadId) setSelectedRoadId(roadQuery.data.items[0].id);
    if (!routeFromId) setRouteFromId(roadQuery.data.items[0].id);
    if (!routeToId) {
      const nextTarget = roadQuery.data.items.find((item) => item.id !== roadQuery.data.items[0].id) ?? roadQuery.data.items[0];
      setRouteToId(nextTarget.id);
    }
  }, [roadQuery.data, selectedRoadId, routeFromId, routeToId]);

  const items = roadQuery.data?.items ?? [];
  const selectedRoad = items.find((item) => item.id === selectedRoadId) ?? items[0] ?? null;

  const summary = useMemo(() => {
    const counts = { open: 0, partially_open: 0, closed: 0, unknown: 0 };
    items.forEach((item) => {
      counts[item.status] += 1;
    });
    return {
      total: items.length,
      open: counts.open,
      partially_open: counts.partially_open,
      closed: counts.closed,
      unknown: counts.unknown,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter = statusFilter === "all" || item.status === statusFilter;
      if (!matchesFilter) return false;
      if (!term) return true;
      const haystack = [item.road, item.district, item.location, item.reason].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [items, query, statusFilter]);

  const routePlan = useMemo(
    () => buildRoadRouteRecommendation(items, routeFromId ?? items[0]?.id, routeToId ?? items[1]?.id ?? items[0]?.id),
    [items, routeFromId, routeToId],
  );

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        const nearestRoad = items.reduce<
          { item: (typeof items)[number]; distance: number } | null
        >((closest, item) => {
          if (!item.latitude || !item.longitude) return closest;
          const distance = Math.hypot(item.latitude - nextLocation.lat, item.longitude - nextLocation.lng);
          if (!closest || distance < closest.distance) return { item, distance };
          return closest;
        }, null);

        setUserLocation(nextLocation);
        if (nearestRoad) setRouteFromId(nearestRoad.item.id);
      },
      () => setUserLocation(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const summaryCards = [
    { key: "open", label: t("home.roadConditionsOpen"), value: summary.open },
    { key: "partially_open", label: t("home.roadConditionsPartiallyOpen"), value: summary.partially_open },
    { key: "closed", label: t("home.roadConditionsClosed"), value: summary.closed },
    { key: "unknown", label: t("home.roadConditionsUnknown"), value: summary.unknown },
  ] as const;

  return (
    <Section
      title={t("home.roadConditionsTitle")}
      description={t("home.roadConditionsSubtitle")}
      action={
        <Button variant="outline" size="sm" onClick={() => void roadQuery.refetch()}>
          <RefreshCw className="size-4" />
          {t("home.roadConditionsRefresh")}
        </Button>
      }
    >
      {roadQuery.isLoading ? (
        <ListSkeleton rows={4} />
      ) : roadQuery.isError ? (
        <ErrorState
          message={online ? t("common.error") : t("home.roadConditionsOffline")}
          onRetry={() => void roadQuery.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.key} className="rounded-md border border-border/70 bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{card.label}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${roadStatusStyles[card.key]}`}>
                    {card.value}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="space-y-4">
              <div className="h-[360px] overflow-hidden rounded-xl border border-border/80 bg-muted/30">
                <MapContainer center={[28.3949, 84.124]} zoom={7} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {items
                    .filter((item) => item.latitude && item.longitude)
                    .map((item) => (
                      <Marker
                        key={item.id}
                        position={[item.latitude as number, item.longitude as number]}
                        icon={roadMarkerIcon(item.status)}
                        eventHandlers={{ click: () => setSelectedRoadId(item.id) }}
                      >
                        <Popup>
                          <div className="space-y-2 text-sm">
                            <p className="font-semibold">{item.road}</p>
                            <p>{item.reason || "No reason reported"}</p>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roadStatusStyles[item.status]}`}>
                              {t(`home.roadConditions${item.status === "partially_open" ? "PartiallyOpen" : item.status === "open" ? "Open" : item.status === "closed" ? "Closed" : "Unknown"}`)}
                            </span>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  {userLocation && (
                    <Marker position={[userLocation.lat, userLocation.lng]} icon={L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8], html: '<div style="width:16px;height:16px;border-radius:999px;background:#14b8a6;border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(15,23,42,0.2);"></div>' })} />
                  )}
                </MapContainer>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Road status</p>
                    <h3 className="mt-1 text-lg font-semibold">{selectedRoad?.road || "No selection"}</h3>
                  </div>
                  {selectedRoad && (
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${roadStatusStyles[selectedRoad.status]}`}>
                      {t(`home.roadConditions${selectedRoad.status === "partially_open" ? "PartiallyOpen" : selectedRoad.status === "open" ? "Open" : selectedRoad.status === "closed" ? "Closed" : "Unknown"}`)}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{selectedRoad?.reason || "No official reason reported."}</p>
                {selectedRoad?.notice_url && (
                  <a href={selectedRoad.notice_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                    <ExternalLink className="size-4" />
                    View official notice
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">Route review</h3>
                  <button type="button" onClick={useCurrentLocation} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                    Use my current location
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium">
                    From
                    <select value={routeFromId ?? ""} onChange={(event) => setRouteFromId(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring">
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.road}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    To
                    <select value={routeToId ?? ""} onChange={(event) => setRouteToId(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring">
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.road}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 rounded-lg border border-dashed border-amber-400/60 bg-amber-500/5 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                  <p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${routePlan.primaryRoute.status === "unsafe" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" : routePlan.primaryRoute.status === "partially_open" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : routePlan.primaryRoute.status === "unknown" ? "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300" : "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"}`}>
                    {routePlan.primaryRoute.status === "unsafe" ? "Unsafe" : routePlan.primaryRoute.status === "partially_open" ? "Partially open" : routePlan.primaryRoute.status === "unknown" ? "Unverified" : "Open"}
                  </p>
                  <p className="mt-2 text-sm text-foreground">{routePlan.primaryRoute.summary}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{routePlan.warning}</p>
                </div>

                {routePlan.alternatives.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Alternative checks</p>
                    {routePlan.alternatives.map((option) => (
                      <div key={option.label} className="rounded-md border border-border/80 bg-muted/30 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{option.label}</span>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roadStatusStyles[option.status === "unsafe" ? "unknown" : option.status]}`}>
                            {option.status === "unsafe" ? "Unsafe" : option.status === "partially_open" ? "Partially open" : option.status === "unknown" ? "Unknown" : "Open"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{option.roadNames.join(" · ")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
                placeholder={t("home.roadConditionsSearch")}
                aria-label={t("home.roadConditionsSearch")}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | RoadStatus)}
              className="rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
              aria-label={t("filter.status")}
            >
              <option value="all">{t("home.roadConditionsAll")}</option>
              <option value="open">{t("home.roadConditionsOpen")}</option>
              <option value="partially_open">{t("home.roadConditionsPartiallyOpen")}</option>
              <option value="closed">{t("home.roadConditionsClosed")}</option>
              <option value="unknown">{t("home.roadConditionsUnknown")}</option>
            </select>
          </div>

          {visibleItems.length === 0 ? (
            <div className="mt-5">
              <EmptyState title={t("home.roadConditionsEmpty")} />
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {visibleItems.map((item) => (
                <article key={item.id} className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-2">
                        <button type="button" onClick={() => setSelectedRoadId(item.id)} className="text-left text-base font-semibold text-foreground hover:text-primary">
                          {item.road}
                        </button>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${roadStatusStyles[item.status]}`}>
                          {t(`home.roadConditions${item.status === "partially_open" ? "PartiallyOpen" : item.status === "open" ? "Open" : item.status === "closed" ? "Closed" : "Unknown"}`)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.reason || "No reason reported"}</p>
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {item.notice_url && (
                        <a
                          href={item.notice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                        >
                          <ExternalLink className="size-3.5" />
                          {t("home.roadConditionsViewNotice")}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.district")}</p>
                      <p className="mt-1 font-medium">{item.district || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
                      <p className="mt-1 font-medium">{item.location || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.source")}</p>
                      <p className="mt-1 font-medium">{item.source}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("home.roadConditionsLastUpdated")}</p>
                      <p className="mt-1 font-medium">{new Date(item.last_updated).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {item.latitude && item.longitude
                        ? `Lat ${item.latitude.toFixed(4)}, Lon ${item.longitude.toFixed(4)}`
                        : t("home.roadConditionsNoCoords")}
                    </span>
                    {item.is_stale && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                        {t("home.roadConditionsStale")}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
                placeholder={t("home.roadConditionsSearch")}
                aria-label={t("home.roadConditionsSearch")}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | RoadStatus)}
              className="rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
              aria-label={t("filter.status")}
            >
              <option value="all">{t("home.roadConditionsAll")}</option>
              <option value="open">{t("home.roadConditionsOpen")}</option>
              <option value="partially_open">{t("home.roadConditionsPartiallyOpen")}</option>
              <option value="closed">{t("home.roadConditionsClosed")}</option>
              <option value="unknown">{t("home.roadConditionsUnknown")}</option>
            </select>
          </div>

          {visibleItems.length === 0 ? (
            <div className="mt-5">
              <EmptyState title={t("home.roadConditionsEmpty")} />
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {visibleItems.map((item) => (
                <article key={item.id} className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-2">
                        <h3 className="text-base font-semibold text-foreground">{item.road}</h3>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${roadStatusStyles[item.status]}`}>
                          {t(`home.roadConditions${item.status === "partially_open" ? "PartiallyOpen" : item.status === "open" ? "Open" : item.status === "closed" ? "Closed" : "Unknown"}`)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.reason || "No reason reported"}</p>
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {item.notice_url && (
                        <a
                          href={item.notice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                        >
                          <ExternalLink className="size-3.5" />
                          {t("home.roadConditionsViewNotice")}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.district")}</p>
                      <p className="mt-1 font-medium">{item.district || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
                      <p className="mt-1 font-medium">{item.location || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.source")}</p>
                      <p className="mt-1 font-medium">{item.source}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("home.roadConditionsLastUpdated")}</p>
                      <p className="mt-1 font-medium">{new Date(item.last_updated).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {item.latitude && item.longitude
                        ? `Lat ${item.latitude.toFixed(4)}, Lon ${item.longitude.toFixed(4)}`
                        : t("home.roadConditionsNoCoords")}
                    </span>
                    {item.is_stale && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                        {t("home.roadConditionsStale")}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {roadQuery.data && (
            <div className="mt-5 flex flex-col gap-2 rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
              <span>
                {t("home.roadConditionsOfficial")}: {roadQuery.data.source} · {t("home.roadConditionsLastUpdated")}: {new Date(roadQuery.data.last_updated).toLocaleString()}
              </span>
              {roadQuery.data.is_stale && (
                <span className="font-medium text-amber-700 dark:text-amber-300">{t("home.roadConditionsStale")}</span>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function Index() {
  const { t } = useI18n();
  const dashboard = useDashboard();
  const alerts = useAlerts();
  const reports = useReports();
  const markers = useMarkers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = markers.items.find((item) => item.marker.id === selectedId) ?? markers.items[0];
  const retryMap = () => markers.refetch();

  return (
    <>
      <section>
        <FloodImageCarousel>
          <div className="mx-auto w-full max-w-7xl px-5 py-12 text-white sm:px-10 sm:py-16 lg:px-16">
            <DemoBadge />
            <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-4 max-w-2xl text-lg opacity-85">{t("hero.sub")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="sos" size="lg" asChild>
                <Link to="/request-help">
                  <Phone />
                  {t("nav.sosLong")}
                </Link>
              </Button>
              <Button variant="heroOutline" size="lg" asChild>
                <Link to="/report-hazard">
                  <FileWarning />
                  {t("home.report")}
                </Link>
              </Button>
            </div>
            <p className="mt-6 max-w-2xl text-sm opacity-75">{t("banner.official")}</p>
          </div>
        </FloodImageCarousel>
      </section>

      <main className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:space-y-8 sm:px-6 sm:py-9">
        <Section title={t("home.overview")} action={<DemoBadge />}>
          {dashboard.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : dashboard.isError || !dashboard.data ? (
            <ErrorState message={t("home.summaryError")} onRetry={() => void dashboard.refetch()} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                to="/dashboard"
                label={t("home.activeAlerts")}
                value={dashboard.data.activeAlerts}
                icon={AlertTriangle}
              />
              <SummaryCard
                to="/track"
                label={t("home.openRescues")}
                value={dashboard.data.openRescueRequests}
                icon={Phone}
              />
              <SummaryCard
                to="/shelters"
                label={t("home.availableShelters")}
                value={dashboard.data.availableShelters}
                icon={House}
              />
              <SummaryCard
                to="/relief"
                label={t("home.pendingRelief")}
                value={dashboard.data.unfulfilledReliefRequests}
                icon={Package}
              />
            </div>
          )}
        </Section>

        <Section
          title={t("home.mapTitle")}
          description={t("home.mapDescription")}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/map">
                <MapPinned />
                {t("home.openMap")}
              </Link>
            </Button>
          }
        >
          {markers.isLoading ? (
            <div className="h-[420px] animate-pulse rounded-lg bg-muted" />
          ) : markers.isError ? (
            <ErrorState onRetry={retryMap} />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <div className="h-[340px] overflow-hidden rounded-lg border border-border/80 shadow-sm sm:h-[420px]">
                <LazyMap
                  markers={markers.items.map((item) => item.marker)}
                  selectedId={selected?.marker.id}
                  onSelect={setSelectedId}
                />
              </div>
              <div className="space-y-3">
                {markers.items.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-6 text-sm text-muted-foreground">
                    {t("map.noMarkers")}
                  </p>
                ) : (
                  <div className="max-h-[420px] space-y-2 overflow-auto">
                    {markers.items.slice(0, 6).map((item) => (
                      <button
                        key={item.marker.id}
                        type="button"
                        onClick={() => setSelectedId(item.marker.id)}
                        className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted ${selected?.marker.id === item.marker.id ? "border-primary/50 bg-accent" : "border-transparent bg-card"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{item.marker.title}</span>
                          <VerifiedBadge verified={item.marker.verified} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.district}
                          {item.municipality ? ` · ${item.municipality}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.source}</p>
                      </button>
                    ))}
                  </div>
                )}
                {selected && (
                  <div className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
                    <h3 className="font-semibold">{selected.marker.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge status={selected.status} />
                      <Freshness at={selected.reportedAt} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("common.source")}: {selected.source}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        <RoadConditionsSection />

        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            className="border-t-4 border-t-orange-500/70"
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-orange-600" />
                {t("home.latestAlerts")}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {alerts.data?.length ?? 0}
                </span>
              </span>
            }
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard">
                  {t("home.viewAll")}
                  <span aria-hidden="true"> →</span>
                </Link>
              </Button>
            }
          >
            <QueryState
              q={alerts}
              empty={<p className="text-sm text-muted-foreground">{t("home.noAlerts")}</p>}
            >
              {(items) => (
                <div className="grid gap-3">
                  {items.slice(0, 3).map((alert) => (
                    <AlertCard key={alert.id} alert={alert} />
                  ))}
                </div>
              )}
            </QueryState>
          </Section>
          <Section
            className="border-t-4 border-t-sky-500/70"
            title={
              <span className="flex items-center gap-2">
                <Siren className="size-5 text-sky-600" />
                {t("home.incidents")}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {reports.data?.filter(
                    (item) => item.status !== "rejected" && item.status !== "outdated",
                  ).length ?? 0}
                </span>
              </span>
            }
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/map">
                  <MapPinned />
                  {t("home.openMap")}
                </Link>
              </Button>
            }
          >
            <QueryState
              q={reports}
              empty={<p className="text-sm text-muted-foreground">{t("home.noIncidents")}</p>}
            >
              {(items) => {
                const visible = items
                  .filter((item) => item.status !== "rejected" && item.status !== "outdated")
                  .slice(0, 4);
                return visible.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("home.noIncidents")}</p>
                ) : (
                  <div className="grid gap-3">
                    {visible.map((report) => (
                      <IncidentCard key={report.id} report={report} />
                    ))}
                  </div>
                );
              }}
            </QueryState>
          </Section>
        </div>

        <Section title={t("home.quickActions")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal p-4 text-left"
              asChild
            >
              <Link to="/report-hazard">
                <FileWarning className="size-5 text-teal" />
                {t("home.report")}
              </Link>
            </Button>
            <Button
              variant="sos"
              className="h-auto justify-start gap-3 whitespace-normal p-4 text-left"
              asChild
            >
              <Link to="/request-help">
                <Phone className="size-5" />
                {t("home.rescue")}
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal p-4 text-left"
              asChild
            >
              <Link to="/shelters">
                <House className="size-5 text-teal" />
                {t("home.shelter")}
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal p-4 text-left"
              asChild
            >
              <Link to="/preparedness">
                <ShieldCheck className="size-5 text-teal" />
                {t("home.preparedness")}
              </Link>
            </Button>
          </div>
        </Section>
      </main>
    </>
  );
}
