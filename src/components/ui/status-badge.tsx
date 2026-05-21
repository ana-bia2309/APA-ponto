import { CheckCircle2, Clock, XCircle, AlertTriangle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type Status =
  | "assinado"
  | "pendente"
  | "aprovado"
  | "reprovado"
  | "sincronizado"
  | "offline"
  | "erro"
  | "aberto"
  | "fechado"
  | "ativo"
  | "inativo"
  | "online"
  | "vencido"
  | "ok";

const STATUS_CONFIG: Record<Status, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
}> = {
  assinado:     { label: "Assinado",     icon: Shield,       className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  pendente:     { label: "Pendente",     icon: Clock,        className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  aprovado:     { label: "Aprovado",     icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  reprovado:    { label: "Reprovado",    icon: XCircle,      className: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  sincronizado: { label: "Sincronizado", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  offline:      { label: "Offline",      icon: AlertTriangle,className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  erro:         { label: "Erro",         icon: XCircle,      className: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  aberto:       { label: "Aberto",       icon: Clock,        className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  fechado:      { label: "Fechado",      icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  ativo:        { label: "Ativo",        icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  inativo:      { label: "Inativo",      icon: XCircle,      className: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  online:       { label: "Online",       icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  vencido:      { label: "Vencido",      icon: AlertTriangle,className: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  ok:           { label: "OK",           icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
};

interface StatusBadgeProps {
  status: Status;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, label, showIcon = true, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium border",
      config.className,
      className
    )}>
      {showIcon && <Icon className="w-3 h-3" />}
      {label ?? config.label}
    </span>
  );
}