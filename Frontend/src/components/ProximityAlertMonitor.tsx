import { AlertTriangle, BellRing, LocateFixed, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMarkers } from "@/hooks/use-markers";
import { useOnline, useReports } from "@/hooks/use-data";
import { readCached } from "@/services/offline";
import { cn } from "@/lib/utils";
import {
  findDangerZoneEntries,
  MAX_ACCURACY_METRES,
  type Coordinates,
  type NearbyHazard,
} from "@/lib/danger-alert-utils";

const STORAGE_KEY = "jalrakshak-proximity-alerts";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const ALERT_DURATION_MS = 5000;
const HAZARD_KINDS = new Set([
  "flood",
  "landslide",
  "blocked_road",
  "damaged_bridge",
  "other_hazard",
]);

type ActiveAlert = {
  id: string;
  hazards: NearbyHazard[];
  accuracy: number;
  isTest: boolean;
};
type SoundState = "playing" | "muted" | "unavailable" | "blocked" | "interrupted" | "finished";

function distanceLabel(distance: number) {
  return distance < 1000
    ? `about ${Math.round(distance)} m`
    : `about ${(distance / 1000).toFixed(1)} km`;
}

function stopAlarm(oscillator: OscillatorNode | null, gain: GainNode | null) {
  if (oscillator) {
    oscillator.onended = null;
    try {
      oscillator.stop();
    } catch {
      // The scheduled stop may already have completed.
    }
    oscillator.disconnect();
  }
  gain?.disconnect();
}

