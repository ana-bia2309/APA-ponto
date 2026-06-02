import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, CheckCircle2, Circle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

interface CheckItem {
  key: string;
  label: string;
  done: boolean;
  obrigatorio: boolean;
}

interface ColaboradorOnboarding {
  id: string;
  name: string;
  cargo: string | null;
  data_admissao: string | null;
  diasAdmitido: number;
  checklist: CheckItem[];
  progresso: number;
  status: "completo" | "em_andamento" | "critico";
}

export default function OnboardingTab() {
  const [colaboradores, setColaboradores] = useState<ColaboradorOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "completo" | "em_andamento" | "critico">("todos");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Busca funcionários admitidos nos últimos 90 dias
      const noventa = new Date();
      noventa.setDate(noventa.getDate() - 90);

      const { data: emps } = await (supabase as any)
        .from("employees")
        .select("id, name, cargo, data_admissao, cpf, foto_url, punch_mode, shift")
        .eq("active", true)
        .gte("data_admissao", noventa.toISOString().slice(0, 10))
        .order("data_admissao", { ascending: false });

      if (!emps || emps.length === 0) { setColaboradores([]); setLoading(false); return; }

      const ids = emps.map((e: any) => e.id);

      // Busca documentos, EPIs e uniformes
      const [docsRes, episRes, uniformesRes] = await Promise.all([
        (supabase as any).from("employee_documents").select("employee_id").in("employee_id", ids),
        (supabase as any).from("epi_deliveries").select("employee_id").in("employee_id", ids),
        (supabase as any).from("uniform_deliveries").select("employee_id").in("employee_id", ids),
      ]);

      const comDocs = new Set((docsRes.data || []).map((d: any) => d.employee_id));
      const comEpi = new Set((episRes.data || []).map((d: any) => d.employee_id));
      const comUniforme = new Set((uniformesRes.data || []).map((d: any) => d.employee_id));

      const lista: ColaboradorOnboarding[] = emps.map((emp: any) => {
        const diasAdmitido = emp.data_admissao
          ? Math.floor((new Date().getTime() - new Date(emp.data_admissao + "T12:00:00").getTime()) / 86400000)
          : 0;

        const checklist: CheckItem[] = [
          { key: "cadastro", label: "Cadastro no sistema", done: true, obrigatorio: true },
          { key: "cpf", label: "CPF cadastrado", done: !!emp.cpf, obrigatorio: true },
          { key: "foto", label: "Foto 3x4 enviada", done: !!emp.foto_url, obrigatorio: false },
          { key: "cargo", label: "Cargo definido", done: !!emp.cargo, obrigatorio: true },
          { key: "escala", label: "Escala configurada", done: !!emp.punch_mode && !!emp.shift, obrigatorio: true },
          { key: "documentos", label: "Documentos anexados", done: comDocs.has(emp.id), obrigatorio: true },
          { key: "epi", label: "EPI entregue", done: comEpi.has(emp.id), obrigatorio: false },
          { key: "uniforme", label: "Uniforme entregue", done: comUniforme.has(emp.id), obrigatorio: false },
        ];

        const obrigatorios = checklist.filter(c => c.obrigatorio);
        const obrigatoriosConcluidos = obrigatorios.filter(c => c.done).length;
        const totalConcluidos = checklist.filter(c => c.done).length;
        const progresso = Math.round((totalConcluidos / checklist.length) * 100);

        let status: ColaboradorOnboarding["status"] = "completo";
        if (obrigatoriosConcluidos < obrigatorios.length) {
          status = diasAdmitido > 7 ? "critico" : "em_andamento";
        } else if (progresso < 100) {
          status = "em_andamento";
        }

        return { id: emp.id, name: emp.name, cargo: emp.cargo, data_admissao: emp.data_admissao, diasAdmitido, checklist, progresso, status };
      });

      setColaboradores(lista);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtrados = filtro === "todos" ? colaboradores : colaboradores.filter(c => c.status === filtro);

  const counts = {
    todos: colaboradores.length,
    completo: colaboradores.filter(c => c.status === "completo").length,
    em_andamento: colaboradores.filter(c => c.status === "em_andamento").length,
    critico: colaboradores.filter(c => c.status === "critico").length,
  };

  const STATUS_CONFIG = {
    completo:     { label: "Completo",      bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
    em_andamento: { label: "Em andamento",  bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
    critico:      { label: "Crítico",       bg: "#fff1f2", text: "#be123c", border: "#fecdd3" },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">✅ Checklist de Onboarding</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Colaboradores admitidos nos últimos 90 dias</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "todos", label: `Todos (${counts.todos})` },
          { key: "critico", label: `⚠️ Crítico (${counts.critico})` },
          { key: "em_andamento", label: `🔄 Em andamento (${counts.em_andamento})` },
          { key: "completo", label: `✅ Completo (${counts.completo})` },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: filtro === f.key ? "#1e40af" : "#f1f5f9",
              color: filtro === f.key ? "white" : "#64748b",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-sm text-gray-400">
            {filtro === "todos" ? "Nenhum colaborador admitido nos últimos 90 dias." : "Nenhum colaborador neste status."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(c => {
            const sc = STATUS_CONFIG[c.status];
            const isExpanded = expandedId === c.id;
            const pendentes = c.checklist.filter(item => !item.done && item.obrigatorio);

            return (
              <div key={c.id} className="bg-white rounded-2xl border overflow-hidden"
                style={{ borderColor: sc.border, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                {/* Header do card */}
                <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                        {c.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-800">{c.name}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.cargo && <p className="text-[10px] text-gray-400">{c.cargo}</p>}
                          {c.data_admissao && (
                            <p className="text-[10px] text-gray-400">
                              · Admitido há {c.diasAdmitido} dia{c.diasAdmitido !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Barra de progresso */}
                      <div className="flex flex-col items-end gap-1">
                        <p className="text-xs font-black" style={{ color: sc.text }}>{c.progresso}%</p>
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{
                              width: `${c.progresso}%`,
                              background: c.progresso === 100 ? "#16a34a" : c.status === "critico" ? "#dc2626" : "#f59e0b"
                            }} />
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {c.checklist.filter(i => i.done).length}/{c.checklist.length} itens
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Alertas de itens críticos pendentes */}
                  {pendentes.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-500">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      <span>Pendente: {pendentes.map(p => p.label).join(", ")}</span>
                    </div>
                  )}
                </div>

                {/* Checklist expandido */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {c.checklist.map(item => (
                        <div key={item.key} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-gray-100">
                          {item.done
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            : <Circle className="w-4 h-4 flex-shrink-0" style={{ color: item.obrigatorio ? "#dc2626" : "#94a3b8" }} />
                          }
                          <span className="text-xs font-medium" style={{ color: item.done ? "#15803d" : item.obrigatorio ? "#dc2626" : "#94a3b8" }}>
                            {item.label}
                          </span>
                          {item.obrigatorio && !item.done && (
                            <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#fff1f2", color: "#dc2626" }}>
                              Obrigatório
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}