import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  LogIn,
  Coffee,
  RotateCcw,
  LogOut,
  Check,
  MapPin,
  ChevronDown,
  Camera,
  Pencil,
  FileText,
  ArrowLeft,
  WifiOff,
  Wifi,
  History,
  CheckCircle2,
  RefreshCw,
  HardHat,
  FolderOpen,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Droplets,
  Wind,
  Moon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Shield } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import logo from "@/assets/logo-APA.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import CameraCapture from "@/components/CameraCapture";
import ManualPunch from "@/components/ManualPunch";
import AbsenceJustification from "@/components/AbsenceJustification";
import EpiAcceptance from "@/components/EpiAcceptance";
import MeusDocumentos from "@/components/MeusDocumentos";
import PayslipSign from "@/components/PayslipSign";
import UniformAcceptance from "@/components/UniformAcceptance";
import ToolAcceptance from "@/components/ToolAcceptance";
import TimesheetSign from "@/components/TimesheetSign";
import {
  mapTimeRecordToPunchRecord,
  type DisplayPunchRecord,
  type TimeRecordInsert,
  type TimeRecordRow,
} from "@/lib/time-records";
import { groupRecordsIntoJourneys } from "@/lib/group-journeys";

type PunchStep = "entrada" | "intervalo" | "retorno" | "saida";
type Employee = Tables<"employees"> & { has_cpf?: boolean };
type PunchRecord = DisplayPunchRecord;

// ── Weather ────────────────────────────────────────────────────────────────
type WeatherData = {
  temp: number;
  weatherCode: number;
  windspeed: number;
  humidity: number;
};

