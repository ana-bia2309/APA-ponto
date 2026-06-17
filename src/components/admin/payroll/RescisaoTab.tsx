import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calculator, FileDown, AlertTriangle, RefreshCw } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { calcularRescisao, type TipoRescisao, type RescisaoResult } from "@/lib/payroll/calculator";

type Employee = Tables<"employees">;

const TIPO_LABELS: Record<TipoRescisao, string> = {
  sem_justa_causa: "Sem Justa Causa (empresa demite)",
  pedido_demissao: "Pedido de Demissão (funcionário sai)",
  justa_causa: "Justa Causa (falta grave)",
  acordo_mutuo: "Acordo Mútuo (distrato)",
};

function contarMesesTrabalhados(dataAdmissao: string | null, dataRescisao: Date): number {
  if (!dataAdmissao) return 0;
  const admissao = new Date(dataAdmissao + "T12:00:00");
  const anoRescisao = dataRescisao.getFullYear();
  const anoAdmissao = admissao.getFullYear();

  let mesInicio = 1;
  if (anoAdmissao === anoRescisao) {
    const mesAdmissao = admissao.getMonth() + 1;
    const diaAdmissao = admissao.getDate();
    mesInicio = diaAdmissao > 15 ? mesAdmissao + 1 : mesAdmissao;
  }
  const mesFim = dataRescisao.getDate() > 15 ? dataRescisao.getMonth() + 2 : dataRescisao.getMonth() + 1;
  return Math.max(0, mesFim - mesInicio);
}

