import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Plus, RefreshCw, User, Briefcase, Clock, X } from "lucide-react";

interface EmployeeFormData {
  name: string;
  cpf: string;
  matricula: string;
  cargo: string;
  departamento: string;
  email: string;
  tipo_vinculo: string;
  data_admissao: string;
  data_nascimento: string;
  punch_mode: "full" | "simple";
  shift: "diurno" | "noturno";
  escala: string;
  carga_horaria_semanal: number;
  hora_entrada: string;
  hora_saida: string;
  status: string;
  observacoes: string;
  foto_url: string;
  telefone: string;
  contato_emergencia: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface Props {
  onSubmit: (data: EmployeeFormData) => void;
  loading?: boolean;
  initialData?: Partial<EmployeeFormData>;
  submitLabel?: string;
  onCancel?: () => void;
}

const DEFAULTS: EmployeeFormData = {
  name: "", cpf: "", matricula: "", cargo: "", departamento: "",
  email: "", tipo_vinculo: "CLT", data_admissao: "",
  data_nascimento: "",
  punch_mode: "full", shift: "diurno", escala: "padrao",
  carga_horaria_semanal: 44,
  hora_entrada: "",
  hora_saida: "",
  status: "ativo", observacoes: "", foto_url: "", telefone: "", contato_emergencia: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
};

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function generateMatricula() {
  const year = new Date().getFullYear().toString().slice(2);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${year}${rand}`;
}

const STATUS_OPTIONS = [
  { value: "ativo", label: "✅ Ativo", color: "text-emerald-600" },
  { value: "afastado", label: "🟡 Afastado", color: "text-amber-600" },
  { value: "ferias", label: "🏖️ Férias", color: "text-blue-600" },
  { value: "suspenso", label: "⚠️ Suspenso", color: "text-orange-600" },
  { value: "desligado", label: "❌ Desligado", color: "text-rose-600" },
];

const VINCULO_OPTIONS = ["CLT", "Estagiário", "PJ", "Temporário", "Terceirizado"];

const PUNCH_MODE_OPTIONS = [
  { value: "full", label: "Jornada com 4 batidas" },
  { value: "simple", label: "Jornada com 2 batidas" },
];

const ESCALA_OPTIONS = [
  { value: "padrao", label: "Escala Padrão" },
  { value: "12x36", label: "12×36" },
  { value: "flexivel", label: "Jornada Flexível" },
];

const CARGA_OPTIONS = [
  { value: 30, label: "30h semanais" },
  { value: 40, label: "40h semanais" },
  { value: 44, label: "44h semanais" },
  { value: 20, label: "20h semanais (estágio)" },
];

function PhotoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("employee-photos")
        .upload(fileName, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage
        .from("employee-photos")
        .getPublicUrl(fileName);
      onChange(data.publicUrl);
    } catch (err: any) {
      alert("Erro ao fazer upload: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 h-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted flex-shrink-0">
        {value ? (
          <img src={value} alt="Foto" className="w-full h-full object-cover" />
        ) : (
          <User className="w-6 h-6 text-muted-foreground" />
        )}
      </div>
      <div>
        <label className="cursor-pointer">
          <span className="text-xs font-medium text-primary hover:underline">
            {uploading ? "Enviando..." : value ? "Trocar foto" : "Adicionar foto"}
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
        <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG até 2MB</p>
        {value && (
          <button type="button" onClick={() => onChange("")}
            className="text-xs text-rose-500 hover:underline mt-0.5 block">
            Remover
          </button>
        )}
      </div>
    </div>
  );
}
function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function EmployeeForm({ onSubmit, loading, initialData, submitLabel, onCancel }: Props) {
  const [form, setForm] = useState<EmployeeFormData>({ ...DEFAULTS, ...initialData });

  const upd = (k: keyof EmployeeFormData, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
    setForm(DEFAULTS);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* INFORMAÇÕES PESSOAIS */}
      <div>
        <SectionTitle icon={User} title="Informações Pessoais" subtitle="Dados de identificação do colaborador" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-3 mb-2">
            <PhotoUpload value={form.foto_url} onChange={v => upd("foto_url", v)} />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-xs text-muted-foreground">Nome completo *</Label>
            <Input className="mt-1" placeholder="Nome do colaborador"
              value={form.name} onChange={e => upd("name", e.target.value)} required />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <select value={form.status} onChange={e => upd("status", e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">CPF</Label>
            <Input className="mt-1" placeholder="000.000.000-00"
              value={form.cpf} onChange={e => upd("cpf", formatCpf(e.target.value))} maxLength={14} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Matrícula</Label>
            <div className="flex gap-1 mt-1">
              <Input placeholder="Ex: 240001" value={form.matricula}
                onChange={e => upd("matricula", e.target.value)} />
              <button type="button" onClick={() => upd("matricula", generateMatricula())}
                className="px-2 rounded-md border border-input bg-muted hover:bg-muted/80 text-xs text-muted-foreground flex-shrink-0 transition-colors"
                title="Gerar automaticamente">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input className="mt-1" type="email" placeholder="email@empresa.com"
              value={form.email} onChange={e => upd("email", e.target.value)} />
          </div>
        </div>
      </div>

      {/* INFORMAÇÕES PROFISSIONAIS */}
      <div>
        <SectionTitle icon={Briefcase} title="Informações Profissionais" subtitle="Cargo, departamento e vínculo" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Cargo</Label>
            <Input className="mt-1" placeholder="Ex: Técnico de Refrigeração"
              value={form.cargo} onChange={e => upd("cargo", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Departamento</Label>
            <Input className="mt-1" placeholder="Ex: Operacional"
              value={form.departamento} onChange={e => upd("departamento", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tipo de vínculo</Label>
            <select value={form.tipo_vinculo} onChange={e => upd("tipo_vinculo", e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {VINCULO_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Data de admissão</Label>
            <Input className="mt-1" type="date"
              value={form.data_admissao} onChange={e => upd("data_admissao", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Data de nascimento</Label>
            <Input className="mt-1" type="date"
              value={form.data_nascimento} onChange={e => upd("data_nascimento", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Telefone</Label>
            <Input className="mt-1" placeholder="(61) 99999-9999"
              value={form.telefone} onChange={e => upd("telefone", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contato de emergência</Label>
            <Input className="mt-1" placeholder="Nome e telefone"
              value={form.contato_emergencia} onChange={e => upd("contato_emergencia", e.target.value)} />
          </div>
          <div className="lg:col-span-3">
            <Label className="text-xs text-muted-foreground font-semibold">📍 Endereço</Label>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">CEP</Label>
            <Input className="mt-1" placeholder="00000-000"
              value={form.cep} onChange={e => upd("cep", e.target.value)} maxLength={9} />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-xs text-muted-foreground">Logradouro</Label>
            <Input className="mt-1" placeholder="Rua, Avenida, etc."
              value={form.logradouro} onChange={e => upd("logradouro", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Número</Label>
            <Input className="mt-1" placeholder="Ex: 123"
              value={form.numero} onChange={e => upd("numero", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Complemento</Label>
            <Input className="mt-1" placeholder="Apto, Bloco, etc."
              value={form.complemento} onChange={e => upd("complemento", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Bairro</Label>
            <Input className="mt-1" placeholder="Ex: Asa Norte"
              value={form.bairro} onChange={e => upd("bairro", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cidade</Label>
            <Input className="mt-1" placeholder="Ex: Brasília"
              value={form.cidade} onChange={e => upd("cidade", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Estado</Label>
            <select value={form.estado} onChange={e => upd("estado", e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Selecione</option>
              {["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"].map(uf => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Input className="mt-1" placeholder="Ex: Home office às sextas, escala especial..."
              value={form.observacoes} onChange={e => upd("observacoes", e.target.value)} />
          </div>
        </div>
      </div>

      {/* JORNADA */}
      <div>
        <SectionTitle icon={Clock} title="Jornada de Trabalho" subtitle="Configurações de horário e escala" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Tipo de jornada</Label>
            <select value={form.punch_mode} onChange={e => upd("punch_mode", e.target.value as any)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {PUNCH_MODE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Turno</Label>
            <select value={form.shift} onChange={e => {
              const novoTurno = e.target.value as "diurno" | "noturno";
              upd("shift", novoTurno);
              // Sugestão automática de horários por turno
              if (novoTurno === "diurno") {
                upd("hora_entrada", "08:00");
                upd("hora_saida", "17:00");
              } else {
                upd("hora_entrada", "19:00");
                upd("hora_saida", "07:00");
              }
            }}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="diurno">☀️ Diurno</option>
              <option value="noturno">🌙 Noturno</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Escala</Label>
            <select value={form.escala} onChange={e => upd("escala", e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {ESCALA_OPTIONS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Carga horária semanal</Label>
            <select value={form.carga_horaria_semanal} onChange={e => upd("carga_horaria_semanal", Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {CARGA_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {/* Horários das Batidas */}
        <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            🕐 Horário de Trabalho
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                Entrada
              </Label>
              <Input
                type="time"
                className="mt-1"
                value={form.hora_entrada}
                onChange={e => upd("hora_entrada", e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Saída
              </Label>
              <Input
                type="time"
                className="mt-1"
                value={form.hora_saida}
                onChange={e => upd("hora_saida", e.target.value)}
              />
            </div>
          </div>

          {form.hora_entrada && form.hora_saida && (
            <p className="text-xs text-muted-foreground mt-2">
              {form.shift === "diurno" ? "☀️" : "🌙"}{" "}
              {form.hora_entrada} → {form.hora_saida}
              {" "}• 1h de almoço
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading} className="gap-2 rounded-xl px-6 shadow-sm">
          <Plus className="w-4 h-4" />
          {loading ? "Salvando..." : submitLabel || "Adicionar Colaborador"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl px-6">
            <X className="w-4 h-4 mr-1" /> Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}