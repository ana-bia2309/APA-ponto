import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Users, ChevronDown, ChevronRight } from "lucide-react";

interface Colaborador {
  id: string;
  name: string;
  cargo: string | null;
  departamento: string | null;
  foto_url: string | null;
  active: boolean;
  data_admissao: string | null;
  punch_mode: string;
}

interface Setor {
  nome: string;
  colaboradores: Colaborador[];
}

export default function OrganogramaTab() {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSetores, setExpandedSetores] = useState<Set<string>>(new Set());
  const [selectedColab, setSelectedColab] = useState<Colaborador | null>(null);
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("employees")
        .select("id, name, cargo, departamento, foto_url, active, data_admissao, punch_mode")
        .order("name");

      const employees: Colaborador[] = data || [];

      // Agrupa por departamento
      const grupos: Record<string, Colaborador[]> = {};
      employees.forEach(emp => {
        const dep = emp.departamento || "Sem Departamento";
        if (!grupos[dep]) grupos[dep] = [];
        grupos[dep].push(emp);
      });

      const result = Object.entries(grupos)
        .map(([nome, colaboradores]) => ({ nome, colaboradores }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

      setSetores(result);
      // Expande todos por padrão
      setExpandedSetores(new Set(result.map(s => s.nome)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSetor = (nome: string) => {
    setExpandedSetores(prev => {
      const next = new Set(prev);
      next.has(nome) ? next.delete(nome) : next.add(nome);
      return next;
    });
  };

  const totalAtivos = setores.flatMap(s => s.colaboradores).filter(c => c.active).length;
  const totalInativos = setores.flatMap(s => s.colaboradores).filter(c => !c.active).length;

  const setoresFiltrados = busca ? setores.map(s => ({
    ...s,
    colaboradores: s.colaboradores.filter(c =>
      c.name.toLowerCase().includes(busca.toLowerCase()) ||
      c.cargo?.toLowerCase().includes(busca.toLowerCase())
    ),
  })).filter(s => s.colaboradores.length > 0) : setores;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">🏢 Organograma</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalAtivos} ativo{totalAtivos !== 1 ? "s" : ""} · {totalInativos} inativo{totalInativos !== 1 ? "s" : ""} · {setores.length} setor{setores.length !== 1 ? "es" : ""}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Busca */}
      <input value={busca} onChange={e => setBusca(e.target.value)}
        placeholder="🔍 Buscar colaborador ou cargo..."
        className="w-full h-10 rounded-xl border border-gray-200 px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40" />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Ativos", value: totalAtivos, color: "#15803d", bg: "#f0fdf4" },
          { label: "Departamentos", value: setores.length, color: "#1e40af", bg: "#eff6ff" },
          { label: "Inativos", value: totalInativos, color: "#94a3b8", bg: "#f8fafc" },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-2xl p-3 text-center border border-gray-100"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-xl font-black" style={{ color: k.color }}>{k.value}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Organograma */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {setoresFiltrados.map(setor => {
            const isExpanded = expandedSetores.has(setor.nome);
            const ativos = setor.colaboradores.filter(c => c.active).length;
            return (
              <div key={setor.nome} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                {/* Header do setor */}
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  onClick={() => toggleSetor(setor.nome)}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: "#eff6ff" }}>
                      <Users className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-800">{setor.nome}</p>
                      <p className="text-[10px] text-gray-400">
                        {ativos} ativo{ativos !== 1 ? "s" : ""}
                        {setor.colaboradores.length - ativos > 0 && ` · ${setor.colaboradores.length - ativos} inativo${setor.colaboradores.length - ativos !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {setor.colaboradores.filter(c => c.active).slice(0, 4).map(c => (
                        <div key={c.id} className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white overflow-hidden"
                          style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                          {c.foto_url ? <img src={c.foto_url} alt={c.name} className="w-full h-full object-cover" /> : c.name.charAt(0)}
                        </div>
                      ))}
                      {ativos > 4 && (
                        <div className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black bg-gray-200 text-gray-600">
                          +{ativos - 4}
                        </div>
                      )}
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Colaboradores */}
                {isExpanded && (
                  <div className="border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                    {setor.colaboradores.map(c => (
                      <button key={c.id} onClick={() => setSelectedColab(selectedColab?.id === c.id ? null : c)}
                        className="flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:shadow-md"
                        style={{
                          background: selectedColab?.id === c.id ? "#eff6ff" : "#f8fafc",
                          border: selectedColab?.id === c.id ? "2px solid #1e40af" : "2px solid transparent",
                          opacity: c.active ? 1 : 0.5,
                        }}>
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-sm font-black text-white"
                          style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                          {c.foto_url ? <img src={c.foto_url} alt={c.name} className="w-full h-full object-cover" /> : c.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{c.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{c.cargo || "Sem cargo"}</p>
                          {!c.active && <p className="text-[9px] text-gray-300">Inativo</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Detalhe do colaborador selecionado */}
                {isExpanded && selectedColab && setor.colaboradores.find(c => c.id === selectedColab.id) && (
                  <div className="border-t border-blue-100 p-4" style={{ background: "#f8faff" }}>
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden flex items-center justify-center text-xl font-black text-white"
                        style={{ background: "linear-gradient(135deg, #1e40af, #0ea5e9)" }}>
                        {selectedColab.foto_url ? <img src={selectedColab.foto_url} alt={selectedColab.name} className="w-full h-full object-cover" /> : selectedColab.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black text-gray-800">{selectedColab.name}</p>
                        <p className="text-xs text-blue-600 font-semibold">{selectedColab.cargo || "Sem cargo"}</p>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="bg-white rounded-lg p-2">
                            <p className="text-[9px] text-gray-400 uppercase font-bold">Departamento</p>
                            <p className="text-xs font-semibold text-gray-700">{selectedColab.departamento || "—"}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2">
                            <p className="text-[9px] text-gray-400 uppercase font-bold">Jornada</p>
                            <p className="text-xs font-semibold text-gray-700">{selectedColab.punch_mode === "simple" ? "2 batidas" : "4 batidas"}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2">
                            <p className="text-[9px] text-gray-400 uppercase font-bold">Admissão</p>
                            <p className="text-xs font-semibold text-gray-700">
                              {selectedColab.data_admissao ? new Date(selectedColab.data_admissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-2">
                            <p className="text-[9px] text-gray-400 uppercase font-bold">Status</p>
                            <p className="text-xs font-semibold" style={{ color: selectedColab.active ? "#15803d" : "#dc2626" }}>
                              {selectedColab.active ? "✅ Ativo" : "❌ Inativo"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}