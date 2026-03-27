import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Eye, Calendar, User } from "lucide-react";
import { toast } from "sonner";

interface Justification {
  id: string;
  employee_id: string;
  date: string;
  reason: string;
  file_url: string | null;
  created_at: string;
  employees?: { name: string };
}

export default function JustificationsTab() {
  const [justifications, setJustifications] = useState<Justification[]>([]);
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [filterEmployee, setFilterEmployee] = useState("");

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
      setJustifications((data as Justification[]) || []);
    }
  };

  const filtered = filterEmployee
    ? justifications.filter((j) =>
        (j.employees?.name || "")
          .toLowerCase()
          .includes(filterEmployee.toLowerCase())
      )
    : justifications;

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

  const getSignedUrl = async (filePath: string, bucket: string): Promise<string | null> => {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(filePath, 300);
    return data?.signedUrl ?? null;
  };

  const handleDownload = async (filePath: string, employeeName: string, date: string) => {
    try {
      const signedUrl = await getSignedUrl(filePath, "justifications");
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
      <p className="text-sm text-muted-foreground">
        {filtered.length} atestado{filtered.length !== 1 ? "s" : ""} encontrado
        {filtered.length !== 1 ? "s" : ""}
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum atestado neste período
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => (
            <Card key={j.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground truncate">
                      {j.employees?.name || "Desconhecido"}
                    </span>
                    <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">
                      {formatDate(j.date)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {j.reason}
                  </p>
                </div>

                {j.file_url && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Visualizar"
                      onClick={async () => {
                        const url = await getSignedUrl(j.file_url!, "justifications");
                        if (url) window.open(url, "_blank");
                        else toast.error("Erro ao gerar link");
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Baixar PDF"
                      onClick={() =>
                        handleDownload(
                          j.file_url!,
                          j.employees?.name || "funcionario",
                          j.date
                        )
                      }
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {!j.file_url && (
                  <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Sem anexo
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
