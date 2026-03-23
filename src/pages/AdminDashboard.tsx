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
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

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
  const [newPunchMode, setNewPunchMode] = useState<"full" | "simple">("full");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [tab, setTab] = useState<"employees" | "records">("employees");

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
      .insert({ name: newName.trim(), punch_mode: newPunchMode } as any);
    if (error) {
      toast.error("Erro ao adicionar funcionário");
    } else {
      toast.success("Funcionário adicionado!");
      setNewName("");
      setNewPunchMode("full");
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
        </div>

        {tab === "employees" && (
          <>
            <form onSubmit={addEmployee} className="flex gap-2 mb-4">
              <Input
                placeholder="Nome do funcionário"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1"
              />
              <select
                value={newPunchMode}
                onChange={(e) => setNewPunchMode(e.target.value as "full" | "simple")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="full">4 registros</option>
                <option value="simple">2 registros</option>
              </select>
              <Button type="submit">
                <Plus className="w-4 h-4" />
              </Button>
            </form>

            <div className="space-y-2">
              {employees.map((emp) => (
                <Card
                  key={emp.id}
                  className="p-4 flex items-center justify-between"
                >
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
                    <span
                      className={`font-medium ${!emp.active ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {emp.name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteEmployee(emp.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs font-medium">
                              {STEP_LABELS[rec.step] || rec.step}
                            </span>
                            <span className="text-foreground tabular-nums">
                              {formatTime(rec.punched_at)}
                            </span>
                          </div>
                          {(rec as any).address ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 max-w-[180px]">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <a
                                href={`https://maps.google.com/?q=${rec.latitude},${rec.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate hover:text-foreground transition-colors"
                              >
                                {(rec as any).address}
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
      </div>
    </div>
  );
}
