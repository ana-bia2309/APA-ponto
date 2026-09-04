import { useState, useEffect, useRef, TouchEvent } from "react";
import { LogIn, Coffee, RotateCcw, LogOut, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { type TimeRecordRow } from "@/lib/time-records";

type PunchStep = "entrada" | "intervalo" | "retorno" | "saida";
type Employee = Tables<"employees">;

const ALL_STEPS: { key: PunchStep; label: string; icon: typeof LogIn }[] = [
  { key: "entrada", label: "entrada", icon: LogIn },
  { key: "intervalo", label: "pausa", icon: Coffee },
  { key: "retorno", label: "retorno", icon: RotateCcw },
  { key: "saida", label: "saída", icon: LogOut },
];

const SIMPLE_STEPS: { key: PunchStep; label: string; icon: typeof LogIn }[] = [
  { key: "entrada", label: "entrada", icon: LogIn },
  { key: "saida", label: "saída", icon: LogOut },
];

interface ManualPunchProps {
  employee: Employee;
  cpf: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ScrollPicker({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const prev = (value - 1 + max) % max;
  const next = (value + 1) % max;

  const handleTouchStart = (e: TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (touchStartY.current === null) return;
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diff) > 20) {
      onChange(diff > 0 ? next : prev);
    }
    touchStartY.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    onChange(e.deltaY > 0 ? next : prev);
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center select-none cursor-ns-resize"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      <button
        type="button"
        onClick={() => onChange(prev)}
        className="text-3xl font-light text-muted-foreground/40 tabular-nums h-12 flex items-center"
      >
        {prev.toString().padStart(2, "0")}
      </button>
      <div className="border-t border-b border-border my-1 py-2">
        <span className="text-5xl font-bold text-accent tabular-nums">
          {value.toString().padStart(2, "0")}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange(next)}
        className="text-3xl font-light text-muted-foreground/40 tabular-nums h-12 flex items-center"
      >
        {next.toString().padStart(2, "0")}
      </button>
    </div>
  );
}

export default function ManualPunch({ employee, cpf, onClose, onSuccess }: ManualPunchProps) {
  const [selectedStep, setSelectedStep] = useState<PunchStep | null>(null);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [nightShift, setNightShift] = useState(false);
  const [remainingCorrections, setRemainingCorrections] = useState(5);
  const [loading, setLoading] = useState(false);
  const [existingTimes, setExistingTimes] = useState<Record<PunchStep, string | null>>({
    entrada: null, intervalo: null, retorno: null, saida: null,
  });

  const STEPS = employee.punch_mode === "simple" ? SIMPLE_STEPS : ALL_STEPS;
  const today = new Date();
  const dayLabel = today.toLocaleDateString("pt-BR", { weekday: "short" });
  const dateLabel = today.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  useEffect(() => {
    fetchMonthlyCount();
    fetchTodayRecords();
  }, []);

  const fetchMonthlyCount = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const { data: count } = await (supabase as any)
      .rpc("get_manual_punches_count_by_cpf", { p_cpf: cpf, p_start: startOfMonth, p_end: endOfMonth });
    setRemainingCorrections(5 - (Number(count) || 0));
  };

  const fetchTodayRecords = async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { data } = await (supabase as any)
      .rpc("get_time_records_by_employee_id", {
        p_employee_id: employee.id,
        p_start: `${todayStr}T00:00:00`,
        p_end: `${todayStr}T23:59:59`,
      });
    if (data) {
      const times: Record<string, string | null> = { entrada: null, intervalo: null, retorno: null, saida: null };
      (data as TimeRecordRow[]).forEach((r) => {
        times[r.record_type] = new Date(r.recorded_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      });
      setExistingTimes(times as Record<PunchStep, string | null>);
    }
  };

  const handleConfirm = async () => {
    if (!selectedStep || remainingCorrections <= 0) return;
    setLoading(true);
    try {
      const now = new Date();
      const punchedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

      const cpfDigits = cpf.replace(/\D/g, "");
      const { error } = await supabase.rpc("insert_manual_punch_with_cpf" as any, {
        p_cpf: cpfDigits,
        p_step: selectedStep,
        p_punched_at: punchedAt.toISOString(),
        p_reason: nightShift ? "Correção manual (jornada noturna)" : "Correção manual",
      });
      if (error) {
        console.error("DEBUG: manual punch RPC error:", error);
        throw error;
      }

      toast.success(`${selectedStep} manual registrada às ${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`);
      onSuccess();
      onClose();
    } catch {
      toast.error("Erro ao registrar ponto manual");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <div className="flex justify-end p-4">
        <button onClick={onClose} className="text-foreground"><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 flex flex-col items-center px-6">
        <h2 className="text-xl font-semibold text-foreground mb-1">lançamento de ponto manual</h2>
        <p className="text-sm text-muted-foreground mb-6">{dayLabel} | {dateLabel}</p>

        {remainingCorrections <= 0 ? (
          <div className="text-center py-8">
            <p className="text-destructive font-semibold text-lg">Limite atingido</p>
            <p className="text-muted-foreground text-sm mt-2">Você já usou 5 correções manuais este mês.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-foreground mb-4">qual o tipo e horário do ponto?</p>

            <div className="flex gap-4 mb-8">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const isSelected = selectedStep === step.key;
                return (
                  <button
                    key={step.key}
                    onClick={() => setSelectedStep(step.key)}
                    className={`flex flex-col items-center gap-1 transition-colors ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <Icon className="w-8 h-8" />
                    <span className="text-xs">{step.label}</span>
                    <span className={`text-xs px-3 py-1 rounded border ${isSelected ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                      {existingTimes[step.key] || "--:--"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scroll wheel time picker */}
            <div className="flex items-center gap-6 mb-6">
              <ScrollPicker value={hours} max={24} onChange={setHours} />
              <span className="text-5xl font-bold text-accent">:</span>
              <ScrollPicker value={minutes} max={60} onChange={setMinutes} />
            </div>

            {/* Night shift toggle */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-semibold text-foreground">jornada noturna</span>
              <button
                onClick={() => setNightShift(!nightShift)}
                className={`relative w-12 h-7 rounded-full transition-colors ${nightShift ? "bg-destructive" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-background shadow transition-transform ${nightShift ? "left-[calc(100%-1.625rem)]" : "left-0.5"}`}>
                  {nightShift && <X className="w-4 h-4 text-destructive absolute top-1 left-1" />}
                </span>
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Correções restantes: <span className="font-semibold text-foreground">{remainingCorrections}/5</span>
            </p>
          </>
        )}
      </div>

      <div className="flex border-t border-border">
        <button onClick={onClose} className="flex-1 py-4 text-destructive font-medium text-center">Voltar</button>
        <button
          onClick={handleConfirm}
          disabled={!selectedStep || loading || remainingCorrections <= 0}
          className="flex-1 py-4 text-accent font-medium text-center disabled:opacity-40"
        >
          {loading ? "Salvando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
