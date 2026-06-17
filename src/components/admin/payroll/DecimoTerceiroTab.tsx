import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calculator, RefreshCw, Gift, Calendar, CheckCircle2, Circle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { calcular13Salario } from "@/lib/payroll/calculator";

type Employee = Tables<"employees">;

interface Decimo {
  id: string;
  employee_id: string;
  ano: number;
  meses_trabalhados: number;
  salario_base: number;
  valor_total: number;
  primeira_parcela: number;
  segunda_parcela_bruta: number;
  inss: number;
  irrf: number;
  segunda_parcela_liquida: number;
  primeira_paga: boolean;
  segunda_paga: boolean;
  data_pagamento_primeira: string | null;
  data_pagamento_segunda: string | null;
}

function diasRestantes(mes: number, dia: number): number {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  let alvo = new Date(ano, mes - 1, dia);
  if (alvo < hoje) alvo = new Date(ano + 1, mes - 1, dia);
  return Math.ceil((alvo.getTime() - hoje.getTime()) / 86400000);
}

function contarMesesTrabalhados(dataAdmissao: string | null, ano: number): number {
  if (!dataAdmissao) return 12;
  const admissao = new Date(dataAdmissao + "T12:00:00");
  const anoAdmissao = admissao.getFullYear();
  const hoje = new Date();

  if (anoAdmissao > ano) return 0;
  if (anoAdmissao < ano) {
    // Admitido em ano anterior — conta meses até dezembro (ou até hoje, se for o ano atual)
    if (ano === hoje.getFullYear()) return hoje.getMonth() + 1;
    return 12;
  }

  // Admitido no próprio ano — conta a partir do mês de admissão
  const mesAdmissao = admissao.getMonth() + 1; // 1-12
  const diaAdmissao = admissao.getDate();
  const mesesBase = 12 - mesAdmissao + 1;
  // Regra dos 15 dias: se admitiu depois do dia 15, o mês de admissão não conta
  const ajuste = diaAdmissao > 15 ? -1 : 0;
  const mesFinal = ano === hoje.getFullYear() ? hoje.getMonth() + 1 : 12;
  const meses = Math.min(mesesBase + ajuste, mesFinal - mesAdmissao + 1);
  return Math.max(0, meses);
}

