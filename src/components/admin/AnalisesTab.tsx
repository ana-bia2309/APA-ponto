import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, BarChart2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface TimeRecord {
  employee_id: string;
  record_type: string;
  recorded_at: string;
}

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAY_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const DAY_NAMES_FULL = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

function getHeatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "hsl(220 14% 94%)";
  const pct = value / max;
  if (pct < 0.2) return "hsl(221 83% 90%)";
  if (pct < 0.4) return "hsl(221 83% 75%)";
  if (pct < 0.6) return "hsl(221 83% 58%)";
  if (pct < 0.8) return "hsl(221 83% 45%)";
  return "hsl(221 83% 30%)";
}

function getTextColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "hsl(220 10% 55%)";
  const pct = value / max;
  return pct >= 0.4 ? "white" : "hsl(221 83% 30%)";
}

function getFaultColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "hsl(220 14% 94%)";
  const pct = value / max;
  if (pct < 0.2) return "hsl(0 72% 92%)";
  if (pct < 0.4) return "hsl(0 72% 80%)";
  if (pct < 0.6) return "hsl(0 72% 65%)";
  if (pct < 0.8) return "hsl(0 72% 51%)";
  return "hsl(0 72% 35%)";
}

export default function AnalisesTab({ employees }: { employees: Employee[] }) {
  const [subTab, setSubTab] = useState<"horarios" | "presenca">("horarios");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();
      const { data } = await (supabase as any)
        .from("time_records")
        .select("employee_id, record_type, recorded_at")
        .gte("recorded_at", start)
        .lt("recorded_at", end);
      setRecords(data || []);
    } catch {}
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  // HEATMAP 1: Dia da semana x Hora do dia (entradas)
  const entradas = records.filter(r => r.record_type === "entrada");

  // Grid 7 dias x 24 horas
  const horarioGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  entradas.forEach(r => {
    const d = new Date(r.recorded_at);
    const dow = d.getDay();
    const hour = d.getHours();
    horarioGrid[dow][hour]++;
  });
  const maxHorario = Math.max(...horarioGrid.flat());

  // Atrasos (entradas após 08:15)
  const atrasosGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  entradas.forEach(r => {
    const d = new Date(r.recorded_at);
    const h = d.getHours();
    const m = d.getMinutes();
    if (h > 8 || (h === 8 && m > 15)) {
      atrasosGrid[d.getDay()][h]++;
    }
  });
  const maxAtraso = Math.max(...atrasosGrid.flat());

  // HEATMAP 2: Dia do mês x Funcionário (presença)
  const daysInMonth = new Date(year, month, 0).getDate();
  const activeEmployees = employees.filter(e => e.active).slice(0, 15);

  const presencaGrid: Record<string, Set<number>> = {};
  activeEmployees.forEach(e => { presencaGrid[e.id] = new Set(); });
  records.filter(r => r.record_type === "entrada").forEach(r => {
    const day = new Date(r.recorded_at).getDate();
    if (presencaGrid[r.employee_id]) presencaGrid[r.employee_id].add(day);
  });

  // Horas mais comuns para entrada
  const hourCounts = Array(24).fill(0);
  entradas.forEach(r => { hourCounts[new Date(r.recorded_at).getHours()]++; });
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  const dayAtrasos = Array(7).fill(0);
  entradas.forEach(r => {
    const d = new Date(r.recorded_at);
    const h = d.getHours(), m = d.getMinutes();
    if (h > 8 || (h === 8 && m > 15)) dayAtrasos[d.getDay()]++;
  });
  const worstDay = dayAtrasos.indexOf(Math.max(...dayAtrasos));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          Análises
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mês</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block">
              {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Ano</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm block">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Insights rápidos */}
      {!loading && entradas.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{entradas.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Entradas no mês</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-500">{DAY_NAMES_FULL[worstDay]}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Dia com mais atrasos</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-500">{String(peakHour).padStart(2,"0")}h</p>
            <p className="text-xs text-muted-foreground mt-0.5">Horário de pico</p>
          </Card>
        </div>
      )}

      {/* Sub-abas */}
      <div className="flex gap-2">
        <Button variant={subTab === "horarios" ? "default" : "outline"} size="sm"
          onClick={() => setSubTab("horarios")}>
          Heatmap de Horários
        </Button>
        <Button variant={subTab === "presenca" ? "default" : "outline"} size="sm"
          onClick={() => setSubTab("presenca")}>
          Presença Mensal
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : entradas.length === 0 ? (
        <Card className="p-12 text-center">
          <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum registro encontrado para este período.</p>
        </Card>
      ) : (
        <>
          {/* HEATMAP HORÁRIOS */}
          {subTab === "horarios" && (
            <div className="space-y-4">
              <Card className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Entradas por dia da semana e hora
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead>
                      <tr>
                        <th className="w-12 text-right pr-2 text-muted-foreground font-normal"></th>
                        {Array.from({length: 24}, (_, h) => (
                          <th key={h} className="w-7 text-center text-muted-foreground font-normal pb-1">
                            {h % 3 === 0 ? `${String(h).padStart(2,"0")}h` : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1,2,3,4,5,6,0].map(dow => (
                        <tr key={dow}>
                          <td className="text-right pr-2 text-muted-foreground py-0.5 font-medium text-xs w-12">
                            {DAY_NAMES[dow]}
                          </td>
                          {Array.from({length: 24}, (_, h) => {
                            const val = horarioGrid[dow][h];
                            return (
                              <td key={h} className="p-0">
                                <div
                                  title={`${DAY_NAMES[dow]} ${String(h).padStart(2,"0")}h: ${val} entrada(s)`}
                                  style={{
                                    width: 24, height: 24,
                                    background: getHeatColor(val, maxHorario),
                                    borderRadius: 3,
                                    margin: 1,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 9,
                                    color: getTextColor(val, maxHorario),
                                    fontWeight: val > 0 ? 600 : 400,
                                  }}
                                >
                                  {val > 0 ? val : ""}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-muted-foreground">Menos</span>
                  {["hsl(220 14% 94%)","hsl(221 83% 90%)","hsl(221 83% 75%)","hsl(221 83% 58%)","hsl(221 83% 45%)","hsl(221 83% 30%)"].map((c,i) => (
                    <div key={i} style={{width:16,height:16,background:c,borderRadius:3}} />
                  ))}
                  <span className="text-xs text-muted-foreground">Mais</span>
                </div>
              </Card>

              <Card className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Atrasos por dia da semana e hora (após 08:15)
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead>
                      <tr>
                        <th className="w-12 text-right pr-2 text-muted-foreground font-normal"></th>
                        {Array.from({length: 24}, (_, h) => (
                          <th key={h} className="w-7 text-center text-muted-foreground font-normal pb-1">
                            {h % 3 === 0 ? `${String(h).padStart(2,"0")}h` : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1,2,3,4,5,6,0].map(dow => (
                        <tr key={dow}>
                          <td className="text-right pr-2 text-muted-foreground py-0.5 font-medium text-xs w-12">
                            {DAY_NAMES[dow]}
                          </td>
                          {Array.from({length: 24}, (_, h) => {
                            const val = atrasosGrid[dow][h];
                            return (
                              <td key={h} className="p-0">
                                <div
                                  title={`${DAY_NAMES[dow]} ${String(h).padStart(2,"0")}h: ${val} atraso(s)`}
                                  style={{
                                    width: 24, height: 24,
                                    background: getFaultColor(val, maxAtraso),
                                    borderRadius: 3,
                                    margin: 1,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 9,
                                    color: val > 0 && val/maxAtraso >= 0.4 ? "white" : "hsl(0 72% 35%)",
                                    fontWeight: val > 0 ? 600 : 400,
                                  }}
                                >
                                  {val > 0 ? val : ""}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-muted-foreground">Sem atrasos</span>
                  {["hsl(220 14% 94%)","hsl(0 72% 92%)","hsl(0 72% 80%)","hsl(0 72% 65%)","hsl(0 72% 51%)","hsl(0 72% 35%)"].map((c,i) => (
                    <div key={i} style={{width:16,height:16,background:c,borderRadius:3}} />
                  ))}
                  <span className="text-xs text-muted-foreground">Crítico</span>
                </div>
              </Card>
            </div>
          )}

          {/* HEATMAP PRESENÇA */}
          {subTab === "presenca" && (
            <Card className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Presença por funcionário — {MONTH_NAMES[month-1]}/{year}
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="text-left pr-3 text-muted-foreground font-normal pb-1 min-w-[120px]">Funcionário</th>
                      {Array.from({length: daysInMonth}, (_, i) => {
                        const d = new Date(year, month-1, i+1).getDay();
                        const isWeekend = d === 0 || d === 6;
                        return (
                          <th key={i} className={`w-7 text-center font-normal pb-1 ${isWeekend ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                            {i+1}
                          </th>
                        );
                      })}
                      <th className="pl-3 text-muted-foreground font-normal pb-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEmployees.map(emp => {
                      const dias = presencaGrid[emp.id] || new Set();
                      const workDays = Array.from({length: daysInMonth}, (_, i) => {
                        const d = new Date(year, month-1, i+1).getDay();
                        return d !== 0 && d !== 6;
                      }).filter(Boolean).length;
                      const pct = workDays > 0 ? dias.size / workDays : 0;

                      return (
                        <tr key={emp.id}>
                          <td className="pr-3 py-0.5 text-foreground font-medium truncate max-w-[120px]">{emp.name.split(" ")[0]}</td>
                          {Array.from({length: daysInMonth}, (_, i) => {
                            const day = i + 1;
                            const dow = new Date(year, month-1, day).getDay();
                            const isWeekend = dow === 0 || dow === 6;
                            const present = dias.has(day);
                            return (
                              <td key={i} className="p-0">
                                <div
                                  title={`${emp.name} — dia ${day}: ${present ? "Presente" : isWeekend ? "Fim de semana" : "Ausente"}`}
                                  style={{
                                    width: 22, height: 22,
                                    background: isWeekend ? "transparent" : present ? "hsl(152 55% 40%)" : "hsl(0 72% 88%)",
                                    borderRadius: 3,
                                    margin: 1,
                                    border: isWeekend ? "none" : `1px solid ${present ? "hsl(152 55% 35%)" : "hsl(0 72% 80%)"}`,
                                  }}
                                />
                              </td>
                            );
                          })}
                          <td className="pl-3 py-0.5">
                            <span className={`text-xs font-semibold ${pct >= 0.9 ? "text-emerald-600" : pct >= 0.7 ? "text-amber-600" : "text-rose-600"}`}>
                              {Math.round(pct * 100)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div style={{width:14,height:14,background:"hsl(152 55% 40%)",borderRadius:3}} />
                  Presente
                </div>
                <div className="flex items-center gap-1">
                  <div style={{width:14,height:14,background:"hsl(0 72% 88%)",border:"1px solid hsl(0 72% 80%)",borderRadius:3}} />
                  Ausente
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}