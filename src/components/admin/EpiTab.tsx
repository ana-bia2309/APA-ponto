import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  HardHat, Plus, Trash2, Package, AlertTriangle, CheckCircle,
  Clock, User, ChevronDown, ChevronUp, Pencil, X, Check, FileDown, Eye,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateEpiTermo } from "@/lib/generateEpiTermo";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface Epi {
  id: string;
  name: string;
  category: string;
  validity_days: number;
  mandatory: boolean;
  active: boolean;
  created_at: string;
  codigo: string;
  ca: string;
  marca: string;
}

interface EpiDelivery {
  id: string;
  epi_id: string;
  employee_id: string;
  delivered_at: string;
  expires_at: string;
  delivered_by: string;
  notes: string | null;
  created_at: string;
  status: string;
  signature_url: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  tamanho: string;
  quantidade: number;
  estado: string;
  finalidade: string;
  empresa: string;
  setor: string;
  local_entrega: string;
  epis?: { name: string; category: string; ca: string; marca: string; codigo: string };
  employees?: { name: string; cpf: string; cargo: string; departamento: string; matricula: string };
}

type SubTab = "catalog" | "deliveries" | "alerts" | "history";

const CATEGORIES = ["Cabeça", "Olhos/Face", "Respiratório", "Mãos", "Pés", "Corpo", "Quedas", "Geral"];

function daysUntilExpiry(expiresAt: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt + "T00:00:00");
  return Math.ceil((exp.getTime() - now.getTime()) / 86400000);
}

function expiryBadge(expiresAt: string) {
  const days = daysUntilExpiry(expiresAt);
  if (days < 0) return <Badge variant="destructive">Vencido ({Math.abs(days)}d)</Badge>;
  if (days <= 30) return <Badge className="bg-amber-500 text-white">Vence em {days}d</Badge>;
  return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">OK ({days}d)</Badge>;
}

