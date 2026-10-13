/**
 * Centralised data service. UI code must only talk to `api`.
 * - Mock mode (default): conforms to the same interfaces, persists fictional
 *   demo records in this browser only (personal contact fields are never persisted).
 * - Backend mode: set VITE_API_BASE_URL to a Flask REST API implementing the
 *   proposed contract below. Authorization MUST be enforced by that backend.
 */
import type {
  ActivityEntry,
  Alert,
  Facility,
  HazardReport,
  InventoryItem,
  Notification,
  RecoveryApplication,
  RecoveryStatus,
  ReliefRequest,
  ReliefStatus,
  ReportStatus,
  RescueRequest,
  RescueStatus,
  Shelter,
  User,
} from "@/lib/types";
import { buildSeed, type Db } from "./mock-data";
import { readCached, writeCached } from "./offline";

export const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";
export const IS_MOCK = !API_BASE_URL;

export type EvidenceInput = { evidence?: File };
export type NewReport = Omit<
  HazardReport,
  "id" | "createdAt" | "updatedAt" | "status" | "source" | "isDemo" | "hasImage"
> &
  EvidenceInput;
export type NewRescue = Omit<
  RescueRequest,
  "id" | "reference" | "status" | "createdAt" | "updatedAt" | "isDemo" | "assignedTo" | "hasImage"
> &
  EvidenceInput;
export type NewRelief = Omit<
  ReliefRequest,
  "id" | "status" | "createdAt" | "updatedAt" | "isDemo" | "provider"
>;
export type NewInventory = Omit<InventoryItem, "id" | "updatedAt" | "isDemo" | "confirmed">;
export type NewRecovery = Omit<
  RecoveryApplication,
  | "id"
  | "reference"
  | "status"
  | "history"
  | "createdAt"
  | "updatedAt"
  | "isDemo"
  | "assessment"
  | "decisionNote"
  | "hasEvidence"
> & { hasEvidence?: boolean } & EvidenceInput;
export interface WeatherData {
  source: string;
  source_url?: string;
  latitude: number;
  longitude: number;
  fetched_at?: string;
  timezone?: string;
  status: "live" | "unavailable";
  is_stale: boolean;
  from_cache?: boolean;
  current_conditions: {
    time?: string;
    temperature: number | null;
    feels_like: number | null;
    humidity: number | null;
    wind_speed: number | null;
    wind_direction: number | null;
    pressure: number | null;
    precipitation: number | null;
    rain: number | null;
    weather_code: number | null;
  } | null;
  hourly: Array<{
    time: string;
    temperature: number | null;
    precipitation: number | null;
    probability: number | null;
    weather_code: number | null;
  }>;
  forecast: Array<{
    date: string;
    precipitation: number | null;
    probability: number | null;
    temperature_min: number | null;
    temperature_max: number | null;
    weather_code: number | null;
  }>;
  warning_note: string;
  message?: string;
}
type OpenMeteoPayload = {
  timezone?: string;
  current?: Record<string, number | string>;
  hourly?: Record<string, Array<number | string>>;
  daily?: Record<string, Array<number | string>>;
};
const numeric = (value: number | string | undefined) => (typeof value === "number" ? value : null);
export interface DashboardSummary {
  activeAlerts: number;
  pendingReports: number;
  openRescueRequests: number;
  availableShelters: number;
  unfulfilledReliefRequests: number;
  recoveryAwaitingReview: number;
}

export type RoadStatus = "open" | "partially_open" | "closed" | "unknown";

export interface RoadConditionIncident {
  id: string;
  road: string;
  district?: string;
  location?: string;
  status: RoadStatus;
  raw_status?: string;
  reason?: string;
  source: string;
  source_url?: string;
  notice_url?: string;
  last_updated: string;
  latitude?: number;
  longitude?: number;
  is_live?: boolean;
  is_stale?: boolean;
}

export interface RoadConditionsResponse {
  items: RoadConditionIncident[];
  source: string;
  notice_url?: string;
  last_updated: string;
  is_live?: boolean;
  is_stale?: boolean;
  note?: string;
}