export function ProximityAlertMonitor() {
  const { items, hazardsLoading, hazardsError } = useMarkers();
  const reports = useReports();
  const online = useOnline();
  const hazards = useMemo(
    () =>
      items.filter(
        (item) =>
          item.marker.verified &&
          !item.isDemo &&
          HAZARD_KINDS.has(item.marker.kind) &&
          Number.isFinite(item.marker.lat) &&
          Number.isFinite(item.marker.lng),
      ),
    [items],
  );
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "enabled";
    } catch {
      return false;
    }
  });
  const [location, setLocation] = useState<(Coordinates & { accuracy: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<ActiveAlert | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [soundState, setSoundState] = useState<SoundState>("unavailable");
  const inside = useRef(new Set<string>());
  const watchId = useRef<number | null>(null);
  const alertRef = useRef<ActiveAlert | null>(null);
  const alertDeadline = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const oscillator = useRef<OscillatorNode | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const alertContainer = useRef<HTMLDivElement>(null);
  const dismissButton = useRef<HTMLButtonElement>(null);

  const cachedReports = readCached<unknown[]>("reports");
  const cachedUpdatedAt = cachedReports?.syncedAt;
  const timestamp = cachedUpdatedAt ? Date.parse(cachedUpdatedAt) : Number.NaN;
  const dataStale =
    !online || !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS;
  const alertId = alert?.id;

  const triggerAlert = useCallback(
    (nearbyHazards: NearbyHazard[], accuracy: number, isTest = false) => {
      if (alertRef.current || nearbyHazards.length === 0) return;
      const nextAlert: ActiveAlert = {
        id: `${Date.now()}`,
        hazards: nearbyHazards,
        accuracy,
        isTest,
      };
      alertRef.current = nextAlert;
      alertDeadline.current = Date.now() + ALERT_DURATION_MS;
      setRemainingSeconds(5);
      setSoundState("unavailable");
      setAlert(nextAlert);

      const context = audioContext.current;
      if (!context) return;
      void context
        .resume()
        .then(() => {
          if (alertRef.current?.id !== nextAlert.id) return;
          const duration = Math.max(0, Math.min(5, (alertDeadline.current! - Date.now()) / 1000));
          if (duration <= 0) return;
          stopAlarm(oscillator.current, gainNode.current);
          const oscillatorNode = context.createOscillator();
          const gain = context.createGain();
          oscillatorNode.type = "sine";
          oscillatorNode.frequency.setValueAtTime(880, context.currentTime);
          gain.gain.setValueAtTime(0, context.currentTime);
          oscillatorNode.connect(gain);
          gain.connect(context.destination);
          for (let offset = 0; offset < duration; offset += 0.8) {
            const start = context.currentTime + offset;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.16, start + Math.min(0.04, duration - offset));
            gain.gain.setValueAtTime(0.16, Math.min(start + 0.3, context.currentTime + duration));
            gain.gain.linearRampToValueAtTime(0, Math.min(start + 0.45, context.currentTime + duration));
          }
          oscillatorNode.onended = () => {
            if (alertRef.current?.id === nextAlert.id) {
              const stoppedEarly =
                alertDeadline.current !== null && Date.now() + 200 < alertDeadline.current;
              setSoundState((state) =>
                state === "playing" ? (stoppedEarly ? "interrupted" : "finished") : state,
              );
            }
          };
          oscillatorNode.start(context.currentTime);
          oscillatorNode.stop(context.currentTime + duration);
          oscillator.current = oscillatorNode;
          gainNode.current = gain;
          setSoundState("playing");
        })
        .catch(() => {
          if (alertRef.current?.id === nextAlert.id) setSoundState("blocked");
        });
    },
    [],
  );

  useEffect(() => {
    if (alertId) alertContainer.current?.focus();
  }, [alertId]);

  useEffect(() => {
    if (alertId && remainingSeconds === 0) dismissButton.current?.focus();
  }, [alertId, remainingSeconds]);

  useEffect(() => {
    if (!alertId || alertDeadline.current === null) return;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((alertDeadline.current! - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0 && soundState === "playing") setSoundState("finished");
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 100);
    return () => window.clearInterval(timer);
  }, [alertId, soundState]);

  useEffect(() => {
    if (!enabled) {
      if (watchId.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      watchId.current = null;
      setLocation(null);
      setError(null);
      inside.current.clear();
      return;
    }
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable. Proximity alerts are inactive; this does not mean the area is safe.",
      );
      return;
    }

    try {
      watchId.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          const current = { lat: coords.latitude, lng: coords.longitude };
          if (
            !Number.isFinite(coords.accuracy) ||
            coords.accuracy < 0 ||
            coords.accuracy > MAX_ACCURACY_METRES
          ) {
            setLocation({
              ...current,
              accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : 0,
            });
            setError(
              Number.isFinite(coords.accuracy) && coords.accuracy >= 0
                ? `GPS accuracy is low (±${Math.round(coords.accuracy)} m). Waiting for a more precise location.`
                : "GPS accuracy is unavailable. Waiting for a more precise location.",
            );
            return;
          }
          setLocation({ ...current, accuracy: coords.accuracy });
          setError(null);
          if (hazardsLoading || hazardsError || hazards.length === 0) return;

          const result = findDangerZoneEntries(hazards, current, coords.accuracy, inside.current);
          inside.current = result.inside;
          if (result.entered.length === 0) return;

          const currentAlert = alertRef.current;
          if (currentAlert) {
            const combined = new Map(
              [...currentAlert.hazards, ...result.nearby].map((item) => [item.marker.id, item]),
            );
            const nextAlert = {
              ...currentAlert,
              hazards: [...combined.values()].sort((a, b) => a.distance - b.distance),
            };
            alertRef.current = nextAlert;
            setAlert(nextAlert);
            return;
          }
          triggerAlert(result.nearby, coords.accuracy);
        },
        (positionError) => {
          setError(
            positionError.code === positionError.PERMISSION_DENIED
              ? "Location permission was denied. Proximity alerts are inactive; this does not mean the area is safe."
              : "GPS is unavailable. Proximity alerts are inactive; this does not mean the area is safe.",
          );
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
      );
    } catch {
      setError(
        "GPS could not start. Proximity alerts are inactive; this does not mean the area is safe.",
      );
    }

    return () => {
      if (watchId.current !== null && navigator.geolocation)
        navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [enabled, hazards, hazardsError, hazardsLoading, triggerAlert]);

  useEffect(
    () => () => {
      alertRef.current = null;
      alertDeadline.current = null;
      stopAlarm(oscillator.current, gainNode.current);
      oscillator.current = null;
      gainNode.current = null;
      if (audioContext.current) audioContext.current.onstatechange = null;
      void audioContext.current?.close().catch(() => {});
    },
    [],
  );

  const initializeAudio = () => {
    try {
      if (!audioContext.current && typeof window.AudioContext === "function") {
        audioContext.current = new window.AudioContext();
        audioContext.current.onstatechange = () => {
          const context = audioContext.current;
          if (
            context &&
            context.state !== "running" &&
            alertRef.current &&
            alertDeadline.current !== null &&
            Date.now() < alertDeadline.current
          ) {
            stopAlarm(oscillator.current, gainNode.current);
            oscillator.current = null;
            gainNode.current = null;
            setSoundState("interrupted");
          }
        };
      }
      void audioContext.current?.resume().catch(() => setSoundState("blocked"));
    } catch {
      setSoundState("unavailable");
    }
  };

  const enable = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "enabled");
    } catch {
      // The monitor still works for this session if storage is unavailable.
    }
    initializeAudio();
    setEnabled(true);
  };

  const runTestAlert = () => {
    if (!import.meta.env.DEV || alertRef.current) return;
    initializeAudio();
    const testLocation = { lat: 27.7172, lng: 85.324 };
    const testHazard = {
      marker: {
        id: "development-test-flood-zone",
        kind: "flood" as const,
        lat: testLocation.lat,
        lng: testLocation.lng,
        title: "DEVELOPMENT TEST ONLY — simulated flood marker",
        verified: true,
      },
      district: "Test fixture",
      description: "Simulated data for alert testing only; not a real hazard.",
      source: "Development-only test fixture",
      status: "verified",
      reportedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      isDemo: false,
    };
    const result = findDangerZoneEntries([testHazard], testLocation, 10, new Set());
    triggerAlert(result.nearby, 10, true);
  };

  const disable = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Disabling the monitor must not depend on storage availability.
    }
    alertRef.current = null;
    alertDeadline.current = null;
    setAlert(null);
    setEnabled(false);
  };

  const dismiss = () => {
    if (remainingSeconds > 0) return;
    alertRef.current = null;
    alertDeadline.current = null;
    setAlert(null);
    setSoundState("unavailable");
  };

  const muteSound = () => {
    if (!gainNode.current || !audioContext.current) return;
    gainNode.current.gain.cancelScheduledValues(audioContext.current.currentTime);
    gainNode.current.gain.setTargetAtTime(0, audioContext.current.currentTime, 0.01);
    setSoundState("muted");
  };

  const sourceTimestamp = cachedUpdatedAt
    ? new Date(cachedUpdatedAt).toLocaleString()
    : "not available";
  const dataStatus = hazardsError
    ? "Hazard data is unavailable. No alert does not mean the area is safe."
    : hazardsLoading || reports.isLoading
      ? "Loading verified hazard data…"
      : hazards.length === 0
        ? "No verified, non-demo hazard data is available. This is not proof of safety."
        : dataStale
          ? `Using cached hazard data${cachedUpdatedAt ? ` from ${sourceTimestamp}` : ""}. Information may be stale.`
          : "Verified hazard data is available.";

  return (
    <>
      {!enabled ? (
        <div
          className="fixed bottom-3 left-3 z-30 w-[min(19rem,calc(100vw-1.5rem))] rounded-lg border border-border/80 bg-card/95 p-3 shadow-xl backdrop-blur sm:bottom-4 sm:left-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 size-5 shrink-0 text-teal" />
            <div className="min-w-0">
              <p className="font-semibold">Stay safe near danger areas</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Location is checked on this device against verified hazard reports. Tap Enable to
                request GPS and unlock alert audio. If the browser blocks audio, the visual warning
                still appears. Background monitoring is not supported.
              </p>
              <p className="mt-2 border-t border-border/70 pt-2 text-xs font-semibold leading-5 text-muted-foreground">
                Monitoring is off. No alert does not mean the area is safe. {dataStatus}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={enable}>
                  <LocateFixed />
                  Enable proximity alerts
                </Button>
                {import.meta.env.DEV && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label="Test emergency alert (development only)"
                    onClick={runTestAlert}
                  >
                    Test alert (dev only)
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "fixed bottom-3 left-3 z-30 w-[min(19rem,calc(100vw-1.5rem))] rounded-lg border border-border/80 bg-card/95 p-3 text-sm shadow-xl backdrop-blur sm:bottom-4 sm:left-4",
            error && "border-destructive/40",
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1 size-2 shrink-0 rounded-full",
                error ? "bg-destructive" : location ? "bg-success" : "bg-warning",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {error ??
                  (location
                    ? "Proximity alerts are active"
                    : "Waiting for GPS permission and location…")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{dataStatus}</p>
              {location && !error && (
                <p className="mt-1 text-xs text-muted-foreground">
                  GPS accuracy: ±{Math.round(location.accuracy)} m
                </p>
              )}
              {import.meta.env.DEV && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  aria-label="Test emergency alert (development only)"
                  onClick={runTestAlert}
                >
                  Test alert (dev only)
                </Button>
              )}
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Disable proximity alerts"
              onClick={disable}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {alert && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-navy/75 p-3 backdrop-blur-sm sm:p-6">
          <div
            ref={alertContainer}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="danger-alert-title"
            aria-describedby="danger-alert-message"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (remainingSeconds === 0) dismiss();
              }
              if (event.key === "Tab") {
                const focusable = alertContainer.current?.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                );
                if (!focusable?.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
            className="my-auto max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-lg border-2 border-red-700 bg-background text-foreground shadow-2xl outline-none dark:border-red-400"
          >
            <div className="border-b-4 border-red-700 bg-red-50 p-4 text-red-950 dark:border-red-400 dark:bg-red-950 dark:text-red-50 sm:p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-7 shrink-0" aria-hidden="true" />
                <div>
                  <p id="danger-alert-title" className="text-lg font-extrabold sm:text-xl">
                    EMERGENCY: DANGER ZONE NEARBY
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Verified hazard report proximity warning
                  </p>
                  {alert.isTest && (
                    <p className="mt-2 rounded border-2 border-current px-2 py-1 text-sm font-extrabold">
                      DEVELOPMENT TEST ONLY — NO REAL HAZARD REPORTED
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <div
                id="danger-alert-message"
                className="rounded-md border-2 border-red-700 p-3 dark:border-red-400"
              >
                <p className="font-semibold">
                  Move away from the affected area and follow official emergency instructions. Do
                  not enter floodwater or unstable slopes.
                </p>
                <p className="mt-2 text-sm">
                  {alert.isTest
                    ? "Simulated GPS accuracy: ±10 m. This test does not use your actual location."
                    : `GPS distance is approximate (±${Math.round(alert.accuracy)} m).`}
                </p>
              </div>

              <div className="space-y-3">
                {alert.hazards.map((hazard) => (
                  <article key={hazard.marker.id} className="rounded-md border p-3">
                    <h2 className="font-bold">{hazard.marker.kind.replaceAll("_", " ")} risk</h2>
                    <p className="mt-1 text-sm">{hazard.marker.title}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {distanceLabel(hazard.distance)} from your location
                    </p>
                    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-semibold">Severity</dt>
                        <dd>Not provided by the verified hazard report</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Source</dt>
                        <dd>{hazard.source}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-semibold">Last updated</dt>
                        <dd>
                          {hazard.lastUpdated
                            ? new Date(hazard.lastUpdated).toLocaleString()
                            : "Timestamp not available"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>

              {dataStale && (
                <p className="rounded-md border-2 border-amber-700 p-3 text-sm font-semibold text-amber-950 dark:border-amber-300 dark:text-amber-100">
                  Hazard information may be stale. Last successful sync: {sourceTimestamp}. New
                  hazards cannot be detected offline.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div aria-live="assertive" role="status" className="text-sm font-bold">
                  {remainingSeconds > 0
                    ? soundState === "playing"
                      ? `Alert sound: ${remainingSeconds}s remaining`
                      : soundState === "muted"
                        ? `Sound muted. Dismiss available in ${remainingSeconds}s.`
                        : soundState === "interrupted"
                          ? `Sound interrupted. Dismiss available in ${remainingSeconds}s.`
                          : `Sound unavailable or blocked. Dismiss available in ${remainingSeconds}s.`
                    : soundState === "blocked" || soundState === "unavailable"
                      ? "Sound did not play. Visual warning remains active."
                      : soundState === "muted"
                        ? "Sound muted. Visual warning remains active."
                        : soundState === "interrupted"
                          ? "Sound was interrupted. Visual warning remains active."
                          : "Sound alert window complete. Visual warning remains active."}
                </div>
                <div className="flex flex-wrap gap-2">
                  {soundState === "playing" && (
                    <Button type="button" variant="outline" onClick={muteSound}>
                      <VolumeX className="size-4" />
                      Mute sound
                    </Button>
                  )}
                  <Button
                    ref={dismissButton}
                    type="button"
                    variant="destructive"
                    disabled={remainingSeconds > 0}
                    onClick={dismiss}
                  >
                    Dismiss Alert
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