export default function DecimoTerceiroTab({ employees }: { employees: Employee[] }) {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [registros, setRegistros] = useState<Decimo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const diasPara1aParcela = diasRestantes(11, 30);
  const diasPara2aParcela = diasRestantes(12, 20);

  const loadRegistros = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("decimo_terceiro")
      .select("*")
      .eq("ano", ano);
    setRegistros(data || []);
    setLoading(false);
  };

  useEffect(() => { loadRegistros(); }, [ano]);

  const calcularUm = async (emp: Employee): Promise<boolean> => {
    const { data: settings } = await supabase
      .from("payroll_settings")
      .select("salario_base, dependentes_irrf")
      .eq("employee_id", emp.id)
      .maybeSingle();
    if (!settings) return false;

    const meses = contarMesesTrabalhados((emp as any).data_admissao, ano);
    if (meses <= 0) return false;

    const result = calcular13Salario(
      (settings as any).salario_base,
      meses,
      (settings as any).dependentes_irrf || 0,
    );

    const existente = registros.find(r => r.employee_id === emp.id);

    const payload = {
      employee_id: emp.id,
      ano,
      meses_trabalhados: meses,
      salario_base: Number((settings as any).salario_base),
      valor_total: Number(result.valor_total),
      primeira_parcela: Number(result.primeira_parcela),
      segunda_parcela_bruta: Number(result.segunda_parcela_bruta),
      inss: Number(result.inss),
      irrf: Number(result.irrf),
      segunda_parcela_liquida: Number(result.segunda_parcela_liquida),
      primeira_paga: existente?.primeira_paga || false,
      segunda_paga: existente?.segunda_paga || false,
    };

    const { error } = await (supabase as any)
      .from("decimo_terceiro")
      .upsert(payload, { onConflict: "employee_id,ano" });

    return !error;
  };

  const calcularTodos = async () => {
    setBusy("all");
    try {
      let ok = 0;
      for (const emp of employees) {
        if (await calcularUm(emp)) ok++;
      }
      await loadRegistros();
      toast.success(`13º calculado para ${ok}/${employees.length} funcionário(s)`);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setBusy(null);
    }
  };

  const calcularIndividual = async (emp: Employee) => {
    setBusy(emp.id);
    try {
      const ok = await calcularUm(emp);
      if (!ok) { toast.error("Configure o salário do colaborador na Folha de Pagamento primeiro"); return; }
      await loadRegistros();
      toast.success(`${emp.name} recalculado`);
    } finally {
      setBusy(null);
    }
  };

  const marcarPaga = async (reg: Decimo, parcela: "primeira" | "segunda") => {
    const campo = parcela === "primeira" ? "primeira_paga" : "segunda_paga";
    const campoData = parcela === "primeira" ? "data_pagamento_primeira" : "data_pagamento_segunda";
    const novoValor = !reg[campo];
    const { error } = await (supabase as any)
      .from("decimo_terceiro")
      .update({ [campo]: novoValor, [campoData]: novoValor ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", reg.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    toast.success(novoValor ? "Marcado como pago!" : "Desmarcado");
    loadRegistros();
  };

  const summary = useMemo(() => {
    return registros.reduce(
      (acc, r) => ({
        total: acc.total + Number(r.valor_total || 0),
        primeira: acc.primeira + Number(r.primeira_parcela || 0),
        segunda: acc.segunda + Number(r.segunda_parcela_liquida || 0),
      }),
      { total: 0, primeira: 0, segunda: 0 },
    );
  }, [registros]);

  const fmt = (v: any) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      {/* Lembretes de data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className={`p-4 ${diasPara1aParcela <= 15 ? "border-amber-400/50 bg-amber-500/5" : ""}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Calendar className="w-3.5 h-3.5" /> 1ª Parcela — até 30/11
          </div>
          <p className={`text-2xl font-bold ${diasPara1aParcela <= 15 ? "text-amber-500" : ""}`}>
            {diasPara1aParcela === 0 ? "Hoje!" : `${diasPara1aParcela} dia(s)`}
          </p>
        </Card>
        <Card className={`p-4 ${diasPara2aParcela <= 15 ? "border-amber-400/50 bg-amber-500/5" : ""}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Calendar className="w-3.5 h-3.5" /> 2ª Parcela — até 20/12
          </div>
          <p className={`text-2xl font-bold ${diasPara2aParcela <= 15 ? "text-amber-500" : ""}`}>
            {diasPara2aParcela === 0 ? "Hoje!" : `${diasPara2aParcela} dia(s)`}
          </p>
        </Card>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label>Ano</Label>
          <Input type="number" value={ano} onChange={(e) => setAno(parseInt(e.target.value))} className="w-28" />
        </div>
        <Button onClick={calcularTodos} disabled={!!busy} className="gap-2">
          {busy === "all" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          Calcular 13º de Todos
        </Button>
      </Card>

      {registros.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Gift className="w-3 h-3" />Valor Total 13º</div>
            <div className="text-2xl font-bold mt-1">{fmt(summary.total)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">1ª Parcela (sem desconto)</div>
            <div className="text-2xl font-bold mt-1 text-emerald-500">{fmt(summary.primeira)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">2ª Parcela (líquida)</div>
            <div className="text-2xl font-bold mt-1">{fmt(summary.segunda)}</div>
          </Card>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Funcionário</th>
              <th className="p-3 text-center">Meses</th>
              <th className="p-3 text-right">Valor Total</th>
              <th className="p-3 text-right">1ª Parcela</th>
              <th className="p-3 text-right">2ª Parcela Líq.</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const reg = registros.find(r => r.employee_id === emp.id);
              return (
                <tr key={emp.id} className="border-t border-border/50">
                  <td className="p-3">{emp.name}</td>
                  <td className="p-3 text-center">{reg ? reg.meses_trabalhados : "—"}</td>
                  <td className="p-3 text-right font-bold">{reg ? fmt(reg.valor_total) : "—"}</td>
                  <td className="p-3 text-right text-emerald-500">{reg ? fmt(reg.primeira_parcela) : "—"}</td>
                  <td className="p-3 text-right">{reg ? fmt(reg.segunda_parcela_liquida) : "—"}</td>
                  <td className="p-3 text-center">
                    {reg && (
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => marcarPaga(reg, "primeira")}
                          title="1ª parcela paga?"
                          className="flex items-center gap-1 text-[10px] font-semibold">
                          {reg.primeira_paga ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                          1ª
                        </button>
                        <button onClick={() => marcarPaga(reg, "segunda")}
                          title="2ª parcela paga?"
                          className="flex items-center gap-1 text-[10px] font-semibold">
                          {reg.segunda_paga ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                          2ª
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => calcularIndividual(emp)}
                      disabled={!!busy} className="gap-1">
                      {busy === emp.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Calculator className="w-3 h-3" />}
                      {reg ? "Recalcular" : "Calcular"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        💡 Meses trabalhados consideram a regra CLT: admissão até o dia 15 do mês conta o mês inteiro; depois do dia 15, não conta.
        A 1ª parcela é metade do valor total sem descontos. A 2ª parcela tem INSS e IRRF descontados sobre o valor da parcela.
      </p>
    </div>
  );
}