export interface RoadStatusSummary {
  total: number;
  open: number;
  partially_open: number;
  closed: number;
  unknown: number;
  source: string;
  last_updated: string;
  is_live?: boolean;
  is_stale?: boolean;
}

export interface ApiService {
  login(email: string, password: string): Promise<{ user: User; accessToken: string }>;
  register(
    name: string,
    email: string,
    password: string,
  ): Promise<{ user: User; accessToken: string }>;
  me(): Promise<User>;
  getAlerts(): Promise<Alert[]>;
  getDashboard(): Promise<DashboardSummary>;
  getReports(): Promise<HazardReport[]>;
  createReport(r: NewReport): Promise<HazardReport>;
  verifyReport(id: string, status: "verified" | "rejected", actor: string): Promise<HazardReport>;
  getRescueRequests(): Promise<RescueRequest[]>;
  getRescueByReference(ref: string): Promise<RescueRequest | null>;
  createRescueRequest(r: NewRescue): Promise<RescueRequest>;
  updateRescueStatus(
    id: string,
    status: RescueStatus,
    actor: string,
    assignedTo?: string,
  ): Promise<RescueRequest>;
  getShelters(): Promise<Shelter[]>;
  submitShelterUpdate(
    id: string,
    patch: Pick<Shelter, "occupancy" | "food" | "water" | "medical">,
    actor: string,
  ): Promise<Shelter>;
  verifyShelter(id: string, verified: boolean, actor: string): Promise<Shelter>;
  getFacilities(): Promise<Facility[]>;
  getReliefRequests(): Promise<ReliefRequest[]>;
  createReliefRequest(r: NewRelief): Promise<ReliefRequest>;
  updateReliefStatus(
    id: string,
    status: ReliefStatus,
    actor: string,
    provider?: string,
  ): Promise<ReliefRequest>;
  getInventory(): Promise<InventoryItem[]>;
  addInventory(i: NewInventory): Promise<InventoryItem>;
  updateInventory(
    id: string,
    quantity: number,
    confirmed: boolean,
    actor: string,
  ): Promise<InventoryItem>;
  getRecoveryApplications(): Promise<RecoveryApplication[]>;
  createRecoveryApplication(a: NewRecovery): Promise<RecoveryApplication>;
  decideRecovery(
    id: string,
    status: RecoveryStatus,
    note: string,
    actor: string,
  ): Promise<RecoveryApplication>;
  getActivity(): Promise<ActivityEntry[]>;
  getRoadConditions(): Promise<RoadConditionsResponse>;
  getRoadConditionsSummary(): Promise<RoadStatusSummary>;
  getWeather(latitude: number, longitude: number): Promise<WeatherData>;
  getNotifications(): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<Notification>;
}

/* ---------------- HTTP adapter (Flask) ---------------- */
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = window.sessionStorage.getItem("jalrakshak-access-token");
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
async function cachedGet<T>(key: string, path: string): Promise<T> {
  try {
    const value = await http<T>(path);
    writeCached(key, value);
    return value;
  } catch (error) {
    const cached = readCached<T>(key);
    if (cached) return cached.value;
    throw error;
  }
}
const body = (b: unknown) => ({ body: JSON.stringify(b) });
function multipart(data: Record<string, unknown>, file?: File) {
  const form = new FormData();
  Object.entries(data).forEach(([key, value]) =>
    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value ?? "")),
  );
  if (file) form.append("evidence", file);
  return { body: form };
}

