import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  User, Search, FileDown, Eye, CheckCircle, Clock, AlertTriangle,
  ChevronDown, ChevronUp, HardHat, Package, Loader2,
} from "lucide-react";
import { generateEpiReport, type EpiReportData } from "@/lib/generateEpiReport";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface EpiDelivery {
  id: string;
  epi_id: string;
  employee_id: string;
  delivered_at: string;
  expires_at: string;
  delivered_by: string;
  notes: string | null;
  status: string;
  signature_url: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  tamanho: string;
  quantidade: number;
  estado: string;
  finalidade: string;
  empresa: string;
  setor: string;
  local_entrega: string;
  epis?: { name: string; category: string; ca: string; marca: string; codigo: string };
  employees?: { name: string; cpf: string; cargo: string; departamento: string; matricula: string };
}

interface Props {
  employees: Employee[];
  deliveries: EpiDelivery[];
}

function daysUntilExpiry(expiresAt: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt + "T00:00:00");
  return Math.ceil((exp.getTime() - now.getTime()) / 86400000);
}

function statusBadge(status: string, expiresAt: string) {
  const days = daysUntilExpiry(expiresAt);
  if (status === "aceito") {
    if (days < 0) return <Badge variant="destructive" className="text-[10px]">Vencido</Badge>;
    if (days <= 30) return <Badge className="bg-amber-500 text-white text-[10px]">Vence em {days}d</Badge>;
    return <Badge className="bg-emerald-600 text-white text-[10px]">✓ Aceito</Badge>;
  }
  return <Badge className="bg-amber-500 text-white text-[10px]">Pendente</Badge>;
}

