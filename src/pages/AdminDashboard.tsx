import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  LogOut,
  Plus,
  Trash2,
  Users,
  Clock,
  MapPin,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Download,
  X,
  Check,
  Camera,
  Sun,
  Moon,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { generateMonthlyReport } from "@/lib/generateReport";
import JustificationsTab from "@/components/admin/JustificationsTab";

type Employee = Tables<"employees">;
type PunchRecord = Tables<"punch_records"> & { employees?: { name: string } };

const STEP_LABELS: Record<string, string> = {
  entrada: "Entrada",
  intervalo: "Intervalo",
  retorno: "Retorno",
  saida: "Saída",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<PunchRecord[]>([]);
  const [newName, setNewName] = useState("");
  const [newCpf, setNewCpf] = useState("");
  const [newPunchMode, setNewPunchMode] = useState<"full" | "simple">("full");
  const [newShift, setNewShift] = useState<"diurno" | "noturno">("diurno");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [tab, setTab] = useState<"employees" | "records" | "justifications">("employees");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editPunchMode, setEditPunchMode] = useState<"full" | "simple">("full");
  const [editShift, setEditShift] = useState<"diurno" | "noturno">("diurno");
  const [reportMonth, setReportMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) navigate("/admin/login");
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) navigate("/admin/login");
      }
    );
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [selectedDate]);

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from("employees")
      .select("*")
      .order("name");
    if (data) setEmployees(data);
  };

  const fetchRecords = async () => {
    const startOfDay = `${selectedDate}T00:00:00`;
    const endOfDay = `${selectedDate}T23:59:59`;
    const { data } = await supabase
      .from("punch_records")
      .select("*, employees(name)")
      .gte("punched_at", startOfDay)
      .lte("punched_at", endOfDay)
      .order("punched_at", { ascending: true });
    if (data) setRecords(data as PunchRecord[]);
  };

  const addEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await supabase
      .from("employees")
      .insert({ name: newName.trim(), punch_mode: newPunchMode, cpf: newCpf.trim() || null, shift: newShift } as any);
    if (error) {
      toast.error("Erro ao adicionar funcionário");
    } else {
      toast.success("Funcionário adicionado!");
      setNewName("");
      setNewCpf("");
      setNewPunchMode("full");
      setNewShift("diurno");
      fetchEmployees();
    }
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
    if (error) {
      toast.error("Erro ao atualizar");
    } else {
      toast.success("Atualizado!");
      setEditingId(null);
      fetchEmployees();
    }
  };

  const toggleEmployee = async (emp: Employee) => {
    await supabase
      .from("employees")
      .update({ active: !emp.active })
      .eq("id", emp.id);
    fetchEmployees();
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm("Tem certeza? Os registros de ponto serão excluídos.")) return;
    await supabase.from("employees").delete().eq("id", id);
    fetchEmployees();
    fetchRecords();
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatCpf = (cpf: string) => {
    const digits = cpf.replace(/\D/g, "").slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };

  const handleDownloadReport = async (emp: Employee) => {
    const [year, month] = reportMonth.split("-").map(Number);
    toast.info("Gerando relatório...");
    try {
      await generateMonthlyReport(emp, year, month);
      toast.success("Relatório baixado!");
    } catch {
      toast.error("Erro ao gerar relatório");
    }
  };

  // Group records by employee
  const groupedRecords = records.reduce(
    (acc, record) => {
      const name = record.employees?.name || "Desconhecido";
      if (!acc[name]) acc[name] = [];
      acc[name].push(record);
      return acc;
    },
    {} as Record<string, PunchRecord[]>
  );

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
        <div className="flex gap-2 mb-6">
          <Button
            variant={tab === "employees" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("employees")}
          >
            <Users className="w-4 h-4 mr-1" /> Funcionários
          </Button>
          <Button
            variant={tab === "records" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("records")}
          >
            <Clock className="w-4 h-4 mr-1" /> Registros
          </Button>
          <Button
            variant={tab === "justifications" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("justifications")}
          >
            <Download className="w-4 h-4 mr-1" /> Atestados
          </Button>
        </div>

        {tab === "employees" && (
          <>
            <form onSubmit={addEmployee} className="space-y-2 mb-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Nome do funcionário"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="CPF (opcional)"
                  value={newCpf}
                  onChange={(e) => setNewCpf(formatCpf(e.target.value))}
                  className="flex-1"
                  maxLength={14}
                />
                <select
                  value={newPunchMode}
                  onChange={(e) => setNewPunchMode(e.target.value as "full" | "simple")}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="full">4 reg.</option>
                  <option value="simple">2 reg.</option>
                </select>
                <select
                  value={newShift}
                  onChange={(e) => setNewShift(e.target.value as "diurno" | "noturno")}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="diurno">☀ Diurno</option>
                  <option value="noturno">🌙 Noturno</option>
                </select>
              </div>
            </form>

            {/* Report download */}
            <div className="flex items-center gap-2 mb-4">
              <Input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="w-40"
              />
              <span className="text-xs text-muted-foreground">Relatório mensal</span>
            </div>

            <div className="space-y-2">
              {employees.map((emp) => (
                <Card key={emp.id} className="p-4">
                  {editingId === emp.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nome"
                      />
                      <div className="flex gap-2">
                        <Input
                          value={editCpf}
                          onChange={(e) => setEditCpf(formatCpf(e.target.value))}
                          placeholder="CPF"
                          maxLength={14}
                          className="flex-1"
                        />
                        <select
                          value={editPunchMode}
                          onChange={(e) => setEditPunchMode(e.target.value as "full" | "simple")}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="full">4 reg.</option>
                          <option value="simple">2 reg.</option>
                        </select>
                        <select
                          value={editShift}
                          onChange={(e) => setEditShift(e.target.value as "diurno" | "noturno")}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="diurno">☀ Diurno</option>
                          <option value="noturno">🌙 Noturno</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit}>
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
                        <button
                          onClick={() => toggleEmployee(emp)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title={emp.active ? "Desativar" : "Ativar"}
                        >
                          {emp.active ? (
                            <ToggleRight className="w-5 h-5 text-success" />
                          ) : (
                            <ToggleLeft className="w-5 h-5" />
                          )}
                        </button>
                        <div>
                          <span
                            className={`font-medium ${!emp.active ? "text-muted-foreground line-through" : "text-foreground"}`}
                          >
                            {emp.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {emp.punch_mode === "simple" ? "2 reg." : "4 reg."}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              {(emp as any).shift === "noturno" ? (
                                <><Moon className="w-3 h-3" /> Noturno</>
                              ) : (
                                <><Sun className="w-3 h-3" /> Diurno</>
                              )}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadReport(emp)}
                          title="Baixar relatório"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(emp)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteEmployee(emp.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              {employees.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum funcionário cadastrado
                </p>
              )}
            </div>
          </>
        )}

        {tab === "records" && (
          <>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mb-4 w-48"
            />

            {Object.keys(groupedRecords).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum registro nesta data
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedRecords).map(([name, recs]) => (
                  <Card key={name} className="p-4">
                    <h3 className="font-semibold text-foreground mb-3">
                      {name}
                    </h3>
                    <div className="space-y-2">
                      {recs.map((rec) => (
                        <div
                          key={rec.id}
                          className="flex items-start justify-between text-sm gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs font-medium">
                              {STEP_LABELS[rec.step] || rec.step}
                            </span>
                            <span className="text-foreground tabular-nums">
                              {formatTime(rec.punched_at)}
                            </span>
                            {(rec as any).photo_url && (
                              <a
                                href={(rec as any).photo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 transition-colors"
                                title="Ver foto"
                              >
                                <Camera className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          {rec.address ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 max-w-[180px]">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <a
                                href={`https://maps.google.com/?q=${rec.latitude},${rec.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate hover:text-foreground transition-colors"
                              >
                                {rec.address}
                              </a>
                            </span>
                          ) : rec.latitude && rec.longitude ? (
                            <a
                              href={`https://maps.google.com/?q=${rec.latitude},${rec.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <MapPin className="w-4 h-4" />
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "justifications" && <JustificationsTab />}
      </div>
    </div>
  );
}
