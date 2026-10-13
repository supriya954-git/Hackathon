import { createFileRoute } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LocateFixed, Save, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DemoBadge, ErrorState, Notice, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, type NewReport } from "@/services/api";
import { clearDraft, readDraft, writeDraft } from "@/services/drafts";
import { DISTRICTS } from "@/services/mock-data";
import { useOnline } from "@/hooks/use-data";
import { useI18n } from "@/lib/i18n";
import type { HazardType } from "@/lib/types";
import { LazyMap } from "@/components/map/LazyMap";

export const Route = createFileRoute("/report-hazard")({
  head: () => ({ meta: [{ title: "Report a hazard — JalRakshak" }] }),
  component: ReportHazard,
});

const hazards: HazardType[] = ["flood", "river_rise", "landslide", "blocked_road", "damaged_bridge", "damaged_home", "infrastructure", "other"];
const schema = z.object({
  hazard: z.enum(["flood", "river_rise", "landslide", "blocked_road", "damaged_bridge", "damaged_home", "infrastructure", "other"]),
  district: z.string().min(1, "Required"),
  municipality: z.string().min(1, "Required"),
  latitude: z.preprocess((value) => value === "" || value === undefined || (typeof value === "number" && Number.isNaN(value)) ? undefined : Number(value), z.number().min(-90).max(90).optional()),
  longitude: z.preprocess((value) => value === "" || value === undefined || (typeof value === "number" && Number.isNaN(value)) ? undefined : Number(value), z.number().min(-180).max(180).optional()),
  description: z.string().min(10).max(2000),
  observedAt: z.string().min(1, "Required"),
  hasImage: z.boolean(),
}).superRefine((values, context) => {
  if ((values.latitude === undefined) !== (values.longitude === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["latitude"], message: "Enter both coordinates or leave both blank" });
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["longitude"], message: "Enter both coordinates or leave both blank" });
  }
});
type FormValues = z.infer<typeof schema>;
const defaults: FormValues = { hazard: "flood", district: "", municipality: "", latitude: undefined, longitude: undefined, description: "", observedAt: new Date().toISOString().slice(0, 16), hasImage: false };