const httpApi: ApiService = {
  login: (email, password) =>
    http("/api/auth/login", { method: "POST", ...body({ email, password }) }),
  register: (name, email, password) =>
    http("/api/auth/register", { method: "POST", ...body({ name, email, password }) }),
  me: () => http("/api/auth/me"),
  getAlerts: () => cachedGet("alerts", "/api/alerts"),
  getDashboard: () => cachedGet("dashboard", "/api/dashboard"),
  getReports: () => cachedGet("reports", "/api/reports"),
  createReport: (r) => {
    const { evidence, ...data } = r;
    return http("/api/reports", { method: "POST", ...multipart(data, evidence) });
  },
  verifyReport: (id, status) =>
    http(`/api/admin/reports/${id}/verify`, { method: "PATCH", ...body({ status }) }),
  getRescueRequests: () => cachedGet("rescues", "/api/rescue-requests"),
  getRescueByReference: (ref) => http(`/api/rescue-requests?reference=${encodeURIComponent(ref)}`),
  createRescueRequest: (r) => {
    const { evidence, ...data } = r;
    return http("/api/rescue-requests", { method: "POST", ...multipart(data, evidence) });
  },
  updateRescueStatus: (id, status, _a, assignedTo) =>
    http(`/api/admin/rescue-requests/${id}/status`, {
      method: "PATCH",
      ...body({ status, assignedTo }),
    }),
  getShelters: () => cachedGet("shelters", "/api/shelters"),
  submitShelterUpdate: (id, patch) =>
    http(`/api/shelters/${id}`, { method: "PATCH", ...body(patch) }),
  verifyShelter: (id, verified) =>
    http(`/api/admin/shelters/${id}/verify`, { method: "PATCH", ...body({ verified }) }),
  getFacilities: () => cachedGet("facilities", "/api/facilities"),
  getReliefRequests: () => cachedGet("relief", "/api/relief-requests"),
  createReliefRequest: (r) => http("/api/relief-requests", { method: "POST", ...body(r) }),
  updateReliefStatus: (id, status, _a, provider) =>
    http(`/api/relief-requests/${id}/status`, { method: "PATCH", ...body({ status, provider }) }),
  getInventory: () => cachedGet("inventory", "/api/inventory"),
  addInventory: (i) => http("/api/inventory", { method: "POST", ...body(i) }),
  updateInventory: (id, quantity, confirmed) =>
    http(`/api/inventory/${id}`, { method: "PATCH", ...body({ quantity, confirmed }) }),
  getRecoveryApplications: () => cachedGet("recovery", "/api/recovery-applications"),
  createRecoveryApplication: (a) => {
    const { evidence, ...data } = a;
    return http("/api/recovery-applications", { method: "POST", ...multipart(data, evidence) });
  },
  decideRecovery: (id, status, note) =>
    http(`/api/admin/recovery-applications/${id}/decision`, {
      method: "PATCH",
      ...body({ status, note }),
    }),
  getActivity: () => http("/api/admin/activity"),
  getRoadConditions: () => http("/api/roads"),
  getRoadConditionsSummary: () => http("/api/roads/summary"),
  getWeather: (latitude, longitude) => http(`/api/weather?lat=${latitude}&lon=${longitude}`),
  getNotifications: () => cachedGet("notifications", "/api/notifications"),
  markNotificationRead: (id) =>
    http(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
};

/* ---------------- Mock adapter ---------------- */
const KEY = "jalrakshak-demo-db-v1";
let db: Db | null = null;

function load(): Db {
  if (db) return db;
  if (typeof window === "undefined") return buildSeed();
  try {
    const raw = window.localStorage.getItem(KEY);
    db = raw ? (JSON.parse(raw) as Db) : buildSeed();
  } catch {
    db = buildSeed();
  }
  return db;
}
function save() {
  if (!db || typeof window === "undefined") return;
  // Never persist personal contact details in browser storage.
  const safe: Db = { ...db, rescues: db.rescues.map(({ name: _n, phone: _p, ...r }) => r) };
  window.localStorage.setItem(KEY, JSON.stringify(safe));
}
export function resetDemoData() {
  db = buildSeed();
  save();
}

const delay = <T>(v: T, ms = 350) =>
  new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID().slice(0, 8);
const refNo = (p: string) => `JR-${p}-${Math.floor(1000 + Math.random() * 9000)}`;
function log(actor: string, action: string, target: string) {
  load().activity.unshift({ id: uid(), actor, action, target, at: now() });
}
function patch<T extends { id: string; updatedAt: string }>(
  list: T[],
  id: string,
  p: Partial<T>,
): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error("Record not found");
  Object.assign(item, p, { updatedAt: now() });
  save();
  return item;
}

