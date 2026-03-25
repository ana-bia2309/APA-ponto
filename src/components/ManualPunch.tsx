import { useState, useEffect } from "react";
import { LogIn, Coffee, RotateCcw, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

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
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualPunch({ employee, onClose, onSuccess }: ManualPunchProps) {
  const [selectedStep, setSelectedStep] = useState<PunchStep | null>(null);
  const [hours, setHours] = useState("00");
  const [minutes, setMinutes] = useState("00");
  const [remainingCorrections, setRemainingCorrections] = useState(5);
  const [loading, setLoading] = useState(false);
  const [existingTimes, setExistingTimes] = useState<Record<PunchStep, string | null>>({
    entrada: null,
    intervalo: null,
    retorno: null,
    saida: null,
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

    const { count } = await supabase
      .from("manual_punches")
      .select("*", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .gte("created_at", startOfMonth)
      .lte("created_at", endOfMonth);

    setRemainingCorrections(5 - (count || 0));
  };

  const fetchTodayRecords = async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("punch_records")
      .select("step, punched_at")
      .eq("employee_id", employee.id)
      .gte("punched_at", `${todayStr}T00:00:00`)
      .lte("punched_at", `${todayStr}T23:59:59`);

    if (data) {
      const times: Record<string, string | null> = { entrada: null, intervalo: null, retorno: null, saida: null };
      data.forEach((r) => {
        times[r.step] = new Date(r.punched_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      });
      setExistingTimes(times as Record<PunchStep, string | null>);
    }
  };

  const handleConfirm = async () => {
    if (!selectedStep || remainingCorrections <= 0) return;
    setLoading(true);
    try {
      const now = new Date();
      const punchedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(minutes));

      // Insert into manual_punches for tracking the limit
      const { error: manualError } = await supabase.from("manual_punches").insert({
        employee_id: employee.id,
        step: selectedStep,
        punched_at: punchedAt.toISOString(),
        reason: "Correção manual",
      });
      if (manualError) throw manualError;

      // Also insert into punch_records so it shows in timeline
      const { error: punchError } = await supabase.from("punch_records").insert({
        employee_id: employee.id,
        step: selectedStep,
        punched_at: punchedAt.toISOString(),
        address: "Registro manual",
      });
      if (punchError) throw punchError;

      toast.success(`${selectedStep} manual registrada às ${hours}:${minutes}`);
      onSuccess();
      onClose();
    } catch {
      toast.error("Erro ao registrar ponto manual");
    } finally {
      setLoading(false);
    }
  };

  const scrollHours = (dir: number) => {
    let h = (parseInt(hours) + dir + 24) % 24;
    setHours(h.toString().padStart(2, "0"));
  };

  const scrollMinutes = (dir: number) => {
    let m = (parseInt(minutes) + dir + 60) % 60;
    setMinutes(m.toString().padStart(2, "0"));
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="flex justify-end p-4">
        <button onClick={onClose} className="text-foreground">
          <X className="w-6 h-6" />
        </button>
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

            {/* Step selector */}
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

            {/* Time picker */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex flex-col items-center">
                <button onClick={() => scrollHours(1)} className="text-muted-foreground hover:text-foreground p-2">
                  <div className="w-16 border-t border-border" />
                </button>
                <span className="text-5xl font-bold text-accent tabular-nums">{hours}</span>
                <button onClick={() => scrollHours(-1)} className="text-muted-foreground hover:text-foreground p-2">
                  <div className="w-16 border-t border-border" />
                </button>
              </div>
              <span className="text-5xl font-bold text-accent">:</span>
              <div className="flex flex-col items-center">
                <button onClick={() => scrollMinutes(1)} className="text-muted-foreground hover:text-foreground p-2">
                  <div className="w-16 border-t border-border" />
                </button>
                <span className="text-5xl font-bold text-accent tabular-nums">{minutes}</span>
                <button onClick={() => scrollMinutes(-1)} className="text-muted-foreground hover:text-foreground p-2">
                  <div className="w-16 border-t border-border" />
                </button>
              </div>
            </div>

            {/* Remaining corrections */}
            <p className="text-sm text-muted-foreground mb-4">
              Correções restantes: <span className="font-semibold text-foreground">{remainingCorrections}/5</span>
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex border-t border-border">
        <button onClick={onClose} className="flex-1 py-4 text-destructive font-medium text-center">
          Voltar
        </button>
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
