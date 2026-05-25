import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

interface EpiDeliveryReport {
  epiName: string;
  epiCategory: string;
  codigo: string;
  ca: string;
  marca: string;
  tamanho: string;
  quantidade: number;
  estado: string;
  deliveredAt: string;
  expiresAt: string;
  deliveredBy: string;
  notes: string | null;
  status: string;
  acceptedAt: string | null;
  signatureUrl: string | null;
}

interface EmployeeReport {
  name: string;
  cpf: string;
  matricula: string;
  cargo: string;
  departamento: string;
  dataAdmissao: string | null;
}

export interface EpiReportData {
  employee: EmployeeReport;
  deliveries: EpiDeliveryReport[];
  empresa?: string;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d.includes("T") ? d : d + "T00:00:00").toLocaleDateString("pt-BR");
}

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

function maskCpf(cpf: string): string {
  if (!cpf) return "Não informado";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***.${digits.slice(9)}`;
}

const BLUE: [number, number, number] = [30, 60, 120];
const DARK: [number, number, number] = [40, 40, 40];
const MUTED: [number, number, number] = [120, 120, 130];

async function loadSignatureImage(signatureUrl: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from("epi-signatures").createSignedUrl(signatureUrl, 60);
    if (!data?.signedUrl) return null;
    const response = await fetch(data.signedUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    uint8.forEach(b => (binary += String.fromCharCode(b)));
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

export async function generateEpiReport(data: EpiReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const CW = W - M * 2;
  let y = 0;

  const addFooter = (pageNum: number, totalPages: number) => {
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.5);
    doc.line(M, H - 14, W - M, H - 14);
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("APA Ponto — Relatório de EPIs do Colaborador", M, H - 9);
    doc.text(`Página ${pageNum} de ${totalPages}`, W - M, H - 9, { align: "right" });
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, W / 2, H - 9, { align: "center" });
  };

  const checkPageBreak = (needed: number) => {
    if (y + needed > H - 20) {
      doc.addPage();
      y = 16;
    }
  };

  const sectionHeader = (title: string) => {
    checkPageBreak(14);
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

  // ── HEADER ──
  doc.setFillColor(30, 60, 120);
  doc.rect(0, 0, W, 24, "F");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("RELATÓRIO DE EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL", W / 2, 10, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 215, 240);
  doc.text(`Colaborador: ${data.employee.name}`, W / 2, 17, { align: "center" });
  if (data.empresa) {
    doc.text(`Empresa: ${data.empresa}`, W / 2, 22, { align: "center" });
  }
  y = 30;

  // ── EMPLOYEE DATA ──
  sectionHeader("Dados do Colaborador");

  const empFields: [string, string][] = [
    ["Nome completo:", data.employee.name],
    ["CPF:", maskCpf(data.employee.cpf)],
    ["Matrícula:", data.employee.matricula || "—"],
    ["Cargo:", data.employee.cargo || "—"],
    ["Departamento:", data.employee.departamento || "—"],
    ["Data de admissão:", fmtDate(data.employee.dataAdmissao)],
  ];

  // 2 columns
  for (let i = 0; i < empFields.length; i += 2) {
    const left = empFields[i];
    const right = empFields[i + 1];
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(left[0], M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.text(left[1], M + doc.getTextWidth(left[0] + " "), y);

    if (right) {
      const rightX = M + CW / 2;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MUTED);
      doc.text(right[0], rightX, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);
      doc.text(right[1], rightX + doc.getTextWidth(right[0] + " "), y);
    }
    y += 5;
  }

  // ── SUMMARY ──
  y += 2;
  const totalDeliveries = data.deliveries.length;
  const accepted = data.deliveries.filter(d => d.status === "aceito").length;
  const pending = data.deliveries.filter(d => d.status !== "aceito").length;
  const expired = data.deliveries.filter(d => {
    const exp = new Date(d.expiresAt + "T00:00:00");
    return exp.getTime() < Date.now();
  }).length;

  checkPageBreak(16);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(M, y - 2, CW, 14, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text("RESUMO:", M + 4, y + 4);

  const summaryItems = [
    `Total: ${totalDeliveries}`,
    `Aceitos: ${accepted}`,
    `Pendentes: ${pending}`,
    `Vencidos: ${expired}`,
  ];
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  let sx = M + 30;
  summaryItems.forEach((item, i) => {
    if (i === 2 && pending > 0) doc.setTextColor(180, 120, 0);
    else if (i === 3 && expired > 0) doc.setTextColor(200, 50, 50);
    else doc.setTextColor(...DARK);
    doc.text(item, sx, y + 4);
    sx += doc.getTextWidth(item) + 10;
  });
  doc.setTextColor(...DARK);
  y += 16;

  // ── DELIVERIES TABLE ──
  sectionHeader("Histórico de Entregas");

  const tableBody = data.deliveries.map(d => [
    d.epiName,
    d.epiCategory,
    d.ca || "—",
    String(d.quantidade || 1),
    fmtDate(d.deliveredAt),
    fmtDate(d.expiresAt),
    d.status === "aceito" ? "Aceito" : "Pendente",
    d.deliveredBy || "—",
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["EPI", "Categoria", "CA", "Qtd", "Entrega", "Validade", "Status", "Responsável"]],
    body: tableBody,
    styles: { fontSize: 7, cellPadding: 2, textColor: DARK },
    headStyles: {
      fillColor: BLUE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 35 },
      3: { cellWidth: 12, halign: "center" },
      6: { cellWidth: 18 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 6) {
        const val = hookData.cell.raw as string;
        if (val === "Pendente") {
          hookData.cell.styles.textColor = [180, 120, 0];
          hookData.cell.styles.fontStyle = "bold";
        } else if (val === "Aceito") {
          hookData.cell.styles.textColor = [22, 130, 65];
          hookData.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ── INDIVIDUAL DELIVERY DETAILS WITH SIGNATURES ──
  sectionHeader("Detalhes e Assinaturas");

  for (let i = 0; i < data.deliveries.length; i++) {
    const d = data.deliveries[i];
    checkPageBreak(55);

    // Delivery card header
    doc.setFillColor(d.status === "aceito" ? 230 : 255, d.status === "aceito" ? 248 : 245, d.status === "aceito" ? 235 : 220);
    doc.roundedRect(M, y - 2, CW, 8, 1.5, 1.5, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE);
    doc.text(`${i + 1}. ${d.epiName}`, M + 3, y + 3);

    // Status badge
    const statusText = d.status === "aceito" ? "ACEITO" : "PENDENTE";
    const statusW = doc.getTextWidth(statusText) + 6;
    if (d.status === "aceito") {
      doc.setFillColor(22, 130, 65);
    } else {
      doc.setFillColor(180, 120, 0);
    }
    doc.roundedRect(W - M - statusW - 2, y - 1, statusW, 6, 1, 1, "F");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(statusText, W - M - statusW / 2 - 0.5, y + 3, { align: "center" });
    y += 10;

    // Details row
    doc.setFontSize(7.5);
    doc.setTextColor(...DARK);
    const details = [
      `Categoria: ${d.epiCategory}`,
      d.ca ? `CA: ${d.ca}` : "",
      d.marca ? `Marca: ${d.marca}` : "",
      `Qtd: ${d.quantidade || 1}`,
      d.tamanho ? `Tam: ${d.tamanho}` : "",
    ].filter(Boolean).join("  |  ");
    doc.setFont("helvetica", "normal");
    doc.text(details, M + 3, y);
    y += 4;

    doc.setTextColor(...MUTED);
    doc.setFontSize(7);
    doc.text(`Entrega: ${fmtDate(d.deliveredAt)}  |  Validade: ${fmtDate(d.expiresAt)}  |  Resp: ${d.deliveredBy || "—"}`, M + 3, y);
    y += 4;

    if (d.notes) {
      doc.text(`Obs: ${d.notes}`, M + 3, y);
      y += 4;
    }

    // Signature area
    if (d.status === "aceito" && d.signatureUrl) {
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(`Aceito em: ${fmtDateTime(d.acceptedAt)}`, M + 3, y);
      y += 4;

      const sigImg = await loadSignatureImage(d.signatureUrl);
      if (sigImg) {
        checkPageBreak(30);
        doc.setDrawColor(200);
        doc.setLineWidth(0.3);
        doc.rect(M + 3, y, 60, 22);
        doc.addImage(sigImg, "PNG", M + 5, y + 1, 56, 20);
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text("Assinatura digital do colaborador", M + 3, y + 25);
        y += 28;
      } else {
        doc.setFontSize(7);
        doc.text("(Assinatura digital registrada no sistema)", M + 3, y);
        y += 5;
      }
    } else if (d.status !== "aceito") {
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(180, 120, 0);
      doc.text("⏳ Pendente de assinatura pelo colaborador", M + 3, y);
      doc.setFont("helvetica", "normal");
      y += 5;
    }

    // Divider between deliveries
    if (i < data.deliveries.length - 1) {
      y += 2;
      doc.setDrawColor(220);
      doc.setLineWidth(0.2);
      doc.line(M + 10, y, W - M - 10, y);
      y += 4;
    }
  }

  // ── FOOTERS ──
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addFooter(p, totalPages);
  }

  const safeName = data.employee.name.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  doc.save(`Relatorio_EPIs_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
