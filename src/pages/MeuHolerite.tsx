import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Download, Eye, FileText, Loader2, Lock, Printer } from "lucide-react";
import { downloadPayslipPdf, printPayslipPdf, type PayslipPdfData } from "@/lib/payroll/generatePayslipPdf";

const fmt = (v: any) =>
  "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const maskCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function MeuHolerite() {
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [authed, setAuthed] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);

  const buscar = async () => {
    if (cpf.replace(/\D/g, "").length !== 11) {
      toast.error("CPF inválido");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_payslips_by_cpf" as any, { p_cpf: cpf });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Erro ao buscar holerites");
      return;
    }
    setList((data as any) || []);
    setAuthed(true);
    if (!data || (data as any).length === 0) {
      toast.info("Nenhum holerite disponível.");
    }
  };

  const years = useMemo(() => {
    const ys = Array.from(new Set(list.map((p) => p.year))).sort((a, b) => b - a);
    return ys;
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((p) =>
      (yearFilter === "all" || p.year === Number(yearFilter)) &&
      (monthFilter === "all" || p.month === Number(monthFilter))
    );
  }, [list, yearFilter, monthFilter]);

  const buildPdfData = (p: any, its: any[]): PayslipPdfData => ({
    funcionario: {
      nome: p.employee_name, cpf: p.cpf, cargo: p.cargo,
      matricula: p.matricula, departamento: p.departamento, admissao: p.data_admissao,
    },
    competencia: { mes: p.month, ano: p.year },
    itens: its.map((i) => ({
      code: i.code, description: i.description, reference: i.reference,
      kind: i.kind, amount: Number(i.amount),
    })),
    totais: {
      proventos: p.total_proventos, descontos: p.total_descontos, liquido: p.liquido,
      base_inss: p.base_inss, base_irrf: p.base_irrf, fgts_mes: p.fgts_mes,
    },
    banco_horas: {
      horas_trabalhadas: p.horas_trabalhadas,
      horas_extras_50: p.horas_extras_50,
      horas_extras_100: p.horas_extras_100,
      horas_noturnas: p.horas_noturnas,
      faltas_dias: p.faltas_dias,
    },
    signatureDataUrl: p.signature_url || undefined,
  });

  const fetchItems = async (p: any) => {
    const { data, error } = await supabase.rpc("get_payslip_items_by_cpf" as any, {
      p_cpf: cpf, p_payslip_id: p.payslip_id,
    });
    if (error) { toast.error(error.message); return []; }
    return (data as any) || [];
  };

  const openDetails = async (p: any) => {
    const its = await fetchItems(p);
    setItems(its);
    setSelected(p);
  };

  const downloadPdf = async (p: any) => {
    const its = await fetchItems(p);
    downloadPayslipPdf(buildPdfData(p, its));
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 backdrop-blur bg-card/80 border-border/60 shadow-xl">
          <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-3 h-3" /> Voltar
          </Link>
          <div className="text-center space-y-2 mb-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Meu Holerite</h1>
            <p className="text-sm text-muted-foreground">
              Informe seu CPF para acessar seus contracheques.
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <Label>CPF</Label>
              <Input
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                onKeyDown={(e) => e.key === "Enter" && buscar()}
              />
            </div>
            <Button className="w-full" onClick={buscar} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Acessar"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3 h-3" /> Voltar
            </Link>
            <h1 className="text-2xl font-bold mt-1">
              {list[0]?.employee_name || "Meus Holerites"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {list[0]?.cargo} {list[0]?.matricula && `· Matrícula ${list[0].matricula}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setAuthed(false); setList([]); setCpf(""); setSelected(null); }}>
            Sair
          </Button>
        </div>

        {selected ? (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold">
                  Competência {String(selected.month).padStart(2,"0")}/{selected.year}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Status: <span className="font-medium">{selected.status}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => printPayslipPdf(buildPdfData(selected, items))} className="gap-1">
                  <Printer className="w-4 h-4" /> Imprimir
                </Button>
                <Button size="sm" onClick={() => downloadPayslipPdf(buildPdfData(selected, items))} className="gap-1">
                  <Download className="w-4 h-4" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Voltar</Button>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-2">Cód.</th>
                  <th className="p-2">Descrição</th>
                  <th className="p-2">Ref.</th>
                  <th className="p-2 text-right">Provento</th>
                  <th className="p-2 text-right">Desconto</th>
                </tr>
              </thead>
              <tbody>
                {items.filter((i) => i.kind !== "informativo").map((i) => (
                  <tr key={i.id} className="border-t border-border/50">
                    <td className="p-2 text-muted-foreground">{i.code}</td>
                    <td className="p-2">{i.description}</td>
                    <td className="p-2 text-muted-foreground">{i.reference || ""}</td>
                    <td className="p-2 text-right text-emerald-400">
                      {i.kind === "provento" ? fmt(i.amount) : ""}
                    </td>
                    <td className="p-2 text-right text-rose-400">
                      {i.kind === "desconto" ? fmt(i.amount) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold">
                <tr>
                  <td colSpan={3} className="p-2 text-right">Totais</td>
                  <td className="p-2 text-right text-emerald-400">{fmt(selected.total_proventos)}</td>
                  <td className="p-2 text-right text-rose-400">{fmt(selected.total_descontos)}</td>
                </tr>
                <tr className="bg-primary/10">
                  <td colSpan={4} className="p-2 text-right">Líquido a Receber</td>
                  <td className="p-2 text-right text-lg font-bold">{fmt(selected.liquido)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-muted-foreground border-t border-border pt-3">
              <div>Base INSS: <strong className="text-foreground">{fmt(selected.base_inss)}</strong></div>
              <div>Base IRRF: <strong className="text-foreground">{fmt(selected.base_irrf)}</strong></div>
              <div>FGTS do Mês: <strong className="text-foreground">{fmt(selected.fgts_mes)}</strong></div>
              <div>Horas trab.: <strong className="text-foreground">{Number(selected.horas_trabalhadas||0).toFixed(2)}h</strong></div>
              <div>HE 50%: <strong className="text-foreground">{Number(selected.horas_extras_50||0).toFixed(2)}h</strong></div>
              <div>HE 100%: <strong className="text-foreground">{Number(selected.horas_extras_100||0).toFixed(2)}h</strong></div>
              <div>Noturnas: <strong className="text-foreground">{Number(selected.horas_noturnas||0).toFixed(2)}h</strong></div>
              <div>Faltas: <strong className="text-foreground">{Number(selected.faltas_dias||0)} dia(s)</strong></div>
            </div>
          </Card>
        ) : (
          <>
            <Card className="p-4 flex flex-wrap gap-3 items-end">
              <div>
                <Label>Ano</Label>
                <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="all">Todos</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <Label>Mês</Label>
                <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="all">Todos</option>
                  {Array.from({length:12},(_,i)=>i+1).map((m)=>(
                    <option key={m} value={m}>{String(m).padStart(2,"0")} — {MONTH_NAMES[m-1]}</option>
                  ))}
                </select>
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                {filtered.length} holerite(s)
              </div>
            </Card>

            {filtered.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Nenhum holerite encontrado para os filtros selecionados.
              </Card>
            ) : (
              <div className="space-y-2">
                {filtered.map((p) => (
                  <Card key={p.payslip_id} className="p-4 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {MONTH_NAMES[p.month-1]} / {p.year}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Líquido: <span className="text-foreground font-semibold">{fmt(p.liquido)}</span> ·
                          Status: {p.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => downloadPdf(p)} className="gap-1">
                        <Download className="w-4 h-4" /> PDF
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openDetails(p)} className="gap-1">
                        <Eye className="w-4 h-4" /> Detalhes
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
