import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, XCircle, User, Hash, Clock } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface TimeRecordWithEmployee {
  id: string;
  employee_id: string;
  record_type: string;
  recorded_at: string;
  mode: string;
  sync_status: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  employees?: { name: string; cpf: string | null } | null;
}

export default function DebugLogsTab() {
  const [records, setRecords] = useState<TimeRecordWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("time_records")
      .select("*, employees(name, cpf)")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  // Auto-refresh every 5s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLatest, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLatest]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };

  const maskCpf = (cpf: string | null) => {
    if (!cpf) return "—";
    const digits = cpf.replace(/\D/g, "");
    if (digits.length < 11) return cpf;
    return `${digits.slice(0, 3)}.***.*${digits.slice(8, 9)}*-${digits.slice(9)}`;
  };

  const STEP_LABELS: Record<string, string> = {
    entrada: "Entrada", intervalo: "Intervalo", retorno: "Retorno", saida: "Saída",
  };

  const STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
    synced: { icon: CheckCircle2, color: "text-emerald-500" },
    pending: { icon: Clock, color: "text-amber-500" },
    failed: { icon: XCircle, color: "text-destructive" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Hash className="w-5 h-5 text-primary" />
          Logs de Registro (Tempo Real)
        </h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto (5s)
          </label>
          <Button variant="outline" size="sm" onClick={fetchLatest} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <Card className="border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs text-amber-600 font-medium">
          ⚠ Aba temporária de debug — mostra os últimos 20 registros em time_records com CPF validado, funcionário encontrado e resultado do insert.
        </p>
      </Card>

      {records.length === 0 && !loading && (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
        </Card>
      )}

      <div className="space-y-2">
        {records.map((rec) => {
          const emp = Array.isArray(rec.employees) ? rec.employees[0] : rec.employees;
          const statusInfo = STATUS_ICONS[rec.sync_status] || STATUS_ICONS.synced;
          const StatusIcon = statusInfo.icon;

          return (
            <Card key={rec.id} className="p-3 border border-border/50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Funcionário */}
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {emp?.name || "Desconhecido"}
                    </span>
                  </div>

                  {/* CPF validado */}
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs text-muted-foreground font-mono">
                      CPF: {maskCpf(emp?.cpf ?? null)}
                    </span>
                  </div>

                  {/* Detalhes do registro */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {STEP_LABELS[rec.record_type] || rec.record_type}
                    </span>
                    <span>{formatTime(rec.recorded_at)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase font-medium">
                      {rec.mode}
                    </span>
                  </div>

                  {/* IDs para debug */}
                  <div className="text-[10px] font-mono text-muted-foreground/60 break-all">
                    employee_id: {rec.employee_id} · record_id: {rec.id.slice(0, 8)}…
                  </div>
                </div>

                {/* Status */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
                  <span className={`text-[10px] font-medium ${statusInfo.color}`}>
                    {rec.sync_status === "synced" ? "OK" : rec.sync_status}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}