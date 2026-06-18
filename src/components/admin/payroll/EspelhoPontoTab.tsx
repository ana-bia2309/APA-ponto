import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, RefreshCw, FileDown, Lock, CheckCircle, AlertTriangle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import jsPDF from "jspdf";
import { getDiaEscalaComExcecoes, buscarExcecoesEscala } from "@/lib/escala12x36";

type Employee = Tables<"employees">;

interface TimeRecord {
  id: string;
  employee_id: string;
  record_type: string;
  recorded_at: string;
  mode: string;
}

interface DayRecord {
  date: string;
  entrada: string | null;
  intervalo: string | null;
  retorno: string | null;
  saida: string | null;
  totalMinutes: number;
  status: "completo" | "incompleto" | "falta" | "folga";
}

interface TimesheetClosing {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  status: string;
  closed_at: string | null;
  closed_by: string | null;
  signature_url: string | null;
  accepted_at: string | null;
}

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtHours(minutes: number): string {
  if (minutes <= 0) return "0h00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    days.push(date.toISOString().slice(0, 10));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function spDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

interface Shift {
  refDate: string;            // data de referência do turno = data da entrada
  entrada: string | null;
  intervalo: string | null;
  retorno: string | null;
  saida: string | null;
  totalMinutes: number;
  overnight: boolean;         // turno que atravessa a meia-noite
}

// Monta turnos completos a partir dos registros, em ordem cronológica,
// em vez de agrupar por data civil. Isso resolve o problema de turnos
// noturnos que começam num dia e terminam no dia seguinte.
function buildShifts(records: TimeRecord[]): Shift[] {
  const sorted = [...records].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  const shifts: Shift[] = [];
  let current: { entrada: string | null; intervalo: string | null; retorno: string | null; saida: string | null } | null = null;

  const finalize = () => {
    if (!current) return;
    const { entrada, intervalo, retorno, saida } = current;
    let totalMinutes = 0;
    if (entrada && saida) {
      const manha = intervalo
        ? (new Date(intervalo).getTime() - new Date(entrada).getTime()) / 60000
        : (new Date(saida).getTime() - new Date(entrada).getTime()) / 60000;
      const tarde = (retorno && saida)
        ? (new Date(saida).getTime() - new Date(retorno).getTime()) / 60000
        : 0;
      totalMinutes = Math.round(intervalo ? manha + tarde : manha);
    }
    const refDate = entrada ? spDate(entrada)
      : intervalo ? spDate(intervalo)
        : retorno ? spDate(retorno)
          : saida ? spDate(saida) : "";
    const overnight = !!(entrada && saida && spDate(entrada) !== spDate(saida));
    shifts.push({ refDate, entrada, intervalo, retorno, saida, totalMinutes, overnight });
    current = null;
  };

  for (const r of sorted) {
    if (r.record_type === "entrada") {
      finalize(); // fecha o turno anterior (mesmo que incompleto) antes de abrir um novo
      current = { entrada: r.recorded_at, intervalo: null, retorno: null, saida: null };
    } else {
      if (!current) current = { entrada: null, intervalo: null, retorno: null, saida: null };
      if (r.record_type === "intervalo" && !current.intervalo) current.intervalo = r.recorded_at;
      else if (r.record_type === "retorno" && !current.retorno) current.retorno = r.recorded_at;
      else if (r.record_type === "saida" && !current.saida) {
        current.saida = r.recorded_at;
        finalize();
      }
    }
  }
  finalize();
  return shifts;
}

function buildDayRecords(
  records: TimeRecord[],
  year: number,
  month: number,
  escalaInfo: { isEscala12x36: boolean; referenciaData: string | null; excecoes: Record<string, "trabalha" | "descansa"> },
): DayRecord[] {
  const days = getDaysInMonth(year, month);
  const shifts = buildShifts(records);

  const byDate = new Map<string, Shift[]>();
  shifts.forEach(s => {
    if (!s.refDate) return;
    if (!byDate.has(s.refDate)) byDate.set(s.refDate, []);
    byDate.get(s.refDate)!.push(s);
  });

  return days.map(date => {
    const dow = new Date(date + "T12:00:00").getDay();
    const isWeekend = dow === 0 || dow === 6;

    // Dia esperado de trabalho: para 12x36 configurado, usa a rotação real
    // (incluindo fins de semana); para escala padrão, segue seg-sex como antes.
    const diaTrabalhoEsperado = escalaInfo.isEscala12x36 && escalaInfo.referenciaData
      ? getDiaEscalaComExcecoes(escalaInfo.referenciaData, date, escalaInfo.excecoes) === "trabalha"
      : !isWeekend;

    const dayShifts = byDate.get(date) || [];

    if (dayShifts.length === 0) {
      return {
        date, entrada: null, intervalo: null, retorno: null, saida: null,
        totalMinutes: 0, status: diaTrabalhoEsperado ? "falta" : "folga",
      };
    }

    const main = dayShifts[0];
    const totalMinutes = dayShifts.reduce((a, s) => a + s.totalMinutes, 0);
    const status: DayRecord["status"] = main.entrada && main.saida
      ? "completo"
      : (main.entrada || main.intervalo || main.retorno || main.saida)
        ? "incompleto"
        : diaTrabalhoEsperado ? "falta" : "folga";

    return { date, entrada: main.entrada, intervalo: main.intervalo, retorno: main.retorno, saida: main.saida, totalMinutes, status };
  });
}

function generateEspelhoPDF(
  employee: Employee,
  days: DayRecord[],
  year: number,
  month: number,
  closing: TimesheetClosing | null,
  signatureDataUrl?: string | null,
  afastamentosDias?: Record<string, string>
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const CW = W - M * 2;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 28, "F");
  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text("ESPELHO DE PONTO", W / 2, 11, { align: "center" });
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 200, 230);
  doc.text("APA Refrigeração e Climatização", W / 2, 17, { align: "center" });
  doc.text(`Competência: ${MONTH_NAMES[month - 1]} / ${year}`, W / 2, 22, { align: "center" });

  let y = 34;

  // Employee info
  doc.setFillColor(245, 247, 250);
  doc.rect(M, y, CW, 16, "FD");
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 90);
  doc.text("FUNCIONÁRIO", M + 2, y + 5);
  doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 40);
  doc.setFontSize(9);
  doc.text(`Nome: ${employee.name}`, M + 2, y + 10);
  doc.text(`CPF: ${(employee as any).cpf || "—"}`, M + 80, y + 10);
  doc.text(`Cargo: ${(employee as any).cargo || "—"}`, M + 2, y + 15);
  doc.text(`Matrícula: ${(employee as any).matricula || "—"}`, M + 80, y + 15);
  y += 20;

  // Table header
  doc.setFillColor(15, 23, 42);
  doc.rect(M, y, CW, 7, "F");
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  const cols = [M + 2, M + 22, M + 52, M + 82, M + 112, M + 142, M + 158];
  ["DATA", "DIA", "ENTRADA", "INTERVALO", "RETORNO", "SAÍDA", "TOTAL"].forEach((h, i) => {
    doc.text(h, cols[i], y + 5);
  });
  y += 7;

  doc.setFontSize(7.5);
  const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  let totalGeral = 0;
  let workDays = 0;
  let faults = 0;

  days.forEach((d, idx) => {
    const dow = new Date(d.date + "T12:00:00").getDay();
    const isWeekend = dow === 0 || dow === 6;

    if (idx % 2 === 0 && !isWeekend) {
      doc.setFillColor(250, 251, 253);
      doc.rect(M, y, CW, 6, "F");
    }
    if (isWeekend) {
      doc.setFillColor(240, 240, 245);
      doc.rect(M, y, CW, 6, "F");
    }

    const [, , dd] = d.date.split("-");
    doc.setFont("helvetica", isWeekend ? "bold" : "normal");
    doc.setTextColor(isWeekend ? 120 : 40, isWeekend ? 120 : 40, isWeekend ? 130 : 50);

    doc.text(`${dd}/${month.toString().padStart(2, "0")}`, cols[0], y + 4.5);
    doc.text(DAY_NAMES[dow], cols[1], y + 4.5);
    doc.text(fmtTime(d.entrada), cols[2], y + 4.5);
    doc.text(fmtTime(d.intervalo), cols[3], y + 4.5);
    doc.text(fmtTime(d.retorno), cols[4], y + 4.5);
    doc.text(fmtTime(d.saida), cols[5], y + 4.5);

    const labelAfast = afastamentosDias?.[d.date];
    let valorCelula = "—";
    if (labelAfast) {
      doc.setTextColor(194, 65, 12); // laranja
      valorCelula = labelAfast;
    } else if (d.status === "completo") {
      doc.setTextColor(20, 110, 60);
      totalGeral += d.totalMinutes;
      workDays++;
      valorCelula = fmtHours(d.totalMinutes);
    } else if (d.status === "incompleto") {
      doc.setTextColor(180, 100, 0);
      valorCelula = fmtHours(d.totalMinutes);
    } else if (d.status === "falta") {
      doc.setTextColor(160, 30, 40);
      faults++;
      valorCelula = "0h00";
    }
    // status "folga": mantém valorCelula = "—", sem cor especial

    doc.text(valorCelula, cols[6], y + 4.5);
    y += 6;
    doc.setTextColor(40, 40, 50);

    if (y > H - 40) {
      doc.addPage();
      y = 15;
    }
  });

  // Totals
  y += 2;
  doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 5;
  doc.setFillColor(15, 23, 42);
  doc.rect(M, y, CW, 10, "F");
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text(`Total de horas: ${fmtHours(totalGeral)}`, M + 4, y + 6.5);
  doc.text(`Dias trabalhados: ${workDays}`, M + 60, y + 6.5);
  doc.text(`Faltas: ${faults}`, M + 120, y + 6.5);
  y += 14;

  // Signature
  if (y > H - 50) { doc.addPage(); y = 20; }
  const halfW = CW / 2 - 4;
  const rightX = M + halfW + 8;
  const sigY = y;

  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 60, 120);
  doc.text("FUNCIONÁRIO", M, sigY);
  doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 50); doc.setFontSize(7.5);
  doc.text(`Nome: ${employee.name}`, M, sigY + 5);

  const boxY = sigY + 10;

  if (closing?.status === "assinado" && signatureDataUrl) {
    try { doc.addImage(signatureDataUrl, "PNG", M, boxY, halfW, 18); } catch { }
    doc.setDrawColor(180); doc.setLineWidth(0.3);
    doc.line(M, boxY + 18, M + halfW, boxY + 18);
    doc.setFontSize(7); doc.setTextColor(120, 120, 130);
    doc.text("Assinatura do colaborador", M, boxY + 22);
    if (closing.accepted_at) {
      doc.text(`Assinado em: ${new Date(closing.accepted_at).toLocaleString("pt-BR")}`, M, boxY + 27);
    }
  } else if (closing?.status === "assinado") {
    doc.setFillColor(230, 248, 235);
    doc.rect(M, boxY, halfW, 18, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(22, 130, 65);
    doc.text("✓ Assinado digitalmente", M + halfW / 2, boxY + 8, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(22, 100, 55);
    if (closing.accepted_at) doc.text(new Date(closing.accepted_at).toLocaleString("pt-BR"), M + halfW / 2, boxY + 14, { align: "center" });
    doc.setDrawColor(180); doc.setLineWidth(0.3);
    doc.line(M, boxY + 18, M + halfW, boxY + 18);
    doc.setFontSize(7); doc.setTextColor(120, 120, 130);
    doc.text("Assinatura do colaborador", M, boxY + 22);
  } else {
    doc.setDrawColor(180); doc.setLineWidth(0.3);
    doc.line(M, boxY + 18, M + halfW, boxY + 18);
    doc.setFontSize(7); doc.setTextColor(120, 120, 130);
    doc.text("Assinatura do funcionário", M, boxY + 22);
  }

  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 60, 120);
  doc.text("RESPONSÁVEL / EMPRESA", rightX, sigY);
  doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 50); doc.setFontSize(7.5);
  doc.text("APA Refrigeração e Climatização", rightX, sigY + 5);
  doc.setDrawColor(180); doc.setLineWidth(0.3);
  doc.line(rightX, boxY + 18, rightX + halfW, boxY + 18);
  doc.setFontSize(7); doc.setTextColor(120, 120, 130);
  doc.text("Assinatura do responsável", rightX, boxY + 22);

  // Footer
  doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.5);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setFontSize(6.5); doc.setTextColor(120, 120, 130);
  doc.text(`APA Ponto — Espelho de Ponto — Gerado em ${new Date().toLocaleString("pt-BR")}`, W / 2, H - 8, { align: "center" });

  const safeName = employee.name.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  doc.save(`Espelho_${safeName}_${month.toString().padStart(2, "0")}-${year}.pdf`);
}

