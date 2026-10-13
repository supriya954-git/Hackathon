import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";

export const qk = {
  alerts: ["alerts"],
  dashboard: ["dashboard"],
  reports: ["reports"],
  rescues: ["rescues"],
  shelters: ["shelters"],
  facilities: ["facilities"],
  relief: ["relief"],
  inventory: ["inventory"],
  recovery: ["recovery"],
  activity: ["activity"],
  weather: ["weather"],
  roads: ["roads"],
  notifications: ["notifications"],
} as const;

const opts = { staleTime: 30_000, retry: 1 };
export const useAlerts = () => useQuery({ queryKey: qk.alerts, queryFn: api.getAlerts, ...opts });
export const useDashboard = () =>
  useQuery({ queryKey: qk.dashboard, queryFn: api.getDashboard, ...opts });
export const useReports = () =>
  useQuery({ queryKey: qk.reports, queryFn: api.getReports, ...opts });
export const useRescues = () =>
  useQuery({ queryKey: qk.rescues, queryFn: api.getRescueRequests, ...opts });
export const useShelters = () =>
  useQuery({ queryKey: qk.shelters, queryFn: api.getShelters, ...opts });
export const useFacilities = () =>
  useQuery({ queryKey: qk.facilities, queryFn: api.getFacilities, ...opts });
export const useRelief = () =>
  useQuery({ queryKey: qk.relief, queryFn: api.getReliefRequests, ...opts });
export const useInventory = () =>
  useQuery({ queryKey: qk.inventory, queryFn: api.getInventory, ...opts });
export const useRecovery = () =>
  useQuery({ queryKey: qk.recovery, queryFn: api.getRecoveryApplications, ...opts });
export const useActivity = () =>
  useQuery({ queryKey: qk.activity, queryFn: api.getActivity, ...opts });
export const useWeather = (latitude = 27.7172, longitude = 85.324) =>
  useQuery({
    queryKey: [...qk.weather, latitude, longitude],
    queryFn: () => api.getWeather(latitude, longitude),
    ...opts,
    refetchInterval: 600_000,
  });
export const useRoadConditions = () =>
  useQuery({
    queryKey: qk.roads,
    queryFn: api.getRoadConditions,
    ...opts,
    refetchInterval: 300_000,
  });
export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: api.getNotifications,
    enabled,
    ...opts,
    refetchInterval: 60_000,
  });

/** Wrap a service mutation and invalidate affected lists. */
export function useApiMutation<A, R>(fn: (a: A) => Promise<R>, keys: (readonly string[])[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: qk.activity });
    },
  });
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
