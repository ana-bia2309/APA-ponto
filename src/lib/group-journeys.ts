/**
 * Groups time records into journeys (jornadas).
 * A journey starts with "entrada" and ends with "saida".
 * For night shifts that cross midnight, all records stay in the same journey.
 */

export interface JourneyRecord {
  id: string;
  employee_id: string;
  step: string;
  punched_at: string;
  [key: string]: any;
}

export interface Journey {
  /** Label for the journey (date of entrada) */
  label: string;
  /** All records in this journey, sorted chronologically */
  records: JourneyRecord[];
  /** Whether this journey is complete (has saida) */
  complete: boolean;
}

const STEP_ORDER: Record<string, number> = {
  entrada: 0,
  intervalo: 1,
  retorno: 2,
  saida: 3,
};

/**
 * Groups records into journeys. Records must be sorted chronologically (ascending).
 * A new journey starts when "entrada" is found and the previous journey is complete (has saida).
 */
export function groupRecordsIntoJourneys<T extends JourneyRecord>(
  records: T[],
): Journey[] {
  const sorted = [...records].sort(
    (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
  );

  const journeys: Journey[] = [];
  let current: T[] | null = null;

  for (const rec of sorted) {
    if (rec.step === "entrada") {
      // Uma nova jornada SEMPRE começa em "entrada".
      // Se a jornada anterior ainda estava aberta (sem "saida"), ela é fechada como
      // "incompleta" para que o painel destaque a inconsistência ao invés de
      // misturar registros de jornadas distintas.
      if (current) {
        journeys.push(buildJourney(current));
      }
      current = [rec];
      continue;
    }

    // Add to current journey, or start a new one if none exists
    if (current) {
      current.push(rec);
    } else {
      current = [rec];
    }

    // Fechar a jornada imediatamente após "saida" para não absorver eventos seguintes
    if (rec.step === "saida") {
      journeys.push(buildJourney(current));
      current = null;
    }
  }

  if (current && current.length > 0) {
    journeys.push(buildJourney(current));
  }

  return journeys;
}

function buildJourney<T extends JourneyRecord>(records: T[]): Journey {
  const entrada = records.find((r) => r.step === "entrada");
  const entradaDate = entrada
    ? new Date(entrada.punched_at)
    : new Date(records[0].punched_at);

  const label = entradaDate.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const complete = records.some((r) => r.step === "saida");

  // Sort by step order within journey for display
  const sorted = [...records].sort(
    (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
  );

  return { label, records: sorted, complete };
}

/**
 * Groups records by employee, then by journey within each employee.
 * Returns a map of employee name → journeys.
 */
export function groupByEmployeeJourneys<
  T extends JourneyRecord & { employees?: { name: string } },
>(records: T[]): Record<string, Journey[]> {
  // Group by employee first
  const byEmployee: Record<string, T[]> = {};
  for (const rec of records) {
    const name = rec.employees?.name || "Desconhecido";
    if (!byEmployee[name]) byEmployee[name] = [];
    byEmployee[name].push(rec);
  }

  // Then group each employee's records into journeys
  const result: Record<string, Journey[]> = {};
  for (const [name, empRecords] of Object.entries(byEmployee)) {
    result[name] = groupRecordsIntoJourneys(empRecords);
  }

  return result;
}
