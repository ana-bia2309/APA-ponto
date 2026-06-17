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
  Sparkles,
  BriefcaseMedical, Palmtree,
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
import BancoHorasTab from "@/components/admin/payroll/BancoHorasTab";
import TrabalhistaConfigTab from "@/components/admin/payroll/TrabalhistaConfigTab";
import DocumentosTab from "@/components/admin/DocumentosTab";
import PayslipsTab from "@/components/admin/payroll/PayslipsTab";
import AssistenteIA from "@/components/admin/AssistenteIA";
import UniformsTab from "@/components/admin/UniformsTab";
import ToolsTab from "@/components/admin/ToolsTab";
import MapaLocalizacaoTab from "@/components/admin/MapaLocalizacaoTab";
import ExportacoesTab from "@/components/admin/ExportacoesTab";
import EspelhoPontoTab from "@/components/admin/payroll/EspelhoPontoTab";
import SimuladorFolhaTab from "@/components/admin/payroll/SimuladorFolhaTab";
import DecimoTerceiroTab from "@/components/admin/payroll/DecimoTerceiroTab";
import RescisaoTab from "@/components/admin/payroll/RescisaoTab";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import AprovacoesLoteTab from "@/components/admin/AprovacoesLoteTab";
import AnalisesTab from "@/components/admin/AnalisesTab";
import BuscaGlobal from "@/components/admin/BuscaGlobal";
import { Search } from "lucide-react";
import HistoricoTab from "@/components/admin/HistoricoTab";
import EmployeeForm from "@/components/admin/EmployeeForm";
import AgendaTab from "@/components/admin/AgendaTab";
import SolicitacoesTab from "@/components/admin/SolicitacoesTab";
import AvisosTab from "@/components/admin/AvisosTab";
import CentroOperacoesTab from "@/components/admin/CentroOperacoesTab";
import PanoramaTab from "@/components/admin/PanoramaTab";
import OnboardingTab from "@/components/admin/OnboardingTab";
import PermissoesTab from "@/components/admin/PermissoesTab";
import AnomaliaTab from "@/components/admin/AnomaliaTab";
import MapaCalorTab from "@/components/admin/MapaCalorTab";
import OrganogramaTab from "@/components/admin/OrganogramaTab";
import CoberturaTab from "@/components/admin/CoberturaTab";
import TourGuiado from "@/components/admin/TourGuiado";
import AfastamentosModal from "@/components/admin/AfastamentosModal";
import CalendarioAusenciasTab from "@/components/admin/CalendarioAusenciasTab";
import FeriasModal from "@/components/admin/FeriasModal";

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
  "banco-horas": "Folha — Banco de Horas",
  "trabalhista-config": "Folha — Regras CLT",
  "documentos": "Centro de Documentos",
  "payroll-settings": "Folha — Parâmetros da Folha",
  "payroll-closing": "Folha — Fechamento",
  payslips: "Folha — Holerites",
  audit: "Auditoria",
  debug: "Logs do Sistema",
  users: "Gerenciar Usuários",
  assistente: "Assistente IA",
  "uniforms-catalog": "Uniformes — Catálogo",
  "uniforms-deliveries": "Uniformes — Entregas",
  "uniforms-history": "Uniformes — Histórico",
  "tools-catalog": "Ferramentas — Catálogo",
  "tools-loans": "Ferramentas — Empréstimos",
  "tools-history": "Ferramentas — Histórico",
  "mapa-localizacao": "Mapa de Localização",
  "espelho-ponto": "Folha — Espelho de Ponto",
  "simulador": "Folha — Simulador",
  "decimo-terceiro": "Folha — 13º Salário",
  "rescisao": "Folha — Rescisão",
  "exportacoes": "Relatórios",
  "aprovacoes-lote": "Aprovações em Lote",
  "analises": "Análises",
  "historico": "Histórico",
  "agenda": "Agenda",
  "solicitacoes": "Solicitações dos Colaboradores",
  "avisos": "Avisos da Empresa",
  "centro-operacoes": "Centro de Operações",
  "panorama": "Panorama da Empresa",
  "onboarding": "Checklist de Onboarding",
  "permissoes": "Permissões de Acesso",
  "anomalias": "Detector de Anomalias",
  "mapa-calor": "Mapa de Calor de Frequência",
  "organograma": "Organograma da Empresa",
  "cobertura": "Planejamento de Cobertura",
  "calendario-ausencias": "Calendário de Ausências",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, profile, signOut, isAdmin, isRh, role } = useAuth();
  const { isDark, toggle } = useTheme();
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
  const [newEmail, setNewEmail] = useState("");
  const [editCargo, setEditCargo] = useState("");
  const [editMatricula, setEditMatricula] = useState("");
  const [editDepartamento, setEditDepartamento] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showBusca, setShowBusca] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<{
    hora_entrada: string;
    hora_saida: string;
  } | null>(null);
  const [afastamentosEmpId, setAfastamentosEmpId] = useState<string | null>(null);
  const [afastamentosEmpName, setAfastamentosEmpName] = useState<string>("");
  const [afastamentosAtivos, setAfastamentosAtivos] = useState<{ employee_id: string; tipo: string }[]>([]);
  const [feriasEmpId, setFeriasEmpId] = useState<string | null>(null);
  const [feriasEmpName, setFeriasEmpName] = useState<string>("");
  const [saldosFerias, setSaldosFerias] = useState<Record<string, { dias_disponiveis: number; vencido: boolean }>>({});


  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowBusca(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    const verificarTour = async () => {
      const tourLocal = localStorage.getItem("amr_tour_concluido");
      if (tourLocal) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await (supabase as any)
          .from("profiles")
          .select("tour_concluido")
          .eq("user_id", user.id)
          .single();
        if (!profile?.tour_concluido) {
          setTimeout(() => setShowTour(true), 1500);
        } else {
          localStorage.setItem("amr_tour_concluido", "true");
        }
      } catch {
        setTimeout(() => setShowTour(true), 1500);
      }
    };
    verificarTour();
  }, []);

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*").order("name");
    if (data) setEmployees(data);
    // Busca afastamentos ativos hoje para exibir badge
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: afasts } = await (supabase as any)
      .from("afastamentos")
      .select("employee_id, tipo")
      .lte("data_inicio", hoje)
      .gte("data_fim", hoje);
    if (afasts) setAfastamentosAtivos(afasts);

    // Busca saldo de férias de cada funcionário ativo
    if (data) {
      const saldos: Record<string, { dias_disponiveis: number; vencido: boolean }> = {};
      await Promise.all(
        data.filter((e: any) => e.active).map(async (emp: any) => {
          const { data: saldoData } = await (supabase as any).rpc("get_saldo_ferias", { p_employee_id: emp.id });
          if (saldoData && saldoData.length > 0) {
            saldos[emp.id] = {
              dias_disponiveis: saldoData[0].dias_disponiveis,
              vencido: saldoData[0].vencido,
            };
          }
        })
      );
      setSaldosFerias(saldos);
    }
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
    setNewCargo(""); setNewMatricula(""); setNewDepartamento(""); setNewEmail("");
    fetchEmployees();
  };

  const startEditing = async (emp: Employee) => {
    setEditName(emp.name);
    setEditCpf((emp as any).cpf || "");
    setEditPunchMode(emp.punch_mode === "simple" ? "simple" : "full");
    setEditShift((emp as any).shift === "noturno" ? "noturno" : "diurno");
    setEditEscala((emp as any).escala || "padrao");
    setEditCargo((emp as any).cargo || "");
    setEditMatricula((emp as any).matricula || "");
    setEditDepartamento((emp as any).departamento || "");
    setEditEmail((emp as any).email || "");

    // Buscar horários existentes
    const { data: schedule } = await (supabase as any)
      .from("employee_schedules")
      .select("hora_entrada, hora_saida")
      .eq("employee_id", emp.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setEditingSchedule(
      schedule
        ? {
          hora_entrada: (schedule.hora_entrada || "").slice(0, 5),
          hora_saida: (schedule.hora_saida || "").slice(0, 5),
        }
        : null
    );
    setEditingId(emp.id);
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

  const handleDownloadFicha = async (emp: Employee, format: "pdf" | "excel" = "pdf") => {
    toast.info("Gerando ficha cadastral...");
    try {
      if (format === "excel") {
        const XLSX = await import("xlsx");
        const dados = [
          ["FICHA CADASTRAL — APA Refrigeração e Climatização"],
          [],
          ["DADOS PESSOAIS"],
          ["Nome completo", emp.name],
          ["CPF", (emp as any).cpf || "—"],
          ["Matrícula", (emp as any).matricula || "—"],
          ["E-mail", (emp as any).email || "—"],
          ["Telefone", (emp as any).telefone || "—"],
          ["Data de nascimento", (emp as any).data_nascimento ? new Date((emp as any).data_nascimento + "T12:00:00").toLocaleDateString("pt-BR") : "—"],
          [],
          ["DADOS PROFISSIONAIS"],
          ["Cargo", (emp as any).cargo || "—"],
          ["Departamento", (emp as any).departamento || "—"],
          ["Tipo de vínculo", (emp as any).tipo_vinculo || "—"],
          ["Data de admissão", (emp as any).data_admissao ? new Date((emp as any).data_admissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"],
          ["Status", (emp as any).status || "ativo"],
          [],
          ["JORNADA DE TRABALHO"],
          ["Tipo de jornada", emp.punch_mode === "simple" ? "2 batidas" : "4 batidas"],
          ["Turno", (emp as any).shift === "noturno" ? "Noturno" : "Diurno"],
          ["Escala", (emp as any).escala || "Padrão"],
          ["Carga horária semanal", `${(emp as any).carga_horaria_semanal || 44}h`],
          [],
          ["ENDEREÇO"],
          ["CEP", (emp as any).cep || "—"],
          ["Logradouro", (emp as any).logradouro || "—"],
          ["Número", (emp as any).numero || "—"],
          ["Complemento", (emp as any).complemento || "—"],
          ["Bairro", (emp as any).bairro || "—"],
          ["Cidade", (emp as any).cidade || "—"],
          ["Estado", (emp as any).estado || "—"],
          [],
          ["OBSERVAÇÕES"],
          [(emp as any).observacoes || "—"],
          [],
          ["Gerado em", new Date().toLocaleString("pt-BR")],
        ];
        const ws = XLSX.utils.aoa_to_sheet(dados);
        ws["!cols"] = [{ wch: 30 }, { wch: 50 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Ficha Cadastral");
        XLSX.writeFile(wb, `Ficha_${emp.name.replace(/\s+/g, "_")}.xlsx`);
        toast.success("Ficha cadastral Excel gerada!");
        return;
      }

      // PDF
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = pdf.internal.pageSize.getWidth();
      const M = 15;
      let y = 0;

      // Header
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, W, 30, "F");
      pdf.setFontSize(14); pdf.setFont("helvetica", "bold"); pdf.setTextColor(255, 255, 255);
      pdf.text("FICHA CADASTRAL", W / 2, 12, { align: "center" });
      pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(180, 200, 230);
      pdf.text("APA Refrigeração e Climatização", W / 2, 19, { align: "center" });
      pdf.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, W / 2, 25, { align: "center" });
      y = 38;

      const addSection = (titulo: string) => {
        pdf.setFillColor(240, 244, 248);
        pdf.rect(M, y, W - M * 2, 7, "F");
        pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); pdf.setTextColor(30, 64, 175);
        pdf.text(titulo.toUpperCase(), M + 2, y + 5);
        y += 10;
      };

      const addRow = (label: string, value: string) => {
        pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); pdf.setTextColor(100, 100, 110);
        pdf.text(label, M + 2, y);
        pdf.setFont("helvetica", "normal"); pdf.setTextColor(30, 30, 40);
        pdf.text(value || "—", M + 50, y);
        y += 6;
        if (y > 270) { pdf.addPage(); y = 15; }
      };

      // Dados pessoais
      addSection("Dados Pessoais");
      addRow("Nome completo:", emp.name);
      addRow("CPF:", (emp as any).cpf || "—");
      addRow("Matrícula:", (emp as any).matricula || "—");
      addRow("E-mail:", (emp as any).email || "—");
      addRow("Telefone:", (emp as any).telefone || "—");
      addRow("Data de nascimento:", (emp as any).data_nascimento ? new Date((emp as any).data_nascimento + "T12:00:00").toLocaleDateString("pt-BR") : "—");
      addRow("Contato de emergência:", (emp as any).contato_emergencia || "—");
      y += 3;

      // Dados profissionais
      addSection("Dados Profissionais");
      addRow("Cargo:", (emp as any).cargo || "—");
      addRow("Departamento:", (emp as any).departamento || "—");
      addRow("Tipo de vínculo:", (emp as any).tipo_vinculo || "—");
      addRow("Data de admissão:", (emp as any).data_admissao ? new Date((emp as any).data_admissao + "T12:00:00").toLocaleDateString("pt-BR") : "—");
      addRow("Status:", (emp as any).status || "Ativo");
      y += 3;

      // Jornada
      addSection("Jornada de Trabalho");
      addRow("Tipo de jornada:", emp.punch_mode === "simple" ? "2 batidas" : "4 batidas");
      addRow("Turno:", (emp as any).shift === "noturno" ? "Noturno" : "Diurno");
      addRow("Escala:", (emp as any).escala || "Padrão");
      addRow("Carga horária semanal:", `${(emp as any).carga_horaria_semanal || 44}h semanais`);
      y += 3;

      // Endereço
      addSection("Endereço");
      addRow("CEP:", (emp as any).cep || "—");
      addRow("Logradouro:", `${(emp as any).logradouro || "—"}${(emp as any).numero ? ", " + (emp as any).numero : ""}${(emp as any).complemento ? " - " + (emp as any).complemento : ""}`);
      addRow("Bairro:", (emp as any).bairro || "—");
      addRow("Cidade/Estado:", `${(emp as any).cidade || "—"}${(emp as any).estado ? " - " + (emp as any).estado : ""}`);
      y += 3;

      // Observações
      if ((emp as any).observacoes) {
        addSection("Observações");
        pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(30, 30, 40);
        const lines = pdf.splitTextToSize((emp as any).observacoes, W - M * 2 - 4);
        lines.forEach((line: string) => { pdf.text(line, M + 2, y); y += 5; });
      }

      // Afastamentos
      try {
        const { data: afasts } = await (supabase as any)
          .from("afastamentos")
          .select("tipo, data_inicio, data_fim, motivo")
          .eq("employee_id", emp.id)
          .order("data_inicio", { ascending: false });

        if (afasts && afasts.length > 0) {
          y += 3;
          addSection("Histórico de Afastamentos");
          const tipoLabels: Record<string, string> = {
            licenca_medica: "Licença Médica", licenca_maternidade: "Licença Maternidade",
            licenca_paternidade: "Licença Paternidade", ferias: "Férias",
            acidente_trabalho: "Acidente de Trabalho", suspensao: "Suspensão", outro: "Outro",
          };

          // Cabeçalho da mini-tabela
          pdf.setFillColor(230, 235, 245);
          pdf.rect(M, y, W - M * 2, 6, "F");
          pdf.setFontSize(7.5); pdf.setFont("helvetica", "bold"); pdf.setTextColor(30, 64, 175);
          pdf.text("TIPO", M + 2, y + 4);
          pdf.text("INÍCIO", M + 60, y + 4);
          pdf.text("FIM", M + 95, y + 4);
          pdf.text("DIAS", M + 130, y + 4);
          pdf.text("OBSERVAÇÃO", M + 150, y + 4);
          y += 7;

          afasts.forEach((a: any, idx: number) => {
            if (idx % 2 === 0) {
              pdf.setFillColor(250, 251, 253);
              pdf.rect(M, y, W - M * 2, 6, "F");
            }
            const inicio = new Date(a.data_inicio + "T12:00:00");
            const fim = new Date(a.data_fim + "T12:00:00");
            const dias = Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1;
            pdf.setFontSize(7.5); pdf.setFont("helvetica", "normal"); pdf.setTextColor(40, 40, 50);
            pdf.text(tipoLabels[a.tipo] || a.tipo, M + 2, y + 4);
            pdf.text(inicio.toLocaleDateString("pt-BR"), M + 60, y + 4);
            pdf.text(fim.toLocaleDateString("pt-BR"), M + 95, y + 4);
            pdf.text(`${dias}d`, M + 130, y + 4);
            pdf.text((a.motivo || "—").slice(0, 25), M + 150, y + 4);
            y += 6;
            if (y > 270) { pdf.addPage(); y = 15; }
          });

          // Total de dias
          const totalDias = afasts.reduce((acc: number, a: any) => {
            const d1 = new Date(a.data_inicio + "T12:00:00");
            const d2 = new Date(a.data_fim + "T12:00:00");
            return acc + Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
          }, 0);
          y += 2;
          pdf.setFontSize(7.5); pdf.setFont("helvetica", "bold"); pdf.setTextColor(30, 64, 175);
          pdf.text(`Total: ${totalDias} dia(s) de afastamento`, M + 2, y);
          y += 6;
        }
      } catch { }

      // Rodapé
      pdf.setDrawColor(15, 23, 42); pdf.setLineWidth(0.5);
      pdf.line(M, 282, W - M, 282);
      pdf.setFontSize(6.5); pdf.setTextColor(120, 120, 130);
      pdf.text("APA Ponto — Ficha Cadastral", W / 2, 287, { align: "center" });

      pdf.save(`Ficha_${emp.name.replace(/\s+/g, "_")}.pdf`);
      toast.success("Ficha cadastral PDF gerada!");
    } catch (err: any) {
      toast.error("Erro ao gerar ficha: " + err.message);
    }
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
        <AdminSidebar
          activeTab={tab}
          onTabChange={setTab}
          onLogout={logout}
          isAdmin={isAdmin}
          isRh={isRh}
          userName={profile?.full_name || user?.email}
          userRole={isAdmin ? "admin" : isRh ? "rh" : "supervisor"}
        />

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
              <Button variant="outline" size="sm" onClick={() => setShowTour(true)} className="gap-1.5" title="Tour guiado">
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Tour</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowBusca(true)} className="gap-1.5">
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline text-muted-foreground text-xs">Ctrl+K</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggle}
                className="gap-1.5"
                title="Alternar tema"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span className="hidden sm:inline">{isDark ? "Claro" : "Escuro"}</span>
              </Button>
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
            <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
              {tab === "dashboard" && <DashboardTab onNavigate={(t) => setTab(t as any)} role={role} />}
              {tab === "records" && <RecordsTab employees={employees} />}
              {tab === "justifications" && <JustificationsTab />}
              {showEpi && <EpiTab employees={employees} activeSubTab={epiSubTab} />}
              {tab === "payroll-dashboard" && <PayrollDashboardTab />}
              {tab === "banco-horas" && <BancoHorasTab employees={employees} />}
              {tab === "trabalhista-config" && <TrabalhistaConfigTab />}
              {tab === "documentos" && <DocumentosTab employees={employees} />}
              {tab === "uniforms-catalog" || tab === "uniforms-deliveries" || tab === "uniforms-history" ? <UniformsTab employees={employees} /> : null}
              {tab === "tools-catalog" || tab === "tools-loans" || tab === "tools-history" ? <ToolsTab employees={employees} /> : null}
              {tab === "payroll-settings" && <PayrollSettingsTab employees={employees} />}
              {tab === "payroll-closing" && <PayrollClosingTab employees={employees} />}
              {tab === "payslips" && <PayslipsTab />}
              {tab === "assistente" && <AssistenteIA />}
              {tab === "espelho-ponto" && <EspelhoPontoTab employees={employees} />}
              {tab === "mapa-localizacao" && <MapaLocalizacaoTab employees={employees} />}
              {tab === "exportacoes" && <ExportacoesTab employees={employees} />}
              {tab === "aprovacoes-lote" && <AprovacoesLoteTab employees={employees} />}
              {tab === "analises" && <AnalisesTab employees={employees} />}
              {tab === "historico" && <HistoricoTab employees={employees} />}
              {tab === "agenda" && <AgendaTab employees={employees} />}
              {tab === "solicitacoes" && <SolicitacoesTab />}
              {tab === "avisos" && <AvisosTab />}
              {tab === "simulador" && <SimuladorFolhaTab />}
              {tab === "decimo-terceiro" && <DecimoTerceiroTab employees={employees} />}
              {tab === "rescisao" && <RescisaoTab employees={employees} />}
              {tab === "audit" && <AuditTab />}
              {tab === "debug" && <DebugLogsTab />}
              {tab === "users" && <UsersTab />}
              {tab === "centro-operacoes" && <CentroOperacoesTab />}
              {tab === "panorama" && <PanoramaTab />}
              {tab === "onboarding" && <OnboardingTab />}
              {tab === "permissoes" && <PermissoesTab />}
              {tab === "anomalias" && <AnomaliaTab />}
              {tab === "mapa-calor" && <MapaCalorTab />}
              {tab === "organograma" && <OrganogramaTab />}
              {tab === "cobertura" && <CoberturaTab />}
              {tab === "calendario-ausencias" && <CalendarioAusenciasTab employees={employees} />}
              {tab === "employees" && (
                <div className="space-y-6">
                  {/* Add employee form */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold text-foreground">👥 Funcionários</h3>
                      <p className="text-sm text-muted-foreground">Gerencie colaboradores e jornadas</p>
                    </div>
                    <Card className="p-5">
                      <EmployeeForm
                        loading={false}
                        onSubmit={async (data) => {
                          if (!data.name.trim()) return;
                          const { error } = await supabase.from("employees").insert({
                            name: data.name.trim(),
                            cpf: data.cpf || null,
                            cargo: data.cargo || null,
                            matricula: data.matricula || null,
                            departamento: data.departamento || null,
                            email: data.email || null,
                            punch_mode: data.punch_mode,
                            shift: data.shift,
                            escala: data.escala,
                            active: true,
                            ...(data.status && { status: data.status }),
                            ...(data.tipo_vinculo && { tipo_vinculo: data.tipo_vinculo }),
                            ...(data.carga_horaria_semanal && { carga_horaria_semanal: data.carga_horaria_semanal }),
                            ...(data.data_admissao && { data_admissao: data.data_admissao }),
                            ...(data.data_nascimento && { data_nascimento: data.data_nascimento }),
                            ...(data.observacoes && { observacoes: data.observacoes }),
                            ...(data.foto_url && { foto_url: data.foto_url }),
                            ...(data.telefone && { telefone: data.telefone }),
                            ...(data.contato_emergencia && { contato_emergencia: data.contato_emergencia }),
                            ...(data.cep && { cep: data.cep }),
                            ...(data.logradouro && { logradouro: data.logradouro }),
                            ...(data.numero && { numero: data.numero }),
                            ...(data.complemento && { complemento: data.complemento }),
                            ...(data.bairro && { bairro: data.bairro }),
                            ...(data.cidade && { cidade: data.cidade }),
                            ...(data.estado && { estado: data.estado }),
                          } as any);
                          if (error) { toast.error("Erro ao adicionar: " + error.message); return; }

                          // Salvar horários na employee_schedules
                          const { data: { user } } = await supabase.auth.getUser();
                          const { data: profile } = await (supabase as any).from("profiles").select("company_id").eq("user_id", user?.id).single();
                          const { data: newEmp } = await supabase.from("employees").select("id").eq("name", data.name.trim()).order("created_at", { ascending: false }).limit(1).single();
                          if (newEmp && (data.hora_entrada || data.hora_saida)) {
                            const { error: schedError } = await (supabase as any).from("employee_schedules").upsert({
                              employee_id: newEmp.id,
                              company_id: profile?.company_id ?? null,
                              turno: data.shift,
                              hora_entrada: data.hora_entrada || null,
                              hora_saida: data.hora_saida || null,
                            }, { onConflict: "employee_id" });
                            if (schedError) toast.error("Colaborador criado, mas os horários falharam: " + schedError.message);
                          }

                          toast.success("Colaborador adicionado!");
                          fetchEmployees();
                        }}
                      />
                    </Card>
                  </div>

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
                              <EmployeeForm
                                loading={false}
                                initialData={{
                                  name: editName,
                                  cpf: editCpf,
                                  cargo: editCargo,
                                  matricula: editMatricula,
                                  departamento: editDepartamento,
                                  email: editEmail,
                                  punch_mode: editPunchMode,
                                  shift: editShift,
                                  escala: editEscala,
                                  hora_entrada: editingSchedule?.hora_entrada || "",
                                  hora_saida: editingSchedule?.hora_saida || "",
                                  tipo_vinculo: (emp as any).tipo_vinculo || "CLT",
                                  data_admissao: (emp as any).data_admissao || "",
                                  data_nascimento: (emp as any).data_nascimento || "",
                                  carga_horaria_semanal: (emp as any).carga_horaria_semanal || 44,
                                  status: (emp as any).status || "ativo",
                                  observacoes: (emp as any).observacoes || "",
                                  foto_url: (emp as any).foto_url || "",
                                  telefone: (emp as any).telefone || "",
                                  contato_emergencia: (emp as any).contato_emergencia || "",
                                  cep: (emp as any).cep || "",
                                  logradouro: (emp as any).logradouro || "",
                                  numero: (emp as any).numero || "",
                                  complemento: (emp as any).complemento || "",
                                  bairro: (emp as any).bairro || "",
                                  cidade: (emp as any).cidade || "",
                                  estado: (emp as any).estado || "",
                                }}
                                submitLabel="Salvar alterações"
                                onSubmit={async (data) => {
                                  const { error } = await supabase.from("employees").update({
                                    name: data.name.trim(),
                                    cpf: data.cpf || null,
                                    cargo: data.cargo || null,
                                    matricula: data.matricula || null,
                                    departamento: data.departamento || null,
                                    email: data.email || null,
                                    punch_mode: data.punch_mode,
                                    shift: data.shift,
                                    escala: data.escala,
                                    ...(data.status && { status: data.status }),
                                    ...(data.tipo_vinculo && { tipo_vinculo: data.tipo_vinculo }),
                                    ...(data.carga_horaria_semanal && { carga_horaria_semanal: data.carga_horaria_semanal }),
                                    ...(data.data_admissao && { data_admissao: data.data_admissao }),
                                    ...(data.data_nascimento && { data_nascimento: data.data_nascimento }),
                                    ...(data.observacoes && { observacoes: data.observacoes }),
                                    ...(data.foto_url && { foto_url: data.foto_url }),
                                    ...(data.telefone && { telefone: data.telefone }),
                                    ...(data.contato_emergencia && { contato_emergencia: data.contato_emergencia }),
                                    cep: data.cep || null,
                                    logradouro: data.logradouro || null,
                                    numero: data.numero || null,
                                    complemento: data.complemento || null,
                                    bairro: data.bairro || null,
                                    cidade: data.cidade || null,
                                    estado: data.estado || null,
                                  } as any).eq("id", editingId!);
                                  if (error) { toast.error("Erro ao atualizar: " + error.message); return; }

                                  // Atualizar horários na employee_schedules
                                  {
                                    const { data: { user: schedUser } } = await supabase.auth.getUser();
                                    const { data: schedProfile } = await (supabase as any)
                                      .from("profiles")
                                      .select("company_id")
                                      .eq("user_id", schedUser?.id)
                                      .maybeSingle();

                                    const { error: schedError } = await (supabase as any)
                                      .from("employee_schedules")
                                      .upsert({
                                        employee_id: editingId,
                                        company_id: schedProfile?.company_id ?? null,
                                        turno: data.shift,
                                        hora_entrada: data.hora_entrada || null,
                                        hora_saida: data.hora_saida || null,
                                      }, { onConflict: "employee_id" });

                                    if (schedError) {
                                      toast.error("Funcionário salvo, mas os horários falharam: " + schedError.message);
                                    }
                                  }

                                  const { data: { user } } = await supabase.auth.getUser();

                                  await supabase.from("audit_logs").insert({
                                    admin_user_id: user?.id,
                                    action: "update_employee",
                                    target_type: "employees",
                                    target_id: editingId,
                                    details: { name: data.name.trim() },
                                  } as any);

                                  toast.success("Colaborador atualizado!");

                                  setEditingId(null);
                                  setEditingSchedule(null);

                                  fetchEmployees();
                                }}
                                onCancel={() => {
                                  setEditingId(null);
                                  setEditingSchedule(null);
                                }}
                              />
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
                                  <div className="flex items-center gap-2">
                                    <span className={`font-medium ${!emp.active ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                      {emp.name}
                                    </span>
                                    {(() => {
                                      const afast = afastamentosAtivos.find(a => a.employee_id === emp.id);
                                      if (!afast) return null;
                                      const badges: Record<string, { emoji: string; label: string; bg: string; cor: string }> = {
                                        licenca_medica: { emoji: "🏥", label: "Lic. Médica", bg: "#fef3c7", cor: "#b45309" },
                                        licenca_maternidade: { emoji: "🤱", label: "Maternidade", bg: "#fce7f3", cor: "#9d174d" },
                                        licenca_paternidade: { emoji: "👨‍👶", label: "Paternidade", bg: "#dbeafe", cor: "#1e40af" },
                                        ferias: { emoji: "🏖️", label: "Férias", bg: "#d1fae5", cor: "#065f46" },
                                        acidente_trabalho: { emoji: "⚠️", label: "Acidente", bg: "#fee2e2", cor: "#991b1b" },
                                        suspensao: { emoji: "🚫", label: "Suspenso", bg: "#f3f4f6", cor: "#374151" },
                                        outro: { emoji: "📋", label: "Afastado", bg: "#ede9fe", cor: "#5b21b6" },
                                      };
                                      const b = badges[afast.tipo] || badges.outro;
                                      return (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                                          style={{ background: b.bg, color: b.cor }}>
                                          {b.emoji} {b.label}
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const sf = saldosFerias[emp.id];
                                      if (!sf) return null;
                                      if (sf.vencido) {
                                        return (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                                            style={{ background: "#fee2e2", color: "#991b1b" }}>
                                            🌴 Férias vencidas
                                          </span>
                                        );
                                      }
                                      if (sf.dias_disponiveis <= 5) {
                                        return (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                                            style={{ background: "#fef3c7", color: "#b45309" }}>
                                            🌴 {sf.dias_disponiveis}d de férias
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
                                          style={{ background: "#d1fae5", color: "#065f46" }}>
                                          🌴 {sf.dias_disponiveis}d disponíveis
                                        </span>
                                      );
                                    })()}
                                  </div>
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
                                <Button variant="ghost" size="sm" onClick={() => handleDownloadFicha(emp, "pdf")} title="Ficha PDF">
                                  <Download className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDownloadFicha(emp, "excel")} title="Ficha Excel"
                                  className="text-emerald-500 hover:text-emerald-400">
                                  <Download className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setAfastamentosEmpId(emp.id);
                                  setAfastamentosEmpName(emp.name);
                                }} title="Afastamentos e trocas">
                                  <BriefcaseMedical className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setFeriasEmpId(emp.id);
                                  setFeriasEmpName(emp.name);
                                }} title="Gestão de férias">
                                  <Palmtree className="w-4 h-4" />
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

      {showTour && (
        <TourGuiado
          onClose={() => setShowTour(false)}
          onNavigate={(t) => { setTab(t as any); }}
        />
      )}
      {showBusca && (
        <BuscaGlobal
          employees={employees}
          onNavigate={(t) => setTab(t as any)}
          onClose={() => setShowBusca(false)}
        />
      )}
      {afastamentosEmpId && (
        <AfastamentosModal
          employeeId={afastamentosEmpId}
          employeeName={afastamentosEmpName}
          onClose={() => { setAfastamentosEmpId(null); setAfastamentosEmpName(""); }}
        />
      )}

      {feriasEmpId && (
        <FeriasModal
          employeeId={feriasEmpId}
          employeeName={feriasEmpName}
          onClose={() => { setFeriasEmpId(null); setFeriasEmpName(""); }}
        />
      )}
    </SidebarProvider>

  );
}
