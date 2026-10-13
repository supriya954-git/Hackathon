import { createFileRoute, Link } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, LocateFixed, MapPin, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DemoBadge, ErrorState, Notice, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, type NewRescue } from "@/services/api";
import { clearDraft, readDraft, writeDraft } from "@/services/drafts";
import { fileToDataUrl, queueRescue } from "@/services/offline";
import { useI18n, type TKey } from "@/lib/i18n";
import { useOnline } from "@/hooks/use-data";
import { LazyMap } from "@/components/map/LazyMap";

export const Route = createFileRoute("/request-help")({
  head: () => ({ meta: [{ title: "Request emergency help — JalRakshak" }] }),
  component: RequestHelp,
});

export const requestHelpSchema = z.object({
  category: z.enum(["immediate_rescue", "evacuation", "medical", "stranded_family", "food_water", "shelter", "other"]),
  urgency: z.enum(["immediate_danger", "urgent", "standard"]),
  name: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  contactMethod: z.enum(["phone", "sms", "none"]),
  people: z.coerce.number().int().min(1).max(10000),
  description: z.string().max(2000).optional(),
  medicalConcerns: z.string().max(1000).optional(),
  hasImage: z.boolean(),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
});

type FormValues = z.infer<typeof requestHelpSchema>;
const defaults: FormValues = { category: "immediate_rescue", urgency: "immediate_danger", name: "", phone: "", contactMethod: "phone", people: 1, description: "", medicalConcerns: "", hasImage: false };

