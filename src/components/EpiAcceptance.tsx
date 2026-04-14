import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HardHat, Check, ArrowLeft, Package, Calendar, User, FileText } from "lucide-react";
import SignaturePad from "./SignaturePad";

interface PendingEpi {
  delivery_id: string;
  epi_name: string;
  epi_category: string;
  delivered_at: string;
  expires_at: string;
  delivered_by: string;
  notes: string | null;
  employee_id: string;
  employee_name: string;
}

interface EpiAcceptanceProps {
  cpf: string;
  employeeName: string;
  onClose: () => void;
  pendingCount: number;
  onAccepted: () => void;
}

export default function EpiAcceptance({ cpf, employeeName, onClose, onAccepted }: EpiAcceptanceProps) {
  const [pending, setPending] = useState<PendingEpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<PendingEpi | null>(null);
  const [signing, setSigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_pending_epi_by_cpf", { p_cpf: cpf });
      if (error) throw error;
      setPending((data as any) || []);
    } catch (err: any) {
      toast.error("Erro ao carregar EPIs pendentes");
    } finally {
      setLoading(false);
    }
  }, [cpf]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleSign = async (blob: Blob) => {
    if (!selectedDelivery || submitting) return;
    setSubmitting(true);
    try {
      // Upload signature to storage
      const fileName = `${selectedDelivery.delivery_id}_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("epi-signatures")
        .upload(fileName, blob, { contentType: "image/png" });

      if (uploadError) throw uploadError;

      // Accept via RPC
      const { error: rpcError } = await supabase.rpc("accept_epi_delivery", {
        p_cpf: cpf,
        p_delivery_id: selectedDelivery.delivery_id,
        p_signature_url: fileName,
      });

      if (rpcError) throw rpcError;

      toast.success("EPI aceito e assinado com sucesso!");
      setSelectedDelivery(null);
      setSigning(false);
      onAccepted();
      fetchPending();
    } catch (err: any) {
      toast.error("Erro ao registrar aceite: " + (err.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  // Detail + signature screen
  if (selectedDelivery) {
    return (
      <div className="min-h-screen flex flex-col items-center px-4 py-8 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
        
        <div className="w-full max-w-md">
          <button onClick={() => { setSelectedDelivery(null); setSigning(false); }}
            className="flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(210 20% 60%)" }}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: "linear-gradient(135deg, hsl(210 70% 40%), hsl(200 80% 45%))" }}>
              <HardHat className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>Aceite de EPI</h2>
            <p className="text-xs mt-1" style={{ color: "hsl(210 15% 50%)" }}>{employeeName}</p>
          </div>

          {/* EPI Details card */}
          <div className="rounded-2xl p-5 mb-6 border border-white/10"
            style={{ background: "linear-gradient(180deg, hsl(210 30% 14%) 0%, hsl(215 25% 11%) 100%)" }}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" style={{ color: "hsl(210 70% 55%)" }} />
                <span className="font-semibold text-sm" style={{ color: "hsl(0 0% 92%)" }}>{selectedDelivery.epi_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "hsl(210 40% 25%)", color: "hsl(210 40% 70%)" }}>
                  {selectedDelivery.epi_category}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "hsl(210 15% 55%)" }}>
                <Calendar className="w-3.5 h-3.5" />
                Entrega: {new Date(selectedDelivery.delivered_at + "T00:00:00").toLocaleDateString("pt-BR")}
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "hsl(210 15% 55%)" }}>
                <Calendar className="w-3.5 h-3.5" />
                Validade: {new Date(selectedDelivery.expires_at + "T00:00:00").toLocaleDateString("pt-BR")}
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "hsl(210 15% 55%)" }}>
                <User className="w-3.5 h-3.5" />
                Responsável: {selectedDelivery.delivered_by || "—"}
              </div>
              {selectedDelivery.notes && (
                <div className="flex items-start gap-2 text-xs" style={{ color: "hsl(210 15% 55%)" }}>
                  <FileText className="w-3.5 h-3.5 mt-0.5" />
                  <span>{selectedDelivery.notes}</span>
                </div>
              )}
            </div>
          </div>

          {!signing ? (
            <div className="space-y-3">
              <div className="rounded-xl p-4 border border-white/10 text-center"
                style={{ background: "hsl(210 30% 13%)" }}>
                <p className="text-xs mb-1" style={{ color: "hsl(210 15% 55%)" }}>
                  Ao confirmar, você declara que recebeu este EPI em boas condições e se compromete a utilizá-lo corretamente.
                </p>
              </div>
              <button
                onClick={() => setSigning(true)}
                className="w-full h-14 text-base font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, hsl(152 55% 42%), hsl(160 60% 50%))", color: "white", boxShadow: "0 4px 20px hsl(152 55% 42% / 0.35)" }}>
                <Check className="w-5 h-5" />
                Li e recebi este EPI
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl p-4 border border-white/10 text-center"
                style={{ background: "hsl(210 30% 13%)" }}>
                <p className="text-xs font-medium mb-1" style={{ color: "hsl(152 55% 55%)" }}>
                  Agora assine abaixo para confirmar o recebimento
                </p>
              </div>
              {submitting ? (
                <div className="flex items-center justify-center gap-2 py-8" style={{ color: "hsl(210 15% 55%)" }}>
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Enviando assinatura...
                </div>
              ) : (
                <SignaturePad onSign={handleSign} width={Math.min(320, window.innerWidth - 48)} height={180} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pending list
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, hsl(220 30% 8%) 0%, hsl(215 40% 14%) 50%, hsl(210 35% 10%) 100%)" }}>
      
      <div className="w-full max-w-md">
        <button onClick={onClose}
          className="flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(210 20% 60%)" }}>
          <ArrowLeft className="w-4 h-4" /> Voltar ao ponto
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, hsl(40 90% 50%), hsl(35 85% 55%))" }}>
            <HardHat className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-bold" style={{ color: "hsl(0 0% 95%)" }}>EPIs Pendentes</h2>
          <p className="text-xs mt-1" style={{ color: "hsl(210 15% 50%)" }}>
            {employeeName} • {pending.length} pendência(s)
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: "hsl(210 15% 55%)" }}>
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Carregando...
          </div>
        ) : pending.length === 0 ? (
          <div className="text-center py-12">
            <Check className="w-10 h-10 mx-auto mb-3" style={{ color: "hsl(152 55% 55%)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(0 0% 90%)" }}>Nenhum EPI pendente!</p>
            <p className="text-xs mt-1" style={{ color: "hsl(210 15% 50%)" }}>Todos os EPIs foram aceitos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(epi => (
              <button
                key={epi.delivery_id}
                onClick={() => setSelectedDelivery(epi)}
                className="w-full rounded-xl p-4 border border-white/10 text-left transition-all hover:-translate-y-0.5"
                style={{ background: "linear-gradient(180deg, hsl(210 30% 16%) 0%, hsl(215 25% 12%) 100%)", boxShadow: "0 4px 16px hsl(220 40% 5% / 0.4)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4" style={{ color: "hsl(40 90% 55%)" }} />
                      <span className="font-semibold text-sm" style={{ color: "hsl(0 0% 92%)" }}>{epi.epi_name}</span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: "hsl(210 15% 50%)" }}>
                      {epi.epi_category} • Entrega: {new Date(epi.delivered_at + "T00:00:00").toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-medium"
                    style={{ background: "hsl(40 80% 20%)", color: "hsl(40 90% 65%)" }}>
                    Pendente
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
