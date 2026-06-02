import { useEffect, useState } from "react";
import {
  Users, Clock, FileText, HardHat, Shield, Activity, Calendar,
  Package, Truck, AlertTriangle, History, LogOut, ChevronDown, Shirt, Wrench,
  DollarSign, Settings as SettingsIcon, Calculator, Receipt, BarChart2, FolderOpen,
  Sparkles, MapPin, FileDown, CheckCircle2, TrendingUp, Building2, Brain,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export type AdminTab =
  | "dashboard" | "employees" | "records" | "justifications"
  | "epi-catalog" | "epi-deliveries" | "epi-alerts" | "epi-history"
  | "uniforms-catalog" | "uniforms-deliveries" | "uniforms-history"
  | "tools-catalog" | "tools-loans" | "tools-history"
  | "payroll-dashboard" | "payroll-settings" | "banco-horas" | "trabalhista-config"
  | "documentos" | "payroll-closing" | "payslips" | "assistente" | "audit" | "debug"
  | "simulador" | "espelho-ponto" | "mapa-localizacao" | "exportacoes"
  | "aprovacoes-lote" | "analises" | "historico" | "agenda" | "users" | "avisos"
  | "solicitacoes" | "centro-operacoes" | "panorama" | "onboarding";

export type UserRole = "admin" | "rh" | "supervisor" | "operacional";

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  isRh?: boolean;
  userRole?: UserRole;
  userName?: string;
  userEmail?: string;
}

// Permissões por perfil
const PERMISSIONS: Record<UserRole, AdminTab[]> = {
  admin: [], // vazio = acesso total
  rh: [
    "dashboard", "employees", "records", "justifications", "documentos",
    "solicitacoes", "avisos", "onboarding", "agenda", "aprovacoes-lote",
    "exportacoes", "analises", "historico", "assistente", "mapa-localizacao",
    "payroll-dashboard", "espelho-ponto", "banco-horas", "payslips",
    "payroll-closing", "payroll-settings", "trabalhista-config", "simulador",
    "centro-operacoes", "panorama",
  ],
  supervisor: [
    "dashboard", "records", "employees", "centro-operacoes", "panorama",
    "analises", "historico", "exportacoes", "mapa-localizacao",
  ],
  operacional: ["dashboard", "records"],
};

// Items por grupo
const principalItems = [
  { key: "dashboard" as const, label: "Dashboard", icon: Activity },
  { key: "centro-operacoes" as const, label: "Centro de Operações", icon: Shield },
  { key: "panorama" as const, label: "Panorama", icon: TrendingUp },
  { key: "employees" as const, label: "Funcionários", icon: Users },
  { key: "records" as const, label: "Registros", icon: Clock },
];

const pessoasItems = [
  { key: "justifications" as const, label: "Atestados", icon: FileText },
  { key: "solicitacoes" as const, label: "Solicitações", icon: CheckCircle2 },
  { key: "avisos" as const, label: "Avisos", icon: AlertTriangle },
  { key: "onboarding" as const, label: "Onboarding", icon: Users },
  { key: "documentos" as const, label: "Documentos", icon: FolderOpen },
  { key: "agenda" as const, label: "Agenda", icon: Calendar },
  { key: "mapa-localizacao" as const, label: "Mapa de Localização", icon: MapPin },
];

const relatoriosItems = [
  { key: "analises" as const, label: "Análises", icon: BarChart2 },
  { key: "historico" as const, label: "Histórico", icon: History },
  { key: "exportacoes" as const, label: "Exportações", icon: FileDown },
  { key: "aprovacoes-lote" as const, label: "Aprovações em Lote", icon: CheckCircle2 },
  { key: "assistente" as const, label: "Assistente IA", icon: Sparkles },
];

const patrimonioEpiItems = [
  { key: "epi-catalog" as const, label: "Catálogo", icon: Package },
  { key: "epi-deliveries" as const, label: "Entregas", icon: Truck },
  { key: "epi-alerts" as const, label: "Alertas", icon: AlertTriangle },
  { key: "epi-history" as const, label: "Histórico", icon: History },
];

