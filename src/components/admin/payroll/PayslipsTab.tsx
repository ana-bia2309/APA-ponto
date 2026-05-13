import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, FileText, Download, Printer, ShieldCheck, Clock, Globe, Smartphone, KeyRound, MessageSquare, Pencil } from "lucide-react";
import { downloadPayslipPdf, printPayslipPdf, type PayslipPdfData } from "@/lib/payroll/generatePayslipPdf";

const fmt = (v: any) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const buildPdfData = (selected: any, items: any[], year: number, month: number): PayslipPdfData => ({
  funcionario: {
    nome: selected.employees?.name || "—",
    cpf: selected.employees?.cpf,
    cargo: selected.employees?.cargo,
    matricula: selected.employees?.matricula,
    departamento: selected.employees?.departamento,
    admissao: selected.employees?.data_admissao,
  },
  competencia: { mes: month, ano: year },
  itens: items.map((i) => ({
    code: i.code, description: i.description, reference: i.reference,
    kind: i.kind, amount: Number(i.amount),
  })),
  totais: {
    proventos: selected.total_proventos, descontos: selected.total_descontos,
    liquido: selected.liquido, base_inss: selected.base_inss,
    base_irrf: selected.base_irrf, fgts_mes: selected.fgts_mes,
  },
  banco_horas: {
    horas_trabalhadas: selected.horas_trabalhadas,
    horas_extras_50: selected.horas_extras_50,
    horas_extras_100: selected.horas_extras_100,
    horas_noturnas: selected.horas_noturnas,
    faltas_dias: selected.faltas_dias,
  },
  signatureDataUrl: selected.signature_url || undefined,
});

export default function PayslipsTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [list, setList] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);

  const fetchList = useCallback(async () => {
    const { data: period } = await supabase
      .from("payroll_periods" as any).select("*")
      .eq("year", year).eq("month", month).maybeSingle();
    if (!period) { setList([]); return; }
    const { data } = await supabase
      .from("payslips" as any)
      .select("*, employees(name, cpf, cargo, matricula, departamento, data_admissao)")
      .eq("period_id", (period as any).id)
      .order("created_at");
    setList((data as any) || []);
    // refresh selected payslip too if it exists in the new list
    setSelected((prev: any) => prev ? ((data as any) || []).find((p: any) => p.id === prev.id) || prev : prev);
  }, [year, month]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Realtime: refresh when any payslip changes (sign / update / insert)
  useEffect(() => {
    const channel = supabase
      .channel("admin-payslips-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "payslips" }, () => {
        fetchList();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchList]);

  const open = async (p: any) => {
    setSelected(p);
    const { data } = await supabase
      .from("payroll_items" as any).select("*")
      .eq("payslip_id", p.id).order("sort_order");
    setItems((data as any) || []);
  };

  const methodLabel = (m: string | null) => {
    if (m === "senha") return { label: "Senha (CPF)", icon: KeyRound };
    if (m === "otp") return { label: "Código OTP", icon: MessageSquare };
    if (m === "desenho") return { label: "Assinatura desenhada", icon: Pencil };
    return { label: m || "—", icon: ShieldCheck };
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label>Ano</Label>
          <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-28" />
        </div>
        <div>
          <Label>Mês</Label>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {Array.from({length:12},(_,i)=>i+1).map((m)=>(
              <option key={m} value={m}>{String(m).padStart(2,"0")}</option>
            ))}
          </select>
        </div>
      </Card>

      {selected ? (
        <Card className="p-6 space-y-4">
          <div className="flex justify-between items-start border-b border-border pb-3">
            <div>
              <h3 className="text-lg font-bold">Holerite — {selected.employees?.name}</h3>
              <p className="text-xs text-muted-foreground">
                {selected.employees?.cargo} · Matrícula {selected.employees?.matricula || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Competência {String(month).padStart(2,"0")}/{year}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => printPayslipPdf(buildPdfData(selected, items, year, month))} className="gap-1">
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
              <Button variant="default" size="sm" onClick={() => downloadPayslipPdf(buildPdfData(selected, items, year, month))} className="gap-1">
                <Download className="w-4 h-4" /> Baixar PDF
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

          <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground border-t border-border pt-3">
            <div>Base INSS: <strong className="text-foreground">{fmt(selected.base_inss)}</strong></div>
            <div>Base IRRF: <strong className="text-foreground">{fmt(selected.base_irrf)}</strong></div>
            <div>FGTS do Mês: <strong className="text-foreground">{fmt(selected.fgts_mes)}</strong></div>
          </div>

          {/* Signature audit panel */}
          <div className="border-t border-border pt-3">
            {selected.signed_at ? (() => {
              const m = methodLabel(selected.signature_method);
              const Icon = m.icon;
              return (
                <div className="rounded-lg p-4 bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <ShieldCheck className="w-4 h-4" /> Holerite assinado digitalmente
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" />
                      <span>Assinado em: <strong className="text-foreground">{new Date(selected.signed_at).toLocaleString("pt-BR")}</strong></span>
                    </div>
                    <div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5" />
                      <span>Método: <strong className="text-foreground">{m.label}</strong></span>
                    </div>
                    <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" />
                      <span>IP: <strong className="text-foreground">{selected.signed_ip || "—"}</strong></span>
                    </div>
                    <div className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" />
                      <span>Dispositivo: <strong className="text-foreground">{selected.signed_device || "—"}</strong></span>
                    </div>
                    {selected.signed_user_agent && (
                      <div className="md:col-span-2 text-[11px] text-muted-foreground/80 break-all">
                        User-Agent: {selected.signed_user_agent}
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Aguardando assinatura digital do colaborador.
              </div>
            )}
          </div>
        </Card>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum holerite gerado para esta competência.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <Card key={p.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="font-medium flex items-center gap-2">
                    {p.employees?.name}
                    {p.signed_at ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3" /> Assinado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <Clock className="w-3 h-3" /> Pendente
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Líquido: <span className="text-foreground font-semibold">{fmt(p.liquido)}</span>
                    {p.signed_at && (
                      <span className="ml-2">· Assinado {new Date(p.signed_at).toLocaleString("pt-BR")}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={async () => {
                  const { data } = await supabase.from("payroll_items").select("*").eq("payslip_id", p.id).order("sort_order");
                  downloadPayslipPdf(buildPdfData(p, data || [], year, month));
                }} className="gap-1">
                  <Download className="w-4 h-4" /> PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => open(p)} className="gap-1">
                  <Eye className="w-4 h-4" /> Ver
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
