import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface EpiTermoData {
  employeeName: string;
  employeeCpf: string;
  epiName: string;
  epiCategory: string;
  deliveredAt: string;
  expiresAt: string;
  deliveredBy: string;
  notes: string | null;
  status: string;
  acceptedAt: string | null;
  signatureUrl: string | null;
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR");
}

function formatDateTimeBR(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("pt-BR");
}

export async function generateEpiTermo(data: EpiTermoData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 20;

  const addLine = (thickness = 0.3) => {
    doc.setDrawColor(180);
    doc.setLineWidth(thickness);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  };

  const addSection = (title: string) => {
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 60, 120);
    doc.text(title, margin, y);
    y += 2;
    addLine(0.5);
    doc.setTextColor(40, 40, 40);
  };

  const addField = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(label + ":", margin, y);
    doc.setFont("helvetica", "normal");
    const labelW = doc.getTextWidth(label + ": ");
    doc.text(value || "—", margin + labelW, y);
    y += 6;
  };

  // === HEADER ===
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 60, 120);
  doc.text("TERMO DE ENTREGA DE EQUIPAMENTO", pageW / 2, y, { align: "center" });
  y += 6;
  doc.text("DE PROTEÇÃO INDIVIDUAL (EPI)", pageW / 2, y, { align: "center" });
  y += 4;
  addLine(0.8);

  // === DADOS DO COLABORADOR ===
  addSection("DADOS DO COLABORADOR");
  addField("Nome completo", data.employeeName);
  addField("CPF", data.employeeCpf || "Não informado");

  // === DADOS DO EPI ===
  addSection("DADOS DO EPI");
  addField("Nome do EPI", data.epiName);
  addField("Categoria", data.epiCategory);
  addField("Data de entrega", formatDateBR(data.deliveredAt));
  addField("Validade", formatDateBR(data.expiresAt));
  addField("Responsável pela entrega", data.deliveredBy);
  if (data.notes) {
    addField("Observações", data.notes);
  }

  // === STATUS ===
  addSection("STATUS DA ENTREGA");
  const statusText = data.status === "aceito" ? "ENTREGUE E ACEITO" : "PENDENTE DE ACEITE";
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  if (data.status === "aceito") {
    doc.setTextColor(22, 130, 65);
  } else {
    doc.setTextColor(200, 130, 0);
  }
  doc.text(statusText, margin, y);
  y += 6;
  doc.setTextColor(40, 40, 40);

  if (data.acceptedAt) {
    addField("Data e hora do aceite", formatDateTimeBR(data.acceptedAt));
  }

  // === TERMO DE RESPONSABILIDADE ===
  addSection("TERMO DE RESPONSABILIDADE");
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const termoText = [
    "Declaro que recebi o(s) Equipamento(s) de Proteção Individual (EPI) acima descrito(s),",
    "em perfeitas condições de uso, estando ciente das orientações quanto ao uso correto,",
    "guarda, conservação, higienização e substituição.",
    "",
    "Comprometo-me a:",
    "• Utilizar o EPI de forma adequada e contínua",
    "• Zelar pela conservação do equipamento",
    "• Comunicar imediatamente qualquer dano, perda ou necessidade de substituição",
    "• Devolver o EPI quando solicitado, em caso de desligamento ou substituição",
    "",
    "Declaro estar ciente de que o não uso adequado poderá acarretar medidas",
    "administrativas conforme normas internas.",
  ];
  termoText.forEach(line => {
    doc.text(line, margin, y);
    y += 4;
  });

  // === ASSINATURA ===
  y += 6;
  addSection("ASSINATURA DO COLABORADOR");

  if (data.signatureUrl && data.status === "aceito") {
    try {
      const { data: urlData } = supabase.storage
        .from("epi-signatures")
        .getPublicUrl(data.signatureUrl);

      if (urlData?.publicUrl) {
        const response = await fetch(urlData.publicUrl);
        if (response.ok) {
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = "";
          uint8.forEach(b => binary += String.fromCharCode(b));
          const base64 = btoa(binary);
          const imgData = `data:image/png;base64,${base64}`;

          // Draw border around signature area
          doc.setDrawColor(180);
          doc.setLineWidth(0.3);
          doc.rect(margin, y, 80, 35);
          doc.addImage(imgData, "PNG", margin + 2, y + 2, 76, 31);
          y += 38;
        } else {
          doc.setFontSize(8);
          doc.text("(Assinatura registrada digitalmente)", margin, y);
          y += 6;
        }
      }
    } catch {
      doc.setFontSize(8);
      doc.text("(Assinatura registrada digitalmente)", margin, y);
      y += 6;
    }
  } else {
    // Empty signature area for printing
    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentW, 30);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text("Assinatura do colaborador", margin + 2, y + 28);
    doc.setTextColor(40, 40, 40);
    y += 34;
  }

  // Responsible signature line
  y += 4;
  doc.setDrawColor(100);
  doc.setLineWidth(0.2);
  doc.line(margin, y, margin + 80, y);
  y += 4;
  doc.setFontSize(8);
  doc.text(`Responsável: ${data.deliveredBy}`, margin, y);
  y += 5;
  doc.text(`Data: ${formatDateBR(data.deliveredAt)}`, margin, y);

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text("APA Ponto — Termo de Entrega de EPI", pageW / 2, footerY, { align: "center" });

  // Download
  const safeName = data.employeeName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  doc.save(`Termo_EPI_${safeName}_${data.deliveredAt}.pdf`);
}
