import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface EpiTermoData {
  // Company
  empresa: string;
  setor: string;
  localEntrega: string;
  // Employee
  employeeName: string;
  employeeCpf: string;
  cargo: string;
  departamento: string;
  matricula: string;
  // EPI
  epiName: string;
  epiCategory: string;
  codigo: string;
  ca: string;
  marca: string;
  tamanho: string;
  quantidade: number;
  estado: string;
  finalidade: string;
  // Delivery
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
  let y = 20;

  const addLine = (thickness = 0.3) => {
    doc.setDrawColor(180);
    doc.setLineWidth(thickness);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  };

  const addSection = (icon: string, title: string) => {
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 60, 120);
    doc.text(`${icon} ${title}`, margin, y);
    y += 2;
    addLine(0.5);
    doc.setTextColor(40, 40, 40);
  };

  const addField = (label: string, value: string) => {
    if (!value && value !== "0") return;
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

  // === EMPRESA ===
  if (data.empresa || data.setor || data.localEntrega) {
    addSection("", "IDENTIFICAÇÃO DA EMPRESA");
    addField("Empresa / Órgão", data.empresa);
    addField("Setor", data.setor);
    addField("Local", data.localEntrega);
  }

  // === COLABORADOR ===
  addSection("", "DADOS DO COLABORADOR");
  addField("Nome completo", data.employeeName);
  addField("CPF", data.employeeCpf || "Não informado");
  addField("Matrícula", data.matricula);
  addField("Cargo", data.cargo);
  addField("Departamento", data.departamento);

  // === EPI ===
  addSection("", "DADOS DO EPI");
  addField("Nome do EPI", data.epiName);
  addField("Código / Referência", data.codigo);
  addField("CA (Certificado de Aprovação)", data.ca);
  addField("Marca / Fabricante", data.marca);
  addField("Categoria", data.epiCategory);
  addField("Tamanho", data.tamanho);
  addField("Quantidade", String(data.quantidade || 1));
  addField("Data de entrega", formatDateBR(data.deliveredAt));
  addField("Validade", formatDateBR(data.expiresAt));
  addField("Estado no ato da entrega", data.estado || "Novo");

  // === FINALIDADE ===
  if (data.finalidade) {
    addSection("", "FINALIDADE DE USO");
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.finalidade, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5;
  }

  // === STATUS ===
  addSection("", "STATUS DA ENTREGA");
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

  // === TERMO ===
  addSection("", "TERMO DE RESPONSABILIDADE");
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const termoText = [
    "Declaro que recebi o(s) Equipamento(s) de Proteção Individual (EPI) acima descrito(s),",
    "em perfeitas condições de uso, estando ciente das orientações quanto ao uso correto,",
    "guarda, conservação, higienização e substituição.",
    "",
    "Comprometo-me a:",
    "  - Utilizar o EPI de forma adequada e contínua",
    "  - Zelar pela conservação do equipamento",
    "  - Comunicar imediatamente qualquer dano, perda ou necessidade de substituição",
    "  - Devolver o EPI quando solicitado, em caso de desligamento ou substituição",
    "",
    "Declaro estar ciente de que o não uso adequado poderá acarretar medidas",
    "administrativas conforme normas internas.",
  ];
  termoText.forEach(line => {
    doc.text(line, margin, y);
    y += 4;
  });

  // === OBSERVAÇÕES ===
  if (data.notes) {
    y += 2;
    addSection("", "OBSERVAÇÕES");
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(data.notes, pageW - margin * 2);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 5;
  }

  // === ASSINATURA ===
  y += 4;
  addSection("", "ASSINATURAS");

  // Colaborador
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Colaborador:", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Nome: ${data.employeeName}`, margin, y);
  y += 5;

  if (data.signatureUrl && data.status === "aceito") {
    doc.text("Assinatura digital:", margin, y);
    y += 3;
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
          doc.setDrawColor(180);
          doc.setLineWidth(0.3);
          doc.rect(margin, y, 80, 30);
          doc.addImage(imgData, "PNG", margin + 2, y + 2, 76, 26);
          y += 33;
        }
      }
    } catch {
      doc.text("(Assinatura registrada digitalmente)", margin, y);
      y += 5;
    }
  } else {
    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    const contentW = pageW - margin * 2;
    doc.rect(margin, y, contentW, 25);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text("Assinatura do colaborador", margin + 2, y + 23);
    doc.setTextColor(40, 40, 40);
    y += 28;
  }

  if (data.acceptedAt) {
    doc.setFontSize(8);
    doc.text(`Data: ${formatDateTimeBR(data.acceptedAt)}`, margin, y);
    y += 6;
  }

  // Responsável
  y += 4;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Responsável pela entrega:", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Nome: ${data.deliveredBy}`, margin, y);
  y += 5;
  doc.setDrawColor(100);
  doc.setLineWidth(0.2);
  doc.line(margin, y, margin + 80, y);
  y += 4;
  doc.text("Assinatura", margin, y);
  y += 6;

  if (data.localEntrega) {
    doc.text(`Local: ${data.localEntrega}`, margin, y);
    y += 5;
  }
  doc.text(`Data: ${formatDateBR(data.deliveredAt)}`, margin, y);

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text("APA Ponto — Termo de Entrega de EPI", pageW / 2, footerY, { align: "center" });

  const safeName = data.employeeName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  doc.save(`Termo_EPI_${safeName}_${data.deliveredAt}.pdf`);
}