const mockApi: ApiService = {
  login: async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === "admin@jalrakshak.local") {
      if (password !== "change-this-password") throw new Error("Invalid email or password");
      return {
        user: {
          id: "demo-admin",
          name: "Demo Administrator",
          email: normalizedEmail,
          role: "admin",
        },
        accessToken: "demo-admin-token",
      };
    }
    return {
      user: { id: "demo-citizen", name: "Demo citizen", email: normalizedEmail, role: "citizen" },
      accessToken: "demo-token",
    };
  },
  register: async (name, email) => ({
    user: { id: "demo-citizen", name, email, role: "citizen" },
    accessToken: "demo-token",
  }),
  me: async () => ({
    id: "demo-citizen",
    name: "Demo citizen",
    email: "demo@example.com",
    role: "citizen",
  }),
  getAlerts: () => delay(load().alerts),
  getDashboard: async () => {
    const data = load();
    return delay({
      activeAlerts: data.alerts.filter((item) => item.verified).length,
      pendingReports: data.reports.filter(
        (item) => item.status === "unverified" || item.status === "under_review",
      ).length,
      openRescueRequests: data.rescues.filter((item) => item.status !== "resolved").length,
      availableShelters: data.shelters.filter((item) => item.verified).length,
      unfulfilledReliefRequests: data.relief.filter(
        (item) => item.status !== "delivered" && item.status !== "cancelled",
      ).length,
      recoveryAwaitingReview: data.recovery.filter(
        (item) => item.status === "submitted" || item.status === "under_review",
      ).length,
    });
  },
  getNotifications: async () =>
    delay(
      JSON.parse(
        window.sessionStorage.getItem("jalrakshak-demo-notifications") ?? "[]",
      ) as Notification[],
    ),
  markNotificationRead: async (id) => {
    const items = JSON.parse(
      window.sessionStorage.getItem("jalrakshak-demo-notifications") ?? "[]",
    ) as Notification[];
    const item = items.find((notification) => notification.id === id);
    if (!item) throw new Error("Notification not found");
    item.read = true;
    window.sessionStorage.setItem("jalrakshak-demo-notifications", JSON.stringify(items));
    return delay(item);
  },
  getWeather: async (latitude, longitude) => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure",
      hourly: "temperature_2m,precipitation,precipitation_probability,weather_code",
      daily:
        "temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,weather_code",
      timezone: "Asia/Kathmandu",
      forecast_days: "6",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Weather service error (${res.status})`);
    const payload = (await res.json()) as OpenMeteoPayload;
    const current = payload.current ?? {};
    const hourly = payload.hourly ?? {};
    const daily = payload.daily ?? {};
    return delay({
      source: "Open-Meteo",
      source_url: "https://api.open-meteo.com",
      latitude,
      longitude,
      timezone: payload.timezone,
      fetched_at: new Date().toISOString(),
      status: "live",
      is_stale: false,
      from_cache: false,
      current_conditions: {
        time: typeof current.time === "string" ? current.time : undefined,
        temperature: numeric(current.temperature_2m),
        feels_like: numeric(current.apparent_temperature),
        humidity: numeric(current.relative_humidity_2m),
        wind_speed: numeric(current.wind_speed_10m),
        wind_direction: numeric(current.wind_direction_10m),
        pressure: numeric(current.surface_pressure),
        precipitation: numeric(current.precipitation),
        rain: numeric(current.rain),
        weather_code: numeric(current.weather_code),
      },
      hourly: (hourly.time ?? []).slice(0, 24).map((time, i) => ({
        time: String(time),
        temperature: numeric(hourly.temperature_2m?.[i]),
        precipitation: numeric(hourly.precipitation?.[i]),
        probability: numeric(hourly.precipitation_probability?.[i]),
        weather_code: numeric(hourly.weather_code?.[i]),
      })),
      forecast: (daily.time ?? []).map((date, i) => ({
        date: String(date),
        precipitation: numeric(daily.precipitation_sum?.[i]),
        probability: numeric(daily.precipitation_probability_max?.[i]),
        temperature_min: numeric(daily.temperature_2m_min?.[i]),
        temperature_max: numeric(daily.temperature_2m_max?.[i]),
        weather_code: numeric(daily.weather_code?.[i]),
      })),
      warning_note: "Forecast data is not a confirmed flood warning.",
    });
  },
  getReports: () => delay(load().reports),
  async createReport(r) {
    const rec: HazardReport = {
      ...r,
      id: uid(),
      createdAt: now(),
      updatedAt: now(),
      status: "unverified",
      source: "community",
      isDemo: true,
    };
    load().reports.unshift(rec);
    save();
    return delay(rec, 600);
  },
  async verifyReport(id, status, actor) {
    const r = patch(load().reports, id, { status });
    log(actor, `Set report status: ${status}`, id);
    save();
    return delay(r);
  },
  getRescueRequests: () => delay(load().rescues),
  getRescueByReference: (ref) =>
    delay(
      load().rescues.find((r) => r.reference.toUpperCase() === ref.trim().toUpperCase()) ?? null,
    ),
  async createRescueRequest(r) {
    const rec: RescueRequest = {
      ...r,
      id: uid(),
      reference: refNo("RQ"),
      status: "submitted",
      createdAt: now(),
      updatedAt: now(),
      isDemo: true,
    };
    load().rescues.unshift(rec);
    save();
    return delay(rec, 700);
  },
  async updateRescueStatus(id, status, actor, assignedTo) {
    const r = patch(load().rescues, id, assignedTo ? { status, assignedTo } : { status });
    log(actor, `Rescue status: ${status}${assignedTo ? ` → ${assignedTo}` : ""}`, r.reference);
    save();
    return delay(r);
  },
  getShelters: () => delay(load().shelters),
  async submitShelterUpdate(id, p, actor) {
    // Manager updates require re-verification.
    const s = patch(load().shelters, id, { ...p, verified: false });
    log(actor, "Submitted shelter update (needs verification)", s.name);
    save();
    return delay(s);
  },
  async verifyShelter(id, verified, actor) {
    const s = patch(load().shelters, id, { verified });
    log(actor, verified ? "Verified shelter" : "Marked shelter unverified", s.name);
    save();
    return delay(s);
  },
  getFacilities: () => delay(load().facilities),
  getReliefRequests: () => delay(load().relief),
  async createReliefRequest(r) {
    const rec: ReliefRequest = {
      ...r,
      id: uid(),
      status: "pending",
      createdAt: now(),
      updatedAt: now(),
      isDemo: true,
    };
    load().relief.unshift(rec);
    save();
    return delay(rec, 600);
  },
  async updateReliefStatus(id, status, actor, provider) {
    const r = patch(load().relief, id, provider ? { status, provider } : { status });
    log(actor, `Relief status: ${status}`, id);
    save();
    return delay(r);
  },
  getInventory: () => delay(load().inventory),
  async addInventory(i) {
    const rec: InventoryItem = {
      ...i,
      id: uid(),
      updatedAt: now(),
      confirmed: false,
      isDemo: true,
    };
    load().inventory.unshift(rec);
    save();
    return delay(rec);
  },
  async updateInventory(id, quantity, confirmed, actor) {
    const r = patch(load().inventory, id, { quantity, confirmed });
    log(actor, `Inventory updated (${quantity}${confirmed ? ", confirmed" : ""})`, r.provider);
    save();
    return delay(r);
  },
  getRecoveryApplications: () => delay(load().recovery),
  async createRecoveryApplication(a) {
    const t = now();
    const rec: RecoveryApplication = {
      ...a,
      id: uid(),
      reference: refNo("RC"),
      status: "submitted",
      assessment: "community_reported",
      history: [{ status: "submitted", at: t }],
      createdAt: t,
      updatedAt: t,
      isDemo: true,
    };
    load().recovery.unshift(rec);
    save();
    return delay(rec, 600);
  },
  async decideRecovery(id, status, note, actor) {
    const list = load().recovery;
    const a = list.find((x) => x.id === id);
    if (!a) throw new Error("Record not found");
    a.history.push({ status, at: now(), note: note || undefined });
    const r = patch(list, id, { status, decisionNote: note || a.decisionNote });
    log(actor, `Recovery decision: ${status}`, r.reference);
    save();
    return delay(r);
  },
  getActivity: () => delay(load().activity),
  getRoadConditions: async () =>
    delay({
      items: [
        {
          id: "nh03-kaligandaki-washout",
          road: "NH03 / Pushpalal Mid Hill Highway",
          district: "Gandaki / Nuwakot / Baglung corridor",
          location: "Kaligandaki River corridor",
          status: "closed",
          raw_status: "Closed",
          reason: "Highway washout by the Kaligandaki River",
          source: "Department of Roads (official dashboard)",
          source_url: "https://navigate.dor.gov.np/dashboard",
          notice_url: "https://dor.gov.np/home/page/highway-traffic-updates",
          last_updated: "2026-09-27T02:12:00+05:45",
          latitude: 28.2514,
          longitude: 84.8722,
          is_live: false,
          is_stale: true,
        },
        {
          id: "nh37-kanti-rajpath",
          road: "NH37 / Kanti Rajpath",
          district: "Makwanpur",
          location: "Hetauda–Bagmati–Tikabhairav corridor",
          status: "closed",
          raw_status: "Closed",
          reason: "Landslide and road obstruction",
          source: "Department of Roads (official dashboard)",
          source_url: "https://navigate.dor.gov.np/dashboard",
          notice_url: "https://dor.gov.np/home/page/highway-traffic-updates",
          last_updated: "2026-09-27T04:00:00+05:45",
          latitude: 27.4179,
          longitude: 85.0364,
          is_live: false,
          is_stale: true,
        },
        {
          id: "nh58-karnali-rajmarg",
          road: "NH58 / Karnali Rajmarg",
          district: "Banke / Surkhet",
          location: "Jamunaha–Nepalgunj–Kohalpur corridor",
          status: "partially_open",
          raw_status: "Partially Opened",
          reason: "Restricted access with intermittent movement",
          source: "Department of Roads (official dashboard)",
          source_url: "https://navigate.dor.gov.np/dashboard",
          notice_url: "https://dor.gov.np/home/page/highway-traffic-updates",
          last_updated: "2026-09-28T09:15:00+05:45",
          latitude: 28.0681,
          longitude: 81.7519,
          is_live: false,
          is_stale: true,
        },
        {
          id: "nh17-prithvi-rajmarg",
          road: "NH17 / Prithvi Rajmarg",
          district: "Nuwakot / Tanahun",
          location: "Naubise–Mugling–Pokhara section",
          status: "open",
          raw_status: "Opened",
          reason: "Public access reopened after earlier disruption",
          source: "Department of Roads (official dashboard)",
          source_url: "https://navigate.dor.gov.np/dashboard",
          notice_url: "https://dor.gov.np/home/page/highway-traffic-updates",
          last_updated: "2026-09-28T10:45:00+05:45",
          latitude: 27.8897,
          longitude: 84.5474,
          is_live: false,
          is_stale: true,
        },
        {
          id: "nh05-east-west-unknown",
          road: "NH05 / East-West Highway section",
          district: "Nawalpur / Bardiya corridor",
          location: "Multiple highway segments",
          status: "unknown",
          raw_status: "Status not confirmed",
          reason: "Official notice does not clearly confirm a reliable current status",
          source: "Department of Roads (official dashboard)",
          source_url: "https://navigate.dor.gov.np/dashboard",
          notice_url: "https://dor.gov.np/home/page/highway-traffic-updates",
          last_updated: "2026-09-28T12:00:00+05:45",
          latitude: 27.95,
          longitude: 83.9,
          is_live: false,
          is_stale: true,
        },
      ],
      source: "Department of Roads (official dashboard) — manually reviewed fallback snapshot",
      notice_url: "https://dor.gov.np/home/page/highway-traffic-updates",
      last_updated: "2026-09-28T12:00:00+05:45",
      is_live: false,
      is_stale: true,
      note: "No documented public API was identified for the Department of Roads traffic pages. This is a reviewed official-dashboard snapshot and should not be treated as automatic live synchronization.",
    }),
  getRoadConditionsSummary: async () =>
    delay({
      total: 5,
      open: 1,
      partially_open: 1,
      closed: 2,
      unknown: 1,
      source: "Department of Roads (official dashboard)",
      last_updated: "2026-09-28T12:00:00+05:45",
      is_live: false,
      is_stale: true,
    }),
};

export const api: ApiService = IS_MOCK ? mockApi : httpApi;

/** Simple distance (km) for duplicate detection. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
