import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, Wallet, CheckCircle2, Circle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

interface Adiantamento {
  id: string;
  employee_id: string;
  valor_total: number;
  parcelas: number;
  valor_parcela: number;
  data_concessao: string;
  motivo: string | null;
}

interface Parcela {
  id: string;
  adiantamento_id: string;
  numero_parcela: number;
  valor: number;
  ano: number;
  mes: number;
  descontada: boolean;
}

export default function AdiantamentosTab({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [numParcelas, setNumParcelas] = useState(1);
  const [dataConcessao, setDataConcessao] = useState(new Date().toISOString().slice(0, 10));
  const [mesInicio, setMesInicio] = useState(new Date().getMonth() + 1);
  const [anoInicio, setAnoInicio] = useState(new Date().getFullYear());
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adiantamentos, setAdiantamentos] = useState<Adiantamento[]>([]);
  const [parcelasPorAdiantamento, setParcelasPorAdiantamento] = useState<Record<string, Parcela[]>>({});

  const load = async () => {
    setLoading(true);
    try {
      const { data: ads } = await (supabase as any)
        .from("adiantamentos")
        .select("*")
        .order("data_concessao", { ascending: false });
      setAdiantamentos(ads || []);

      if (ads && ads.length > 0) {
        const { data: parcelas } = await (supabase as any)
          .from("adiantamento_parcelas")
          .select("*")
          .in("adiantamento_id", ads.map((a: any) => a.id))
          .order("numero_parcela");
        const grouped: Record<string, Parcela[]> = {};
        (parcelas || []).forEach((p: any) => {
          if (!grouped[p.adiantamento_id]) grouped[p.adiantamento_id] = [];
          grouped[p.adiantamento_id].push(p);
        });
        setParcelasPorAdiantamento(grouped);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const valorParcela = numParcelas > 0 ? Number(valorTotal || 0) / numParcelas : 0;

  const cadastrar = async () => {
    if (!employeeId) { toast.error("Selecione um funcionário"); return; }
    if (Number(valorTotal) <= 0) { toast.error("Informe um valor válido"); return; }
    setSalvando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: adiantamento, error } = await (supabase as any)
        .from("adiantamentos")
        .insert({
          employee_id: employeeId,
          valor_total: Number(valorTotal),
          parcelas: numParcelas,
          valor_parcela: valorParcela,
          data_concessao: dataConcessao,
          motivo: motivo.trim() || null,
          criado_por: user?.email || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Gera as parcelas distribuídas a partir do mês/ano de início
      const parcelasRows = [];
      let mes = mesInicio;
      let ano = anoInicio;
      for (let i = 1; i <= numParcelas; i++) {
        parcelasRows.push({
          adiantamento_id: adiantamento.id,
          numero_parcela: i,
          valor: valorParcela,
          ano,
          mes,
          descontada: false,
        });
        mes++;
        if (mes > 12) { mes = 1; ano++; }
      }
      const { error: errorParcelas } = await (supabase as any)
        .from("adiantamento_parcelas")
        .insert(parcelasRows);
      if (errorParcelas) throw errorParcelas;

      toast.success("Adiantamento cadastrado!");
      setValorTotal(""); setNumParcelas(1); setMotivo("");
      load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este adiantamento e todas as parcelas pendentes? Parcelas já descontadas na folha não serão revertidas automaticamente.")) return;
    await (supabase as any).from("adiantamentos").delete().eq("id", id);
    toast.success("Adiantamento excluído.");
    load();
  };

  const fmt = (v: any) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Novo Adiantamento
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label>Funcionário</Label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1">
              <option value="">Selecione...</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Valor Total (R$)</Label>
            <Input type="number" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Data da Concessão</Label>
            <Input type="date" value={dataConcessao} onChange={(e) => setDataConcessao(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Número de Parcelas</Label>
            <Input type="number" min={1} max={12} value={numParcelas} onChange={(e) => setNumParcelas(Math.max(1, Number(e.target.value)))} className="mt-1" />
          </div>
          <div>
            <Label>Mês do 1º Desconto</Label>
            <select value={mesInicio} onChange={(e) => setMesInicio(Number(e.target.value))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1">
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <Label>Ano do 1º Desconto</Label>
            <Input type="number" value={anoInicio} onChange={(e) => setAnoInicio(Number(e.target.value))} className="mt-1" />
          </div>
        </div>

        {Number(valorTotal) > 0 && (
          <p className="text-xs text-muted-foreground">
            💡 {numParcelas}x de <span className="font-semibold text-foreground">{fmt(valorParcela)}</span>, descontando a partir de {MONTHS[mesInicio - 1]}/{anoInicio}
          </p>
        )}

        <div>
          <Label>Motivo (opcional)</Label>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: emergência pessoal" className="mt-1" />
        </div>

        <Button onClick={cadastrar} disabled={salvando} className="gap-2">
          {salvando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Cadastrar Adiantamento
        </Button>
      </Card>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Adiantamentos Registrados
        </h3>
        {loading ? (
          <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : adiantamentos.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum adiantamento registrado.</Card>
        ) : (
          <div className="space-y-3">
            {adiantamentos.map((a) => {
              const emp = employees.find(e => e.id === a.employee_id);
              const parcelas = parcelasPorAdiantamento[a.id] || [];
              const descontadas = parcelas.filter(p => p.descontada).length;
              return (
                <Card key={a.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold">{emp?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(a.valor_total)} em {a.parcelas}x de {fmt(a.valor_parcela)} · concedido em {new Date(a.data_concessao + "T12:00:00").toLocaleDateString("pt-BR")}
                      </p>
                      {a.motivo && <p className="text-xs text-muted-foreground italic mt-0.5">{a.motivo}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-1 rounded-full"
                        style={{ background: descontadas === parcelas.length ? "#d1fae5" : "#fef3c7", color: descontadas === parcelas.length ? "#065f46" : "#92400e" }}>
                        {descontadas}/{parcelas.length} descontadas
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => excluir(a.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {parcelas.map((p) => (
                      <span key={p.id} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-muted/50">
                        {p.descontada ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Circle className="w-3 h-3 text-muted-foreground" />}
                        {MONTHS[p.mes - 1]}/{p.ano} — {fmt(p.valor)}
                      </span>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}