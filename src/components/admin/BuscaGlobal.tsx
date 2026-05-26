import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, User, FileText, HardHat, Shirt, Wrench, Clock } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  cpf?: string | null;
  matricula?: string | null;
  cargo?: string | null;
  departamento?: string | null;
  shift?: string | null;
}

interface Resultado {
  tipo: "funcionario" | "registro" | "epi" | "uniforme" | "ferramenta";
  id: string;
  titulo: string;
  subtitulo: string;
  acao: () => void;
}

interface Props {
  employees: Employee[];
  onNavigate: (tab: string) => void;
  onClose: () => void;
}

export default function BuscaGlobal({ employees, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buscar = useCallback((q: string) => {
    if (!q.trim()) { setResultados([]); return; }
    const term = q.toLowerCase().replace(/\D/g, q.replace(/\D/g, "").length >= 3 ? "" : q.toLowerCase());
    const termRaw = q.toLowerCase();

    const res: Resultado[] = [];

    // Busca funcionários
    employees.forEach(emp => {
      const cpfDigits = (emp.cpf || "").replace(/\D/g, "");
      const matchName = emp.name.toLowerCase().includes(termRaw);
      const matchCpf = cpfDigits.includes(q.replace(/\D/g, "")) && q.replace(/\D/g, "").length >= 3;
      const matchMatricula = (emp.matricula || "").toLowerCase().includes(termRaw);
      const matchCargo = (emp.cargo || "").toLowerCase().includes(termRaw);
      const matchDepartamento = (emp.departamento || "").toLowerCase().includes(termRaw);

      if (matchName || matchCpf || matchMatricula || matchCargo || matchDepartamento) {
        const subs = [
          emp.cargo,
          emp.departamento,
          emp.matricula ? `Mat: ${emp.matricula}` : null,
          emp.shift === "noturno" ? "Noturno" : "Diurno",
        ].filter(Boolean).join(" · ");

        res.push({
          tipo: "funcionario",
          id: emp.id,
          titulo: emp.name,
          subtitulo: subs || "Funcionário",
          acao: () => { onNavigate("employees"); onClose(); },
        });
      }
    });

    // Atalhos de menu
    const menuItems = [
      { key: "dashboard", label: "Dashboard", sub: "Visão geral do dia" },
      { key: "records", label: "Registros de Ponto", sub: "Ver todos os registros" },
      { key: "justifications", label: "Atestados", sub: "Justificativas de falta" },
      { key: "espelho-ponto", label: "Espelho de Ponto", sub: "Folha mensal" },
      { key: "banco-horas", label: "Banco de Horas", sub: "Saldo de horas" },
      { key: "exportacoes", label: "Exportações", sub: "PDF e Excel" },
      { key: "aprovacoes-lote", label: "Aprovações em Lote", sub: "Fechar espelhos em lote" },
      { key: "mapa-localizacao", label: "Mapa de Localização", sub: "Ver onde bateu ponto" },
      { key: "documentos", label: "Documentos", sub: "Centro de documentos" },
      { key: "assistente", label: "Assistente IA", sub: "Perguntas sobre RH" },
      { key: "epi-deliveries", label: "EPIs", sub: "Entregas de EPI" },
      { key: "uniforms-deliveries", label: "Uniformes", sub: "Entregas de uniforme" },
      { key: "tools-loans", label: "Ferramentas", sub: "Empréstimos" },
      { key: "payslips", label: "Holerites", sub: "Folha de pagamento" },
      { key: "simulador", label: "Simulador de Folha", sub: "Simular salário" },
    ];

    menuItems.forEach(item => {
      if (item.label.toLowerCase().includes(termRaw) || item.sub.toLowerCase().includes(termRaw)) {
        res.push({
          tipo: "registro",
          id: item.key,
          titulo: item.label,
          subtitulo: item.sub,
          acao: () => { onNavigate(item.key); onClose(); },
        });
      }
    });

    setResultados(res.slice(0, 8));
    setSelected(0);
  }, [employees, onNavigate, onClose]);

  useEffect(() => { buscar(query); }, [query, buscar]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, resultados.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && resultados[selected]) { resultados[selected].acao(); }
    if (e.key === "Escape") { onClose(); }
  };

  const iconFor = (tipo: Resultado["tipo"]) => {
    if (tipo === "funcionario") return <User className="w-4 h-4 text-blue-500" />;
    if (tipo === "epi") return <HardHat className="w-4 h-4 text-amber-500" />;
    if (tipo === "uniforme") return <Shirt className="w-4 h-4 text-purple-500" />;
    if (tipo === "ferramenta") return <Wrench className="w-4 h-4 text-orange-500" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="w-full max-w-xl bg-background rounded-2xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Buscar funcionário, CPF, matrícula, setor ou tela..."
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">Esc</kbd>
        </div>

        {/* Resultados */}
        {resultados.length > 0 ? (
          <div className="py-2 max-h-80 overflow-y-auto">
            {resultados.map((r, i) => (
              <button key={`${r.tipo}-${r.id}`} onClick={r.acao}
                onMouseEnter={() => setSelected(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${selected === i ? "bg-muted" : "hover:bg-muted/50"}`}>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  {iconFor(r.tipo)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{r.titulo}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.subtitulo}</p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                  {r.tipo === "funcionario" ? "Funcionário" : "Ir para"}
                </span>
              </button>
            ))}
          </div>
        ) : query ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum resultado para "{query}"</p>
          </div>
        ) : (
          <div className="py-6 px-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sugestões rápidas</p>
            <div className="grid grid-cols-2 gap-2">
              {["Dashboard", "Registros", "Espelho de Ponto", "Banco de Horas", "Exportações", "Aprovações em Lote"].map(s => (
                <button key={s} onClick={() => setQuery(s)}
                  className="text-left text-sm px-3 py-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[11px] text-muted-foreground">
          <span><kbd className="px-1 border border-border rounded">↑↓</kbd> navegar</span>
          <span><kbd className="px-1 border border-border rounded">Enter</kbd> selecionar</span>
          <span><kbd className="px-1 border border-border rounded">Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}