import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, X, Check,
  ToggleLeft, ToggleRight, Shield, User as UserIcon,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  role: string;
}

export default function UsersTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("usuario");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("usuario");
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });

      if (!profiles) { setLoading(false); return; }

      const { data: roles } = await supabase.from("user_roles").select("*");

      const merged: UserProfile[] = profiles.map((p: any) => {
        const userRole = roles?.find((r: any) => r.user_id === p.user_id);
        return { ...p, role: userRole?.role || "usuario" };
      });

      setUsers(merged);
    } catch {
      toast.error("Erro ao carregar usuários");
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const callManageUser = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-user", {
      body: payload,
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }
    setCreating(true);
    try {
      await callManageUser({
        action: "create",
        email: newEmail.trim(),
        password: newPassword,
        full_name: newName.trim(),
        role: newRole,
      });
      toast.success("Usuário criado com sucesso!");
      setShowCreate(false);
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("usuario");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    }
    setCreating(false);
  };

  const handleUpdate = async (userId: string) => {
    try {
      // Atualiza profiles
      await (supabase as any)
        .from("profiles")
        .update({ full_name: editName.trim(), email: editEmail.trim(), role: editRole })
        .eq("user_id", userId);

      // Atualiza user_roles
      const { error } = await (supabase as any)
        .from("user_roles")
        .update({ role: editRole })
        .eq("user_id", userId);
      if (error) {
        await (supabase as any).from("user_roles").insert({ user_id: userId, role: editRole });
      }

      toast.success("Usuário atualizado!");
      setEditingId(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    }
  };
  const handleToggle = async (u: UserProfile) => {
    try {
      await callManageUser({
        action: "update",
        user_id: u.user_id,
        active: !u.active,
      });
      toast.success(u.active ? "Usuário desativado" : "Usuário ativado");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    }
  };

  const handleDelete = async (u: UserProfile) => {
    if (!confirm(`Excluir usuário "${u.full_name}"? Esta ação é irreversível.`)) return;
    try {
      await callManageUser({ action: "delete", user_id: u.user_id });
      toast.success("Usuário excluído!");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  };

  const startEditing = (u: UserProfile) => {
    setEditingId(u.user_id);
    setEditName(u.full_name);
    setEditEmail(u.email);
    setEditRole(u.role);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} usuário{users.length !== 1 ? "s" : ""}</p>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo acesso ao sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome completo</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <Label>Senha</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <Label>Perfil de acesso</Label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="usuario">Usuário comum</option>
                <option value="rh">RH</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full">
              {creating ? "Criando..." : "Criar Usuário"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User list */}
      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.user_id} className="p-4">
            {editingId === u.user_id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome" />
                  <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" />
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="operacional">📋 Operacional</option>
                    <option value="supervisor">👁️ Supervisor</option>
                    <option value="rh">👔 RH</option>
                    <option value="admin">👑 Administrador</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleUpdate(u.user_id)}>
                    <Check className="w-4 h-4 mr-1" /> Salvar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4 mr-1" /> Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggle(u)} className="text-muted-foreground hover:text-foreground transition-colors">
                    {u.active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <div>
                    <span className={`font-medium ${!u.active ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {u.full_name || u.email}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1 ${u.role === "admin"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                        }`}>
                        {u.role === "admin" ? <><Shield className="w-3 h-3" /> Admin</> : u.role === "rh" ? <><Shield className="w-3 h-3" /> RH</> : <><UserIcon className="w-3 h-3" /> Usuário</>}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEditing(u)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(u)} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
