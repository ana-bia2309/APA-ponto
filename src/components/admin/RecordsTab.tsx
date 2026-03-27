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

export default function RecordsTab({ employees }: Props) {
  const [records, setRecords] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("today");
  const [customDate, setCustomDate] = useState(new Date().toISOString().split("T")[0]);

  // Admin correction state
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addStep, setAddStep] = useState("entrada");
  const [addDate, setAddDate] = useState(new Date().toISOString().split("T")[0]);
  const [addTime, setAddTime] = useState("08:00");
  const [addReason, setAddReason] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const getDateRange = useCallback((): { start: string; end: string } => {
    const today = new Date();
    if (quickFilter === "today") {
      const d = today.toISOString().split("T")[0];
      return { start: `${d}T00:00:00.000Z`, end: `${d}T23:59:59.999Z` };
    }
    if (quickFilter === "yesterday") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const d = y.toISOString().split("T")[0];
      return { start: `${d}T00:00:00.000Z`, end: `${d}T23:59:59.999Z` };
    }
    if (quickFilter === "week") {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return { start: w.toISOString(), end: today.toISOString() };
    }
    return { start: `${customDate}T00:00:00.000Z`, end: `${customDate}T23:59:59.999Z` };
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

      const mapped = (timeRes.data as TimeRecordRow[]).map((record) => {
        const display = mapTimeRecordToPunchRecord(record);
        if (punchRes.data) {
          const match = (punchRes.data as any[]).find(
            (p: any) => p.employee_id === record.employee_id && p.step === record.record_type &&
              Math.abs(new Date(p.punched_at).getTime() - new Date(record.recorded_at).getTime()) < 60000
          );
          if (match) {
            display.photo_url = match.photo_url || null;
            display.address = match.address || null;
          }
        }
        return display;
      });
      setRecords(mapped as PunchRecord[]);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar registros");
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Group by employee
  const grouped = records.reduce((acc, rec) => {
    const name = rec.employees?.name || "Desconhecido";
    if (!acc[name]) acc[name] = [];
    acc[name].push(rec);
    return acc;
  }, {} as Record<string, PunchRecord[]>);

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const deleteRecord = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    const { error } = await supabase.from("time_records").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }

    // Audit log
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

    // Audit log
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
          {Object.entries(grouped).map(([name, recs]) => (
            <Card key={name} className="p-4">
              <h3 className="font-semibold text-foreground mb-3">{name}</h3>
              <div className="space-y-2">
                {recs.map((rec) => {
                  const sync = SYNC_LABELS[rec.sync_status || "synced"] || SYNC_LABELS.synced;
                  return (
                    <div key={rec.id} className="flex items-start justify-between text-sm gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs font-medium">
                          {STEP_LABELS[rec.step] || rec.step}
                        </span>
                        <span className="text-foreground tabular-nums">{formatTime(rec.punched_at)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {MODE_LABELS[rec.mode || "online"] || rec.mode}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sync.className}`}>
                          {sync.label}
                        </span>
                        {rec.photo_url && (
                          <button onClick={async () => {
                            const { data } = await supabase.storage.from("punch-photos").createSignedUrl(rec.photo_url!, 300);
                            if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                          }} className="text-primary hover:text-primary/80" title="Ver foto">
                            <Camera className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {rec.address ? (
                          <a href={`https://maps.google.com/?q=${rec.latitude},${rec.longitude}`} target="_blank"
                            rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-[120px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{rec.address}</span>
                          </a>
                        ) : rec.latitude && rec.longitude ? (
                          <a href={`https://maps.google.com/?q=${rec.latitude},${rec.longitude}`} target="_blank"
                            rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{rec.latitude.toFixed(3)},{rec.longitude.toFixed(3)}
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
