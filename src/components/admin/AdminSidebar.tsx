import {
  Users, Clock, FileText, HardHat, Shield, Activity,
  Package, Truck, AlertTriangle, History, LogOut, ChevronDown,
  DollarSign, Settings as SettingsIcon, Calculator, Receipt, BarChart2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AdminTab =
  | "dashboard"
  | "employees"
  | "records"
  | "justifications"
  | "epi-catalog"
  | "epi-deliveries"
  | "epi-alerts"
  | "epi-history"
  | "payroll-dashboard"
  | "payroll-settings"
  | "banco-horas"
  | "payroll-closing"
  | "payslips"
  | "audit"
  | "debug"
  | "users";

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
}

const mainItems = [
  { key: "dashboard" as const, label: "Dashboard", icon: Activity },
  { key: "employees" as const, label: "Funcionários", icon: Users },
  { key: "records" as const, label: "Registros", icon: Clock },
  { key: "justifications" as const, label: "Atestados", icon: FileText },
];

const epiItems = [
  { key: "epi-catalog" as const, label: "Catálogo", icon: Package },
  { key: "epi-deliveries" as const, label: "Entregas", icon: Truck },
  { key: "epi-alerts" as const, label: "Alertas", icon: AlertTriangle },
  { key: "epi-history" as const, label: "Histórico", icon: History },
];

const payrollItems = [
  { key: "payroll-dashboard" as const, label: "Dashboard", icon: BarChart2 },
  { key: "payroll-settings" as const, label: "Configurações", icon: SettingsIcon },
  { key: "payroll-closing" as const, label: "Fechamento", icon: Calculator },
  { key: "payslips" as const, label: "Holerites", icon: Receipt },
  { key: "banco-horas" as const, label: "Banco de Horas", icon: Clock },
];

const systemItems = [
  { key: "users" as const, label: "Usuários", icon: Users },
  { key: "audit" as const, label: "Auditoria", icon: Shield },
  { key: "debug" as const, label: "Logs", icon: Activity },
];

export default function AdminSidebar({ activeTab, onTabChange, onLogout }: Props) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const isEpiActive = activeTab.startsWith("epi-");

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        {!collapsed && (
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Painel Admin
          </h2>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* Main */}
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={activeTab === item.key}
                    onClick={() => onTabChange(item.key)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && <span>{item.label}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* EPIs */}
        <SidebarGroup>
          <Collapsible defaultOpen={isEpiActive}>
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="flex items-center justify-between w-full cursor-pointer hover:text-foreground transition-colors">
                <span className="flex items-center gap-2">
                  <HardHat className="h-4 w-4" />
                  {!collapsed && "EPIs"}
                </span>
                {!collapsed && <ChevronDown className="h-3 w-3" />}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {epiItems.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={activeTab === item.key}
                        onClick={() => onTabChange(item.key)}
                        tooltip={item.label}
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Folha de Pagamento */}
        <SidebarGroup>
          <Collapsible defaultOpen={activeTab.startsWith("payroll") || activeTab === "payslips"}>
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="flex items-center justify-between w-full cursor-pointer hover:text-foreground transition-colors">
                <span className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {!collapsed && "Folha de Pagamento"}
                </span>
                {!collapsed && <ChevronDown className="h-3 w-3" />}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {payrollItems.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={activeTab === item.key}
                        onClick={() => onTabChange(item.key)}
                        tooltip={item.label}
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* System */}
        <SidebarGroup>
          <SidebarGroupLabel>Sistema</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={activeTab === item.key}
                    onClick={() => onTabChange(item.key)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && <span>{item.label}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
