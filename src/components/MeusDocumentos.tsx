import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, ArrowLeft, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

type TipoDocumento = "holerite" | "informe_rendimento" | "contrato" | "advertencia" | "recibo" | "espelho_ponto" | "outro";

interface Documento {
  id: string;
  nome: string;
  tipo: TipoDocumento;
  tamanho?: string;
  criado_em: string;
  url?: string;
  meta?: any;
}

const TIPO_LABELS: Record<TipoDocumento, { label: string; color: string }> = {
  holerite:           { label: "Holerite",              color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  informe_rendimento: { label: "Informe de Rendimentos", color: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  contrato:           { label: "Contrato",              color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  advertencia:        { label: "Advertência",           color: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  recibo:             { label: "Recibo",                color: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  espelho_ponto:      { label: "Espelho de Ponto",      color: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30" },
  outro:              { label: "Outro",                 color: "bg-gray-500/15 text-gray-500 border-gray-500/30" },
};

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

interface Props {
  employeeName: string;
  cpf?: string;
  onClose: () => void;
}

export default function MeusDocumentos({ employeeName, cpf, onClose }: Props) {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const allDocs: Documento[] = [];

    try {
      // Busca documentos administrativos
      if (cpf) {
        const cpfDigits = cpf.replace(/\D/g, "");
        
        // Busca employee_id pelo CPF
        const { data: empRows } = await (supabase as any)
          .rpc("get_active_employee_by_cpf", { p_cpf: cpfDigits });
        const empData = Array.isArray(empRows) ? empRows[0] : empRows;

        const empId = empData?.id;

        if (empId) {
          // Espelhos de ponto assinados
          const { data: espelhos } = await (supabase as any)
            .rpc("get_signed_timesheets_by_cpf", { p_cpf: cpfDigits });

          if (espelhos) {
            espelhos.forEach((e: any) => {
              allDocs.push({
                id: `espelho_${e.id}`,
                nome: `Espelho de Ponto — ${MONTH_NAMES[e.month - 1]}/${e.year}`,
                tipo: "espelho_ponto",
                criado_em: e.accepted_at || `${e.year}-${String(e.month).padStart(2, "0")}-01`,
                meta: { ...e, empId },
              });
            });
          }

          // Documentos administrativos
          const { data: docData } = await (supabase as any)
            .rpc("get_employee_documents_by_cpf", { p_cpf: cpfDigits });

          if (docData) {
            docData.forEach((d: any) => {
              allDocs.push({
                id: d.id,
                nome: d.name || d.title || "Documento",
                tipo: d.type || "outro",
                criado_em: d.created_at,
                url: d.file_url || d.url,
                tamanho: d.file_size ? `${Math.round(d.file_size / 1024)} KB` : undefined,
              });
            });
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar documentos:", err);
    }

    setDocs(allDocs);
    setLoading(false);
  }, [cpf]);

  useEffect(() => { load(); }, [load]);

  const downloadEspelho = async (doc: Documento) => {
    setDownloading(doc.id);
    try {
      const meta = doc.meta;
      const empId = meta.empId;
      const month = meta.month;
      const year = meta.year;

      // Busca registros do mês
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();

      const [recRes, empRes] = await Promise.all([
        (supabase as any).from("time_records")
          .select("id, record_type, recorded_at")
          .eq("employee_id", empId)
          .gte("recorded_at", start)
          .lt("recorded_at", end)
          .order("recorded_at", { ascending: true }),
        (supabase as any).rpc("get_employee_profile", { p_employee_id: empId }),
      ]);

      const records = recRes.data || [];
      const emp = Array.isArray(empRes.data) ? empRes.data[0] : empRes.data;

      // Busca assinatura
      let signatureDataUrl: string | null = null;
      if (meta.signature_url) {
        try {
          const { data: signed } = await supabase.storage.from("epi-signatures").createSignedUrl(meta.signature_url, 60);
          if (signed?.signedUrl) {
            const res = await fetch(signed.signedUrl);
            if (res.ok) {
              const blob = await res.blob();
              const u8 = new Uint8Array(await blob.arrayBuffer());
              let bin = ""; u8.forEach(b => (bin += String.fromCharCode(b)));
              signatureDataUrl = `data:image/png;base64,${btoa(bin)}`;
            }
          }
        } catch {}
      }

      // Gera PDF simples
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = pdf.internal.pageSize.getWidth();
      const M = 15;

      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, W, 28, "F");
      pdf.setFontSize(13); pdf.setFont("helvetica", "bold"); pdf.setTextColor(255, 255, 255);
      pdf.text("ESPELHO DE PONTO", W / 2, 11, { align: "center" });
      pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(180, 200, 230);
      pdf.text("APA Refrigeração e Climatização", W / 2, 17, { align: "center" });
      pdf.text(`Competência: ${MONTH_NAMES[month - 1]} / ${year}`, W / 2, 22, { align: "center" });

      let y = 34;
      pdf.setFillColor(245, 247, 250);
      pdf.rect(M, y, W - M * 2, 14, "FD");
      pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(40, 40, 50);
      pdf.text(`Nome: ${emp?.name || employeeName}`, M + 2, y + 5);
      pdf.text(`CPF: ${emp?.cpf || "—"}`, M + 2, y + 10);
      y += 18;

      // Tabela
      const DAY_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
      pdf.setFillColor(15, 23, 42);
      pdf.rect(M, y, W - M * 2, 7, "F");
      pdf.setFontSize(7.5); pdf.setFont("helvetica", "bold"); pdf.setTextColor(255,255,255);
      const cols = [M+2, M+22, M+52, M+82, M+112, M+142, M+158];
      ["DATA","DIA","ENTRADA","INTERVALO","RETORNO","SAÍDA","TOTAL"].forEach((h,i) => pdf.text(h, cols[i], y+5));
      y += 7;

      // Dias do mês
      const daysInMonth = new Date(year, month, 0).getDate();
      let totalMin = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        const dow = new Date(dateStr + "T12:00:00").getDay();
        const isWeekend = dow === 0 || dow === 6;
        const dayRecs = records.filter((r: any) => {
          const sp = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(r.recorded_at));
          return sp === dateStr;
        });
        const fmtT = (type: string) => {
          const r = dayRecs.find((r: any) => r.record_type === type);
          return r ? new Date(r.recorded_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
        };

        if (isWeekend) { pdf.setFillColor(240,240,245); pdf.rect(M, y, W-M*2, 6, "F"); }
        else if (d % 2 === 0) { pdf.setFillColor(250,251,253); pdf.rect(M, y, W-M*2, 6, "F"); }

        pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
        pdf.setTextColor(isWeekend ? 120 : 40, isWeekend ? 120 : 40, isWeekend ? 130 : 50);
        pdf.text(`${String(d).padStart(2,"0")}/${String(month).padStart(2,"0")}`, cols[0], y+4.5);
        pdf.text(DAY_NAMES[dow], cols[1], y+4.5);
        pdf.text(fmtT("entrada"), cols[2], y+4.5);
        pdf.text(fmtT("intervalo"), cols[3], y+4.5);
        pdf.text(fmtT("retorno"), cols[4], y+4.5);
        pdf.text(fmtT("saida"), cols[5], y+4.5);

        const entrada = dayRecs.find((r: any) => r.record_type === "entrada");
        const saida = dayRecs.find((r: any) => r.record_type === "saida");
        let mins = 0;
        if (entrada && saida) {
          const intervalo = dayRecs.find((r: any) => r.record_type === "intervalo");
          const retorno = dayRecs.find((r: any) => r.record_type === "retorno");
          if (intervalo && retorno) {
            mins = Math.round(((new Date(intervalo.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) + (new Date(saida.recorded_at).getTime() - new Date(retorno.recorded_at).getTime())) / 60000);
          } else {
            mins = Math.round((new Date(saida.recorded_at).getTime() - new Date(entrada.recorded_at).getTime()) / 60000);
          }
          totalMin += mins;
          pdf.setTextColor(20, 110, 60);
        }
        pdf.text(isWeekend ? "—" : mins > 0 ? `${Math.floor(mins/60)}h${String(mins%60).padStart(2,"0")}` : "0h00", cols[6], y+4.5);
        pdf.setTextColor(40,40,50);
        y += 6;
        if (y > 260) { pdf.addPage(); y = 15; }
      }

      // Totais
      y += 2;
      pdf.setFillColor(15,23,42); pdf.rect(M, y, W-M*2, 10, "F");
      pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
      pdf.text(`Total: ${Math.floor(totalMin/60)}h${String(totalMin%60).padStart(2,"0")}`, M+4, y+6.5);
      y += 14;

      // Assinatura
      const halfW = (W - M * 2) / 2 - 4;
      pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(30,60,120);
      pdf.text("FUNCIONÁRIO", M, y);
      pdf.setFont("helvetica","normal"); pdf.setTextColor(40,40,50); pdf.setFontSize(7.5);
      pdf.text(`Nome: ${emp?.name || employeeName}`, M, y+5);
      const boxY = y + 10;
      if (signatureDataUrl) {
        try { pdf.addImage(signatureDataUrl, "PNG", M, boxY, halfW, 18); } catch {}
      }
      pdf.setDrawColor(180); pdf.setLineWidth(0.3);
      pdf.line(M, boxY+18, M+halfW, boxY+18);
      pdf.setFontSize(7); pdf.setTextColor(120,120,130);
      pdf.text("Assinatura do colaborador", M, boxY+22);
      if (meta.accepted_at) pdf.text(`Assinado em: ${new Date(meta.accepted_at).toLocaleString("pt-BR")}`, M, boxY+27);

      pdf.setDrawColor(15,23,42); pdf.setLineWidth(0.5);
      pdf.line(M, pdf.internal.pageSize.getHeight()-12, W-M, pdf.internal.pageSize.getHeight()-12);
      pdf.setFontSize(6.5); pdf.setTextColor(120,120,130);
      pdf.text("APA Ponto — Espelho de Ponto", W/2, pdf.internal.pageSize.getHeight()-8, { align: "center" });

      const safeName = (emp?.name || employeeName).replace(/[^a-zA-Z0-9]/g,"_").substring(0,30);
      pdf.save(`Espelho_${safeName}_${String(month).padStart(2,"0")}-${year}.pdf`);
    } catch (err: any) {
      toast.error("Erro ao gerar PDF: " + err.message);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownload = async (doc: Documento) => {
    if (doc.tipo === "espelho_ponto") {
      await downloadEspelho(doc);
      return;
    }
    if (doc.url) {
      window.open(doc.url, "_blank");
    } else {
      toast.info("Download disponível em breve.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 relative" style={{ background: "#F0F4F8" }}>
      <div className="w-full max-w-md mx-auto" style={{ marginTop: "28px" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-600" />
            Meus Documentos
          </h2>
          <button onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-700 transition-colors"
            style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-4">{employeeName}</p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 bg-white rounded-2xl"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-sm text-gray-400">Carregando documentos...</span>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <FolderOpen className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">Nenhum documento disponível.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => {
              const tipo = TIPO_LABELS[doc.tipo] || TIPO_LABELS.outro;
              const isDownloading = downloading === doc.id;
              const tipoCores: Record<string, { bg: string; text: string }> = {
                holerite:           { bg: "#eff6ff", text: "#1e40af" },
                informe_rendimento: { bg: "#f5f3ff", text: "#7c3aed" },
                contrato:           { bg: "#f0fdf4", text: "#15803d" },
                advertencia:        { bg: "#fff1f2", text: "#be123c" },
                recibo:             { bg: "#fffbeb", text: "#b45309" },
                espelho_ponto:      { bg: "#ecfeff", text: "#0e7490" },
                outro:              { bg: "#f8fafc", text: "#475569" },
              };
              const c = tipoCores[doc.tipo] || tipoCores.outro;
              return (
                <div key={doc.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: c.bg }}>
                      <FileText className="w-5 h-5" style={{ color: c.text }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{doc.nome}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: c.bg, color: c.text }}>
                          {tipo.label}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(doc.criado_em).toLocaleDateString("pt-BR")}
                          {doc.tamanho && ` · ${doc.tamanho}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDownload(doc)} disabled={isDownloading}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:shadow-md disabled:opacity-50 active:scale-95"
                    style={{ background: c.bg, color: c.text }}>
                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