const patrimonioUniformItems = [
  { key: "uniforms-catalog" as const, label: "Catálogo", icon: Package },
  { key: "uniforms-deliveries" as const, label: "Entregas", icon: Shirt },
  { key: "uniforms-history" as const, label: "Histórico", icon: History },
];

const patrimonioToolItems = [
  { key: "tools-catalog" as const, label: "Catálogo", icon: Package },
  { key: "tools-loans" as const, label: "Empréstimos", icon: Wrench },
  { key: "tools-history" as const, label: "Histórico", icon: History },
];

const payrollItems = [
  { key: "payroll-dashboard" as const, label: "Dashboard", icon: BarChart2 },
  { key: "espelho-ponto" as const, label: "Espelho de Ponto", icon: Clock },
  { key: "banco-horas" as const, label: "Banco de Horas", icon: Clock },
  { key: "payslips" as const, label: "Holerites", icon: Receipt },
  { key: "payroll-closing" as const, label: "Fechamento", icon: Calculator },
  { key: "payroll-settings" as const, label: "Parâmetros", icon: SettingsIcon },
  { key: "trabalhista-config" as const, label: "Regras CLT", icon: FileText },
  { key: "simulador" as const, label: "Simulador", icon: Calculator },
];

const systemItems = [
  { key: "users" as const, label: "Usuários", icon: Users },
  { key: "audit" as const, label: "Auditoria", icon: Shield },
  { key: "debug" as const, label: "Logs", icon: Activity },
];

