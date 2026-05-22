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
  "Quantos funcionários estão ativos?",
  "Quais funcionários estão no turno noturno?",
  "Quais são as leis sobre horas extras no Brasil?",
  "Como calcular INSS e IRRF?",
  "O que é banco de horas?",
];

async function buscarContexto() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: employees } = await supabase
    .from("employees")
    .select("name, cargo, departamento, shift, punch_mode, active")
    .eq("active", true);

  const { data: justifications } = await supabase
    .from("justifications" as any)
    .select("*")
    .gte("date", `${year}-${String(month).padStart(2, "0")}-01`);

  const { data: timeRecords } = await supabase
    .from("time_records")
    .select("employee_id, record_type, recorded_at")
    .gte("recorded_at", `${year}-${String(month).padStart(2, "0")}-01`);

  return { employees: employees || [], justifications: justifications || [], timeRecords: timeRecords || [], year, month };
}

export default function AssistenteIA() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      role: "assistant",
      content: "Olá! Sou o assistente de RH da AMR Ponto. Posso te ajudar com qualquer dúvida — sobre os funcionários, legislação trabalhista, cálculos de folha, ou qualquer outro assunto. O que você gostaria de saber?",
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
    const historicoAtualizado = [...mensagens, novaMensagem];
    setMensagens(historicoAtualizado);
    setLoading(true);

    try {
      const ctx = await buscarContexto();

      const sistemaPrompt = `Você é um assistente de RH inteligente da empresa AMR Refrigeração e Climatização, integrado ao sistema AMR Ponto.

Dados atuais do sistema (${ctx.month}/${ctx.year}):
- Funcionários ativos: ${ctx.employees.length}
- Turno diurno: ${ctx.employees.filter((e: any) => e.shift === "diurno" || e.shift === "Diurno").length}
- Turno noturno: ${ctx.employees.filter((e: any) => e.shift === "noturno" || e.shift === "Noturno").length}
- Lista de funcionários: ${ctx.employees.map((e: any) => `${e.name} (${e.shift}, ${e.cargo || "sem cargo"})`).join(", ")}
- Registros de ponto este mês: ${ctx.timeRecords.length}
- Atestados este mês: ${ctx.justifications.length}

Você pode responder sobre:
1. Dados dos funcionários acima
2. Legislação trabalhista brasileira (CLT, INSS, IRRF, FGTS, horas extras, banco de horas, etc.)
3. Qualquer outro assunto que o usuário perguntar
4. Dúvidas gerais de RH e gestão de pessoas

Responda sempre em português, de forma clara e objetiva. Se não souber algo, diga honestamente.`;

      const mensagensParaAPI = historicoAtualizado.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data: funcData, error: funcError } = await supabase.functions.invoke("chat-ia", {
        body: {
          system: sistemaPrompt,
          messages: mensagensParaAPI,
        },
      });

      if (funcError) throw funcError;
      const resposta = funcData?.content || "Não consegui gerar uma resposta. Tente novamente.";
      setMensagens((prev) => [...prev, { role: "assistant", content: resposta }]);
    } catch (err) {
      setMensagens((prev) => [...prev, { role: "assistant", content: "Erro ao conectar com a IA. Tente novamente." }]);
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
                <span className="text-sm text-muted-foreground">Pensando...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="p-4 border-t border-border flex gap-2">
          <Input placeholder="Pergunte qualquer coisa..." value={input}
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