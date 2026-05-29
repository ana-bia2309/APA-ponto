import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FileText, Download, Trash2, Upload, Search, FolderOpen,
  Loader2, AlertTriangle, CheckCircle2, Clock, Eye, RefreshCw,
  Users, X
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface Documento {
  id: string;
  name: string;
  type: string;
  categoria: string;
  employee_id: string | null;
  file_url: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string | null;
  uploaded_by: string | null;
  data_validade: string | null;
  status: string;
  versao: number;
  observacoes: string | null;
}

const CATEGORIAS: Record<string, { label: string; color: string; icon: string }> = {
  rg:                  { label: "RG", color: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: "🪪" },
  cpf:                 { label: "CPF", color: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: "📄" },
  ctps:                { label: "Carteira de Trabalho", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: "📋" },
  titulo_eleitor:      { label: "Título de Eleitor", color: "bg-purple-500/15 text-purple-600 border-purple-500/30", icon: "🗳️" },
  reservista:          { label: "Certificado de Reservista", color: "bg-gray-500/15 text-gray-600 border-gray-500/30", icon: "🎖️" },
  cnh:                 { label: "CNH", color: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: "🚗" },
  comprovante_residencia: { label: "Comprovante de Residência", color: "bg-teal-500/15 text-teal-600 border-teal-500/30", icon: "🏠" },
  certidao:            { label: "Certidão", color: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30", icon: "📜" },
  contrato:            { label: "Contrato de Trabalho", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: "✍️" },
  exame_admissional:   { label: "Exame Admissional", color: "bg-rose-500/15 text-rose-600 border-rose-500/30", icon: "🏥" },
  exame_periodico:     { label: "Exame Periódico", color: "bg-rose-500/15 text-rose-600 border-rose-500/30", icon: "🩺" },
  holerite:            { label: "Holerite", color: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: "💰" },
  advertencia:         { label: "Advertência", color: "bg-orange-500/15 text-orange-600 border-orange-500/30", icon: "⚠️" },
  outro:               { label: "Outro", color: "bg-gray-500/15 text-gray-600 border-gray-500/30", icon: "📁" },
};

const DOCS_OBRIGATORIOS = ["rg", "cpf", "ctps", "comprovante_residencia", "exame_admissional", "contrato"];

function getStatusValidade(dataValidade: string | null): { label: string; color: string; icon: string } | null {
  if (!dataValidade) return null;
  const hoje = new Date();
  const validade = new Date(dataValidade + "T12:00:00");
  const diffDias = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return { label: "Vencido", color: "text-rose-600 bg-rose-500/10", icon: "❌" };
  if (diffDias <= 30) return { label: `Vence em ${diffDias}d`, color: "text-amber-600 bg-amber-500/10", icon: "⚠️" };
  return { label: "Válido", color: "text-emerald-600 bg-emerald-500/10", icon: "✅" };
}

function fmtSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosTab({ employees }: { employees: Employee[] }) {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todos");
  const [funcionarioFiltro, setFuncionarioFiltro] = useState("");
  const [viewMode, setViewMode] = useState<"lista" | "checklist" | "painel">("lista");

  // Upload form
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("outro");
  const [novoFuncionario, setNovoFuncionario] = useState("");
  const [novaValidade, setNovaValidade] = useState("");
  const [novasObs, setNovasObs] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("employee_documents").select("*").order("created_at", { ascending: false });
    if (!error && data) setDocs(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const docsFiltrados = docs.filter(d => {
    const buscaOk = !busca || d.name.toLowerCase().includes(busca.toLowerCase());
    const catOk = categoriaFiltro === "todos" || d.categoria === categoriaFiltro || d.type === categoriaFiltro;
    const funcOk = !funcionarioFiltro || d.employee_id === funcionarioFiltro;
    return buscaOk && catOk && funcOk;
  });

  const adicionar = async () => {
    if (!novoNome.trim()) { toast.error("Informe o nome do documento"); return; }
    if (!selectedFile) { toast.error("Selecione um arquivo"); return; }
    if (!novoFuncionario) { toast.error("Selecione um funcionário"); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = selectedFile.name.split(".").pop();
      const fileName = `${novoFuncionario}/${Date.now()}_${novoNome.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("employee-documents").upload(fileName, selectedFile, { contentType: selectedFile.type });
      if (uploadError) throw uploadError;
      const { error: dbError } = await (supabase as any).from("employee_documents").insert({
        name: novoNome.trim(),
        type: novaCategoria,
        categoria: novaCategoria,
        employee_id: novoFuncionario,
        file_url: fileName,
        file_size: selectedFile.size,
        uploaded_by: user?.email || "admin",
        data_validade: novaValidade || null,
        observacoes: novasObs || null,
        status: "enviado",
        versao: 1,
      });
      if (dbError) throw dbError;
      toast.success("Documento enviado!");
      setNovoNome(""); setNovaCategoria("outro"); setNovoFuncionario("");
      setNovaValidade(""); setNovasObs(""); setSelectedFile(null); setShowForm(false);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally { setUploading(false); }
  };

  const download = async (doc: Documento) => {
    if (!doc.file_url) { toast.info("Arquivo não disponível"); return; }
    try {
      const { data } = await supabase.storage.from("employee-documents").createSignedUrl(doc.file_url, 60);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch { toast.error("Erro ao baixar"); }
  };

  const excluir = async (doc: Documento) => {
    if (!confirm("Excluir este documento?")) return;
    try {
      if (doc.file_url) await supabase.storage.from("employee-documents").remove([doc.file_url]);
      await (supabase as any).from("employee_documents").delete().eq("id", doc.id);
      toast.success("Documento excluído!"); load();
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  // Painel de status
  const docsVencidos = docs.filter(d => d.data_validade && new Date(d.data_validade) < new Date());
  const docsVencendoBreve = docs.filter(d => {
    if (!d.data_validade) return false;
    const diff = Math.ceil((new Date(d.data_validade).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 30;
  });

  // Checklist por funcionário
  const checklistEmp = funcionarioFiltro ? employees.find(e => e.id === funcionarioFiltro) : null;
  const docsDoFuncionario = docs.filter(d => d.employee_id === funcionarioFiltro);
  const catsFuncionario = new Set(docsDoFuncionario.map(d => d.categoria || d.type));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          Gestão de Documentos
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1">
            <Upload className="w-4 h-4" /> Enviar documento
          </Button>
        </div>
      </div>

      {/* Painel rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{docs.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total de documentos</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-rose-500">{docsVencidos.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Vencidos</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-amber-500">{docsVencendoBreve.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Vencem em 30 dias</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-emerald-500">{employees.filter(e => e.active).length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Funcionários ativos</p>
        </Card>
      </div>

      {/* Alertas de validade */}
      {docsVencidos.length > 0 && (
        <Card className="p-3 border-rose-500/30 bg-rose-500/5">
          <p className="text-sm font-semibold text-rose-600 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {docsVencidos.length} documento(s) vencido(s)
          </p>
          <div className="space-y-1">
            {docsVencidos.slice(0, 3).map(d => (
              <p key={d.id} className="text-xs text-rose-600">
                • {d.name} — {employees.find(e => e.id === d.employee_id)?.name || "Geral"} — venceu em {new Date(d.data_validade! + "T12:00:00").toLocaleDateString("pt-BR")}
              </p>
            ))}
            {docsVencidos.length > 3 && <p className="text-xs text-rose-500">...e mais {docsVencidos.length - 3}</p>}
          </div>
        </Card>
      )}
      {docsVencendoBreve.length > 0 && (
        <Card className="p-3 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" /> {docsVencendoBreve.length} documento(s) vencendo em 30 dias
          </p>
          <div className="space-y-1">
            {docsVencendoBreve.slice(0, 3).map(d => {
              const diff = Math.ceil((new Date(d.data_validade!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              return (
                <p key={d.id} className="text-xs text-amber-600">
                  • {d.name} — {employees.find(e => e.id === d.employee_id)?.name || "Geral"} — vence em {diff} dia(s)
                </p>
              );
            })}
          </div>
        </Card>
      )}

      {/* Formulário de upload */}
      {showForm && (
        <Card className="p-4 space-y-3 border-primary/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Enviar novo documento</h3>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <Label>Nome do documento *</Label>
              <Input className="mt-1" placeholder="Ex: RG - João Silva" value={novoNome}
                onChange={e => setNovoNome(e.target.value)} />
            </div>
            <div>
              <Label>Categoria *</Label>
              <select value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(CATEGORIAS).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Funcionário *</Label>
              <select value={novoFuncionario} onChange={e => setNovoFuncionario(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Selecione...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Data de validade</Label>
              <Input className="mt-1" type="date" value={novaValidade} onChange={e => setNovaValidade(e.target.value)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input className="mt-1" placeholder="Opcional" value={novasObs} onChange={e => setNovasObs(e.target.value)} />
            </div>
            <div>
              <Label>Arquivo (PDF, JPG, PNG, DOCX)</Label>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm file:border-0 file:bg-transparent file:text-sm" />
            </div>
          </div>
          {selectedFile && (
            <p className="text-xs text-muted-foreground">📎 {selectedFile.name} ({fmtSize(selectedFile.size)})</p>
          )}
          <Button onClick={adicionar} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Enviando..." : "Enviar documento"}
          </Button>
        </Card>
      )}

      {/* View mode tabs */}
      <div className="flex gap-2">
        <Button variant={viewMode === "lista" ? "default" : "outline"} size="sm" onClick={() => setViewMode("lista")}>
          <FileText className="w-4 h-4 mr-1" /> Lista
        </Button>
        <Button variant={viewMode === "checklist" ? "default" : "outline"} size="sm" onClick={() => setViewMode("checklist")}>
          <CheckCircle2 className="w-4 h-4 mr-1" /> Checklist
        </Button>
        <Button variant={viewMode === "painel" ? "default" : "outline"} size="sm" onClick={() => setViewMode("painel")}>
          <Users className="w-4 h-4 mr-1" /> Painel RH
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar documento..." value={busca}
            onChange={e => setBusca(e.target.value)} className="pl-9" />
        </div>
        <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="todos">Todas as categorias</option>
          {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={funcionarioFiltro} onChange={e => setFuncionarioFiltro(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Todos os funcionários</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : (
        <>
          {/* LISTA */}
          {viewMode === "lista" && (
            docsFiltrados.length === 0 ? (
              <Card className="p-8 text-center">
                <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {docsFiltrados.map(doc => {
                  const cat = CATEGORIAS[doc.categoria || doc.type] || CATEGORIAS.outro;
                  const emp = employees.find(e => e.id === doc.employee_id);
                  const validade = getStatusValidade(doc.data_validade);
                  return (
                    <Card key={doc.id} className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="text-2xl flex-shrink-0">{cat.icon}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm text-foreground">{doc.name}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cat.color}`}>
                                {cat.label}
                              </span>
                              {validade && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${validade.color}`}>
                                  {validade.icon} {validade.label}
                                </span>
                              )}
                              {doc.versao > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  v{doc.versao}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {emp?.name || "Geral"} · {new Date(doc.created_at).toLocaleDateString("pt-BR")} · {fmtSize(doc.file_size)}
                              {doc.uploaded_by && ` · por ${doc.uploaded_by}`}
                            </p>
                            {doc.observacoes && <p className="text-xs text-muted-foreground italic">{doc.observacoes}</p>}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => download(doc)} title="Visualizar/Baixar">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => download(doc)} title="Download">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => excluir(doc)}
                            className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          )}

          {/* CHECKLIST */}
          {viewMode === "checklist" && (
            <div className="space-y-3">
              {!funcionarioFiltro ? (
                <Card className="p-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Selecione um funcionário para ver o checklist de documentos obrigatórios.</p>
                </Card>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    Checklist de admissão — {checklistEmp?.name}
                  </p>
                  <div className="space-y-2">
                    {DOCS_OBRIGATORIOS.map(cat => {
                      const enviado = catsFuncionario.has(cat);
                      const catInfo = CATEGORIAS[cat];
                      return (
                        <Card key={cat} className={`p-3 flex items-center justify-between ${enviado ? "border-emerald-500/30" : "border-rose-500/30"}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{catInfo.icon}</span>
                            <div>
                              <p className="text-sm font-medium text-foreground">{catInfo.label}</p>
                              <p className="text-xs text-muted-foreground">{enviado ? "Documento enviado" : "Pendente"}</p>
                            </div>
                          </div>
                          {enviado
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            : <AlertTriangle className="w-5 h-5 text-rose-500" />}
                        </Card>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {DOCS_OBRIGATORIOS.filter(c => catsFuncionario.has(c)).length}/{DOCS_OBRIGATORIOS.length} documentos obrigatórios enviados
                  </p>
                </>
              )}
            </div>
          )}

          {/* PAINEL RH */}
          {viewMode === "painel" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documentação por funcionário</p>
              {employees.filter(e => e.active).map(emp => {
                const empDocs = docs.filter(d => d.employee_id === emp.id);
                const cats = new Set(empDocs.map(d => d.categoria || d.type));
                const obrigOk = DOCS_OBRIGATORIOS.filter(c => cats.has(c)).length;
                const total = DOCS_OBRIGATORIOS.length;
                const pct = Math.round((obrigOk / total) * 100);
                const vencidos = empDocs.filter(d => d.data_validade && new Date(d.data_validade) < new Date()).length;
                return (
                  <Card key={emp.id} className="p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-sm font-semibold text-foreground">{emp.name}</p>
                      <div className="flex items-center gap-2">
                        {vencidos > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 font-medium">
                            ❌ {vencidos} vencido(s)
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pct === 100 ? "bg-emerald-500/10 text-emerald-600" : pct >= 50 ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600"}`}>
                          {obrigOk}/{total} obrigatórios
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-500"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{empDocs.length} documento(s) enviado(s)</p>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}