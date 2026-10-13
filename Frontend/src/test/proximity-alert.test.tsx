import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarkerDetail } from "@/hooks/use-markers";
import { ProximityAlertMonitor } from "@/components/ProximityAlertMonitor";
import { findDangerZoneEntries } from "@/lib/danger-alert-utils";

const mocks = vi.hoisted(() => ({
  markerState: { items: [] as MarkerDetail[], hazardsLoading: false, hazardsError: false },
  online: true,
  syncedAt: new Date().toISOString(),
}));

vi.mock("@/hooks/use-markers", () => ({ useMarkers: () => mocks.markerState }));
vi.mock("@/hooks/use-data", () => ({
  useOnline: () => mocks.online,
  useReports: () => ({ isLoading: mocks.markerState.hazardsLoading }),
}));
vi.mock("@/services/offline", () => ({
  readCached: () => ({ syncedAt: mocks.syncedAt, value: [] }),
}));

const TEST_FIXTURE: MarkerDetail = {
  marker: {
    id: "test-flood-zone",
    kind: "flood",
    lat: 27.7,
    lng: 85.3,
    title: "TEST FIXTURE - simulated verified flood report",
    verified: true,
  },
  district: "Test district",
  description: "Development-only GPS fixture; not a real hazard.",
  source: "TEST FIXTURE",
  status: "verified",
  reportedAt: "2026-10-13T09:00:00.000Z",
  verifiedAt: "2026-10-13T09:00:00.000Z",
  isDemo: false,
};

let locationSuccess: ((position: GeolocationPosition) => void) | undefined;
let oscillatorStop: ReturnType<typeof vi.fn>;
let oscillatorCount: number;
let audioContextState: string;
let audioStateChange: (() => void) | null;

function createPosition(lat: number, lng: number, accuracy = 10): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

function installAudioContext() {
  oscillatorStop = vi.fn();
  oscillatorCount = 0;
  const FakeAudioContext = class {
    get state() {
      return audioContextState;
    }
    set onstatechange(handler: (() => void) | null) {
      audioStateChange = handler;
    }
    get onstatechange() {
      return audioStateChange;
    }
    currentTime = 12;
    destination = {};
    resume = vi.fn(() => Promise.resolve());
    close = vi.fn(() => Promise.resolve());
    createOscillator() {
      oscillatorCount += 1;
      return {
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: oscillatorStop,
        onended: null as (() => void) | null,
        type: "sine",
      } as unknown as OscillatorNode;
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
          setTargetAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as GainNode;
    }
  };
  Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
}

function enterTestZone() {
  if (!locationSuccess) throw new Error("The simulated GPS watcher was not started");
  act(() => locationSuccess?.(createPosition(TEST_FIXTURE.marker.lat, TEST_FIXTURE.marker.lng)));
}

