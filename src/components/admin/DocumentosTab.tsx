import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileText, Download, Trash2, Upload, Search, FolderOpen, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

type TipoDocumento = "holerite" | "informe_rendimento" | "contrato" | "advertencia" | "recibo" | "outro";

interface Documento {
  id: string;
  name: string;
  type: TipoDocumento;
  employee_id: string | null;
  file_url: string | null;
  file_size: number | null;
  created_at: string;
}

const TIPO_LABELS: Record<TipoDocumento, { label: string; color: string }> = {
  holerite:           { label: "Holerite",              color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  informe_rendimento: { label: "Informe de Rendimentos", color: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  contrato:           { label: "Contrato",              color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  advertencia:        { label: "Advertência",           color: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  recibo:             { label: "Recibo",                color: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  outro:              { label: "Outro",                 color: "bg-gray-500/15 text-gray-500 border-gray-500/30" },
};

export default function DocumentosTab({ employees }: { employees: Employee[] }) {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<TipoDocumento | "todos">("todos");
  const [funcionarioFiltro, setFuncionarioFiltro] = useState("");

  // Upload form
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<TipoDocumento>("outro");
  const [novoFuncionario, setNovoFuncionario] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("employee_documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setDocs(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const docsFiltrados = docs.filter((d) => {
    const buscaOk = !busca || d.name.toLowerCase().includes(busca.toLowerCase());
    const tipoOk = tipoFiltro === "todos" || d.type === tipoFiltro;
    const funcOk = !funcionarioFiltro || d.employee_id === funcionarioFiltro;
    return buscaOk && tipoOk && funcOk;
  });

  const adicionar = async () => {
    if (!novoNome.trim()) { toast.error("Informe o nome do documento"); return; }
    if (!selectedFile) { toast.error("Selecione um arquivo"); return; }
    if (!novoFuncionario) { toast.error("Selecione um funcionário"); return; }

    setUploading(true);
    try {
      // Upload do arquivo
      const ext = selectedFile.name.split(".").pop();
      const fileName = `${novoFuncionario}/${Date.now()}_${novoNome.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("employee-documents")
        .upload(fileName, selectedFile, { contentType: selectedFile.type });
      if (uploadError) throw uploadError;

      // Salva no banco
      const { error: dbError } = await (supabase as any)
        .from("employee_documents")
        .insert({
          name: novoNome.trim(),
          type: novoTipo,
          employee_id: novoFuncionario || null,
          file_url: fileName,
          file_size: selectedFile.size,
        });
      if (dbError) throw dbError;

      toast.success("Documento enviado com sucesso!");
      setNovoNome(""); setNovoTipo("outro"); setNovoFuncionario("");
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const download = async (doc: Documento) => {
    if (!doc.file_url) { toast.info("Arquivo não disponível"); return; }
    try {
      const { data } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(doc.file_url, 60);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch {
      toast.error("Erro ao baixar arquivo");
    }
  };

  const excluir = async (doc: Documento) => {
    if (!confirm("Excluir este documento?")) return;
    try {
      if (doc.file_url) {
        await supabase.storage.from("employee-documents").remove([doc.file_url]);
      }
      await (supabase as any).from("employee_documents").delete().eq("id", doc.id);
      toast.success("Documento excluído!");
      load();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  const fmtSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          Centro de Documentos
        </h2>
      </div>

      {/* Upload */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Enviar documento
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label>Nome</Label>
            <Input placeholder="Ex: Holerite Junho 2026" value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as TipoDocumento)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {Object.entries(TIPO_LABELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Funcionário</Label>
            <select value={novoFuncionario} onChange={(e) => setNovoFuncionario(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Selecione...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Arquivo</Label>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm file:border-0 file:bg-transparent file:text-sm" />
          </div>
        </div>
        {selectedFile && (
          <p className="text-xs text-muted-foreground">
            Arquivo selecionado: {selectedFile.name} ({fmtSize(selectedFile.size)})
          </p>
        )}
        <Button onClick={adicionar} disabled={uploading} className="gap-2">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Enviando..." : "Enviar documento"}
        </Button>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar documento..." value={busca}
            onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </div>
        <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as any)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="todos">Todos os tipos</option>
          {Object.entries(TIPO_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <select value={funcionarioFiltro} onChange={(e) => setFuncionarioFiltro(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todos funcionários</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : docsFiltrados.length === 0 ? (
        <Card className="p-8 text-center">
          <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {docsFiltrados.map((doc) => {
            const tipo = TIPO_LABELS[doc.type as TipoDocumento] || TIPO_LABELS.outro;
            const emp = employees.find((e) => e.id === doc.employee_id);
            return (
              <Card key={doc.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm flex items-center gap-2">
                      {doc.name}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${tipo.color}`}>
                        {tipo.label}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {emp ? emp.name : "Geral"} · {new Date(doc.created_at).toLocaleDateString("pt-BR")} · {fmtSize(doc.file_size)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => download(doc)}>
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => excluir(doc)}
                    className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}