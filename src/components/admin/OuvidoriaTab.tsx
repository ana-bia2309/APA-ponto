import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, MessageSquareWarning, Send, Trash2 } from "lucide-react";

interface Mensagem {
  id: string;
  protocolo: string;
  tipo: string;
  mensagem: string;
  resposta: string | null;
  status: string;
  created_at: string;
  respondido_em: string | null;
}

const TIPOS: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  reclamacao: { label: "Reclamação", icon: "😕", bg: "#fff7ed", text: "#c2410c" },
  denuncia: { label: "Denúncia", icon: "🚨", bg: "#fff1f2", text: "#be123c" },
  elogio: { label: "Elogio", icon: "👏", bg: "#f0fdf4", text: "#15803d" },
  sugestao: { label: "Sugestão", icon: "💡", bg: "#eff6ff", text: "#1e40af" },
};

const STATUS_OPTIONS = [
  { value: "novo", label: "Recebido", bg: "#f1f5f9", text: "#475569" },
  { value: "em_analise", label: "Em análise", bg: "#fef3c7", text: "#b45309" },
  { value: "respondido", label: "Respondido", bg: "#d1fae5", text: "#065f46" },
  { value: "arquivado", label: "Arquivado", bg: "#f1f5f9", text: "#64748b" },
];

export default function OuvidoriaTab() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [respostaTexto, setRespostaTexto] = useState<Record<string, string>>({});
  const [enviandoResposta, setEnviandoResposta] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("ouvidoria_mensagens")
        .select("*")
        .order("created_at", { ascending: false });
      setMensagens(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const atualizarStatus = async (id: string, status: string) => {
    await (supabase as any).from("ouvidoria_mensagens").update({ status }).eq("id", id);
    setMensagens(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  };

  const enviarResposta = async (id: string) => {
    const texto = respostaTexto[id]?.trim();
    if (!texto) { toast.error("Escreva uma resposta."); return; }
    setEnviandoResposta(id);
    try {
      const { error } = await (supabase as any)
        .from("ouvidoria_mensagens")
        .update({ resposta: texto, respondido_em: new Date().toISOString(), status: "respondido" })
        .eq("id", id);
      if (error) throw error;
      toast.success("Resposta enviada! O funcionário verá ao consultar o protocolo.");
      load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setEnviandoResposta(null);
    }
  };

  const excluirMensagem = async (id: string, protocolo: string) => {
    if (!confirm(`Excluir a mensagem ${protocolo}? Essa ação não pode ser desfeita, e o funcionário não conseguirá mais consultar esse protocolo.`)) return;
    try {
      const { error } = await (supabase as any).from("ouvidoria_mensagens").delete().eq("id", id);
      if (error) throw error;
      toast.success("Mensagem excluída.");
      setMensagens(prev => prev.filter(m => m.id !== id));
    } catch (e: any) {
      toast.error("Erro ao excluir: " + e.message);
    }
  };

  const mensagensFiltradas = filtroTipo === "todos" ? mensagens : mensagens.filter(m => m.tipo === filtroTipo);

  const contagens = Object.keys(TIPOS).reduce((acc, tipo) => {
    acc[tipo] = mensagens.filter(m => m.tipo === tipo).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MessageSquareWarning className="w-5 h-5 text-blue-600" /> Ouvidoria
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Canal anônimo — não é possível identificar quem enviou cada mensagem.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFiltroTipo("todos")}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
          style={{
            background: filtroTipo === "todos" ? "#1e40af" : "white",
            color: filtroTipo === "todos" ? "white" : "#64748b",
            borderColor: filtroTipo === "todos" ? "#1e40af" : "#e2e8f0",
          }}>
          Todos ({mensagens.length})
        </button>
        {Object.entries(TIPOS).map(([key, t]) => (
          <button key={key} onClick={() => setFiltroTipo(key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
            style={{
              background: filtroTipo === key ? t.bg : "white",
              color: filtroTipo === key ? t.text : "#64748b",
              borderColor: filtroTipo === key ? t.text : "#e2e8f0",
            }}>
            {t.icon} {t.label} ({contagens[key] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : mensagensFiltradas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma mensagem nessa categoria.</Card>
      ) : (
        <div className="space-y-3">
          {mensagensFiltradas.map((m) => {
            const t = TIPOS[m.tipo] || TIPOS.sugestao;
            const statusInfo = STATUS_OPTIONS.find(s => s.value === m.status) || STATUS_OPTIONS[0];
            return (
              <Card key={m.id} className="p-4">
                <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{t.icon}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: t.bg, color: t.text }}>
                      {t.label}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{m.protocolo}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={m.status}
                      onChange={(e) => atualizarStatus(m.id, e.target.value)}
                      className="text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer"
                      style={{ background: statusInfo.bg, color: statusInfo.text }}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <button
                      onClick={() => excluirMensagem(m.id, m.protocolo)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Excluir mensagem"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-2">
                  {new Date(m.created_at).toLocaleString("pt-BR")}
                </p>

                <div className="p-3 rounded-lg bg-muted/30 text-sm mb-3">
                  {m.mensagem}
                </div>

                {m.resposta ? (
                  <div className="p-3 rounded-lg" style={{ background: "#eff6ff" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-1">Sua resposta</p>
                    <p className="text-sm text-blue-800">{m.resposta}</p>
                    <p className="text-[10px] text-blue-400 mt-1">
                      Respondido em {m.respondido_em && new Date(m.respondido_em).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={respostaTexto[m.id] || ""}
                      onChange={(e) => setRespostaTexto(prev => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="Escreva uma resposta (opcional — o funcionário verá ao consultar o protocolo)..."
                      className="w-full h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                    />
                    <Button size="sm" onClick={() => enviarResposta(m.id)} disabled={enviandoResposta === m.id} className="gap-2">
                      <Send className="w-3.5 h-3.5" />
                      {enviandoResposta === m.id ? "Enviando..." : "Responder"}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}