function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    // Coordenadas de Manaus/AM — ajuste se necessário
    const LAT = -15.7997;
    const LON = -47.8645;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true&hourly=relativehumidity_2m&timezone=America%2FFortaleza`
    )
      .then((r) => r.json())
      .then((d) => {
        const cw = d.current_weather;
        const humidity = d.hourly?.relativehumidity_2m?.[new Date().getHours()] ?? 0;
        setWeather({
          temp: Math.round(cw.temperature),
          weatherCode: cw.weathercode,
          windspeed: Math.round(cw.windspeed),
          humidity,
        });
      })
      .catch(() => {});
  }, []);

  return weather;
}

function WeatherIcon({ code, hour }: { code: number; hour: number }) {
  const isNight = hour < 6 || hour >= 18;
  if (code === 0) return isNight ? <Moon className="w-5 h-5 text-blue-200" /> : <Sun className="w-5 h-5 text-yellow-400" />;
  if (code <= 3) return <Cloud className="w-5 h-5 text-gray-300" />;
  if (code <= 67) return <CloudRain className="w-5 h-5 text-blue-400" />;
  if (code <= 77) return <CloudSnow className="w-5 h-5 text-blue-200" />;
  if (code <= 99) return <CloudLightning className="w-5 h-5 text-yellow-300" />;
  return <Sun className="w-5 h-5 text-yellow-400" />;
}

function getDynamicPhrase(hour: number, weatherCode: number): string {
  const isRainy = weatherCode >= 51 && weatherCode <= 99;
  const isStormy = weatherCode >= 80;

  if (hour >= 5 && hour < 12) {
    if (isStormy) return "Dia de chuva forte, mas o time APA não para! 💪";
    if (isRainy) return "Chovendo lá fora, mas aqui dentro é foco total! ☔";
    return "Bom dia! Mais um dia de excelência na APA. 🌅";
  }
  if (hour >= 12 && hour < 14) {
    return "Hora do almoço — recarrega as energias! 🍽️";
  }
  if (hour >= 14 && hour < 18) {
    if (isRainy) return "Tarde chuvosa, café quentinho e produtividade! ☕";
    return "Boa tarde! Mantendo o padrão APA de qualidade. 👷";
  }
  if (hour >= 18 && hour < 22) {
    return "Boa noite! Finalizando mais um dia de trabalho. 🌙";
  }
  return "Madrugada em campo — dedicação total! ⭐";
}
// ───────────────────────────────────────────────────────────────────────────

/** Single source of truth after CPF validation */
interface ValidatedContext {
  employee_id: string;
  name: string;
  cpf_normalized: string;
  punch_mode: string;
  shift: string;
  validated_at: string;
  source: "online" | "offline";
}

/** Normalize CPF to digits only — used everywhere */
function normalizeCpf(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

const ALL_STEPS: { key: PunchStep; label: string; icon: typeof Clock }[] = [
  { key: "entrada", label: "Entrada", icon: LogIn },
  { key: "intervalo", label: "Intervalo", icon: Coffee },
  { key: "retorno", label: "Retorno", icon: RotateCcw },
  { key: "saida", label: "Saída", icon: LogOut },
];

const SIMPLE_STEPS: { key: PunchStep; label: string; icon: typeof Clock }[] = [
  { key: "entrada", label: "Entrada", icon: LogIn },
  { key: "saida", label: "Saída", icon: LogOut },
];

const formatTime = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const getLocalDateKey = (date: Date | string = new Date()) => {
  const current = typeof date === "string" ? new Date(date) : date;
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLocalDayRange = (date: Date | string = new Date()) => {
  const current = typeof date === "string" ? new Date(date) : date;
  const start = new Date(current);
  start.setHours(0, 0, 0, 0);
  const end = new Date(current);
  end.setHours(23, 59, 59, 999);

  return {
    dayKey: getLocalDateKey(current),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

// ---- Local cache helpers ----
const OFFLINE_QUEUE_KEY = "AMR_ponto_offline_queue";
const RECORDS_CACHE_KEY = "AMR_ponto_records_cache";
const EMPLOYEES_CACHE_KEY = "AMR_ponto_employees_cache";
const OFFLINE_REQUIRED_MESSAGE = "É necessário abrir o app com internet pelo menos uma vez para habilitar o modo offline.";

interface CachedEmployee {
  id: string;
  name: string;
  cpf: string | null;
  shift: string;
  jornada: string;
  punch_mode: string;
  has_cpf: boolean;
  active: boolean;
  foto_url?: string | null;
  cargo?: string | null;
}

interface EmployeesCachePayload {
  synced_at: string | null;
  employees: CachedEmployee[];
}

interface OfflinePunch {
  id: string;
  employee_id: string;
  cpf: string;
  record_type: string;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string;
  mode: string;
  sync_status: string;
  attempts?: number;
  last_error?: string | null;
}

interface SyncOfflineResult {
  synced: number;
  skipped: number;
  failed: number;
}

function readStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorageJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function normalizeCachedEmployee(employee: Partial<CachedEmployee> & { id: string; name: string }): CachedEmployee {
  const punchMode = employee.punch_mode || employee.jornada || "full";

  return {
    id: employee.id,
    name: employee.name,
    cpf: employee.cpf ?? null,
    shift: employee.shift || "diurno",
    jornada: employee.jornada || punchMode,
    punch_mode: punchMode,
    has_cpf: typeof employee.has_cpf === "boolean" ? employee.has_cpf : !!employee.cpf,
    active: typeof employee.active === "boolean" ? employee.active : true,
  };
}

function getEmployeesCacheSnapshot(): EmployeesCachePayload {
  const raw = readStorageJson<EmployeesCachePayload | CachedEmployee[]>(EMPLOYEES_CACHE_KEY, []);

  if (Array.isArray(raw)) {
    return {
      synced_at: null,
      employees: raw.map((employee) => normalizeCachedEmployee(employee)),
    };
  }

  return {
    synced_at: raw?.synced_at || null,
    employees: Array.isArray(raw?.employees)
      ? raw.employees.map((employee) => normalizeCachedEmployee(employee))
      : [],
  };
}

function cacheEmployees(employees: CachedEmployee[]) {
  writeStorageJson(EMPLOYEES_CACHE_KEY, {
    synced_at: new Date().toISOString(),
    employees,
  } satisfies EmployeesCachePayload);
}

function getCachedEmployees(): CachedEmployee[] {
  return getEmployeesCacheSnapshot().employees.filter((employee) => employee.active);
}

function mapCachedEmployeeToEmployee(employee: CachedEmployee): Employee {
  return {
    ...employee,
    active: employee.active,
    created_at: "",
    cargo: "",
    departamento: "",
    matricula: "",
    data_admissao: null,
    escala: "padrao",
  } as Employee;
}

function findEmployeeByCpfOffline(cpf: string): CachedEmployee | null {
  const normalized = normalizeCpf(cpf);
  if (!normalized) return null;

  const cached = getCachedEmployees();
  const matches = cached.filter(
    (employee) => employee.cpf && normalizeCpf(employee.cpf) === normalized,
  );

  return matches.length === 1 ? matches[0] : null;
}

function getDayKey(dateLike?: string) {
  return getLocalDateKey(dateLike ?? new Date());
}

function getRecordsCacheKey(employeeId: string, dayKey: string = getDayKey()) {
  return `${RECORDS_CACHE_KEY}_${employeeId}_${dayKey}`;
}

function getPunchFingerprint(record: { step?: string; punched_at?: string; record_type?: string; recorded_at?: string }) {
  const step = record.step || record.record_type || "";
  const punchedAt = record.punched_at || record.recorded_at || "";
  return `${step}__${punchedAt}`;
}

function mergePunchRecords(...groups: PunchRecord[][]): PunchRecord[] {
  const merged = new Map<string, PunchRecord>();

  groups.flat().forEach((record) => {
    const key = getPunchFingerprint(record);
    const current = merged.get(key);

    if (!current || (current.sync_status === "pending" && record.sync_status !== "pending")) {
      merged.set(key, record);
    }
  });

  return Array.from(merged.values()).sort(
    (left, right) => new Date(left.punched_at).getTime() - new Date(right.punched_at).getTime(),
  );
}

function resolveCompletedSequence(
  records: PunchRecord[],
  steps: { key: PunchStep; label: string; icon: typeof Clock }[],
) {
  const ordered = [...records].sort(
    (left, right) => new Date(left.punched_at).getTime() - new Date(right.punched_at).getTime(),
  );

  const accepted: PunchRecord[] = [];
  let nextIndex = 0;

  for (const record of ordered) {
    const expectedStep = steps[nextIndex];
    if (!expectedStep) break;

    if (record.step === expectedStep.key) {
      accepted.push(record);
      nextIndex += 1;
    }
  }

  return {
    ordered,
    accepted,
    lastValidRecord: accepted[accepted.length - 1] ?? null,
    nextStep: steps[nextIndex] ?? null,
    currentStepIndex: nextIndex,
    allDone: nextIndex >= steps.length,
  };
}

function cacheRecords(employeeId: string, records: PunchRecord[]) {
  const dayKey = records[0] ? getDayKey(records[0].punched_at) : getDayKey();
  writeStorageJson(getRecordsCacheKey(employeeId, dayKey), mergePunchRecords(records));
}

function getCachedRecords(employeeId: string, dayKey: string = getDayKey()): PunchRecord[] {
  return mergePunchRecords(readStorageJson<PunchRecord[]>(getRecordsCacheKey(employeeId, dayKey), []));
}

function createPendingRecord(punch: OfflinePunch): PunchRecord {
  return {
    id: punch.id,
    employee_id: punch.employee_id,
    step: punch.record_type,
    punched_at: punch.recorded_at,
    latitude: punch.latitude,
    longitude: punch.longitude,
    address: null,
    photo_url: null,
    created_at: punch.recorded_at,
    mode: punch.mode,
    sync_status: punch.sync_status,
  };
}

function cacheOfflineRecord(punch: OfflinePunch) {
  const dayKey = getDayKey(punch.recorded_at);
  const cached = getCachedRecords(punch.employee_id, dayKey);
  const merged = mergePunchRecords(cached, [createPendingRecord(punch)]);
  writeStorageJson(getRecordsCacheKey(punch.employee_id, dayKey), merged);
}

function markCachedRecordAsSynced(employeeId: string, recordType: string, recordedAt: string) {
  const dayKey = getDayKey(recordedAt);
  const cached = getCachedRecords(employeeId, dayKey);
  const updated = cached.map((record) =>
    record.step === recordType && record.punched_at === recordedAt
      ? { ...record, sync_status: "synced" }
      : record,
  );

  writeStorageJson(getRecordsCacheKey(employeeId, dayKey), updated);
}

function getOfflineQueue(): OfflinePunch[] {
  const queue = readStorageJson<OfflinePunch[]>(OFFLINE_QUEUE_KEY, []);

  const uniqueQueue = new Map<string, OfflinePunch>();
  queue.forEach((item) => {
    uniqueQueue.set(`${item.employee_id}__${item.record_type}__${item.recorded_at}`, {
      ...item,
      cpf: normalizeCpf(item.cpf || ""),
      record_type: item.record_type,
      recorded_at: item.recorded_at,
      mode: item.mode || "offline",
      sync_status: item.sync_status || "pending",
    });
  });

  return Array.from(uniqueQueue.values()).sort(
    (left, right) => new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime(),
  );
}

function addToOfflineQueue(punch: OfflinePunch) {
  const queue = getOfflineQueue();

  if (queue.some((item) => item.employee_id === punch.employee_id && item.record_type === punch.record_type && item.recorded_at === punch.recorded_at)) {
    return false;
  }

  const nextQueue = [...queue, punch];
  writeStorageJson(OFFLINE_QUEUE_KEY, nextQueue);
  cacheOfflineRecord(punch);
  return true;
}

function clearOfflineQueue() {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

function getPendingRecordsForEmployee(employeeId: string, dayKey: string = getDayKey()): PunchRecord[] {
  return getOfflineQueue()
    .filter((item) => item.employee_id === employeeId && getDayKey(item.recorded_at) === dayKey)
    .map(createPendingRecord);
}

async function timeRecordExists(punch: OfflinePunch): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("time_records")
    .select("id")
    .eq("employee_id", punch.employee_id)
    .eq("record_type", punch.record_type)
    .eq("recorded_at", punch.recorded_at)
    .limit(1);

  if (error) {
    console.warn("DEBUG OFFLINE [dedupe]: não foi possível verificar duplicidade remotamente", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function syncOfflineQueue(): Promise<SyncOfflineResult> {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { synced: 0, skipped: 0, failed: 0 };
  }

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  const remaining: OfflinePunch[] = [];

  for (const punch of queue) {
    const cpfDigits = normalizeCpf(punch.cpf || "");

    try {
      if (!cpfDigits || !punch.record_type || !punch.recorded_at) {
        failed++;
        remaining.push({ ...punch, attempts: (punch.attempts || 0) + 1, last_error: "Registro offline inválido" });
        continue;
      }

      const alreadyExists = await timeRecordExists(punch);

      if (alreadyExists) {
        skipped++;
        markCachedRecordAsSynced(punch.employee_id, punch.record_type, punch.recorded_at);
        continue;
      }

      const { error } = await supabase.rpc("insert_time_record_with_cpf" as any, {
        p_cpf: cpfDigits,
        p_record_type: punch.record_type,
        p_recorded_at: punch.recorded_at,
        p_latitude: punch.latitude,
        p_longitude: punch.longitude,
        p_mode: "offline",
        p_sync_status: "synced",
      });

      if (error) {
        throw error;
      }

      synced++;
      markCachedRecordAsSynced(punch.employee_id, punch.record_type, punch.recorded_at);
    } catch (error: any) {
      console.error("DEBUG OFFLINE [sync]: erro ao sincronizar registro pendente", error);
      failed++;
      remaining.push({
        ...punch,
        attempts: (punch.attempts || 0) + 1,
        last_error: error?.message || "Erro ao sincronizar",
      });
    }
  }

  if (remaining.length > 0) {
    writeStorageJson(OFFLINE_QUEUE_KEY, remaining);
  } else {
    clearOfflineQueue();
  }

  return { synced, skipped, failed };
}
function MeusSolicitacoes({ employeeId }: { employeeId: string }) {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any)
        .from("employee_requests")
        .select("id, tipo, status, observacao, created_at")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(5);
      setSolicitacoes(data || []);
    };
    load();

    const channel = (supabase as any)
      .channel(`solicitacoes-${employeeId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "employee_requests",
        filter: `employee_id=eq.${employeeId}`
      }, () => load())
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [employeeId]);

  if (solicitacoes.length === 0) return null;

  const STATUS = {
    pendente: { icon: "⏳", label: "Pendente",  bg: "#fef3c7", text: "#b45309" },
    aprovado: { icon: "✅", label: "Aprovado",  bg: "#f0fdf4", text: "#15803d" },
    recusado: { icon: "❌", label: "Recusado",  bg: "#fff1f2", text: "#be123c" },
  } as any;

  const TIPO_ICONS: Record<string, string> = {
    "Férias": "🏖️", "Abono": "📝", "Declaração": "📄", "Ajuste de Ponto": "⏱️",
  };

  return (
    <div className="w-full bg-white rounded-2xl px-5 py-4 mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">📋 Minhas Solicitações</p>
      <div className="space-y-2">
        {solicitacoes.map((s: any) => {
          const st = STATUS[s.status] || STATUS.pendente;
          return (
            <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl"
              style={{ background: st.bg }}>
              <div className="flex items-center gap-2">
                <span className="text-base">{TIPO_ICONS[s.tipo] || "📋"}</span>
                <div>
                  <p className="text-xs font-semibold" style={{ color: st.text }}>{s.tipo}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(s.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "white", color: st.text }}>
                {st.icon} {st.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TimeClock() {
  const [now, setNow] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedShift, setSelectedShift] = useState<"diurno" | "noturno" | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [validatedEmployee, setValidatedEmployee] = useState<Employee | null>(null);
  const [records, setRecords] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string>("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showManualPunch, setShowManualPunch] = useState(false);
  const [showJustification, setShowJustification] = useState(false);
  const [pendingEmployee, setPendingEmployee] = useState<Employee | null>(null);
  const [cpfInput, setCpfInput] = useState("");
  const [validatedCpf, setValidatedCpf] = useState("");
  const [validatedContext, setValidatedContext] = useState<ValidatedContext | null>(null);
  const [cpfError, setCpfError] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<PunchRecord[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [employeesSyncedAt, setEmployeesSyncedAt] = useState<string | null>(() => getEmployeesCacheSnapshot().synced_at);
  const [hasOfflineBase, setHasOfflineBase] = useState(() => getCachedEmployees().length > 0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [serverStepInfo, setServerStepInfo] = useState<{
    next_step: string | null;
    day_complete: boolean;
    records_today: { record_type: string; recorded_at: string }[];
  } | null>(null);
  const navigate = useNavigate();
  const weather = useWeather();
  const currentHour = new Date().getHours();
  const { isAdmin } = useAuth();
  const { isDark, toggle } = useTheme();
  const bgPrimary = isDark ? "#0f172a" : "#F0F4F8";
  const bgCard = isDark ? "#1e293b" : "white";
  const textPrimary = isDark ? "#f1f5f9" : "#1e293b";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const borderColor = isDark ? "#334155" : "#e2e8f0";
  const [showEpiAcceptance, setShowEpiAcceptance] = useState(false);
  const [pendingEpiCount, setPendingEpiCount] = useState(0);
  const [pendingEpis, setPendingEpis] = useState<{ epi_name: string; delivered_at: string }[]>([]);
  const [showPayslipSign, setShowPayslipSign] = useState(false);
  const [pendingPayslipCount, setPendingPayslipCount] = useState(0);
const [pendingUniformCount, setPendingUniformCount] = useState(0);
const [pendingUniform, setPendingUniform] = useState<{ uniform_name: string; delivered_at: string }[]>([]);
const [pendingToolCount, setPendingToolCount] = useState(0);
const [pendingTools, setPendingTools] = useState<{ tool_name: string; loaned_at: string }[]>([]);
  const [showDocumentos, setShowDocumentos] = useState(false);
  const [showUniformAcceptance, setShowUniformAcceptance] = useState(false);
const [showToolAcceptance, setShowToolAcceptance] = useState(false);
const [showTimesheetSign, setShowTimesheetSign] = useState(false);
const [pendingTimesheetCount, setPendingTimesheetCount] = useState(0);
const [avisos, setAvisos] = useState<{ id: string; titulo: string; mensagem: string; tipo: string; created_at: string }[]>([]);
const [showSolicitacao, setShowSolicitacao] = useState<string | null>(null);
const [solicitacaoTexto, setSolicitacaoTexto] = useState("");
const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false);
const [historyTab, setHistoryTab] = useState<"pontos" | "banco" | "ferias" | "afastamentos">("pontos");
const [feriasSaldo, setFeriasSaldo] = useState<any>(null);
const [feriasHistorico, setFeriasHistorico] = useState<any[]>([]);
const [afastamentosHistorico, setAfastamentosHistorico] = useState<any[]>([]);

  const filteredEmployees = selectedShift
    ? employees.filter((e) => (e as any).shift?.toLowerCase() === selectedShift)
    : employees;

  const punchMode = selectedEmployee?.punch_mode ?? validatedContext?.punch_mode ?? "full";
  const STEPS = punchMode === "simple" ? SIMPLE_STEPS : ALL_STEPS;
  const sequenceState = resolveCompletedSequence(records, STEPS);

  // Server-driven step info takes precedence over local calculation
  const allDone = serverStepInfo ? serverStepInfo.day_complete : sequenceState.allDone;
  const nextAllowedStep = serverStepInfo
    ? (serverStepInfo.next_step ? STEPS.find((s) => s.key === serverStepInfo.next_step) ?? ALL_STEPS.find((s) => s.key === serverStepInfo.next_step) ?? null : null)
    : sequenceState.nextStep;
  const currentStepIndex = serverStepInfo
    ? (serverStepInfo.next_step ? STEPS.findIndex((s) => s.key === serverStepInfo.next_step) : STEPS.length)
    : sequenceState.currentStepIndex;
  const lastValidRecord = sequenceState.lastValidRecord;

  /** Fetch next step from server RPC — single source of truth */
  const fetchNextStep = useCallback(async (cpf: string) => {
    if (!cpf || !navigator.onLine) return;
    const cpfDigits = normalizeCpf(cpf);
    if (!cpfDigits) return;
    try {
      const { data, error } = await (supabase as any).rpc("get_next_record_step_by_cpf", { p_cpf: cpfDigits });
      console.log("DEBUG PONTO [fetchNextStep]: cpf:", cpfDigits.slice(0, 3) + "***", "result:", data, "error:", error);
      if (error) {
        console.error("DEBUG PONTO [fetchNextStep]: ERRO:", error);
        return;
      }
      if (data && Array.isArray(data) && data.length > 0) {
        const row = data[0];
        setServerStepInfo({
          next_step: row.next_step,
          day_complete: row.day_complete,
          records_today: typeof row.records_today === "string" ? JSON.parse(row.records_today) : (row.records_today || []),
        });
        // Also update records display from server data
        if (row.records_today) {
          const serverRecords = (typeof row.records_today === "string" ? JSON.parse(row.records_today) : row.records_today) as { record_type: string; recorded_at: string }[];
          const mapped: PunchRecord[] = serverRecords.map((r, i) => ({
            id: `server-${i}`,
            employee_id: row.employee_id,
            step: r.record_type,
            punched_at: r.recorded_at,
            latitude: null,
            longitude: null,
            address: null,
            photo_url: null,
            created_at: r.recorded_at,
            mode: "online",
            sync_status: "synced",
          }));
          const pending = getPendingRecordsForEmployee(row.employee_id);
          setRecords(mergePunchRecords(mapped, pending));
        }
      } else if (data && !Array.isArray(data)) {
        // Single object return
        setServerStepInfo({
          next_step: data.next_step,
          day_complete: data.day_complete,
          records_today: typeof data.records_today === "string" ? JSON.parse(data.records_today) : (data.records_today || []),
        });
        if (data.records_today) {
          const serverRecords = (typeof data.records_today === "string" ? JSON.parse(data.records_today) : data.records_today) as { record_type: string; recorded_at: string }[];
          const mapped: PunchRecord[] = serverRecords.map((r, i) => ({
            id: `server-${i}`,
            employee_id: data.employee_id,
            step: r.record_type,
            punched_at: r.recorded_at,
            latitude: null,
            longitude: null,
            address: null,
            photo_url: null,
            created_at: r.recorded_at,
            mode: "online",
            sync_status: "synced",
          }));
          const pending = getPendingRecordsForEmployee(data.employee_id);
          setRecords(mergePunchRecords(mapped, pending));
        }
      }
    } catch (err) {
      console.error("DEBUG PONTO [fetchNextStep]: exception:", err);
    }
  }, []);

  /** Fetch pending EPI count for current employee */
  const fetchPendingEpiCount = useCallback(async (cpf: string) => {
    const cpfDigits = normalizeCpf(cpf);
    if (!cpfDigits) {
      setPendingEpiCount(0);
      setPendingEpis([]);
      return;
    }
    if (!navigator.onLine) return;
    try {
      const { data, error } = await supabase.rpc("get_pending_epi_by_cpf", { p_cpf: cpfDigits } as any);
      if (error) throw error;
      const arr = Array.isArray(data) ? data : [];
      setPendingEpiCount(arr.length);
      setPendingEpis(arr.map((d: any) => ({ epi_name: d.epi_name, delivered_at: d.delivered_at })));
    } catch (error) {
      console.error("DEBUG EPI [fetchPendingEpiCount]: erro ao revalidar pendências", error);
    }
  }, []);

  /** Fetch pending payslips count for current employee */
  const fetchPendingPayslipCount = useCallback(async (cpf: string) => {
    const cpfDigits = normalizeCpf(cpf);
    if (!cpfDigits || !navigator.onLine) { setPendingPayslipCount(0); return; }
    try {
      const { data, error } = await supabase.rpc("get_pending_payslips_by_cpf" as any, { p_cpf: cpfDigits });
      if (error) throw error;
      setPendingPayslipCount(Array.isArray(data) ? data.length : 0);
    } catch (e) {
      console.error("Erro ao buscar holerites pendentes", e);
    }
  }, []);

  const fetchPendingUniformCount = useCallback(async (cpf: string) => {
    const cpfDigits = normalizeCpf(cpf);
    if (!cpfDigits || !navigator.onLine) { setPendingUniformCount(0); return; }
    try {
      const { data, error } = await supabase.rpc("get_pending_uniforms_by_cpf" as any, { p_cpf: cpfDigits });
      if (error) throw error;
      const arr = Array.isArray(data) ? data : [];
      setPendingUniformCount(arr.length);
      setPendingUniform(arr.map((d: any) => ({ uniform_name: d.uniform_name, delivered_at: d.delivered_at })));
    } catch (e) {
      console.error("Erro ao buscar uniformes pendentes", e);
    }
  }, []);

const fetchPendingToolCount = useCallback(async (cpf: string) => {
  const cpfDigits = normalizeCpf(cpf);
  if (!cpfDigits || !navigator.onLine) { setPendingToolCount(0); return; }
  try {
    const { data, error } = await supabase.rpc("get_pending_tools_by_cpf" as any, { p_cpf: cpfDigits });
    if (error) throw error;
    const arr = Array.isArray(data) ? data : [];
    setPendingToolCount(arr.length);
    setPendingTools(arr.map((d: any) => ({ tool_name: d.tool_name, loaned_at: d.loaned_at })));
  } catch (e) {
    console.error("Erro ao buscar ferramentas pendentes", e);
  }
}, []);

const [calendarioDias, setCalendarioDias] = useState<Record<string, "trabalhado" | "falta" | "atestado" | "ferias">>({});

const fetchCalendario = useCallback(async (cpf: string) => {
  const cpfDigits = normalizeCpf(cpf);
  if (!cpfDigits || !navigator.onLine) return;
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    const { data: empData } = await (supabase as any)
      .from("employees")
      .select("id")
      .or(`cpf.eq.${cpfDigits},cpf.eq.${cpfFormatted}`)
      .single();

    if (!empData?.id) return;

    const [recordsRes, justRes] = await Promise.all([
      (supabase as any).from("time_records")
        .select("recorded_at, record_type")
        .eq("employee_id", empData.id)
        .gte("recorded_at", startOfMonth)
        .lte("recorded_at", endOfMonth),
      (supabase as any).from("absence_justifications")
        .select("date, reason, status")
        .eq("employee_id", empData.id)
        .gte("date", startOfMonth.slice(0, 10))
        .lte("date", endOfMonth.slice(0, 10)),
    ]);

    const dias: Record<string, "trabalhado" | "falta" | "atestado" | "ferias"> = {};

    // Dias trabalhados
    (recordsRes.data || []).forEach((r: any) => {
      const dia = r.recorded_at.slice(0, 10);
      if (!dias[dia]) dias[dia] = "trabalhado";
    });

    // Atestados e férias
    (justRes.data || []).forEach((j: any) => {
      if (j.date) dias[j.date] = "atestado";
    });

    setCalendarioDias(dias);
  } catch {}
}, []);

const [timesheetSummary, setTimesheetSummary] = useState<{ horas_trabalhadas: number; horas_esperadas: number; diferenca: number; month: number; year: number; } | null>(null);

const fetchTimesheetSummary = useCallback(async (cpf: string) => {
  const cpfDigits = normalizeCpf(cpf);
  if (!cpfDigits || !navigator.onLine) return;
  try {
    const { data } = await (supabase as any).rpc("get_timesheet_summary_by_cpf", { p_cpf: cpfDigits });
    if (data && data.length > 0) setTimesheetSummary(data[0]);
  } catch {}
}, []);

const fetchAvisos = useCallback(async () => {
  if (!navigator.onLine) return;
  try {
    const { data } = await (supabase as any)
      .from("company_notices")
      .select("id, titulo, mensagem, tipo, created_at")
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(3);
    if (data) setAvisos(data);
  } catch {}
}, []);

const fetchPendingTimesheetCount = useCallback(async (cpf: string) => {
  const cpfDigits = normalizeCpf(cpf);
  if (!cpfDigits || !navigator.onLine) { setPendingTimesheetCount(0); return; }
  try {
    const { data } = await (supabase as any).rpc("get_pending_timesheets_by_cpf", { p_cpf: cpfDigits });
    setPendingTimesheetCount(Array.isArray(data) ? data.length : 0);
  } catch {}
}, []);

  const resetToStart = useCallback(() => {
    setShowSuccess(false);
    setSuccessMessage("");
    setSelectedEmployee(null);
    setValidatedEmployee(null);
    setValidatedContext(null);
    setSelectedShift(null);
    setRecords([]);
    setPendingEmployee(null);
    setCpfInput("");
    setValidatedCpf("");
    setCpfError("");
    setGeoStatus("");
    setShowConfirm(false);
    setShowHistory(false);
    setHistoryRecords([]);
    setShowDropdown(false);
    setShowCamera(false);
    setShowManualPunch(false);
    setShowJustification(false);
    setShowEpiAcceptance(false);
    setPendingEpiCount(0);
    setPendingEpis([]);
    setShowPayslipSign(false);
    setPendingPayslipCount(0);
    setPendingUniformCount(0);
    setPendingUniform([]);
    setPendingToolCount(0);
    setPendingTools([]);
    setLoading(false);
    setStatusNotice(null);
    setRecordsLoading(false);
    setServerStepInfo(null);
    setCalendarioDias({});
    navigate("/", { replace: true });
  }, [navigate]);

  // Online/offline listeners
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setStatusNotice("Sincronizando dados pendentes...");
      setIsSyncing(true);
      const result = await syncOfflineQueue();
      await fetchEmployees();
      const activeEmployeeId = selectedEmployee?.id ?? validatedContext?.employee_id;
      if (activeEmployeeId) {
        await fetchTodayRecords(activeEmployeeId);
      }
      if (validatedContext?.cpf_normalized) {
        await Promise.allSettled([
          fetchNextStep(validatedContext.cpf_normalized),
          fetchPendingEpiCount(validatedContext.cpf_normalized),
          fetchPendingPayslipCount(validatedContext.cpf_normalized),
          fetchPendingUniformCount(validatedContext.cpf_normalized),
          fetchPendingToolCount(validatedContext.cpf_normalized),
        ]);
      }
      setIsSyncing(false);
      if (result.synced > 0 || result.skipped > 0) {
        const detail = result.skipped > 0
          ? `${result.synced} novo(s) e ${result.skipped} já existente(s)`
          : `${result.synced} registro(s)`;
        toast.success(`Sincronização concluída: ${detail}.`);
        setStatusNotice("Sincronização concluída.");
      } else if (result.failed > 0) {
        setStatusNotice("Alguns registros continuam pendentes e serão reenviados automaticamente.");
      } else {
        setStatusNotice("Conexão restabelecida.");
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      const message = hasOfflineBase
        ? "Sem internet — modo offline ativo. Os registros serão salvos localmente."
        : OFFLINE_REQUIRED_MESSAGE;
      setStatusNotice(message);
      toast.warning(message);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) {
      void handleOnline();
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [hasOfflineBase, selectedEmployee]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial data load with error handling and retry
  const loadInitialData = useCallback(async () => {
    setInitialLoading(true);
    setLoadError(null);
    try {
      await fetchEmployees();
    } catch (err: any) {
      setLoadError(err?.message || "Erro ao carregar dados iniciais");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Revalidate on app focus (returning from background)
  useEffect(() => {
    let refreshTimer: number | null = null;

    const revalidateHomeData = () => {
  if (!navigator.onLine) return;
  void fetchEmployees();

  const activeEmployeeId = selectedEmployee?.id ?? validatedContext?.employee_id;
  if (activeEmployeeId) {
    void fetchTodayRecords(activeEmployeeId);
  }

  if (validatedContext?.cpf_normalized) {
    void fetchNextStep(validatedContext.cpf_normalized);
    void fetchPendingEpiCount(validatedContext.cpf_normalized);
    void fetchPendingPayslipCount(validatedContext.cpf_normalized);
    void fetchPendingUniformCount(validatedContext.cpf_normalized);
    void fetchPendingToolCount(validatedContext.cpf_normalized);
  void fetchPendingTimesheetCount(validatedContext.cpf_normalized);
    void fetchTimesheetSummary(validatedContext.cpf_normalized);
    void fetchCalendario(validatedContext.cpf_normalized);
    void fetchAvisos();
  }
};

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        revalidateHomeData();
      }
    };

    const handleAppResume = () => {
      revalidateHomeData();

      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        revalidateHomeData();
      }, 1200);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handleAppResume);
    window.addEventListener("focus", handleAppResume);

    if (validatedContext?.cpf_normalized) {
      handleAppResume();
    }

 const interval = setInterval(() => {
      if (validatedContext?.cpf_normalized) {
        void fetchPendingTimesheetCount(validatedContext.cpf_normalized);
      }
    }, 30000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handleAppResume);
      window.removeEventListener("focus", handleAppResume);
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      clearInterval(interval);
    };
  }, [selectedEmployee, validatedContext, fetchPendingEpiCount, fetchNextStep]);

  useEffect(() => {
    if (selectedEmployee) {
      fetchTodayRecords(selectedEmployee.id);
      // Always fetch server-driven next step when employee changes
      if (validatedContext?.cpf_normalized) {
        fetchNextStep(validatedContext.cpf_normalized);
      }
    }
  }, [selectedEmployee, validatedContext?.cpf_normalized]);

  useEffect(() => {
    if (!showSuccess) return;

    const successTimer = window.setTimeout(() => {
      resetToStart();
    }, 2000);

    return () => window.clearTimeout(successTimer);
  }, [showSuccess, resetToStart]);

  const fetchEmployees = async () => {
    const cachedSnapshot = getEmployeesCacheSnapshot();
    const cachedEmployees = cachedSnapshot.employees.filter((employee) => employee.active);

    if (cachedEmployees.length > 0) {
      setEmployees(cachedEmployees.map(mapCachedEmployeeToEmployee));
      setHasOfflineBase(true);
      setEmployeesSyncedAt(cachedSnapshot.synced_at);
    }

    if (!navigator.onLine) {
      if (cachedEmployees.length > 0) {
        setStatusNotice("Modo offline ativo usando a base local de colaboradores.");
        return;
      }

      setHasOfflineBase(false);
      setStatusNotice(OFFLINE_REQUIRED_MESSAGE);
      throw new Error(OFFLINE_REQUIRED_MESSAGE);
    }

    // Fetch employees via SECURITY DEFINER RPC (does not expose CPF via table policy)
    const { data: fullData, error: fullError } = await supabase.rpc("get_active_employees_with_cpf" as any);

    if (fullError) {
      console.error("Erro ao buscar colaboradores:", fullError);
      if (cachedEmployees.length > 0) {
        toast.warning("Falha ao atualizar colaboradores. Mantendo a última base local sincronizada.");
        setStatusNotice("Usando a última base local sincronizada de colaboradores.");
        return;
      }

      // Fallback to public RPC without CPF
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_active_employees_public");
      if (rpcError) {
        throw new Error("Erro ao carregar colaboradores");
      }
      if (rpcData) {
        const mapped = (rpcData as any[]).map((e: any) => ({
          ...e,
          active: true,
          created_at: "",
          cpf: null,
          jornada: e.punch_mode,
        })) as Employee[];
        setEmployees(mapped);
        setHasOfflineBase(false);
        setStatusNotice("Colaboradores carregados online, mas a base offline ainda não está disponível.");
      }
      return;
    }

    if (fullData) {
      // Cache full employee data for offline use
      const cachedList: CachedEmployee[] = (fullData as any[]).map((e: any) => ({
        id: e.id,
        name: e.name,
        cpf: e.cpf,
        shift: e.shift,
        jornada: e.punch_mode,
        punch_mode: e.punch_mode,
        has_cpf: !!(e.cpf && e.cpf.trim()),
        active: true,
        foto_url: e.foto_url || null,
        cargo: e.cargo || null,
      }));
      cacheEmployees(cachedList);
      setHasOfflineBase(cachedList.length > 0);
      setEmployeesSyncedAt(new Date().toISOString());

      setEmployees(cachedList.map(mapCachedEmployeeToEmployee));
      setStatusNotice(cachedList.length > 0 ? "Base offline de colaboradores atualizada." : null);
    }
  };

  const fetchTodayRecords = async (employeeId: string) => {
    const { dayKey, startIso, endIso } = getLocalDayRange();
    setRecordsLoading(true);

    // Also build yesterday's range for overnight journey detection
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { dayKey: yesterdayKey, startIso: yesterdayStartIso } = getLocalDayRange(yesterday);

    if (!navigator.onLine) {
      const cachedToday = getCachedRecords(employeeId, dayKey);
      const cachedYesterday = getCachedRecords(employeeId, yesterdayKey);
      const pendingToday = getPendingRecordsForEmployee(employeeId, dayKey);
      const pendingYesterday = getPendingRecordsForEmployee(employeeId, yesterdayKey);
      // Check for open overnight journey (has entrada yesterday, no saida)
      const allRecords = mergePunchRecords(cachedYesterday, cachedToday, pendingYesterday, pendingToday);
      const hasEntradaYesterday = cachedYesterday.some(r => r.step === "entrada");
      const hasSaida = allRecords.some(r => r.step === "saida");
      const merged = (hasEntradaYesterday && !hasSaida) ? allRecords : mergePunchRecords(cachedToday, pendingToday);
      setRecords(merged);
      setRecordsLoading(false);
      return merged;
    }

    // Fetch from yesterday to today to detect overnight journeys
    const { data, error } = await (supabase as any).rpc("get_today_records_for_employee", {
      p_employee_id: employeeId,
      p_start_ts: yesterdayStartIso,
      p_end_ts: endIso,
    });
    console.log("DEBUG PONTO [fetchTodayRecords]: employee_id:", employeeId, "range:", yesterdayStartIso, "→", endIso, "result:", data?.length ?? 0, "rows, error:", error);
    if (!error && data) {
      const allMapped = (data as TimeRecordRow[]).map(mapTimeRecordToPunchRecord);
      // Check for open overnight journey
      const todayStart = new Date(startIso).getTime();
      const yesterdayRecords = allMapped.filter(r => new Date(r.punched_at).getTime() < todayStart);
      const todayRecords = allMapped.filter(r => new Date(r.punched_at).getTime() >= todayStart);
      const hasEntradaYesterday = yesterdayRecords.some(r => r.step === "entrada");
      const hasSaida = allMapped.some(r => r.step === "saida");
      
      // Use full journey (yesterday+today) if overnight journey is open
      const relevantRecords = (hasEntradaYesterday && !hasSaida) ? allMapped : todayRecords;
      const pending = getPendingRecordsForEmployee(employeeId, dayKey);
      const merged = mergePunchRecords(relevantRecords, pending);
      setRecords(merged);
      cacheRecords(employeeId, merged);
      setRecordsLoading(false);
      return merged;
    }

    if (error) {
      console.error("DEBUG PONTO [fetchTodayRecords]: ERRO:", error);
    }
    setRecordsLoading(false);
    return [] as PunchRecord[];
  };

  const confirmTimeRecordPersisted = async ({
    employeeId,
    recordType,
    recordedAt,
  }: {
    employeeId: string;
    recordType: string;
    recordedAt: string;
  }) => {
    const persistedRecords = await fetchTodayRecords(employeeId);
    const persisted = persistedRecords.some(
      (record) => record.employee_id === employeeId && record.step === recordType && record.punched_at === recordedAt,
    );

    console.log("DEBUG PONTO [confirmPersisted]:", {
      employee_id: employeeId,
      record_type: recordType,
      recorded_at: recordedAt,
      persisted,
      total_records_loaded: persistedRecords.length,
    });

    return persisted;
  };

  const resolveEmployeeByCpf = async (cpf: string) => {
    const { data, error } = await (supabase as any).rpc("get_active_employee_by_cpf", {
      p_cpf: cpf,
    });

    if (error) {
      console.error("DEBUG PONTO: erro ao buscar colaborador por CPF:", error);
      throw new Error(error.message || "Erro ao consultar colaborador pelo CPF no banco.");
    }

    const matches = Array.isArray(data) ? data : [];

    if (matches.length !== 1) {
      throw new Error(matches.length > 1 ? "CPF duplicado no cadastro. Procure o administrador." : "CPF não encontrado no cadastro.");
    }

    return matches[0] as Employee;
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    if (!navigator.onLine) return null;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        { headers: { "Accept-Language": "pt-BR" } }
      );
      const data = await res.json();
      if (data?.display_name) {
        const parts = data.display_name.split(",").slice(0, 3);
        return parts.join(",").trim();
      }
      return null;
    } catch {
      return null;
    }
  };

  const getLocation = (): Promise<{ lat: number; lng: number; address: string | null } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGeoStatus("Geolocalização não suportada");
        resolve(null);
        return;
      }
      setGeoStatus("Obtendo localização...");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          if (!navigator.onLine) {
            setGeoStatus("Localização obtida ✓ (sem endereço no modo offline)");
            resolve({ lat, lng, address: null });
            return;
          }

          setGeoStatus("Obtendo endereço...");
          const address = await reverseGeocode(lat, lng);
          setGeoStatus(address || "Localização obtida ✓");
          resolve({ lat, lng, address });
        },
        () => {
          setGeoStatus("Localização não disponível");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const uploadPhoto = async (blob: Blob, employeeId: string): Promise<string | null> => {
    if (!navigator.onLine) return null;
    const fileName = `${employeeId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("punch-photos")
      .upload(fileName, blob, { contentType: "image/jpeg" });
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    // Return the file path (not public URL) — signed URLs generated on demand
    return fileName;
  };

  const handlePunchWithPhoto = async (photoBlob: Blob) => {
    setShowCamera(false);
    if (!validatedContext) {
      console.error("DEBUG PONTO [insert]: BLOQUEIO — sem contexto validado");
      toast.error("Erro interno: contexto de validação perdido. Volte ao início e tente novamente.");
      return;
    }
    // When online, MUST have server step info to prevent sending wrong record_type
    if (navigator.onLine && !serverStepInfo) {
      console.error("DEBUG PONTO [insert]: BLOQUEIO — serverStepInfo ainda não carregado");
      toast.error("Aguarde a consulta da próxima etAMR no servidor.");
      return;
    }
    if (navigator.onLine && serverStepInfo?.day_complete) {
      toast.info("Todos os registros do dia já foram concluídos.");
      return;
    }
    setLoading(true);
    let uploadedPhotoPath: string | null = null;
    try {
      const location = await getLocation();

      // Use server's next_step as the ONLY source of truth for record_type when online
      const serverNextStep = serverStepInfo?.next_step;
      const step = nextAllowedStep;
      const recordType = navigator.onLine && serverNextStep ? serverNextStep : step?.key;

      if (!recordType || !step) {
        throw new Error("Todos os registros do dia já foram concluídos.");
      }

      console.log("DEBUG PONTO [insert]: record_type usado:", recordType, "| serverNextStep:", serverNextStep, "| step.key:", step?.key);

      const { employee_id: employeeId, cpf_normalized: cpfDigits, name: empName } = validatedContext;
      const recordedAt = new Date().toISOString();
      const localPunchId = crypto.randomUUID();

      console.log("DEBUG PONTO [insert]: contexto usado:", JSON.stringify({
        name: empName,
        employee_id: employeeId,
        cpf: cpfDigits.slice(0, 3) + "***",
        record_type: recordType,
        mode: navigator.onLine ? "online" : "offline",
      }));

      if (!cpfDigits) {
        throw new Error("CPF validado não encontrado no contexto. Volte ao início.");
      }

      const punchData: TimeRecordInsert = {
        employee_id: employeeId,
        record_type: recordType,
        recorded_at: recordedAt,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        mode: navigator.onLine ? "online" : "offline",
        sync_status: "pending", // Always starts as pending — only becomes "synced" after confirmed insert
      };

      console.log("DEBUG PONTO [insert]: payload enviado:", {
        employee_id: employeeId,
        p_cpf: cpfDigits.slice(0, 3) + "***",
        p_record_type: recordType,
        p_recorded_at: recordedAt,
        p_latitude: location?.lat ?? null,
        p_longitude: location?.lng ?? null,
        p_mode: navigator.onLine ? "online" : "offline",
        p_sync_status: navigator.onLine ? "synced" : "pending",
      });

      if (navigator.onLine) {
        const rpcResponse = await supabase.rpc("insert_time_record_with_cpf" as any, {
          p_cpf: cpfDigits,
          p_record_type: recordType,
          p_recorded_at: recordedAt,
          p_latitude: location?.lat ?? null,
          p_longitude: location?.lng ?? null,
          p_mode: "online",
          p_sync_status: "synced",
        });
        console.log("DEBUG PONTO [insert]: resposta RPC:", rpcResponse);
        if (rpcResponse.error) {
          console.error("DEBUG PONTO [insert]: erro detalhado:", JSON.stringify(rpcResponse.error));
          throw new Error(rpcResponse.error.message || rpcResponse.error.details || "Falha no insert em public.time_records.");
        }

        // RPC returned a UUID = insert confirmed by the database. Trust it.
        const returnedId = rpcResponse.data;
        console.log("DEBUG PONTO [insert]: SUCESSO CONFIRMADO pelo banco, id:", returnedId);

        // Upload photo and save punch_record with photo link
        if (photoBlob) {
          uploadedPhotoPath = await uploadPhoto(photoBlob, employeeId);
          console.log("DEBUG PONTO [photo]: upload resultado:", uploadedPhotoPath);
        }

        // Salva foto e endereço direto no time_records
        if (returnedId && (uploadedPhotoPath || location?.address)) {
          const { error: updError } = await (supabase as any).from("time_records")
            .update({
              photo_url: uploadedPhotoPath ?? null,
              address: location?.address ?? null,
            })
            .eq("id", returnedId);
          if (updError) {
            console.warn("DEBUG PONTO [foto/endereço]: erro ao salvar:", updError.message);
          }
        }

        // Refresh records and next step from server
        await fetchTodayRecords(employeeId);
        await fetchNextStep(cpfDigits);
        setStatusNotice(null);
        setSuccessMessage(`${step.label} registrada com sucesso!`);
        setShowSuccess(true);
      } else {
        const saved = addToOfflineQueue({
          id: localPunchId,
          ...punchData,
          cpf: cpfDigits,
          record_type: recordType,
          recorded_at: recordedAt,
        });

        const localRecord = mapTimeRecordToPunchRecord({
            id: localPunchId,
            ...punchData,
            created_at: recordedAt,
          });

        setRecords((prev) => mergePunchRecords(prev, [localRecord]));
        setStatusNotice(saved
          ? "Registro salvo offline e pendente de sincronização."
          : "Este registro offline já estava salvo localmente.");
        setSuccessMessage(`${step.label} salva offline — será sincronizada automaticamente.`);
        setShowSuccess(true);
      }
    } catch (err: any) {
      console.error("DEBUG PONTO [insert]: ERRO:", err);
      const msg = err?.message || err?.details || "Erro desconhecido";
      if (msg.includes("já existe")) {
        toast.error("Este registro já foi realizado hoje. Siga a próxima etAMR.");
        // Refresh server state to show correct next step
        if (validatedContext?.cpf_normalized) {
          await fetchNextStep(validatedContext.cpf_normalized);
        }
      } else {
        toast.error(`Erro ao registrar ponto: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };



  const getRecordForStep = (key: PunchStep) =>
    sequenceState.accepted.find((r) => r.step === key);

  const getWorkedTime = () => {
    const entrada = getRecordForStep("entrada");
    const intervalo = getRecordForStep("intervalo");
    const retorno = getRecordForStep("retorno");
    const saida = getRecordForStep("saida");

    let totalMs = 0;
    if (entrada && intervalo) {
      const diff = new Date(intervalo.punched_at).getTime() - new Date(entrada.punched_at).getTime();
      if (diff > 0) totalMs += diff;
    } else if (entrada && !intervalo) {
      const diff = now.getTime() - new Date(entrada.punched_at).getTime();
      if (diff > 0) totalMs += diff;
    }
    if (retorno && saida) {
      const diff = new Date(saida.punched_at).getTime() - new Date(retorno.punched_at).getTime();
      if (diff > 0) totalMs += diff;
    } else if (retorno && !saida) {
      const diff = now.getTime() - new Date(retorno.punched_at).getTime();
      if (diff > 0) totalMs += diff;
    }
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    return `${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m`;
  };

  // Fullscreen overlays
  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handlePunchWithPhoto}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  if (showManualPunch && selectedEmployee && validatedContext) {
    return (
      <ManualPunch
        employee={selectedEmployee}
        cpf={validatedContext.cpf_normalized}
        onClose={() => setShowManualPunch(false)}
        onSuccess={() => fetchTodayRecords(selectedEmployee.id)}
      />
    );
  }

  if (showJustification && selectedEmployee && validatedContext) {
    return (
      <AbsenceJustification
        employee={selectedEmployee}
        cpf={validatedContext.cpf_normalized}
        onClose={() => setShowJustification(false)}
        onSuccess={() => {}}
      />
    );
  }

  if (showEpiAcceptance && selectedEmployee && validatedContext) {
    return (
      <EpiAcceptance
        cpf={validatedContext.cpf_normalized}
        employeeName={selectedEmployee.name}
        onClose={() => setShowEpiAcceptance(false)}
        pendingCount={pendingEpiCount}
        onAccepted={() => fetchPendingEpiCount(validatedContext.cpf_normalized)}
      />
    );
  }

  if (showDocumentos && selectedEmployee) {
  return (
    <MeusDocumentos
      employeeName={selectedEmployee.name}
      cpf={validatedContext?.cpf_normalized}
      onClose={() => setShowDocumentos(false)}
    />
  );
}

  if (showUniformAcceptance && selectedEmployee && validatedContext) {
    return (
      <UniformAcceptance
        cpf={validatedContext.cpf_normalized}
        employeeName={selectedEmployee.name}
        onClose={() => setShowUniformAcceptance(false)}
        onAccepted={() => fetchPendingUniformCount(validatedContext.cpf_normalized)}
      />
    );
  }

  if (showToolAcceptance && selectedEmployee && validatedContext) {
   return (
      <ToolAcceptance
        cpf={validatedContext.cpf_normalized}
        employeeName={selectedEmployee.name}
        onClose={() => setShowToolAcceptance(false)}
        onAccepted={() => fetchPendingToolCount(validatedContext.cpf_normalized)}
      />
    );
  }
  if (showTimesheetSign && selectedEmployee && validatedContext) {
    return (
      <TimesheetSign
        cpf={validatedContext.cpf_normalized}
        employeeName={selectedEmployee.name}
        onClose={() => setShowTimesheetSign(false)}
        onSigned={() => fetchPendingTimesheetCount(validatedContext.cpf_normalized)}
      />
    );
  }
  if (showPayslipSign && selectedEmployee && validatedContext) {
    return (
      <PayslipSign
        cpf={validatedContext.cpf_normalized}
        employeeName={selectedEmployee.name}
        onClose={() => setShowPayslipSign(false)}
        onSigned={() => fetchPendingPayslipCount(validatedContext.cpf_normalized)}
      />
    );
  }

  const formatCpfInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const verifyCpf = async () => {
    if (!pendingEmployee) return;
    const cpfDigits = normalizeCpf(cpfInput);

    console.log("DEBUG PONTO [verifyCpf]: CPF digitado:", cpfInput, "| normalizado:", cpfDigits);
    console.log("DEBUG PONTO [verifyCpf]: colaborador selecionado:", pendingEmployee.name, "| id:", pendingEmployee.id);

    if (!cpfDigits || cpfDigits.length < 11) {
      setCpfError("CPF deve ter 11 dígitos.");
      return;
    }

    // OFFLINE: validate CPF using local cache
    if (!navigator.onLine) {
      const offlineMatch = findEmployeeByCpfOffline(cpfInput);
      if (!offlineMatch) {
        setCpfError("CPF não encontrado nos dados locais.");
        console.log("DEBUG PONTO [verifyCpf]: BLOQUEIO offline — CPF não encontrado no cache");
        return;
      }
      if (offlineMatch.id !== pendingEmployee.id) {
        setValidatedEmployee(null);
        setValidatedContext(null);
        setCpfError("O CPF informado não corresponde ao colaborador selecionado.");
        console.log("DEBUG PONTO [verifyCpf]: BLOQUEIO offline — id do cache:", offlineMatch.id, "≠ selecionado:", pendingEmployee.id);
        return;
      }
      const ctx: ValidatedContext = {
        employee_id: offlineMatch.id,
        name: offlineMatch.name,
        cpf_normalized: normalizeCpf(offlineMatch.cpf || cpfInput),
        punch_mode: offlineMatch.punch_mode,
        shift: offlineMatch.shift,
        validated_at: new Date().toISOString(),
        source: "offline",
      };
      const empFromCache = mapCachedEmployeeToEmployee(offlineMatch);
      setValidatedContext(ctx);
      setValidatedCpf(ctx.cpf_normalized);
      setSelectedEmployee(empFromCache);
      setValidatedEmployee(empFromCache);
      setPendingEmployee(null);
      setCpfInput("");
      setCpfError("");
      console.log("DEBUG PONTO [verifyCpf]: ✓ contexto validado offline:", JSON.stringify(ctx));
      setStatusNotice("CPF validado offline.");
     toast.info("CPF validado offline ✓");
      fetchPendingEpiCount(ctx.cpf_normalized);
      fetchPendingPayslipCount(ctx.cpf_normalized);
      fetchPendingTimesheetCount(ctx.cpf_normalized);
      fetchTimesheetSummary(ctx.cpf_normalized);
      return;
    }
    // ONLINE: validate CPF via database
    try {
      const employeeFromCpf = await resolveEmployeeByCpf(cpfInput);
      console.log("DEBUG PONTO [verifyCpf]: colaborador encontrado no banco:", employeeFromCpf.name, "| id:", employeeFromCpf.id);

      if (employeeFromCpf.id !== pendingEmployee.id) {
        setValidatedCpf("");
        setValidatedEmployee(null);
        setValidatedContext(null);
        setCpfError("O CPF informado não corresponde ao colaborador selecionado.");
        console.log("DEBUG PONTO [verifyCpf]: BLOQUEIO — id banco:", employeeFromCpf.id, "≠ selecionado:", pendingEmployee.id);
        return;
      }

      const ctx: ValidatedContext = {
        employee_id: employeeFromCpf.id,
        name: employeeFromCpf.name,
        cpf_normalized: normalizeCpf((employeeFromCpf as any).cpf || cpfInput),
        punch_mode: (employeeFromCpf as any).punch_mode || "full",
        shift: (employeeFromCpf as any).shift || "diurno",
        validated_at: new Date().toISOString(),
        source: "online",
      };
      setValidatedContext(ctx);
      setValidatedCpf(ctx.cpf_normalized);
      setSelectedEmployee(employeeFromCpf);
      setValidatedEmployee(employeeFromCpf);
      setPendingEmployee(null);
      setCpfInput("");
      setCpfError("");
      setStatusNotice(null);
      console.log("DEBUG PONTO [verifyCpf]: ✓ contexto validado online:", JSON.stringify(ctx));
      // Fetch server-driven next step
      await fetchNextStep(ctx.cpf_normalized);
      fetchPendingEpiCount(ctx.cpf_normalized);
      fetchPendingPayslipCount(ctx.cpf_normalized);
      fetchTimesheetSummary(ctx.cpf_normalized);
    } catch (error: any) {
      setValidatedCpf("");
      setValidatedEmployee(null);
      setValidatedContext(null);
      setCpfError(error?.message || "CPF incorreto. Tente novamente.");
      console.log("DEBUG PONTO [verifyCpf]: ERRO na validação:", error?.message);
    }
  };

  const enviarSolicitacao = async (tipo: string) => {
    if (!selectedEmployee) return;
    setEnviandoSolicitacao(true);
    try {
      const { error } = await (supabase as any).from("employee_requests").insert({
        employee_id: selectedEmployee.id,
        tipo,
        observacao: solicitacaoTexto || null,
        status: "pendente",
      });
      if (error) throw error;
      toast.success(`Solicitação de ${tipo} enviada ao RH! ✅`);
      setShowSolicitacao(null);
      setSolicitacaoTexto("");
    } catch (e: any) {
      toast.error("Erro ao enviar solicitação: " + e.message);
    } finally {
      setEnviandoSolicitacao(false);
    }
  };

  // Fetch history for employee (last 30 days)
  const fetchHistory = async () => {
    if (!selectedEmployee) return;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data } = await (supabase as any)
      .from("time_records")
      .select("*")
      .eq("employee_id", selectedEmployee.id)
      .gte("recorded_at", thirtyDaysAgo.toISOString())
      .order("recorded_at", { ascending: false });
    if (data) setHistoryRecords((data as TimeRecordRow[]).map(mapTimeRecordToPunchRecord));

    // Busca saldo e histórico de férias
    try {
      const [saldoRes, feriasRes, afastRes] = await Promise.all([
        (supabase as any).rpc("get_saldo_ferias", { p_employee_id: selectedEmployee.id }),
        (supabase as any).from("ferias").select("*").eq("employee_id", selectedEmployee.id).order("created_at", { ascending: false }),
        (supabase as any).from("afastamentos").select("*").eq("employee_id", selectedEmployee.id).order("data_inicio", { ascending: false }),
      ]);
      if (saldoRes.data && saldoRes.data.length > 0) setFeriasSaldo(saldoRes.data[0]);
      if (feriasRes.data) setFeriasHistorico(feriasRes.data);
      if (afastRes.data) setAfastamentosHistorico(afastRes.data);
    } catch (e) {
      console.error("Erro ao buscar férias/afastamentos", e);
    }

    setHistoryTab("pontos");
    setShowHistory(true);
  };

  // Punch confirmation handler
  const confirmPunch = () => {
    setShowConfirm(false);
    setShowCamera(true);
  };

  // Get offline pending count
  const pendingCount = getOfflineQueue().length;

  const handleManualSync = async () => {
    if (!navigator.onLine) { toast.error("Sem conexão"); return; }
    setStatusNotice("Sincronizando dados pendentes...");
    setIsSyncing(true);
    const result = await syncOfflineQueue();
    setIsSyncing(false);
    if (result.synced > 0 || result.skipped > 0) {
      const detail = result.skipped > 0
        ? `${result.synced} novo(s) e ${result.skipped} já existente(s)`
        : `${result.synced} registro(s)`;
      toast.success(`Sincronização concluída: ${detail}.`);
      setStatusNotice("Sincronização concluída.");
      if (selectedEmployee) void fetchTodayRecords(selectedEmployee.id);
    } else if (result.failed > 0) {
      setStatusNotice("Alguns registros continuam pendentes e serão reenviados automaticamente.");
    } else {
      setStatusNotice("Nenhum registro pendente para sincronizar.");
      toast.info("Nenhum registro pendente");
    }
  };

  // Connection status indicator (always visible)
  const ConnectionIndicator = () => (
    <div className="fixed top-0 left-0 right-0 z-50 text-center text-xs py-1 flex items-center justify-center gap-1.5 transition-colors duration-300"
      style={{
        background: isSyncing
          ? "linear-gradient(90deg, hsl(210 70% 20% / 0.9), hsl(200 60% 25% / 0.9))"
          : isOnline
            ? "linear-gradient(90deg, hsl(150 60% 15% / 0.85), hsl(160 50% 18% / 0.85))"
            : "linear-gradient(90deg, hsl(0 70% 20% / 0.9), hsl(10 60% 22% / 0.9))",
        color: isSyncing ? "hsl(200 80% 75%)" : isOnline ? "hsl(150 70% 75%)" : "hsl(0 80% 85%)",
        backdropFilter: "blur(8px)",
      }}
    >
      {isSyncing ? (
        <><RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando...</>
      ) : isOnline ? (
        <>
          <Wifi className="w-3 h-3" /> Online
          {pendingCount > 0 && (
            <button onClick={handleManualSync} className="ml-2 underline opacity-80 hover:opacity-100">
              {pendingCount} pendente(s) — sincronizar
            </button>
          )}
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" /> {hasOfflineBase ? "Sem conexão • modo offline ativo" : "Sem conexão"}
          {pendingCount > 0 && <span className="ml-1">• {pendingCount} pendente(s)</span>}
        </>
      )}
    </div>
  );

 // Initial loading screen
  if (initialLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
        <img src={logo} alt="APA" className="w-24 h-24 object-contain mb-6" style={{ filter: "drop-shadow(0 4px 16px rgba(30,64,175,0.25))" }} />
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Carregando sistema...</p>
      </div>
    );
  }

