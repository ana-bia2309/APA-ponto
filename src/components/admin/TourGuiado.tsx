import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

interface Passo {
  titulo: string;
  descricao: string;
  emoji: string;
  destaque?: string;
}

const PASSOS: Passo[] = [
  {
    emoji: "👋",
    titulo: "Bem-vindo ao APA Ponto!",
    descricao: "Este é o painel de administração do sistema de ponto da APA Refrigeração. Vamos fazer um tour rápido para você conhecer as principais funcionalidades!",
  },
  {
    emoji: "📊",
    titulo: "Dashboard",
    descricao: "Aqui você acompanha em tempo real quem está online, em pausa, atrasado ou ausente. Os cards se atualizam automaticamente a cada minuto.",
    destaque: "dashboard",
  },
  {
    emoji: "🖥️",
    titulo: "Centro de Operações",
    descricao: "Torre de controle com cards individuais de cada colaborador. Filtre por status e use a busca para encontrar alguém rapidamente.",
    destaque: "centro-operacoes",
  },
  {
    emoji: "📈",
    titulo: "Panorama da Empresa",
    descricao: "Dashboard executivo com KPIs, gráfico de presença semanal, top pontuais e saúde organizacional. Ideal para reuniões e relatórios.",
    destaque: "panorama",
  },
  {
    emoji: "👥",
    titulo: "Funcionários",
    descricao: "Cadastre e gerencie colaboradores com foto, cargo, endereço e data de nascimento. Use o botão de edição para atualizar qualquer informação.",
    destaque: "employees",
  },
  {
    emoji: "🕐",
    titulo: "Registros de Ponto",
    descricao: "Visualize, corrija e exporte os registros de ponto. É possível fazer ajustes manuais com justificativa.",
    destaque: "records",
  },
  {
    emoji: "📋",
    titulo: "Pessoas & Gestão",
    descricao: "Gerencie atestados, solicitações dos colaboradores, avisos da empresa, onboarding de novos funcionários e documentos.",
    destaque: "justifications",
  },
  {
    emoji: "🤖",
    titulo: "Inteligência Artificial",
    descricao: "O sistema possui detector de anomalias, previsão de atrasos, detector de sobrecarga e mapa de calor — tudo baseado nos dados históricos.",
    destaque: "anomalias",
  },
  {
    emoji: "💰",
    titulo: "Folha de Pagamento",
    descricao: "Gerencie banco de horas, espelhos de ponto, holerites e fechamento mensal. Configure os parâmetros da folha conforme a CLT.",
    destaque: "payroll-dashboard",
  },
  {
    emoji: "🔐",
    titulo: "Controle de Acesso",
    descricao: "Em Sistema → Usuários você cria e gerencia acessos. Em Permissões você visualiza o perfil de cada usuário (Admin, RH, Supervisor ou Operacional).",
    destaque: "users",
  },
  {
    emoji: "🎉",
    titulo: "Tudo Pronto!",
    descricao: "Você já conhece as principais funcionalidades do APA Ponto! Se precisar de ajuda, use o Assistente IA na aba Relatórios & IA. Bom trabalho!",
  },
];

interface Props {
  onClose: () => void;
  onNavigate?: (tab: string) => void;
}

export default function TourGuiado({ onClose, onNavigate }: Props) {
  const [passo, setPasso] = useState(0);
  const [animando, setAnimando] = useState(false);

  const atual = PASSOS[passo];
  const isUltimo = passo === PASSOS.length - 1;
  const isPrimeiro = passo === 0;

  const irPara = (novoPasso: number) => {
    setAnimando(true);
    setTimeout(() => {
      setPasso(novoPasso);
      setAnimando(false);
      if (PASSOS[novoPasso].destaque && onNavigate) {
        onNavigate(PASSOS[novoPasso].destaque!);
      }
    }, 150);
  };

 const fechar = async () => {
    localStorage.setItem("amr_tour_concluido", "true");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any)
          .from("profiles")
          .update({ tour_concluido: true })
          .eq("user_id", user.id);
      }
    } catch {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden"
        style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        {/* Header */}
        <div className="relative p-6 pb-4" style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
          <button onClick={fechar}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-blue-200" />
            <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">Tour Guiado</p>
          </div>
          <p className="text-white text-xs">{passo + 1} de {PASSOS.length}</p>
          {/* Barra de progresso */}
          <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${((passo + 1) / PASSOS.length) * 100}%` }} />
          </div>
        </div>

        {/* Conteúdo */}
        <div className={`p-6 transition-opacity duration-150 ${animando ? "opacity-0" : "opacity-100"}`}>
          <div className="text-center mb-6">
            <span className="text-5xl">{atual.emoji}</span>
            <h3 className="text-lg font-black text-gray-800 mt-3">{atual.titulo}</h3>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{atual.descricao}</p>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-1.5 mb-6">
            {PASSOS.map((_, i) => (
              <button key={i} onClick={() => irPara(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === passo ? "20px" : "6px",
                  height: "6px",
                  background: i === passo ? "#1e40af" : i < passo ? "#bfdbfe" : "#e2e8f0",
                }} />
            ))}
          </div>

          {/* Botões */}
          <div className="flex gap-3">
            {!isPrimeiro && (
              <button onClick={() => irPara(passo - 1)}
                className="flex-1 h-11 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
            )}
            {!isUltimo ? (
              <button onClick={() => irPara(passo + 1)}
                className="flex-1 h-11 rounded-2xl text-sm font-bold text-white transition-all hover:shadow-lg flex items-center justify-center gap-1"
                style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={fechar}
                className="flex-1 h-11 rounded-2xl text-sm font-bold text-white transition-all hover:shadow-lg"
                style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)" }}>
                🎉 Começar!
              </button>
            )}
          </div>

          <button onClick={fechar} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Pular tour
          </button>
        </div>
      </div>
    </div>
  );
}