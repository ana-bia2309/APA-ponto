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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo-apa.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import CameraCapture from "@/components/CameraCapture";
import ManualPunch from "@/components/ManualPunch";
import AbsenceJustification from "@/components/AbsenceJustification";
import EpiAcceptance from "@/components/EpiAcceptance";
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
const OFFLINE_QUEUE_KEY = "apa_ponto_offline_queue";
const RECORDS_CACHE_KEY = "apa_ponto_records_cache";
const EMPLOYEES_CACHE_KEY = "apa_ponto_employees_cache";
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
  const [showEpiAcceptance, setShowEpiAcceptance] = useState(false);
  const [pendingEpiCount, setPendingEpiCount] = useState(0);
  const [pendingEpis, setPendingEpis] = useState<{ epi_name: string; delivered_at: string }[]>([]);

  const filteredEmployees = selectedShift
    ? employees.filter((e) => (e as any).shift === selectedShift)
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
    if (!cpf || !navigator.onLine) { setPendingEpiCount(0); setPendingEpis([]); return; }
    try {
      const { data } = await supabase.rpc("get_pending_epi_by_cpf", { p_cpf: normalizeCpf(cpf) } as any);
      const arr = Array.isArray(data) ? data : [];
      setPendingEpiCount(arr.length);
      setPendingEpis(arr.map((d: any) => ({ epi_name: d.epi_name, delivered_at: d.delivered_at })));
    } catch { setPendingEpiCount(0); setPendingEpis([]); }
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
    setLoading(false);
    setStatusNotice(null);
    setRecordsLoading(false);
    setServerStepInfo(null);
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
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        fetchEmployees();
        if (selectedEmployee) fetchTodayRecords(selectedEmployee.id);
        if (validatedContext?.cpf_normalized) fetchNextStep(validatedContext.cpf_normalized);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [selectedEmployee, validatedContext]);

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
      toast.error("Aguarde a consulta da próxima etapa no servidor.");
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

        // Insert into punch_records to link photo and address
        const punchRecordPayload: any = {
          employee_id: employeeId,
          step: recordType,
          punched_at: recordedAt,
          latitude: location?.lat ?? null,
          longitude: location?.lng ?? null,
          address: location?.address ?? null,
          photo_url: uploadedPhotoPath,
        };
        const { error: prError } = await supabase.from("punch_records").insert(punchRecordPayload);
        if (prError) {
          console.warn("DEBUG PONTO [punch_records]: erro ao salvar:", prError.message);
        }

        // Also save address to time_records for direct display
        if (returnedId && location?.address) {
          (supabase as any).from("time_records")
            .update({ address: location.address })
            .eq("id", returnedId)
            .then(() => {});
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
        toast.error("Este registro já foi realizado hoje. Siga a próxima etapa.");
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
      totalMs += new Date(intervalo.punched_at).getTime() - new Date(entrada.punched_at).getTime();
    } else if (entrada && !intervalo) {
      totalMs += now.getTime() - new Date(entrada.punched_at).getTime();
    }
    if (retorno && saida) {
      totalMs += new Date(saida.punched_at).getTime() - new Date(retorno.punched_at).getTime();
    } else if (retorno && !saida) {
      totalMs += now.getTime() - new Date(retorno.punched_at).getTime();
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
    } catch (error: any) {
      setValidatedCpf("");
      setValidatedEmployee(null);
      setValidatedContext(null);
      setCpfError(error?.message || "CPF incorreto. Tente novamente.");
      console.log("DEBUG PONTO [verifyCpf]: ERRO na validação:", error?.message);
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
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: "hsl(210 20% 60%)" }}>Carregando sistema...</p>
        </div>
      </div>
    );
  }

  // Error screen with retry
  if (loadError && employees.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-4" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: "hsl(0 50% 20%)" }}>
            <WifiOff className="w-8 h-8" style={{ color: "hsl(0 80% 70%)" }} />
          </div>
          <p className="text-base font-semibold" style={{ color: "hsl(0 0% 90%)" }}>Erro ao carregar dados</p>
          <p className="text-sm max-w-xs" style={{ color: "hsl(210 15% 50%)" }}>{loadError}</p>
          <button
            onClick={loadInitialData}
            className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))" }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Success overlay
  if (showSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        <ConnectionIndicator />
        <div className="text-center animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "linear-gradient(135deg, hsl(152 55% 42%), hsl(160 60% 50%))", boxShadow: "0 0 40px hsl(152 55% 42% / 0.4)" }}>
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "hsl(0 0% 95%)" }}>
            Ponto Registrado!
          </h2>
          <p className="text-base" style={{ color: "hsl(210 15% 55%)" }}>
            {successMessage}
          </p>
          <p className="text-sm mt-4" style={{ color: "hsl(210 15% 45%)" }}>
            Redirecionando automaticamente...
          </p>
          <button
            onClick={resetToStart}
            className="mt-6 h-12 rounded-xl px-6 font-semibold text-sm text-white transition-all hover:shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", boxShadow: "0 4px 16px hsl(210 70% 40% / 0.3)" }}
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
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        <ConnectionIndicator />
        <div className="w-full max-w-sm p-8 rounded-2xl border border-white/10 text-center" style={{ background: "linear-gradient(180deg, hsl(210 30% 14%) 0%, hsl(215 25% 11%) 100%)", boxShadow: "0 8px 32px hsl(220 40% 5% / 0.5)" }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", boxShadow: "0 0 20px hsl(210 70% 40% / 0.3)" }}>
            <step.icon className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-lg font-bold mb-2" style={{ color: "hsl(0 0% 95%)" }}>
            Confirmar registro?
          </h3>
          <p className="text-sm mb-6" style={{ color: "hsl(210 15% 55%)" }}>
            Registrar <strong style={{ color: "hsl(200 80% 60%)" }}>{step.label}</strong> para {selectedEmployee.name}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 h-12 rounded-xl border border-white/10 font-medium text-sm transition-colors hover:bg-white/5"
              style={{ color: "hsl(0 0% 75%)" }}
            >
              Cancelar
            </button>
            <button
              onClick={confirmPunch}
              className="flex-1 h-12 rounded-xl font-semibold text-sm text-white transition-all hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", boxShadow: "0 4px 16px hsl(210 70% 40% / 0.3)" }}
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
      <div className="min-h-screen flex flex-col px-4 py-8 relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        <ConnectionIndicator />
        <div className="w-full max-w-md mx-auto relative z-10">
          <div className="flex items-center justify-between mb-6 mt-4">
            <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>
              <History className="w-5 h-5 inline mr-2" />
              Meu Histórico
            </h2>
            <button
              onClick={() => setShowHistory(false)}
              className="px-4 py-2 text-sm rounded-xl border border-white/10 transition-colors hover:bg-white/5"
              style={{ color: "hsl(210 20% 60%)" }}
            >
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Voltar
            </button>
          </div>
          <p className="text-xs mb-4" style={{ color: "hsl(210 15% 50%)" }}>
            {selectedEmployee.name} • Últimos 30 dias
          </p>

          {journeys.length === 0 ? (
            <div className="text-center py-12">
              <p style={{ color: "hsl(210 15% 45%)" }}>Nenhum registro encontrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {journeys.map((journey, ji) => (
                <div key={ji} className="p-4 rounded-xl border border-white/10" style={{ background: "hsl(210 30% 13%)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold capitalize" style={{ color: "hsl(210 20% 65%)" }}>{journey.label}</p>
                    {!journey.complete && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "hsl(40 80% 50% / 0.15)", color: "hsl(40 80% 60%)" }}>Aberta</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {journey.records.map((rec) => (
                      <div key={rec.id} className="flex items-center justify-between text-sm">
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "hsl(210 30% 20%)", color: "hsl(200 70% 65%)" }}>
                          {STEP_LABELS[rec.step] || rec.step}
                        </span>
                        <div className="flex items-center gap-2">
                          {(rec as any).address && <MapPin className="w-3 h-3" style={{ color: "hsl(152 55% 50%)" }} />}
                          <span className="tabular-nums" style={{ color: "hsl(0 0% 80%)" }}>
                            {formatTime(rec.punched_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // CPF verification screen
  if (pendingEmployee) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, hsl(200 80% 50%) 0%, transparent 70%)" }} />
        <ConnectionIndicator />
        <div className="text-center mb-8 relative z-10">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-[-16px] rounded-full opacity-30 blur-2xl" style={{ background: "radial-gradient(circle, hsl(200 80% 55%) 0%, transparent 70%)" }} />
            <img src={logo} alt="Logo" className="w-48 h-48 object-contain relative" style={{ filter: "drop-shadow(0 4px 24px hsl(200 70% 50% / 0.35))" }} />
          </div>
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold tracking-wide mb-3 border border-white/10 backdrop-blur-sm" style={{ background: "linear-gradient(135deg, hsl(210 60% 30% / 0.6), hsl(200 50% 25% / 0.4))", color: "hsl(0 0% 100%)" }}>
            <Clock className="w-4 h-4" />
            APA Ponto
          </div>
          <p className="text-xl font-bold mb-1" style={{ color: "hsl(0 0% 95%)" }}>{pendingEmployee.name}</p>
          <p className="text-sm" style={{ color: "hsl(210 20% 55%)" }}>Informe seu CPF para continuar</p>
        </div>
        <div className="w-full max-w-sm space-y-4 relative z-10">
          <input
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpfInput}
            onChange={(e) => {
              setCpfInput(formatCpfInput(e.target.value));
              setCpfError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && verifyCpf()}
            className="flex h-14 w-full rounded-xl px-4 py-2 text-lg text-center tracking-widest border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all"
            style={{ background: "hsl(210 30% 14%)", color: "hsl(0 0% 92%)" }}
          />
          {cpfError && (
            <p className="text-sm text-red-400 text-center font-medium">{cpfError}</p>
          )}
          <button
            onClick={verifyCpf}
            className="w-full h-14 rounded-xl text-base font-semibold tracking-wide transition-all duration-200 hover:shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", color: "white", boxShadow: "0 4px 16px hsl(210 70% 40% / 0.3)" }}
          >
            Confirmar
          </button>
          <button
            className="w-full py-3 text-sm font-medium rounded-xl transition-colors"
            style={{ color: "hsl(210 20% 60%)" }}
            onClick={() => { setPendingEmployee(null); setValidatedEmployee(null); setCpfInput(""); setCpfError(""); }}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ---- SHIFT SELECTION SCREEN ----
  if (!selectedShift) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        {/* Subtle glow effect */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, hsl(200 80% 50%) 0%, transparent 70%)" }} />

        <ConnectionIndicator />

        <div className="text-center mb-10 relative z-10">
          {/* Logo with subtle glow */}
          <div className="relative inline-block mb-6">
            <div className="absolute inset-[-20px] rounded-full opacity-30 blur-2xl" style={{ background: "radial-gradient(circle, hsl(200 80% 55%) 0%, transparent 70%)" }} />
            <img src={logo} alt="APA Refrigeração e Climatização" className="w-56 h-56 object-contain relative" style={{ filter: "drop-shadow(0 4px 24px hsl(200 70% 50% / 0.35))" }} />
          </div>

          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold tracking-wide mb-3 border border-white/10 backdrop-blur-sm" style={{ background: "linear-gradient(135deg, hsl(210 60% 30% / 0.6), hsl(200 50% 25% / 0.4))", color: "hsl(0 0% 100%)" }}>
            <Clock className="w-4 h-4" />
            APA Ponto
          </div>

          <p className="text-sm tracking-wider mb-6" style={{ color: "hsl(210 20% 60%)" }}>Refrigeração e Climatização</p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: "hsl(0 0% 95%)" }}>Selecione sua equipe</p>
        </div>

        <div className="w-full max-w-md grid grid-cols-2 gap-5 relative z-10">
          {/* Equipe Diurna */}
          <div
            className="rounded-2xl p-6 flex flex-col items-center gap-4 cursor-pointer transition-all duration-300 hover:-translate-y-1 border border-white/10 backdrop-blur-sm"
            style={{ background: "linear-gradient(180deg, hsl(210 30% 16%) 0%, hsl(215 25% 12%) 100%)", boxShadow: "0 8px 32px hsl(220 40% 5% / 0.5), 0 0 0 1px hsl(210 40% 30% / 0.1)" }}
            onClick={() => setSelectedShift("diurno")}
          >
            <p className="font-bold text-sm tracking-wide" style={{ color: "hsl(0 0% 90%)" }}>EQUIPE DIURNA</p>
            <button
              className="w-full py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", color: "white", boxShadow: "0 4px 16px hsl(210 70% 40% / 0.3)" }}
            >
              Entrar <LogIn className="w-4 h-4 ml-1 inline-block" />
            </button>
          </div>

          {/* Equipe Noturna */}
          <div
            className="rounded-2xl p-6 flex flex-col items-center gap-4 cursor-pointer transition-all duration-300 hover:-translate-y-1 border border-white/10 backdrop-blur-sm"
            style={{ background: "linear-gradient(180deg, hsl(210 30% 16%) 0%, hsl(215 25% 12%) 100%)", boxShadow: "0 8px 32px hsl(220 40% 5% / 0.5), 0 0 0 1px hsl(210 40% 30% / 0.1)" }}
            onClick={() => setSelectedShift("noturno")}
          >
            <p className="font-bold text-sm tracking-wide" style={{ color: "hsl(0 0% 90%)" }}>EQUIPE NOTURNA</p>
            <button
              className="w-full py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", color: "white", boxShadow: "0 4px 16px hsl(210 70% 40% / 0.3)" }}
            >
              Entrar <LogIn className="w-4 h-4 ml-1 inline-block" />
            </button>
          </div>
        </div>

        <div className="mt-10 text-center relative z-10">
          <p className="text-5xl font-bold tracking-tight tabular-nums" style={{ color: "hsl(0 0% 95%)" }}>
            {formatTime(now)}
          </p>
          <p className="mt-2 capitalize text-sm tracking-wide" style={{ color: "hsl(210 15% 50%)" }}>
            {formatDate(now)}
          </p>
        </div>
      </div>
    );
  }

  // ---- EMPLOYEE LIST SCREEN (filtered by shift) ----
  if (!selectedEmployee) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, hsl(200 80% 50%) 0%, transparent 70%)" }} />
        <ConnectionIndicator />
        <div className="text-center mb-8 relative z-10">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-[-16px] rounded-full opacity-30 blur-2xl" style={{ background: "radial-gradient(circle, hsl(200 80% 55%) 0%, transparent 70%)" }} />
            <img src={logo} alt="Logo" className="w-48 h-48 object-contain relative" style={{ filter: "drop-shadow(0 4px 24px hsl(200 70% 50% / 0.35))" }} />
          </div>
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold tracking-wide mb-3 border border-white/10 backdrop-blur-sm" style={{ background: "linear-gradient(135deg, hsl(210 60% 30% / 0.6), hsl(200 50% 25% / 0.4))", color: "hsl(0 0% 100%)" }}>
            <Clock className="w-4 h-4" />
            APA Ponto
          </div>
          <p className="text-sm tracking-wider mb-4" style={{ color: "hsl(210 20% 55%)" }}>Refrigeração e Climatização</p>
          <p className="text-lg font-bold mb-1" style={{ color: "hsl(0 0% 95%)" }}>
            Equipe {selectedShift === "diurno" ? "Diurna" : "Noturna"}
          </p>
          <p className="text-sm" style={{ color: "hsl(210 20% 55%)" }}>
            Selecione seu nome
          </p>
        </div>

        <div className="w-full max-w-sm space-y-2 relative z-10">
          {filteredEmployees.map((emp) => (
            <button
              key={emp.id}
              className="w-full h-14 text-base text-left px-5 rounded-xl border border-white/10 transition-all duration-200 hover:-translate-y-0.5 font-medium"
              style={{ background: "linear-gradient(180deg, hsl(210 30% 16%) 0%, hsl(215 25% 12%) 100%)", color: "hsl(0 0% 90%)", boxShadow: "0 4px 16px hsl(220 40% 5% / 0.4)" }}
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
              {emp.name}
            </button>
          ))}
          {filteredEmployees.length === 0 && (
            <p className="text-center py-8" style={{ color: "hsl(210 20% 50%)" }}>
              Nenhum funcionário neste turno.
            </p>
          )}
          <button
            className="w-full mt-4 py-3 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-1"
            style={{ color: "hsl(210 20% 60%)" }}
            onClick={() => setSelectedShift(null)}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, hsl(200 80% 50%) 0%, transparent 70%)" }} />
      <ConnectionIndicator />
      {/* Header */}
      <div className="text-center mb-8 relative z-10">
        <div className="relative inline-block mb-4">
          <div className="absolute inset-[-12px] rounded-full opacity-25 blur-2xl" style={{ background: "radial-gradient(circle, hsl(200 80% 55%) 0%, transparent 70%)" }} />
          <img src={logo} alt="Logo" className="w-40 h-40 object-contain relative" style={{ filter: "drop-shadow(0 4px 20px hsl(200 70% 50% / 0.3))" }} />
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide mb-3 border border-white/10 backdrop-blur-sm" style={{ background: "linear-gradient(135deg, hsl(210 60% 30% / 0.6), hsl(200 50% 25% / 0.4))", color: "hsl(0 0% 100%)" }}>
          <Clock className="w-3 h-3" />
          APA Ponto
        </div>
        <p className="text-xs tracking-wider mb-3" style={{ color: "hsl(210 20% 50%)" }}>Refrigeração e Climatização</p>
        <p className="text-5xl font-bold tracking-tight tabular-nums" style={{ color: "hsl(0 0% 95%)" }}>
          {formatTime(now)}
        </p>
        <p className="mt-2 capitalize text-sm" style={{ color: "hsl(210 15% 50%)" }}>
          {formatDate(now)}
        </p>

        {(statusNotice || (!isOnline && hasOfflineBase) || employeesSyncedAt) && (
          <div className="mt-3 space-y-1">
            {statusNotice && (
              <p className="text-xs font-medium" style={{ color: "hsl(200 65% 70%)" }}>
                {statusNotice}
              </p>
            )}
            {!statusNotice && !isOnline && hasOfflineBase && (
              <p className="text-xs font-medium" style={{ color: "hsl(200 65% 70%)" }}>
                Modo offline ativo usando a base local já sincronizada.
              </p>
            )}
            {employeesSyncedAt && (
              <p className="text-[11px]" style={{ color: "hsl(210 15% 50%)" }}>
                Base offline atualizada em {new Date(employeesSyncedAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        )}

        {selectedEmployee && !recordsLoading && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-semibold" style={{ color: "hsl(200 65% 70%)" }}>
              {allDone ? "Todos os registros do dia já foram concluídos" : `Próximo registro: ${nextAllowedStep?.label}`}
            </p>
            <div className="text-[11px] space-y-0.5 p-2 rounded-lg border border-yellow-500/30" style={{ color: "hsl(50 80% 70%)", background: "hsl(50 30% 15% / 0.5)" }}>
              <p className="font-bold">🔍 DEBUG v2 — {new Date().toLocaleTimeString("pt-BR")}</p>
              <p>colaborador: {selectedEmployee.name}</p>
              <p>jornada: {punchMode === "simple" ? "simplificada" : "completa"}</p>
              <p className="font-bold" style={{ color: serverStepInfo ? "hsl(150 70% 60%)" : "hsl(0 70% 60%)" }}>
                fonte: {serverStepInfo ? "✅ SERVIDOR (RPC)" : "⚠️ LOCAL (versão antiga!)"}
              </p>
              <p>server next_step: {serverStepInfo?.next_step ?? "null"}</p>
              <p>server day_complete: {serverStepInfo?.day_complete ? "SIM" : "NÃO"}</p>
              <p>server records: {serverStepInfo?.records_today?.map((r: any) => r.record_type).join(", ") || "nenhum"}</p>
              <p>botão exibe: {nextAllowedStep?.label ?? "nenhum (dia concluído)"}</p>
              <p>record_type que será enviado: {serverStepInfo?.next_step ?? nextAllowedStep?.key ?? "N/A"}</p>
              <p>registros local: {sequenceState.ordered.map((record) => `${record.step} ${formatTime(record.punched_at)}`).join(" • ") || "nenhum"}</p>
            </div>
          </div>
        )}

        {/* Employee selector */}
        <div className="relative mt-4">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border border-white/10"
            style={{ background: "hsl(210 30% 16%)", color: "hsl(0 0% 88%)" }}
          >
            {selectedEmployee.name}
            <ChevronDown className="w-4 h-4" />
          </button>
          {showDropdown && (
            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 rounded-xl shadow-2xl z-10 min-w-[200px] border border-white/10 overflow-hidden" style={{ background: "hsl(210 30% 14%)" }}>
              {filteredEmployees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => {
                    setServerStepInfo(null);
                    if (!emp.has_cpf) {
                      setSelectedEmployee(emp);
                      setValidatedEmployee(emp);
                      setValidatedCpf("");
                      setRecords([]);
                      setShowDropdown(false);
                    } else {
                      setSelectedEmployee(null);
                      setValidatedEmployee(null);
                      setValidatedCpf("");
                      setPendingEmployee(emp);
                      setCpfInput("");
                      setCpfError("");
                      setShowDropdown(false);
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "hsl(0 0% 88%)" }}
                >
                  {emp.name}
                </button>
              ))}
              <button
                onClick={() => {
                  setSelectedEmployee(null);
                  setValidatedEmployee(null);
                  setValidatedCpf("");
                  setSelectedShift(null);
                  setRecords([]);
                  setShowDropdown(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/5 border-t border-white/10"
                style={{ color: "hsl(210 20% 55%)" }}
              >
                <ArrowLeft className="w-3 h-3 inline mr-1" /> Trocar equipe
              </button>
            </div>
          )}
        </div>
      </div>

      {/* EPI pending card - prominent position */}
      {pendingEpiCount > 0 && (
        <div
          className="w-full max-w-md mb-5 rounded-2xl border relative z-10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500"
          style={{
            background: "linear-gradient(135deg, hsl(40 80% 15%), hsl(35 60% 11%))",
            borderColor: "hsl(40 70% 30%)",
            boxShadow: "0 4px 24px hsl(40 80% 20% / 0.35), inset 0 1px 0 hsl(40 90% 50% / 0.1)",
          }}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(40 90% 50%), hsl(35 85% 45%))" }}>
                <HardHat className="w-5.5 h-5.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: "hsl(40 90% 75%)" }}>
                  {pendingEpiCount === 1 ? "EPI pendente de aceite" : `${pendingEpiCount} EPIs pendentes de aceite`}
                </p>
                {pendingEpiCount === 1 && pendingEpis[0] ? (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-xs font-medium" style={{ color: "hsl(40 60% 65%)" }}>
                      🦺 {pendingEpis[0].epi_name}
                    </p>
                    <p className="text-[11px]" style={{ color: "hsl(40 40% 50%)" }}>
                      Entrega: {new Date(pendingEpis[0].delivered_at + "T00:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs mt-1" style={{ color: "hsl(40 50% 55%)" }}>
                    Você possui {pendingEpiCount} EPIs aguardando sua assinatura
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowEpiAcceptance(true)}
              className="w-full mt-3 h-10 text-sm font-semibold rounded-xl transition-all hover:brightness-110 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, hsl(40 85% 45%), hsl(35 80% 40%))",
                color: "white",
                boxShadow: "0 2px 10px hsl(40 80% 35% / 0.4)",
              }}
            >
              Ver e assinar
            </button>
          </div>
        </div>
      )}

      {/* Steps timeline */}
      <div className="w-full max-w-md p-6 mb-6 rounded-2xl border border-white/10 relative z-10" style={{ background: "linear-gradient(180deg, hsl(210 30% 14%) 0%, hsl(215 25% 11%) 100%)", boxShadow: "0 8px 32px hsl(220 40% 5% / 0.5)" }}>
        <div className="space-y-4">
          {STEPS.map((step, index) => {
            const record = getRecordForStep(step.key);
            const isActive = index === currentStepIndex;
            const isDone = !!record;
            const Icon = step.icon;

            return (
              <div key={step.key} className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                  style={
                    isDone
                      ? { background: "hsl(152 55% 42%)", color: "white" }
                      : isActive
                        ? { background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", color: "white", boxShadow: "0 0 16px hsl(210 70% 40% / 0.4)" }
                        : { background: "hsl(210 20% 20%)", color: "hsl(210 15% 45%)" }
                  }
                >
                  {isDone ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="font-semibold text-sm"
                    style={{
                      color: isDone
                        ? "hsl(152 55% 55%)"
                        : isActive
                          ? "hsl(0 0% 92%)"
                          : "hsl(210 15% 45%)",
                    }}
                  >
                    {step.label}
                  </p>
                  {record && (
                    <div>
                      <p className="text-xs tabular-nums" style={{ color: "hsl(210 15% 50%)" }}>
                        {formatTime(record.punched_at)}
                      </p>
                      {record.address && (
                        <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "hsl(210 15% 50%)" }}>
                          <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: "hsl(152 55% 50%)" }} />
                          <span className="truncate max-w-[200px]">{record.address}</span>
                        </p>
                      )}
                      {record.photo_url && (
                        <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "hsl(210 15% 50%)" }}>
                          <Camera className="w-3 h-3 flex-shrink-0" style={{ color: "hsl(152 55% 50%)" }} />
                          <span>Foto registrada ✓</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Worked time */}
      {records.length > 0 && (
        <div className="w-full max-w-md p-4 mb-6 rounded-2xl border border-white/10 relative z-10" style={{ background: "hsl(210 30% 13%)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: "hsl(210 15% 50%)" }}>
              Horas trabalhadas
            </span>
            <span className="text-lg font-bold tabular-nums" style={{ color: "hsl(0 0% 95%)" }}>
              {getWorkedTime()}
            </span>
          </div>
        </div>
      )}

      {/* Geo status */}
      {geoStatus && (
        <p className="text-xs mb-3 flex items-center gap-1 relative z-10" style={{ color: "hsl(210 15% 50%)" }}>
          <MapPin className="w-3 h-3" /> {geoStatus}
        </p>
      )}

      {/* Action button */}
      <div className="w-full max-w-md space-y-3 relative z-10">
        {recordsLoading ? (
          <div className="w-full h-14 flex items-center justify-center gap-2 text-sm" style={{ color: "hsl(210 15% 55%)" }}>
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Carregando registros do dia...
          </div>
        ) : navigator.onLine && !serverStepInfo && validatedContext ? (
          <div className="w-full h-14 flex items-center justify-center gap-2 text-sm" style={{ color: "hsl(210 15% 55%)" }}>
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Consultando próxima etapa...
          </div>
        ) : !allDone && nextAllowedStep ? (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading || recordsLoading}
            className="w-full h-14 text-base font-semibold rounded-xl transition-all duration-200 hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", color: "white", boxShadow: "0 4px 20px hsl(210 70% 40% / 0.35)" }}
          >
            {loading ? (
              "Registrando..."
            ) : (
              <>
                <Camera className="w-5 h-5" />
                Registrar {nextAllowedStep.label}
              </>
            )}
          </button>
        ) : (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 font-semibold" style={{ color: "hsl(152 55% 55%)" }}>
              <Check className="w-5 h-5" />
              Todos os registros do dia já foram concluídos
            </div>
            <p className="text-sm mt-1" style={{ color: "hsl(210 15% 50%)" }}>
              Total: {getWorkedTime()}
            </p>
          </div>
        )}

        {/* EPI pending notification */}
        {pendingEpiCount > 0 && (
          <button
            onClick={() => setShowEpiAcceptance(true)}
            className="w-full mb-3 p-3 rounded-xl border text-left transition-all hover:-translate-y-0.5 flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, hsl(40 80% 15%), hsl(35 70% 12%))", borderColor: "hsl(40 80% 35%)", boxShadow: "0 4px 16px hsl(40 80% 20% / 0.3)" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "hsl(40 90% 50%)" }}>
              <HardHat className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "hsl(40 90% 75%)" }}>
                {pendingEpiCount} EPI{pendingEpiCount > 1 ? "s" : ""} pendente{pendingEpiCount > 1 ? "s" : ""} de aceite
              </p>
              <p className="text-xs" style={{ color: "hsl(40 50% 55%)" }}>Toque para visualizar e assinar</p>
            </div>
          </button>
        )}

        {/* Secondary actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            className="flex-1 h-11 text-sm font-medium rounded-xl border border-white/10 transition-all duration-200 hover:bg-white/5 flex items-center justify-center gap-1.5"
            style={{ background: "hsl(210 30% 14%)", color: "hsl(0 0% 85%)" }}
            onClick={() => setShowManualPunch(true)}
          >
            <Pencil className="w-4 h-4" />
            Manual
          </button>
          <button
            className="flex-1 h-11 text-sm font-medium rounded-xl border border-white/10 transition-all duration-200 hover:bg-white/5 flex items-center justify-center gap-1.5"
            style={{ background: "hsl(210 30% 14%)", color: "hsl(0 0% 85%)" }}
            onClick={fetchHistory}
          >
            <History className="w-4 h-4" />
            Histórico
          </button>
          <button
            className="flex-1 h-11 text-sm font-medium rounded-xl border border-white/10 transition-all duration-200 hover:bg-white/5 flex items-center justify-center gap-1.5"
            style={{ background: "hsl(210 30% 14%)", color: "hsl(0 0% 85%)" }}
            onClick={() => setShowJustification(true)}
          >
            <FileText className="w-4 h-4" />
            Atestado
          </button>
        </div>
      </div>
    </div>
  );
}
