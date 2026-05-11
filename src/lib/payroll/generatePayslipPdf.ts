import jsPDF from "jspdf";

const fmt = (v: any) =>
  "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

export interface PayslipPdfData {
  empresa?: {
    nome: string;
    cnpj?: string;
    endereco?: string;
    logoDataUrl?: string;
  };
  funcionario: {
    nome: string;
    cpf?: string;
    cargo?: string;
    matricula?: string;
    departamento?: string;
    admissao?: string;
  };
  competencia: { mes: number; ano: number };
  itens: Array<{
    code: string;
    description: string;
    reference?: string | null;
    kind: "provento" | "desconto" | "informativo";
    amount: number | string;
  }>;
  totais: {
    proventos: number | string;
    descontos: number | string;
    liquido: number | string;
    base_inss: number | string;
    base_irrf: number | string;
    fgts_mes: number | string;
  };
  banco_horas?: {
    horas_trabalhadas?: number | string;
    horas_extras_50?: number | string;
    horas_extras_100?: number | string;
    horas_noturnas?: number | string;
    faltas_dias?: number | string;
  };
  signatureDataUrl?: string;
}

const EMPRESA_PADRAO = {
  nome: "APA Refrigeração e Climatização",
  cnpj: "—",
  endereco: "Recibo de Pagamento de Salário",
};

