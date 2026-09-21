import { useEffect, useMemo, useState } from "react";
import {
  Users, Clock, FileText, HardHat, Shield, Activity, Calendar,
  Package, Truck, AlertTriangle, History, LogOut, ChevronDown, Shirt, Wrench,
 DollarSign, Settings as SettingsIcon, Calculator, Receipt, BarChart2, FolderOpen, Wallet, FileSignature, MessageSquareWarning,
  Sparkles, MapPin, FileDown, CheckCircle2, TrendingUp, Building2, Brain, Search, X,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/theme";

/** Remove acentos e caixa pra comparar texto de busca sem frescura. */
function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type AdminTab =
  | "dashboard" | "employees" | "records" | "justifications"
  | "epi-catalog" | "epi-deliveries" | "epi-alerts" | "epi-history"
  | "uniforms-catalog" | "uniforms-deliveries" | "uniforms-history"
  | "tools-catalog" | "tools-loans" | "tools-history"
  | "payroll-dashboard" | "payroll-settings" | "banco-horas" | "trabalhista-config"
  | "documentos" | "payroll-closing" | "payslips" | "assistente" | "audit" | "debug"
  | "simulador" | "espelho-ponto" | "mapa-localizacao" | "exportacoes"
  | "aprovacoes-lote" | "analises" | "historico" | "agenda" | "users" | "avisos"
  | "solicitacoes" | "centro-operacoes" | "panorama" | "onboarding" | "permissoes"
  | "anomalias" | "mapa-calor" | "organograma" | "cobertura" | "calendario-ausencias"
  | "decimo-terceiro" | "rescisao" | "adiantamentos" | "documentos-assinatura" | "ouvidoria";

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

export const PERMISSIONS: Record<UserRole, AdminTab[]> = {
  admin: [],
  rh: [
    "dashboard", "employees", "records", "justifications", "documentos",
    "solicitacoes", "avisos", "documentos-assinatura", "ouvidoria", "onboarding", "agenda", "aprovacoes-lote",
    "exportacoes", "analises", "historico", "assistente", "mapa-localizacao",
    "payroll-dashboard", "espelho-ponto", "banco-horas", "payslips",
    "payroll-closing", "payroll-settings", "trabalhista-config", "simulador",
    "decimo-terceiro", "rescisao", "adiantamentos",
    "centro-operacoes", "panorama", "calendario-ausencias",
  ],
  supervisor: [
    "dashboard", "records", "employees", "centro-operacoes", "panorama",
    "analises", "historico", "exportacoes", "mapa-localizacao",
  ],
  operacional: ["dashboard", "records"],
};

/**
 * Aplica a permissão do papel e, se houver busca ativa, o filtro de texto.
 * Usado por todos os grupos do menu pra decidir o que mostrar.
 */
function filterForSearch<T extends { key: AdminTab; label: string }>(
  items: T[],
  allowedTabs: AdminTab[] | undefined,
  query: string
): T[] {
  const visible = allowedTabs ? items.filter((i) => allowedTabs.includes(i.key)) : items;
  if (!query) return visible;
  return visible.filter((i) => normalizeSearchText(i.label).includes(query));
}

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
  { key: "documentos-assinatura" as const, label: "Documentos p/ Assinatura", icon: FileSignature },
  { key: "ouvidoria" as const, label: "Ouvidoria", icon: MessageSquareWarning },
  { key: "onboarding" as const, label: "Onboarding", icon: Users },
  { key: "documentos" as const, label: "Documentos", icon: FolderOpen },
  { key: "agenda" as const, label: "Agenda", icon: Calendar },
  { key: "mapa-localizacao" as const, label: "Mapa de Localização", icon: MapPin },
  { key: "organograma" as const, label: "Organograma", icon: Users },
  { key: "cobertura" as const, label: "Cobertura de Ausências", icon: Calendar },
  { key: "calendario-ausencias" as const, label: "Calendário de Ausências", icon: Calendar },
];

