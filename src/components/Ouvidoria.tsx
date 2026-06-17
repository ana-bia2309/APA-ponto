import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, MessageSquareWarning, Send, Search, Copy, CheckCircle2, Clock } from "lucide-react";

interface Props {
  onClose: () => void;
}

const TIPOS = [
  { value: "reclamacao", label: "Reclamação", icon: "😕", bg: "#fff7ed", text: "#c2410c" },
  { value: "denuncia", label: "Denúncia", icon: "🚨", bg: "#fff1f2", text: "#be123c" },
  { value: "elogio", label: "Elogio", icon: "👏", bg: "#f0fdf4", text: "#15803d" },
  { value: "sugestao", label: "Sugestão", icon: "💡", bg: "#eff6ff", text: "#1e40af" },
];

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  novo: { label: "Recebido", bg: "#f1f5f9", text: "#475569" },
  em_analise: { label: "Em análise", bg: "#fef3c7", text: "#b45309" },
  respondido: { label: "Respondido", bg: "#d1fae5", text: "#065f46" },
  arquivado: { label: "Arquivado", bg: "#f1f5f9", text: "#64748b" },
};

export default function Ouvidoria({ onClose }: Props) {
  const [modo, setModo] = useState<"menu" | "enviar" | "consultar">("menu");

  // Envio
  const [tipo, setTipo] = useState("sugestao");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [protocoloGerado, setProtocoloGerado] = useState<string | null>(null);

  // Consulta
  const [protocoloBusca, setProtocoloBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const enviar = async () => {
    if (!mensagem.trim()) { toast.error("Escreva sua mensagem."); return; }
    setEnviando(true);
    try {
      const { data: protocoloData, error: protocoloError } = await (supabase as any).rpc("gerar_protocolo_ouvidoria");
      if (protocoloError) throw protocoloError;

      const { error } = await (supabase as any).from("ouvidoria_mensagens").insert({
        protocolo: protocoloData,
        tipo,
        mensagem: mensagem.trim(),
      });
      if (error) throw error;

      setProtocoloGerado(protocoloData);
      setMensagem("");
    } catch (e: any) {
      toast.error("Erro ao enviar: " + e.message);
    } finally {
      setEnviando(false);
    }
  };

  const buscar = async () => {
    const codigo = protocoloBusca.trim().toUpperCase();
    if (!codigo) { toast.error("Digite o código de protocolo."); return; }
    setBuscando(true);
    setNaoEncontrado(false);
    setResultado(null);
    try {
      const { data, error } = await (supabase as any)
        .from("ouvidoria_mensagens")
        .select("protocolo, tipo, mensagem, resposta, status, created_at, respondido_em")
        .eq("protocolo", codigo)
        .maybeSingle();
      if (error) throw error;
      if (!data) { setNaoEncontrado(true); return; }
      setResultado(data);
    } catch (e: any) {
      toast.error("Erro ao buscar: " + e.message);
    } finally {
      setBuscando(false);
    }
  };

  const copiarProtocolo = () => {
    if (!protocoloGerado) return;
    navigator.clipboard.writeText(protocoloGerado);
    toast.success("Protocolo copiado!");
  };

  // ── Tela de sucesso após envio ──
  if (protocoloGerado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 text-center" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "#f0fdf4" }}>
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <h2 className="text-lg font-black text-gray-800 mb-2">Mensagem enviada!</h2>
          <p className="text-xs text-gray-400 mb-4">
            Guarde este código para acompanhar sua mensagem depois. Ele é a única forma de consultar uma resposta — não pedimos seu nome.
          </p>
          <div className="flex items-center justify-center gap-2 bg-gray-50 rounded-xl py-3 px-4 mb-4">
            <span className="text-xl font-black tracking-wider text-blue-700">{protocoloGerado}</span>
            <button onClick={copiarProtocolo} className="p-1.5 rounded-lg hover:bg-gray-200">
              <Copy className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <button
            onClick={() => { setProtocoloGerado(null); setModo("menu"); }}
            className="w-full h-12 rounded-xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}
          >
            Concluir
          </button>
        </div>
      </div>
    );
  }

  // ── Tela de envio ──
  if (modo === "enviar") {
    const tipoAtual = TIPOS.find(t => t.value === tipo) || TIPOS[0];
    return (
      <div className="min-h-screen flex flex-col px-4 py-6" style={{ background: "#F0F4F8" }}>
        <div className="w-full max-w-md mx-auto" style={{ marginTop: "28px" }}>
          <button onClick={() => setModo("menu")} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <h2 className="text-lg font-black text-gray-800 mb-1">Nova mensagem</h2>
          <p className="text-xs text-gray-400 mb-5">100% anônimo — não coletamos seu nome, CPF ou qualquer identificação.</p>

          <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Tipo</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {TIPOS.map(t => (
                <button key={t.value} onClick={() => setTipo(t.value)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left"
                  style={{
                    background: tipo === t.value ? t.bg : "white",
                    borderColor: tipo === t.value ? t.text : "#e2e8f0",
                  }}>
                  <span>{t.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: tipo === t.value ? t.text : "#64748b" }}>{t.label}</span>
                </button>
              ))}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Mensagem</p>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Escreva aqui com detalhes..."
              className="w-full h-32 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400/40 resize-none"
            />
          </div>

          <button
            onClick={enviar}
            disabled={enviando}
            className="w-full h-12 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}
          >
            <Send className="w-4 h-4" />
            {enviando ? "Enviando..." : "Enviar Anonimamente"}
          </button>
        </div>
      </div>
    );
  }

  // ── Tela de consulta ──
  if (modo === "consultar") {
    return (
      <div className="min-h-screen flex flex-col px-4 py-6" style={{ background: "#F0F4F8" }}>
        <div className="w-full max-w-md mx-auto" style={{ marginTop: "28px" }}>
          <button onClick={() => { setModo("menu"); setResultado(null); setNaoEncontrado(false); setProtocoloBusca(""); }}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <h2 className="text-lg font-black text-gray-800 mb-1">Consultar protocolo</h2>
          <p className="text-xs text-gray-400 mb-5">Digite o código que você recebeu ao enviar sua mensagem.</p>

          <div className="bg-white rounded-2xl p-5 mb-4 flex gap-2" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <input
              value={protocoloBusca}
              onChange={(e) => setProtocoloBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder="OUV-XXXXXX"
              className="flex-1 h-11 rounded-xl border border-gray-200 px-4 text-sm text-center font-bold tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            />
            <button onClick={buscar} disabled={buscando} className="h-11 px-4 rounded-xl text-white font-bold text-sm flex items-center gap-1.5"
              style={{ background: "#1e40af" }}>
              <Search className="w-4 h-4" /> {buscando ? "..." : "Buscar"}
            </button>
          </div>

          {naoEncontrado && (
            <div className="bg-white rounded-2xl p-5 text-center" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <p className="text-sm text-gray-500">Nenhuma mensagem encontrada com esse protocolo.</p>
            </div>
          )}

          {resultado && (
            <div className="bg-white rounded-2xl p-5 space-y-3" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">{resultado.protocolo}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: STATUS_LABELS[resultado.status].bg, color: STATUS_LABELS[resultado.status].text }}>
                  {STATUS_LABELS[resultado.status].label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" /> Enviado em {new Date(resultado.created_at).toLocaleDateString("pt-BR")}
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-sm text-gray-700">{resultado.mensagem}</p>
              </div>
              {resultado.resposta ? (
                <div className="rounded-xl p-3" style={{ background: "#eff6ff" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-1">Resposta</p>
                  <p className="text-sm text-blue-800">{resultado.resposta}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Ainda sem resposta. Consulte novamente mais tarde.</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Menu principal ──
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
      <div className="w-full max-w-sm">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar ao ponto
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
            <MessageSquareWarning className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-black text-gray-800">Ouvidoria</h2>
          <p className="text-xs text-gray-400 mt-1">Canal 100% anônimo e confidencial</p>
        </div>

        <div className="space-y-3">
          <button onClick={() => setModo("enviar")}
            className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 text-left transition-all hover:-translate-y-0.5"
            style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#eff6ff" }}>
              <Send className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Enviar mensagem</p>
              <p className="text-xs text-gray-400">Reclamação, denúncia, elogio ou sugestão</p>
            </div>
          </button>

          <button onClick={() => setModo("consultar")}
            className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 text-left transition-all hover:-translate-y-0.5"
            style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#f0fdf4" }}>
              <Search className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Consultar protocolo</p>
              <p className="text-xs text-gray-400">Ver status ou resposta de um envio anterior</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}