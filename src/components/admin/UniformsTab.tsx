import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shirt, Plus, Trash2, Package, Clock, User, Pencil, X, Check } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface Uniform {
  id: string;
  name: string;
  category: string;
  active: boolean;
  created_at: string;
}

interface UniformDelivery {
  id: string;
  uniform_id: string;
  employee_id: string;
  delivered_at: string;
  delivered_by: string;
  size: string;
  quantity: number;
  condition: string;
  notes: string | null;
  status: string;
  uniforms?: { name: string; category: string };
  employees?: { name: string };
}

type SubTab = "catalog" | "deliveries" | "history";

const CATEGORIES = ["Camiseta", "Calça", "Jaleco", "Boné", "Calçado", "Macacão", "Geral"];
const SIZES = ["PP", "P", "M", "G", "GG", "XGG", "34", "36", "38", "40", "42", "44", "46"];

export default function UniformsTab({ employees }: { employees: Employee[] }) {
  const [subTab, setSubTab] = useState<SubTab>("catalog");
  const [uniforms, setUniforms] = useState<Uniform[]>([]);
  const [deliveries, setDeliveries] = useState<UniformDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  // Catalog form
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Geral");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");

  // Delivery form
  const [deliveryUniform, setDeliveryUniform] = useState("");
  const [deliveryEmployee, setDeliveryEmployee] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryBy, setDeliveryBy] = useState("");
  const [deliverySize, setDeliverySize] = useState("");
  const [deliveryQuantity, setDeliveryQuantity] = useState("1");
  const [deliveryCondition, setDeliveryCondition] = useState("Novo");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const fetchUniforms = useCallback(async () => {
    const { data } = await (supabase as any).from("uniforms").select("*").order("name");
    if (data) setUniforms(data);
  }, []);

  const fetchDeliveries = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("uniform_deliveries")
      .select("*, uniforms(name, category), employees(name)")
      .order("delivered_at", { ascending: false });
    if (data) setDeliveries(data);
  }, []);

  useEffect(() => {
    Promise.all([fetchUniforms(), fetchDeliveries()]).then(() => setLoading(false));
  }, [fetchUniforms, fetchDeliveries]);

  const addUniform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await (supabase as any).from("uniforms").insert({
      name: newName.trim(),
      category: newCategory,
    });
    if (error) { toast.error("Erro ao cadastrar uniforme"); return; }
    toast.success("Uniforme cadastrado!");
    setNewName(""); setNewCategory("Geral");
    fetchUniforms();
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const { error } = await (supabase as any).from("uniforms").update({
      name: editName.trim(), category: editCategory,
    }).eq("id", editingId);
    if (error) { toast.error("Erro ao atualizar"); return; }
    toast.success("Atualizado!");
    setEditingId(null);
    fetchUniforms();
  };

  const deleteUniform = async (id: string) => {
    if (!confirm("Excluir este uniforme?")) return;
    await (supabase as any).from("uniforms").delete().eq("id", id);
    toast.success("Excluído!");
    fetchUniforms();
  };

  const addDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryUniform || !deliveryEmployee || !deliveryBy.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const { error } = await (supabase as any).from("uniform_deliveries").insert({
      uniform_id: deliveryUniform,
      employee_id: deliveryEmployee,
      delivered_at: deliveryDate,
      delivered_by: deliveryBy.trim(),
      size: deliverySize.trim(),
      quantity: parseInt(deliveryQuantity) || 1,
      condition: deliveryCondition,
      notes: deliveryNotes.trim() || null,
    });
    if (error) { toast.error("Erro ao registrar entrega"); return; }
    toast.success("Entrega registrada!");
    setDeliveryUniform(""); setDeliveryEmployee(""); setDeliveryBy("");
    setDeliverySize(""); setDeliveryQuantity("1"); setDeliveryNotes("");
    fetchDeliveries();
  };

  const deleteDelivery = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    await (supabase as any).from("uniform_deliveries").delete().eq("id", id);
    toast.success("Excluído!");
    fetchDeliveries();
  };

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="h-20 animate-pulse bg-muted" />)}</div>;

  const subTabs = [
    { key: "catalog" as SubTab, label: "Catálogo", icon: Package },
    { key: "deliveries" as SubTab, label: "Entregas", icon: Shirt },
    { key: "history" as SubTab, label: "Histórico", icon: Clock },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shirt className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Gestão de Uniformes</h2>
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
          <form onSubmit={addUniform} className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Nome do uniforme *" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1" />
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-2 text-xs">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Button type="submit" size="sm"><Plus className="w-4 h-4" /></Button>
            </div>
          </form>

          {uniforms.map(u => (
            <Card key={u.id} className="p-3">
              {editingId === u.id ? (
                <div className="flex gap-2">
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1" />
                  <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-2 text-xs">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Button size="sm" onClick={saveEdit}><Check className="w-4 h-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{u.name}</span>
                    <Badge variant="outline" className="text-[10px]">{u.category}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingId(u.id); setEditName(u.name); setEditCategory(u.category); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteUniform(u.id)} className="text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
          {uniforms.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Nenhum uniforme cadastrado</p>}
        </div>
      )}

      {subTab === "deliveries" && (
        <div className="space-y-3">
          <form onSubmit={addDelivery} className="space-y-2">
            <div className="flex gap-2">
              <select value={deliveryUniform} onChange={e => setDeliveryUniform(e.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Selecione o uniforme *</option>
                {uniforms.map(u => <option key={u.id} value={u.id}>{u.name} — {u.category}</option>)}
              </select>
              <select value={deliveryEmployee} onChange={e => setDeliveryEmployee(e.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Selecione o colaborador *</option>
                {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-9 text-xs w-36" />
              <Input placeholder="Responsável *" value={deliveryBy} onChange={e => setDeliveryBy(e.target.value)} className="h-9 text-xs flex-1" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <select value={deliverySize} onChange={e => setDeliverySize(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Tamanho</option>
                {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <Input type="number" placeholder="Qtd" value={deliveryQuantity} onChange={e => setDeliveryQuantity(e.target.value)} className="h-9 text-xs w-16" min="1" />
              <select value={deliveryCondition} onChange={e => setDeliveryCondition(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                <option value="Novo">Novo</option>
                <option value="Bom estado">Bom estado</option>
                <option value="Usado">Usado</option>
              </select>
            </div>
            <Input placeholder="Observações (opcional)" value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} className="h-9 text-xs" />
            <Button type="submit" size="sm" className="w-full"><Plus className="w-4 h-4 mr-1" /> Registrar Entrega</Button>
          </form>
        </div>
      )}

      {subTab === "history" && (
        <div className="space-y-3">
          {deliveries.map(d => (
            <Card key={d.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{d.uniforms?.name || "Uniforme"}</span>
                    <Badge variant="outline" className="text-[10px]">{d.size || "—"}</Badge>
                    <Badge variant="secondary" className="text-[10px]">Qtd: {d.quantity}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <User className="w-3 h-3 inline mr-0.5" />{d.employees?.name || "—"} •
                    {new Date(d.delivered_at + "T00:00:00").toLocaleDateString("pt-BR")} •
                    Resp: {d.delivered_by}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteDelivery(d.id)} className="text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
          {deliveries.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma entrega registrada</p>}
        </div>
      )}
    </div>
  );
}