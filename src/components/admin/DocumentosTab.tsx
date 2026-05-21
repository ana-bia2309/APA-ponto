import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileText, Download, Trash2, Upload, Search, FolderOpen } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

type TipoDocumento = "holerite" | "informe_rendimento" | "contrato" | "advertencia" | "recibo" | "outro";

interface Documento {
  id: string;
  nome: string;
  tipo: TipoDocumento;
  employee_id: string | null;
  url: string;
  tamanho: string;
  criado_em: string;
}

const TIPO_LABELS: Record<TipoDocumento, { label: string; color: string }> = {
  holerite:           { label: "Holerite",           color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  informe_rendimento: { label: "Informe de Rendimentos", color: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  contrato:           { label: "Contrato",           color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  advertencia:        { label: "Advertência",        color: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  recibo:             { label: "Recibo",             color: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  outro:              { label: "Outro",              color: "bg-gray-500/15 text-gray-500 border-gray-500/30" },
};

// Documentos mockados para demonstração
const MOCK_DOCS: Documento[] = [
  { id: "1", nome: "Holerite Maio 2026", tipo: "holerite", employee_id: null, url: "#", tamanho: "245 KB", criado_em: "2026-05-01" },
  { id: "2", nome: "Informe de Rendimentos 2025", tipo: "informe_rendimento", employee_id: null, url: "#", tamanho: "180 KB", criado_em: "2026-02-15" },
  { id: "3", nome: "Contrato de Trabalho", tipo: "contrato", employee_id: null, url: "#", tamanho: "512 KB", criado_em: "2026-03-27" },
];

export default function DocumentosTab({ employees }: { employees: Employee[] }) {
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<TipoDocumento | "todos">("todos");
  const [funcionarioFiltro, setFuncionarioFiltro] = useState("");
  const [docs, setDocs] = useState<Documento[]>(MOCK_DOCS);
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<TipoDocumento>("outro");
  const [novoFuncionario, setNovoFuncionario] = useState("");

  const docsFiltrados = docs.filter((d) => {
    const buscaOk = !busca || d.nome.toLowerCase().includes(busca.toLowerCase());
    const tipoOk = tipoFiltro === "todos" || d.tipo === tipoFiltro;
    const funcOk = !funcionarioFiltro || d.employee_id === funcionarioFiltro;
    return buscaOk && tipoOk && funcOk;
  });

  const excluir = (id: string) => {
    if (!confirm("Excluir este documento?")) return;
    setDocs((prev) => prev.filter((d) => d.id !== id));
    toast.success("Documento excluído.");
  };

  const adicionar = () => {
    if (!novoNome) { toast.error("Informe o nome do documento"); return; }
    const novo: Documento = {
      id: crypto.randomUUID(),
      nome: novoNome,
      tipo: novoTipo,
      employee_id: novoFuncionario || null,
      url: "#",
      tamanho: "—",
      criado_em: new Date().toISOString().slice(0, 10),
    };
    setDocs((prev) => [novo, ...prev]);
    setNovoNome("");
    setNovoTipo("outro");
    setNovoFuncionario("");
    toast.success("Documento adicionado! Upload disponível em breve.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          Centro de Documentos
        </h2>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <FileText className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-600">
          Upload de arquivos será habilitado em breve. Por enquanto você pode cadastrar e organizar os documentos.
        </p>
      </div>

      {/* Novo documento */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Adicionar documento
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label>Nome</Label>
            <Input placeholder="Ex: Holerite Junho 2026" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <select
              value={novoTipo}
              onChange={(e) => setNovoTipo(e.target.value as TipoDocumento)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(TIPO_LABELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Funcionário (opcional)</Label>
            <select
              value={novoFuncionario}
              onChange={(e) => setNovoFuncionario(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos / Geral</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={adicionar} className="w-full gap-2">
              <Upload className="w-4 h-4" /> Adicionar
            </Button>
          </div>
        </div>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documento..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as any)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="todos">Todos os tipos</option>
          {Object.entries(TIPO_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <select
          value={funcionarioFiltro}
          onChange={(e) => setFuncionarioFiltro(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todos funcionários</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {/* Lista de documentos */}
      <div className="space-y-2">
        {docsFiltrados.length === 0 ? (
          <Card className="p-8 text-center">
            <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
          </Card>
        ) : (
          docsFiltrados.map((doc) => {
            const tipo = TIPO_LABELS[doc.tipo];
            const emp = employees.find((e) => e.id === doc.employee_id);
            return (
              <Card key={doc.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm flex items-center gap-2">
                      {doc.nome}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${tipo.color}`}>
                        {tipo.label}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {emp ? emp.name : "Geral"} · {new Date(doc.criado_em + "T00:00:00").toLocaleDateString("pt-BR")} · {doc.tamanho}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => toast.info("Download disponível em breve.")}>
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => excluir(doc.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}