export default function EspelhoPontoTab({ employees }: { employees: Employee[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [closing, setClosing] = useState<TimesheetClosing | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing2, setClosing2] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [afastamentosDias, setAfastamentosDias] = useState<Record<string, string>>({});
  const [excecoesEscala, setExcecoesEscala] = useState<Record<string, "trabalha" | "descansa">>({});

  const selectedEmployee = employees.find(e => e.id === selectedId);
  const isEscala12x36 = !!selectedEmployee && (selectedEmployee as any).escala === "12x36" && !!(selectedEmployee as any).escala_referencia_data;
  const escalaReferenciaData = selectedEmployee ? (selectedEmployee as any).escala_referencia_data || null : null;

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const startBuffer = new Date(year, month - 1, 1);
      startBuffer.setDate(startBuffer.getDate() - 1);
      const endBuffer = new Date(year, month, 1);
      endBuffer.setDate(endBuffer.getDate() + 1);
      const start = startBuffer.toISOString();
      const end = endBuffer.toISOString();

      const primeiroDia = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const ultimoDia = new Date(year, month, 0).toISOString().slice(0, 10);

      const emp = employees.find(e => e.id === selectedId);
      const empIsEscala12x36 = !!emp && (emp as any).escala === "12x36" && !!(emp as any).escala_referencia_data;
      if (empIsEscala12x36) {
        const excecoes = await buscarExcecoesEscala(selectedId, primeiroDia, ultimoDia);
        setExcecoesEscala(excecoes);
      } else {
        setExcecoesEscala({});
      }

      const [recRes, closingRes, afastRes] = await Promise.all([
        supabase.from("time_records" as any)
          .select("id, employee_id, record_type, recorded_at, mode")
          .eq("employee_id", selectedId)
          .gte("recorded_at", start)
          .lt("recorded_at", end)
          .order("recorded_at", { ascending: true }),
        supabase.from("timesheet_closings" as any)
          .select("*")
          .eq("employee_id", selectedId)
          .eq("month", month)
          .eq("year", year)
          .maybeSingle(),
        (supabase as any).from("afastamentos")
          .select("tipo, data_inicio, data_fim")
          .eq("employee_id", selectedId)
          .lte("data_inicio", ultimoDia)
          .gte("data_fim", primeiroDia),
      ]);

      if (recRes.data) setRecords(recRes.data as any);
      setClosing((closingRes.data as any) || null);
      // Monta mapa dia → label do afastamento
      const labels: Record<string, string> = {
        licenca_medica: "Lic. Médica", licenca_maternidade: "Maternidade",
        licenca_paternidade: "Paternidade", ferias: "Férias",
        acidente_trabalho: "Acidente", suspensao: "Suspenso",
        abono_dia: "Abono", outro: "Afastado",
      };
      const diasAfastados: Record<string, string> = {};
      (afastRes.data || []).forEach((a: any) => {
        let d = a.data_inicio < primeiroDia ? primeiroDia : a.data_inicio;
        const fim = a.data_fim > ultimoDia ? ultimoDia : a.data_fim;
        while (d <= fim) {
          diasAfastados[d] = labels[a.tipo] || "Afastado";
          const dt = new Date(d + "T12:00:00");
          dt.setDate(dt.getDate() + 1);
          d = dt.toISOString().slice(0, 10);
        }
      });
      setAfastamentosDias(diasAfastados);
    } catch (err: any) {
      toast.error("Erro ao carregar: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId, month, year]);

  useEffect(() => { load(); }, [load]);

  const days = selectedEmployee
    ? buildDayRecords(records, year, month, { isEscala12x36, referenciaData: escalaReferenciaData, excecoes: excecoesEscala })
    : [];
  const totalMinutes = days.reduce((a, d) => a + d.totalMinutes, 0);
  const workDays = days.filter(d => d.status === "completo").length;
  const faults = days.filter(d => d.status === "falta").length;

  const handleDownload = async () => {
    if (!selectedEmployee) return;
    setDownloading(true);
    let signatureDataUrl: string | null = null;
    if (closing?.signature_url) {
      try {
        const { data: signed } = await supabase.storage
          .from("epi-signatures")
          .createSignedUrl(closing.signature_url, 60);
        if (signed?.signedUrl) {
          const res = await fetch(signed.signedUrl);
          if (res.ok) {
            const blob = await res.blob();
            const u8 = new Uint8Array(await blob.arrayBuffer());
            let bin = "";
            u8.forEach(b => (bin += String.fromCharCode(b)));
            signatureDataUrl = `data:image/png;base64,${btoa(bin)}`;
          }
        }
      } catch { }
    }
    generateEspelhoPDF(selectedEmployee, days, year, month, closing, signatureDataUrl, afastamentosDias);
    setDownloading(false);
  };

  const handleClose = async () => {
    if (!selectedId || !selectedEmployee) return;
    if (!confirm(`Fechar o espelho de ponto de ${selectedEmployee.name} para ${MONTH_NAMES[month - 1]}/${year}? O funcionário receberá para assinar.`)) return;
    setClosing2(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        employee_id: selectedId,
        month,
        year,
        status: "fechado",
        closed_at: new Date().toISOString(),
        closed_by: user?.email || "admin",
      };

      if (closing) {
        await supabase.from("timesheet_closings" as any).update(payload).eq("id", closing.id);
      } else {
        await supabase.from("timesheet_closings" as any).insert(payload);
      }

      toast.success("Espelho fechado! O funcionário pode agora assinar.");
      load();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setClosing2(false);
    }
  };

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Espelho de Ponto
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Funcionário</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Selecione...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mês</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Ano</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {selectedEmployee && !loading && (
        <>
          {/* Status */}
          <div className="flex items-center gap-3 flex-wrap">
            {closing ? (
              <Badge variant={closing.status === "assinado" ? "default" : "secondary"} className={closing.status === "assinado" ? "bg-emerald-500" : ""}>
                {closing.status === "assinado" ? "✓ Assinado" : closing.status === "fechado" ? "🔒 Fechado — aguardando assinatura" : "Aberto"}
              </Badge>
            ) : (
              <Badge variant="outline">Aberto</Badge>
            )}
            {closing?.closed_at && (
              <span className="text-xs text-muted-foreground">Fechado em: {new Date(closing.closed_at).toLocaleString("pt-BR")}</span>
            )}
            {closing?.accepted_at && (
              <span className="text-xs text-emerald-600">Assinado em: {new Date(closing.accepted_at).toLocaleString("pt-BR")}</span>
            )}
          </div>

          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 text-center">
              <p className="text-2xl font-bold text-emerald-500">{fmtHours(totalMinutes)}</p>
              <p className="text-xs text-muted-foreground mt-1">Total de horas</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-2xl font-bold text-blue-500">{workDays}</p>
              <p className="text-xs text-muted-foreground mt-1">Dias trabalhados</p>
            </Card>
            <Card className="p-3 text-center">
              <p className={`text-2xl font-bold ${faults > 0 ? "text-rose-500" : "text-emerald-500"}`}>{faults}</p>
              <p className="text-xs text-muted-foreground mt-1">Faltas</p>
            </Card>
          </div>

          {/* Calendário visual */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calendário — {MONTH_NAMES[month - 1]}/{year}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"></span>Presente</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block"></span>Incompleto</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-500 inline-block"></span>Falta</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block"></span>Folga</span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            {(() => {
              const firstDow = new Date(year, month - 1, 1).getDay();
              const cells: (DayRecord | null)[] = Array(firstDow).fill(null).concat(days);
              while (cells.length % 7 !== 0) cells.push(null);
              const weeks = [];
              for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
              return weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                  {week.map((day, di) => {
                    if (!day) return <div key={di} />;
                    const dow = new Date(day.date + "T12:00:00").getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const dayNum = parseInt(day.date.split("-")[2]);
                    const isAfastado = !!afastamentosDias[day.date];
                    let bg = "bg-blue-100 text-blue-600";
                    let title = isWeekend ? "Fim de semana" : "Folga";
                    if (isAfastado) {
                      bg = "bg-orange-100 text-orange-700";
                      title = afastamentosDias[day.date];
                    } else if (day.status === "completo") {
                      bg = "bg-emerald-100 text-emerald-700"; title = `${fmtHours(day.totalMinutes)}`;
                    } else if (day.status === "incompleto") {
                      bg = "bg-amber-100 text-amber-700"; title = "Incompleto";
                    } else if (day.status === "falta") {
                      bg = "bg-rose-100 text-rose-700"; title = "Falta";
                    }
                    return (
                      <div key={di} title={`${day.date} — ${title}`}
                        className={`rounded-md p-1 text-center cursor-default transition-all hover:opacity-80 ${bg}`}>
                        <p className="text-xs font-bold">{dayNum}</p>
                        {day.totalMinutes > 0 && (
                          <p className="text-[9px] leading-tight">{fmtHours(day.totalMinutes)}</p>
                        )}
                        {day.status === "incompleto" && (
                          <p className="text-[9px] leading-tight">inc.</p>
                        )}
                        {isAfastado && (
                          <p className="text-[9px] leading-tight truncate">{afastamentosDias[day.date]}</p>
                        )}
                        {!isAfastado && day.status === "falta" && (
                          <p className="text-[9px] leading-tight">falta</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </Card>
          {/* Tabela */}
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    {["Data", "Dia", "Entrada", "Intervalo", "Retorno", "Saída", "Total", "Status"].map(h => (
                      <th key={h} className="p-2 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d, i) => {
                    const dow = new Date(d.date + "T12:00:00").getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                    return (
                      <tr key={d.date} className={`border-t border-border/50 ${isWeekend ? "bg-muted/20 text-muted-foreground" : i % 2 === 0 ? "" : "bg-muted/10"}`}>
                        <td className="p-2 font-medium">{new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="p-2">{DAY_NAMES[dow]}</td>
                        <td className="p-2 tabular-nums">{fmtTime(d.entrada)}</td>
                        <td className="p-2 tabular-nums">{fmtTime(d.intervalo)}</td>
                        <td className="p-2 tabular-nums">{fmtTime(d.retorno)}</td>
                        <td className="p-2 tabular-nums">{fmtTime(d.saida)}</td>
                        <td className={`p-2 font-medium tabular-nums ${d.totalMinutes > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {d.totalMinutes > 0 ? fmtHours(d.totalMinutes) : "—"}
                        </td>
                        <td className="p-2">
                          {afastamentosDias[d.date] ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ background: "#ffedd5", color: "#c2410c" }}>
                              {afastamentosDias[d.date]}
                            </span>
                          ) : d.status === "completo" ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          ) : d.status === "incompleto" ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          ) : d.status === "falta" ? (
                            <span className="text-xs text-rose-500 font-medium">Falta</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{isWeekend ? "Fim de semana" : "Folga"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Ações */}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleDownload} disabled={downloading} variant="outline" className="gap-2">
              <FileDown className="w-4 h-4" />
              {downloading ? "Gerando PDF..." : "Baixar PDF"}
            </Button>
            {closing?.status !== "assinado" && (
              <Button onClick={handleClose} disabled={closing2} className="gap-2">
                <Lock className="w-4 h-4" />
                {closing?.status === "fechado" ? "Reenviar para assinatura" : "Fechar e enviar para assinar"}
              </Button>
            )}
          </div>
        </>
      )}

      {!selectedId && (
        <Card className="p-12 text-center">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Selecione um funcionário e o período para ver o espelho de ponto.</p>
        </Card>
      )}
    </div>
  );
}
