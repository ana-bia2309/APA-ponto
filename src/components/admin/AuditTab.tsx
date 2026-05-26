import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Shield, AlertTriangle, ChevronDown, ChevronUp, Search, Filter } from "lucide-react";

interface AuditLog {
  id: string;
  admin_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: any;
  created_at: string;
  ip_address?: string | null;
}

const ACTION_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  approve_justification:        { label: "Aprovou atestado",            color: "text-emerald-600 bg-emerald-500/10", emoji: "✅" },
  reject_justification:         { label: "Desaprovou atestado",         color: "text-rose-600 bg-rose-500/10",     emoji: "❌" },
  delete_time_record:           { label: "Excluiu registro de ponto",   color: "text-rose-600 bg-rose-500/10",     emoji: "🗑️" },
  admin_manual_punch:           { label: "Correção manual de ponto",    color: "text-amber-600 bg-amber-500/10",   emoji: "✏️" },
  update_employee:              { label: "Editou colaborador",          color: "text-blue-600 bg-blue-500/10",     emoji: "👤" },
  delete_employee:              { label: "Excluiu colaborador",         color: "text-rose-600 bg-rose-500/10",     emoji: "🗑️" },
  toggle_employee:              { label: "Ativou/desativou colaborador",color: "text-purple-600 bg-purple-500/10", emoji: "🔄" },
  payroll_calculated_employee:  { label: "Calculou folha",              color: "text-blue-600 bg-blue-500/10",     emoji: "💰" },
  payroll_period_closed:        { label: "Fechou período da folha",     color: "text-emerald-600 bg-emerald-500/10",emoji: "🔒" },
  payroll_period_closed_auto:   { label: "Fechamento automático",       color: "text-emerald-600 bg-emerald-500/10",emoji: "🤖" },
  payroll_period_reopened:      { label: "Reabriu período da folha",    color: "text-amber-600 bg-amber-500/10",   emoji: "🔓" },
  create_employee:              { label: "Cadastrou colaborador",       color: "text-emerald-600 bg-emerald-500/10",emoji: "➕" },
  epi_delivered:                { label: "Registrou entrega de EPI",    color: "text-blue-600 bg-blue-500/10",     emoji: "🦺" },
  epi_accepted:                 { label: "Colaborador aceitou EPI",     color: "text-emerald-600 bg-emerald-500/10",emoji: "✅" },
  create_user:                  { label: "Criou usuário",               color: "text-blue-600 bg-blue-500/10",     emoji: "👤" },
  delete_user:                  { label: "Excluiu usuário",             color: "text-rose-600 bg-rose-500/10",     emoji: "🗑️" },
};

const ACTION_CATEGORIES = [
  { key: "todos", label: "Todos" },
  { key: "ponto", label: "Ponto", actions: ["delete_time_record", "admin_manual_punch"] },
  { key: "colaborador", label: "Colaborador", actions: ["create_employee", "update_employee", "delete_employee", "toggle_employee"] },
  { key: "folha", label: "Folha", actions: ["payroll_calculated_employee", "payroll_period_closed", "payroll_period_closed_auto", "payroll_period_reopened"] },
  { key: "epi", label: "EPI", actions: ["epi_delivered", "epi_accepted"] },
  { key: "atestado", label: "Atestado", actions: ["approve_justification", "reject_justification"] },
];

