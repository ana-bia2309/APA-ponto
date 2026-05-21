import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Plus, Trash2, ToggleLeft, ToggleRight,
  Pencil, Download, X, Check, Sun, Moon, Clock,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { generateMonthlyReport, generateMonthlyExcel } from "@/lib/generateReport";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AdminSidebar, { type AdminTab } from "@/components/admin/AdminSidebar";
import JustificationsTab from "@/components/admin/JustificationsTab";
import DashboardTab from "@/components/admin/DashboardTab";
import RecordsTab from "@/components/admin/RecordsTab";
import AuditTab from "@/components/admin/AuditTab";
import DebugLogsTab from "@/components/admin/DebugLogsTab";
import EpiTab from "@/components/admin/EpiTab";
import UsersTab from "@/components/admin/UsersTab";
import PayrollSettingsTab from "@/components/admin/payroll/PayrollSettingsTab";
import PayrollClosingTab from "@/components/admin/payroll/PayrollClosingTab";
import PayrollDashboardTab from "@/components/admin/payroll/PayrollDashboardTab";
import PayslipsTab from "@/components/admin/payroll/PayslipsTab";
import { useAuth } from "@/hooks/useAuth";

type Employee = Tables<"employees">;

// Map sidebar tab to page title
const tabTitles: Record<AdminTab, string> = {
  dashboard: "Dashboard",
  employees: "Funcionários",
  records: "Registros de Ponto",
  justifications: "Atestados",
  "epi-catalog": "EPIs — Catálogo",
  "epi-deliveries": "EPIs — Entregas",
  "epi-alerts": "EPIs — Alertas",
  "epi-history": "EPIs — Histórico",
  "payroll-dashboard": "Folha — Dashboard",
  "payroll-settings": "Folha — Configurações Salariais",
  "payroll-closing": "Folha — Fechamento",
  payslips: "Folha — Holerites",
  audit: "Auditoria",
  debug: "Logs do Sistema",
  users: "Gerenciar Usuários",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newName, setNewName] = useState("");
  const [newCpf, setNewCpf] = useState("");
  const [newPunchMode, setNewPunchMode] = useState<"full" | "simple">("full");
  const [newShift, setNewShift] = useState<"diurno" | "noturno">("diurno");
  const [newEscala, setNewEscala] = useState<string>("padrao");
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editPunchMode, setEditPunchMode] = useState<"full" | "simple">("full");
  const [editShift, setEditShift] = useState<"diurno" | "noturno">("diurno");
  const [editEscala, setEditEscala] = useState<string>("padrao");
  const [newCargo, setNewCargo] = useState("");
  const [newMatricula, setNewMatricula] = useState("");
  const [newDepartamento, setNewDepartamento] = useState("");
  const [editCargo, setEditCargo] = useState("");
  const [editMatricula, setEditMatricula] = useState("");
  const [editDepartamento, setEditDepartamento] = useState("");
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [employeeSearch, setEmployeeSearch] = useState("");

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*").order("name");
    if (data) setEmployees(data);
  };

  const addEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await supabase.from("employees").insert({
      name: newName.trim(), punch_mode: newPunchMode, cpf: newCpf.trim() || null, shift: newShift,
      cargo: newCargo.trim(), matricula: newMatricula.trim(), departamento: newDepartamento.trim(),
      escala: newEscala,
    } as any);
    if (error) { toast.error("Erro ao adicionar funcionário"); return; }
    toast.success("Funcionário adicionado!");
    setNewName(""); setNewCpf(""); setNewPunchMode("full"); setNewShift("diurno"); setNewEscala("padrao");
    setNewCargo(""); setNewMatricula(""); setNewDepartamento("");
    fetchEmployees();
  };

  const startEditing = (emp: Employee) => {
    setEditingId(emp.id);
    setEditName(emp.name);
    setEditCpf((emp as any).cpf || "");
    setEditPunchMode(emp.punch_mode === "simple" ? "simple" : "full");
    setEditShift((emp as any).shift === "noturno" ? "noturno" : "diurno");
    setEditEscala((emp as any).escala || "padrao");
    setEditCargo((emp as any).cargo || "");
    setEditMatricula((emp as any).matricula || "");
    setEditDepartamento((emp as any).departamento || "");
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const { error } = await supabase.from("employees").update({
      name: editName.trim(), cpf: editCpf.trim() || null, punch_mode: editPunchMode, shift: editShift,
      cargo: editCargo.trim(), matricula: editMatricula.trim(), departamento: editDepartamento.trim(),
      escala: editEscala,
    } as any).eq("id", editingId);
    if (error) { toast.error("Erro ao atualizar"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      admin_user_id: user?.id, action: "update_employee", target_type: "employees",
      target_id: editingId, details: { name: editName.trim() },
    } as any);
    toast.success("Atualizado!");
    setEditingId(null);
    fetchEmployees();
  };

  const toggleEmployee = async (emp: Employee) => {
    await supabase.from("employees").update({ active: !emp.active }).eq("id", emp.id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      admin_user_id: user?.id, action: "toggle_employee", target_type: "employees",
      target_id: emp.id, details: { name: emp.name, active: !emp.active },
    } as any);
    fetchEmployees();
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm("Tem certeza? Os registros de ponto serão excluídos.")) return;
    try {
      const emp = employees.find(e => e.id === id);
      await supabase.from("time_records").delete().eq("employee_id", id);
      await supabase.from("punch_records").delete().eq("employee_id", id);
      await supabase.from("manual_punches").delete().eq("employee_id", id);
      await supabase.from("absence_justifications").delete().eq("employee_id", id);
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) { toast.error("Erro ao excluir: " + error.message); return; }
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_logs").insert({
        admin_user_id: user?.id, action: "delete_employee", target_type: "employees",
        target_id: id, details: { name: emp?.name },
      } as any);
      toast.success("Funcionário excluído!");
      fetchEmployees();
    } catch { toast.error("Erro ao excluir funcionário."); }
  };

  const logout = async () => {
    await signOut();
    navigate("/admin/login");
  };

  const formatCpf = (cpf: string) => {
    const digits = cpf.replace(/\D/g, "").slice(0, 11);
    return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };

  const handleDownloadReport = async (emp: Employee, format: "pdf" | "excel" = "pdf") => {
    const [year, month] = reportMonth.split("-").map(Number);
    toast.info("Gerando relatório...");
    try {
      if (format === "excel") await generateMonthlyExcel(emp, year, month);
      else await generateMonthlyReport(emp, year, month);
      toast.success("Relatório baixado!");
    } catch { toast.error("Erro ao gerar relatório"); }
  };

  const epiSubTab = tab.startsWith("epi-") ? tab.replace("epi-", "") as "catalog" | "deliveries" | "alerts" | "history" : undefined;
  const showEpi = tab.startsWith("epi-");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar activeTab={tab} onTabChange={setTab} onLogout={logout} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-14 flex items-center justify-between border-b border-border px-4 lg:px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold text-foreground truncate">
                {tabTitles[tab]}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
                className="gap-1.5"
                title="Voltar para registrar ponto"
              >
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">Modo Funcionário</span>
              </Button>
              <span className="hidden md:inline text-xs text-muted-foreground ml-2">{profile?.full_name || user?.email}</span>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 p-4 lg:p-6 overflow-auto">
            <div className="max-w-5xl mx-auto">
              {tab === "dashboard" && <DashboardTab />}
              {tab === "records" && <RecordsTab employees={employees} />}
              {tab === "justifications" && <JustificationsTab />}
              {showEpi && <EpiTab employees={employees} activeSubTab={epiSubTab} />}
              {tab === "payroll-dashboard" && <PayrollDashboardTab />}
              {tab === "payroll-settings" && <PayrollSettingsTab employees={employees} />}
              {tab === "payroll-closing" && <PayrollClosingTab employees={employees} />}
              {tab === "payslips" && <PayslipsTab />}
              {tab === "audit" && <AuditTab />}
              {tab === "debug" && <DebugLogsTab />}
              {tab === "users" && <UsersTab />}

              {tab === "employees" && (
                <div className="space-y-6">
                  {/* Add employee form */}
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Novo Funcionário</h3>
                    <form onSubmit={addEmployee} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <Input placeholder="Nome do funcionário *" value={newName}
                          onChange={(e) => setNewName(e.target.value)} />
                        <Input placeholder="CPF (opcional)" value={newCpf}
                          onChange={(e) => setNewCpf(formatCpf(e.target.value))} maxLength={14} />
                        <Input placeholder="Cargo" value={newCargo} onChange={(e) => setNewCargo(e.target.value)} />
                        <Input placeholder="Matrícula" value={newMatricula} onChange={(e) => setNewMatricula(e.target.value)} />
                        <Input placeholder="Departamento" value={newDepartamento} onChange={(e) => setNewDepartamento(e.target.value)} />
                        <div className="flex gap-2">
                          <select value={newPunchMode} onChange={(e) => setNewPunchMode(e.target.value as any)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm flex-1">
                            <option value="full">4 registros</option>
                            <option value="simple">2 registros</option>
                          </select>
                          <select value={newShift} onChange={(e) => setNewShift(e.target.value as any)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm flex-1">
                            <option value="diurno">☀ Diurno</option>
                            <option value="noturno">🌙 Noturno</option>
                          </select>
                          <select value={newEscala} onChange={(e) => setNewEscala(e.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm flex-1">
                            <option value="padrao">Escala Padrão</option>
                            <option value="12x36">12×36</option>
                          </select>
                        </div>
                      </div>
                      <Button type="submit" className="w-full sm:w-auto">
                        <Plus className="w-4 h-4 mr-2" /> Adicionar Funcionário
                      </Button>
                    </form>
                  </Card>

                  {/* Report */}
                  <div className="flex items-center gap-3">
                    <Input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="w-44" />
                    <span className="text-xs text-muted-foreground">Mês do relatório</span>
                  </div>

                  {/* Employee search */}
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="Buscar por nome, CPF ou matrícula..."
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      className="max-w-md"
                    />
                    {employeeSearch && (
                      <Button variant="ghost" size="sm" onClick={() => setEmployeeSearch("")}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {(() => {
                        const filtered = employees.filter(emp => {
                          const search = employeeSearch.toLowerCase().trim();
                          if (!search) return true;
                          const nameMatch = emp.name.toLowerCase().includes(search);
                          const cpfMatch = (emp as any).cpf?.toLowerCase().includes(search.replace(/\D/g, ""));
                          const matriculaMatch = (emp as any).matricula?.toLowerCase().includes(search);
                          return nameMatch || cpfMatch || matriculaMatch;
                        });
                        return `${filtered.length} funcionário${filtered.length !== 1 ? 's' : ''}`;
                      })()}
                    </span>
                  </div>

                  {/* Employee list */}
                  <div className="space-y-2">
                    {(() => {
                      const filteredEmployees = employees.filter(emp => {
                        const search = employeeSearch.toLowerCase().trim();
                        if (!search) return true;
                        const nameMatch = emp.name.toLowerCase().includes(search);
                        const cpfMatch = (emp as any).cpf?.replace(/\D/g, "").includes(search.replace(/\D/g, ""));
                        const matriculaMatch = (emp as any).matricula?.toLowerCase().includes(search);
                        return nameMatch || cpfMatch || matriculaMatch;
                      });
                      
                      return filteredEmployees.length > 0 ? filteredEmployees.map((emp) => (
                      <Card key={emp.id} className="p-4">
                        {editingId === emp.id ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome" />
                              <Input value={editCpf} onChange={(e) => setEditCpf(formatCpf(e.target.value))}
                                placeholder="CPF" maxLength={14} />
                              <Input value={editCargo} onChange={(e) => setEditCargo(e.target.value)} placeholder="Cargo" />
                              <Input value={editMatricula} onChange={(e) => setEditMatricula(e.target.value)} placeholder="Matrícula" />
                              <Input value={editDepartamento} onChange={(e) => setEditDepartamento(e.target.value)} placeholder="Departamento" />
                              <div className="flex gap-2">
                                <select value={editPunchMode} onChange={(e) => setEditPunchMode(e.target.value as any)}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm flex-1">
                                  <option value="full">4 reg.</option>
                                  <option value="simple">2 reg.</option>
                                </select>
                                <select value={editShift} onChange={(e) => setEditShift(e.target.value as any)}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm flex-1">
                                  <option value="diurno">☀ Diurno</option>
                                  <option value="noturno">🌙 Noturno</option>
                                </select>
                                <select value={editEscala} onChange={(e) => setEditEscala(e.target.value)}
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm flex-1">
                                  <option value="padrao">Padrão</option>
                                  <option value="12x36">12×36</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={saveEdit}><Check className="w-4 h-4 mr-1" /> Salvar</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                                <X className="w-4 h-4 mr-1" /> Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <button onClick={() => toggleEmployee(emp)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={emp.active ? "Desativar" : "Ativar"}>
                                {emp.active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                              </button>
                              <div>
                                <span className={`font-medium ${!emp.active ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                  {emp.name}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground">
                                    {emp.punch_mode === "simple" ? "2 reg." : "4 reg."}
                                  </span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    {(emp as any).shift === "noturno" ? <><Moon className="w-3 h-3" /> Noturno</> : <><Sun className="w-3 h-3" /> Diurno</>}
                                  </span>
                                  {(emp as any).escala && (emp as any).escala !== "padrao" && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                                      {(emp as any).escala === "12x36" ? "12×36" : (emp as any).escala}
                                    </span>
                                  )}
                                </div>
                                {(emp as any).cpf && (
                                  <p className="text-xs text-muted-foreground">
                                    CPF: {(emp as any).cpf.replace(/^(\d{3})\.\d{3}\.\d{3}-(\d{2})$/, "$1.***.***-$2").replace(/^(\d{3})\d{6}(\d{2})$/, "$1******$2")}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleDownloadReport(emp, "pdf")} title="PDF">
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDownloadReport(emp, "excel")} title="Excel"
                                className="text-emerald-500 hover:text-emerald-400">
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => startEditing(emp)} title="Editar">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => deleteEmployee(emp.id)}
                                className="text-destructive hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    )) : (
                      <p className="text-center text-muted-foreground py-8">
                        {employeeSearch ? "Nenhum funcionário encontrado para esta busca" : "Nenhum funcionário cadastrado"}
                      </p>
                    );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
