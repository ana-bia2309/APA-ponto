import { useEffect, useState } from "react";
import {
  Users, Clock, FileText, HardHat, Shield, Activity, Calendar,
  Package, Truck, AlertTriangle, History, LogOut, ChevronDown, Shirt, Wrench,
  DollarSign, Settings as SettingsIcon, Calculator, Receipt, BarChart2, FolderOpen, Sparkles, MapPin, FileDown, CheckCircle2,
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
  | "solicitacoes";

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  isRh?: boolean;
}

const principalItems = [
  { key: "dashboard" as const, label: "Dashboard", icon: Activity },
  { key: "employees" as const, label: "Funcionários", icon: Users },
  { key: "records" as const, label: "Registros", icon: Clock },
];

const inteligenciaItems = [
  { key: "analises" as const, label: "Análises", icon: BarChart2 },
  { key: "historico" as const, label: "Histórico", icon: History },
  { key: "assistente" as const, label: "Assistente IA", icon: Sparkles },
];

const epiItems = [
  { key: "epi-catalog" as const, label: "Catálogo", icon: Package },
  { key: "epi-deliveries" as const, label: "Entregas", icon: Truck },
  { key: "epi-alerts" as const, label: "Alertas", icon: AlertTriangle },
  { key: "epi-history" as const, label: "Histórico", icon: History },
];

const uniformItems = [
  { key: "uniforms-catalog" as const, label: "Catálogo", icon: Package },
  { key: "uniforms-deliveries" as const, label: "Entregas", icon: Shirt },
  { key: "uniforms-history" as const, label: "Histórico", icon: History },
];

const toolItems = [
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
  { key: "payroll-settings" as const, label: "Parâmetros da Folha", icon: SettingsIcon },
  { key: "trabalhista-config" as const, label: "Regras CLT", icon: FileText },
  { key: "simulador" as const, label: "Simulador", icon: Calculator },
];

const systemItems = [
  { key: "users" as const, label: "Usuários", icon: Users },
  { key: "audit" as const, label: "Auditoria", icon: Shield },
  { key: "debug" as const, label: "Logs", icon: Activity },
];

function MenuGroup({ items, activeTab, onTabChange, collapsed, badges }: {
  items: { key: AdminTab; label: string; icon: any }[];
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  collapsed: boolean;
  badges?: Record<string, number>;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => (
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

export default function AdminSidebar({ activeTab, onTabChange, onLogout, isAdmin = false, isRh = false }: Props) {
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

    // Realtime subscription
    const channel = (supabase as any)
      .channel("solicitacoes-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_requests" }, () => {
        fetchPendentes();
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, []);

  const isGestaoActive = ["justifications","documentos","aprovacoes-lote","exportacoes","mapa-localizacao","solicitacoes","agenda","avisos"].includes(activeTab);  const isInteligenciaActive = ["analises","historico","assistente"].includes(activeTab);
  const isEpiActive = activeTab.startsWith("epi-");
  const isUniformActive = activeTab.startsWith("uniforms-");
  const isToolActive = activeTab.startsWith("tools-");
  const isPayrollActive = activeTab.startsWith("payroll") || ["payslips","banco-horas","trabalhista-config","simulador","espelho-ponto"].includes(activeTab);

  const gestaoItems = [
    { key: "justifications" as const, label: "Atestados", icon: FileText },
    { key: "documentos" as const, label: "Documentos", icon: FolderOpen },
    { key: "aprovacoes-lote" as const, label: "Aprovações em Lote", icon: CheckCircle2 },
    { key: "exportacoes" as const, label: "Relatórios", icon: FileDown },
    { key: "mapa-localizacao" as const, label: "Mapa de Localização", icon: MapPin },
    { key: "agenda" as const, label: "Agenda", icon: Calendar },
    { key: "solicitacoes" as const, label: "Solicitações", icon: FileText },
    { key: "avisos" as const, label: "Avisos", icon: Activity },
  ];

  const gestaoBadges: Record<string, number> = {};
  if (solicitacoesPendentes > 0) gestaoBadges["solicitacoes"] = solicitacoesPendentes;

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        {!collapsed && <h2 className="text-lg font-bold text-foreground tracking-tight">Painel Admin</h2>}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <MenuGroup items={principalItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
          </SidebarGroupContent>
        </SidebarGroup>

        <CollapsibleGroup label="Gestão" icon={CheckCircle2} defaultOpen={isGestaoActive} collapsed={collapsed} badge={solicitacoesPendentes}>
          <MenuGroup items={gestaoItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} badges={gestaoBadges} />
        </CollapsibleGroup>

        <CollapsibleGroup label="Inteligência" icon={BarChart2} defaultOpen={isInteligenciaActive} collapsed={collapsed}>
          <MenuGroup items={inteligenciaItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
        </CollapsibleGroup>

        <CollapsibleGroup label="EPIs" icon={HardHat} defaultOpen={isEpiActive} collapsed={collapsed}>
          <MenuGroup items={epiItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
        </CollapsibleGroup>

        <CollapsibleGroup label="Uniformes" icon={Shirt} defaultOpen={isUniformActive} collapsed={collapsed}>
          <MenuGroup items={uniformItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
        </CollapsibleGroup>

        <CollapsibleGroup label="Ferramentas" icon={Wrench} defaultOpen={isToolActive} collapsed={collapsed}>
          <MenuGroup items={toolItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
        </CollapsibleGroup>

        <CollapsibleGroup label="Folha de Pagamento" icon={DollarSign} defaultOpen={isPayrollActive} collapsed={collapsed}>
          <MenuGroup items={payrollItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
        </CollapsibleGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Sistema</SidebarGroupLabel>
            <SidebarGroupContent>
              <MenuGroup items={systemItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Button variant="ghost" size="sm" onClick={onLogout} className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive">
          <LogOut className="h-4 w-4" />
          {!collapsed && "Sair"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}