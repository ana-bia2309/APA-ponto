import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";

interface Aviso {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: string;
  ativo: boolean;
  created_at: string;
}

interface ConfirmacaoInfo {
  totalFuncionarios: number;
  confirmados: number;
  pendentes: string[]; // nomes
}

const TIPOS = [
  { value: "info", label: "Informativo", icon: "ℹ️", bg: "#eff6ff", text: "#1e40af" },
  { value: "alerta", label: "Alerta", icon: "⚠️", bg: "#fff7ed", text: "#c2410c" },
  { value: "urgente", label: "Urgente", icon: "🚨", bg: "#fff1f2", text: "#be123c" },
  { value: "evento", label: "Evento", icon: "📅", bg: "#f0fdf4", text: "#15803d" },
];

export default function AvisosTab() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [tipo, setTipo] = useState("info");
  const [salvando, setSalvando] = useState(false);
  const [confirmacoes, setConfirmacoes] = useState<Record<string, ConfirmacaoInfo>>({});
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("company_notices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAvisos(data || []);

      // Busca confirmações de cada aviso
      if (data && data.length > 0) {
        const { data: employees } = await supabase
          .from("employees")
          .select("id, name")
          .eq("active", true);

        const { data: todasConfirmacoes } = await (supabase as any)
          .from("aviso_confirmacoes")
          .select("aviso_id, employee_id")
          .in("aviso_id", data.map((a: any) => a.id));

        const info: Record<string, ConfirmacaoInfo> = {};
        data.forEach((aviso: any) => {
          const confirmadosIds = new Set(
            (todasConfirmacoes || [])
              .filter((c: any) => c.aviso_id === aviso.id)
              .map((c: any) => c.employee_id)
          );
          const pendentes = (employees || [])
            .filter((e: any) => !confirmadosIds.has(e.id))
            .map((e: any) => e.name);
          info[aviso.id] = {
            totalFuncionarios: (employees || []).length,
            confirmados: confirmadosIds.size,
            pendentes,
          };
        });
        setConfirmacoes(info);
      }
    } catch (e: any) {
      toast.error("Erro ao carregar avisos: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const salvar = async () => {
    if (!titulo.trim() || !mensagem.trim()) { toast.error("Preencha título e mensagem."); return; }
    setSalvando(true);
    try {
      const { error } = await (supabase as any).from("company_notices").insert({
        titulo: titulo.trim(), mensagem: mensagem.trim(), tipo, ativo: true,
      });
      if (error) throw error;
      toast.success("Aviso publicado! ✅");
      setTitulo(""); setMensagem(""); setTipo("info"); setShowForm(false);
      load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    try {
      await (supabase as any).from("company_notices").update({ ativo: !ativo }).eq("id", id);
      load();
    } catch {}
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este aviso?")) return;
    try {
      await (supabase as any).from("company_notices").delete().eq("id", id);
      toast.success("Aviso excluído.");
      load();
    } catch {}
  };

  const tipoAtual = TIPOS.find(t => t.value === tipo) || TIPOS[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">📢 Avisos da Empresa</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Comunicados visíveis para todos os colaboradores</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg"
            style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
            <Plus className="w-4 h-4" />
            Novo Aviso
          </button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-100 p-5" style={{ boxShadow: "0 2px 16px rgba(30,64,175,0.08)" }}>
          <p className="text-sm font-bold text-gray-800 mb-4">Novo Aviso</p>
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {TIPOS.map(t => (
                <button key={t.value} onClick={() => setTipo(t.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
                  style={{
                    background: tipo === t.value ? t.bg : "white",
                    color: tipo === t.value ? t.text : "#64748b",
                    borderColor: tipo === t.value ? t.text : "#e2e8f0",
                  }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Título do aviso"
              className="w-full h-10 rounded-xl border border-gray-200 px-4 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400/40" />
            <textarea value={mensagem} onChange={e => setMensagem(e.target.value)}
              placeholder="Mensagem do aviso..."
              className="w-full h-20 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400/40 resize-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                {salvando ? "Publicando..." : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {showForm && titulo && (
        <div className="rounded-xl p-3 border" style={{ background: tipoAtual.bg, borderColor: tipoAtual.text + "40" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Preview</p>
          <div className="flex items-start gap-2">
            <span>{tipoAtual.icon}</span>
            <div>
              <p className="text-xs font-bold" style={{ color: tipoAtual.text }}>{titulo || "Título"}</p>
              <p className="text-[10px] text-gray-500">{mensagem || "Mensagem..."}</p>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : avisos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm text-gray-400">Nenhum aviso cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {avisos.map((aviso) => {
            const t = TIPOS.find(t => t.value === aviso.tipo) || TIPOS[0];
            return (
              <div key={aviso.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start justify-between gap-3"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)", opacity: aviso.ativo ? 1 : 0.5 }}>
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">{t.icon}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-gray-800">{aviso.titulo}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: t.bg, color: t.text }}>{t.label}</span>
                      {!aviso.ativo && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-400">Inativo</span>}
                    </div>
                    <p className="text-xs text-gray-500">{aviso.mensagem}</p>
                    <p className="text-[10px] text-gray-300 mt-1">{new Date(aviso.created_at).toLocaleString("pt-BR")}</p>

                    {confirmacoes[aviso.id] && (
                      <div className="mt-2">
                        <button
                          onClick={() => setExpandidoId(expandidoId === aviso.id ? null : aviso.id)}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors"
                          style={{
                            background: confirmacoes[aviso.id].confirmados === confirmacoes[aviso.id].totalFuncionarios
                              ? "#d1fae5" : "#fef3c7",
                            color: confirmacoes[aviso.id].confirmados === confirmacoes[aviso.id].totalFuncionarios
                              ? "#065f46" : "#92400e",
                          }}
                        >
                          ✓ {confirmacoes[aviso.id].confirmados}/{confirmacoes[aviso.id].totalFuncionarios} confirmaram
                        </button>
                        {expandidoId === aviso.id && confirmacoes[aviso.id].pendentes.length > 0 && (
                          <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-100">
                            <p className="text-[10px] font-bold text-amber-700 mb-1">Ainda não confirmaram:</p>
                            <p className="text-[10px] text-amber-600">{confirmacoes[aviso.id].pendentes.join(", ")}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleAtivo(aviso.id, aviso.ativo)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title={aviso.ativo ? "Desativar" : "Ativar"}>
                    {aviso.ativo
                      ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                      : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                  </button>
                  <button onClick={() => excluir(aviso.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}