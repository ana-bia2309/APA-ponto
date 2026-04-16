import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Clock, MapPin, Camera, RefreshCw, AlertTriangle,
  Pencil, Trash2, Plus, Calendar, X, Check
} from "lucide-react";
import { mapTimeRecordToPunchRecord, type DisplayPunchRecord, type TimeRecordRow } from "@/lib/time-records";
import { groupByEmployeeJourneys } from "@/lib/group-journeys";
import { PhotoModal } from "@/components/admin/PhotoModal";
import type { Tables } from "@/integrations/supabase/types";

type PunchRecord = DisplayPunchRecord & { employees?: { name: string } };
type Employee = Tables<"employees">;

const STEP_LABELS: Record<string, string> = {
  entrada: "Entrada", intervalo: "Intervalo", retorno: "Retorno", saida: "Saída",
};

const MODE_LABELS: Record<string, string> = {
  online: "Online", offline: "Offline", manual: "Manual",
};

const SYNC_LABELS: Record<string, { label: string; className: string }> = {
  synced: { label: "Sincronizado", className: "bg-emerald-500/15 text-emerald-600" },
  pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-600" },
  failed: { label: "Falha", className: "bg-destructive/15 text-destructive" },
};

type QuickFilter = "today" | "yesterday" | "week" | "custom";

interface Props {
  employees: Employee[];
}

/** Reverse geocode using Nominatim (free, no key needed) */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.display_name) return null;
    // Use detailed address fields including building/amenity names
    const addr = data.address || {};
    const parts = [
      addr.building || addr.amenity || addr.office || addr.shop || addr.tourism || addr.leisure,
      addr.road || addr.pedestrian,
      addr.house_number ? `nº ${addr.house_number}` : null,
      addr.neighbourhood || addr.suburb || addr.city_district,
      addr.city || addr.town || addr.village,
      addr.state,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : data.display_name;
  } catch {
    return null;
  }
}

