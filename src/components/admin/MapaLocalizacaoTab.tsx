import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPin, RefreshCw, List, Map as MapIcon } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Employee = Tables<"employees">;

interface LocationRecord {
  id: string;
  record_type: string;
  recorded_at: string;
  latitude: number;
  longitude: number;
  address: string | null;
}

const STEP_LABELS: Record<string, string> = {
  entrada: "Entrada",
  intervalo: "Intervalo",
  retorno: "Retorno",
  saida: "Saída",
};

const STEP_COLORS: Record<string, string> = {
  entrada: "bg-emerald-500",
  intervalo: "bg-amber-500",
  retorno: "bg-blue-500",
  saida: "bg-rose-500",
};

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function createColoredIcon(color: string) {
  const colors: Record<string, string> = {
    entrada: "#22c55e",
    intervalo: "#f59e0b",
    retorno: "#3b82f6",
    saida: "#ef4444",
  };
  const c = colors[color] || "#6366f1";
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;background:${c};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function MapaLocalizacaoTab({ employees }: { employees: Employee[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"lista" | "mapa">("lista");

  const selectedEmployee = employees.find(e => e.id === selectedId);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();

      const { data, error } = await (supabase as any)
        .from("time_records")
        .select("id, record_type, recorded_at, latitude, longitude, address")
        .eq("employee_id", selectedId)
        .gte("recorded_at", start)
        .lt("recorded_at", end)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("recorded_at", { ascending: true });

      if (error) throw error;
      setRecords(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId, month, year]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  // Center map on first record or Brazil
  const center: [number, number] = records.length > 0
    ? [records[0].latitude, records[0].longitude]
    : [-15.7801, -47.9292];

  // Group records by day
  const byDay: Record<string, LocationRecord[]> = {};
  records.forEach(r => {
    const day = new Date(r.recorded_at).toLocaleDateString("pt-BR");
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(r);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Mapa de Localização
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Funcionário</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Selecione...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mês</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Ano</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {selectedEmployee && !loading && records.length > 0 && (
        <>
          {/* Resumo + Toggle */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {records.length} registro(s) com localização em {MONTH_NAMES[month - 1]}/{year}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant={view === "lista" ? "default" : "outline"} size="sm" onClick={() => setView("lista")} className="gap-1">
                <List className="w-4 h-4" /> Lista
              </Button>
              <Button variant={view === "mapa" ? "default" : "outline"} size="sm" onClick={() => setView("mapa")} className="gap-1">
                <MapIcon className="w-4 h-4" /> Mapa
              </Button>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex gap-3 flex-wrap">
            {Object.entries(STEP_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={`w-3 h-3 rounded-full ${STEP_COLORS[key]}`} />
                {label}
              </div>
            ))}
          </div>

          {/* LISTA */}
          {view === "lista" && (
            <div className="space-y-3">
              {Object.entries(byDay).map(([day, recs]) => (
                <Card key={day} className="p-4">
                  <p className="text-sm font-semibold text-foreground mb-3">{day}</p>
                  <div className="space-y-2">
                    {recs.map(r => (
                      <div key={r.id} className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STEP_COLORS[r.record_type] || "bg-gray-400"}`} />
                          <span className="text-xs font-medium">{STEP_LABELS[r.record_type] || r.record_type}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {new Date(r.recorded_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <a
                          href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline max-w-[260px] text-right"
                        >
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{r.address || `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`}</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* MAPA */}
          {view === "mapa" && (
            <Card className="p-0 overflow-hidden" style={{ height: 480 }}>
              <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {records.map(r => (
                  <Marker
                    key={r.id}
                    position={[r.latitude, r.longitude]}
                    icon={createColoredIcon(r.record_type)}
                  >
                    <Popup>
                      <div className="text-xs space-y-1">
                        <p className="font-semibold">{STEP_LABELS[r.record_type] || r.record_type}</p>
                        <p>{new Date(r.recorded_at).toLocaleString("pt-BR")}</p>
                        {r.address && <p className="text-gray-600">{r.address}</p>}
                        <a
                          href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline"
                        >
                          Ver no Google Maps
                        </a>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </Card>
          )}
        </>
      )}

      {selectedEmployee && !loading && records.length === 0 && (
        <Card className="p-12 text-center">
          <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum registro com localização em {MONTH_NAMES[month - 1]}/{year}.</p>
        </Card>
      )}

      {!selectedId && (
        <Card className="p-12 text-center">
          <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Selecione um funcionário e o período para ver os locais de batida.</p>
        </Card>
      )}
    </div>
  );
}