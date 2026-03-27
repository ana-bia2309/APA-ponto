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
  }
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
    const { error } = await (supabase as any).from("time_records").insert({
      employee_id: punch.employee_id,
      record_type: punch.record_type ?? punch.step,
      latitude: punch.latitude,
      longitude: punch.longitude,
      recorded_at: punch.recorded_at ?? punch.punched_at,
      mode: punch.mode ?? "offline",
      sync_status: "synced",
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
  const [records, setRecords] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string>("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showManualPunch, setShowManualPunch] = useState(false);
  const [showJustification, setShowJustification] = useState(false);
  const [pendingEmployee, setPendingEmployee] = useState<Employee | null>(null);
  const [cpfInput, setCpfInput] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<PunchRecord[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
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
    setSelectedShift(null);
    setRecords([]);
    setPendingEmployee(null);
    setCpfInput("");
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
      const synced = await syncOfflineQueue();
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
    // Try to sync on mount
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

  useEffect(() => {
    fetchEmployees();
  }, []);

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
    const { data, error } = await supabase.rpc("get_active_employees_public");
    if (error) {
      console.error("Erro ao buscar colaboradores:", error);
      toast.error("Erro ao carregar colaboradores");
      return;
    }
    if (data) {
      const mapped = (data as any[]).map((e: any) => ({
        ...e,
        active: true,
        created_at: "",
        cpf: null,
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

  const resolveEmployeeId = async (employeeId: string) => {
    const { data, error } = await (supabase as any).rpc("get_active_employee_public_by_id", {
      p_employee_id: employeeId,
    });

    if (error) {
      console.error("DEBUG: employee lookup error:", error);
      throw new Error(error.message || "Erro ao validar colaborador no banco.");
    }

    const employee = Array.isArray(data) ? data[0] : null;

    if (!employee?.id) {
      throw new Error("Colaborador não encontrado na tabela public.employees.");
    }

    return employee.id as string;
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
    const { data: urlData } = supabase.storage
      .from("punch-photos")
      .getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const currentStepIndex = records.length;
  const allDone = currentStepIndex >= STEPS.length;

  const handlePunchWithPhoto = async (photoBlob: Blob) => {
    setShowCamera(false);
    if (!selectedEmployee || currentStepIndex >= STEPS.length) return;
    setLoading(true);
    try {
      void photoBlob;
      const location = await getLocation();
      const step = STEPS[currentStepIndex];
      const employeeId = await resolveEmployeeId(selectedEmployee.id);
      const recordedAt = new Date().toISOString();
      const punchData: TimeRecordInsert = {
        employee_id: employeeId,
        record_type: step.key,
        recorded_at: recordedAt,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        mode: navigator.onLine ? "online" : "offline",
        sync_status: navigator.onLine ? "synced" : "pending",
      };

      console.log("DEBUG: time_records employee_id:", punchData.employee_id);
      console.log("DEBUG: time_records record_type:", punchData.record_type);

      if (navigator.onLine) {
        const { error } = await (supabase as any).from("time_records").insert(punchData);
        if (error) {
          console.error("DEBUG: time_records insert error:", error);
          throw new Error(error.message || error.details || "Falha no insert em public.time_records.");
        }

        await fetchTodayRecords(employeeId);
        setSuccessMessage(`${step.label} registrada com sucesso!`);
        setShowSuccess(true);
      } else {
        addToOfflineQueue({
          id: crypto.randomUUID(),
          ...punchData,
        });
        setRecords((prev) => [
          ...prev,
          mapTimeRecordToPunchRecord({
            id: crypto.randomUUID(),
            ...punchData,
            created_at: recordedAt,
          }),
        ]);
        toast.info("Sem internet: registro pendente para sincronização no banco.");
      }
    } catch (err: any) {
      console.error("Punch error:", err);
      console.error("DEBUG: time_records returned error:", err);
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

  if (showManualPunch && selectedEmployee) {
    return (
      <ManualPunch
        employee={selectedEmployee}
        onClose={() => setShowManualPunch(false)}
        onSuccess={() => fetchTodayRecords(selectedEmployee.id)}
      />
    );
  }

  if (showJustification && selectedEmployee) {
    return (
      <AbsenceJustification
        employee={selectedEmployee}
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
    if (!navigator.onLine) {
      setCpfError("Sem conexão para validar CPF.");
      return;
    }
    const { data } = await supabase.rpc("validate_employee_cpf", {
      p_employee_id: pendingEmployee.id,
      p_cpf: cpfInput,
    });
    if (data === true) {
      setSelectedEmployee(pendingEmployee);
      setPendingEmployee(null);
      setCpfInput("");
      setCpfError("");
    } else {
      setCpfError("CPF incorreto. Tente novamente.");
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

  // Get offline pending count
  const pendingCount = getOfflineQueue().length;


  // Punch confirmation handler
  const confirmPunch = () => {
    setShowConfirm(false);
    setShowCamera(true);
  };

  // Connection status indicator (always visible)
  const ConnectionIndicator = () => (
    <div className="fixed top-0 left-0 right-0 z-50 text-center text-xs py-1 flex items-center justify-center gap-1.5 transition-colors duration-300"
      style={{
        background: isOnline
          ? "linear-gradient(90deg, hsl(150 60% 15% / 0.85), hsl(160 50% 18% / 0.85))"
          : "linear-gradient(90deg, hsl(0 70% 20% / 0.9), hsl(10 60% 22% / 0.9))",
        color: isOnline ? "hsl(150 70% 75%)" : "hsl(0 80% 85%)",
        backdropFilter: "blur(8px)",
      }}
    >
      {isOnline ? (
        <><Wifi className="w-3 h-3" /> Online</>
      ) : (
        <>
          <WifiOff className="w-3 h-3" /> Sem conexão
          {pendingCount > 0 && <span className="ml-1">• {pendingCount} pendente(s)</span>}
        </>
      )}
    </div>
  );

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
            onClick={() => { setPendingEmployee(null); setCpfInput(""); setCpfError(""); }}
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
                  setShowDropdown(false);
                } else {
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
                      setRecords([]);
                      setShowDropdown(false);
                    } else {
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
