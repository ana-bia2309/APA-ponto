import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

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
}

const DEFAULTS: Omit<Settings, "employee_id"> = {
  salario_base: 0, carga_horaria_mensal: 220, vale_transporte: 0,
  vale_alimentacao: 0, dependentes_irrf: 0, percentual_comissao: 0,
  hora_extra_habilitada: true, adicional_noturno_percent: 20, desconta_vt: true,
};

export default function PayrollSettingsTab({ employees }: { employees: Employee[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

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
    })();
  }, [selectedId]);

  const save = async () => {
    if (!settings) return;
    setLoading(true);
    const payload = { ...settings, employee_id: selectedId };
    const { error } = await supabase
      .from("payroll_settings" as any)
      .upsert(payload, { onConflict: "employee_id" });
    setLoading(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    setHasExisting(true);
    toast.success("Configuração salarial salva!");
  };

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
              <Input type="number" step="0.01" value={settings.salario_base}
                onChange={(e) => upd("salario_base", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Carga Horária Mensal</Label>
              <Input type="number" step="0.01" value={settings.carga_horaria_mensal}
                onChange={(e) => upd("carga_horaria_mensal", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Dependentes IRRF</Label>
              <Input type="number" value={settings.dependentes_irrf}
                onChange={(e) => upd("dependentes_irrf", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Vale Transporte (R$)</Label>
              <Input type="number" step="0.01" value={settings.vale_transporte}
                onChange={(e) => upd("vale_transporte", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Vale Alimentação (R$)</Label>
              <Input type="number" step="0.01" value={settings.vale_alimentacao}
                onChange={(e) => upd("vale_alimentacao", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <Input type="number" step="0.01" value={settings.percentual_comissao}
                onChange={(e) => upd("percentual_comissao", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Adicional Noturno (%)</Label>
              <Input type="number" step="0.01" value={settings.adicional_noturno_percent}
                onChange={(e) => upd("adicional_noturno_percent", parseFloat(e.target.value) || 0)} />
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
    </div>
  );
}