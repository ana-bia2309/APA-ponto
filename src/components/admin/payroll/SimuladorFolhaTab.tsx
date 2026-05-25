import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, TrendingUp, TrendingDown, Wallet, RefreshCw } from "lucide-react";
import { calculatePayroll } from "@/lib/payroll/calculator";

const fmt = (v: string | number) =>
  "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const DEFAULT = {
  salario_base: 2800,
  carga_horaria_mensal: 220,
  vale_transporte: 291,
  vale_alimentacao: 850,
  dependentes_irrf: 0,
  percentual_comissao: 0,
  hora_extra_habilitada: true,
  adicional_noturno_percent: 20,
  desconta_vt: true,
  horas_extras_50: 0,
  horas_extras_100: 0,
  horas_noturnas: 0,
  faltas_dias: 0,
  atrasos_minutos: 0,
  bonificacao: 0,
};

export default function SimuladorFolhaTab() {
  const [params, setParams] = useState(DEFAULT);
  const [resultado, setResultado] = useState<any>(null);

  const upd = (k: string, v: any) => setParams((p) => ({ ...p, [k]: v }));

  const simular = () => {
    const settings = {
      salario_base: params.salario_base,
      carga_horaria_mensal: params.carga_horaria_mensal,
      vale_transporte: params.vale_transporte,
      vale_alimentacao: params.vale_alimentacao,
      dependentes_irrf: params.dependentes_irrf,
      percentual_comissao: params.percentual_comissao,
      hora_extra_habilitada: params.hora_extra_habilitada,
      adicional_noturno_percent: params.adicional_noturno_percent,
      desconta_vt: params.desconta_vt,
    };
    const work = {
      horas_trabalhadas: params.carga_horaria_mensal,
      horas_extras_50: params.horas_extras_50,
      horas_extras_100: params.horas_extras_100,
      horas_noturnas: params.horas_noturnas,
      faltas_dias: params.faltas_dias,
      atrasos_minutos: params.atrasos_minutos,
      bonificacoes: params.bonificacao,
    };
    const result = calculatePayroll(settings, work);
    setResultado(result);
  };

  const resetar = () => {
    setParams(DEFAULT);
    setResultado(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          Simulador de Folha
        </h2>
        <Button variant="outline" size="sm" onClick={resetar} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Resetar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Parâmetros */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Salário e benefícios</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Salário base (R$)</Label>
                <Input type="number" value={params.salario_base} onChange={(e) => upd("salario_base", parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Carga horária mensal</Label>
                <Input type="number" value={params.carga_horaria_mensal} onChange={(e) => upd("carga_horaria_mensal", parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Vale transporte (R$)</Label>
                <Input type="number" value={params.vale_transporte} onChange={(e) => upd("vale_transporte", parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Vale alimentação (R$)</Label>
                <Input type="number" value={params.vale_alimentacao} onChange={(e) => upd("vale_alimentacao", parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Dependentes IRRF</Label>
                <Input type="number" value={params.dependentes_irrf} onChange={(e) => upd("dependentes_irrf", parseInt(e.target.value) || 0)} /></div>
              <div><Label>Bonificação (R$)</Label>
                <Input type="number" value={params.bonificacao} onChange={(e) => upd("bonificacao", parseFloat(e.target.value) || 0)} /></div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={params.hora_extra_habilitada} onChange={(e) => upd("hora_extra_habilitada", e.target.checked)} />
                Calcular horas extras
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={params.desconta_vt} onChange={(e) => upd("desconta_vt", e.target.checked)} />
                Descontar VT
              </label>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Variáveis do mês</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Horas extras 50%</Label>
                <Input type="number" step="0.5" value={params.horas_extras_50} onChange={(e) => upd("horas_extras_50", parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Horas extras 100%</Label>
                <Input type="number" step="0.5" value={params.horas_extras_100} onChange={(e) => upd("horas_extras_100", parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Horas noturnas</Label>
                <Input type="number" step="0.5" value={params.horas_noturnas} onChange={(e) => upd("horas_noturnas", parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Faltas (dias)</Label>
                <Input type="number" value={params.faltas_dias} onChange={(e) => upd("faltas_dias", parseInt(e.target.value) || 0)} /></div>
              <div><Label>Atrasos (minutos)</Label>
                <Input type="number" value={params.atrasos_minutos} onChange={(e) => upd("atrasos_minutos", parseInt(e.target.value) || 0)} /></div>
              <div><Label>Adicional noturno (%)</Label>
                <Input type="number" value={params.adicional_noturno_percent} onChange={(e) => upd("adicional_noturno_percent", parseFloat(e.target.value) || 0)} /></div>
            </div>
          </Card>

          <Button onClick={simular} className="w-full gap-2 h-12 text-base">
            <Calculator className="w-5 h-5" /> Simular folha
          </Button>
        </div>

        {/* Resultado */}
        <div className="space-y-4">
          {resultado ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <TrendingUp className="w-4 h-4 text-emerald-500" /> Proventos
                  </div>
                  <div className="text-2xl font-bold text-emerald-500">{fmt(resultado.total_proventos)}</div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <TrendingDown className="w-4 h-4 text-rose-500" /> Descontos
                  </div>
                  <div className="text-2xl font-bold text-rose-500">{fmt(resultado.total_descontos)}</div>
                </Card>
                <Card className="p-4 col-span-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Wallet className="w-4 h-4 text-blue-500" /> Líquido
                  </div>
                  <div className="text-3xl font-bold text-blue-500">{fmt(resultado.liquido)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">INSS</div>
                  <div className="text-lg font-bold">{fmt(resultado.inss)}</div>
                  <div className="text-xs text-muted-foreground">Base: {fmt(resultado.base_inss)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">IRRF</div>
                  <div className="text-lg font-bold">{fmt(resultado.irrf)}</div>
                  <div className="text-xs text-muted-foreground">Base: {fmt(resultado.base_irrf)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">FGTS (encargo)</div>
                  <div className="text-lg font-bold text-amber-500">{fmt(resultado.fgts)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Custo total empresa</div>
                  <div className="text-lg font-bold text-purple-500">
                    {fmt(Number(resultado.total_proventos) + Number(resultado.fgts))}
                  </div>
                </Card>
              </div>

              <Card className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Detalhamento</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {resultado.items
                    .filter((i: any) => i.kind !== "informativo")
                    .map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                        <span className="text-muted-foreground">{item.description}</span>
                        <span className={item.kind === "provento" ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>
                          {item.kind === "desconto" ? "- " : "+ "}{fmt(item.amount)}
                        </span>
                      </div>
                    ))}
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-12 flex flex-col items-center justify-center text-center">
              <Calculator className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Preencha os parâmetros e clique em <strong>Simular folha</strong> para ver o resultado.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