const relatoriosItems = [
  { key: "analises" as const, label: "Análises", icon: BarChart2 },
  { key: "historico" as const, label: "Histórico", icon: History },
  { key: "exportacoes" as const, label: "Exportações", icon: FileDown },
  { key: "aprovacoes-lote" as const, label: "Aprovações em Lote", icon: CheckCircle2 },
  { key: "assistente" as const, label: "Assistente IA", icon: Sparkles },
  { key: "anomalias" as const, label: "Detector de Anomalias", icon: AlertTriangle },
  { key: "mapa-calor" as const, label: "Mapa de Calor", icon: BarChart2 },
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
  { key: "decimo-terceiro" as const, label: "13º Salário", icon: Receipt },
  { key: "rescisao" as const, label: "Rescisão", icon: FileText },
  { key: "adiantamentos" as const, label: "Adiantamentos", icon: Wallet },
  { key: "payroll-settings" as const, label: "Parâmetros", icon: SettingsIcon },
  { key: "trabalhista-config" as const, label: "Regras CLT", icon: FileText },
  { key: "simulador" as const, label: "Simulador", icon: Calculator },
];

const systemItems = [
  { key: "users" as const, label: "Usuários", icon: Users },
  { key: "audit" as const, label: "Auditoria", icon: Shield },
  { key: "debug" as const, label: "Logs", icon: Activity },
  { key: "permissoes" as const, label: "Permissões", icon: Shield },
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

function CollapsibleGroup({ label, icon: Icon, children, defaultOpen, collapsed, badge, forceOpen, hidden }: {
  label: string; icon: any; children: React.ReactNode; defaultOpen?: boolean; collapsed: boolean; badge?: number;
  forceOpen?: boolean; hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <SidebarGroup>
      {/* A key muda quando a busca liga/desliga, forçando o Collapsible a
          remontar já aberto (ou voltar ao estado padrão) sem precisar
          controlar o "open" manualmente. */}
      <Collapsible key={forceOpen ? "search-open" : "default"} defaultOpen={forceOpen || defaultOpen}>
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
  admin:       { label: "Administrador", color: BRAND.blue, bg: "#eff6ff" },
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

  const [menuSearch, setMenuSearch] = useState("");
  const searchQuery = normalizeSearchText(menuSearch);
  const isSearchingMenu = searchQuery.length > 0;

  const filteredPrincipal = useMemo(() => filterForSearch(principalItems, allowedTabs, searchQuery), [allowedTabs, searchQuery]);
  const filteredPessoas = useMemo(() => filterForSearch(pessoasItems, allowedTabs, searchQuery), [allowedTabs, searchQuery]);
  const filteredRelatorios = useMemo(() => filterForSearch(relatoriosItems, allowedTabs, searchQuery), [allowedTabs, searchQuery]);
  const filteredPayroll = useMemo(() => filterForSearch(payrollItems, allowedTabs, searchQuery), [allowedTabs, searchQuery]);
  const filteredSystem = useMemo(() => filterForSearch(systemItems, undefined, searchQuery), [searchQuery]);
  const filteredEpi = useMemo(() => filterForSearch(patrimonioEpiItems, undefined, searchQuery), [searchQuery]);
  const filteredUniform = useMemo(() => filterForSearch(patrimonioUniformItems, undefined, searchQuery), [searchQuery]);
  const filteredTools = useMemo(() => filterForSearch(patrimonioToolItems, undefined, searchQuery), [searchQuery]);
  const patrimonioHasMatch = filteredEpi.length > 0 || filteredUniform.length > 0 || filteredTools.length > 0;

  const isPessoasActive = [
    "justifications","documentos","aprovacoes-lote","solicitacoes",
    "agenda","avisos","onboarding","mapa-localizacao","calendario-ausencias",
    "cobertura","organograma","documentos-assinatura","ouvidoria",
  ].includes(activeTab);
  const isRelatoriosActive = ["analises","historico","exportacoes","assistente","aprovacoes-lote","anomalias","mapa-calor"].includes(activeTab);
  const isPatrimonioActive = activeTab.startsWith("epi-") || activeTab.startsWith("uniforms-") || activeTab.startsWith("tools-");
  const isPayrollActive = activeTab.startsWith("payroll") || ["payslips","banco-horas","trabalhista-config","simulador","espelho-ponto","decimo-terceiro","rescisao","adiantamentos"].includes(activeTab);

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
                style={{ background: BRAND.gradient }}>
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
            style={{ background: BRAND.gradient }}>
            {initials}
          </div>
        )}
      </SidebarHeader>

      {!collapsed && (
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Buscar no menu..."
              className="h-8 pl-8 pr-7 text-xs"
            />
            {menuSearch && (
              <button
                onClick={() => setMenuSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <SidebarContent>
        {/* Principal */}
        {(!isSearchingMenu || filteredPrincipal.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel>Principal</SidebarGroupLabel>
            <SidebarGroupContent>
              <MenuGroup items={filteredPrincipal} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Pessoas & Gestão */}
        <CollapsibleGroup label="Pessoas & Gestão" icon={Users} defaultOpen={isPessoasActive} collapsed={collapsed} badge={solicitacoesPendentes}
          forceOpen={isSearchingMenu} hidden={isSearchingMenu && filteredPessoas.length === 0}>
          <MenuGroup items={filteredPessoas} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} badges={pessoasBadges} />
        </CollapsibleGroup>

        {/* Relatórios & IA */}
        <CollapsibleGroup label="Relatórios & IA" icon={Brain} defaultOpen={isRelatoriosActive} collapsed={collapsed}
          forceOpen={isSearchingMenu} hidden={isSearchingMenu && filteredRelatorios.length === 0}>
          <MenuGroup items={filteredRelatorios} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
        </CollapsibleGroup>

        {/* Patrimônio */}
        {(allowedTabs === undefined) && (
          <CollapsibleGroup label="Patrimônio" icon={HardHat} defaultOpen={isPatrimonioActive} collapsed={collapsed}
            forceOpen={isSearchingMenu} hidden={isSearchingMenu && !patrimonioHasMatch}>
            {filteredEpi.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-muted-foreground px-3 pt-2 pb-1">EPIs</p>
                <MenuGroup items={filteredEpi} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
              </>
            )}
            {filteredUniform.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-muted-foreground px-3 pt-2 pb-1">Uniformes</p>
                <MenuGroup items={filteredUniform} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
              </>
            )}
            {filteredTools.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-muted-foreground px-3 pt-2 pb-1">Ferramentas</p>
                <MenuGroup items={filteredTools} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
              </>
            )}
          </CollapsibleGroup>
        )}

        {/* Folha de Pagamento */}
        <CollapsibleGroup label="Folha de Pagamento" icon={DollarSign} defaultOpen={isPayrollActive} collapsed={collapsed}
          forceOpen={isSearchingMenu} hidden={isSearchingMenu && filteredPayroll.length === 0}>
          <MenuGroup items={filteredPayroll} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
        </CollapsibleGroup>

        {/* Sistema */}
        {isAdmin && (!isSearchingMenu || filteredSystem.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel>Sistema</SidebarGroupLabel>
            <SidebarGroupContent>
              <MenuGroup items={filteredSystem} activeTab={activeTab} onTabChange={onTabChange} collapsed={collapsed} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isSearchingMenu &&
          filteredPrincipal.length === 0 && filteredPessoas.length === 0 && filteredRelatorios.length === 0 &&
          !patrimonioHasMatch && filteredPayroll.length === 0 && filteredSystem.length === 0 && (
            <p className="px-4 py-6 text-xs text-center text-muted-foreground">Nenhum item encontrado.</p>
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