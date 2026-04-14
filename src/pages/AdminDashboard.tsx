import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  LogOut, Plus, Trash2, Users, Clock, ToggleLeft, ToggleRight,
  Pencil, Download, X, Check, Sun, Moon, Activity, FileText, Shield, HardHat,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { generateMonthlyReport, generateMonthlyExcel } from "@/lib/generateReport";
import JustificationsTab from "@/components/admin/JustificationsTab";
import DashboardTab from "@/components/admin/DashboardTab";
import RecordsTab from "@/components/admin/RecordsTab";
import AuditTab from "@/components/admin/AuditTab";
import DebugLogsTab from "@/components/admin/DebugLogsTab";
import EpiTab from "@/components/admin/EpiTab";

type Employee = Tables<"employees">;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newName, setNewName] = useState("");
  const [newCpf, setNewCpf] = useState("");
  const [newPunchMode, setNewPunchMode] = useState<"full" | "simple">("full");
  const [newShift, setNewShift] = useState<"diurno" | "noturno">("diurno");
  const [tab, setTab] = useState<"dashboard" | "employees" | "records" | "justifications" | "audit" | "epi" | "debug">("dashboard");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editPunchMode, setEditPunchMode] = useState<"full" | "simple">("full");
  const [editShift, setEditShift] = useState<"diurno" | "noturno">("diurno");
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [authReady, setAuthReady] = useState(false);

  // Auth check with proper loading
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/admin/login");
      else setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/admin/login");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (authReady) fetchEmployees();
  }, [authReady]);

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*").order("name");
    if (data) setEmployees(data);
  };

  const addEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await supabase
      .from("employees")
      .insert({ name: newName.trim(), punch_mode: newPunchMode, cpf: newCpf.trim() || null, shift: newShift } as any);
    if (error) { toast.error("Erro ao adicionar funcionário"); return; }
    toast.success("Funcionário adicionado!");
    setNewName(""); setNewCpf(""); setNewPunchMode("full"); setNewShift("diurno");
    fetchEmployees();
  };

  const startEditing = (emp: Employee) => {
    setEditingId(emp.id);
    setEditName(emp.name);
    setEditCpf((emp as any).cpf || "");
    setEditPunchMode(emp.punch_mode === "simple" ? "simple" : "full");
    setEditShift((emp as any).shift === "noturno" ? "noturno" : "diurno");
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const { error } = await supabase
      .from("employees")
      .update({ name: editName.trim(), cpf: editCpf.trim() || null, punch_mode: editPunchMode, shift: editShift } as any)
      .eq("id", editingId);
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
    await supabase.auth.signOut();
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

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Carregando painel...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "dashboard" as const, label: "Dashboard", icon: Activity },
    { key: "employees" as const, label: "Funcionários", icon: Users },
    { key: "records" as const, label: "Registros", icon: Clock },
    { key: "justifications" as const, label: "Atestados", icon: FileText },
    { key: "epi" as const, label: "EPIs", icon: HardHat },
    { key: "audit" as const, label: "Auditoria", icon: Shield },
    { key: "debug" as const, label: "🔍 Logs", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground">Painel Admin</h1>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4 mr-1" /> Sair
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <Button key={t.key} variant={tab === t.key ? "default" : "outline"} size="sm"
              onClick={() => setTab(t.key)} className="flex-shrink-0">
              <t.icon className="w-4 h-4 mr-1" /> {t.label}
            </Button>
          ))}
        </div>

        {tab === "dashboard" && <DashboardTab />}
        {tab === "records" && <RecordsTab employees={employees} />}
        {tab === "justifications" && <JustificationsTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "debug" && <DebugLogsTab />}

        {tab === "employees" && (
          <>
            <form onSubmit={addEmployee} className="space-y-2 mb-4">
              <div className="flex gap-2">
                <Input placeholder="Nome do funcionário" value={newName}
                  onChange={(e) => setNewName(e.target.value)} className="flex-1" />
                <Button type="submit"><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="flex gap-2">
                <Input placeholder="CPF (opcional)" value={newCpf}
                  onChange={(e) => setNewCpf(formatCpf(e.target.value))} className="flex-1" maxLength={14} />
                <select value={newPunchMode} onChange={(e) => setNewPunchMode(e.target.value as any)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="full">4 reg.</option>
                  <option value="simple">2 reg.</option>
                </select>
                <select value={newShift} onChange={(e) => setNewShift(e.target.value as any)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="diurno">☀ Diurno</option>
                  <option value="noturno">🌙 Noturno</option>
                </select>
              </div>
            </form>

            {/* Report download */}
            <div className="flex items-center gap-2 mb-4">
              <Input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="w-40" />
              <span className="text-xs text-muted-foreground">Relatório mensal</span>
            </div>

            <div className="space-y-2">
              {employees.map((emp) => (
                <Card key={emp.id} className="p-4">
                  {editingId === emp.id ? (
                    <div className="space-y-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome" />
                      <div className="flex gap-2">
                        <Input value={editCpf} onChange={(e) => setEditCpf(formatCpf(e.target.value))}
                          placeholder="CPF" maxLength={14} className="flex-1" />
                        <select value={editPunchMode} onChange={(e) => setEditPunchMode(e.target.value as any)}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="full">4 reg.</option>
                          <option value="simple">2 reg.</option>
                        </select>
                        <select value={editShift} onChange={(e) => setEditShift(e.target.value as any)}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="diurno">☀ Diurno</option>
                          <option value="noturno">🌙 Noturno</option>
                        </select>
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
              ))}
              {employees.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum funcionário cadastrado</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
