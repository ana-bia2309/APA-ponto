// Edge Function: auto-close-payroll
// Bloqueia automaticamente a competência do mês anterior (chamado por cron mensal).
// Também aceita chamada manual com { year, month } para fechamento sob demanda.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let year: number, month: number;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (body?.year && body?.month) {
      year = body.year; month = body.month;
    } else {
      // Padrão: mês anterior ao atual (timezone America/Sao_Paulo)
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      year = prev.getFullYear();
      month = prev.getMonth() + 1;
    }
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Garante que existe o período
  let { data: period } = await supabase
    .from("payroll_periods").select("*")
    .eq("year", year).eq("month", month).maybeSingle();

  if (!period) {
    const { data: created, error } = await supabase
      .from("payroll_periods")
      .insert({ year, month, status: "aberto" })
      .select().single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    period = created;
  }

  if (period.status === "fechado") {
    return new Response(JSON.stringify({ ok: true, already_closed: true, period }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resumo financeiro
  const { data: payslips } = await supabase
    .from("payslips").select("total_proventos,total_descontos,liquido,fgts_mes")
    .eq("period_id", period.id);

  const totals = (payslips || []).reduce(
    (a: any, p: any) => ({
      proventos: a.proventos + Number(p.total_proventos || 0),
      descontos: a.descontos + Number(p.total_descontos || 0),
      liquido: a.liquido + Number(p.liquido || 0),
      fgts: a.fgts + Number(p.fgts_mes || 0),
      count: a.count + 1,
    }),
    { proventos: 0, descontos: 0, liquido: 0, fgts: 0, count: 0 },
  );

  // Trava a competência
  const { error: upErr } = await supabase
    .from("payroll_periods")
    .update({ status: "fechado", closed_at: new Date().toISOString() })
    .eq("id", period.id);
  if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Auditoria
  await supabase.from("audit_logs").insert({
    action: "payroll_period_closed_auto",
    target_type: "payroll_period",
    target_id: period.id,
    details: { year, month, totals, source: "cron" },
  });

  return new Response(JSON.stringify({ ok: true, period_id: period.id, totals }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
