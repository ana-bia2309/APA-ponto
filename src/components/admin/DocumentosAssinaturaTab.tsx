import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileSignature, Plus, RefreshCw, CheckCircle2, Circle, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface Documento {
  id: string;
  titulo: string;
  conteudo: string;
  created_at: string;
}

interface Destinatario {
  id: string;
  documento_id: string;
  employee_id: string;
  assinado_em: string | null;
}

export default function DocumentosAssinaturaTab({ employees }: { employees: Employee[] }) {
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [destinatariosPorDoc, setDestinatariosPorDoc] = useState<Record<string, Destinatario[]>>({});
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: docs } = await (supabase as any)
        .from("documentos_assinatura")
        .select("*")
        .order("created_at", { ascending: false });
      setDocumentos(docs || []);

      if (docs && docs.length > 0) {
        const { data: dests } = await (supabase as any)
          .from("documento_destinatarios")
          .select("*")
          .in("documento_id", docs.map((d: any) => d.id));
        const grouped: Record<string, Destinatario[]> = {};
        (dests || []).forEach((d: any) => {
          if (!grouped[d.documento_id]) grouped[d.documento_id] = [];
          grouped[d.documento_id].push(d);
        });
        setDestinatariosPorDoc(grouped);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleFuncionario = (id: string) => {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const selecionarTodos = () => {
    setSelecionados(new Set(employees.filter(e => e.active).map(e => e.id)));
  };

  const criar = async () => {
    if (!titulo.trim() || !conteudo.trim()) { toast.error("Preencha título e conteúdo."); return; }
    if (selecionados.size === 0) { toast.error("Selecione ao menos um funcionário."); return; }
    setSalvando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: doc, error } = await (supabase as any)
        .from("documentos_assinatura")
        .insert({ titulo: titulo.trim(), conteudo: conteudo.trim(), criado_por: user?.email || null })
        .select()
        .single();
      if (error) throw error;

      const rows = Array.from(selecionados).map(employeeId => ({
        documento_id: doc.id,
        employee_id: employeeId,
      }));
      const { error: errorDest } = await (supabase as any).from("documento_destinatarios").insert(rows);
      if (errorDest) throw errorDest;

      toast.success(`Documento enviado para assinatura de ${rows.length} funcionário(s)!`);
      setTitulo(""); setConteudo(""); setSelecionados(new Set());
      load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este documento? Todos os destinatários perderão acesso a ele.")) return;
    await (supabase as any).from("documentos_assinatura").delete().eq("id", id);
    toast.success("Documento excluído.");
    load();
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FileSignature className="w-4 h-4" /> Novo Documento para Assinatura
        </h3>
        <div>
          <Label>Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Política de Confidencialidade" className="mt-1" />
        </div>
        <div>
          <Label>Conteúdo do documento</Label>
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Digite aqui o texto completo do termo/política/comunicado..."
            className="mt-1 w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Quem precisa assinar</Label>
            <Button size="sm" variant="outline" onClick={selecionarTodos}>Selecionar todos ativos</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
            {employees.filter(e => e.active).map(emp => (
              <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selecionados.has(emp.id)} onChange={() => toggleFuncionario(emp.id)} />
                {emp.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{selecionados.size} selecionado(s)</p>
        </div>
        <Button onClick={criar} disabled={salvando} className="gap-2">
          {salvando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Enviar para Assinatura
        </Button>
      </Card>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Documentos Enviados
        </h3>
        {loading ? (
          <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : documentos.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum documento enviado ainda.</Card>
        ) : (
          <div className="space-y-3">
            {documentos.map((doc) => {
              const dests = destinatariosPorDoc[doc.id] || [];
              const assinados = dests.filter(d => d.assinado_em).length;
              const pendentes = dests.filter(d => !d.assinado_em);
              return (
                <Card key={doc.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold">{doc.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        Enviado em {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandidoId(expandidoId === doc.id ? null : doc.id)}
                        className="text-xs font-semibold px-2 py-1 rounded-full"
                        style={{
                          background: assinados === dests.length ? "#d1fae5" : "#fef3c7",
                          color: assinados === dests.length ? "#065f46" : "#92400e",
                        }}
                      >
                        ✓ {assinados}/{dests.length} assinaram
                      </button>
                      <Button size="sm" variant="ghost" onClick={() => excluir(doc.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {expandidoId === doc.id && (
                    <div className="mt-3 space-y-2">
                      <div className="p-3 rounded-lg bg-muted/30 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {doc.conteudo}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {dests.map((d) => {
                          const emp = employees.find(e => e.id === d.employee_id);
                          return (
                            <span key={d.id} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-muted/50">
                              {d.assinado_em ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Circle className="w-3 h-3 text-muted-foreground" />}
                              {emp?.name || "—"}
                            </span>
                          );
                        })}
                      </div>
                      {pendentes.length > 0 && (
                        <p className="text-xs text-amber-600">
                          Ainda não assinaram: {pendentes.map(p => employees.find(e => e.id === p.employee_id)?.name).filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}