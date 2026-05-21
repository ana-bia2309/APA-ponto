import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface EpiTermoData {
  empresa: string;
  setor: string;
  localEntrega: string;
  employeeName: string;
  employeeCpf: string;
  cargo: string;
  departamento: string;
  matricula: string;
  epiName: string;
  epiCategory: string;
  codigo: string;
  ca: string;
  marca: string;
  tamanho: string;
  quantidade: number;
  estado: string;
  finalidade: string;
  deliveredAt: string;
  expiresAt: string;
  deliveredBy: string;
  notes: string | null;
  status: string;
  acceptedAt: string | null;
  signatureUrl: string | null;
}

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d.includes("T") ? d : d + "T00:00:00").toLocaleDateString("pt-BR");
}

function fmtDateTime(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

const BLUE = [30, 60, 120] as const;
const DARK = [40, 40, 40] as const;
const MUTED = [120, 120, 130] as const;

export async function generateEpiTermo(data: EpiTermoData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18; // margin
  const CW = W - M * 2; // content width
  let y = 16;

  // ── Helpers ──
  const line = (thickness = 0.3, color = 200) => {
    doc.setDrawColor(color);
    doc.setLineWidth(thickness);
    doc.line(M, y, W - M, y);
    y += 2;
  };

  const sectionHeader = (title: string) => {
    y += 3;
    // Background bar
    doc.setFillColor(235, 240, 248);
    doc.rect(M, y - 4, CW, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE);
    doc.text(title.toUpperCase(), M + 3, y);
    y += 6;
    doc.setTextColor(...DARK);
  };

  const field = (label: string, value: string, x?: number, maxW?: number) => {
    if (!value) return;
    const xPos = x || M;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(label, xPos, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const labelW = doc.getTextWidth(label + " ");
    const lines = doc.splitTextToSize(value, (maxW || CW) - labelW);
    doc.text(lines, xPos + labelW, y);
    y += lines.length * 4.5;
  };

  const fieldRow = (fields: [string, string][], rowY?: number) => {
    const startY = rowY || y;
    const colW = CW / fields.length;
    fields.forEach(([label, value], i) => {
      if (!value) return;
      const xPos = M + i * colW;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MUTED);
      doc.text(label, xPos, startY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);
      doc.text(value, xPos, startY + 4);
    });
    y = startY + 9;
  };

  // ══════════════════════════════════════════
  // 1. CABEÇALHO
  // ══════════════════════════════════════════
  doc.setFillColor(30, 60, 120);
  doc.rect(0, 0, W, 28, "F");

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("TERMO DE ENTREGA DE EQUIPAMENTO", W / 2, 10, { align: "center" });
  doc.text("DE PROTEÇÃO INDIVIDUAL (EPI)", W / 2, 17, { align: "center" });

  // Company info bar
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 215, 240);
  const headerInfo = [
    data.empresa && `Empresa: ${data.empresa}`,
    data.setor && `Setor: ${data.setor}`,
    data.localEntrega && `Local: ${data.localEntrega}`,
  ].filter(Boolean).join("  |  ");
  if (headerInfo) {
    doc.text(headerInfo, W / 2, 24, { align: "center" });
  }

  y = 34;

  // Doc number & date
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`Data: ${fmtDate(data.deliveredAt)}`, W - M, y, { align: "right" });
  y += 6;

  // ══════════════════════════════════════════
  // 2. DADOS DO COLABORADOR
  // ══════════════════════════════════════════
  sectionHeader("Dados do Colaborador");
  fieldRow([
    ["Nome completo:", data.employeeName],
    ["CPF:", data.employeeCpf || "Não informado"],
  ]);
  fieldRow([
    ["Matrícula:", data.matricula],
    ["Cargo:", data.cargo],
    ["Departamento:", data.departamento],
  ]);

  // ══════════════════════════════════════════
  // 3. DADOS DO EPI
  // ══════════════════════════════════════════
  sectionHeader("Dados do EPI");
  fieldRow([
    ["Nome do EPI:", data.epiName],
    ["Categoria:", data.epiCategory],
  ]);
  fieldRow([
    ["Código / Ref:", data.codigo],
    ["CA:", data.ca],
    ["Marca:", data.marca],
  ]);
  fieldRow([
    ["Tamanho:", data.tamanho],
    ["Quantidade:", String(data.quantidade || 1)],
    ["Estado:", data.estado || "Novo"],
  ]);
  fieldRow([
    ["Data de entrega:", fmtDate(data.deliveredAt)],
    ["Validade:", fmtDate(data.expiresAt)],
  ]);

  // ══════════════════════════════════════════
  // 4. FINALIDADE
  // ══════════════════════════════════════════
  if (data.finalidade) {
    sectionHeader("Finalidade de Uso");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const fLines = doc.splitTextToSize(data.finalidade, CW - 6);
    doc.text(fLines, M + 3, y);
    y += fLines.length * 4.5 + 2;
  }

  // ══════════════════════════════════════════
  // 5. TERMO DE RESPONSABILIDADE
  // ══════════════════════════════════════════
  sectionHeader("Termo de Responsabilidade");

  const termoText = `Declaro que recebi o(s) Equipamento(s) de Proteção Individual (EPI) acima descrito(s), em perfeitas condições de uso, e que fui devidamente orientado(a) quanto ao uso correto, guarda, conservação, higienização e substituição quando necessário.

Comprometo-me a utilizar o EPI somente para a finalidade a que se destina, zelar por sua conservação e comunicar imediatamente ao responsável qualquer dano, extravio ou necessidade de troca.

Declaro ainda estar ciente de que a devolução do EPI poderá ser exigida em caso de desligamento, substituição ou inutilização.

O não cumprimento das obrigações acima poderá acarretar medidas administrativas conforme normas internas e legislação vigente.`;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 70);
  const termoLines = doc.splitTextToSize(termoText, CW - 6);
  doc.text(termoLines, M + 3, y);
  y += termoLines.length * 3.8 + 2;

  // ══════════════════════════════════════════
  // 6. OBSERVAÇÕES
  // ══════════════════════════════════════════
  if (data.notes) {
    sectionHeader("Observações");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const nLines = doc.splitTextToSize(data.notes, CW - 6);
    doc.text(nLines, M + 3, y);
    y += nLines.length * 4.5 + 2;
  }

  // ══════════════════════════════════════════
  // 7. STATUS
  // ══════════════════════════════════════════
  y += 2;
  const statusText = data.status === "aceito" ? "✓ ENTREGUE E ACEITO" : "⏳ PENDENTE DE ACEITE";
  if (data.status === "aceito") {
    doc.setFillColor(230, 248, 235);
    doc.setTextColor(22, 130, 65);
  } else {
    doc.setFillColor(255, 245, 220);
    doc.setTextColor(180, 120, 0);
  }
  doc.roundedRect(M, y - 4, CW, 8, 2, 2, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(statusText, W / 2, y + 1, { align: "center" });
  y += 8;
  doc.setTextColor(...DARK);

  if (data.acceptedAt) {
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Aceito em: ${fmtDateTime(data.acceptedAt)}`, W / 2, y, { align: "center" });
    y += 5;
  }

  // ══════════════════════════════════════════
  // 8. ASSINATURAS
  // ══════════════════════════════════════════

  // Check if we need a new page
  if (y > H - 70) {
    doc.addPage();
    y = 20;
  }

  sectionHeader("Assinaturas");

  const halfW = CW / 2 - 4;

  // Left: Collaborator
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text("COLABORADOR", M, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.setFontSize(7.5);
  doc.text(`Nome: ${data.employeeName}`, M, y);
  y += 4;

  if (data.signatureUrl && data.status === "aceito") {
    // Try to load signature image
    try {
      const { data: signedData } = await supabase.storage.from("epi-signatures").createSignedUrl(data.signatureUrl, 60);
      if (signedData?.signedUrl) {
        const response = await fetch(signedData.signedUrl);
        if (response.ok) {
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = "";
          uint8.forEach(b => binary += String.fromCharCode(b));
          const base64 = btoa(binary);
          const imgData = `data:image/png;base64,${base64}`;

          doc.setDrawColor(200);
          doc.setLineWidth(0.3);
          doc.rect(M, y, halfW, 28);
          doc.addImage(imgData, "PNG", M + 2, y + 1, halfW - 4, 26);
          y += 30;
        } else {
          doc.text("(Assinatura digital registrada)", M, y);
          y += 5;
        }
      }
    } catch {
      doc.text("(Assinatura digital registrada)", M, y);
      y += 5;
    }
  } else {
    // Empty signature box
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.rect(M, y, halfW, 25);
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("Assinatura do colaborador", M + 2, y + 23);
    y += 27;
  }

  if (data.acceptedAt) {
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Data do aceite: ${fmtDateTime(data.acceptedAt)}`, M, y);
    y += 5;
  }

  // Right side: Responsible (same Y level as collaborator signature)
  const rightX = M + halfW + 8;
  const sigStartY = y - (data.signatureUrl && data.status === "aceito" ? 35 : 32);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text("RESPONSÁVEL PELA ENTREGA", rightX, sigStartY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.setFontSize(7.5);
  doc.text(`Nome: ${data.deliveredBy}`, rightX, sigStartY + 4);

  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.rect(rightX, sigStartY + 8, halfW, 25);
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("Assinatura do responsável", rightX + 2, sigStartY + 31);

  doc.setFontSize(7);
  doc.text(`Data: ${fmtDate(data.deliveredAt)}`, rightX, sigStartY + 36);
  if (data.localEntrega) {
    doc.text(`Local: ${data.localEntrega}`, rightX, sigStartY + 40);
  }

  // ══════════════════════════════════════════
  // FOOTER
  // ══════════════════════════════════════════
  doc.setDrawColor(30, 60, 120);
  doc.setLineWidth(0.5);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("AMR Ponto — Termo de Entrega de Equipamento de Proteção Individual", W / 2, H - 8, { align: "center" });

  // Save
  const safeName = data.employeeName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  doc.save(`Termo_EPI_${safeName}_${data.deliveredAt}.pdf`);
}
