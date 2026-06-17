import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { CurrencyInput } from "@/components/ui/currency-input";

type Employee = Tables<"employees">;

interface Settings {
  id?: string;
  employee_id: string;
  salario_base: number;
  carga_horaria_mensal: number;
  vale_transporte: number;
  vale_alimentacao: number;
  dependentes_irrf: number;
  percentual_comissao: number;
  hora_extra_habilitada: boolean;
  adicional_noturno_percent: number;
  desconta_vt: boolean;
  gratificacao_fixa: number;
  gratificacao_percentual: number;
}

const DEFAULTS: Omit<Settings, "employee_id"> = {
  salario_base: 0, carga_horaria_mensal: 220, vale_transporte: 0,
  vale_alimentacao: 0, dependentes_irrf: 0, percentual_comissao: 0,
  hora_extra_habilitada: true, adicional_noturno_percent: 20, desconta_vt: true,
  gratificacao_fixa: 0, gratificacao_percentual: 0,
};

export default function PayrollSettingsTab({ employees }: { employees: Employee[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);

  const loadHistorico = async () => {
    if (!selectedId) return;
    const { data } = await (supabase as any)
      .from("historico_salarial")
      .select("*")
      .eq("employee_id", selectedId)
      .order("alterado_em", { ascending: false });
    setHistorico(data || []);
  };

useEffect(() => {
    if (employees.length && !selectedId) setSelectedId("");
  }, [employees, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const { data } = await supabase
        .from("payroll_settings" as any)
        .select("*").eq("employee_id", selectedId).maybeSingle();
      if (data) {
        setSettings(data as any);
        setHasExisting(true);
      } else {
        setSettings({ ...DEFAULTS, employee_id: selectedId });
        setHasExisting(false);
      }
      loadHistorico();
    })();
  }, [selectedId]);

  const save = async () => {
    if (!settings) return;
    setLoading(true);

    // Verifica se o salário mudou em relação ao que já estava salvo
    const { data: existente } = await supabase
      .from("payroll_settings" as any)
      .select("salario_base")
      .eq("employee_id", selectedId)
      .maybeSingle();

    const salarioAnterior = existente ? Number((existente as any).salario_base) : null;
    const salarioMudou = salarioAnterior !== null && salarioAnterior !== Number(settings.salario_base);
    const primeiroCadastro = salarioAnterior === null && Number(settings.salario_base) > 0;

    const payload = { ...settings, employee_id: selectedId };
    const { error } = await supabase
      .from("payroll_settings" as any)
      .upsert(payload, { onConflict: "employee_id" });
    setLoading(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }

    if (salarioMudou || primeiroCadastro) {
      const motivo = window.prompt(
        primeiroCadastro
          ? "Motivo do cadastro do salário (opcional):"
          : `Motivo do reajuste de ${fmt(salarioAnterior!)} para ${fmt(settings.salario_base)} (opcional):`
      );
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("historico_salarial").insert({
        employee_id: selectedId,
        salario_anterior: salarioAnterior,
        salario_novo: settings.salario_base,
        motivo: motivo?.trim() || null,
        alterado_por: user?.email || null,
      });
      loadHistorico();
    }

    setHasExisting(true);
    toast.success("Configuração salarial salva!");
  };

  const fmt = (v: any) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const clear = async () => {
    if (!confirm("Limpar configuração salarial deste funcionário?")) return;
    setLoading(true);
    const { error } = await supabase
      .from("payroll_settings" as any)
      .delete().eq("employee_id", selectedId);
    setLoading(false);
    if (error) { toast.error("Erro ao limpar: " + error.message); return; }
    setSettings({ ...DEFAULTS, employee_id: selectedId });
    setHasExisting(false);
    toast.success("Configuração salarial removida!");
  };

  const upd = (k: keyof Settings, v: any) =>
    setSettings((s) => s ? { ...s, [k]: v } : s);

return (
    <div className="space-y-4">
      <Card className="p-4">
        <Label>Funcionário</Label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Selecione um funcionário...</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </Card>

      {settings && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Parâmetros Salariais
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Salário Base (R$)</Label>
              <CurrencyInput value={settings.salario_base} onChange={(v) => upd("salario_base", v)} />
            </div>
            <div>
              <Label>Carga Horária Mensal</Label>
              <Input type="number" min="1" value={settings.carga_horaria_mensal || ""}
                onChange={(e) => upd("carga_horaria_mensal", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Dependentes IRRF</Label>
              <Input type="number" min="0" value={settings.dependentes_irrf || ""}
                onChange={(e) => upd("dependentes_irrf", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Vale Transporte (R$)</Label>
              <CurrencyInput value={settings.vale_transporte} onChange={(v) => upd("vale_transporte", v)} />
            </div>
            <div>
              <Label>Vale Alimentação (R$)</Label>
              <CurrencyInput value={settings.vale_alimentacao} onChange={(v) => upd("vale_alimentacao", v)} />
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <Input type="number" min="0" max="100" step="0.01"
                value={settings.percentual_comissao || ""}
                onChange={(e) => upd("percentual_comissao", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Adicional Noturno (%)</Label>
              <Input type="number" min="0" max="100" step="0.01"
                value={settings.adicional_noturno_percent || ""}
                onChange={(e) => upd("adicional_noturno_percent", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Gratificação Fixa (R$)</Label>
              <CurrencyInput value={settings.gratificacao_fixa} onChange={(v) => upd("gratificacao_fixa", v)} />
            </div>
            <div>
              <Label>Gratificação em % do salário</Label>
              <Input type="number" min="0" max="100" step="0.01" placeholder="0,00"
                value={settings.gratificacao_percentual || ""}
                onChange={(e) => upd("gratificacao_percentual", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="he" checked={settings.hora_extra_habilitada}
                onChange={(e) => upd("hora_extra_habilitada", e.target.checked)} />
              <Label htmlFor="he">Calcular horas extras</Label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="vt" checked={settings.desconta_vt}
                onChange={(e) => upd("desconta_vt", e.target.checked)} />
              <Label htmlFor="vt">Descontar VT</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={loading} className="gap-2">
              <Save className="w-4 h-4" /> Salvar Configuração
            </Button>
            {hasExisting && (
              <Button onClick={clear} disabled={loading} variant="destructive" className="gap-2">
                <Trash2 className="w-4 h-4" /> Limpar Configuração
              </Button>
            )}
          </div>
        </Card>
      )}

      {selectedId && historico.length > 0 && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Histórico de Reajustes Salariais
          </h3>
          <div className="space-y-2">
            {historico.map((h) => (
              <div key={h.id} className="flex items-start justify-between p-3 rounded-lg border border-border bg-muted/20">
                <div>
                  <p className="text-sm font-medium">
                    {h.salario_anterior !== null
                      ? <>{fmt(h.salario_anterior)} → <span className="font-bold text-emerald-600">{fmt(h.salario_novo)}</span></>
                      : <>Cadastro inicial: <span className="font-bold">{fmt(h.salario_novo)}</span></>}
                  </p>
                  {h.motivo && <p className="text-xs text-muted-foreground mt-0.5">{h.motivo}</p>}
                  {h.alterado_por && <p className="text-[10px] text-muted-foreground mt-0.5">por {h.alterado_por}</p>}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(h.alterado_em).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