function maskCpf(cpf: string | null): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***.${digits.slice(9)}`;
}

export default function EpiHistoryTab({ employees, deliveries }: Props) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);
  const [signatureModal, setSignatureModal] = useState<{ url: string; name: string; date: string } | null>(null);
  const [signatureImgUrl, setSignatureImgUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Filter employees by search term
  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return employees.filter(e => e.active);
    const term = searchTerm.toLowerCase().replace(/\D/g, "") || searchTerm.toLowerCase();
    return employees.filter(e => {
      if (!e.active) return false;
      if (e.name.toLowerCase().includes(searchTerm.toLowerCase())) return true;
      if (e.matricula && e.matricula.toLowerCase().includes(searchTerm.toLowerCase())) return true;
      if (e.cpf) {
        const cpfDigits = e.cpf.replace(/\D/g, "");
        if (cpfDigits.includes(term)) return true;
      }
      return false;
    });
  }, [employees, searchTerm]);

  // Deliveries for the selected employee
  const employeeDeliveries = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return deliveries.filter(d => d.employee_id === selectedEmployeeId)
      .sort((a, b) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime());
  }, [deliveries, selectedEmployeeId]);

  const selectedEmployee = useMemo(() =>
    employees.find(e => e.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  );

  // Stats
  const stats = useMemo(() => {
    const total = employeeDeliveries.length;
    const accepted = employeeDeliveries.filter(d => d.status === "aceito").length;
    const pending = total - accepted;
    const expired = employeeDeliveries.filter(d => daysUntilExpiry(d.expires_at) < 0).length;
    return { total, accepted, pending, expired };
  }, [employeeDeliveries]);

  const openSignature = useCallback(async (signatureUrl: string, name: string, date: string) => {
    setSignatureModal({ url: signatureUrl, name, date });
    setSignatureImgUrl(null);
    try {
      const { data } = await supabase.storage.from("epi-signatures").createSignedUrl(signatureUrl, 300);
      if (data?.signedUrl) setSignatureImgUrl(data.signedUrl);
    } catch {
      toast.error("Erro ao carregar assinatura");
    }
  }, []);

  const handleGeneratePdf = useCallback(async () => {
    if (!selectedEmployee || employeeDeliveries.length === 0) return;
    setGeneratingPdf(true);
    try {
      const reportData: EpiReportData = {
        employee: {
          name: selectedEmployee.name,
          cpf: selectedEmployee.cpf || "",
          matricula: selectedEmployee.matricula || "",
          cargo: selectedEmployee.cargo || "",
          departamento: selectedEmployee.departamento || "",
          dataAdmissao: selectedEmployee.data_admissao,
        },
        empresa: employeeDeliveries[0]?.empresa || "",
        deliveries: employeeDeliveries.map(d => ({
          epiName: d.epis?.name || "EPI",
          epiCategory: d.epis?.category || "",
          codigo: d.epis?.codigo || "",
          ca: d.epis?.ca || "",
          marca: d.epis?.marca || "",
          tamanho: d.tamanho || "",
          quantidade: d.quantidade || 1,
          estado: d.estado || "Novo",
          deliveredAt: d.delivered_at,
          expiresAt: d.expires_at,
          deliveredBy: d.delivered_by,
          notes: d.notes,
          status: d.status,
          acceptedAt: d.accepted_at,
          signatureUrl: d.signature_url,
        })),
      };
      await generateEpiReport(reportData);
      toast.success("PDF gerado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar PDF: " + (err.message || ""));
    } finally {
      setGeneratingPdf(false);
    }
  }, [selectedEmployee, employeeDeliveries]);

  // No employee selected — show search/select screen
  if (!selectedEmployeeId) {
    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, matrícula ou CPF..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Selecione um colaborador para visualizar o histórico de EPIs
        </p>

        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {filteredEmployees.map(emp => {
            const empDeliveries = deliveries.filter(d => d.employee_id === emp.id);
            const pendingCount = empDeliveries.filter(d => d.status !== "aceito").length;
            return (
              <button
                key={emp.id}
                onClick={() => { setSelectedEmployeeId(emp.id); setSearchTerm(""); }}
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{emp.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {emp.matricula && `Mat: ${emp.matricula} • `}
                      {emp.cargo || "Sem cargo"} •
                      {empDeliveries.length} EPI(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {pendingCount > 0 && (
                    <Badge className="bg-amber-500 text-white text-[10px]">{pendingCount} pendente(s)</Badge>
                  )}
                  {empDeliveries.length > 0 && pendingCount === 0 && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px]">
                      <CheckCircle className="w-3 h-3 mr-0.5" /> Em dia
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
          {filteredEmployees.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {searchTerm ? "Nenhum colaborador encontrado" : "Nenhum colaborador ativo"}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Employee selected — show details
  return (
    <div className="space-y-4">
      {/* Employee header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setSelectedEmployeeId(""); setExpandedDelivery(null); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          ← Voltar à lista
        </button>
        {employeeDeliveries.length > 0 && (
          <Button
            size="sm"
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
            className="text-xs"
          >
            {generatingPdf ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Gerando...</>
            ) : (
              <><FileDown className="w-3.5 h-3.5 mr-1" /> Baixar PDF</>
            )}
          </Button>
        )}
      </div>

      {/* Employee info card */}
      {selectedEmployee && (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base">{selectedEmployee.name}</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span>CPF: {maskCpf(selectedEmployee.cpf)}</span>
                <span>Matrícula: {selectedEmployee.matricula || "—"}</span>
                <span>Cargo: {selectedEmployee.cargo || "—"}</span>
                <span>Departamento: {selectedEmployee.departamento || "—"}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2.5 text-center">
          <div className="text-xl font-bold text-primary">{stats.total}</div>
          <div className="text-[10px] text-muted-foreground">Total</div>
        </Card>
        <Card className="p-2.5 text-center">
          <div className="text-xl font-bold text-emerald-600">{stats.accepted}</div>
          <div className="text-[10px] text-muted-foreground">Aceitos</div>
        </Card>
        <Card className="p-2.5 text-center">
          <div className="text-xl font-bold text-amber-500">{stats.pending}</div>
          <div className="text-[10px] text-muted-foreground">Pendentes</div>
        </Card>
        <Card className="p-2.5 text-center">
          <div className="text-xl font-bold text-destructive">{stats.expired}</div>
          <div className="text-[10px] text-muted-foreground">Vencidos</div>
        </Card>
      </div>

      {/* Deliveries list */}
      {employeeDeliveries.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma entrega de EPI registrada para este colaborador</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {employeeDeliveries.map(d => {
            const isExpanded = expandedDelivery === d.id;
            const days = daysUntilExpiry(d.expires_at);
            return (
              <Card key={d.id} className="overflow-hidden">
                <button
                  onClick={() => setExpandedDelivery(isExpanded ? null : d.id)}
                  className="w-full text-left p-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      d.status === "aceito"
                        ? days < 0 ? "bg-destructive/10" : "bg-emerald-100"
                        : "bg-amber-100"
                    }`}>
                      {d.status === "aceito"
                        ? days < 0 ? <AlertTriangle className="w-4 h-4 text-destructive" /> : <CheckCircle className="w-4 h-4 text-emerald-600" />
                        : <Clock className="w-4 h-4 text-amber-600" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.epis?.name || "EPI"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.epis?.category} • Entrega: {new Date(d.delivered_at + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {statusBadge(d.status, d.expires_at)}
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border pt-3 space-y-3">
                    {/* EPI details */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Categoria:</span> {d.epis?.category || "—"}</div>
                      <div><span className="text-muted-foreground">Código:</span> {d.epis?.codigo || "—"}</div>
                      <div><span className="text-muted-foreground">CA:</span> {d.epis?.ca || "—"}</div>
                      <div><span className="text-muted-foreground">Marca:</span> {d.epis?.marca || "—"}</div>
                      <div><span className="text-muted-foreground">Quantidade:</span> {d.quantidade || 1}</div>
                      <div><span className="text-muted-foreground">Tamanho:</span> {d.tamanho || "—"}</div>
                      <div><span className="text-muted-foreground">Validade:</span> {new Date(d.expires_at + "T00:00:00").toLocaleDateString("pt-BR")}</div>
                      <div><span className="text-muted-foreground">Responsável:</span> {d.delivered_by || "—"}</div>
                    </div>

                    {d.notes && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Observações:</span> {d.notes}
                      </div>
                    )}

                    {/* Signature status */}
                    <div className="rounded-lg border border-border p-3">
                      {d.status === "aceito" && d.accepted_at ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs">
                              <span className="text-emerald-600 font-medium">✓ Assinado</span>
                              <span className="text-muted-foreground ml-2">
                                em {new Date(d.accepted_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            {d.signature_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-[11px] h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSignature(d.signature_url!, d.employees?.name || "—", d.accepted_at!);
                                }}
                              >
                                <Eye className="w-3 h-3 mr-1" /> Ver assinatura
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-amber-600">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-medium">Pendente de assinatura</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Signature Modal */}
      <Dialog open={!!signatureModal} onOpenChange={() => setSignatureModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Assinatura Digital</DialogTitle>
          </DialogHeader>
          {signatureModal && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                <p><strong>Colaborador:</strong> {signatureModal.name}</p>
                <p><strong>Aceito em:</strong> {new Date(signatureModal.date).toLocaleString("pt-BR")}</p>
              </div>
              <div className="border rounded-lg p-2 bg-white flex items-center justify-center min-h-[120px]">
                {signatureImgUrl ? (
                  <img src={signatureImgUrl} alt="Assinatura" className="max-w-full max-h-[160px] object-contain" />
                ) : (
                  <div className="text-xs text-muted-foreground">Carregando assinatura...</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