describe("emergency proximity alerts (development GPS fixtures)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T10:00:00.000Z"));
    window.localStorage.removeItem("jalrakshak-proximity-alerts");
    mocks.markerState = { items: [TEST_FIXTURE], hazardsLoading: false, hazardsError: false };
    mocks.online = true;
    mocks.syncedAt = new Date().toISOString();
    locationSuccess = undefined;
    audioContextState = "running";
    audioStateChange = null;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: vi.fn((success: (position: GeolocationPosition) => void) => {
          locationSuccess = success;
          return 7;
        }),
        clearWatch: vi.fn(),
      },
    });
    installAudioContext();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("triggers on entry, ignores repeated fixes, and enables dismissal after five seconds", async () => {
    render(<ProximityAlertMonitor />);
    fireEvent.click(screen.getByRole("button", { name: /enable proximity alerts/i }));
    enterTestZone();
    await act(async () => Promise.resolve());

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/EMERGENCY: DANGER ZONE NEARBY/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss Alert" })).toBeDisabled();
    expect(oscillatorCount).toBe(1);
    expect(oscillatorStop).toHaveBeenCalledWith(17);

    enterTestZone();
    await act(async () => Promise.resolve());
    expect(oscillatorCount).toBe(1);

    act(() => vi.advanceTimersByTime(4900));
    expect(screen.getByRole("button", { name: "Dismiss Alert" })).toBeDisabled();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("button", { name: "Dismiss Alert" })).toBeEnabled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("does not alert outside the radius and re-arms after leaving and re-entering", async () => {
    render(<ProximityAlertMonitor />);
    fireEvent.click(screen.getByRole("button", { name: /enable proximity alerts/i }));
    act(() => locationSuccess?.(createPosition(27.72, 85.3)));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    enterTestZone();
    await act(async () => Promise.resolve());
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Alert" }));
    act(() => locationSuccess?.(createPosition(27.72, 85.3)));
    enterTestZone();
    await act(async () => Promise.resolve());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(oscillatorCount).toBe(2);
  });

  it("groups overlapping hazards into one popup and one sound", async () => {
    mocks.markerState.items = [
      TEST_FIXTURE,
      {
        ...TEST_FIXTURE,
        marker: {
          ...TEST_FIXTURE.marker,
          id: "test-landslide-zone",
          kind: "landslide",
          title: "TEST FIXTURE - landslide",
        },
      },
    ];
    render(<ProximityAlertMonitor />);
    fireEvent.click(screen.getByRole("button", { name: /enable proximity alerts/i }));
    enterTestZone();
    await act(async () => Promise.resolve());

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("landslide risk")).toBeInTheDocument();
    expect(oscillatorCount).toBe(1);
  });

  it("runs a clearly labeled development test through the same alert and sound flow", async () => {
    render(<ProximityAlertMonitor />);
    fireEvent.click(
      screen.getByRole("button", { name: "Test emergency alert (development only)" }),
    );
    await act(async () => Promise.resolve());

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/DEVELOPMENT TEST ONLY — NO REAL HAZARD REPORTED/)).toBeInTheDocument();
    expect(screen.getByText(/This test does not use your actual location/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss Alert" })).toBeDisabled();
    expect(oscillatorCount).toBe(1);
    expect(oscillatorStop).toHaveBeenCalledWith(17);
  });

  it("does not treat demo records as real hazards", () => {
    mocks.markerState.items = [{ ...TEST_FIXTURE, isDemo: true }];
    render(<ProximityAlertMonitor />);
    fireEvent.click(screen.getByRole("button", { name: /enable proximity alerts/i }));
    enterTestZone();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps the visual warning when audio is unavailable and labels stale offline data", () => {
    mocks.online = false;
    mocks.syncedAt = "2026-10-10T10:00:00.000Z";
    Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
    render(<ProximityAlertMonitor />);
    fireEvent.click(screen.getByRole("button", { name: /enable proximity alerts/i }));
    enterTestZone();

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/Sound unavailable or blocked/)).toBeInTheDocument();
    expect(screen.getByText(/New hazards cannot be detected offline/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss Alert" })).toBeDisabled();
  });

  it("stops and labels audio interrupted by the platform", async () => {
    render(<ProximityAlertMonitor />);
    fireEvent.click(screen.getByRole("button", { name: /enable proximity alerts/i }));
    enterTestZone();
    await act(async () => Promise.resolve());

    act(() => {
      audioContextState = "suspended";
      audioStateChange?.();
    });

    expect(screen.getByText(/Sound interrupted/)).toBeInTheDocument();
    expect(oscillatorStop).toHaveBeenLastCalledWith();
    expect(screen.getByRole("button", { name: "Dismiss Alert" })).toBeDisabled();
  });

  it("rejects low-accuracy fixes without changing the armed-zone set", () => {
    const previous = new Set<string>();
    const lowAccuracy = findDangerZoneEntries(
      [TEST_FIXTURE],
      { lat: TEST_FIXTURE.marker.lat, lng: TEST_FIXTURE.marker.lng },
      250,
      previous,
    );
    expect(lowAccuracy.entered).toHaveLength(0);
    expect(lowAccuracy.inside).toBe(previous);

    const outside = findDangerZoneEntries([TEST_FIXTURE], { lat: 27.72, lng: 85.3 }, 10, previous);
    expect(outside.entered).toHaveLength(0);
  });
});
