import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, ArrowLeft, FolderOpen } from "lucide-react";

type TipoDocumento = "holerite" | "informe_rendimento" | "contrato" | "advertencia" | "recibo" | "outro";

interface Documento {
  id: string;
  nome: string;
  tipo: TipoDocumento;
  tamanho: string;
  criado_em: string;
}

const TIPO_LABELS: Record<TipoDocumento, { label: string; color: string }> = {
  holerite:           { label: "Holerite",              color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  informe_rendimento: { label: "Informe de Rendimentos", color: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  contrato:           { label: "Contrato",              color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  advertencia:        { label: "Advertência",           color: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  recibo:             { label: "Recibo",                color: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  outro:              { label: "Outro",                 color: "bg-gray-500/15 text-gray-500 border-gray-500/30" },
};

// Mock — será substituído por dados reais do Supabase no dia 01
const MOCK_DOCS: Documento[] = [
  { id: "1", nome: "Holerite Maio 2026", tipo: "holerite", tamanho: "245 KB", criado_em: "2026-05-01" },
  { id: "2", nome: "Informe de Rendimentos 2025", tipo: "informe_rendimento", tamanho: "180 KB", criado_em: "2026-02-15" },
  { id: "3", nome: "Contrato de Trabalho", tipo: "contrato", tamanho: "512 KB", criado_em: "2026-03-27" },
];

interface Props {
  employeeName: string;
  onClose: () => void;
}

export default function MeusDocumentos({ employeeName, onClose }: Props) {
  const [docs] = useState<Documento[]>(MOCK_DOCS);

  return (
    <div
      className="min-h-screen flex flex-col px-4 py-8 relative"
      style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: "hsl(210 20% 60%)" }}
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>
          Meus Documentos
        </h2>
        <div className="w-16" />
      </div>

      <p className="text-sm mb-6" style={{ color: "hsl(210 20% 55%)" }}>
        {employeeName}
      </p>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <FolderOpen className="w-12 h-12" style={{ color: "hsl(210 15% 40%)" }} />
          <p className="text-sm" style={{ color: "hsl(210 15% 50%)" }}>
            Nenhum documento disponível.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-w-md mx-auto w-full">
          {docs.map((doc) => {
            const tipo = TIPO_LABELS[doc.tipo];
            return (
              <div
                key={doc.id}
                className="p-4 rounded-2xl border border-white/10 flex items-center justify-between"
                style={{ background: "linear-gradient(180deg, hsl(210 30% 14%) 0%, hsl(215 25% 11%) 100%)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "hsl(210 30% 20%)" }}
                  >
                    <FileText className="w-5 h-5" style={{ color: "hsl(200 70% 65%)" }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "hsl(0 0% 90%)" }}>
                      {doc.nome}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${tipo.color}`}>
                        {tipo.label}
                      </span>
                      <span className="text-[11px]" style={{ color: "hsl(210 15% 50%)" }}>
                        {new Date(doc.criado_em + "T00:00:00").toLocaleDateString("pt-BR")} · {doc.tamanho}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => alert("Download disponível em breve.")}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ color: "hsl(200 70% 65%)" }}
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}