function ReportHazard() {
  const { t } = useI18n();
  const online = useOnline();
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.createReport>> | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [evidence, setEvidence] = useState<File | undefined>();
  const [locationState, setLocationState] = useState<"idle" | "loading" | "captured" | "error">("idle");
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const { register, handleSubmit, getValues, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { ...defaults, ...readDraft<FormValues>("report-hazard") } });
  const latitude = watch("latitude");
  const longitude = watch("longitude");
  const selectedLocation = typeof latitude === "number" && typeof longitude === "number" ? { lat: latitude, lng: longitude } : null;
  useEffect(() => { if (readDraft<FormValues>("report-hazard")) setDraftSaved(true); }, []);
  const save = () => { writeDraft("report-hazard", getValues()); setDraftSaved(true); };
  const clear = () => { clearDraft("report-hazard"); reset(defaults); setDraftSaved(false); };
  const submit = async (values: FormValues) => {
    setServiceError(null);
    try {
      if (evidence && (evidence.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(evidence.type))) throw new Error(t("form.invalidEvidence"));
      const created = await api.createReport({ hazard: values.hazard, district: values.district, municipality: values.municipality, ...(values.latitude !== undefined && values.longitude !== undefined ? { location: { lat: values.latitude, lng: values.longitude } } : {}), description: values.description, observedAt: new Date(values.observedAt).toISOString(), evidence });
      clearDraft("report-hazard");
      setDraftSaved(false);
      setResult(created);
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : t("common.error"));
    }
  };
  const captureLocation = () => {
    setLocationMessage(null);
    if (!window.isSecureContext) { setLocationState("error"); setLocationMessage(t("form.locationSecure")); return; }
    if (!navigator.geolocation) { setLocationState("error"); setLocationMessage(t("form.locationUnsupported")); return; }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => { setValue("latitude", position.coords.latitude, { shouldValidate: true, shouldDirty: true }); setValue("longitude", position.coords.longitude, { shouldValidate: true, shouldDirty: true }); setLocationState("captured"); },
      (error) => { setLocationState("error"); setLocationMessage(error.code === error.PERMISSION_DENIED ? t("form.locationDenied") : error.code === error.TIMEOUT ? t("form.locationTimeout") : t("form.locationUnavailable")); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  const adjustLocation = (location: { lat: number; lng: number }) => { setValue("latitude", Number(location.lat.toFixed(6)), { shouldValidate: true, shouldDirty: true }); setValue("longitude", Number(location.lng.toFixed(6)), { shouldValidate: true, shouldDirty: true }); setLocationState("captured"); setLocationMessage(null); };
  if (result) return <Success onAgain={() => { setResult(null); reset(defaults); }} />;
  return (
    <>
      <PageHeader title={t("page.reportHazard")} description={t("home.demoNotice")} eyebrow={<DemoBadge />} />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <Notice tone="info">{t("banner.official")}</Notice>
        {!online && <Notice tone="warning">{t("form.notSubmitted")}</Notice>}
        {draftSaved && <Notice tone="info">{t("form.savedLocal")}</Notice>}
        {serviceError && <ErrorState message={serviceError} />}
        <form className="card-surface space-y-5 p-5" onSubmit={handleSubmit(submit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("form.hazard")} error={errors.hazard?.message}><select className="h-10 rounded-md border bg-background px-3" {...register("hazard")}>{hazards.map((h) => <option key={h} value={h}>{t(`hz.${h}` as Parameters<typeof t>[0])}</option>)}</select></Field>
            <Field label={t("form.observedAt")} error={errors.observedAt?.message}><Input type="datetime-local" {...register("observedAt")} /></Field>
            <Field label={t("form.district")} error={errors.district?.message}><select className="h-10 rounded-md border bg-background px-3" {...register("district")}><option value="">{t("form.choose")}</option>{DISTRICTS.map((d) => <option key={d.district} value={d.district}>{d.district}</option>)}</select></Field>
            <Field label={t("form.municipality")} error={errors.municipality?.message}><Input {...register("municipality")} /></Field>
            <Field label={t("form.latitude")} error={errors.latitude?.message}><Input type="number" step="0.000001" {...register("latitude")} /></Field>
            <Field label={t("form.longitude")} error={errors.longitude?.message}><Input type="number" step="0.000001" {...register("longitude")} /></Field>
          </div>
          <Field label={t("form.description")} error={errors.description?.message}><Textarea rows={6} {...register("description")} /></Field>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={captureLocation} disabled={locationState === "loading"}><LocateFixed />{locationState === "loading" ? t("form.locationLoading") : t("form.useLocation")}</Button>
            <span className="self-center text-xs text-muted-foreground">{t("form.locationPurpose")}</span>
            <label className="grid gap-1 text-sm"><span>{t("report.photo")}</span><Input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setEvidence(event.target.files?.[0])} /><span className="text-xs text-muted-foreground">{evidence?.name ?? t("form.noEvidence")}</span></label>
          </div>
          <div className="space-y-3 rounded-lg border p-4" aria-labelledby="incident-location-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 id="incident-location-heading" className="font-semibold">{t("form.incidentLocation")}</h2><p className="text-xs text-muted-foreground">{t("form.incidentLocationHelp")}</p></div>
              {selectedLocation && <div className="flex items-center gap-2 text-xs text-success" role="status" aria-live="polite"><CheckCircle2 className="size-4" />{locationState === "captured" ? t("form.locationCaptured") : t("form.locationSelected")}</div>}
            </div>
            {locationMessage && <p role="alert" aria-live="assertive" className="text-sm text-destructive">{locationMessage}</p>}
            {selectedLocation ? <><div className="rounded-md border bg-muted/30 p-3"><p className="text-sm font-medium">{t("form.selectedCoordinates")}</p><p className="mt-1 font-mono text-sm" aria-label={t("form.selectedCoordinates")}>{selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}</p></div><div className="h-64 overflow-hidden rounded-md border" role="application" aria-label={t("form.mapPreview")}><LazyMap markers={[]} userLocation={selectedLocation} target={{ ...selectedLocation, zoom: 12 }} selectable onLocationSelect={adjustLocation} /></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={captureLocation} disabled={locationState === "loading"}><LocateFixed />{t("form.recaptureLocation")}</Button><Button type="button" variant="ghost" size="sm" onClick={() => { setValue("latitude", undefined, { shouldDirty: true }); setValue("longitude", undefined, { shouldDirty: true }); setLocationState("idle"); setLocationMessage(null); }}><X />{t("form.clearLocation")}</Button></div></> : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t("form.locationOptional")}</p>}
            <p className="text-xs text-muted-foreground">{t("form.adjustLocation")}</p>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><div className="flex gap-2"><Button type="button" variant="outline" onClick={save}><Save />{t("form.saveDraft")}</Button><Button type="button" variant="ghost" onClick={clear}><Trash2 />{t("form.clearDraft")}</Button></div><Button type="submit" disabled={isSubmitting}>{isSubmitting ? t("common.loading") : t("form.submit")}</Button></div>
        </form>
      </main>
    </>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-medium">{label}{children}{error && <span className="text-xs font-normal text-destructive">{error}</span>}</label>; }
function Success({ onAgain }: { onAgain: () => void }) { const { t } = useI18n(); return <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6"><div className="card-surface p-8 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h1 className="mt-4 text-2xl font-bold">{t("report.confirmation")}</h1><p className="mt-4 text-sm font-medium">{t("report.pendingApproval")}</p><p className="mt-2 text-sm text-muted-foreground">{t("home.demoNotice")}</p><Button className="mt-6" onClick={onAgain}>{t("page.newRequest")}</Button></div></main>; }
