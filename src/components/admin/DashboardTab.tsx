import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Clock, WifiOff, AlertTriangle, Activity, UserCheck, UserX, FileText, RefreshCw } from "lucide-react";

interface RecentRecord {
  id: string;
  record_type: string;
  recorded_at: string;
  mode: string;
  sync_status: string;
  employees?: { name: string };
}

const STEP_LABELS: Record<string, string> = {
  entrada: "Entrada",
  intervalo: "Intervalo",
  retorno: "Retorno",
  saida: "Saída",
};

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  synced: { label: "Online", className: "bg-emerald-500/15 text-emerald-600" },
  pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-600" },
  failed: { label: "Falha", className: "bg-destructive/15 text-destructive" },
};

export default function DashboardTab() {
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [todayRecords, setTodayRecords] = useState(0);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [failedSync, setFailedSync] = useState(0);
  const [presentToday, setPresentToday] = useState(0);
  const [absentToday, setAbsentToday] = useState(0);
  const [pendingJustifications, setPendingJustifications] = useState(0);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString().split("T")[0];
      const startOfDay = `${today}T00:00:00.000Z`;
      const endOfDay = `${today}T23:59:59.999Z`;

      const [empRes, todayRes, pendingRes, failedRes, recentRes, presentRes, justRes] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("time_records").select("id", { count: "exact", head: true }).gte("recorded_at", startOfDay).lte("recorded_at", endOfDay),
        supabase.from("time_records").select("id", { count: "exact", head: true }).eq("sync_status", "pending"),
        supabase.from("time_records").select("id", { count: "exact", head: true }).eq("sync_status", "failed"),
        (supabase as any).from("time_records").select("id, record_type, recorded_at, mode, sync_status, employees(name)").order("recorded_at", { ascending: false }).limit(15),
        (supabase as any).from("time_records").select("employee_id").eq("record_type", "entrada").gte("recorded_at", startOfDay).lte("recorded_at", endOfDay),
        supabase.from("absence_justifications").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      ]);

      // Check for errors
      if (empRes.error || todayRes.error) {
        throw new Error("Falha ao carregar dados do dashboard");
      }

      const totalEmp = empRes.count ?? 0;
      const uniquePresent = new Set((presentRes.data as any[] || []).map((r: any) => r.employee_id)).size;

      setTotalEmployees(totalEmp);
      setTodayRecords(todayRes.count ?? 0);
      setPendingOffline(pendingRes.count ?? 0);
      setFailedSync(failedRes.count ?? 0);
      setPresentToday(uniquePresent);
      setAbsentToday(Math.max(0, totalEmp - uniquePresent));
      setPendingJustifications(justRes.count ?? 0);
      setRecentRecords((recentRes.data as RecentRecord[]) ?? []);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Revalidate on visibility change (app returning from background)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchDashboardData(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchDashboardData]);

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });

  // Determine overall system status
  const systemStatus = failedSync > 0 ? "critical" : pendingOffline > 0 ? "warning" : "ok";
  const statusConfig = {
    critical: { bg: "bg-destructive/10 border-destructive/30", text: "text-destructive", label: "Atenção: falhas de sincronização" },
    warning: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-600", label: "Pendências offline aguardando sync" },
    ok: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600", label: "Sistema operando normalmente" },
  };
  const status = statusConfig[systemStatus];

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground text-center">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchDashboardData()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-10 bg-muted rounded" />
            </Card>
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-3 animate-pulse">
              <div className="h-8 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* System status alert */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${status.bg}`}>
        <Activity className={`w-4 h-4 ${status.text} flex-shrink-0`} />
        <span className={`text-sm font-medium ${status.text}`}>{status.label}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 w-7 p-0"
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Presence summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <UserCheck className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{presentToday}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Presentes hoje</p>
        </Card>
        <Card className="p-3 text-center">
          <UserX className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{absentToday}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Sem registro</p>
        </Card>
        <Card className="p-3 text-center">
          <FileText className="w-5 h-5 text-primary mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{pendingJustifications}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Atestados pend.</p>
        </Card>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Users, label: "Funcionários ativos", value: totalEmployees, color: "text-primary" },
          { icon: Clock, label: "Registros hoje", value: todayRecords, color: "text-emerald-500" },
          { icon: WifiOff, label: "Pendências offline", value: pendingOffline, color: pendingOffline > 0 ? "text-amber-500" : "text-muted-foreground" },
          { icon: AlertTriangle, label: "Falhas de sinc.", value: failedSync, color: failedSync > 0 ? "text-destructive" : "text-muted-foreground" },
        ].map((c) => (
          <Card key={c.label} className={`p-4 ${c.value > 0 && c.color === "text-destructive" ? "border-destructive/30 bg-destructive/5" : c.value > 0 && c.color === "text-amber-500" ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
            <div className="flex items-center gap-3">
              <c.icon className={`w-5 h-5 ${c.color} flex-shrink-0`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent Records */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Últimos registros</h3>
          </div>
        </div>

        {recentRecords.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">Nenhum registro encontrado</p>
        ) : (
          <div className="space-y-2">
            {recentRecords.map((r) => {
              const st = STATUS_STYLE[r.sync_status] || STATUS_STYLE.synced;
              return (
                <Card key={r.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {r.employees?.name || "Desconhecido"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                          {STEP_LABELS[r.record_type] || r.record_type}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(r.recorded_at)}</span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${st.className}`}>
                      {st.label}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