export default function RecordsTab({ employees }: Props) {
  const [records, setRecords] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("today");
  const [customDate, setCustomDate] = useState(new Date().toISOString().split("T")[0]);

  // Photo modal state
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);

  // Resolved addresses cache (record id → address)
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});

  // Admin correction state
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addStep, setAddStep] = useState("entrada");
  const [addDate, setAddDate] = useState(new Date().toISOString().split("T")[0]);
  const [addTime, setAddTime] = useState("08:00");
  const [addReason, setAddReason] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const getDateRange = useCallback((): { start: string; end: string } => {
    // Use São Paulo timezone for date boundaries to correctly capture overnight journeys
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    const todayStr = spFormatter.format(now); // YYYY-MM-DD in São Paulo

    const toSPBoundary = (dateStr: string, time: string) => {
      // Convert São Paulo local date+time to UTC ISO string
      const dt = new Date(`${dateStr}T${time}-03:00`);
      return dt.toISOString();
    };

    if (quickFilter === "today") {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = spFormatter.format(yesterday);
      return { start: toSPBoundary(yesterdayStr, "00:00:00"), end: toSPBoundary(todayStr, "23:59:59") };
    }
    if (quickFilter === "yesterday") {
      const y1 = new Date(now); y1.setDate(y1.getDate() - 1);
      const y2 = new Date(now); y2.setDate(y2.getDate() - 2);
      return { start: toSPBoundary(spFormatter.format(y2), "00:00:00"), end: toSPBoundary(spFormatter.format(y1), "23:59:59") };
    }
    if (quickFilter === "week") {
      const w = new Date(now); w.setDate(w.getDate() - 8);
      return { start: toSPBoundary(spFormatter.format(w), "00:00:00"), end: toSPBoundary(todayStr, "23:59:59") };
    }
    // Custom date
    const prev = new Date(customDate + "T12:00:00"); // noon to avoid DST edge
    prev.setDate(prev.getDate() - 1);
    const prevStr = spFormatter.format(prev);
    return { start: toSPBoundary(prevStr, "00:00:00"), end: toSPBoundary(customDate, "23:59:59") };
  }, [quickFilter, customDate]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDateRange();

      const [timeRes, punchRes] = await Promise.all([
        (supabase as any).from("time_records").select("*, employees(name)")
          .gte("recorded_at", start).lte("recorded_at", end)
          .order("recorded_at", { ascending: false }),
        (supabase as any).from("punch_records").select("employee_id, step, photo_url, address, punched_at")
          .gte("punched_at", start).lte("punched_at", end),
      ]);

      if (timeRes.error) throw new Error(timeRes.error.message);

      const mapped = (timeRes.data as (TimeRecordRow & { address?: string | null })[]).map((record) => {
        const display = mapTimeRecordToPunchRecord(record);
        // Use address from time_records if available
        if (record.address) {
          display.address = record.address;
        }
        if (punchRes.data) {
          const match = (punchRes.data as any[]).find(
            (p: any) => p.employee_id === record.employee_id && p.step === record.record_type &&
              Math.abs(new Date(p.punched_at).getTime() - new Date(record.recorded_at).getTime()) < 60000
          );
          if (match) {
            display.photo_url = match.photo_url || null;
            if (!display.address && match.address) {
              display.address = match.address;
            }
          }
        }
        return display;
      });
      setRecords(mapped as PunchRecord[]);

      // Resolve addresses for records with coordinates but no address
      resolveAddresses(mapped as PunchRecord[]);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar registros");
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  /** Batch resolve addresses for records with coords but no address */
  const resolveAddresses = useCallback(async (recs: PunchRecord[]) => {
    const toResolve = recs.filter(
      (r) => !r.address && r.latitude && r.longitude
    );
    if (toResolve.length === 0) return;

    // Deduplicate by rough coordinates to avoid hitting Nominatim rate limit
    const seen = new Set<string>();
    const unique: PunchRecord[] = [];
    for (const r of toResolve) {
      const key = `${r.latitude!.toFixed(4)},${r.longitude!.toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    // Resolve sequentially (Nominatim 1 req/sec limit)
    const newAddresses: Record<string, string> = {};
    for (const r of unique.slice(0, 10)) {
      const addr = await reverseGeocode(r.latitude!, r.longitude!);
      if (addr) {
        const key = `${r.latitude!.toFixed(4)},${r.longitude!.toFixed(4)}`;
        newAddresses[key] = addr;

        // Persist address back to time_records
        (supabase as any).from("time_records")
          .update({ address: addr })
          .eq("id", r.id)
          .then(() => {});
      }
      // Rate limit
      await new Promise((res) => setTimeout(res, 1100));
    }

    // Map resolved addresses to all matching records
    const resolved: Record<string, string> = {};
    for (const r of toResolve) {
      const key = `${r.latitude!.toFixed(4)},${r.longitude!.toFixed(4)}`;
      if (newAddresses[key]) {
        resolved[r.id] = newAddresses[key];
      }
    }

    if (Object.keys(resolved).length > 0) {
      setResolvedAddresses((prev) => ({ ...prev, ...resolved }));
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Group by employee → journeys
  const grouped = groupByEmployeeJourneys(records as (PunchRecord & { employees?: { name: string } })[]);

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const openPhoto = async (photoUrl: string) => {
    setPhotoLoading(true);
    setPhotoModalOpen(true);
    try {
      let path = photoUrl;
      const prefix = "/storage/v1/object/public/punch-photos/";
      const idx = path.indexOf(prefix);
      if (idx !== -1) path = decodeURIComponent(path.substring(idx + prefix.length));
      const { data } = await supabase.storage.from("punch-photos").createSignedUrl(path, 300);
      if (data?.signedUrl) {
        setPhotoModalUrl(data.signedUrl);
      } else {
        toast.error("Erro ao gerar link da foto");
        setPhotoModalOpen(false);
      }
    } catch {
      toast.error("Erro ao carregar foto");
      setPhotoModalOpen(false);
    } finally {
      setPhotoLoading(false);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    const { error } = await supabase.from("time_records").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      admin_user_id: user?.id, action: "delete_time_record", target_type: "time_records",
      target_id: id, details: { reason: "Admin manual deletion" },
    } as any);

    toast.success("Registro excluído");
    fetchRecords();
  };

  const addManualRecord = async () => {
    if (!addEmployeeId || !addReason.trim()) {
      toast.error("Selecione funcionário e informe justificativa");
      return;
    }
    setAddLoading(true);
    const recordedAt = new Date(`${addDate}T${addTime}:00`).toISOString();
    const { error } = await (supabase as any).from("time_records").insert({
      employee_id: addEmployeeId,
      record_type: addStep,
      recorded_at: recordedAt,
      mode: "manual",
      sync_status: "synced",
    });

    if (error) { toast.error("Erro ao inserir registro"); setAddLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const emp = employees.find(e => e.id === addEmployeeId);
    await supabase.from("audit_logs").insert({
      admin_user_id: user?.id, action: "admin_manual_punch", target_type: "time_records",
      target_id: addEmployeeId,
      details: { employee_name: emp?.name, step: addStep, recorded_at: recordedAt, reason: addReason },
    } as any);

    toast.success("Registro adicionado com sucesso");
    setShowAddRecord(false);
    setAddReason("");
    setAddLoading(false);
    fetchRecords();
  };

  /** Get the display address for a record */
  const getAddress = (rec: PunchRecord): string | null => {
    if (rec.address) return rec.address;
    if (resolvedAddresses[rec.id]) return resolvedAddresses[rec.id];
    return null;
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchRecords}>
          <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {([
          { key: "today" as const, label: "Hoje" },
          { key: "yesterday" as const, label: "Ontem" },
          { key: "week" as const, label: "Semana" },
          { key: "custom" as const, label: "Data" },
        ]).map((f) => (
          <Button key={f.key} variant={quickFilter === f.key ? "default" : "outline"} size="sm"
            onClick={() => setQuickFilter(f.key)}>
            {f.label}
          </Button>
        ))}
        {quickFilter === "custom" && (
          <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="w-40" />
        )}
        <Button variant="ghost" size="sm" onClick={fetchRecords} className="ml-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAddRecord(!showAddRecord)}>
          <Plus className="w-4 h-4 mr-1" /> Correção
        </Button>
      </div>

      {/* Admin manual correction form */}
      {showAddRecord && (
        <Card className="p-4 border-primary/30">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Correção manual de ponto
          </h4>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select value={addEmployeeId} onChange={(e) => setAddEmployeeId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm col-span-2">
              <option value="">Selecionar funcionário</option>
              {employees.filter(e => e.active).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <select value={addStep} onChange={(e) => setAddStep(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="entrada">Entrada</option>
              <option value="intervalo">Intervalo</option>
              <option value="retorno">Retorno</option>
              <option value="saida">Saída</option>
            </select>
            <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
            <Input type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)} />
          </div>
          <Textarea placeholder="Justificativa obrigatória..." value={addReason}
            onChange={(e) => setAddReason(e.target.value)} rows={2} className="mb-2" />
          <div className="flex gap-2">
            <Button size="sm" onClick={addManualRecord} disabled={addLoading}>
              <Check className="w-4 h-4 mr-1" /> Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddRecord(false)}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* Records */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 animate-pulse"><div className="h-12 bg-muted rounded" /></Card>
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum registro neste período</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([name, journeys]) => (
            <Card key={name} className="p-4">
              <h3 className="font-semibold text-foreground mb-3">{name}</h3>
              <div className="space-y-4">
                {journeys.map((journey, ji) => (
                  <div key={ji} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground capitalize">{journey.label}</span>
                      {(() => {
                        // Check if journey spans multiple days
                        const first = new Date(journey.records[0].punched_at);
                        const last = new Date(journey.records[journey.records.length - 1].punched_at);
                        if (first.toDateString() !== last.toDateString()) {
                          return (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                              Jornada noturna
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {!journey.complete && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-medium">Jornada aberta</span>
                      )}
                    </div>
                    {journey.records.map((rec) => {
                      const sync = SYNC_LABELS[(rec as any).sync_status || "synced"] || SYNC_LABELS.synced;
                      const address = getAddress(rec as PunchRecord);
                      return (
                        <div key={rec.id} className="flex items-start justify-between text-sm gap-2 pl-3 border-l-2 border-border">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs font-medium">
                              {STEP_LABELS[rec.step] || rec.step}
                            </span>
                            <span className="text-foreground tabular-nums">{formatTime(rec.punched_at)}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {MODE_LABELS[(rec as any).mode || "online"] || (rec as any).mode}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sync.className}`}>
                              {sync.label}
                            </span>
                            {(rec as any).photo_url && (
                              <button onClick={() => openPhoto((rec as any).photo_url!)}
                                className="text-primary hover:text-primary/80" title="Ver foto">
                                <Camera className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {address ? (
                              <a href={`https://maps.google.com/?q=${(rec as any).latitude},${(rec as any).longitude}`} target="_blank"
                                rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-[200px]">
                                <MapPin className="w-3 h-3 flex-shrink-0 text-primary" /><span className="truncate">{address}</span>
                              </a>
                            ) : (rec as any).latitude && (rec as any).longitude ? (
                              <a href={`https://maps.google.com/?q=${(rec as any).latitude},${(rec as any).longitude}`} target="_blank"
                                rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                                <MapPin className="w-3 h-3" />{(rec as any).latitude.toFixed(3)},{(rec as any).longitude.toFixed(3)}
                              </a>
                            ) : null}
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => deleteRecord(rec.id)} title="Excluir">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {ji < journeys.length - 1 && <hr className="border-border" />}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Photo Modal */}
      <PhotoModal
        open={photoModalOpen}
        onClose={() => { setPhotoModalOpen(false); setPhotoModalUrl(null); }}
        photoUrl={photoModalUrl}
        loading={photoLoading}
      />
    </div>
  );
}
