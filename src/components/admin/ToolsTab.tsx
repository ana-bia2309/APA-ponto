import { useState, useEffect, useCallback } from "react";
import { generateToolTermo } from "@/lib/generateToolTermo";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wrench, Plus, Trash2, Package, Clock, User, Pencil, X, Check, RotateCcw } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface Tool {
  id: string;
  name: string;
  category: string;
  serial_number: string | null;
  active: boolean;
  created_at: string;
}

interface ToolLoan {
  id: string;
  tool_id: string;
  employee_id: string;
  loaned_at: string;
  returned_at: string | null;
  loaned_by: string;
  notes: string | null;
  status: string;
  tools?: { name: string; category: string };
  employees?: { name: string };
}

type SubTab = "catalog" | "loans" | "history";

const CATEGORIES = ["Elétrica", "Hidráulica", "Medição", "Corte", "Fixação", "Climatização", "Geral"];

export default function ToolsTab({ employees }: { employees: Employee[] }) {
  const [subTab, setSubTab] = useState<SubTab>("catalog");
  const [tools, setTools] = useState<Tool[]>([]);
  const [loans, setLoans] = useState<ToolLoan[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Geral");
  const [newSerial, setNewSerial] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSerial, setEditSerial] = useState("");

  const [loanTool, setLoanTool] = useState("");
  const [loanEmployee, setLoanEmployee] = useState("");
  const [loanDate, setLoanDate] = useState(new Date().toISOString().slice(0, 10));
  const [loanBy, setLoanBy] = useState("");
  const [loanNotes, setLoanNotes] = useState("");

  const fetchTools = useCallback(async () => {
    const { data } = await (supabase as any).from("tools").select("*").order("name");
    if (data) setTools(data);
  }, []);

  const fetchLoans = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("tool_loans")
      .select("*, tools(name, category, serial_number), employees(name, cpf, cargo, departamento, matricula)")
      .order("loaned_at", { ascending: false });
    if (data) setLoans(data);
  }, []);

  useEffect(() => {
    Promise.all([fetchTools(), fetchLoans()]).then(() => setLoading(false));
  }, [fetchTools, fetchLoans]);

  const addTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await (supabase as any).from("tools").insert({
      name: newName.trim(), category: newCategory, serial_number: newSerial.trim() || null,
    });
    if (error) { toast.error("Erro ao cadastrar ferramenta"); return; }
    toast.success("Ferramenta cadastrada!");
    setNewName(""); setNewCategory("Geral"); setNewSerial("");
    fetchTools();
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await (supabase as any).from("tools").update({
      name: editName.trim(), category: editCategory, serial_number: editSerial.trim() || null,
    }).eq("id", editingId);
    toast.success("Atualizado!");
    setEditingId(null);
    fetchTools();
  };

  const deleteTool = async (id: string) => {
    if (!confirm("Excluir esta ferramenta?")) return;
    await (supabase as any).from("tools").delete().eq("id", id);
    toast.success("Excluída!");
    fetchTools();
  };

  const addLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanTool || !loanEmployee || !loanBy.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const { error } = await (supabase as any).from("tool_loans").insert({
      tool_id: loanTool, employee_id: loanEmployee, loaned_at: loanDate,
      loaned_by: loanBy.trim(), notes: loanNotes.trim() || null, status: "emprestada",
    });
    if (error) { toast.error("Erro ao registrar empréstimo"); return; }
    toast.success("Empréstimo registrado!");
    setLoanTool(""); setLoanEmployee(""); setLoanBy(""); setLoanNotes("");
    fetchLoans();
  };

  const returnTool = async (id: string) => {
    await (supabase as any).from("tool_loans").update({
      returned_at: new Date().toISOString().slice(0, 10), status: "devolvida",
    }).eq("id", id);
    toast.success("Devolução registrada!");
    fetchLoans();
  };

  const deleteLoan = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    await (supabase as any).from("tool_loans").delete().eq("id", id);
    toast.success("Excluído!");
    fetchLoans();
  };

  const activeLoans = loans.filter(l => l.status === "emprestada");
  const returnedLoans = loans.filter(l => l.status === "devolvida");

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="h-20 animate-pulse bg-muted" />)}</div>;

  const subTabs = [
    { key: "catalog" as SubTab, label: "Catálogo", icon: Package },
    { key: "loans" as SubTab, label: `Empréstimos${activeLoans.length ? ` (${activeLoans.length})` : ""}`, icon: Wrench },
    { key: "history" as SubTab, label: "Histórico", icon: Clock },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Gestão de Ferramentas</h2>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {subTabs.map(t => (
          <Button key={t.key} variant={subTab === t.key ? "default" : "outline"} size="sm"
            onClick={() => setSubTab(t.key)} className="flex-shrink-0 text-xs">
            <t.icon className="w-3.5 h-3.5 mr-1" /> {t.label}
          </Button>
        ))}
      </div>

      {subTab === "catalog" && (
        <div className="space-y-3">
          <form onSubmit={addTool} className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Nome da ferramenta *" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1" />
              <Button type="submit" size="sm"><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="flex gap-2">
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs flex-1">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input placeholder="Número de série (opcional)" value={newSerial} onChange={e => setNewSerial(e.target.value)} className="h-9 text-xs flex-1" />
            </div>
          </form>

          {tools.map(t => (
            <Card key={t.id} className="p-3">
              {editingId === t.id ? (
                <div className="space-y-2">
                  <Input value={editName} onChange={e => setEditName(e.target.value)} />
                  <div className="flex gap-2">
                    <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs flex-1">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Input placeholder="Nº série" value={editSerial} onChange={e => setEditSerial(e.target.value)} className="h-9 text-xs flex-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit}><Check className="w-4 h-4 mr-1" /> Salvar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.name}</span>
                      <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                      {t.serial_number && <span className="text-[10px] text-muted-foreground">SN: {t.serial_number}</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {loans.filter(l => l.tool_id === t.id && l.status === "emprestada").length > 0
                        ? <span className="text-amber-500">● Emprestada</span>
                        : <span className="text-emerald-500">● Disponível</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingId(t.id); setEditName(t.name); setEditCategory(t.category); setEditSerial(t.serial_number || ""); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteTool(t.id)} className="text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
          {tools.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma ferramenta cadastrada</p>}
        </div>
      )}

      {subTab === "loans" && (
        <div className="space-y-3">
          <form onSubmit={addLoan} className="space-y-2">
            <div className="flex gap-2">
              <select value={loanTool} onChange={e => setLoanTool(e.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Selecione a ferramenta *</option>
                {tools.map(t => <option key={t.id} value={t.id}>{t.name} — {t.category}</option>)}
              </select>
              <select value={loanEmployee} onChange={e => setLoanEmployee(e.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Selecione o colaborador *</option>
                {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)} className="h-9 text-xs w-36" />
              <Input placeholder="Responsável *" value={loanBy} onChange={e => setLoanBy(e.target.value)} className="h-9 text-xs flex-1" />
            </div>
            <Input placeholder="Observações (opcional)" value={loanNotes} onChange={e => setLoanNotes(e.target.value)} className="h-9 text-xs" />
            <Button type="submit" size="sm" className="w-full"><Plus className="w-4 h-4 mr-1" /> Registrar Empréstimo</Button>
          </form>

          <h3 className="text-sm font-medium text-muted-foreground">Empréstimos ativos ({activeLoans.length})</h3>
          {activeLoans.map(l => (
            <Card key={l.id} className="p-3 border-amber-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{l.tools?.name}</span>
                    <Badge className="bg-amber-500 text-white text-[10px]">Emprestada</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <User className="w-3 h-3 inline mr-0.5" />{l.employees?.name} •
                    {new Date(l.loaned_at + "T00:00:00").toLocaleDateString("pt-BR")} •
                    Resp: {l.loaned_by}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => returnTool(l.id)} className="text-emerald-500 text-xs">
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteLoan(l.id)} className="text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {activeLoans.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Nenhuma ferramenta emprestada</p>}
        </div>
      )}

   {subTab === "history" && (
        <div className="space-y-3">
          {loans.map(l => (
            <Card key={l.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{l.tools?.name}</span>
                    <Badge variant={l.status === "emprestada" ? "default" : "secondary"} className="text-[10px]">
                      {l.status === "emprestada" ? "Emprestada" : "Devolvida"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <User className="w-3 h-3 inline mr-0.5" />{l.employees?.name} •
                    Saída: {new Date(l.loaned_at + "T00:00:00").toLocaleDateString("pt-BR")}
                    {l.returned_at && ` • Retorno: ${new Date(l.returned_at + "T00:00:00").toLocaleDateString("pt-BR")}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" title="Baixar Termo"
                    onClick={() => generateToolTermo({
                      employeeName: l.employees?.name || "—",
                      employeeCpf: (l.employees as any)?.cpf || "",
                      cargo: (l.employees as any)?.cargo || "",
                      departamento: (l.employees as any)?.departamento || "",
                      matricula: (l.employees as any)?.matricula || "",
                      toolName: l.tools?.name || "Ferramenta",
                      category: l.tools?.category || "",
                      serialNumber: (l.tools as any)?.serial_number || null,
                      loanedAt: l.loaned_at,
                      loanedBy: l.loaned_by,
                      returnedAt: l.returned_at,
                      notes: l.notes,
                      status: l.status,
                      acceptedAt: null,
                      signatureDataUrl: null,
                    })}>
                    <FileDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteLoan(l.id)} className="text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {loans.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Nenhum empréstimo registrado</p>}
        </div>
      )}
    </div>
  );
}
