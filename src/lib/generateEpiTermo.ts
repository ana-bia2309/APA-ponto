import jsPDF from "jspdf";

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
  signatureDataUrl?: string | null;
  signatureMethod?: string | null;
}

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d.includes("T") ? d : d + "T00:00:00").toLocaleDateString("pt-BR");
}
function fmtDateTime(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}
function methodLabel(m: string | null | undefined): string {
  if (m === "senha") return "Senha (CPF)";
  if (m === "otp") return "Código OTP";
  if (m === "desenho") return "Assinatura desenhada";
  return "Digital";
}

const BLUE = [30, 60, 120] as const;
const DARK = [40, 40, 40] as const;
const MUTED = [120, 120, 130] as const;

export function generateEpiTermo(data: EpiTermoData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const CW = W - M * 2;
  let y = 16;

  const sectionHeader = (title: string) => {
    y += 3;
    doc.setFillColor(235, 240, 248);
    doc.rect(M, y - 4, CW, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE);
    doc.text(title.toUpperCase(), M + 3, y);
    y += 6;
    doc.setTextColor(...DARK);
  };

  const fieldRow = (fields: [string, string][]) => {
    const startY = y;
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

  // CABEÇALHO
  doc.setFillColor(30, 60, 120);
  doc.rect(0, 0, W, 28, "F");
  doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text("TERMO DE ENTREGA DE EQUIPAMENTO", W / 2, 10, { align: "center" });
  doc.text("DE PROTEÇÃO INDIVIDUAL (EPI)", W / 2, 17, { align: "center" });
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(200, 215, 240);
  const headerInfo = [data.empresa && `Empresa: ${data.empresa}`, data.setor && `Setor: ${data.setor}`, data.localEntrega && `Local: ${data.localEntrega}`].filter(Boolean).join("  |  ");
  if (headerInfo) doc.text(headerInfo, W / 2, 24, { align: "center" });

  y = 34;
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  doc.text(`Data: ${fmtDate(data.deliveredAt)}`, W - M, y, { align: "right" });
  y += 6;

  sectionHeader("Dados do Colaborador");
  fieldRow([["Nome completo:", data.employeeName], ["CPF:", data.employeeCpf || "Não informado"]]);
  fieldRow([["Matrícula:", data.matricula || "—"], ["Cargo:", data.cargo || "—"], ["Departamento:", data.departamento || "—"]]);

  sectionHeader("Dados do EPI");
  fieldRow([["Nome do EPI:", data.epiName], ["Categoria:", data.epiCategory || "—"]]);
  fieldRow([["Código / Ref:", data.codigo || "—"], ["CA:", data.ca || "—"], ["Marca:", data.marca || "—"]]);
  fieldRow([["Tamanho:", data.tamanho || "—"], ["Quantidade:", String(data.quantidade || 1)], ["Estado:", data.estado || "Novo"]]);
  fieldRow([["Data de entrega:", fmtDate(data.deliveredAt)], ["Validade:", fmtDate(data.expiresAt)]]);

  if (data.finalidade) {
    sectionHeader("Finalidade de Uso");
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK);
    const fLines = doc.splitTextToSize(data.finalidade, CW - 6);
    doc.text(fLines, M + 3, y);
    y += fLines.length * 4.5 + 2;
  }

  sectionHeader("Termo de Responsabilidade");
  const termoText = `Declaro que recebi o(s) Equipamento(s) de Proteção Individual (EPI) acima descrito(s), em perfeitas condições de uso, e que fui devidamente orientado(a) quanto ao uso correto, guarda, conservação, higienização e substituição quando necessário.\n\nComprometo-me a utilizar o EPI somente para a finalidade a que se destina, zelar por sua conservação e comunicar imediatamente ao responsável qualquer dano, extravio ou necessidade de troca.\n\nDeclaro ainda estar ciente de que a devolução do EPI poderá ser exigida em caso de desligamento, substituição ou inutilização.\n\nO não cumprimento das obrigações acima poderá acarretar medidas administrativas conforme normas internas e legislação vigente.`;
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 70);
  const termoLines = doc.splitTextToSize(termoText, CW - 6);
  doc.text(termoLines, M + 3, y);
  y += termoLines.length * 3.8 + 2;

  if (data.notes) {
    sectionHeader("Observações");
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK);
    const nLines = doc.splitTextToSize(data.notes, CW - 6);
    doc.text(nLines, M + 3, y);
    y += nLines.length * 4.5 + 2;
  }

  // STATUS
  y += 2;
  const aceito = data.status === "aceito";
  if (aceito) { doc.setFillColor(230, 248, 235); doc.setTextColor(22, 130, 65); }
  else { doc.setFillColor(255, 245, 220); doc.setTextColor(180, 120, 0); }
  doc.roundedRect(M, y - 4, CW, 8, 2, 2, "F");
  doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text(aceito ? "✓ ENTREGUE E ACEITO" : "⏳ PENDENTE DE ACEITE", W / 2, y + 1, { align: "center" });
  y += 8; doc.setTextColor(...DARK);
  if (data.acceptedAt) {
    doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(`Aceito em: ${fmtDateTime(data.acceptedAt)}`, W / 2, y, { align: "center" });
    y += 5;
  }

  // BLOCO VERDE
  if (aceito && data.acceptedAt) {
    y += 2;
    doc.setFillColor(230, 248, 235);
    doc.roundedRect(M, y, CW, 18, 2, 2, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(22, 130, 65);
    doc.text("✓ Termo assinado digitalmente", M + 4, y + 5);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(22, 100, 55);
    doc.text(`Assinado em: ${fmtDateTime(data.acceptedAt)}`, M + 4, y + 10);
    doc.text(`Método: ${methodLabel(data.signatureMethod)}`, M + 4, y + 15);
    y += 22; doc.setTextColor(...DARK);
  }

  // ASSINATURAS
  if (y > H - 70) { doc.addPage(); y = 20; }
  sectionHeader("Assinaturas");

  const halfW = CW / 2 - 4;
  const rightX = M + halfW + 8;
  const sigBlockY = y;

  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLUE);
  doc.text("COLABORADOR", M, sigBlockY);
  doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK); doc.setFontSize(7.5);
  doc.text(`Nome: ${data.employeeName}`, M, sigBlockY + 5);

  const boxY = sigBlockY + 10;

  if (aceito && data.signatureDataUrl) {
    try { doc.addImage(data.signatureDataUrl, "PNG", M, boxY, halfW, 18); } catch {}
    doc.setDrawColor(180); doc.setLineWidth(0.3);
    doc.line(M, boxY + 18, M + halfW, boxY + 18);
    doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text("Assinatura do colaborador", M, boxY + 22);
  } else if (aceito && data.acceptedAt) {
    doc.setFillColor(230, 248, 235);
    doc.rect(M, boxY, halfW, 18, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(22, 130, 65);
    doc.text("✓ Assinado digitalmente", M + halfW / 2, boxY + 8, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(22, 100, 55);
    doc.text(`Método: ${methodLabel(data.signatureMethod)}`, M + halfW / 2, boxY + 14, { align: "center" });
    doc.setDrawColor(180); doc.setLineWidth(0.3);
    doc.line(M, boxY + 18, M + halfW, boxY + 18);
    doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text("Assinatura do colaborador", M, boxY + 22);
  } else {
    doc.setDrawColor(180); doc.setLineWidth(0.3);
    doc.line(M, boxY + 18, M + halfW, boxY + 18);
    doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text("Assinatura do colaborador", M, boxY + 22);
  }

  if (data.acceptedAt) {
    doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(`Data do aceite: ${fmtDateTime(data.acceptedAt)}`, M, boxY + 27);
  }

  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...BLUE);
  doc.text("RESPONSÁVEL PELA ENTREGA", rightX, sigBlockY);
  doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK); doc.setFontSize(7.5);
  doc.text(`Nome: ${data.deliveredBy}`, rightX, sigBlockY + 5);
  doc.setDrawColor(180); doc.setLineWidth(0.3);
  doc.line(rightX, boxY + 18, rightX + halfW, boxY + 18);
  doc.setFontSize(7); doc.setTextColor(...MUTED);
  doc.text("Assinatura do responsável", rightX, boxY + 22);
  doc.text(`Data: ${fmtDate(data.deliveredAt)}`, rightX, boxY + 27);
  if (data.localEntrega) doc.text(`Local: ${data.localEntrega}`, rightX, boxY + 32);

  y = boxY + 36;

  doc.setDrawColor(30, 60, 120); doc.setLineWidth(0.5);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setFontSize(6.5); doc.setTextColor(...MUTED);
  doc.text("APA Ponto — Termo de Entrega de Equipamento de Proteção Individual", W / 2, H - 8, { align: "center" });

  const safeName = data.employeeName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  doc.save(`Termo_EPI_${safeName}_${data.deliveredAt}.pdf`);
}
