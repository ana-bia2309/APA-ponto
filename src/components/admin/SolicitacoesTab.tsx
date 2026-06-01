import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Check, X } from "lucide-react";
import { toast } from "sonner";

interface Solicitacao {
  id: string;
  tipo: string;
  status: string;
  observacao: string | null;
  created_at: string;
  employee_name: string;
}

const TIPO_ICONS: Record<string, string> = {
  "Férias": "🏖️",
  "Abono": "📝",
  "Declaração": "📄",
  "Ajuste de Ponto": "⏱️",
};

const STATUS_CORES: Record<string, { bg: string; text: string; label: string }> = {
  pendente: { bg: "#fef3c7", text: "#b45309", label: "Pendente" },
  aprovado: { bg: "#f0fdf4", text: "#15803d", label: "Aprovado" },
  recusado: { bg: "#fff1f2", text: "#be123c", label: "Recusado" },
};

export default function SolicitacoesTab() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | "pendente" | "aprovado" | "recusado">("todas");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("employee_requests")
        .select("id, tipo, status, observacao, created_at, employees(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSolicitacoes((data || []).map((d: any) => ({
        ...d,
        employee_name: d.employees?.name || "—",
      })));
    } catch (e: any) {
      toast.error("Erro ao carregar solicitações: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const atualizar = async (id: string, status: "aprovado" | "recusado") => {
    try {
      const { error } = await (supabase as any)
        .from("employee_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(status === "aprovado" ? "Solicitação aprovada! ✅" : "Solicitação recusada.");
      load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  const filtradas = filtro === "todas" ? solicitacoes : solicitacoes.filter(s => s.status === filtro);
  const pendentes = solicitacoes.filter(s => s.status === "pendente").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            📋 Solicitações dos Colaboradores
            {pendentes > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#fef3c7", color: "#b45309" }}>
                {pendentes} pendente{pendentes > 1 ? "s" : ""}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gerencie as solicitações enviadas pelos colaboradores</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {(["todas", "pendente", "aprovado", "recusado"] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: filtro === f ? "#1e40af" : "#f1f5f9",
              color: filtro === f ? "white" : "#64748b",
            }}>
            {f === "todas" ? "Todas" : STATUS_CORES[f].label}
            {f === "pendente" && pendentes > 0 && ` (${pendentes})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm text-gray-400">Nenhuma solicitação encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((s) => {
            const cor = STATUS_CORES[s.status] || STATUS_CORES.pendente;
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{TIPO_ICONS[s.tipo] || "📋"}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{s.tipo}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.employee_name}</p>
                      {s.observacao && (
                        <p className="text-xs text-gray-400 mt-1 italic">"{s.observacao}"</p>
                      )}
                      <p className="text-[10px] text-gray-300 mt-1">
                        {new Date(s.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                      style={{ background: cor.bg, color: cor.text }}>
                      {cor.label}
                    </span>
                    {s.status === "pendente" && (
                      <div className="flex gap-1.5">
                        <button onClick={() => atualizar(s.id, "aprovado")}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-md"
                          style={{ background: "#f0fdf4" }} title="Aprovar">
                          <Check className="w-4 h-4 text-emerald-600" />
                        </button>
                        <button onClick={() => atualizar(s.id, "recusado")}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-md"
                          style={{ background: "#fff1f2" }} title="Recusar">
                          <X className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}