export default function EpiTab({ employees }: { employees: Employee[] }) {
  const [subTab, setSubTab] = useState<SubTab>("catalog");
  const [epis, setEpis] = useState<Epi[]>([]);
  const [deliveries, setDeliveries] = useState<EpiDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [signatureModal, setSignatureModal] = useState<{ url: string; name: string; date: string } | null>(null);
  const [signatureImgUrl, setSignatureImgUrl] = useState<string | null>(null);

  // Catalog form
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Geral");
  const [newValidity, setNewValidity] = useState("365");
  const [newMandatory, setNewMandatory] = useState(false);
  const [newCodigo, setNewCodigo] = useState("");
  const [newCa, setNewCa] = useState("");
  const [newMarca, setNewMarca] = useState("");
  const [editCodigo, setEditCodigo] = useState("");
  const [editCa, setEditCa] = useState("");
  const [editMarca, setEditMarca] = useState("");
  const [editingEpi, setEditingEpi] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editValidity, setEditValidity] = useState("");
  const [editMandatory, setEditMandatory] = useState(false);

  // Delivery form
  const [deliveryEpi, setDeliveryEpi] = useState("");
  const [deliveryEmployee, setDeliveryEmployee] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryBy, setDeliveryBy] = useState("");
  const [deliveryTamanho, setDeliveryTamanho] = useState("");
  const [deliveryQuantidade, setDeliveryQuantidade] = useState("1");
  const [deliveryEstado, setDeliveryEstado] = useState("Novo");
  const [deliveryFinalidade, setDeliveryFinalidade] = useState("");
  const [deliveryEmpresa, setDeliveryEmpresa] = useState("");
  const [deliverySetor, setDeliverySetor] = useState("");
  const [deliveryLocal, setDeliveryLocal] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  // History
  const [historyEmployee, setHistoryEmployee] = useState("");
  const [expandedEpi, setExpandedEpi] = useState<string | null>(null);

  const fetchEpis = useCallback(async () => {
    const { data } = await supabase.from("epis").select("*").order("name");
    if (data) setEpis(data as any);
  }, []);

  const fetchDeliveries = useCallback(async () => {
    const { data } = await supabase
      .from("epi_deliveries")
      .select("*, epis(name, category, ca, marca, codigo), employees(name, cpf, cargo, departamento, matricula)")
      .order("delivered_at", { ascending: false });
    if (data) setDeliveries(data as any);
  }, []);

  useEffect(() => {
    Promise.all([fetchEpis(), fetchDeliveries()]).then(() => setLoading(false));
  }, [fetchEpis, fetchDeliveries]);

  // CRUD EPIs
  const addEpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await supabase.from("epis").insert({
      name: newName.trim(),
      category: newCategory,
      validity_days: parseInt(newValidity) || 365,
      mandatory: newMandatory,
      codigo: newCodigo.trim(),
      ca: newCa.trim(),
      marca: newMarca.trim(),
    } as any);
    if (error) { toast.error("Erro ao cadastrar EPI"); return; }
    toast.success("EPI cadastrado!");
    setNewName(""); setNewCategory("Geral"); setNewValidity("365"); setNewMandatory(false);
    setNewCodigo(""); setNewCa(""); setNewMarca("");
    fetchEpis();
  };

  const startEditEpi = (epi: Epi) => {
    setEditingEpi(epi.id);
    setEditName(epi.name);
    setEditCategory(epi.category);
    setEditValidity(String(epi.validity_days));
    setEditMandatory(epi.mandatory);
    setEditCodigo(epi.codigo || "");
    setEditCa(epi.ca || "");
    setEditMarca(epi.marca || "");
  };

  const saveEditEpi = async () => {
    if (!editingEpi || !editName.trim()) return;
    const { error } = await supabase.from("epis").update({
      name: editName.trim(),
      category: editCategory,
      validity_days: parseInt(editValidity) || 365,
      mandatory: editMandatory,
      codigo: editCodigo.trim(),
      ca: editCa.trim(),
      marca: editMarca.trim(),
    } as any).eq("id", editingEpi);
    if (error) { toast.error("Erro ao atualizar"); return; }
    toast.success("EPI atualizado!");
    setEditingEpi(null);
    fetchEpis();
  };

  const deleteEpi = async (id: string) => {
    if (!confirm("Excluir este EPI e todas as entregas vinculadas?")) return;
    const { error } = await supabase.from("epis").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("EPI excluído!");
    fetchEpis();
    fetchDeliveries();
  };

  // Delivery
  const addDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryEpi || !deliveryEmployee || !deliveryBy.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const epi = epis.find(ep => ep.id === deliveryEpi);
    if (!epi) return;
    const expiresAt = new Date(deliveryDate);
    expiresAt.setDate(expiresAt.getDate() + epi.validity_days);

    const { error } = await supabase.from("epi_deliveries").insert({
      epi_id: deliveryEpi,
      employee_id: deliveryEmployee,
      delivered_at: deliveryDate,
      expires_at: expiresAt.toISOString().slice(0, 10),
      delivered_by: deliveryBy.trim(),
      tamanho: deliveryTamanho.trim(),
      quantidade: parseInt(deliveryQuantidade) || 1,
      estado: deliveryEstado,
      finalidade: deliveryFinalidade.trim(),
      empresa: deliveryEmpresa.trim(),
      setor: deliverySetor.trim(),
      local_entrega: deliveryLocal.trim(),
      notes: deliveryNotes.trim() || null,
    } as any);
    if (error) { toast.error("Erro ao registrar entrega"); return; }
    toast.success("Entrega registrada!");
    setDeliveryEpi(""); setDeliveryEmployee(""); setDeliveryBy("");
    setDeliveryTamanho(""); setDeliveryQuantidade("1"); setDeliveryEstado("Novo");
    setDeliveryFinalidade(""); setDeliveryEmpresa(""); setDeliverySetor("");
    setDeliveryLocal(""); setDeliveryNotes("");
    fetchDeliveries();
  };

  const deleteDelivery = async (id: string) => {
    if (!confirm("Excluir este registro de entrega?")) return;
    await supabase.from("epi_deliveries").delete().eq("id", id);
    toast.success("Registro excluído!");
    fetchDeliveries();
  };

  // Alerts data
  const alertDeliveries = deliveries.filter(d => daysUntilExpiry(d.expires_at) <= 30);
  const expiredCount = deliveries.filter(d => daysUntilExpiry(d.expires_at) < 0).length;
  const soonCount = alertDeliveries.length - expiredCount;

  // History data
  const historyFiltered = historyEmployee
    ? deliveries.filter(d => d.employee_id === historyEmployee)
    : deliveries;

  const subTabs: { key: SubTab; label: string; icon: typeof Package }[] = [
    { key: "catalog", label: "Catálogo", icon: Package },
    { key: "deliveries", label: "Entregas", icon: HardHat },
    { key: "alerts", label: `Alertas${alertDeliveries.length ? ` (${alertDeliveries.length})` : ""}`, icon: AlertTriangle },
    { key: "history", label: "Histórico", icon: Clock },
  ];

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Card key={i} className="h-20 animate-pulse bg-muted" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <HardHat className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Gestão de EPIs</h2>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {subTabs.map(t => (
          <Button key={t.key} variant={subTab === t.key ? "default" : "outline"} size="sm"
            onClick={() => setSubTab(t.key)} className="flex-shrink-0 text-xs">
            <t.icon className="w-3.5 h-3.5 mr-1" /> {t.label}
          </Button>
        ))}
      </div>

      {/* ===== CATÁLOGO ===== */}
      {subTab === "catalog" && (
        <div className="space-y-3">
           <form onSubmit={addEpi} className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Nome do EPI *" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1" />
              <Button type="submit" size="sm"><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input type="number" placeholder="Validade (dias)" value={newValidity}
                onChange={e => setNewValidity(e.target.value)} className="w-28 h-9 text-xs" />
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={newMandatory} onChange={e => setNewMandatory(e.target.checked)} />
                Obrigatório
              </label>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Código / Referência" value={newCodigo} onChange={e => setNewCodigo(e.target.value)} className="h-9 text-xs flex-1" />
              <Input placeholder="CA (Cert. Aprovação)" value={newCa} onChange={e => setNewCa(e.target.value)} className="h-9 text-xs flex-1" />
              <Input placeholder="Marca / Fabricante" value={newMarca} onChange={e => setNewMarca(e.target.value)} className="h-9 text-xs flex-1" />
            </div>
          </form>

          {epis.map(epi => (
            <Card key={epi.id} className="p-3">
              {editingEpi === epi.id ? (
                <div className="space-y-2">
                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome do EPI" />
                  <div className="flex gap-2 flex-wrap">
                    <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Input type="number" value={editValidity} onChange={e => setEditValidity(e.target.value)} className="w-28 h-9 text-xs" placeholder="Validade" />
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={editMandatory} onChange={e => setEditMandatory(e.target.checked)} />
                      Obrigatório
                    </label>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Input placeholder="Código" value={editCodigo} onChange={e => setEditCodigo(e.target.value)} className="h-9 text-xs flex-1" />
                    <Input placeholder="CA" value={editCa} onChange={e => setEditCa(e.target.value)} className="h-9 text-xs flex-1" />
                    <Input placeholder="Marca" value={editMarca} onChange={e => setEditMarca(e.target.value)} className="h-9 text-xs flex-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEditEpi}><Check className="w-3.5 h-3.5 mr-1" /> Salvar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingEpi(null)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{epi.name}</span>
                      {epi.mandatory && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Obrigatório</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{epi.category}</Badge>
                      <span className="text-[10px] text-muted-foreground">Validade: {epi.validity_days} dias</span>
                      {epi.ca && <span className="text-[10px] text-muted-foreground">CA: {epi.ca}</span>}
                      {epi.marca && <span className="text-[10px] text-muted-foreground">{epi.marca}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEditEpi(epi)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteEpi(epi.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
          {epis.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Nenhum EPI cadastrado</p>}
        </div>
      )}

      {/* ===== ENTREGAS ===== */}
      {subTab === "deliveries" && (
        <div className="space-y-3">
          <form onSubmit={addDelivery} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Identificação</p>
            <div className="flex gap-2">
              <select value={deliveryEpi} onChange={e => setDeliveryEpi(e.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Selecione o EPI *</option>
                {epis.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name} {e.ca ? `(CA: ${e.ca})` : ""}</option>)}
              </select>
              <select value={deliveryEmployee} onChange={e => setDeliveryEmployee(e.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Selecione o colaborador *</option>
                {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            <p className="text-xs font-medium text-muted-foreground pt-1">Empresa / Local</p>
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Empresa / Órgão" value={deliveryEmpresa} onChange={e => setDeliveryEmpresa(e.target.value)} className="h-9 text-xs flex-1" />
              <Input placeholder="Setor" value={deliverySetor} onChange={e => setDeliverySetor(e.target.value)} className="h-9 text-xs flex-1" />
              <Input placeholder="Local" value={deliveryLocal} onChange={e => setDeliveryLocal(e.target.value)} className="h-9 text-xs flex-1" />
            </div>

            <p className="text-xs font-medium text-muted-foreground pt-1">Detalhes da entrega</p>
            <div className="flex gap-2 flex-wrap">
              <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-9 text-xs w-36" />
              <Input placeholder="Responsável *" value={deliveryBy}
                onChange={e => setDeliveryBy(e.target.value)} className="h-9 text-xs flex-1" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Tamanho" value={deliveryTamanho} onChange={e => setDeliveryTamanho(e.target.value)} className="h-9 text-xs w-24" />
              <Input type="number" placeholder="Qtd" value={deliveryQuantidade} onChange={e => setDeliveryQuantidade(e.target.value)} className="h-9 text-xs w-16" min="1" />
              <select value={deliveryEstado} onChange={e => setDeliveryEstado(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                <option value="Novo">Novo</option>
                <option value="Bom estado">Bom estado</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <Input placeholder="Finalidade de uso" value={deliveryFinalidade} onChange={e => setDeliveryFinalidade(e.target.value)} className="h-9 text-xs" />
            <Input placeholder="Observações (opcional)" value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} className="h-9 text-xs" />
            <Button type="submit" size="sm" className="w-full"><Plus className="w-4 h-4 mr-1" /> Registrar Entrega</Button>
          </form>

          {deliveries.slice(0, 50).map(d => (
            <Card key={d.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{d.epis?.name || "EPI"}</span>
                    {d.status === "aceito" ? (
                      <Badge className="bg-emerald-600 text-white text-[10px]">✓ Aceito</Badge>
                    ) : (
                      <Badge className="bg-amber-500 text-white text-[10px]">Pendente</Badge>
                    )}
                    {expiryBadge(d.expires_at)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <User className="w-3 h-3 inline mr-0.5" />{d.employees?.name || "—"} •
                    Entrega: {new Date(d.delivered_at + "T00:00:00").toLocaleDateString("pt-BR")} •
                    Vence: {new Date(d.expires_at + "T00:00:00").toLocaleDateString("pt-BR")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Resp: {d.delivered_by || "—"}</div>
                  {d.status === "aceito" && d.accepted_at && (
                    <div className="text-[10px] text-emerald-500 mt-0.5">
                      Aceito em: {new Date(d.accepted_at).toLocaleString("pt-BR")}
                      {d.signature_url && " • Assinatura registrada ✓"}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" title="Baixar Termo"
                    onClick={() => {
                      const emp = employees.find(e => e.id === d.employee_id);
                      generateEpiTermo({
                        empresa: d.empresa || "",
                        setor: d.setor || "",
                        localEntrega: d.local_entrega || "",
                        employeeName: d.employees?.name || emp?.name || "—",
                        employeeCpf: emp?.cpf || d.employees?.cpf || "",
                        cargo: d.employees?.cargo || "",
                        departamento: d.employees?.departamento || "",
                        matricula: d.employees?.matricula || "",
                        epiName: d.epis?.name || "EPI",
                        epiCategory: d.epis?.category || "",
                        codigo: d.epis?.codigo || "",
                        ca: d.epis?.ca || "",
                        marca: d.epis?.marca || "",
                        tamanho: d.tamanho || "",
                        quantidade: d.quantidade || 1,
                        estado: d.estado || "Novo",
                        finalidade: d.finalidade || "",
                        deliveredAt: d.delivered_at,
                        expiresAt: d.expires_at,
                        deliveredBy: d.delivered_by,
                        notes: d.notes,
                        status: d.status,
                        acceptedAt: d.accepted_at,
                        signatureUrl: d.signature_url,
                      });
                    }}>
                    <FileDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteDelivery(d.id)} className="text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {deliveries.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma entrega registrada</p>}
        </div>
      )}

      {/* ===== ALERTAS ===== */}
      {subTab === "alerts" && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <Card className="p-3 flex-1 text-center">
              <div className="text-2xl font-bold text-destructive">{expiredCount}</div>
              <div className="text-xs text-muted-foreground">Vencidos</div>
            </Card>
            <Card className="p-3 flex-1 text-center">
              <div className="text-2xl font-bold text-amber-500">{soonCount}</div>
              <div className="text-xs text-muted-foreground">A vencer (30d)</div>
            </Card>
            <Card className="p-3 flex-1 text-center">
              <div className="text-2xl font-bold text-emerald-500">{deliveries.length - alertDeliveries.length}</div>
              <div className="text-xs text-muted-foreground">Em dia</div>
            </Card>
          </div>

          {alertDeliveries.length === 0 ? (
            <Card className="p-6 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Todos os EPIs estão em dia!</p>
            </Card>
          ) : (
            alertDeliveries.sort((a, b) => daysUntilExpiry(a.expires_at) - daysUntilExpiry(b.expires_at)).map(d => (
              <Card key={d.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${daysUntilExpiry(d.expires_at) < 0 ? "text-destructive" : "text-amber-500"}`} />
                      <span className="font-medium text-sm">{d.epis?.name}</span>
                      {expiryBadge(d.expires_at)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <User className="w-3 h-3 inline mr-0.5" />{d.employees?.name} •
                      Vence: {new Date(d.expires_at + "T00:00:00").toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ===== HISTÓRICO ===== */}
      {subTab === "history" && (
        <div className="space-y-3">
          <select value={historyEmployee} onChange={e => setHistoryEmployee(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">Todos os colaboradores</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          {/* Group by employee */}
          {(() => {
            const byEmployee = new Map<string, EpiDelivery[]>();
            historyFiltered.forEach(d => {
              const key = d.employee_id;
              if (!byEmployee.has(key)) byEmployee.set(key, []);
              byEmployee.get(key)!.push(d);
            });

            return Array.from(byEmployee.entries()).map(([empId, dels]) => (
              <Card key={empId} className="p-3">
                <button onClick={() => setExpandedEpi(expandedEpi === empId ? null : empId)}
                  className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">{dels[0]?.employees?.name || "—"}</span>
                    <Badge variant="outline" className="text-[10px]">{dels.length} entrega(s)</Badge>
                  </div>
                  {expandedEpi === empId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {expandedEpi === empId && (
                  <div className="mt-2 space-y-1.5 pl-6 border-l-2 border-muted">
                    {dels.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium">{d.epis?.name}</span>
                          <span className="text-muted-foreground ml-2">
                            {new Date(d.delivered_at + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                        {expiryBadge(d.expires_at)}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ));
          })()}

          {historyFiltered.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Nenhum histórico encontrado</p>}
        </div>
      )}
    </div>
  );
}
