import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, Clock, WifiOff, AlertTriangle, Activity } from "lucide-react";

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
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.999Z`;

    const [empRes, todayRes, pendingRes, failedRes, recentRes] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("time_records").select("id", { count: "exact", head: true }).gte("recorded_at", startOfDay).lte("recorded_at", endOfDay),
      supabase.from("time_records").select("id", { count: "exact", head: true }).eq("sync_status", "pending"),
      supabase.from("time_records").select("id", { count: "exact", head: true }).eq("sync_status", "failed"),
      (supabase as any).from("time_records").select("id, record_type, recorded_at, mode, sync_status, employees(name)").order("recorded_at", { ascending: false }).limit(10),
    ]);

    setTotalEmployees(empRes.count ?? 0);
    setTodayRecords(todayRes.count ?? 0);
    setPendingOffline(pendingRes.count ?? 0);
    setFailedSync(failedRes.count ?? 0);
    setRecentRecords((recentRes.data as RecentRecord[]) ?? []);
    setLoading(false);
  };

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });

  const cards = [
    { icon: Users, label: "Funcionários ativos", value: totalEmployees, color: "text-primary" },
    { icon: Clock, label: "Registros hoje", value: todayRecords, color: "text-emerald-500" },
    { icon: WifiOff, label: "Pendências offline", value: pendingOffline, color: "text-amber-500" },
    { icon: AlertTriangle, label: "Falhas de sinc.", value: failedSync, color: "text-destructive" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-muted-foreground text-sm">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
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
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Últimos registros</h3>
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
