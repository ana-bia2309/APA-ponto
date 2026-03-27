import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Shield, AlertTriangle } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: any;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  approve_justification: "Aprovou atestado",
  reject_justification: "Desaprovou atestado",
  delete_time_record: "Excluiu registro de ponto",
  admin_manual_punch: "Correção manual de ponto",
  update_employee: "Editou colaborador",
  delete_employee: "Excluiu colaborador",
  toggle_employee: "Ativou/desativou colaborador",
};

export default function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setLogs((data as AuditLog[]) || []);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-3 animate-pulse"><div className="h-8 bg-muted rounded" /></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Log de Auditoria</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchLogs}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {logs.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma ação registrada</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {ACTION_LABELS[log.action] || log.action}
                  </p>
                  {log.details && (
                    <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                      {log.details.employee_name && <span>Funcionário: {log.details.employee_name}</span>}
                      {log.details.reason && <p>Motivo: {log.details.reason}</p>}
                      {log.details.step && <span> • {log.details.step}</span>}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(log.created_at)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