function RequestHelp() {
  const { t } = useI18n();
  const online = useOnline();
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.createRescueRequest>> | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [evidence, setEvidence] = useState<File | undefined>();
  const [locationState, setLocationState] = useState<"idle" | "loading" | "captured" | "error">("loading");
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [queuedLocalId, setQueuedLocalId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [manualLocation, setManualLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [locationTimestamp, setLocationTimestamp] = useState<string | null>(null);
  const { register, handleSubmit, setValue, getValues, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(requestHelpSchema), defaultValues: { ...defaults, ...readDraft<FormValues>("request-help") } });
  const selectedLocation = watch("location") ?? manualLocation;

  useEffect(() => {
    const draft = readDraft<FormValues>("request-help");
    if (draft) setDraftSaved(true);
    captureLocation();
  }, []);

  const save = () => { writeDraft("request-help", getValues()); setDraftSaved(true); };
  const clear = () => { clearDraft("request-help"); reset(defaults); setDraftSaved(false); setManualLocation(null); setGpsAccuracy(null); setLocationTimestamp(null); setLocationState("idle"); setLocationMessage(null); };

  const setLocation = (lat: number, lng: number, accuracy?: number, timestamp?: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setLocationState("error");
      setLocationMessage(t("form.locationInvalid"));
      return;
    }
    const next = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    setValue("location", next, { shouldValidate: true, shouldDirty: true });
    setManualLocation(null);
    setGpsAccuracy(accuracy ?? null);
    setLocationTimestamp(timestamp ? new Date(timestamp).toISOString() : null);
    setLocationState("captured");
    setLocationMessage(null);
  };

  const captureLocation = () => {
    setLocationMessage(null);
    if (!window.isSecureContext) { setLocationState("error"); setLocationMessage(t("form.locationSecure")); return; }
    if (!navigator.geolocation) { setLocationState("error"); setLocationMessage(t("form.locationUnsupported")); return; }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp),
      (error) => {
        setLocationState("error");
        setLocationMessage(error.code === error.PERMISSION_DENIED ? t("form.locationDenied") : error.code === error.TIMEOUT ? t("form.locationTimeout") : t("form.locationUnavailable"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const submit = async (values: FormValues) => {
    setServiceError(null);
    const emergencyLocation = values.location ?? manualLocation;
    if (!emergencyLocation) {
      setLocationState("error");
      setLocationMessage("Location is required for an SOS request. Please allow GPS access or enter coordinates manually.");
      return;
    }

    try {
      const normalizedValues = {
        ...values,
        category: "immediate_rescue" as const,
        urgency: "immediate_danger" as const,
        people: 1,
        name: values.name?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        description: values.description?.trim() || "Emergency SOS request submitted from JalRakshak.",
        medicalConcerns: values.medicalConcerns?.trim() || undefined,
        location: emergencyLocation,
        hasImage: false,
      };

      if (evidence && (evidence.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(evidence.type))) throw new Error(t("form.invalidEvidence"));

      if (!online) {
        const localId = crypto.randomUUID();
        queueRescue({
          localId,
          createdAt: new Date().toISOString(),
          payload: normalizedValues as unknown as Record<string, unknown>,
          evidence: evidence ? { name: evidence.name, type: evidence.type, dataUrl: await fileToDataUrl(evidence) } : undefined,
        });
        setQueuedLocalId(localId);
        clearDraft("request-help");
        setDraftSaved(false);
        return;
      }

      const created = await api.createRescueRequest({ ...normalizedValues, evidence } as NewRescue);
      clearDraft("request-help");
      setDraftSaved(false);
      setResult(created);
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : t("common.error"));
    }
  };

  if (result) return <Success reference={result.reference} onAgain={() => { setResult(null); reset(defaults); setManualLocation(null); setGpsAccuracy(null); setLocationTimestamp(null); setLocationState("loading"); captureLocation(); }} />;

  return (
    <>
      <PageHeader title="EMERGENCY SOS" description="Need immediate assistance? Share your location and send an emergency request." eyebrow={<DemoBadge />} />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <Notice tone="danger" icon={<AlertTriangle className="size-5 text-destructive" />}><strong>Emergency request</strong><p className="mt-1">Send your current location to JalRakshak immediately. This does not confirm that official emergency services have been dispatched.</p></Notice>
        {!online && <Notice tone="warning">{t("form.notSubmitted")}</Notice>}
        {queuedLocalId && <Notice tone="info">Saved on this device with local ID {queuedLocalId}. It is pending delivery until you reconnect and retry.</Notice>}
        {draftSaved && <Notice tone="info">{t("form.savedLocal")}</Notice>}
        {serviceError && <ErrorState message={serviceError} />}

        <div className="card-surface space-y-5 p-5">
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/80 p-4 dark:border-red-900/60 dark:bg-red-950/30">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300"><MapPin className="size-4" /> Location status</div>
              <span className="text-xs font-medium text-red-700 dark:text-red-300">{locationState === "loading" ? "Getting GPS…" : locationState === "captured" ? "Location ready" : "Location unavailable"}</span>
            </div>
            {locationMessage && <p className="text-sm text-red-700 dark:text-red-300">{locationMessage}</p>}
            {selectedLocation ? (
              <div className="space-y-1">
                <p className="font-mono text-base font-semibold text-foreground">{selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}</p>
                {gpsAccuracy !== null && <p className="text-xs text-muted-foreground">GPS accuracy: ±{gpsAccuracy.toFixed(0)} m</p>}
                {locationTimestamp && <p className="text-xs text-muted-foreground">Last updated: {new Date(locationTimestamp).toLocaleString()}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for your current location…</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={captureLocation} disabled={locationState === "loading"}>
                <RefreshCw className={locationState === "loading" ? "animate-spin" : ""} /> Refresh location
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setLocationState("idle"); setLocationMessage(null); setValue("location", undefined, { shouldDirty: true }); setManualLocation(null); }}>
                <X /> Use manual location
              </Button>
            </div>
          </div>

          {selectedLocation && (
            <div className="h-52 overflow-hidden rounded-lg border">
              <LazyMap markers={[]} userLocation={selectedLocation} target={{ ...selectedLocation, zoom: 12 }} selectable onLocationSelect={({ lat, lng }) => { setLocation(lat, lng); }} />
            </div>
          )}

          <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
            <Field label="Latitude" error={errors.location?.lat?.message}>
              <Input type="number" step="0.000001" value={selectedLocation?.lat ?? ""} onChange={(event) => {
                const value = event.target.value;
                if (value === "") {
                  setValue("location", undefined, { shouldDirty: true });
                  setManualLocation(null);
                  return;
                }
                const lat = Number(value);
                const lng = selectedLocation?.lng ?? manualLocation?.lng ?? 0;
                setManualLocation({ lat, lng });
                setValue("location", { lat, lng }, { shouldValidate: true, shouldDirty: true });
                setLocationState("captured");
                setLocationMessage(null);
              }} />
            </Field>
            <Field label="Longitude" error={errors.location?.lng?.message}>
              <Input type="number" step="0.000001" value={selectedLocation?.lng ?? ""} onChange={(event) => {
                const value = event.target.value;
                if (value === "") {
                  setValue("location", undefined, { shouldDirty: true });
                  setManualLocation(null);
                  return;
                }
                const lng = Number(value);
                const lat = selectedLocation?.lat ?? manualLocation?.lat ?? 0;
                setManualLocation({ lat, lng });
                setValue("location", { lat, lng }, { shouldValidate: true, shouldDirty: true });
                setLocationState("captured");
                setLocationMessage(null);
              }} />
            </Field>
          </div>

          <Button type="button" size="lg" variant="sos" className="w-full rounded-xl py-5 text-base font-bold" onClick={handleSubmit(submit)} disabled={isSubmitting || locationState === "loading"}>
            {isSubmitting ? "Sending SOS..." : "SEND SOS REQUEST"}
          </Button>

          <div className="border-t pt-4">
            <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setShowDetails((current) => !current)}>
              {showDetails ? "Hide additional details" : "Add more details"}
            </button>
            {showDetails && (
              <form className="mt-4 space-y-4" onSubmit={handleSubmit(submit)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("form.name")} error={errors.name?.message}><Input {...register("name")} /></Field>
                  <Field label={t("form.phone")} error={errors.phone?.message}><Input type="tel" {...register("phone")} /></Field>
                  <Field label={t("form.category")} error={errors.category?.message}><select className="h-10 rounded-md border bg-background px-3" {...register("category")}>{(["immediate_rescue", "evacuation", "medical", "stranded_family", "food_water", "shelter", "other"] as const).map((v) => <option key={v} value={v}>{t(`category.${v}` as TKey)}</option>)}</select></Field>
                  <Field label={t("form.contactMethod")} error={errors.contactMethod?.message}><select className="h-10 rounded-md border bg-background px-3" {...register("contactMethod")}>{(["phone", "sms", "none"] as const).map((v) => <option key={v} value={v}>{t(`form.contact${v[0].toUpperCase()}${v.slice(1)}` as TKey)}</option>)}</select></Field>
                  <Field label={t("form.people")} error={errors.people?.message}><Input type="number" min={1} {...register("people")} /></Field>
                  <Field label={t("form.urgency")} error={errors.urgency?.message}><select className="h-10 rounded-md border bg-background px-3" {...register("urgency")}>{(["immediate_danger", "urgent", "standard"] as const).map((v) => <option key={v} value={v}>{t(`urgency.${v}` as TKey)}</option>)}</select></Field>
                </div>
                <Field label={t("form.description")} error={errors.description?.message}><Textarea rows={4} {...register("description")} /></Field>
                <Field label={t("form.medicalConcerns")} error={errors.medicalConcerns?.message}><Textarea rows={3} {...register("medicalConcerns")} /></Field>
                <label className="grid gap-1 text-sm font-medium">{t("report.photo")}<Input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setEvidence(event.target.files?.[0])} /><span className="text-xs text-muted-foreground">{evidence?.name ?? t("form.noEvidence")}</span></label>
                <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={save}><Save />{t("form.saveDraft")}</Button>
                    <Button type="button" variant="ghost" onClick={clear}><Trash2 />{t("form.clearDraft")}</Button>
                  </div>
                  <Button type="submit" variant="sos" disabled={isSubmitting}>{isSubmitting ? t("common.loading") : "Submit with details"}</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-medium">{label}{children}{error && <span className="text-xs font-normal text-destructive">{error}</span>}</label>; }
function Success({ reference, onAgain }: { reference: string; onAgain: () => void }) { const { t } = useI18n(); return <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6"><div className="card-surface p-8 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h1 className="mt-4 text-2xl font-bold">SOS submitted</h1><p className="mt-4 text-muted-foreground">Your emergency request was submitted to JalRakshak. This confirms the request was received by the JalRakshak system, not that an external emergency service has been dispatched.</p><p className="mt-1 text-3xl font-bold text-teal">{reference}</p><p className="mt-4 text-sm text-muted-foreground">{t("home.demoNotice")}</p><div className="mt-6 flex justify-center gap-2"><Button onClick={onAgain}>New SOS</Button><Button variant="outline" asChild><Link to="/track">{t("nav.track")}</Link></Button></div></div></main>; }