function MenuGroup({ items, activeTab, onTabChange, collapsed, badges, allowedTabs }: {
  items: { key: AdminTab; label: string; icon: any }[];
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  collapsed: boolean;
  badges?: Record<string, number>;
  allowedTabs?: AdminTab[];
}) {
  const filtered = allowedTabs ? items.filter(i => allowedTabs.includes(i.key)) : items;
  if (filtered.length === 0) return null;
  return (
    <SidebarMenu>
      {filtered.map((item) => (
        <SidebarMenuItem key={item.key}>
          <SidebarMenuButton isActive={activeTab === item.key} onClick={() => onTabChange(item.key)} tooltip={item.label}>
            <item.icon className="h-4 w-4" />
            {!collapsed && (
              <span className="flex-1 flex items-center justify-between">
                {item.label}
                {badges?.[item.key] ? (
                  <span className="ml-2 min-w-[18px] h-[18px] rounded-full text-[10px] font-black flex items-center justify-center px-1"
                    style={{ background: "#dc2626", color: "white" }}>
                    {badges[item.key]}
                  </span>
                ) : null}
              </span>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function CollapsibleGroup({ label, icon: Icon, children, defaultOpen, collapsed, badge }: {
  label: string; icon: any; children: React.ReactNode; defaultOpen?: boolean; collapsed: boolean; badge?: number;
}) {
  return (
    <SidebarGroup>
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger className="w-full">
          <SidebarGroupLabel className="flex items-center justify-between w-full cursor-pointer hover:text-foreground transition-colors">
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {!collapsed && label}
            </span>
            {!collapsed && (
              <span className="flex items-center gap-1">
                {badge ? (
                  <span className="min-w-[18px] h-[18px] rounded-full text-[10px] font-black flex items-center justify-center px-1"
                    style={{ background: "#dc2626", color: "white" }}>
                    {badge}
                  </span>
                ) : null}
                <ChevronDown className="h-3 w-3" />
              </span>
            )}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

const ROLE_LABELS: Record<UserRole, { label: string; color: string; bg: string }> = {
  admin:       { label: "Administrador", color: "#1e40af", bg: "#eff6ff" },
  rh:          { label: "RH",            color: "#7c3aed", bg: "#f5f3ff" },
  supervisor:  { label: "Supervisor",    color: "#15803d", bg: "#f0fdf4" },
  operacional: { label: "Operacional",   color: "#b45309", bg: "#fffbeb" },
};

export default function AdminSidebar({ activeTab, onTabChange, onLogout, isAdmin = false, isRh = false, userRole = "admin", userName, userEmail }: Props) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState(0);

  useEffect(() => {
    const fetchPendentes = async () => {
      try {
        const { count } = await (supabase as any)
          .from("employee_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pendente");
        setSolicitacoesPendentes(count || 0);
      } catch {}
    };
    fetchPendentes();
    const channel = (supabase as any)
      .channel("solicitacoes-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_requests" }, () => {
        fetchPendentes();
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, []);

  const allowedTabs = userRole === "admin" ? undefined : PERMISSIONS[userRole];

  const isPessoasActive = ["justifications","documentos","aprovacoes-lote","solicitacoes","agenda","avisos","onboarding","mapa-localizacao"].includes(activeTab);
  const isRelatoriosActive = ["analises","historico","exportacoes","assistente","aprovacoes-lote"].includes(activeTab);
  const isPatrimonioActive = activeTab.startsWith("epi-") || activeTab.startsWith("uniforms-") || activeTab.startsWith("tools-");
  const isPayrollActive = activeTab.startsWith("payroll") || ["payslips","banco-horas","trabalhista-config","simulador","espelho-ponto"].includes(activeTab);

  const pessoasBadges: Record<string, number> = {};
  if (solicitacoesPendentes > 0) pessoasBadges["solicitacoes"] = solicitacoesPendentes;

  const roleConfig = ROLE_LABELS[userRole] || ROLE_LABELS.admin;
  const displayName = userName || userEmail || "Usuário";
  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4 border-b border-border">
        {!collapsed ? (
          <div>
            <h2 className="text-base font-black text-foreground tracking-tight flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              Painel Admin
            </h2>
            <div className="mt-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{displayName}</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: roleConfig.bg, color: roleConfig.color }}>
                  {roleConfig.label}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white mx-auto"
            style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
            {initials}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* Principal */}
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <MenuGroup items={principalItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} allowedTabs={allowedTabs} />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Pessoas & Gestão */}
        <CollapsibleGroup label="Pessoas & Gestão" icon={Users} defaultOpen={isPessoasActive} collapsed={collapsed} badge={solicitacoesPendentes}>
          <MenuGroup items={pessoasItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} badges={pessoasBadges} allowedTabs={allowedTabs} />
        </CollapsibleGroup>

        {/* Relatórios & IA */}
        <CollapsibleGroup label="Relatórios & IA" icon={Brain} defaultOpen={isRelatoriosActive} collapsed={collapsed}>
          <MenuGroup items={relatoriosItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} allowedTabs={allowedTabs} />
        </CollapsibleGroup>

        {/* Patrimônio */}
        <CollapsibleGroup label="Patrimônio" icon={HardHat} defaultOpen={isPatrimonioActive} collapsed={collapsed}>
          {(allowedTabs === undefined) && (
            <>
              <p className="text-[10px] font-bold text-muted-foreground px-3 pt-2 pb-1">EPIs</p>
              <MenuGroup items={patrimonioEpiItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
              <p className="text-[10px] font-bold text-muted-foreground px-3 pt-2 pb-1">Uniformes</p>
              <MenuGroup items={patrimonioUniformItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
              <p className="text-[10px] font-bold text-muted-foreground px-3 pt-2 pb-1">Ferramentas</p>
              <MenuGroup items={patrimonioToolItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
            </>
          )}
        </CollapsibleGroup>

        {/* Folha de Pagamento */}
        <CollapsibleGroup label="Folha de Pagamento" icon={DollarSign} defaultOpen={isPayrollActive} collapsed={collapsed}>
          <MenuGroup items={payrollItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} allowedTabs={allowedTabs} />
        </CollapsibleGroup>

        {/* Sistema */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Sistema</SidebarGroupLabel>
            <SidebarGroupContent>
              <MenuGroup items={systemItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onLogout} className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive">
          <LogOut className="h-4 w-4" />
          {!collapsed && "Sair"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}