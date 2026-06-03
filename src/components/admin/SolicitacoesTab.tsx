import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Solicitacao {
  id: string;
  employee_id: string;
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
  const [filtro, setFiltro] = useState<"pendente" | "aprovado" | "recusado">("pendente");
  const [processando, setProcessando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("employee_requests")
        .select("id, employee_id, tipo, status, observacao, created_at, employees(name)")
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

  // Realtime subscription
  useEffect(() => {
    const channel = (supabase as any)
      .channel("solicitacoes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_requests" }, () => {
        load();
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [load]);

  const atualizar = async (id: string, status: "aprovado" | "recusado", sol: Solicitacao) => {
    setProcessando(id);
    try {
      const { error } = await (supabase as any)
        .from("employee_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // Cria notificação para o colaborador
      try {
        const { data: empData } = await (supabase as any)
          .from("employees")
          .select("id")
          .eq("id", sol.employee_id)
          .single();

        if (empData) {
          await (supabase as any).from("notifications").insert({
            employee_id: sol.employee_id,
            tipo: status,
            titulo: status === "aprovado" ? "✅ Solicitação aprovada!" : "❌ Solicitação recusada",
            mensagem: `Sua solicitação de ${sol.tipo} foi ${status === "aprovado" ? "aprovada" : "recusada"}.`,
          });
        }
      } catch {}

      toast.success(status === "aprovado" ? "✅ Solicitação aprovada!" : "❌ Solicitação recusada.");
      // Move automaticamente para o filtro correto
      setFiltro(status);
      load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setProcessando(null);
    }
  };

  const excluir = async (id: string, status: string) => {
    // Permite excluir qualquer status
    if (!confirm("Tem certeza que deseja excluir esta solicitação?")) return;
    try {
      const { error } = await (supabase as any)
        .from("employee_requests")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Solicitação excluída.");
      load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  const filtradas = solicitacoes.filter(s => s.status === filtro);
  const counts = {
    pendente: solicitacoes.filter(s => s.status === "pendente").length,
    aprovado: solicitacoes.filter(s => s.status === "aprovado").length,
    recusado: solicitacoes.filter(s => s.status === "recusado").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            📋 Solicitações dos Colaboradores
            {counts.pendente > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#fef3c7", color: "#b45309" }}>
                {counts.pendente} pendente{counts.pendente > 1 ? "s" : ""}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Atualizações em tempo real</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {([
          { key: "pendente" as const, label: "Pendentes", icon: "⏳" },
          { key: "aprovado" as const, label: "Aprovadas", icon: "✅" },
          { key: "recusado" as const, label: "Recusadas", icon: "❌" },
        ]).map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: filtro === f.key ? "#1e40af" : "#f1f5f9",
              color: filtro === f.key ? "white" : "#64748b",
            }}>
            {f.icon} {f.label}
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black"
              style={{
                background: filtro === f.key ? "rgba(255,255,255,0.2)" : "#e2e8f0",
                color: filtro === f.key ? "white" : "#64748b",
              }}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">
            {filtro === "pendente" ? "📭" : filtro === "aprovado" ? "✅" : "❌"}
          </p>
          <p className="text-sm text-gray-400">
            {filtro === "pendente" ? "Nenhuma solicitação pendente." :
             filtro === "aprovado" ? "Nenhuma solicitação aprovada." :
             "Nenhuma solicitação recusada."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((s) => {
            const cor = STATUS_CORES[s.status] || STATUS_CORES.pendente;
            const isProcessando = processando === s.id;
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
                    <div className="flex gap-1.5">
                      {s.status !== "pendente" && (
                        <button onClick={() => excluir(s.id, "pendente")}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-md"
                          style={{ background: "#f8fafc" }} title="Excluir">
                          <Trash2 className="w-4 h-4 text-gray-400" />
                        </button>
                      )}
                      {s.status === "pendente" && (
                        <>
                          <button onClick={() => atualizar(s.id, "aprovado", s)}
                            disabled={isProcessando}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-md disabled:opacity-50"
                            style={{ background: "#f0fdf4" }} title="Aprovar">
                            {isProcessando ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400" /> : <Check className="w-4 h-4 text-emerald-600" />}
                          </button>
                          <button onClick={() => atualizar(s.id, "recusado", s)}
                            disabled={isProcessando}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-md disabled:opacity-50"
                            style={{ background: "#fff1f2" }} title="Recusar">
                            <X className="w-4 h-4 text-red-500" />
                          </button>
                          <button onClick={() => excluir(s.id, s.status)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-md"
                            style={{ background: "#f8fafc" }} title="Excluir">
                            <Trash2 className="w-4 h-4 text-gray-400" />
                          </button>
                        </>
                      )}
                    </div>
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