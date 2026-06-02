import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, AlertTriangle, Users, Calendar } from "lucide-react";
import { toast } from "sonner";

interface Ausencia {
  id: string;
  employee_id: string;
  employee_name: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  departamento: string | null;
}

interface Cobertura {
  ausencia: Ausencia;
  substitutos: { id: string; name: string; cargo: string | null; departamento: string | null; disponivel: boolean }[];
  impacto: "alto" | "medio" | "baixo";
  diasAfetados: number;
}

const TIPO_LABELS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ferias:       { label: "Férias",       icon: "🏖️", color: "#1e40af", bg: "#eff6ff" },
  atestado:     { label: "Atestado",     icon: "🏥", color: "#dc2626", bg: "#fff1f2" },
  licenca:      { label: "Licença",      icon: "📋", color: "#7c3aed", bg: "#f5f3ff" },
  afastamento:  { label: "Afastamento",  icon: "⚠️", color: "#b45309", bg: "#fff7ed" },
  outro:        { label: "Outro",        icon: "📌", color: "#64748b", bg: "#f8fafc" },
};

export default function CoberturaTab() {
  const [coberturas, setCoberturas] = useState<Cobertura[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const em30 = new Date();
      em30.setDate(em30.getDate() + 30);

      // Busca ausências aprovadas ou pendentes nos próximos 30 dias
      const { data: ausencias } = await (supabase as any)
        .from("absence_justifications")
        .select("id, employee_id, tipo, data_inicio, data_fim, status")
        .gte("data_inicio", hoje)
        .lte("data_inicio", em30.toISOString().slice(0, 10))
        .in("status", ["aprovado", "pendente"])
        .order("data_inicio");

      if (!ausencias || ausencias.length === 0) {
        setCoberturas([]);
        setLoading(false);
        return;
      }

      // Busca dados dos funcionários
      const empIds = [...new Set(ausencias.map((a: any) => a.employee_id))];
      const { data: employees } = await (supabase as any)
        .from("employees")
        .select("id, name, cargo, departamento")
        .eq("active", true);

      const empMap: Record<string, any> = {};
      (employees || []).forEach((e: any) => { empMap[e.id] = e; });

      const result: Cobertura[] = ausencias.map((aus: any) => {
        const emp = empMap[aus.employee_id];
        const dataInicio = new Date(aus.data_inicio + "T12:00:00");
        const dataFim = aus.data_fim ? new Date(aus.data_fim + "T12:00:00") : dataInicio;
        const diasAfetados = Math.max(1, Math.ceil((dataFim.getTime() - dataInicio.getTime()) / 86400000) + 1);

        // Substitutos: mesmo departamento, exceto o ausente
        const substitutos = (employees || [])
          .filter((e: any) => e.id !== aus.employee_id && e.departamento === emp?.departamento)
          .map((e: any) => ({ ...e, disponivel: true }));

        // Impacto baseado em dias e se tem substitutos
        const impacto: "alto" | "medio" | "baixo" =
          diasAfetados > 14 || substitutos.length === 0 ? "alto" :
          diasAfetados > 7 ? "medio" : "baixo";

        return {
          ausencia: {
            ...aus,
            employee_name: emp?.name || "—",
            departamento: emp?.departamento || null,
          },
          substitutos,
          impacto,
          diasAfetados,
        };
      });

      setCoberturas(result);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar coberturas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const IMPACTO_CONFIG = {
    alto:  { label: "Alto",  color: "#dc2626", bg: "#fff1f2", icon: "🔴" },
    medio: { label: "Médio", color: "#b45309", bg: "#fff7ed", icon: "🟡" },
    baixo: { label: "Baixo", color: "#15803d", bg: "#f0fdf4", icon: "🟢" },
  };

  const altos = coberturas.filter(c => c.impacto === "alto").length;
  const medios = coberturas.filter(c => c.impacto === "medio").length;
  const baixos = coberturas.filter(c => c.impacto === "baixo").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">🛡️ Planejamento de Cobertura</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Ausências previstas nos próximos 30 dias e sugestões de cobertura</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Impacto Alto", value: altos, color: "#dc2626", bg: "#fff1f2" },
          { label: "Impacto Médio", value: medios, color: "#b45309", bg: "#fff7ed" },
          { label: "Impacto Baixo", value: baixos, color: "#15803d", bg: "#f0fdf4" },
        ].map((k, i) => (
          <div key={i} className="rounded-2xl p-3 text-center border"
            style={{ background: k.bg, borderColor: k.color + "30", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <p className="text-2xl font-black" style={{ color: k.color }}>{k.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: k.color }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : coberturas.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-sm font-semibold text-gray-600">Nenhuma ausência prevista!</p>
          <p className="text-xs text-gray-400 mt-1">Não há ausências aprovadas ou pendentes nos próximos 30 dias</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coberturas.map((c, i) => {
            const tipo = TIPO_LABELS[c.ausencia.tipo] || TIPO_LABELS.outro;
            const impacto = IMPACTO_CONFIG[c.impacto];
            const isExpanded = expandedId === c.ausencia.id;

            return (
              <div key={i} className="bg-white rounded-2xl border overflow-hidden"
                style={{ borderColor: impacto.color + "30", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                {/* Header */}
                <button className="w-full p-4 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpandedId(isExpanded ? null : c.ausencia.id)}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{tipo.icon}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-black text-gray-800">{c.ausencia.employee_name}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: tipo.bg, color: tipo.color }}>{tipo.label}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: impacto.bg, color: impacto.color }}>
                          {impacto.icon} {impacto.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        📅 {new Date(c.ausencia.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")}
                        {c.ausencia.data_fim && c.ausencia.data_fim !== c.ausencia.data_inicio &&
                          ` → ${new Date(c.ausencia.data_fim + "T12:00:00").toLocaleDateString("pt-BR")}`}
                        {" "}· {c.diasAfetados} dia{c.diasAfetados !== 1 ? "s" : ""}
                      </p>
                      {c.ausencia.departamento && (
                        <p className="text-[10px] text-gray-400">{c.ausencia.departamento}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-gray-400">
                      {c.substitutos.length > 0 ? `${c.substitutos.length} substituto${c.substitutos.length !== 1 ? "s" : ""}` : "Sem substitutos"}
                    </span>
                    <span className="text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Detalhes */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-3" style={{ background: "#f8fafc" }}>
                    {/* Impacto operacional */}
                    <div className="rounded-xl p-3" style={{ background: impacto.bg }}>
                      <p className="text-xs font-bold mb-1" style={{ color: impacto.color }}>
                        {impacto.icon} Impacto Operacional: {impacto.label}
                      </p>
                      <p className="text-[11px]" style={{ color: impacto.color }}>
                        {c.impacto === "alto" && c.substitutos.length === 0
                          ? "⚠️ Nenhum substituto disponível no mesmo departamento. Considere realocação de equipe."
                          : c.impacto === "alto"
                          ? `Ausência longa (${c.diasAfetados} dias). Planejamento antecipado recomendado.`
                          : c.impacto === "medio"
                          ? `Ausência de ${c.diasAfetados} dias. Distribua as tarefas com os substitutos sugeridos.`
                          : "Ausência de curta duração. Impacto mínimo na operação."}
                      </p>
                    </div>

                    {/* Substitutos */}
                    <div>
                      <p className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        Substitutos Sugeridos ({c.substitutos.length})
                      </p>
                      {c.substitutos.length === 0 ? (
                        <div className="rounded-xl p-3 text-center" style={{ background: "#fff1f2" }}>
                          <p className="text-xs text-red-500">⚠️ Nenhum colaborador disponível no mesmo departamento</p>
                          <p className="text-[10px] text-red-400 mt-0.5">Considere buscar substitutos de outros setores</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {c.substitutos.map((s, si) => (
                            <div key={si} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-gray-100">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                                style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                                {s.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{s.name}</p>
                                <p className="text-[10px] text-gray-400 truncate">{s.cargo || "Sem cargo"}</p>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: "#f0fdf4", color: "#15803d" }}>
                                Disponível
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
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