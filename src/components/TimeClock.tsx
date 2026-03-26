import { useState, useEffect } from "react";
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
} from "lucide-react";
import logo from "@/assets/logo.jpg";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import CameraCapture from "@/components/CameraCapture";
import ManualPunch from "@/components/ManualPunch";
import AbsenceJustification from "@/components/AbsenceJustification";

type PunchStep = "entrada" | "intervalo" | "retorno" | "saida";
type Employee = Tables<"employees">;
type PunchRecord = Tables<"punch_records">;

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

export default function TimeClock() {
  const [now, setNow] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
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

  const STEPS = selectedEmployee && selectedEmployee.punch_mode === "simple"
    ? SIMPLE_STEPS
    : ALL_STEPS;

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

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from("employees")
      .select("*")
      .eq("active", true)
      .order("name");
    if (data) setEmployees(data);
  };

  const fetchTodayRecords = async (employeeId: string) => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("punch_records")
      .select("*")
      .eq("employee_id", employeeId)
      .gte("punched_at", `${today}T00:00:00`)
      .lte("punched_at", `${today}T23:59:59`)
      .order("punched_at");
    if (data) setRecords(data);
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

  const handlePunchWithPhoto = async (photoBlob: Blob) => {
    setShowCamera(false);
    if (!selectedEmployee || currentStepIndex >= STEPS.length) return;
    setLoading(true);
    try {
      const [location, photoUrl] = await Promise.all([
        getLocation(),
        uploadPhoto(photoBlob, selectedEmployee.id),
      ]);
      const step = STEPS[currentStepIndex];
      const { error } = await supabase.from("punch_records").insert({
        employee_id: selectedEmployee.id,
        step: step.key,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        address: location?.address ?? null,
        photo_url: photoUrl,
      });
      if (error) throw error;
      toast.success(`${step.label} registrada com foto!`);
      fetchTodayRecords(selectedEmployee.id);
    } catch {
      toast.error("Erro ao registrar ponto");
    } finally {
      setLoading(false);
    }
  };

  const currentStepIndex = records.length;
  const allDone = currentStepIndex >= STEPS.length;

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

  const verifyCpf = () => {
    if (!pendingEmployee) return;
    const inputDigits = cpfInput.replace(/\D/g, "");
    const storedDigits = (pendingEmployee.cpf || "").replace(/\D/g, "");
    if (inputDigits === storedDigits) {
      setSelectedEmployee(pendingEmployee);
      setPendingEmployee(null);
      setCpfInput("");
      setCpfError("");
    } else {
      setCpfError("CPF incorreto. Tente novamente.");
    }
  };

  // CPF verification screen
  if (pendingEmployee) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center mb-8">
          <img src={logo} alt="Logo" className="w-16 h-16 object-contain mb-2" />
          <div className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Clock className="w-4 h-4" />
            Verificação de Identidade
          </div>
          <p className="text-xl font-bold text-foreground mb-1">{pendingEmployee.name}</p>
          <p className="text-sm text-muted-foreground">Informe seu CPF para continuar</p>
        </div>
        <div className="w-full max-w-sm space-y-4">
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
            className="flex h-14 w-full rounded-md border border-input bg-background px-4 py-2 text-lg text-center tracking-widest ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {cpfError && (
            <p className="text-sm text-destructive text-center font-medium">{cpfError}</p>
          )}
          <Button onClick={verifyCpf} size="lg" className="w-full h-14 text-base font-semibold">
            Confirmar
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => { setPendingEmployee(null); setCpfInput(""); setCpfError(""); }}
          >
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  // Employee selection screen
  if (!selectedEmployee) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center mb-8">
          <img src={logo} alt="Logo" className="w-16 h-16 object-contain mb-2" />
          <div className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Clock className="w-4 h-4" />
            Registro de Ponto
          </div>
          <p className="text-2xl font-bold text-foreground">
            Selecione seu nome
          </p>
        </div>

        <div className="w-full max-w-sm space-y-2">
          {employees.map((emp) => (
            <Button
              key={emp.id}
              variant="outline"
              className="w-full h-14 text-base justify-start"
              onClick={() => {
                if (!emp.cpf) {
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
            </Button>
          ))}
          {employees.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              Nenhum funcionário cadastrado. Peça ao administrador para
              cadastrar.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <img src={logo} alt="Logo" className="w-14 h-14 object-contain mb-2" />
        <div className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-4">
          <Clock className="w-4 h-4" />
          Registro de Ponto
        </div>
        <p className="text-5xl font-bold tracking-tight text-foreground tabular-nums">
          {formatTime(now)}
        </p>
        <p className="text-muted-foreground mt-2 capitalize">
          {formatDate(now)}
        </p>

        {/* Employee selector */}
        <div className="relative mt-4">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            {selectedEmployee.name}
            <ChevronDown className="w-4 h-4" />
          </button>
          {showDropdown && (
            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lg shadow-lg z-10 min-w-[200px]">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => {
                    setSelectedEmployee(emp);
                    setRecords([]);
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-secondary first:rounded-t-lg last:rounded-b-lg transition-colors"
                >
                  {emp.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Steps timeline */}
      <Card className="w-full max-w-md p-6 mb-6 shadow-lg border-border">
        <div className="space-y-4">
          {STEPS.map((step, index) => {
            const record = getRecordForStep(step.key);
            const isActive = index === currentStepIndex;
            const isDone = !!record;
            const Icon = step.icon;

            return (
              <div key={step.key} className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    isDone
                      ? "bg-success text-success-foreground"
                      : isActive
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold text-sm ${
                      isDone
                        ? "text-success"
                        : isActive
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                  {record && (
                    <div>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatTime(record.punched_at)}
                      </p>
                      {record.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-success flex-shrink-0" />
                          <span className="truncate max-w-[200px]">{record.address}</span>
                        </p>
                      )}
                      {record.photo_url && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Camera className="w-3 h-3 text-success flex-shrink-0" />
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
      </Card>

      {/* Worked time */}
      {records.length > 0 && (
        <Card className="w-full max-w-md p-4 mb-6 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">
              Horas trabalhadas
            </span>
            <span className="text-lg font-bold text-foreground tabular-nums">
              {getWorkedTime()}
            </span>
          </div>
        </Card>
      )}

      {/* Geo status */}
      {geoStatus && (
        <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {geoStatus}
        </p>
      )}

      {/* Action button */}
      <div className="w-full max-w-md space-y-3">
        {!allDone ? (
          <Button
            onClick={() => setShowCamera(true)}
            size="lg"
            className="w-full h-14 text-base font-semibold shadow-md"
            disabled={loading}
          >
            {loading ? (
              "Registrando..."
            ) : (
              <>
                <Camera className="w-5 h-5 mr-2" />
                Registrar {STEPS[currentStepIndex].label}
              </>
            )}
          </Button>
        ) : (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 text-success font-semibold">
              <Check className="w-5 h-5" />
              Jornada completa!
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Total: {getWorkedTime()}
            </p>
          </div>
        )}

        {/* Secondary actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-11 text-sm"
            onClick={() => setShowManualPunch(true)}
          >
            <Pencil className="w-4 h-4 mr-1.5" />
            Ponto Manual
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-11 text-sm"
            onClick={() => setShowJustification(true)}
          >
            <FileText className="w-4 h-4 mr-1.5" />
            Justificativa
          </Button>
        </div>
      </div>
    </div>
  );
}
