import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Cloud,
  CloudRain,
  ClipboardList,
  Droplets,
  FileWarning,
  Gauge,
  LocateFixed,
  RefreshCw,
  ShieldCheck,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PageHeader,
  DemoBadge,
  ErrorState,
  ListSkeleton,
  Section,
  StatusBadge,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { useAlerts, useReports, useRescues, useWeather } from "@/hooks/use-data";
import { DISTRICTS } from "@/services/mock-data";
import { useI18n, type TKey } from "@/lib/i18n";
import type { HazardType, Severity } from "@/lib/types";
import type { WeatherData } from "@/services/api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Disaster dashboard — JalRakshak" }] }),
  component: Dashboard,
});

const severityColors: Record<Severity, string> = {
  low: "#14B8A6",
  moderate: "#F59E0B",
  high: "#DC2626",
  severe: "#991B1B",
};

function weatherDescription(code: number | null | undefined) {
  if (code === undefined || code === null) return "Unavailable";
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Variable conditions";
}
function weatherIcon(code: number | null | undefined) {
  if (code === 0) return Sun;
  if (code !== null && code !== undefined && [61, 63, 65, 80, 81, 82].includes(code))
    return CloudRain;
  if (code !== null && code !== undefined && [95, 96, 99].includes(code)) return CloudRain;
  return Cloud;
}
function windDirection(degrees: number | null) {
  if (degrees === null) return "—";
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8];
}
function localTime(value: string | undefined) {
  return value
    ? new Date(value).toLocaleString("en-NP", {
        timeZone: "Asia/Kathmandu",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}
function advisory(data: WeatherData) {
  const current = data.current_conditions;
  const maxRain = Math.max(...data.forecast.map((day) => day.precipitation ?? 0), 0);
  const maxWind = current?.wind_speed ?? 0;
  if ((current?.weather_code ?? 0) >= 95)
    return "Thunderstorm indicator: take shelter and follow official instructions.";
  if (maxRain >= 50)
    return "Heavy rainfall indicator: monitor local conditions and official guidance.";
  if (maxWind >= 40) return "Strong wind indicator: secure loose objects and avoid exposed areas.";
  return "No threshold-based hazardous-weather indicator is active.";
}

function WeatherPanel({
  data,
  location,
}: {
  data: WeatherData;
  location: { district: string; municipality: string; lat: number; lng: number };
}) {
  const current = data.current_conditions;
  const CurrentIcon = weatherIcon(current?.weather_code);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-medium">
          {location.district} · {location.municipality}{" "}
          <span className="text-muted-foreground">
            ({data.latitude.toFixed(3)}, {data.longitude.toFixed(3)})
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Last updated: {localTime(current?.time ?? data.fetched_at)}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <CurrentIcon className="size-10 text-teal" />
            <div>
              <p className="text-3xl font-bold">{current?.temperature ?? "—"}°C</p>
              <p className="text-sm text-muted-foreground">
                {weatherDescription(current?.weather_code)} · Feels like{" "}
                {current?.feels_like ?? "—"}°C
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <p>
              <span className="block text-muted-foreground">Humidity</span>
              <strong>{current?.humidity ?? "—"}%</strong>
            </p>
            <p>
              <span className="block text-muted-foreground">Wind</span>
              <strong>
                {current?.wind_speed ?? "—"} km/h {windDirection(current?.wind_direction ?? null)}
              </strong>
            </p>
            <p>
              <span className="block text-muted-foreground">Rain</span>
              <strong>{current?.rain ?? current?.precipitation ?? "—"} mm</strong>
            </p>
            <p>
              <span className="block text-muted-foreground">Pressure</span>
              <strong>{current?.pressure ?? "—"} hPa</strong>
            </p>
          </div>
        </div>
            <div className="rounded-lg border border-primary/20 bg-accent/45 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" />
            Weather advisory
          </p>
          <p className="mt-2 text-sm">{advisory(data)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Informational thresholds only. Official warnings are not connected.
          </p>
        </div>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Thermometer className="size-4" />
          Next 24 hours
        </h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {data.hourly.map((hour) => {
            const Icon = weatherIcon(hour.weather_code);
            return (
              <div key={hour.time} className="min-w-24 rounded-md border border-border/80 bg-card p-2 text-center text-xs shadow-sm">
                <p className="text-muted-foreground">
                  {localTime(hour.time).split(", ")[1] ?? localTime(hour.time)}
                </p>
                <Icon className="mx-auto my-2 size-5 text-teal" />
                <p className="font-semibold">{hour.temperature ?? "—"}°C</p>
                <p className="text-muted-foreground">
                  {hour.precipitation ?? 0} mm · {hour.probability ?? 0}%
                </p>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Cloud className="size-4" />
          6-day forecast
        </h3>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {data.forecast.map((day) => {
            const Icon = weatherIcon(day.weather_code);
            return (
              <div key={day.date} className="rounded-md border border-border/80 bg-card p-3 text-center text-sm shadow-sm">
                <p className="font-medium">{day.date}</p>
                <Icon className="mx-auto my-2 size-5 text-teal" />
                <p className="font-semibold">
                  {day.temperature_min ?? "—"}° / {day.temperature_max ?? "—"}°C
                </p>
                <p className="text-muted-foreground">
                  {day.precipitation ?? 0} mm · {day.probability ?? 0}%
                </p>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Source: {data.source}. Forecast data is not a confirmed flood warning.
      </p>
    </div>
  );
}

function Dashboard() {
  const { t } = useI18n();
  const alerts = useAlerts();
  const reports = useReports();
  const rescues = useRescues();
  const [weatherLocation, setWeatherLocation] = useState(DISTRICTS[0]);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const weather = useWeather(weatherLocation.lat, weatherLocation.lng);
  const [district, setDistrict] = useState("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const loading = alerts.isLoading || reports.isLoading || rescues.isLoading;
  const error = alerts.isError || reports.isError || rescues.isError;
  const retry = () => {
    void alerts.refetch();
    void reports.refetch();
    void rescues.refetch();
  };

  const filteredAlerts = useMemo(
    () =>
      (alerts.data ?? []).filter(
        (a) =>
          (district === "all" || a.district === district) &&
          (severity === "all" || a.severity === severity),
      ),
    [alerts.data, district, severity],
  );
  const filteredReports = useMemo(
    () => (reports.data ?? []).filter((r) => district === "all" || r.district === district),
    [reports.data, district],
  );
  const verified =
    filteredReports.filter((r) => r.status === "verified").length +
    filteredAlerts.filter((a) => a.verified).length;
  const hazardData = useMemo(() => {
    const counts = new Map<HazardType, number>();
    filteredReports.forEach((r) => counts.set(r.hazard, (counts.get(r.hazard) ?? 0) + 1));
    return Array.from(counts, ([key, value]) => ({ name: t(`hz.${key}` as TKey), value }));
  }, [filteredReports, t]);
  const severityData = useMemo(
    () =>
      (["low", "moderate", "high", "severe"] as Severity[]).map((key) => ({
        name: t(`sev.${key}` as TKey),
        value: filteredAlerts.filter((a) => a.severity === key).length,
        key,
      })),
    [filteredAlerts, t],
  );

  return (
    <>
      <PageHeader
        title={t("page.dashboard")}
        description={t("home.demoNotice")}
        eyebrow={<DemoBadge />}
      />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="card-surface flex flex-wrap items-end gap-3 p-4">
          <label className="grid gap-1 text-sm font-medium">
            {t("filter.district")}
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {DISTRICTS.map((d) => (
                <option key={d.district} value={d.district}>
                  {d.district}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t("filter.severity")}
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity | "all")}
            >
              <option value="all">{t("common.all")}</option>
              {(["low", "moderate", "high", "severe"] as Severity[]).map((s) => (
                <option key={s} value={s}>
                  {t(`sev.${s}` as TKey)}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setDistrict("all");
              setSeverity("all");
            }}
          >
            {t("filter.all")}
          </Button>
        </div>
        <Section
          title={t("weather.title")}
          description={t("weather.forecastNote")}
          action={
            <div className="flex flex-wrap gap-2">
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={weatherLocation.district}
                onChange={(event) => {
                  const selected = DISTRICTS.find((item) => item.district === event.target.value);
                  if (selected) {
                    setWeatherLocation(selected);
                    setLocationMessage(null);
                  }
                }}
                aria-label="Weather location"
              >
                {DISTRICTS.map((item) => (
                  <option key={item.district} value={item.district}>
                    {item.district}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!navigator.geolocation) {
                    setLocationMessage("This browser does not support location access.");
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    ({ coords }) => {
                      setWeatherLocation({
                        district: "My location",
                        municipality: "Browser location",
                        lat: coords.latitude,
                        lng: coords.longitude,
                      });
                      setLocationMessage(null);
                    },
                    () =>
                      setLocationMessage(
                        "Location permission was denied; using the selected Nepal location.",
                      ),
                  );
                }}
              >
                <LocateFixed />
                My location
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void weather.refetch()}
                disabled={weather.isFetching}
              >
                <RefreshCw className={weather.isFetching ? "animate-spin" : ""} />
                Refresh
              </Button>
            </div>
          }
        >
          {locationMessage && (
            <p className="mb-3 text-sm text-warning-foreground">{locationMessage}</p>
          )}
          {weather.isLoading ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="h-32 animate-pulse rounded-lg bg-muted" />
              <div className="h-32 animate-pulse rounded-lg bg-muted md:col-span-2" />
            </div>
          ) : weather.isError || weather.data?.status === "unavailable" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/35 bg-warning/10 p-4 text-sm">
              <p>{weather.data?.message ?? "Live weather could not be retrieved."}</p>
              <Button variant="outline" onClick={() => void weather.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            weather.data && <WeatherPanel data={weather.data} location={weatherLocation} />
          )}
        </Section>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState onRetry={retry} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                icon={AlertTriangle}
                label={t("dashboard.alerts")}
                value={filteredAlerts.length}
              />
              <Metric
                icon={FileWarning}
                label={t("dashboard.reports")}
                value={filteredReports.length}
              />
              <Metric
                icon={ClipboardList}
                label={t("dashboard.rescues")}
                value={
                  (rescues.data ?? []).filter((r) => district === "all" || r.district === district)
                    .length
                }
              />
              <Metric icon={ShieldCheck} label={t("dashboard.verified")} value={verified} />
            </div>
            {filteredAlerts.length === 0 && filteredReports.length === 0 ? (
              <Section title={t("page.noResults")}>
                <p className="text-sm text-muted-foreground">{t("page.noResults")}</p>
              </Section>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <Section title={t("dashboard.byHazard")}>
                  <ChartShell empty={hazardData.length === 0}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={hazardData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#14B8A6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartShell>
                </Section>
                <Section title={t("dashboard.bySeverity")}>
                  <ChartShell empty={severityData.every((d) => d.value === 0)}>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={severityData.filter((d) => d.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={95}
                          label
                        >
                          {severityData
                            .filter((d) => d.value > 0)
                            .map((entry) => (
                              <Cell key={entry.key} fill={severityColors[entry.key]} />
                            ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartShell>
                </Section>
              </div>
            )}
            <Section title={t("home.latestAlerts")}>
              <div className="grid gap-3 md:grid-cols-2">
                {filteredAlerts.map((alert) => (
                  <article key={alert.id} className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
                    <div className="flex justify-between gap-3">
                      <h3 className="font-semibold">{alert.title}</h3>
                      <StatusBadge status={alert.verified ? "verified" : "unverified"} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {alert.district} · {alert.municipality}
                    </p>
                  </article>
                ))}
              </div>
            </Section>
          </>
        )}
      </main>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number;
}) {
  return (
    <div className="card-surface flex items-center gap-4 p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function ChartShell({ empty, children }: { empty: boolean; children: ReactNode }) {
  return empty ? (
    <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
      No chart data for these filters.
    </p>
  ) : (
    children
  );
}
