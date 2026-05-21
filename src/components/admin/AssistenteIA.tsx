import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Mensagem {
  role: "user" | "assistant";
  content: string;
}

const SUGESTOES = [
  "Quais funcionários tiveram mais faltas este mês?",
  "Qual o custo total da folha de maio?",
  "Quantos funcionários estão no turno noturno?",
  "Qual funcionário tem maior salário líquido?",
  "Resumo geral da folha de pagamento",
];

async function buscarContexto() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [empRes, periodRes] = await Promise.all([
    supabase.from("employees").select("name, cargo, departamento, shift, punch_mode, active").eq("active", true),
    (supabase as any).from("payroll_periods").select("id, status").eq("year", year).eq("month", month).maybeSingle(),
  ]);

  const employees = empRes.data || [];
  let payslips: any[] = [];

  if (periodRes.data) {
    const { data: ps } = await (supabase as any)
      .from("payslips")
      .select("*, employees(name, cargo, departamento)")
      .eq("period_id", periodRes.data.id);
    payslips = ps || [];
  }

  return { employees, payslips, year, month };
}

export default function AssistenteIA() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      role: "assistant",
      content: "Olá! Sou o assistente de RH da APA Ponto. Posso te ajudar a analisar dados de funcionários, folha de pagamento, horas extras e muito mais. O que você gostaria de saber?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const enviar = async (texto?: string) => {
    const pergunta = texto || input;
    if (!pergunta.trim() || loading) return;
    setInput("");

    const novaMensagem: Mensagem = { role: "user", content: pergunta };
    setMensagens((prev) => [...prev, novaMensagem]);
    setLoading(true);

    try {
      const ctx = await buscarContexto();
      let resposta = "";
      const perguntaLower = pergunta.toLowerCase();

      if (perguntaLower.includes("noturno")) {
        const noturnos = ctx.employees.filter((e: any) => e.shift === "noturno");
        resposta = `Há ${noturnos.length} funcionário(s) no turno noturno:\n${noturnos.map((e: any) => `- ${e.name}`).join("\n")}`;
      } else if (perguntaLower.includes("diurno")) {
        const diurnos = ctx.employees.filter((e: any) => e.shift === "diurno");
        resposta = `Há ${diurnos.length} funcionário(s) no turno diurno:\n${diurnos.map((e: any) => `- ${e.name}`).join("\n")}`;
      } else if (perguntaLower.includes("custo") || perguntaLower.includes("folha")) {
        if (ctx.payslips.length === 0) {
          resposta = `Não há folha calculada para ${ctx.month}/${ctx.year}.`;
        } else {
          const total = ctx.payslips.reduce((a: number, p: any) => a + Number(p.total_proventos || 0), 0);
          const liquido = ctx.payslips.reduce((a: number, p: any) => a + Number(p.liquido || 0), 0);
          const fgts = ctx.payslips.reduce((a: number, p: any) => a + Number(p.fgts_mes || 0), 0);
          resposta = `Resumo da folha ${ctx.month}/${ctx.year}:\n- Total proventos: R$ ${total.toFixed(2)}\n- Total líquido: R$ ${liquido.toFixed(2)}\n- Total FGTS: R$ ${fgts.toFixed(2)}\n- Funcionários: ${ctx.payslips.length}`;
        }
      } else if (perguntaLower.includes("falta")) {
        if (ctx.payslips.length === 0) {
          resposta = `Não há dados de folha para ${ctx.month}/${ctx.year}.`;
        } else {
          const comFaltas = ctx.payslips.filter((p: any) => Number(p.faltas_dias) > 0).sort((a: any, b: any) => Number(b.faltas_dias) - Number(a.faltas_dias));
          if (comFaltas.length === 0) {
            resposta = `Nenhum funcionário teve faltas em ${ctx.month}/${ctx.year}.`;
          } else {
            const emp = (p: any) => (Array.isArray(p.employees) ? p.employees[0] : p.employees)?.name || "—";
            resposta = `Funcionários com faltas em ${ctx.month}/${ctx.year}:\n${comFaltas.map((p: any) => `- ${emp(p)}: ${p.faltas_dias} dia(s)`).join("\n")}`;
          }
        }
      } else if (perguntaLower.includes("hora extra")) {
        if (ctx.payslips.length === 0) {
          resposta = `Não há dados de folha para ${ctx.month}/${ctx.year}.`;
        } else {
          const comExtras = ctx.payslips.filter((p: any) => Number(p.horas_extras_50) > 0 || Number(p.horas_extras_100) > 0).sort((a: any, b: any) => (Number(b.horas_extras_50) + Number(b.horas_extras_100)) - (Number(a.horas_extras_50) + Number(a.horas_extras_100)));
          if (comExtras.length === 0) {
            resposta = `Nenhum funcionário teve horas extras em ${ctx.month}/${ctx.year}.`;
          } else {
            const emp = (p: any) => (Array.isArray(p.employees) ? p.employees[0] : p.employees)?.name || "—";
            resposta = `Horas extras em ${ctx.month}/${ctx.year}:\n${comExtras.map((p: any) => `- ${emp(p)}: ${Number(p.horas_extras_50).toFixed(1)}h (50%) + ${Number(p.horas_extras_100).toFixed(1)}h (100%)`).join("\n")}`;
          }
        }
      } else if (perguntaLower.includes("maior salário") || perguntaLower.includes("maior liquido")) {
        if (ctx.payslips.length === 0) {
          resposta = `Não há dados de folha para ${ctx.month}/${ctx.year}.`;
        } else {
          const maior = ctx.payslips.sort((a: any, b: any) => Number(b.liquido) - Number(a.liquido))[0];
          const emp = (Array.isArray(maior.employees) ? maior.employees[0] : maior.employees)?.name || "—";
          resposta = `O funcionário com maior salário líquido em ${ctx.month}/${ctx.year} é ${emp} com R$ ${Number(maior.liquido).toFixed(2)}.`;
        }
      } else if (perguntaLower.includes("quantos")) {
        resposta = `Há ${ctx.employees.length} funcionários ativos no sistema.`;
      } else if (perguntaLower.includes("resumo")) {
        const noturnos = ctx.employees.filter((e: any) => e.shift === "noturno").length;
        const diurnos = ctx.employees.filter((e: any) => e.shift === "diurno").length;
        resposta = `Resumo geral:\n- Funcionários ativos: ${ctx.employees.length}\n- Turno diurno: ${diurnos}\n- Turno noturno: ${noturnos}\n${ctx.payslips.length > 0 ? `- Folha ${ctx.month}/${ctx.year}: ${ctx.payslips.length} holerites calculados` : `- Folha ${ctx.month}/${ctx.year}: não calculada`}`;
      } else {
        resposta = `Não encontrei dados para essa pergunta. Tente perguntar sobre:\n- Funcionários por turno\n- Faltas do mês\n- Horas extras\n- Custo da folha\n- Resumo geral`;
      }

      setMensagens((prev) => [...prev, { role: "assistant", content: resposta }]);
    } catch (err) {
      setMensagens((prev) => [...prev, { role: "assistant", content: "Erro ao buscar dados. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Assistente IA de RH</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGESTOES.map((s) => (
          <button key={s} onClick={() => enviar(s)} disabled={loading}
            className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            {s}
          </button>
        ))}
      </div>
      <Card className="flex flex-col h-[500px]">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mensagens.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "assistant" ? "bg-primary/20" : "bg-muted"}`}>
                {msg.role === "assistant" ? <Bot className="w-4 h-4 text-primary" /> : <User className="w-4 h-4" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === "assistant" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>
                {msg.content.split("\n").map((line, j) => (
                  <p key={j} className={j > 0 ? "mt-1" : ""}>{line}</p>
                ))}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Analisando dados...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="p-4 border-t border-border flex gap-2">
          <Input placeholder="Faça uma pergunta sobre os dados..." value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()}
            disabled={loading} className="flex-1" />
          <Button onClick={() => enviar()} disabled={loading || !input.trim()} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}