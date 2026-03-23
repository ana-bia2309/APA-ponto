import { useState, useEffect } from "react";
import { Clock, LogIn, Coffee, RotateCcw, LogOut, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type PunchStep = "entrada" | "intervalo" | "retorno" | "saida";

interface PunchRecord {
  step: PunchStep;
  time: Date;
}

const STEPS: { key: PunchStep; label: string; icon: typeof Clock }[] = [
  { key: "entrada", label: "Entrada", icon: LogIn },
  { key: "intervalo", label: "Intervalo", icon: Coffee },
  { key: "retorno", label: "Retorno", icon: RotateCcw },
  { key: "saida", label: "Saída", icon: LogOut },
];

const formatTime = (date: Date) =>
  date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const formatDate = (date: Date) =>
  date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

export default function TimeClock() {
  const [now, setNow] = useState(new Date());
  const [records, setRecords] = useState<PunchRecord[]>(() => {
    const saved = localStorage.getItem("punch-records");
    if (saved) {
      const parsed = JSON.parse(saved) as { step: PunchStep; time: string }[];
      const today = new Date().toDateString();
      const todayRecords = parsed.filter((r) => new Date(r.time).toDateString() === today);
      return todayRecords.map((r) => ({ step: r.step, time: new Date(r.time) }));
    }
    return [];
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("punch-records", JSON.stringify(records));
  }, [records]);

  const currentStepIndex = records.length;
  const allDone = currentStepIndex >= STEPS.length;

  const handlePunch = () => {
    if (allDone) return;
    const step = STEPS[currentStepIndex];
    setRecords((prev) => [...prev, { step: step.key, time: new Date() }]);
  };

  const handleReset = () => {
    setRecords([]);
    localStorage.removeItem("punch-records");
  };

  const getRecordForStep = (key: PunchStep) => records.find((r) => r.step === key);

  // Calculate worked hours
  const getWorkedTime = () => {
    const entrada = getRecordForStep("entrada");
    const intervalo = getRecordForStep("intervalo");
    const retorno = getRecordForStep("retorno");
    const saida = getRecordForStep("saida");

    let totalMs = 0;
    if (entrada && intervalo) {
      totalMs += intervalo.time.getTime() - entrada.time.getTime();
    } else if (entrada && !intervalo) {
      totalMs += now.getTime() - entrada.time.getTime();
    }
    if (retorno && saida) {
      totalMs += saida.time.getTime() - retorno.time.getTime();
    } else if (retorno && !saida) {
      totalMs += now.getTime() - retorno.time.getTime();
    }
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    return `${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-4">
          <Clock className="w-4 h-4" />
          Registro de Ponto
        </div>
        <p className="text-5xl font-bold tracking-tight text-foreground tabular-nums">
          {formatTime(now)}
        </p>
        <p className="text-muted-foreground mt-2 capitalize">{formatDate(now)}</p>
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
                {/* Step indicator */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    isDone
                      ? "bg-success text-success-foreground"
                      : isActive
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>

                {/* Step info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold text-sm ${
                      isDone ? "text-success" : isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                  {record && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatTime(record.time)}
                    </p>
                  )}
                </div>

                {/* Connector line */}
                {index < STEPS.length - 1 && (
                  <div className="absolute left-[39px] top-[52px] w-0.5 h-4 bg-border" />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Worked time */}
      {records.length > 0 && (
        <Card className="w-full max-w-md p-4 mb-6 border-border bg-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">Horas trabalhadas</span>
            <span className="text-lg font-bold text-foreground tabular-nums">{getWorkedTime()}</span>
          </div>
        </Card>
      )}

      {/* Action buttons */}
      <div className="w-full max-w-md space-y-3">
        {!allDone ? (
          <Button
            onClick={handlePunch}
            size="lg"
            className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
          >
            {(() => {
              const Icon = STEPS[currentStepIndex].icon;
              return <Icon className="w-5 h-5 mr-2" />;
            })()}
            Registrar {STEPS[currentStepIndex].label}
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

        {records.length > 0 && (
          <Button
            onClick={handleReset}
            variant="outline"
            size="lg"
            className="w-full"
          >
            Limpar registros
          </Button>
        )}
      </div>
    </div>
  );
}