export default function RescisaoTab({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [tipo, setTipo] = useState<TipoRescisao>("sem_justa_causa");
  const [dataRescisao, setDataRescisao] = useState(new Date().toISOString().slice(0, 10));
  const [cumpriuAviso, setCumpriuAviso] = useState(false);
  const [feriasVencidasDias, setFeriasVencidasDias] = useState(0);
  const [saldoFgts, setSaldoFgts] = useState("0");
  const [fgtsEstimado, setFgtsEstimado] = useState(false);
  const [dependentesIrrf, setDependentesIrrf] = useState(0);
  const [salarioBase, setSalarioBase] = useState("0");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<RescisaoResult | null>(null);

  const employee = employees.find(e => e.id === employeeId);

  useEffect(() => {
    if (!employeeId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [settingsRes, fgtsRes, saldoFeriasRes] = await Promise.all([
          supabase.from("payroll_settings").select("salario_base, dependentes_irrf").eq("employee_id", employeeId).maybeSingle(),
          supabase.from("payslips").select("fgts_mes").eq("employee_id", employeeId),
          (supabase as any).rpc("get_saldo_ferias", { p_employee_id: employeeId }),
        ]);

        if (settingsRes.data) {
          setSalarioBase(String((settingsRes.data as any).salario_base || 0));
          setDependentesIrrf((settingsRes.data as any).dependentes_irrf || 0);
        } else {
          setSalarioBase("0");
          toast.warning("Funcionário sem salário cadastrado em Parâmetros da Folha");
        }

        const totalFgts = (fgtsRes.data || []).reduce((acc: number, p: any) => acc + Number(p.fgts_mes || 0), 0);
        setSaldoFgts(totalFgts.toFixed(2));
        setFgtsEstimado(true);

        if (saldoFeriasRes.data && saldoFeriasRes.data.length > 0) {
          const s = saldoFeriasRes.data[0];
          setFeriasVencidasDias(s.vencido ? s.dias_disponiveis : 0);
        } else {
          setFeriasVencidasDias(0);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [employeeId]);

  const calcular = () => {
    if (!employee) { toast.error("Selecione um funcionário"); return; }
    if (!(employee as any).data_admissao) { toast.error("Funcionário sem data de admissão cadastrada"); return; }
    if (Number(salarioBase) <= 0) { toast.error("Funcionário sem salário cadastrado"); return; }

    const dataRescisaoObj = new Date(dataRescisao + "T12:00:00");
    const mesesTrabalhados = contarMesesTrabalhados((employee as any).data_admissao, dataRescisaoObj);

    const result = calcularRescisao({
      tipo,
      salarioBase,
      dataAdmissao: (employee as any).data_admissao,
      dataRescisao,
      cumpriuAvisoPrevio: cumpriuAviso,
      feriasVencidasDias,
      mesesTrabalhadosAnoAtual: mesesTrabalhados,
      saldoFgts,
      dependentesIrrf,
    });
    setResultado(result);
  };

  const fmt = (v: any) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const gerarPdf = async () => {
    if (!resultado || !employee) return;
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = pdf.internal.pageSize.getWidth();
      const M = 15;
      let y = 0;

      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, W, 30, "F");
      pdf.setFontSize(14); pdf.setFont("helvetica", "bold"); pdf.setTextColor(255, 255, 255);
      pdf.text("TERMO DE RESCISÃO — DOCUMENTO DE CONFERÊNCIA", W / 2, 12, { align: "center" });
      pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(180, 200, 230);
      pdf.text("APA Refrigeração e Climatização", W / 2, 19, { align: "center" });
      pdf.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, W / 2, 25, { align: "center" });
      y = 38;

      const addSection = (titulo: string) => {
        pdf.setFillColor(240, 244, 248);
        pdf.rect(M, y, W - M * 2, 7, "F");
        pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); pdf.setTextColor(30, 64, 175);
        pdf.text(titulo.toUpperCase(), M + 2, y + 5);
        y += 10;
      };

      const addRow = (label: string, value: string) => {
        pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); pdf.setTextColor(100, 100, 110);
        pdf.text(label, M + 2, y);
        pdf.setFont("helvetica", "normal"); pdf.setTextColor(30, 30, 40);
        pdf.text(value || "—", M + 70, y);
        y += 6;
        if (y > 270) { pdf.addPage(); y = 15; }
      };

      addSection("Identificação");
      addRow("Funcionário:", employee.name);
      addRow("CPF:", (employee as any).cpf || "—");
      addRow("Data de admissão:", new Date((employee as any).data_admissao + "T12:00:00").toLocaleDateString("pt-BR"));
      addRow("Data de rescisão:", new Date(dataRescisao + "T12:00:00").toLocaleDateString("pt-BR"));
      addRow("Tipo de rescisão:", TIPO_LABELS[tipo]);
      y += 3;

      addSection("Verbas Rescisórias");
      resultado.items.filter(i => i.kind !== "informativo").forEach(i => {
        addRow(`${i.kind === "provento" ? "(+) " : "(−) "}${i.description}${i.reference ? " — " + i.reference : ""}:`, fmt(i.amount));
      });
      y += 3;

      addSection("Totais");
      addRow("Total de Proventos:", fmt(resultado.total_proventos));
      addRow("Total de Descontos:", fmt(resultado.total_descontos));
      pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.setTextColor(15, 23, 42);
      pdf.text("VALOR LÍQUIDO A RECEBER:", M + 2, y + 2);
      pdf.text(fmt(resultado.liquido), M + 90, y + 2);
      y += 10;

      addSection("FGTS");
      addRow("Saldo FGTS considerado:", fmt(saldoFgts) + (fgtsEstimado ? " (estimado)" : ""));
      addRow("Multa FGTS:", `${resultado.multa_fgts_percentual}% = ${fmt(resultado.multa_fgts_valor)}`);
      addRow("FGTS liberado para saque:", `${resultado.fgts_liberado_percentual}% = ${fmt(resultado.fgts_liberado_valor)}`);
      y += 5;

      pdf.setFontSize(7); pdf.setFont("helvetica", "normal"); pdf.setTextColor(150, 150, 150);
      const aviso = pdf.splitTextToSize(
        "Este documento é uma estimativa de conferência gerada automaticamente e não substitui o cálculo oficial do TRCT (Termo de Rescisão do Contrato de Trabalho) homologado, nem assessoria contábil/jurídica especializada.",
        W - M * 2,
      );
      aviso.forEach((line: string) => { pdf.text(line, M, y); y += 4; });

      pdf.setDrawColor(15, 23, 42); pdf.setLineWidth(0.5);
      pdf.line(M, 282, W - M, 282);
      pdf.setFontSize(6.5); pdf.setTextColor(120, 120, 130);
      pdf.text("APA Ponto — Documento de Conferência de Rescisão", W / 2, 287, { align: "center" });

      pdf.save(`Rescisao_${employee.name.replace(/\s+/g, "_")}.pdf`);
      toast.success("Documento gerado!");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF: " + e.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Funcionário</Label>
            <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setResultado(null); }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1">
              <option value="">Selecione...</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Tipo de Rescisão</Label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRescisao)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1">
              {Object.entries(TIPO_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Data da Rescisão</Label>
            <Input type="date" value={dataRescisao} onChange={(e) => setDataRescisao(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Salário Base</Label>
            <Input type="number" value={salarioBase} onChange={(e) => setSalarioBase(e.target.value)} className="mt-1" disabled={loading} />
          </div>
          <div>
            <Label>Dias de Férias Vencidas</Label>
            <Input type="number" value={feriasVencidasDias} onChange={(e) => setFeriasVencidasDias(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label>Saldo FGTS {fgtsEstimado && <span className="text-[10px] text-amber-500">(estimado pela folha — ajuste se necessário)</span>}</Label>
            <Input type="number" value={saldoFgts} onChange={(e) => { setSaldoFgts(e.target.value); setFgtsEstimado(false); }} className="mt-1" />
          </div>
        </div>

        {(tipo === "sem_justa_causa" || tipo === "pedido_demissao" || tipo === "acordo_mutuo") && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cumpriuAviso} onChange={(e) => setCumpriuAviso(e.target.checked)} />
            Aviso prévio foi cumprido trabalhando (sem indenização/desconto)
          </label>
        )}

        <Button onClick={calcular} disabled={!employeeId || loading} className="gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          Calcular Rescisão
        </Button>
      </Card>

      {resultado && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Resultado — {employee?.name}</h3>
            <Button variant="outline" size="sm" onClick={gerarPdf} className="gap-2">
              <FileDown className="w-4 h-4" /> Gerar PDF
            </Button>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {resultado.items.filter(i => i.kind !== "informativo").map((item, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="p-2.5">
                      {item.description}
                      {item.reference && <span className="text-xs text-muted-foreground ml-2">({item.reference})</span>}
                    </td>
                    <td className={`p-2.5 text-right font-medium ${item.kind === "provento" ? "text-emerald-500" : "text-rose-500"}`}>
                      {item.kind === "provento" ? "+" : "−"} {fmt(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Total Proventos</p>
              <p className="text-lg font-bold text-emerald-500">{fmt(resultado.total_proventos)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Total Descontos</p>
              <p className="text-lg font-bold text-rose-500">{fmt(resultado.total_descontos)}</p>
            </Card>
            <Card className="p-3 border-2 border-blue-400/50">
              <p className="text-xs text-muted-foreground">Líquido a Receber</p>
              <p className="text-xl font-black text-blue-600">{fmt(resultado.liquido)}</p>
            </Card>
          </div>

          <Card className="p-3 bg-muted/30">
            <p className="text-xs font-semibold mb-2">FGTS</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Multa ({resultado.multa_fgts_percentual}%)</p>
                <p className="font-semibold">{fmt(resultado.multa_fgts_valor)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Liberado p/ saque ({resultado.fgts_liberado_percentual}%)</p>
                <p className="font-semibold">{fmt(resultado.fgts_liberado_valor)}</p>
              </div>
            </div>
          </Card>

          <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p>Este cálculo é uma estimativa de conferência e não substitui o TRCT oficial homologado nem assessoria contábil/jurídica especializada.</p>
          </div>
        </Card>
      )}
    </div>
  );
}