export default function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todos");
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setLogs((data as AuditLog[]) || []);

      // Busca emails dos admins
      const ids = [...new Set((data || []).map((l: AuditLog) => l.admin_user_id).filter(Boolean))];
      if (ids.length > 0) {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: any) => { map[p.id] = p.full_name || p.email || p.id.slice(0, 8); });
          setUserEmails(map);
        }
      }
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
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  const filteredLogs = logs.filter(log => {
    const actionInfo = ACTION_LABELS[log.action];
    const label = actionInfo?.label || log.action;
    const empName = log.details?.employee_name || "";
    const user = userEmails[log.admin_user_id || ""] || "";

    const matchBusca = !busca ||
      label.toLowerCase().includes(busca.toLowerCase()) ||
      empName.toLowerCase().includes(busca.toLowerCase()) ||
      user.toLowerCase().includes(busca.toLowerCase());

    const cat = ACTION_CATEGORIES.find(c => c.key === categoria);
    const matchCat = categoria === "todos" || (cat?.actions || []).includes(log.action);

    return matchBusca && matchCat;
  });

  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <AlertTriangle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" size="sm" onClick={fetchLogs}>
        <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Log de Auditoria
        </h2>
        <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por ação, funcionário ou usuário..."
            value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {ACTION_CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => setCategoria(cat.key)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                categoria === cat.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filteredLogs.length} registro(s) encontrado(s)</p>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <Card key={i} className="p-3 animate-pulse"><div className="h-8 bg-muted rounded" /></Card>)}
        </div>
      ) : filteredLogs.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma ação registrada</p>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const info = ACTION_LABELS[log.action] || { label: log.action, color: "text-muted-foreground bg-muted", emoji: "📋" };
            const userName = userEmails[log.admin_user_id || ""] || (log.admin_user_id ? log.admin_user_id.slice(0, 8) + "..." : "Sistema");
            const isExpanded = expandedId === log.id;

            return (
              <Card key={log.id} className={`overflow-hidden transition-all ${isExpanded ? "ring-1 ring-primary/30" : ""}`}>
                <button className="w-full p-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${info.color}`}>
                        {info.emoji} {info.label}
                      </span>
                      <div className="min-w-0">
                        {log.details?.employee_name && (
                          <p className="text-sm font-medium text-foreground truncate">
                            {log.details.employee_name}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          por <span className="font-medium text-foreground">{userName}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </span>
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                </button>

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detalhes da ação</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Usuário */}
                      <div className="space-y-1">
                        <p className="text-muted-foreground font-medium">👤 Usuário</p>
                        <p className="text-foreground font-mono bg-muted px-2 py-1 rounded">{userName}</p>
                      </div>

                      {/* Data/hora */}
                      <div className="space-y-1">
                        <p className="text-muted-foreground font-medium">🕐 Data e hora</p>
                        <p className="text-foreground font-mono bg-muted px-2 py-1 rounded">
                          {new Date(log.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>

                      {/* IP */}
                      {log.ip_address && (
                        <div className="space-y-1">
                          <p className="text-muted-foreground font-medium">🌐 IP</p>
                          <p className="text-foreground font-mono bg-muted px-2 py-1 rounded">{log.ip_address}</p>
                        </div>
                      )}

                      {/* ID do alvo */}
                      {log.target_id && (
                        <div className="space-y-1">
                          <p className="text-muted-foreground font-medium">🎯 ID do registro</p>
                          <p className="text-foreground font-mono bg-muted px-2 py-1 rounded truncate">{log.target_id}</p>
                        </div>
                      )}
                    </div>

                    {/* Detalhes da alteração */}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">📋 Dados da alteração</p>
                        <div className="bg-muted rounded-lg p-3 space-y-1.5">
                          {Object.entries(log.details).map(([key, value]) => {
                            if (!value) return null;
                            const keyLabels: Record<string, string> = {
                              employee_name: "Funcionário",
                              reason: "Justificativa",
                              step: "Tipo de registro",
                              recorded_at: "Data/hora do ponto",
                              old_value: "Valor anterior",
                              new_value: "Novo valor",
                              field: "Campo alterado",
                              admin_email: "Admin responsável",
                            };
                            return (
                              <div key={key} className="flex items-start gap-2 text-xs">
                                <span className="text-muted-foreground flex-shrink-0 w-28">{keyLabels[key] || key}:</span>
                                <span className="text-foreground font-medium break-all">
                                  {typeof value === "string" && value.includes("T") && value.includes("Z")
                                    ? new Date(value).toLocaleString("pt-BR")
                                    : String(value)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Antes x Depois */}
                    {(log.details?.old_value || log.details?.new_value) && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-rose-500/10 rounded-lg p-3">
                          <p className="text-[10px] text-rose-600 font-bold uppercase mb-1">ANTES</p>
                          <p className="text-xs text-foreground">{String(log.details.old_value || "—")}</p>
                        </div>
                        <div className="bg-emerald-500/10 rounded-lg p-3">
                          <p className="text-[10px] text-emerald-600 font-bold uppercase mb-1">DEPOIS</p>
                          <p className="text-xs text-foreground">{String(log.details.new_value || "—")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}