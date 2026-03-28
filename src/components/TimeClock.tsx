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
import {
  mapTimeRecordToPunchRecord,
  type DisplayPunchRecord,
  type TimeRecordInsert,
  type TimeRecordRow,
} from "@/lib/time-records";

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

// ---- Local cache helpers ----
const OFFLINE_QUEUE_KEY = "apa_ponto_offline_queue";
const RECORDS_CACHE_KEY = "apa_ponto_records_cache";
const EMPLOYEES_CACHE_KEY = "apa_ponto_employees_cache";

interface CachedEmployee {
  id: string;
  name: string;
  cpf: string | null;
  shift: string;
  punch_mode: string;
  has_cpf: boolean;
}

function cacheEmployees(employees: CachedEmployee[]) {
  try {
    localStorage.setItem(EMPLOYEES_CACHE_KEY, JSON.stringify(employees));
  } catch {}
}

function getCachedEmployees(): CachedEmployee[] {
  try {
    return JSON.parse(localStorage.getItem(EMPLOYEES_CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}

function findEmployeeByCpfOffline(cpf: string): CachedEmployee | null {
  const normalized = cpf.replace(/\D/g, "");
  if (!normalized) return null;
  const cached = getCachedEmployees();
  const matches = cached.filter(
    (e) => e.cpf && e.cpf.replace(/\D/g, "") === normalized
  );
  return matches.length === 1 ? matches[0] : null;
}

function cacheRecords(employeeId: string, records: PunchRecord[]) {
  try {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(`${RECORDS_CACHE_KEY}_${employeeId}_${today}`, JSON.stringify(records));
  } catch {}
}

function getCachedRecords(employeeId: string): PunchRecord[] {
  try {
    const today = new Date().toISOString().split("T")[0];
    return JSON.parse(localStorage.getItem(`${RECORDS_CACHE_KEY}_${employeeId}_${today}`) || "[]");
  } catch {
    return [];
  }
}

interface OfflinePunch {
  id: string;
  employee_id: string;
  cpf?: string;
  record_type?: string;
  step?: string;
  latitude: number | null;
  longitude: number | null;
  recorded_at?: string;
  punched_at?: string;
  mode?: string;
  sync_status?: string;
}

function getOfflineQueue(): OfflinePunch[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function addToOfflineQueue(punch: OfflinePunch) {
  const queue = getOfflineQueue();
  queue.push(punch);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function clearOfflineQueue() {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

async function syncOfflineQueue(): Promise<number> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const remaining: OfflinePunch[] = [];

  for (const punch of queue) {
    const cpfDigits = normalizeCpf(punch.cpf || "");
    const { error } = await supabase.rpc("insert_time_record_with_cpf" as any, {
      p_cpf: cpfDigits,
      p_record_type: punch.record_type ?? punch.step,
      p_recorded_at: punch.recorded_at ?? punch.punched_at,
      p_latitude: punch.latitude,
      p_longitude: punch.longitude,
      p_mode: punch.mode ?? "offline",
      p_sync_status: "synced",
    });
    if (error) {
      console.error("DEBUG: offline time_records insert error:", error);
      remaining.push(punch);
    } else {
      synced++;
    }
  }

  if (remaining.length > 0) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } else {
    clearOfflineQueue();
  }
  return synced;
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
  const navigate = useNavigate();

  const filteredEmployees = selectedShift
    ? employees.filter((e) => (e as any).shift === selectedShift)
    : employees;

  const STEPS = selectedEmployee && selectedEmployee.punch_mode === "simple"
    ? SIMPLE_STEPS
    : ALL_STEPS;

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
    setLoading(false);
    navigate("/", { replace: true });
  }, [navigate]);

  // Online/offline listeners
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      const synced = await syncOfflineQueue();
      setIsSyncing(false);
      if (synced > 0) {
        toast.success(`${synced} registro(s) sincronizado(s)!`);
        if (selectedEmployee) fetchTodayRecords(selectedEmployee.id);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Sem internet — registros serão salvos offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) syncOfflineQueue();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [selectedEmployee]);

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
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [selectedEmployee]);

  useEffect(() => {
    if (selectedEmployee) fetchTodayRecords(selectedEmployee.id);
  }, [selectedEmployee]);

  useEffect(() => {
    if (!showSuccess) return;

    const successTimer = window.setTimeout(() => {
      resetToStart();
    }, 2000);

    return () => window.clearTimeout(successTimer);
  }, [showSuccess, resetToStart]);

  const fetchEmployees = async () => {
    if (!navigator.onLine) {
      // Load from cache when offline
      const cached = getCachedEmployees();
      if (cached.length > 0) {
        const mapped = cached.map((e) => ({
          ...e,
          active: true,
          created_at: "",
        })) as Employee[];
        setEmployees(mapped);
      } else {
        toast.error("Sem internet e sem dados em cache.");
      }
      return;
    }

    // Fetch employees via SECURITY DEFINER RPC (does not expose CPF via table policy)
    const { data: fullData, error: fullError } = await supabase.rpc("get_active_employees_with_cpf" as any);

    if (fullError) {
      console.error("Erro ao buscar colaboradores:", fullError);
      // Fallback to public RPC without CPF
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_active_employees_public");
      if (rpcError) {
        toast.error("Erro ao carregar colaboradores");
        return;
      }
      if (rpcData) {
        const mapped = (rpcData as any[]).map((e: any) => ({
          ...e,
          active: true,
          created_at: "",
          cpf: null,
        })) as Employee[];
        setEmployees(mapped);
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
        punch_mode: e.punch_mode,
        has_cpf: !!(e.cpf && e.cpf.trim()),
      }));
      cacheEmployees(cachedList);

      const mapped = cachedList.map((e) => ({
        ...e,
        active: true,
        created_at: "",
      })) as Employee[];
      setEmployees(mapped);
    }
  };

  const fetchTodayRecords = async (employeeId: string) => {
    if (!navigator.onLine) {
      const cached = getCachedRecords(employeeId);
      if (cached.length > 0) setRecords(cached);
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const { data } = await (supabase as any)
      .from("time_records")
      .select("*")
      .eq("employee_id", employeeId)
      .gte("recorded_at", `${today}T00:00:00`)
      .lte("recorded_at", `${today}T23:59:59`)
      .order("recorded_at");
    if (data) {
      const mapped = (data as TimeRecordRow[]).map(mapTimeRecordToPunchRecord);
      setRecords(mapped);
      cacheRecords(employeeId, mapped);
    }
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

  const currentStepIndex = records.length;
  const allDone = currentStepIndex >= STEPS.length;

  const handlePunchWithPhoto = async (photoBlob: Blob) => {
    setShowCamera(false);
    if (!validatedContext || currentStepIndex >= STEPS.length) {
      console.error("DEBUG PONTO [insert]: BLOQUEIO — sem contexto validado ou steps completos");
      toast.error("Erro interno: contexto de validação perdido. Volte ao início e tente novamente.");
      return;
    }
    setLoading(true);
    try {
      void photoBlob;
      const location = await getLocation();
      const step = STEPS[currentStepIndex];
      const { employee_id: employeeId, cpf_normalized: cpfDigits, name: empName } = validatedContext;
      const recordedAt = new Date().toISOString();

      console.log("DEBUG PONTO [insert]: contexto usado:", JSON.stringify({
        name: empName,
        employee_id: employeeId,
        cpf: cpfDigits.slice(0, 3) + "***",
        step: step.key,
        mode: navigator.onLine ? "online" : "offline",
      }));

      if (!cpfDigits) {
        throw new Error("CPF validado não encontrado no contexto. Volte ao início.");
      }

      const punchData: TimeRecordInsert = {
        employee_id: employeeId,
        record_type: step.key,
        recorded_at: recordedAt,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        mode: navigator.onLine ? "online" : "offline",
        sync_status: navigator.onLine ? "synced" : "pending",
      };

      if (navigator.onLine) {
        const { error } = await supabase.rpc("insert_time_record_with_cpf" as any, {
          p_cpf: cpfDigits,
          p_record_type: step.key,
          p_recorded_at: recordedAt,
          p_latitude: location?.lat ?? null,
          p_longitude: location?.lng ?? null,
          p_mode: "online",
          p_sync_status: "synced",
        });
        console.log("DEBUG PONTO [insert]: resultado:", error ? error : "✓ sucesso");
        if (error) {
          console.error("DEBUG PONTO [insert]: erro detalhado:", JSON.stringify(error));
          throw new Error(error.message || error.details || "Falha no insert em public.time_records.");
        }

        await fetchTodayRecords(employeeId);
        setSuccessMessage(`${step.label} registrada com sucesso!`);
        setShowSuccess(true);
      } else {
        addToOfflineQueue({
          id: crypto.randomUUID(),
          ...punchData,
          cpf: cpfDigits,
        });
        setRecords((prev) => [
          ...prev,
          mapTimeRecordToPunchRecord({
            id: crypto.randomUUID(),
            ...punchData,
            created_at: recordedAt,
          }),
        ]);
        setSuccessMessage(`${step.label} salva offline — será sincronizada automaticamente.`);
        setShowSuccess(true);
      }
    } catch (err: any) {
      console.error("DEBUG PONTO [insert]: ERRO:", err);
      const msg = err?.message || err?.details || "Erro desconhecido";
      toast.error(`Erro ao registrar ponto: ${msg}`);
    } finally {
      setLoading(false);
    }
  };


  const getRecordForStep = (key: PunchStep) =>
    records.find((r) => r.step === key);

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
      };
      const empFromCache = { ...offlineMatch, active: true, created_at: "" } as Employee;
      setValidatedContext(ctx);
      setValidatedCpf(ctx.cpf_normalized);
      setSelectedEmployee(empFromCache);
      setValidatedEmployee(empFromCache);
      setPendingEmployee(null);
      setCpfInput("");
      setCpfError("");
      console.log("DEBUG PONTO [verifyCpf]: ✓ contexto validado offline:", JSON.stringify(ctx));
      toast.info("CPF validado offline ✓");
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
      };
      setValidatedContext(ctx);
      setValidatedCpf(ctx.cpf_normalized);
      setSelectedEmployee(employeeFromCpf);
      setValidatedEmployee(employeeFromCpf);
      setPendingEmployee(null);
      setCpfInput("");
      setCpfError("");
      console.log("DEBUG PONTO [verifyCpf]: ✓ contexto validado online:", JSON.stringify(ctx));
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
    setIsSyncing(true);
    const synced = await syncOfflineQueue();
    setIsSyncing(false);
    if (synced > 0) {
      toast.success(`${synced} registro(s) sincronizado(s)!`);
      if (selectedEmployee) fetchTodayRecords(selectedEmployee.id);
    } else {
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
          <WifiOff className="w-3 h-3" /> Sem conexão
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
  if (showConfirm && selectedEmployee && currentStepIndex < STEPS.length) {
    const step = STEPS[currentStepIndex];
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
    const groupedHistory = historyRecords.reduce((acc, rec) => {
      const day = new Date(rec.punched_at).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
      if (!acc[day]) acc[day] = [];
      acc[day].push(rec);
      return acc;
    }, {} as Record<string, PunchRecord[]>);

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

          {Object.keys(groupedHistory).length === 0 ? (
            <div className="text-center py-12">
              <p style={{ color: "hsl(210 15% 45%)" }}>Nenhum registro encontrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(groupedHistory).map(([day, recs]) => (
                <div key={day} className="p-4 rounded-xl border border-white/10" style={{ background: "hsl(210 30% 13%)" }}>
                  <p className="text-sm font-semibold mb-2 capitalize" style={{ color: "hsl(210 20% 65%)" }}>{day}</p>
                  <div className="space-y-1.5">
                    {recs.map((rec) => (
                      <div key={rec.id} className="flex items-center justify-between text-sm">
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "hsl(210 30% 20%)", color: "hsl(200 70% 65%)" }}>
                          {STEP_LABELS[rec.step] || rec.step}
                        </span>
                        <div className="flex items-center gap-2">
                          {rec.address && <MapPin className="w-3 h-3" style={{ color: "hsl(152 55% 50%)" }} />}
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
        {!allDone ? (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading}
            className="w-full h-14 text-base font-semibold rounded-xl transition-all duration-200 hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))", color: "white", boxShadow: "0 4px 20px hsl(210 70% 40% / 0.35)" }}
          >
            {loading ? (
              "Registrando..."
            ) : (
              <>
                <Camera className="w-5 h-5" />
                Registrar {STEPS[currentStepIndex].label}
              </>
            )}
          </button>
        ) : (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 font-semibold" style={{ color: "hsl(152 55% 55%)" }}>
              <Check className="w-5 h-5" />
              Jornada completa!
            </div>
            <p className="text-sm mt-1" style={{ color: "hsl(210 15% 50%)" }}>
              Total: {getWorkedTime()}
            </p>
          </div>
        )}

        {/* Secondary actions */}
        <div className="flex gap-2">
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
