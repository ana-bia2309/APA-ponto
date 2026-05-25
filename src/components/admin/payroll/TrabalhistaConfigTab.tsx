import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, RotateCcw, Info } from "lucide-react";

const STORAGE_KEY = "AMR_ponto_trabalhista_config";

const DEFAULTS = {
  inss: [
    { ate: "1518.00", aliquota: "7.5" },
    { ate: "2793.88", aliquota: "9" },
    { ate: "4190.83", aliquota: "12" },
    { ate: "8157.41", aliquota: "14" },
  ],
  inss_teto: "8157.41",
  irrf: [
    { ate: "2259.20", aliquota: "0", deducao: "0" },
    { ate: "2826.65", aliquota: "7.5", deducao: "169.44" },
    { ate: "3751.05", aliquota: "15", deducao: "381.44" },
    { ate: "4664.68", aliquota: "22.5", deducao: "662.77" },
    { ate: "999999999", aliquota: "27.5", deducao: "896.00" },
  ],
  irrf_deducao_dependente: "189.59",
  fgts_aliquota: "8",
  carga_horaria_diaria: "8",
  horas_mes_padrao: "220",
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export default function TrabalhistaConfigTab() {
  const [config, setConfig] = useState(loadConfig);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    toast.success("Configurações salvas!");
  };

  const reset = () => {
    if (!confirm("Restaurar valores padrão 2025?")) return;
    setConfig(DEFAULTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
    toast.success("Valores restaurados!");
  };

  const updInss = (i: number, field: "ate" | "aliquota", value: string) => {
    const inss = [...config.inss];
    inss[i] = { ...inss[i], [field]: value };
    setConfig((c: any) => ({ ...c, inss }));
  };

  const updIrrf = (i: number, field: "ate" | "aliquota" | "deducao", value: string) => {
    const irrf = [...config.irrf];
    irrf[i] = { ...irrf[i], [field]: value };
    setConfig((c: any) => ({ ...c, irrf }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Regras Trabalhistas</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Restaurar padrão
          </Button>
          <Button size="sm" onClick={save} className="gap-2">
            <Save className="w-4 h-4" /> Salvar
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-600">
          Estes valores são usados nos cálculos da folha. Atualize anualmente conforme a legislação vigente. Os valores padrão seguem a tabela 2025.
        </p>
      </div>

      {/* INSS */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tabela INSS Progressiva 2025
        </h3>
        <div className="space-y-2">
          {config.inss.map((faixa: any, i: number) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Até (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={faixa.ate}
                  onChange={(e) => updInss(i, "ate", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Alíquota (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={faixa.aliquota}
                  onChange={(e) => updInss(i, "aliquota", e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
        <div>
          <Label className="text-xs">Teto INSS (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={config.inss_teto}
            onChange={(e) => setConfig((c: any) => ({ ...c, inss_teto: e.target.value }))}
            className="max-w-xs"
          />
        </div>
      </Card>

      {/* IRRF */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tabela IRRF 2025
        </h3>
        <div className="space-y-2">
          {config.irrf.map((faixa: any, i: number) => (
            <div key={i} className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Até (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={faixa.ate === "999999999" ? "" : faixa.ate}
                  placeholder={faixa.ate === "999999999" ? "Acima de tudo" : ""}
                  disabled={faixa.ate === "999999999"}
                  onChange={(e) => updIrrf(i, "ate", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Alíquota (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={faixa.aliquota}
                  onChange={(e) => updIrrf(i, "aliquota", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Dedução (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={faixa.deducao}
                  onChange={(e) => updIrrf(i, "deducao", e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
        <div>
          <Label className="text-xs">Dedução por dependente (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={config.irrf_deducao_dependente}
            onChange={(e) => setConfig((c: any) => ({ ...c, irrf_deducao_dependente: e.target.value }))}
            className="max-w-xs"
          />
        </div>
      </Card>

      {/* FGTS e jornada */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          FGTS e Jornada
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Alíquota FGTS (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={config.fgts_aliquota}
              onChange={(e) => setConfig((c: any) => ({ ...c, fgts_aliquota: e.target.value }))}
            />
          </div>
          <div>
            <Label>Carga horária diária (h)</Label>
            <Input
              type="number"
              step="0.5"
              value={config.carga_horaria_diaria}
              onChange={(e) => setConfig((c: any) => ({ ...c, carga_horaria_diaria: e.target.value }))}
            />
          </div>
          <div>
            <Label>Horas mensais padrão</Label>
            <Input
              type="number"
              value={config.horas_mes_padrao}
              onChange={(e) => setConfig((c: any) => ({ ...c, horas_mes_padrao: e.target.value }))}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
