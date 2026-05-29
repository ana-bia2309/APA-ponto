import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Calendar, Plus, Search, Clock, CheckCircle2, X,
  Trash2, Edit2, StickyNote, ChevronLeft, ChevronRight,
  AlertTriangle, RefreshCw
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees">;

interface Evento {
  id: string;
  titulo: string;
  descricao: string | null;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  categoria: string;
  status: string;
  recorrencia: string;
  employee_id: string | null;
  criado_por: string | null;
  created_at: string;
}

interface Nota {
  id: string;
  titulo: string;
  conteudo: string | null;
  employee_id: string | null;
  criado_por: string | null;
  created_at: string;
}

const CATEGORIAS = {
  reuniao:             { label: "Reunião",               color: "bg-blue-500/15 text-blue-600 border-blue-500/30",     dot: "bg-blue-500",    icon: "📅" },
  treinamento:         { label: "Treinamento",           color: "bg-purple-500/15 text-purple-600 border-purple-500/30", dot: "bg-purple-500", icon: "📚" },
  entrega_documento:   { label: "Entrega de Documento",  color: "bg-amber-500/15 text-amber-600 border-amber-500/30",   dot: "bg-amber-500",   icon: "📋" },
  ferias:              { label: "Férias",                color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", dot: "bg-emerald-500", icon: "🏖️" },
  exame_medico:        { label: "Exame Médico",          color: "bg-rose-500/15 text-rose-600 border-rose-500/30",       dot: "bg-rose-500",    icon: "🏥" },
  outro:               { label: "Outros",                color: "bg-gray-500/15 text-gray-600 border-gray-500/30",       dot: "bg-gray-400",    icon: "📌" },
};

const STATUS_OPTIONS = {
  pendente:     { label: "Pendente",     color: "bg-amber-500/10 text-amber-600" },
  em_andamento: { label: "Em andamento", color: "bg-blue-500/10 text-blue-600" },
  concluido:    { label: "Concluído",    color: "bg-emerald-500/10 text-emerald-600" },
  cancelado:    { label: "Cancelado",    color: "bg-gray-500/10 text-gray-500 line-through" },
};

const RECORRENCIA_OPTIONS = [
  { value: "nenhuma", label: "Sem recorrência" },
  { value: "diaria",  label: "Diária" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal",  label: "Mensal" },
  { value: "anual",   label: "Anual" },
];

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

export default function AgendaTab({ employees }: { employees: Employee[] }) {
  const [view, setView] = useState<"mensal" | "semanal" | "lista" | "notas">("mensal");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [hoje] = useState(new Date());
  const [mesAtual, setMesAtual] = useState(hoje.getMonth());
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear());
  const [semanaAtual, setSemanaAtual] = useState(new Date());

  // Form evento
  const [showForm, setShowForm] = useState(false);
  const [editingEvento, setEditingEvento] = useState<Evento | null>(null);
  const [fTitulo, setFTitulo] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fData, setFData] = useState(new Date().toISOString().slice(0, 10));
  const [fHoraIni, setFHoraIni] = useState("");
  const [fHoraFim, setFHoraFim] = useState("");
  const [fCategoria, setFCategoria] = useState("outro");
  const [fStatus, setFStatus] = useState("pendente");
  const [fRecorrencia, setFRecorrencia] = useState("nenhuma");
  const [fEmployee, setFEmployee] = useState("");
  const [saving, setSaving] = useState(false);

  // Form nota
  const [showNotaForm, setShowNotaForm] = useState(false);
  const [nTitulo, setNTitulo] = useState("");
  const [nConteudo, setNConteudo] = useState("");
  const [nEmployee, setNEmployee] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [evRes, notaRes] = await Promise.all([
      (supabase as any).from("agenda_eventos").select("*").order("data").order("hora_inicio"),
      (supabase as any).from("agenda_notas").select("*").order("created_at", { ascending: false }),
    ]);
    if (evRes.data) setEventos(evRes.data);
    if (notaRes.data) setNotas(notaRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const salvarEvento = async () => {
    if (!fTitulo.trim() || !fData) { toast.error("Título e data são obrigatórios"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        titulo: fTitulo.trim(), descricao: fDesc || null, data: fData,
        hora_inicio: fHoraIni || null, hora_fim: fHoraFim || null,
        categoria: fCategoria, status: fStatus, recorrencia: fRecorrencia,
        employee_id: fEmployee || null, criado_por: user?.email || "admin",
      };
      if (editingEvento) {
        await (supabase as any).from("agenda_eventos").update(payload).eq("id", editingEvento.id);
        toast.success("Evento atualizado!");
      } else {
        await (supabase as any).from("agenda_eventos").insert(payload);
        toast.success("Evento criado!");
      }
      resetForm(); load();
    } catch (err: any) { toast.error("Erro: " + err.message); }
    finally { setSaving(false); }
  };

  const resetForm = () => {
    setShowForm(false); setEditingEvento(null);
    setFTitulo(""); setFDesc(""); setFData(new Date().toISOString().slice(0, 10));
    setFHoraIni(""); setFHoraFim(""); setFCategoria("outro");
    setFStatus("pendente"); setFRecorrencia("nenhuma"); setFEmployee("");
  };

  const editarEvento = (ev: Evento) => {
    setEditingEvento(ev);
    setFTitulo(ev.titulo); setFDesc(ev.descricao || ""); setFData(ev.data);
    setFHoraIni(ev.hora_inicio || ""); setFHoraFim(ev.hora_fim || "");
    setFCategoria(ev.categoria); setFStatus(ev.status);
    setFRecorrencia(ev.recorrencia); setFEmployee(ev.employee_id || "");
    setShowForm(true);
  };

  const excluirEvento = async (id: string) => {
    if (!confirm("Excluir este evento?")) return;
    await (supabase as any).from("agenda_eventos").delete().eq("id", id);
    toast.success("Evento excluído!"); load();
  };

  const salvarNota = async () => {
    if (!nTitulo.trim()) { toast.error("Título é obrigatório"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase as any).from("agenda_notas").insert({
      titulo: nTitulo.trim(), conteudo: nConteudo || null,
      employee_id: nEmployee || null, criado_por: user?.email || "admin",
    });
    toast.success("Nota salva!"); setNTitulo(""); setNConteudo(""); setNEmployee("");
    setShowNotaForm(false); load();
  };

  const excluirNota = async (id: string) => {
    if (!confirm("Excluir esta nota?")) return;
    await (supabase as any).from("agenda_notas").delete().eq("id", id);
    toast.success("Nota excluída!"); load();
  };

  const atualizarStatus = async (id: string, status: string) => {
    await (supabase as any).from("agenda_eventos").update({ status }).eq("id", id);
    load();
  };

  // Helpers
  const eventosHoje = eventos.filter(e => e.data === hoje.toISOString().slice(0, 10));
  const eventosFuturos = eventos.filter(e => e.data > hoje.toISOString().slice(0, 10) && e.status !== "cancelado").slice(0, 5);
  const eventosPendentes = eventos.filter(e => e.status === "pendente" && e.data <= hoje.toISOString().slice(0, 10));

  const eventosDoDia = (dateStr: string) => eventos.filter(e => e.data === dateStr);

  // Calendário mensal
  const primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
  const diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();

  const getDiaSemana = (date: Date) => {
    const days = [];
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const eventosFiltrados = eventos.filter(e =>
    !busca || e.titulo.toLowerCase().includes(busca.toLowerCase()) ||
    (e.descricao || "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Agenda e Anotações
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowNotaForm(!showNotaForm)} className="gap-1">
            <StickyNote className="w-4 h-4" /> Nota rápida
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setShowForm(!showForm); }} className="gap-1">
            <Plus className="w-4 h-4" /> Novo evento
          </Button>
        </div>
      </div>

      {/* Painel inicial */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">📅 Hoje</p>
          {eventosHoje.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum evento hoje</p>
          ) : eventosHoje.map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-xs py-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORIAS[ev.categoria as keyof typeof CATEGORIAS]?.dot || "bg-gray-400"}`} />
              <span className="text-foreground font-medium truncate">{ev.titulo}</span>
              {ev.hora_inicio && <span className="text-muted-foreground flex-shrink-0">{ev.hora_inicio.slice(0,5)}</span>}
            </div>
          ))}
        </Card>
        <Card className="p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">🔜 Próximos</p>
          {eventosFuturos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum evento futuro</p>
          ) : eventosFuturos.map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-xs py-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORIAS[ev.categoria as keyof typeof CATEGORIAS]?.dot || "bg-gray-400"}`} />
              <span className="text-foreground truncate">{ev.titulo}</span>
              <span className="text-muted-foreground flex-shrink-0">{new Date(ev.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
            </div>
          ))}
        </Card>
        <Card className="p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">⏰ Pendências</p>
          {eventosPendentes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma pendência</p>
          ) : eventosPendentes.slice(0, 4).map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-xs py-1">
              <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <span className="text-foreground truncate">{ev.titulo}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Nota rápida form */}
      {showNotaForm && (
        <Card className="p-4 space-y-3 border-primary/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><StickyNote className="w-4 h-4" /> Nova anotação rápida</h3>
            <button onClick={() => setShowNotaForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Título *</Label>
              <Input className="mt-1" placeholder="Título da nota" value={nTitulo} onChange={e => setNTitulo(e.target.value)} />
            </div>
            <div>
              <Label>Funcionário (opcional)</Label>
              <select value={nEmployee} onChange={e => setNEmployee(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Geral</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label>Conteúdo</Label>
              <textarea value={nConteudo} onChange={e => setNConteudo(e.target.value)}
                placeholder="Escreva sua anotação..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                rows={3} />
            </div>
          </div>
          <Button size="sm" onClick={salvarNota} className="gap-1"><StickyNote className="w-4 h-4" /> Salvar nota</Button>
        </Card>
      )}

      {/* Formulário evento */}
      {showForm && (
        <Card className="p-4 space-y-3 border-primary/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {editingEvento ? "Editar evento" : "Novo evento"}
            </h3>
            <button onClick={resetForm}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <Label>Título *</Label>
              <Input className="mt-1" placeholder="Título do evento" value={fTitulo} onChange={e => setFTitulo(e.target.value)} />
            </div>
            <div>
              <Label>Categoria</Label>
              <select value={fCategoria} onChange={e => setFCategoria(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input className="mt-1" type="date" value={fData} onChange={e => setFData(e.target.value)} />
            </div>
            <div>
              <Label>Hora início</Label>
              <Input className="mt-1" type="time" value={fHoraIni} onChange={e => setFHoraIni(e.target.value)} />
            </div>
            <div>
              <Label>Hora fim</Label>
              <Input className="mt-1" type="time" value={fHoraFim} onChange={e => setFHoraFim(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(STATUS_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Recorrência</Label>
              <select value={fRecorrencia} onChange={e => setFRecorrencia(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {RECORRENCIA_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Funcionário (opcional)</Label>
              <select value={fEmployee} onChange={e => setFEmployee(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Geral / Empresa</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="lg:col-span-3">
              <Label>Descrição</Label>
              <textarea value={fDesc} onChange={e => setFDesc(e.target.value)}
                placeholder="Detalhes do evento..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                rows={2} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={salvarEvento} disabled={saving} className="gap-1">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {editingEvento ? "Salvar alterações" : "Criar evento"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar eventos e anotações..." value={busca}
          onChange={e => setBusca(e.target.value)} className="pl-9" />
      </div>

      {/* View tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["mensal","semanal","lista","notas"] as const).map(v => (
          <Button key={v} variant={view === v ? "default" : "outline"} size="sm"
            onClick={() => setView(v)}>
            {v === "mensal" ? "📅 Mensal" : v === "semanal" ? "📆 Semanal" : v === "lista" ? "📋 Lista" : "📝 Notas"}
          </Button>
        ))}
      </div>

      {/* CALENDÁRIO MENSAL */}
      {view === "mensal" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => { if (mesAtual === 0) { setMesAtual(11); setAnoAtual(a => a-1); } else setMesAtual(m => m-1); }}>
              <ChevronLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
            </button>
            <h3 className="text-sm font-semibold text-foreground">{MESES[mesAtual]} {anoAtual}</h3>
            <button onClick={() => { if (mesAtual === 11) { setMesAtual(0); setAnoAtual(a => a+1); } else setMesAtual(m => m+1); }}>
              <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array(primeiroDia).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: diasNoMes }, (_, i) => {
              const dia = i + 1;
              const dateStr = `${anoAtual}-${String(mesAtual+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
              const evsDia = eventosDoDia(dateStr);
              const isHoje = dateStr === hoje.toISOString().slice(0, 10);
              return (
                <div key={dia} className={`min-h-[52px] rounded-lg p-1 text-xs border transition-colors ${isHoje ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"}`}>
                  <p className={`text-center font-medium mb-1 ${isHoje ? "text-primary" : "text-foreground"}`}>{dia}</p>
                  <div className="space-y-0.5">
                    {evsDia.slice(0, 2).map(ev => (
                      <div key={ev.id} className={`text-[9px] px-1 py-0.5 rounded truncate ${CATEGORIAS[ev.categoria as keyof typeof CATEGORIAS]?.color || "bg-gray-100 text-gray-600"}`}>
                        {ev.titulo}
                      </div>
                    ))}
                    {evsDia.length > 2 && <div className="text-[9px] text-muted-foreground text-center">+{evsDia.length - 2}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* CALENDÁRIO SEMANAL */}
      {view === "semanal" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => { const d = new Date(semanaAtual); d.setDate(d.getDate()-7); setSemanaAtual(d); }}>
              <ChevronLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
            </button>
            <h3 className="text-sm font-semibold text-foreground">Semana de {getDiaSemana(semanaAtual)[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</h3>
            <button onClick={() => { const d = new Date(semanaAtual); d.setDate(d.getDate()+7); setSemanaAtual(d); }}>
              <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {getDiaSemana(semanaAtual).map((dia, i) => {
              const dateStr = dia.toISOString().slice(0, 10);
              const evsDia = eventosDoDia(dateStr);
              const isHoje = dateStr === hoje.toISOString().slice(0, 10);
              return (
                <div key={i} className={`rounded-lg p-2 min-h-[100px] border ${isHoje ? "border-primary bg-primary/5" : "border-border"}`}>
                  <p className={`text-xs font-semibold mb-1 text-center ${isHoje ? "text-primary" : "text-muted-foreground"}`}>
                    {DIAS_SEMANA[i]}<br />{dia.getDate()}
                  </p>
                  <div className="space-y-1">
                    {evsDia.map(ev => (
                      <div key={ev.id} className={`text-[9px] px-1 py-0.5 rounded truncate ${CATEGORIAS[ev.categoria as keyof typeof CATEGORIAS]?.color || "bg-gray-100"}`}>
                        {ev.hora_inicio?.slice(0,5)} {ev.titulo}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* LISTA */}
      {view === "lista" && (
        <div className="space-y-2">
          {eventosFiltrados.length === 0 ? (
            <Card className="p-8 text-center">
              <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>
            </Card>
          ) : eventosFiltrados.map(ev => {
            const cat = CATEGORIAS[ev.categoria as keyof typeof CATEGORIAS] || CATEGORIAS.outro;
            const st = STATUS_OPTIONS[ev.status as keyof typeof STATUS_OPTIONS] || STATUS_OPTIONS.pendente;
            const emp = employees.find(e => e.id === ev.employee_id);
            return (
              <Card key={ev.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="text-xl flex-shrink-0">{cat.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{ev.titulo}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cat.color}`}>{cat.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                        {ev.recorrencia !== "nenhuma" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600">🔄 {ev.recorrencia}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        📅 {new Date(ev.data + "T12:00:00").toLocaleDateString("pt-BR")}
                        {ev.hora_inicio && ` · ⏰ ${ev.hora_inicio.slice(0,5)}${ev.hora_fim ? `–${ev.hora_fim.slice(0,5)}` : ""}`}
                        {emp && ` · 👤 ${emp.name}`}
                      </p>
                      {ev.descricao && <p className="text-xs text-muted-foreground mt-0.5">{ev.descricao}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <select value={ev.status} onChange={e => atualizarStatus(ev.id, e.target.value)}
                      className="h-7 rounded border border-input bg-background px-1 text-[11px]">
                      {Object.entries(STATUS_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => editarEvento(ev)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => excluirEvento(ev.id)}
                      className="text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* NOTAS */}
      {view === "notas" && (
        <div className="space-y-2">
          {notas.filter(n => !busca || n.titulo.toLowerCase().includes(busca.toLowerCase())).length === 0 ? (
            <Card className="p-8 text-center">
              <StickyNote className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma anotação encontrada.</p>
            </Card>
          ) : notas.filter(n => !busca || n.titulo.toLowerCase().includes(busca.toLowerCase())).map(nota => {
            const emp = employees.find(e => e.id === nota.employee_id);
            return (
              <Card key={nota.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      📝 {nota.titulo}
                    </p>
                    {nota.conteudo && <p className="text-xs text-muted-foreground mt-1">{nota.conteudo}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(nota.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {emp && ` · 👤 ${emp.name}`}
                      {nota.criado_por && ` · por ${nota.criado_por}`}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => excluirNota(nota.id)}
                    className="text-destructive hover:text-destructive flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}