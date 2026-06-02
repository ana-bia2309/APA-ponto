import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  active: boolean;
}

const ROLES = [
  {
    value: "admin",
    label: "Administrador",
    color: "#1e40af",
    bg: "#eff6ff",
    icon: "👑",
    descricao: "Acesso total ao sistema",
    permissoes: ["Todas as funcionalidades", "Gerenciar usuários", "Configurações do sistema"],
  },
  {
    value: "rh",
    label: "RH",
    color: "#7c3aed",
    bg: "#f5f3ff",
    icon: "👔",
    descricao: "Foco em pessoas e folha",
    permissoes: ["Dashboard", "Funcionários", "Registros", "Atestados", "Documentos", "Solicitações", "Folha de Pagamento", "Relatórios"],
  },
  {
    value: "supervisor",
    label: "Supervisor",
    color: "#15803d",
    bg: "#f0fdf4",
    icon: "👁️",
    descricao: "Visualização e relatórios",
    permissoes: ["Dashboard", "Registros", "Centro de Operações", "Panorama", "Análises", "Exportações"],
  },
  {
    value: "operacional",
    label: "Operacional",
    color: "#b45309",
    bg: "#fffbeb",
    icon: "📋",
    descricao: "Acesso básico",
    permissoes: ["Dashboard", "Registros de Ponto"],
  },
];

export default function PermissoesTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("*")
        .order("full_name");
      if (error) throw error;
      setUsers(data || []);
    } catch (e: any) {
      toast.error("Erro ao carregar usuários: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

 const updateRole = async (userId: string, profileId: string, newRole: string) => {
    if (userId === currentUserId) {
      toast.error("Você não pode alterar seu próprio perfil!");
      return;
    }
    setSaving(profileId);
    try {
      // Atualiza profiles
      const { error: profileError } = await (supabase as any)
        .from("profiles")
        .update({ role: newRole })
        .eq("id", profileId);
      if (profileError) throw profileError;

      // Atualiza user_roles
      const { error: roleError } = await (supabase as any)
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);
      if (roleError) {
        // Se não existe, insere
        await (supabase as any).from("user_roles").insert({ user_id: userId, role: newRole });
      }

      toast.success("Perfil atualizado com sucesso! ✅");
      load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSaving(null);
    }
  };
  const toggleActive = async (profileId: string, active: boolean, userId: string) => {
    if (userId === currentUserId) {
      toast.error("Você não pode desativar sua própria conta!");
      return;
    }
    try {
      await (supabase as any).from("profiles").update({ active: !active }).eq("id", profileId);
      toast.success(!active ? "Usuário ativado!" : "Usuário desativado!");
      load();
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">🔐 Permissões de Acesso</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Defina o nível de acesso de cada usuário do sistema</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Cards de perfis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ROLES.map(role => (
          <div key={role.value} className="rounded-2xl p-4 border"
            style={{ background: role.bg, borderColor: role.color + "30" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{role.icon}</span>
              <p className="text-sm font-bold" style={{ color: role.color }}>{role.label}</p>
            </div>
            <p className="text-[10px] text-gray-500 mb-2">{role.descricao}</p>
            <div className="space-y-0.5">
              {role.permissoes.map((p, i) => (
                <p key={i} className="text-[10px] flex items-center gap-1" style={{ color: role.color }}>
                  <span>✓</span> {p}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Lista de usuários */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm text-gray-400">Nenhum usuário encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
            {users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}
          </p>
          {users.map((u) => {
            const roleConfig = ROLES.find(r => r.value === (u.role || "operacional")) || ROLES[3];
            const isCurrentUser = u.user_id === currentUserId;
            const isSaving = saving === u.id;
            return (
              <div key={u.id} className="bg-white rounded-2xl border border-gray-100 p-4"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)", opacity: u.active ? 1 : 0.6 }}>
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                    {(u.full_name || u.email || "?").charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-800">{u.full_name || "Sem nome"}</p>
                      {isCurrentUser && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-bold">Você</span>
                      )}
                      {!u.active && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">Inativo</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">{u.email}</p>
                  </div>

                  {/* Badge de perfil — somente leitura */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{ background: roleConfig.bg, color: roleConfig.color }}>
                      {roleConfig.icon} {roleConfig.label}
                    </span>
                    <p className="text-[10px] text-gray-400 hidden sm:block">Altere em Sistema → Usuários</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}