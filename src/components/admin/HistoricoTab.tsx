import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, History, Clock, User, FileText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface AuditLog {
  id: string;
  user_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  details: any;
  created_at: string;
}

interface TimeRecord {
  id: string;
  employee_id: string;
  record_type: string;
  recorded_at: string;
  mode: string;
  address?: string;
}

interface TimesheetClosing {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  status: string;
  closed_at: string | null;
  closed_by: string | null;
  accepted_at: string | null;
}

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const ACTION_LABELS: Record<string, string> = {
  approve_justification: "Aprovou atestado",
  reject_justification: "Desaprovou atestado",
  delete_time_record: "Excluiu registro de ponto",
  admin_manual_punch: "Correção manual de ponto",
  update_employee: "Editou funcionário",
  delete_employee: "Excluiu funcionário",
  toggle_employee: "Ativou/desativou funcionário",
  create_employee: "Cadastrou funcionário",
  epi_delivered: "Entregou EPI",
  payroll_period_closed: "Fechou folha",
  payroll_period_reopened: "Reabriu folha",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function HistoricoTab({ employees }: { employees: Employee[] }) {
  const [subTab, setSubTab] = useState<"ponto" | "espelhos" | "alteracoes">("ponto");
  const [selectedId, setSelectedId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  // Ponto por dia
  const [pontoRecords, setPontoRecords] = useState<TimeRecord[]>([]);

  // Espelhos
  const [espelhos, setEspelhos] = useState<TimesheetClosing[]>([]);

  // Alterações
  const [alteracoes, setAlteracoes] = useState<AuditLog[]>([]);

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  const loadPonto = useCallback(async () => {
    if (!selectedId || !selectedDate) return;
    setLoading(true);
    try {
      const start = `${selectedDate}T00:00:00`;
      const end = `${selectedDate}T23:59:59`;
      const { data } = await (supabase as any)
        .from("time_records")
        .select("id, employee_id, record_type, recorded_at, mode, address")
        .eq("employee_id", selectedId)
        .gte("recorded_at", start)
        .lte("recorded_at", end)
        .order("recorded_at", { ascending: true });
      setPontoRecords(data || []);
    } catch {}
    finally { setLoading(false); }
  }, [selectedId, selectedDate]);

  const loadEspelhos = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("timesheet_closings")
        .select("*")
        .eq("employee_id", selectedId)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      setEspelhos(data || []);
    } catch {}
    finally { setLoading(false); }
  }, [selectedId]);

  const loadAlteracoes = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const emp = employees.find(e => e.id === selectedId);
      const { data } = await (supabase as any)
        .from("audit_logs")
        .select("*")
        .or(`record_id.eq.${selectedId},details->>'employee_id'.eq.${selectedId}`)
        .order("created_at", { ascending: false })
        .limit(100);

      // também busca por nome
      const { data: byName } = emp ? await (supabase as any)
        .from("audit_logs")
        .select("*")
        .ilike("details->>'employee_name'", `%${emp.name}%`)
        .order("created_at", { ascending: false })
        .limit(50) : { data: [] };

      const all = [...(data || []), ...(byName || [])];
      const unique = Array.from(new Map(all.map((l: AuditLog) => [l.id, l])).values());
      setAlteracoes(unique.sort((a: AuditLog, b: AuditLog) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch {}
    finally { setLoading(false); }
  }, [selectedId, employees]);

  useEffect(() => {
    if (subTab === "ponto") loadPonto();
    else if (subTab === "espelhos") loadEspelhos();
    else if (subTab === "alteracoes") loadAlteracoes();
  }, [subTab, loadPonto, loadEspelhos, loadAlteracoes]);

  const STEP_LABELS: Record<string, string> = {
    entrada: "Entrada", intervalo: "Intervalo", retorno: "Retorno", saida: "Saída",
  };
  const STEP_COLORS: Record<string, string> = {
    entrada: "bg-emerald-500", intervalo: "bg-amber-400",
    retorno: "bg-blue-500", saida: "bg-rose-500",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <History className="w-5 h-5 text-primary" />
        Histórico Temporal
      </h2>

      {/* Seleção de funcionário */}
      <Card className="p-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground font-medium">Funcionário</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm block">
              <option value="">Selecione...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Sub-abas */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={subTab === "ponto" ? "default" : "outline"} size="sm"
          onClick={() => setSubTab("ponto")} className="gap-1">
          <Clock className="w-4 h-4" /> Ponto por dia
        </Button>
        <Button variant={subTab === "espelhos" ? "default" : "outline"} size="sm"
          onClick={() => setSubTab("espelhos")} className="gap-1">
          <FileText className="w-4 h-4" /> Espelhos
        </Button>
        <Button variant={subTab === "alteracoes" ? "default" : "outline"} size="sm"
          onClick={() => setSubTab("alteracoes")} className="gap-1">
          <User className="w-4 h-4" /> Alterações
        </Button>
      </div>

      {!selectedId ? (
        <Card className="p-12 text-center">
          <History className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Selecione um funcionário para ver o histórico.</p>
        </Card>
      ) : (
        <>
          {/* PONTO POR DIA */}
          {subTab === "ponto" && (
            <div className="space-y-3">
              <Card className="p-4">
                <div className="flex gap-3 items-end flex-wrap">
                  <div>
                    <label className="text-xs text-muted-foreground font-medium">Data</label>
                    <input type="date" value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block" />
                  </div>
                  <Button variant="outline" size="sm" onClick={loadPonto} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </Card>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : pontoRecords.length === 0 ? (
                <Card className="p-8 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum registro em {fmtDate(selectedDate + "T12:00:00")}.</p>
                </Card>
              ) : (
                <Card className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Registros de {fmtDate(selectedDate + "T12:00:00")}
                  </p>
                  <div className="relative pl-5">
                    <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
                    {pontoRecords.map((r, i) => {
                      const next = pontoRecords[i + 1];
                      const durMin = next
                        ? Math.round((new Date(next.recorded_at).getTime() - new Date(r.recorded_at).getTime()) / 60000)
                        : null;
                      const durStr = durMin !== null
                        ? durMin >= 60 ? `${Math.floor(durMin/60)}h${String(durMin%60).padStart(2,"0")}m` : `${durMin}min`
                        : null;
                      return (
                        <div key={r.id} className="relative flex items-start gap-3 mb-4">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${STEP_COLORS[r.record_type] || "bg-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-foreground">
                                {STEP_LABELS[r.record_type] || r.record_type}
                              </span>
                              <span className="text-sm font-mono text-muted-foreground">
                                {fmtTime(r.recorded_at)}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                r.mode === "manual" ? "bg-amber-500/10 text-amber-600" :
                                r.mode === "offline" ? "bg-orange-500/10 text-orange-600" :
                                "bg-emerald-500/10 text-emerald-600"
                              }`}>
                                {r.mode === "manual" ? "✏️ Manual" : r.mode === "offline" ? "📴 Offline" : "🌐 Online"}
                              </span>
                            </div>
                            {r.address && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">📍 {r.address}</p>
                            )}
                            {durStr && (
                              <p className="text-xs text-muted-foreground mt-0.5">⏱ {durStr} até o próximo</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ESPELHOS */}
          {subTab === "espelhos" && (
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : espelhos.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum espelho encontrado.</p>
                </Card>
              ) : (
                espelhos.map(e => (
                  <Card key={e.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {MONTH_NAMES[e.month - 1]} / {e.year}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {e.closed_at ? `Fechado em ${fmtDateTime(e.closed_at)} por ${e.closed_by || "admin"}` : "Em aberto"}
                      </p>
                      {e.accepted_at && (
                        <p className="text-xs text-emerald-600 mt-0.5">✓ Assinado em {fmtDateTime(e.accepted_at)}</p>
                      )}
                    </div>
                    <div>
                      {e.status === "assinado" && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold">✓ Assinado</span>
                      )}
                      {e.status === "fechado" && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[11px] font-bold">🔒 Fechado</span>
                      )}
                      {e.status === "aberto" && (
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px]">Aberto</span>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ALTERAÇÕES */}
          {subTab === "alteracoes" && (
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : alteracoes.length === 0 ? (
                <Card className="p-8 text-center">
                  <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
                  <p className="text-xs text-muted-foreground mt-1">As alterações serão registradas a partir de agora.</p>
                </Card>
              ) : (
                alteracoes.map(log => (
                  <Card key={log.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {ACTION_LABELS[log.action] || log.action}
                        </p>
                        {log.user_email && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            por <span className="font-medium text-foreground">{log.user_email}</span>
                          </p>
                        )}
                        {log.details && (
                          <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                            {log.details.reason && <p>Motivo: {log.details.reason}</p>}
                            {log.details.step && <p>Tipo: {STEP_LABELS[log.details.step] || log.details.step}</p>}
                            {log.details.field && (
                              <p>Campo: <span className="text-foreground">{log.details.field}</span>
                                {log.details.old_value && <> — antes: <span className="text-rose-600">{String(log.details.old_value)}</span></>}
                                {log.details.new_value && <> → depois: <span className="text-emerald-600">{String(log.details.new_value)}</span></>}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {fmtDateTime(log.created_at)}
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}