export function generatePayslipPdf(data: PayslipPdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 12;
  const empresa = { ...EMPRESA_PADRAO, ...(data.empresa || {}) };
  let y = M;

  // ===== Cabeçalho =====
  doc.setFillColor(15, 23, 42); // navy
  doc.rect(0, 0, W, 28, "F");

  if (empresa.logoDataUrl) {
    try { doc.addImage(empresa.logoDataUrl, "PNG", M, 6, 16, 16); } catch {}
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(empresa.nome, M + (empresa.logoDataUrl ? 20 : 0), 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`CNPJ: ${empresa.cnpj || "—"}`, M + (empresa.logoDataUrl ? 20 : 0), 18);
  doc.text(empresa.endereco || "", M + (empresa.logoDataUrl ? 20 : 0), 22);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  const comp = `${String(data.competencia.mes).padStart(2, "0")}/${data.competencia.ano}`;
  doc.text(`Competência ${comp}`, W - M, 13, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("RECIBO DE PAGAMENTO DE SALÁRIO", W - M, 19, { align: "right" });

  y = 34;
  doc.setTextColor(0, 0, 0);

  // ===== Dados do funcionário =====
  doc.setDrawColor(220);
  doc.setFillColor(245, 247, 250);
  doc.rect(M, y, W - 2 * M, 22, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("FUNCIONÁRIO", M + 2, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Nome: ${data.funcionario.nome}`, M + 2, y + 9);
  doc.text(`CPF: ${data.funcionario.cpf || "—"}`, M + 2, y + 14);
  doc.text(`Cargo: ${data.funcionario.cargo || "—"}`, M + 2, y + 19);
  doc.text(`Matrícula: ${data.funcionario.matricula || "—"}`, W / 2, y + 9);
  doc.text(`Departamento: ${data.funcionario.departamento || "—"}`, W / 2, y + 14);
  doc.text(`Admissão: ${data.funcionario.admissao || "—"}`, W / 2, y + 19);

  y += 26;

  // ===== Tabela de itens =====
  const colX = { code: M + 2, desc: M + 14, ref: M + 95, prov: W - M - 38, desc2: W - M - 4 };
  doc.setFillColor(15, 23, 42);
  doc.rect(M, y, W - 2 * M, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CÓD", colX.code, y + 5);
  doc.text("DESCRIÇÃO", colX.desc, y + 5);
  doc.text("REFERÊNCIA", colX.ref, y + 5);
  doc.text("PROVENTOS", colX.prov, y + 5, { align: "right" });
  doc.text("DESCONTOS", colX.desc2, y + 5, { align: "right" });
  y += 7;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  const itensLinha = data.itens.filter((i) => i.kind !== "informativo");
  itensLinha.forEach((it, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(250, 251, 253);
      doc.rect(M, y, W - 2 * M, 6, "F");
    }
    doc.setFontSize(8);
    doc.text(it.code, colX.code, y + 4);
    doc.text(it.description.slice(0, 50), colX.desc, y + 4);
    doc.text(String(it.reference || ""), colX.ref, y + 4);
    if (it.kind === "provento") {
      doc.setTextColor(20, 110, 60);
      doc.text(fmt(it.amount), colX.prov, y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
    } else {
      doc.setTextColor(160, 30, 40);
      doc.text(fmt(it.amount), colX.desc2, y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }
    y += 6;
    if (y > 230) { doc.addPage(); y = M; }
  });

  // ===== Totais =====
  y += 2;
  doc.setDrawColor(15, 23, 42);
  doc.line(M, y, W - M, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL PROVENTOS", colX.ref, y);
  doc.setTextColor(20, 110, 60);
  doc.text(fmt(data.totais.proventos), colX.prov, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 5;
  doc.text("TOTAL DESCONTOS", colX.ref, y);
  doc.setTextColor(160, 30, 40);
  doc.text(fmt(data.totais.descontos), colX.desc2, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 6;

  // Líquido destacado
  doc.setFillColor(15, 23, 42);
  doc.rect(M, y, W - 2 * M, 11, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text("VALOR LÍQUIDO", M + 4, y + 7);
  doc.setFontSize(14);
  doc.text(fmt(data.totais.liquido), W - M - 4, y + 7.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 15;

  // ===== Bases =====
  doc.setFillColor(245, 247, 250);
  doc.rect(M, y, W - 2 * M, 14, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("BASES DE CÁLCULO E ENCARGOS", M + 2, y + 4);
  doc.setFont("helvetica", "normal");
  const bases = [
    ["Base INSS", fmt(data.totais.base_inss)],
    ["Base IRRF", fmt(data.totais.base_irrf)],
    ["FGTS do Mês (8%)", fmt(data.totais.fgts_mes)],
  ];
  bases.forEach((b, i) => {
    const x = M + 2 + i * ((W - 2 * M) / 3);
    doc.text(b[0], x, y + 9);
    doc.setFont("helvetica", "bold");
    doc.text(b[1], x, y + 13);
    doc.setFont("helvetica", "normal");
  });
  y += 18;

  // ===== Banco de horas =====
  if (data.banco_horas) {
    const bh = data.banco_horas;
    doc.setFillColor(245, 247, 250);
    doc.rect(M, y, W - 2 * M, 14, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("BANCO DE HORAS / JORNADA", M + 2, y + 4);
    doc.setFont("helvetica", "normal");
    const horas = [
      ["Trabalhadas", `${bh.horas_trabalhadas || 0}h`],
      ["Extras 50%", `${bh.horas_extras_50 || 0}h`],
      ["Extras 100%", `${bh.horas_extras_100 || 0}h`],
      ["Noturnas", `${bh.horas_noturnas || 0}h`],
      ["Faltas", `${bh.faltas_dias || 0}d`],
    ];
    horas.forEach((h, i) => {
      const x = M + 2 + i * ((W - 2 * M) / 5);
      doc.text(h[0], x, y + 9);
      doc.setFont("helvetica", "bold");
      doc.text(h[1], x, y + 13);
      doc.setFont("helvetica", "normal");
    });
    y += 18;
  }

  // ===== Assinatura =====
  if (y > 250) { doc.addPage(); y = M; }
  y += 6;
  doc.setDrawColor(180);
  doc.line(M, y + 12, M + 80, y + 12);
  doc.setFontSize(8);
  doc.text("Assinatura do funcionário", M, y + 16);
  if (data.signatureDataUrl) {
    try { doc.addImage(data.signatureDataUrl, "PNG", M, y, 80, 12); } catch {}
  }
  doc.line(W - M - 80, y + 12, W - M, y + 12);
  doc.text("Assinatura da empresa", W - M - 80, y + 16);

  // Rodapé
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")} · APA Ponto`,
    W / 2, 290, { align: "center" },
  );

  return doc;
}

export function downloadPayslipPdf(data: PayslipPdfData) {
  const doc = generatePayslipPdf(data);
  const comp = `${String(data.competencia.mes).padStart(2, "0")}-${data.competencia.ano}`;
  const safeName = data.funcionario.nome.replace(/\s+/g, "_");
  doc.save(`Holerite_${safeName}_${comp}.pdf`);
}

export function printPayslipPdf(data: PayslipPdfData) {
  const doc = generatePayslipPdf(data);
  doc.autoPrint();
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl, "_blank");
}
