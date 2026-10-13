import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DemoBadge, ErrorState, ListSkeleton, PageHeader, StatusBadge, VerifiedBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useAlerts, useApiMutation, useReports, useRescues, useShelters } from "@/hooks/use-data";
import { api } from "@/services/api";
import { useAuth } from "@/lib/auth";
import type { Shelter } from "@/lib/types";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin and verification — JalRakshak" }] }),
  component: Admin,
});

function Admin() {
  const { can } = useAuth();
  const reports = useReports();
  const rescues = useRescues();
  const alerts = useAlerts();
  const shelters = useShelters();
  const verify = useApiMutation(({ id, status }: { id: string; status: "verified" | "rejected" }) => api.verifyReport(id, status, "admin"), [["reports"]]);
  const updateRescue = useApiMutation(({ id, status }: { id: string; status: "under_review" | "assigned" | "in_progress" | "resolved" }) => api.updateRescueStatus(id, status, "admin"), [["rescues"]]);
  const updateShelter = useApiMutation(({ id, occupancy, food, water, medical }: { id: string; occupancy: number; food: boolean; water: boolean; medical: boolean }) => api.submitShelterUpdate(id, { occupancy, food, water, medical }, "admin"), [["shelters"]]);
  const verifyShelter = useApiMutation(({ id, verified }: { id: string; verified: boolean }) => api.verifyShelter(id, verified, "admin"), [["shelters"]]);
  const pending = useMemo(() => (reports.data ?? []).filter((r) => r.status === "unverified" || r.status === "under_review"), [reports.data]);
  if (!can("admin")) return <><PageHeader title="Admin and verification" /><main className="mx-auto max-w-2xl px-4 py-8 sm:px-6"><ErrorState message="Administrator access is required. Sign in with an authorized administrator account." /></main></>;
  if (reports.isLoading || rescues.isLoading || alerts.isLoading || shelters.isLoading) return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><ListSkeleton rows={5} /></main>;
  if (reports.isError || rescues.isError || alerts.isError || shelters.isError) return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><ErrorState onRetry={() => { void reports.refetch(); void rescues.refetch(); void alerts.refetch(); void shelters.refetch(); }} /></main>;
  return (
    <>
      <PageHeader title="Admin and verification" description="Hazard reports remain unverified until an administrator approves them. Server-side role checks remain authoritative." eyebrow={<DemoBadge />} />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3"><Metric label="Reports awaiting review" value={pending.length} /><Metric label="Rescue requests" value={rescues.data?.length ?? 0} /><Metric label="Alerts" value={alerts.data?.length ?? 0} /></div>
        <section className="card-surface space-y-3 p-5"><h2 className="font-semibold">Hazard reports awaiting admin approval</h2>{pending.length === 0 ? <p className="text-sm text-muted-foreground">No reports await admin approval.</p> : pending.map((report) => <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3"><div><p className="font-medium">{report.hazard} · {report.district}</p><p className="text-sm text-muted-foreground">{report.description}</p><StatusBadge status={report.status} /></div><div className="flex gap-2"><Button size="sm" disabled={verify.isPending} onClick={() => verify.mutate({ id: report.id, status: "verified" })}>Approve &amp; verify</Button><Button size="sm" variant="outline" disabled={verify.isPending} onClick={() => verify.mutate({ id: report.id, status: "rejected" })}>Reject</Button></div></div>)}</section>
        <section className="card-surface space-y-3 p-5"><h2 className="font-semibold">Rescue coordination</h2>{(rescues.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No rescue requests are visible.</p> : rescues.data?.map((rescue) => <div key={rescue.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3"><div><p className="font-medium">{rescue.reference} · {rescue.urgency}</p><p className="text-sm text-muted-foreground">{[rescue.district, rescue.municipality].filter(Boolean).join(" · ") || "GPS location provided"} · {rescue.description}</p>{rescue.medicalConcerns && <p className="text-sm text-muted-foreground">Medical concerns: {rescue.medicalConcerns}</p>}</div><div className="flex items-center gap-2"><StatusBadge status={rescue.status} /><select className="h-9 rounded-md border bg-background px-2 text-sm" value={rescue.status} onChange={(e) => updateRescue.mutate({ id: rescue.id, status: e.target.value as "under_review" | "assigned" | "in_progress" | "resolved" })}><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select><VerifiedBadge verified={rescue.isDemo === false} /></div></div>)}</section>
        <section className="card-surface space-y-3 p-5"><h2 className="font-semibold">Shelter verification and updates</h2>{(shelters.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No shelters are available.</p> : shelters.data?.map((shelter) => <ShelterRow key={shelter.id} shelter={shelter} saving={updateShelter.isPending || verifyShelter.isPending} onSave={(patch) => updateShelter.mutate({ id: shelter.id, ...patch })} onVerify={() => verifyShelter.mutate({ id: shelter.id, verified: !shelter.verified })} />)}</section>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="card-surface p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>; }

function ShelterRow({ shelter, saving, onSave, onVerify }: { shelter: Shelter; saving: boolean; onSave: (patch: Pick<Shelter, "occupancy" | "food" | "water" | "medical">) => void; onVerify: () => void }) {
  const [occupancy, setOccupancy] = useState(shelter.occupancy ?? 0);
  const [food, setFood] = useState(shelter.food);
  const [water, setWater] = useState(shelter.water);
  const [medical, setMedical] = useState(shelter.medical);
  return <div className="grid gap-3 border-t py-3 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-medium">{shelter.name}</p><p className="text-sm text-muted-foreground">{shelter.district} · capacity {shelter.capacity ?? "not reported"}</p><VerifiedBadge verified={shelter.verified} /></div><div className="flex flex-wrap items-center gap-2 text-sm"><label>Occupancy <input className="h-9 w-20 rounded-md border bg-background px-2" type="number" min={0} max={shelter.capacity ?? undefined} value={occupancy} onChange={(e) => setOccupancy(Number(e.target.value))} /></label><label><input type="checkbox" checked={food} onChange={(e) => setFood(e.target.checked)} /> Food</label><label><input type="checkbox" checked={water} onChange={(e) => setWater(e.target.checked)} /> Water</label><label><input type="checkbox" checked={medical} onChange={(e) => setMedical(e.target.checked)} /> Medical</label><Button size="sm" disabled={saving} onClick={() => onSave({ occupancy, food, water, medical })}>Save</Button><Button size="sm" variant="outline" disabled={saving} onClick={onVerify}>{shelter.verified ? "Unverify" : "Verify"}</Button></div></div>;
}