// Error screen with retry
  if (loadError && employees.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
        <div className="text-center space-y-4 bg-white p-8 rounded-2xl max-w-sm w-full" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: "#fff1f2" }}>
            <WifiOff className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-base font-black text-gray-800">Erro ao carregar dados</p>
          <p className="text-sm text-gray-400">{loadError}</p>
          <button
            onClick={loadInitialData}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg"
            style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)", boxShadow: "0 4px 16px rgba(30,64,175,0.3)" }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

// Success overlay
  if (showSuccess) {
    const stepColors: Record<string, { from: string; to: string; emoji: string }> = {
      entrada: { from: "#16a34a", to: "#22c55e", emoji: "🟢" },
      intervalo: { from: "#d97706", to: "#f59e0b", emoji: "🟡" },
      retorno: { from: "#2563eb", to: "#3b82f6", emoji: "🔵" },
      saida: { from: "#dc2626", to: "#ef4444", emoji: "🔴" },
    };
    const lastStep = records.length > 0 ? [...records].sort((a, b) => new Date(b.punched_at).getTime() - new Date(a.punched_at).getTime())[0]?.step : "entrada";
    const colors = stepColors[lastStep || "entrada"] || stepColors.entrada;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden" style={{ background: "#F0F4F8" }}>
        <ConnectionIndicator />

        {/* Círculos animados de fundo */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-96 h-96 rounded-full opacity-10 animate-ping" style={{ background: `radial-gradient(circle, ${colors.from}, transparent)`, animationDuration: "1.5s" }} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 rounded-full opacity-15 animate-ping" style={{ background: `radial-gradient(circle, ${colors.from}, transparent)`, animationDuration: "1s", animationDelay: "0.2s" }} />
        </div>

        <div className="text-center animate-in fade-in zoom-in duration-500 relative z-10">
          {/* Ícone principal */}
          <div className="relative mx-auto mb-6 w-32 h-32">
            <div className="w-32 h-32 rounded-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`, boxShadow: `0 0 60px ${colors.from}50` }}>
              <CheckCircle2 className="w-16 h-16 text-white" />
            </div>
            {/* Partículas decorativas */}
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <div key={deg} className="absolute w-3 h-3 rounded-full animate-ping"
                style={{
                  background: colors.from,
                  top: `${50 + 45 * Math.sin((deg * Math.PI) / 180)}%`,
                  left: `${50 + 45 * Math.cos((deg * Math.PI) / 180)}%`,
                  animationDelay: `${deg / 360}s`,
                  animationDuration: "1.2s",
                  opacity: 0.7,
                }} />
            ))}
          </div>

          {/* Mensagem */}
          <div className="bg-white rounded-2xl px-8 py-6 mb-4 mx-4" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            <p className="text-4xl mb-2">{colors.emoji}</p>
            <h2 className="text-2xl font-black text-gray-800 mb-1">Ponto Registrado!</h2>
            <p className="text-base font-semibold mb-1" style={{ color: colors.from }}>{successMessage}</p>
            <p className="text-xs text-gray-400">
              {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
          </div>

          {/* Barra de progresso */}
          <div className="w-full max-w-xs mx-auto mb-4 px-4">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full animate-[width_2s_linear_forwards]"
                style={{ background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`, width: "100%", transition: "width 2s linear" }} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-center">Redirecionando automaticamente...</p>
          </div>

          <button
            onClick={resetToStart}
            className="h-12 rounded-xl px-8 font-bold text-sm text-white transition-all hover:shadow-lg active:scale-95"
            style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`, boxShadow: `0 4px 16px ${colors.from}50` }}
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }
// Confirmation dialog
  if (showConfirm && selectedEmployee && nextAllowedStep) {
    const step = nextAllowedStep;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative" style={{ background: "#F0F4F8" }}>
        <ConnectionIndicator />
        <div className="w-full max-w-sm p-8 rounded-2xl border border-gray-100 bg-white text-center" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#eff6ff" }}>
            <step.icon className="w-8 h-8" style={{ color: "#1e40af" }} />
          </div>
          <h3 className="text-lg font-black text-gray-800 mb-2">Confirmar registro?</h3>
          <p className="text-sm text-gray-500 mb-6">
            Registrar <strong style={{ color: "#1e40af" }}>{step.label}</strong> para {selectedEmployee.name}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 h-12 rounded-xl border border-gray-200 font-medium text-sm text-gray-500 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmPunch}
              className="flex-1 h-12 rounded-xl font-bold text-sm text-white transition-all hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)", boxShadow: "0 4px 16px rgba(30,64,175,0.3)" }}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  }

 // History screen
  if (showHistory && selectedEmployee) {
    const journeys = groupRecordsIntoJourneys(historyRecords).reverse();
    const STEP_LABELS: Record<string, string> = { entrada: "Entrada", intervalo: "Intervalo", retorno: "Retorno", saida: "Saída" };

    return (
      <div className="min-h-screen flex flex-col px-4 py-6 relative" style={{ background: "#F0F4F8" }}>
        <ConnectionIndicator />
        <div className="w-full max-w-md mx-auto" style={{ marginTop: "28px" }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              Meu Histórico
            </h2>
            <button
              onClick={() => setShowHistory(false)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-700 transition-colors"
              style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
          </div>

          <p className="text-xs text-gray-400 mb-4">{selectedEmployee.name} • Últimos 30 dias</p>

          {/* Sub-abas */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
            {[
              { key: "pontos", label: "🕐 Pontos" },
              { key: "banco", label: "🏦 Banco de Horas" },
              { key: "ferias", label: "🏖️ Férias" },
              { key: "afastamentos", label: "🏥 Afastamentos" },
            ].map((t) => (
              <button key={t.key}
                onClick={() => setHistoryTab(t.key as any)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  historyTab === t.key ? "text-white" : "text-gray-500 bg-white"
                }`}
                style={historyTab === t.key ? { background: "linear-gradient(135deg, #1e40af, #0ea5e9)" } : { border: "1px solid #e2e8f0" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── ABA PONTOS ── */}
          {historyTab === "pontos" && (
            journeys.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <p className="text-gray-400">Nenhum registro encontrado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {journeys.map((journey, ji) => (
                  <div key={ji} className="bg-white p-4 rounded-2xl border border-gray-100" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-sm font-bold text-gray-700 capitalize">{journey.label}</p>
                      {!journey.complete && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#fff7ed", color: "#c2410c" }}>Aberta</span>
                      )}
                      {journey.complete && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#f0fdf4", color: "#15803d" }}>Completa</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {journey.records.map((rec) => (
                        <div key={rec.id} className="flex items-center justify-between">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: "#eff6ff", color: "#1e40af" }}>
                            {STEP_LABELS[rec.step] || rec.step}
                          </span>
                          <div className="flex items-center gap-2">
                            {(rec as any).address && <MapPin className="w-3 h-3 text-emerald-500" />}
                            <span className="tabular-nums text-sm font-semibold text-gray-700">
                              {formatTime(rec.punched_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── ABA BANCO DE HORAS ── */}
          {historyTab === "banco" && (
            <div className="space-y-3">
              {timesheetSummary ? (
                <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                    {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][timesheetSummary.month - 1]}/{timesheetSummary.year}
                  </p>
                  <p className="text-4xl font-black tabular-nums mb-1"
                    style={{ color: timesheetSummary.diferenca >= 0 ? "#16a34a" : "#e11d48" }}>
                    {timesheetSummary.diferenca >= 0 ? "+" : ""}{Math.floor(Math.abs(timesheetSummary.diferenca))}h{String(Math.round((Math.abs(timesheetSummary.diferenca) % 1) * 60)).padStart(2, "0")}
                  </p>
                  <p className="text-xs font-medium mb-4" style={{ color: timesheetSummary.diferenca >= 0 ? "#16a34a" : "#e11d48" }}>
                    {timesheetSummary.diferenca >= 0 ? "Saldo positivo este mês" : "Saldo negativo este mês"}
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                    <div>
                      <p className="text-[10px] text-gray-400">Horas trabalhadas</p>
                      <p className="text-sm font-bold text-gray-700">{timesheetSummary.horas_trabalhadas?.toFixed(1)}h</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">Horas esperadas</p>
                      <p className="text-sm font-bold text-gray-700">{timesheetSummary.horas_esperadas?.toFixed(1)}h</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <p className="text-gray-400">Sem dados de banco de horas.</p>
                </div>
              )}
            </div>
          )}

          {/* ── ABA FÉRIAS ── */}
          {historyTab === "ferias" && (
            <div className="space-y-3">
              {feriasSaldo ? (
                <>
                  <div className={`rounded-2xl p-5 border-2 ${feriasSaldo.vencido ? "border-rose-300 bg-rose-50" : "border-emerald-300 bg-emerald-50"}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                      Período {new Date(feriasSaldo.periodo_inicio + "T12:00:00").toLocaleDateString("pt-BR")} → {new Date(feriasSaldo.periodo_fim + "T12:00:00").toLocaleDateString("pt-BR")}
                    </p>
                    <p className={`text-4xl font-black ${feriasSaldo.vencido ? "text-rose-600" : "text-emerald-600"}`}>
                      {feriasSaldo.dias_disponiveis}
                    </p>
                    <p className="text-xs text-gray-500">dia(s) disponível(is) de {feriasSaldo.dias_direito}</p>
                    {feriasSaldo.vencido && (
                      <p className="text-xs font-bold text-rose-600 mt-2">⚠️ Período vencido — fale com o RH</p>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl p-4 grid grid-cols-2 gap-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-600">{feriasSaldo.dias_descanso_usados}d</p>
                      <p className="text-[10px] text-gray-400">Descanso usado</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-amber-600">{feriasSaldo.dias_abono_usados}d</p>
                      <p className="text-[10px] text-gray-400">Abono vendido</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <p className="text-gray-400">Sem dados de férias cadastrados.</p>
                </div>
              )}

              {feriasHistorico.length > 0 && (
                <div className="bg-white rounded-2xl p-4 space-y-2" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Histórico</p>
                  {feriasHistorico.map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span>{f.tipo === "descanso" ? "🏖️" : "💰"}</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{f.tipo === "descanso" ? "Descanso" : "Abono"} — {f.dias}d</p>
                          {f.data_inicio && (
                            <p className="text-[10px] text-gray-400">{new Date(f.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")} → {new Date(f.data_fim + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ABA AFASTAMENTOS ── */}
          {historyTab === "afastamentos" && (
            <div className="space-y-3">
              {afastamentosHistorico.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <p className="text-gray-400">Nenhum afastamento registrado.</p>
                </div>
              ) : (
                afastamentosHistorico.map((a: any) => {
                  const labels: Record<string, string> = {
                    licenca_medica: "Licença Médica", licenca_maternidade: "Lic. Maternidade",
                    licenca_paternidade: "Lic. Paternidade", ferias: "Férias",
                    acidente_trabalho: "Acidente de Trabalho", suspensao: "Suspensão", outro: "Afastado",
                  };
                  const hoje = new Date().toISOString().slice(0, 10);
                  const ativo = a.data_inicio <= hoje && a.data_fim >= hoje;
                  return (
                    <div key={a.id} className="bg-white rounded-2xl p-4 flex items-center gap-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: ativo ? "#dbeafe" : "#f1f5f9" }}>
                        🏥
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-700">{labels[a.tipo] || a.tipo}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(a.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")} → {new Date(a.data_fim + "T12:00:00").toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      {ativo && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#dbeafe", color: "#1e40af" }}>Ativo</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // CPF verification screen
  if (pendingEmployee) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative" style={{ background: "#F0F4F8" }}>
        <ConnectionIndicator />

        <div className="w-full max-w-sm flex flex-col items-center" style={{ marginTop: "28px" }}>
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <img src={logo} alt="APA" className="w-32 h-32 object-contain mb-2" style={{ filter: "drop-shadow(0 4px 20px rgba(30,64,175,0.3))" }} />
            <p className="font-bold text-lg text-gray-800 tracking-tight">APA Refrigeração e Climatização</p>
            <p className="text-xs text-gray-400 tracking-wider">Sistema de Registro de Ponto</p>
          </div>

          {/* Card */}
          <div className="w-full bg-white rounded-2xl px-6 py-6 space-y-4" style={{ boxShadow: "0 2px 16px rgba(30,64,175,0.10)" }}>
            <div className="text-center mb-2">
              <p className="text-xl font-black text-gray-800">{pendingEmployee.name}</p>
              <p className="text-sm text-gray-400 mt-1">Informe seu CPF para continuar</p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpfInput}
              onChange={(e) => { setCpfInput(formatCpfInput(e.target.value)); setCpfError(""); }}
              onKeyDown={(e) => e.key === "Enter" && verifyCpf()}
              className="flex h-14 w-full rounded-xl px-4 py-2 text-lg text-center tracking-widest border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all text-gray-800 bg-gray-50"
            />

            {cpfError && (
              <p className="text-sm text-red-500 text-center font-medium">{cpfError}</p>
            )}

            <button
              onClick={verifyCpf}
              className="w-full h-14 rounded-xl text-base font-bold tracking-wide transition-all duration-200 hover:shadow-lg text-white"
              style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)", boxShadow: "0 4px 16px rgba(30,64,175,0.3)" }}
            >
              Confirmar
            </button>

            <button
              className="w-full py-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1"
              onClick={() => { setPendingEmployee(null); setValidatedEmployee(null); setCpfInput(""); setCpfError(""); }}
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

 // ---- SHIFT SELECTION SCREEN ----
  if (!selectedShift) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative" style={{ background: "#F0F4F8" }}>
        <ConnectionIndicator />

        <div className="w-full max-w-md flex flex-col items-center" style={{ marginTop: "28px" }}>
          {/* Logo destacada sem card */}
          <div className="flex flex-col items-center mb-4">
            <img src={logo} alt="APA" className="w-44 h-44 object-contain mb-3" style={{ filter: "drop-shadow(0 4px 24px rgba(30,64,175,0.35))" }} />
            <p className="font-bold text-xl text-gray-800 tracking-tight">APA Refrigeração e Climatização</p>
            <p className="text-sm text-gray-400 tracking-wider">Sistema de Registro de Ponto</p>

            {weather && (
              <div className="mt-3 flex items-center gap-3 bg-white rounded-full px-4 py-2 shadow-sm border border-gray-100">
                <WeatherIcon code={weather.weatherCode} hour={currentHour} />
                <span className="font-bold text-gray-700">{weather.temp}°C</span>
                <span className="text-gray-300">|</span>
                <Droplets className="w-4 h-4 text-blue-400" />
                <span className="text-gray-500 text-sm">{weather.humidity}%</span>
                <Wind className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500 text-sm">{weather.windspeed} km/h</span>
              </div>
            )}
            {weather && (
              <p className="text-gray-400 text-xs italic mt-2">{getDynamicPhrase(currentHour, weather.weatherCode)}</p>
            )}
          </div>

          {/* Relógio */}
          <div className="w-full bg-white rounded-2xl px-5 py-4 mb-6 text-center" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <p className="text-4xl font-black tabular-nums" style={{ color: "#1e40af" }}>{formatTime(now)}</p>
            <p className="text-sm text-gray-400 capitalize mt-1">{formatDate(now)}</p>
          </div>

          {/* Título */}
          <p className="text-lg font-bold text-gray-700 mb-4">Selecione sua equipe</p>

          {/* Cards de turno */}
          <div className="w-full grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 border border-blue-100"
              style={{ boxShadow: "0 2px 12px rgba(30,64,175,0.08)" }}
              onClick={() => setSelectedShift("diurno")}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#eff6ff" }}>
                <Sun className="w-6 h-6 text-yellow-500" />
              </div>
              <p className="font-bold text-sm text-gray-700">EQUIPE DIURNA</p>
              <button className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)", boxShadow: "0 4px 12px rgba(30,64,175,0.3)" }}>
                Entrar <LogIn className="w-4 h-4 ml-1 inline-block" />
              </button>
            </div>

            <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 border border-indigo-100"
              style={{ boxShadow: "0 2px 12px rgba(99,102,241,0.08)" }}
              onClick={() => setSelectedShift("noturno")}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#eef2ff" }}>
                <Moon className="w-6 h-6 text-indigo-500" />
              </div>
              <p className="font-bold text-sm text-gray-700">EQUIPE NOTURNA</p>
              <button className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 4px 12px rgba(79,70,229,0.3)" }}>
                Entrar <LogIn className="w-4 h-4 ml-1 inline-block" />
              </button>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <Shield className="w-3 h-3" /> APA Refrigeração e Climatização — Tecnologia e confiança
          </p>
        </div>
      </div>
    );
  }

  // ---- EMPLOYEE LIST SCREEN (filtered by shift) ----
  if (!selectedEmployee) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative" style={{ background: "#F0F4F8" }}>
        <ConnectionIndicator />

        <div className="w-full max-w-md flex flex-col items-center" style={{ marginTop: "28px" }}>
          {/* Logo destacada sem card */}
          <div className="flex flex-col items-center mb-5">
            <img src={logo} alt="APA" className="w-32 h-32 object-contain mb-2" style={{ filter: "drop-shadow(0 4px 20px rgba(30,64,175,0.3))" }} />
            <p className="font-bold text-lg text-gray-800 tracking-tight">APA Refrigeração e Climatização</p>
            <p className="text-xs text-gray-400 tracking-wider">Sistema de Registro de Ponto</p>
          </div>

          {/* Turno selecionado */}
          <div className="w-full bg-white rounded-2xl px-5 py-4 mb-4 flex items-center justify-between" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Equipe</p>
              <p className="text-lg font-black" style={{ color: "#1e40af" }}>
                {selectedShift === "diurno" ? "☀️ Diurna" : "🌙 Noturna"}
              </p>
            </div>
            <p className="text-xl font-bold tabular-nums text-gray-700">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>

          <p className="text-base font-bold text-gray-700 mb-3">Selecione seu nome</p>

          {/* Lista de funcionários */}
          <div className="w-full space-y-2 mb-4">
            {filteredEmployees.map((emp) => (
              <button
                key={emp.id}
                className="w-full h-14 text-base text-left px-5 rounded-xl border border-gray-100 bg-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 font-medium text-gray-700 flex items-center justify-between"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
                onClick={() => {
                  if (!emp.has_cpf) {
                    setSelectedEmployee(emp);
                    setValidatedEmployee(emp);
                    setValidatedCpf("");
                    setShowDropdown(false);
                  } else {
                    setSelectedEmployee(null);
                    setValidatedEmployee(null);
                    setValidatedCpf("");
                    setPendingEmployee(emp);
                    setCpfInput("");
                    setCpfError("");
                  }
                }}
              >
                <span>{emp.name}</span>
                <LogIn className="w-4 h-4 text-blue-400" />
              </button>
            ))}
            {filteredEmployees.length === 0 && (
              <p className="text-center py-8 text-gray-400">Nenhum funcionário neste turno.</p>
            )}
          </div>

          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            onClick={() => setSelectedShift(null)}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para seleção de equipe
          </button>
        </div>
      </div>
    );
  }

 // Greeting
  const getGreeting = () => {
    if (currentHour >= 5 && currentHour < 12) return "Bom dia";
    if (currentHour >= 12 && currentHour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const lastRecord = records.length > 0 ? [...records].sort((a, b) => new Date(b.punched_at).getTime() - new Date(a.punched_at).getTime())[0] : null;
  const STEP_LABELS_MAP: Record<string, string> = { entrada: "Entrada", intervalo: "Saída p/ Almoço", retorno: "Retorno do Almoço", saida: "Saída" };

  return (
    <div className="min-h-screen flex flex-col items-center px-3 pb-10 relative" style={{ background: bgPrimary }}>
      <ConnectionIndicator />

      {/* Header institucional */}
      <div className="w-full max-w-md pt-8 pb-4 flex flex-col items-center" style={{ marginTop: "28px" }}>
        {/* Botões topo */}
        <div className="self-end mb-2 flex gap-2">
          <button
            onClick={toggle}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all hover:shadow-md"
            style={{ background: "white", color: "#64748b", borderColor: "#e2e8f0" }}
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {isDark ? "Claro" : "Escuro"}
          </button>
        </div>

{/* Banner sazonal */}
        {(() => {
          const mes = new Date().getMonth() + 1;
          const dia = new Date().getDate();
          const banners: Record<number, { emoji: string; texto: string; bg: string; text: string }> = {
            1:  { emoji: "🎆", texto: "Feliz Ano Novo! Que 2027 seja incrível!", bg: "#fffbeb", text: "#b45309" },
            2:  { emoji: "💝", texto: "Mês do amor e da amizade!", bg: "#fff1f2", text: "#be123c" },
            3:  { emoji: "🌺", texto: "Bem-vindo ao outono! Boas energias!", bg: "#fdf4ff", text: "#7e22ce" },
            4:  { emoji: "🐣", texto: "Feliz Páscoa a todos os colaboradores!", bg: "#f0fdf4", text: "#15803d" },
            5:  { emoji: "👷", texto: "Feliz Dia do Trabalhador! Parabéns a você!", bg: "#eff6ff", text: "#1e40af" },
            6:  { emoji: "🎊", texto: "Arraiá do APA Ponto! Boas festas juninas!", bg: "#fef9c3", text: "#854d0e" },
            7:  { emoji: "❄️", texto: "Julho chegou! Ótimo mês para bater metas!", bg: "#eff6ff", text: "#1e40af" },
            8:  { emoji: "👩", texto: "Feliz Dia dos Pais! Homenagem especial!", bg: "#f0fdf4", text: "#15803d" },
            9:  { emoji: "🇧🇷", texto: "Independência do Brasil! Viva nossa pátria!", bg: "#dcfce7", text: "#15803d" },
            10: { emoji: "👧", texto: "Feliz Dia das Crianças! A criança que há em você!", bg: "#fff7ed", text: "#c2410c" },
            11: { emoji: "🕯️", texto: "Novembro da consciência e reflexão.", bg: "#f1f5f9", text: "#475569" },
            12: { emoji: "🎄", texto: "Feliz Natal e boas festas a todos!", bg: "#f0fdf4", text: "#15803d" },
          };
          const banner = banners[mes];
          if (!banner) return null;
          return (
            <div className="w-full rounded-2xl px-4 py-3 mb-3 flex items-center gap-3"
              style={{ background: banner.bg, border: `1px solid ${banner.text}20` }}>
              <span className="text-2xl flex-shrink-0">{banner.emoji}</span>
              <p className="text-xs font-semibold" style={{ color: banner.text }}>{banner.texto}</p>
            </div>
          );
        })()}

        {/* Logo destacada */}
        <div className="flex flex-col items-center mb-4">
          <img src={logo} alt="APA" className="w-32 h-32 object-contain mb-1" style={{ filter: "drop-shadow(0 4px 20px rgba(30,64,175,0.3))" }} />
          <p className="font-bold text-base text-gray-800 tracking-tight">APA Refrigeração e Climatização</p>
          <p className="text-xs text-gray-400 tracking-wider">Sistema de Registro de Ponto</p>
        </div>

        {/* Saudação + relógio */}
        <div className="w-full bg-white rounded-2xl px-5 py-4 mb-3 flex items-center justify-between"
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-3">
            {(selectedEmployee as any).foto_url ? (
              <img src={(selectedEmployee as any).foto_url} alt={selectedEmployee.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-blue-100 flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-black text-white"
                style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                {selectedEmployee.name.charAt(0)}
              </div>
            )}
            <div>
              <p className="text-base font-bold text-gray-800">
                {getGreeting()}, {selectedEmployee.name.split(" ")[0]}! 👋
              </p>
              <p className="text-xs text-gray-400 mt-0.5 capitalize">{formatDate(now)}</p>
              {(selectedEmployee as any).cargo && (
                <p className="text-[10px] text-blue-400 font-medium">{(selectedEmployee as any).cargo}</p>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums flex-shrink-0" style={{ color: "#1e40af" }}>
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        {/* Status / avisos */}
        {(statusNotice || (!isOnline && hasOfflineBase)) && (
          <div className="w-full rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between gap-2"
            style={{ background: isOnline ? "#f0fdf4" : "#fff7ed", border: `1px solid ${isOnline ? "#bbf7d0" : "#fed7aa"}` }}>
            <p className="text-xs font-medium" style={{ color: isOnline ? "#15803d" : "#c2410c" }}>
              {statusNotice || "Modo offline ativo usando a base local sincronizada."}
            </p>
            {isOnline && (
              <button onClick={async () => {
                setIsSyncing(true); setStatusNotice("Atualizando...");
                try {
                  if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.update().catch(() => {}))); const cacheNames = await caches.keys(); await Promise.all(cacheNames.map(n => caches.delete(n))); }
                  await fetchEmployees();
                  if (selectedEmployee) await fetchTodayRecords(selectedEmployee.id);
                  if (validatedContext?.cpf_normalized) { await fetchNextStep(validatedContext.cpf_normalized); await fetchPendingEpiCount(validatedContext.cpf_normalized); }
                  setStatusNotice("Atualizado!"); toast.success("App atualizado.");
                } catch { setStatusNotice("Erro ao atualizar."); } finally { setIsSyncing(false); }
              }} disabled={isSyncing} className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all"
                style={{ background: "#dcfce7", color: "#15803d" }}>
                <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "..." : "Atualizar"}
              </button>
            )}
          </div>
        )}

        {/* Card próximo registro + botão */}
        <div className="w-full bg-white rounded-2xl mb-3 overflow-hidden" style={{ boxShadow: "0 2px 16px rgba(30,64,175,0.10)" }}>
          <div className="px-5 pt-4 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#64748b" }}>Próximo Registro</p>
            {recordsLoading || (navigator.onLine && !serverStepInfo && validatedContext) ? (
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-400">Verificando...</span>
              </div>
            ) : !allDone && nextAllowedStep ? (
              <>
                <p className="text-3xl font-black mb-1" style={{ color: "#1e40af" }}>{nextAllowedStep.label.toUpperCase()}</p>
                <p className="text-xs text-gray-400 mb-4">Registre seu ponto para {nextAllowedStep.label === "Entrada" ? "iniciar sua jornada" : nextAllowedStep.label === "Intervalo" ? "pausar para o almoço" : nextAllowedStep.label === "Retorno" ? "retomar a jornada" : "encerrar o dia"}</p>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={loading}
                  className="w-full h-14 text-base font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)", color: "white", boxShadow: "0 4px 16px rgba(30,64,175,0.35)" }}
                >
                  <Camera className="w-5 h-5" />
                  {loading ? "Registrando..." : "REGISTRAR PONTO"}
                </button>
                <p className="text-center text-[10px] text-gray-400 mt-2 flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" /> Seu registro é seguro e criptografado
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 py-2">
                <Check className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-bold text-emerald-600">Jornada concluída!</p>
                  <p className="text-xs text-gray-400">Total: {getWorkedTime()}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grid: Último registro + Banco de horas */}
        <div className="w-full grid grid-cols-2 gap-3 mb-3">
          {/* Último registro */}
          <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Último Registro</p>
            {lastRecord ? (
              <>
                <div className="w-9 h-9 rounded-full flex items-center justify-center mb-2" style={{ background: "#eff6ff" }}>
                  {(() => { const Icon = STEPS.find(s => s.key === lastRecord.step)?.icon || Check; return <Icon className="w-4 h-4" style={{ color: "#1e40af" }} />; })()}
                </div>
                <p className="text-sm font-bold text-gray-800">{STEP_LABELS_MAP[lastRecord.step] || lastRecord.step}</p>
                <p className="text-lg font-black tabular-nums" style={{ color: "#1e40af" }}>{new Date(lastRecord.punched_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                <p className="text-[10px] text-gray-400">Hoje, {new Date(lastRecord.punched_at).toLocaleDateString("pt-BR")}</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">Nenhum registro hoje</p>
            )}
          </div>

          {/* Banco de horas */}
          <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Banco de Horas</p>
            {timesheetSummary ? (
              <>
                <div className="w-9 h-9 rounded-full flex items-center justify-center mb-2"
                  style={{ background: timesheetSummary.diferenca >= 0 ? "#f0fdf4" : "#fff1f2" }}>
                  <Clock className="w-4 h-4" style={{ color: timesheetSummary.diferenca >= 0 ? "#16a34a" : "#e11d48" }} />
                </div>
                <p className="text-xl font-black tabular-nums" style={{ color: timesheetSummary.diferenca >= 0 ? "#16a34a" : "#e11d48" }}>
                  {timesheetSummary.diferenca >= 0 ? "+" : ""}{Math.floor(Math.abs(timesheetSummary.diferenca))}h{String(Math.round((Math.abs(timesheetSummary.diferenca) % 1) * 60)).padStart(2, "0")}
                </p>
                <p className="text-[10px] font-medium" style={{ color: timesheetSummary.diferenca >= 0 ? "#16a34a" : "#e11d48" }}>
                  {timesheetSummary.diferenca >= 0 ? "Saldo positivo" : "Saldo negativo"}
                </p>
                <p className="text-[10px] text-gray-400">
                  {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][timesheetSummary.month - 1]}/{timesheetSummary.year}
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400">Sem dados</p>
            )}
          </div>
        </div>

        {/* Jornada de hoje */}
        <div className="w-full bg-white rounded-2xl px-5 py-4 mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Sua Jornada de Hoje</p>
            <button onClick={() => setShowDropdown(!showDropdown)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border"
              style={{ background: "#f8fafc", color: "#1e40af", borderColor: "#bfdbfe" }}>
              {selectedEmployee.name.split(" ")[0]} <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          {showDropdown && (
            <div className="absolute mt-1 rounded-xl shadow-xl z-20 min-w-[180px] border border-gray-100 overflow-hidden bg-white">
              {filteredEmployees.map((emp) => (
                <button key={emp.id} onClick={() => {
                  setServerStepInfo(null);
                  if (!emp.has_cpf) { setSelectedEmployee(emp); setValidatedEmployee(emp); setValidatedCpf(""); setRecords([]); setShowDropdown(false); }
                  else { setSelectedEmployee(null); setValidatedEmployee(null); setValidatedCpf(""); setPendingEmployee(emp); setCpfInput(""); setCpfError(""); setShowDropdown(false); }
                }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 text-gray-700">{emp.name}</button>
              ))}
              <button onClick={() => { setSelectedEmployee(null); setValidatedEmployee(null); setValidatedCpf(""); setSelectedShift(null); setRecords([]); setShowDropdown(false); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 text-gray-400 border-t border-gray-100 flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Trocar equipe
              </button>
            </div>
          )}
          <div className="space-y-2">
            {STEPS.map((step, index) => {
              const record = getRecordForStep(step.key);
              const isActive = index === currentStepIndex;
              const isDone = !!record;
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={isDone ? { background: "#dcfce7" } : isActive ? { background: "#eff6ff" } : { background: "#f1f5f9" }}>
                    {isDone ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Icon className="w-3.5 h-3.5" style={{ color: isActive ? "#1e40af" : "#94a3b8" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: isDone ? "#16a34a" : isActive ? "#1e40af" : "#94a3b8" }}>
                      {STEP_LABELS_MAP[step.key] || step.label}
                    </p>
                    {record && <p className="text-[10px] text-gray-400 tabular-nums">{new Date(record.punched_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
                  </div>
                  {isActive && !isDone && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#eff6ff", color: "#1e40af" }}>próximo</span>
                  )}
                </div>
              );
            })}
          </div>
          {records.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Horas trabalhadas</span>
              <span className="text-sm font-bold" style={{ color: "#1e40af" }}>{getWorkedTime()}</span>
            </div>
          )}
        </div>

{/* Calendário do mês */}
        {validatedContext && (
          <div className="w-full bg-white rounded-2xl px-5 py-4 mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              📅 {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
            {/* Legenda */}
         <div className="flex gap-2 mb-3 flex-wrap">
              {[
                { cor: "#bbf7d0", label: "Trabalhado" },
                { cor: "#fed7aa", label: "Atestado" },
                { cor: "#bfdbfe", label: "Férias" },
                { cor: "#fee2e2", label: "Falta" },
                { cor: "#e2e8f0", label: "Fim de semana" },
                { cor: "#fef9c3", label: "Feriado" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm border border-gray-200" style={{ background: l.cor }} />
                  <span className="text-[9px] text-gray-400">{l.label}</span>
                </div>
              ))}
            </div>
            {/* Grid */}
            {(() => {
              const now = new Date();
              const ano = now.getFullYear();
              const mes = now.getMonth();
              const diasNoMes = new Date(ano, mes + 1, 0).getDate();
              const primeiroDia = new Date(ano, mes, 1).getDay();
              const diasSemana = ["D", "S", "T", "Q", "Q", "S", "S"];
              const feriados = ["2026-06-04"];
              return (
                <div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {diasSemana.map((d, i) => (
                      <p key={i} className="text-[9px] text-center font-bold text-gray-400">{d}</p>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: primeiroDia }).map((_, i) => <div key={`e-${i}`} />)}
                    {Array.from({ length: diasNoMes }, (_, i) => i + 1).map(dia => {
                      const dStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
                      const dow = new Date(dStr + "T12:00:00").getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const isFeriado = feriados.includes(dStr);
                      const isHoje = dia === now.getDate();
                      const isFuturo = dia > now.getDate();
                      const status = calendarioDias[dStr];

                      let bg = "#f8fafc";
                      let textColor = "#94a3b8";
                      let emoji = "";

                      if (isFeriado) { bg = "#fef9c3"; textColor = "#854d0e"; emoji = "🎉"; }
                      else if (status === "trabalhado") { bg = "#bbf7d0"; textColor = "#15803d"; }
                      else if (status === "atestado") { bg = "#fed7aa"; textColor = "#c2410c"; emoji = "📋"; }
                      else if (status === "ferias") { bg = "#bfdbfe"; textColor = "#1e40af"; emoji = "🏖️"; }
                      else if (isWeekend) { bg = "#e2e8f0"; textColor = "#64748b"; }
                      else if (!isFuturo && !isWeekend) { bg = "#fee2e2"; textColor = "#dc2626"; }

                      return (
                        <div key={dia}
                          className="rounded-lg flex flex-col items-center justify-center relative"
                          style={{
                            background: bg,
                            border: isHoje ? "2px solid #1e40af" : "1px solid transparent",
                            aspectRatio: "1",
                            padding: "2px",
                          }}
                          title={isFeriado ? "Feriado" : status === "trabalhado" ? "Trabalhado" : status === "atestado" ? "Atestado" : status === "ferias" ? "Férias" : isWeekend ? "Final de semana" : !isFuturo ? "Falta" : ""}>
                          <span className="text-[10px] font-bold leading-none" style={{ color: textColor }}>{dia}</span>
                          {emoji && <span className="text-[8px] leading-none mt-0.5">{emoji}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Widget clima */}
        {weather && (
          <div className="w-full bg-white rounded-2xl px-5 py-4 mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Clima em Brasília - DF</p>
            <div className="flex items-center gap-4">
              <WeatherIcon code={weather.weatherCode} hour={currentHour} />
              <div>
                <p className="text-2xl font-black text-gray-800">{weather.temp}°C</p>
                <p className="text-xs text-gray-400 flex items-center gap-2">
                  <Droplets className="w-3 h-3 text-blue-400" />{weather.humidity}%
                  <Wind className="w-3 h-3 text-gray-400" />{weather.windspeed} km/h
                </p>
              </div>
              <p className="ml-auto text-xs text-gray-500 italic text-right max-w-[120px]">{getDynamicPhrase(currentHour, weather.weatherCode)}</p>
            </div>
          </div>
        )}

        {/* Cards de pendências */}
        {pendingEpiCount > 0 && (
          <div className="w-full rounded-2xl border mb-3 overflow-hidden" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#fef3c7" }}>
                <HardHat className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800">{pendingEpiCount === 1 ? "EPI pendente de aceite" : `${pendingEpiCount} EPIs pendentes`}</p>
                {pendingEpis[0] && <p className="text-xs text-amber-600">🦺 {pendingEpis[0].epi_name}</p>}
              </div>
              <button onClick={() => setShowEpiAcceptance(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#f59e0b", color: "white" }}>Assinar</button>
            </div>
          </div>
        )}

        {pendingPayslipCount > 0 && (
          <div className="w-full rounded-2xl border mb-3 overflow-hidden" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#dbeafe" }}>
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-blue-800">{pendingPayslipCount === 1 ? "Holerite para assinar" : `${pendingPayslipCount} holerites pendentes`}</p>
                <p className="text-xs text-blue-500">Assine digitalmente para confirmar.</p>
              </div>
              <button onClick={() => setShowPayslipSign(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#1e40af", color: "white" }}>Assinar</button>
            </div>
          </div>
        )}

        {pendingUniformCount > 0 && (
          <div className="w-full rounded-2xl border mb-3 overflow-hidden" style={{ background: "#f5f3ff", borderColor: "#ddd6fe" }}>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#ede9fe" }}>
                <FileText className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-violet-800">{pendingUniformCount === 1 ? "Uniforme para confirmar" : `${pendingUniformCount} uniformes pendentes`}</p>
                {pendingUniform[0] && <p className="text-xs text-violet-500">👕 {pendingUniform[0].uniform_name}</p>}
              </div>
              <button onClick={() => setShowUniformAcceptance(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#7c3aed", color: "white" }}>Confirmar</button>
            </div>
          </div>
        )}

        {pendingToolCount > 0 && (
          <div className="w-full rounded-2xl border mb-3 overflow-hidden" style={{ background: "#fff7ed", borderColor: "#fed7aa" }}>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#ffedd5" }}>
                <FileText className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-orange-800">{pendingToolCount === 1 ? "Ferramenta para confirmar" : `${pendingToolCount} ferramentas pendentes`}</p>
                {pendingTools[0] && <p className="text-xs text-orange-500">🔧 {pendingTools[0].tool_name}</p>}
              </div>
              <button onClick={() => setShowToolAcceptance(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#ea580c", color: "white" }}>Confirmar</button>
            </div>
          </div>
        )}

        {pendingTimesheetCount > 0 && (
          <div className="w-full rounded-2xl border mb-3 overflow-hidden" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#dbeafe" }}>
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-blue-800">{pendingTimesheetCount === 1 ? "Espelho de ponto para assinar" : `${pendingTimesheetCount} espelhos pendentes`}</p>
                <p className="text-xs text-blue-500">Seu espelho foi fechado e aguarda assinatura.</p>
              </div>
              <button onClick={() => setShowTimesheetSign(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#1e40af", color: "white" }}>Assinar</button>
            </div>
          </div>
        )}

{/* Avisos da empresa */}
        {avisos.length > 0 && (
          <div className="w-full bg-white rounded-2xl px-5 py-4 mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">📢 Avisos da Empresa</p>
            <div className="space-y-2">
              {avisos.map((aviso) => {
                const cores: Record<string, { bg: string; text: string; icon: string }> = {
                  info: { bg: "#eff6ff", text: "#1e40af", icon: "ℹ️" },
                  alerta: { bg: "#fff7ed", text: "#c2410c", icon: "⚠️" },
                  urgente: { bg: "#fff1f2", text: "#be123c", icon: "🚨" },
                  evento: { bg: "#f0fdf4", text: "#15803d", icon: "📅" },
                };
                const c = cores[aviso.tipo] || cores.info;
                return (
                  <div key={aviso.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: c.bg }}>
                    <span className="text-base flex-shrink-0">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={{ color: c.text }}>{aviso.titulo}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{aviso.mensagem}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

{/* Minhas solicitações */}
        {selectedEmployee && <MeusSolicitacoes employeeId={selectedEmployee.id} />}

        {/* Solicitações rápidas */}
        <div className="w-full bg-white rounded-2xl px-5 py-4 mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">⚡ Solicitações Rápidas</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Férias", icon: "🏖️", color: "#0ea5e9", bg: "#eff6ff" },
              { label: "Abono", icon: "📝", color: "#7c3aed", bg: "#f5f3ff" },
              { label: "Declaração", icon: "📄", color: "#15803d", bg: "#f0fdf4" },
              { label: "Ajuste de Ponto", icon: "⏱️", color: "#ea580c", bg: "#fff7ed" },
            ].map(({ label, icon, color, bg }) => (
              <button key={label}
                onClick={() => setShowSolicitacao(label)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all hover:shadow-sm active:scale-95 text-left"
                style={{ borderColor: "#e2e8f0", background: "white" }}>
                <span className="text-base">{icon}</span>
                <span className="text-xs font-semibold text-gray-700">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Modal de solicitação */}
        {showSolicitacao && (
          <div className="fixed inset-0 z-50 flex items-end justify-center pb-6 px-4" style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowSolicitacao(null); }}>
            <div className="w-full max-w-md bg-white rounded-2xl p-6 animate-in slide-in-from-bottom-4 duration-300"
              style={{ boxShadow: "0 -4px 32px rgba(0,0,0,0.15)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-gray-800">Solicitar {showSolicitacao}</h3>
                <button onClick={() => setShowSolicitacao(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">✕</button>
              </div>
              <p className="text-xs text-gray-400 mb-3">Sua solicitação será enviada ao RH para análise.</p>
              <textarea
                value={solicitacaoTexto}
                onChange={(e) => setSolicitacaoTexto(e.target.value)}
                placeholder="Observação ou detalhes (opcional)..."
                className="w-full h-24 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400/40 resize-none mb-4"
              />
              <div className="flex gap-3">
                <button onClick={() => setShowSolicitacao(null)}
                  className="flex-1 h-12 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={() => enviarSolicitacao(showSolicitacao)}
                  disabled={enviandoSolicitacao}
                  className="flex-1 h-12 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                  {enviandoSolicitacao ? "Enviando..." : "Enviar Solicitação"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ações secundárias */}
        <div className="w-full grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Manual", icon: Pencil, action: () => setShowManualPunch(true) },
            { label: "Histórico", icon: History, action: fetchHistory },
            { label: "Atestado", icon: FileText, action: () => setShowJustification(true) },
            { label: "Documentos", icon: FolderOpen, action: () => setShowDocumentos(true) },
          ].map(({ label, icon: Icon, action }) => (
            <button key={label} onClick={action}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all hover:shadow-md active:scale-95"
              style={{ background: "white", borderColor: "#e2e8f0", color: "#1e40af" }}>
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold text-gray-600">{label}</span>
            </button>
          ))}
        </div>

        {/* Geo status */}
        {geoStatus && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1 mb-2">
            <MapPin className="w-3 h-3" /> {geoStatus}
          </p>
        )}

        {/* Footer */}
        <div className="w-full flex items-center justify-center gap-2 pt-2">
          <Shield className="w-3.5 h-3.5 text-gray-300" />
          <p className="text-[10px] text-gray-400">APA Refrigeração e Climatização — Tecnologia e confiança para o seu dia a dia.</p>
        </div>
      </div>
    </div>
  );
}