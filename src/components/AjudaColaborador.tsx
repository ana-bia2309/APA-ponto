import { useState } from "react";
import { ArrowLeft, ChevronDown, HelpCircle, Search } from "lucide-react";

interface Props {
  onClose: () => void;
}

interface Topico {
  emoji: string;
  titulo: string;
  conteudo: string[];
}

const TOPICOS: Topico[] = [
  {
    emoji: "🔑",
    titulo: "Primeiros passos — como entrar no app",
    conteudo: [
      "Escolha sua equipe (Diurna ou Noturna) de acordo com seu turno.",
      "Selecione seu nome na lista.",
      "Se for a primeira vez no dia, digite seu CPF para confirmar.",
      "Pronto! Você já está na tela principal.",
    ],
  },
  {
    emoji: "🕐",
    titulo: "Registrando seu ponto",
    conteudo: [
      "Toque no botão azul \"REGISTRAR PONTO\" sempre que precisar bater Entrada, Intervalo, Retorno ou Saída.",
      "A câmera abre para você tirar uma foto de confirmação.",
      "Sua localização é registrada automaticamente — isso protege você e a empresa.",
      "Alguns colaboradores têm jornada simplificada (só Entrada e Saída), conforme o cargo.",
    ],
  },
  {
    emoji: "📋",
    titulo: "Histórico — pontos, banco de horas, férias e afastamentos",
    conteudo: [
      "Toque em \"Histórico\" para ver 4 abas: Pontos, Banco de Horas, Férias e Afastamentos.",
      "A aba Pontos mostra seus últimos 30 dias de registro.",
      "A aba Férias mostra quantos dias você tem disponíveis.",
      "A aba Afastamentos mostra licenças e atestados registrados em seu nome.",
    ],
  },
  {
    emoji: "🏦",
    titulo: "Banco de horas",
    conteudo: [
      "Saldo positivo (verde): você trabalhou mais horas do que o esperado.",
      "Saldo negativo (vermelho): você trabalhou menos horas do que o esperado.",
      "Em caso de dúvida sobre como usar seu saldo, converse com o RH.",
    ],
  },
  {
    emoji: "📅",
    titulo: "Calendário do mês",
    conteudo: [
      "Verde = dia trabalhado, Vermelho = falta, Laranja = atestado.",
      "Azul = férias, Cinza = fim de semana, Amarelo = feriado.",
      "Toque em qualquer dia para ver mais detalhes.",
    ],
  },
  {
    emoji: "✋",
    titulo: "Solicitações rápidas (férias, abono, declaração, ajuste)",
    conteudo: [
      "Use os botões de Férias, Abono, Declaração ou Ajuste de Ponto na tela principal.",
      "Escreva uma observação explicando seu pedido.",
      "Acompanhe o status (Pendente, Aprovado, Recusado) em \"Minhas Solicitações\".",
    ],
  },
  {
    emoji: "📢",
    titulo: "Avisos da empresa",
    conteudo: [
      "Comunicados aparecem coloridos por urgência: azul (informativo), laranja (alerta), vermelho (urgente), verde (evento).",
      "Alguns avisos pedem confirmação de leitura — importante principalmente para avisos de segurança.",
    ],
  },
  {
    emoji: "✍️",
    titulo: "Documentos para assinatura",
    conteudo: [
      "Quando a empresa precisa que você assine um documento, ele aparece como card na tela principal.",
      "Leia o conteúdo, marque que está de acordo, e desenhe sua assinatura no quadro.",
      "Sua assinatura fica registrada com data e hora.",
    ],
  },
  {
    emoji: "🦺",
    titulo: "EPIs, uniformes e ferramentas",
    conteudo: [
      "Sempre que receber um item da empresa, você precisa confirmar digitalmente.",
      "Leia o termo de responsabilidade e desenhe sua assinatura.",
      "Isso protege você: fica registrado oficialmente o que e quando você recebeu.",
    ],
  },
  {
    emoji: "💰",
    titulo: "Holerite e espelho de ponto",
    conteudo: [
      "Todo mês, depois do fechamento, seu holerite fica disponível para assinatura no app.",
      "O espelho de ponto (resumo mensal de registros) funciona do mesmo jeito.",
      "Você pode acessar holerites anteriores na seção \"Documentos\".",
    ],
  },
  {
    emoji: "📮",
    titulo: "Ouvidoria — canal 100% anônimo",
    conteudo: [
      "Use para reclamações, denúncias, elogios ou sugestões — sem se identificar.",
      "Ao enviar, você recebe um código de protocolo. Guarde-o!",
      "Use o protocolo depois para consultar se a empresa respondeu, em \"Consultar protocolo\".",
      "O sistema nunca salva quem enviou a mensagem.",
    ],
  },
  {
    emoji: "🎂",
    titulo: "Seu aniversário",
    conteudo: [
      "No dia do seu aniversário, você verá uma mensagem especial de parabéns da equipe APA.",
    ],
  },
  {
    emoji: "📡",
    titulo: "Modo offline — quando a internet falhar",
    conteudo: [
      "O app funciona mesmo sem internet — seus registros ficam salvos no celular.",
      "Quando a conexão voltar, tudo sincroniza automaticamente.",
      "Para isso funcionar, abra o app pelo menos uma vez conectado antes.",
    ],
  },
  {
    emoji: "❓",
    titulo: "Dúvidas frequentes",
    conteudo: [
      "Esqueci de bater um ponto: use \"Manual\" ou abra um \"Ajuste de Ponto\".",
      "Não é permitido bater ponto pelo celular de outra pessoa.",
      "\"Jornada Aberta\" significa que faltou registrar alguma etapa do dia — procure o RH.",
      "A Ouvidoria é mesmo anônima — sem nome, CPF ou qualquer identificação salva.",
      "Outras dúvidas: procure o setor de RH da APA.",
    ],
  },
];

export default function AjudaColaborador({ onClose }: Props) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);

  const filtrados = TOPICOS.filter((t) => {
    const termo = busca.toLowerCase().trim();
    if (!termo) return true;
    return t.titulo.toLowerCase().includes(termo) || t.conteudo.some(c => c.toLowerCase().includes(termo));
  });

  return (
    <div className="min-h-screen flex flex-col px-4 py-6" style={{ background: "#F0F4F8" }}>
      <div className="w-full max-w-md mx-auto" style={{ marginTop: "12px" }}>
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
            <HelpCircle className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-black text-gray-800">Central de Ajuda</h2>
          <p className="text-xs text-gray-400 mt-1">Tudo sobre o seu app, resumido por tópico</p>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar um assunto..."
            className="w-full h-11 rounded-xl border border-gray-200 pl-10 pr-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40"
          />
        </div>

        <div className="space-y-2">
          {filtrados.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-sm text-gray-400" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              Nenhum tópico encontrado para "{busca}".
            </div>
          ) : (
            filtrados.map((t, idx) => {
              const realIdx = TOPICOS.indexOf(t);
              const expandido = aberto === realIdx;
              return (
                <div key={realIdx} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                  <button
                    onClick={() => setAberto(expandido ? null : realIdx)}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{t.emoji}</span>
                      <span className="text-sm font-bold text-gray-800">{t.titulo}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expandido ? "rotate-180" : ""}`} />
                  </button>
                  {expandido && (
                    <div className="px-4 pb-4">
                      <ul className="space-y-1.5">
                        {t.conteudo.map((linha, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                            <span className="text-blue-400 mt-0.5">•</span>
                            <span>{linha}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          Ainda com dúvidas? Procure o setor de RH da APA.
        </p>
      </div>
    </div>
  );
}