import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText, Eye, Calendar, User, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Justification {
  id: string;
  employee_id: string;
  date: string;
  reason: string;
  file_url: string | null;
  created_at: string;
  status: string;
  admin_notes: string | null;
  employees?: { name: string };
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  aprovado: { label: "Aprovado", variant: "default" },
  desaprovado: { label: "Desaprovado", variant: "destructive" },
};

export default function JustificationsTab() {
  const [justifications, setJustifications] = useState<Justification[]>([]);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterEmployee, setFilterEmployee] = useState("");
  const [notesId, setNotesId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchJustifications();
  }, [filterMonth]);

  const fetchJustifications = async () => {
    const startDate = `${filterMonth}-01`;
    const [year, month] = filterMonth.split("-").map(Number);
    const endDate = new Date(year, month, 0).toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("absence_justifications")
      .select("*, employees(name)")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar atestados");
    } else {
      setJustifications((data as unknown as Justification[]) || []);
    }
  };

  const updateStatus = async (id: string, status: string, notes?: string) => {
    setActionLoading(id);
    const updateData: any = { status };
    if (notes !== undefined) updateData.admin_notes = notes;

    const { error } = await supabase
      .from("absence_justifications")
      .update(updateData)
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar status");
    } else {
      toast.success(status === "aprovado" ? "Atestado aprovado!" : "Atestado desaprovado!");
      setNotesId(null);
      setNotesText("");
      fetchJustifications();
    }
    setActionLoading(null);
  };

  const filtered = filterEmployee
    ? justifications.filter((j) =>
        (j.employees?.name || "").toLowerCase().includes(filterEmployee.toLowerCase())
      )
    : justifications;

  const pendingCount = filtered.filter((j) => j.status === "pendente").length;

  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

  const getSignedUrl = async (filePath: string): Promise<string | null> => {
    const { data } = await supabase.storage.from("justifications").createSignedUrl(filePath, 300);
    return data?.signedUrl ?? null;
  };

  const handleDownload = async (filePath: string, employeeName: string, date: string) => {
    try {
      const signedUrl = await getSignedUrl(filePath);
      if (!signedUrl) { toast.error("Erro ao gerar link"); return; }
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = filePath.includes(".pdf") ? "pdf" : filePath.split(".").pop() || "pdf";
      a.download = `atestado_${employeeName.replace(/\s+/g, "_")}_${date}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Download iniciado!");
    } catch {
      toast.error("Erro ao baixar arquivo");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <User className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por funcionário"
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="flex-1"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{filtered.length} atestado{filtered.length !== 1 ? "s" : ""}</span>
        {pendingCount > 0 && (
          <Badge variant="secondary">{pendingCount} pendente{pendingCount !== 1 ? "s" : ""}</Badge>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum atestado neste período</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((j) => {
            const sc = STATUS_CONFIG[j.status] || STATUS_CONFIG.pendente;
            const isExpanded = notesId === j.id;

            return (
              <Card key={j.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-foreground truncate">
                        {j.employees?.name || "Desconhecido"}
                      </span>
                      <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">
                        {formatDate(j.date)}
                      </span>
                      <Badge variant={sc.variant}>{sc.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{j.reason}</p>
                    {j.admin_notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> {j.admin_notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {j.file_url && (
                      <>
                        <Button variant="ghost" size="sm" title="Visualizar" onClick={async () => {
                          const url = await getSignedUrl(j.file_url!);
                          if (url) window.open(url, "_blank");
                          else toast.error("Erro ao gerar link");
                        }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Baixar" onClick={() =>
                          handleDownload(j.file_url!, j.employees?.name || "funcionario", j.date)
                        }>
                          <Download className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {!j.file_url && (
                      <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Sem anexo
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                {j.status === "pendente" && (
                  <div className="mt-3 pt-3 border-t border-border">
                    {!isExpanded ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => updateStatus(j.id, "aprovado")}
                          disabled={actionLoading === j.id}
                          className="gap-1"
                        >
                          <CheckCircle className="w-4 h-4" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateStatus(j.id, "desaprovado")}
                          disabled={actionLoading === j.id}
                          className="gap-1"
                        >
                          <XCircle className="w-4 h-4" /> Desaprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setNotesId(j.id); setNotesText(""); }}
                          className="gap-1"
                        >
                          <MessageSquare className="w-4 h-4" /> Com observação
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Observação do administrador..."
                          value={notesText}
                          onChange={(e) => setNotesText(e.target.value)}
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateStatus(j.id, "aprovado", notesText)}
                            disabled={actionLoading === j.id}
                            className="gap-1"
                          >
                            <CheckCircle className="w-4 h-4" /> Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateStatus(j.id, "desaprovado", notesText)}
                            disabled={actionLoading === j.id}
                            className="gap-1"
                          >
                            <XCircle className="w-4 h-4" /> Desaprovar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setNotesId(null)}>
                            Cancelar
                          </Button>
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
