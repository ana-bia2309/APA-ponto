export type PunchStep = "entrada" | "intervalo" | "retorno" | "saida";

export interface TimeRecordRow {
  id: string;
  employee_id: string;
  record_type: string;
  recorded_at: string;
  latitude: number | null;
  longitude: number | null;
  mode: string;
  sync_status: string;
  created_at: string;
  employees?: { name: string } | { name: string }[] | null;
}

export interface TimeRecordInsert {
  employee_id: string;
  record_type: string;
  recorded_at: string;
  latitude: number | null;
  longitude: number | null;
  mode: string;
  sync_status: string;
}

export interface DisplayPunchRecord {
  id: string;
  employee_id: string;
  step: string;
  punched_at: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  photo_url: string | null;
  created_at: string;
  mode?: string;
  sync_status?: string;
  employees?: { name: string };
}

export const mapTimeRecordToPunchRecord = (
  record: TimeRecordRow,
): DisplayPunchRecord => ({
  id: record.id,
  employee_id: record.employee_id,
  step: record.record_type,
  punched_at: record.recorded_at,
  latitude: record.latitude,
  longitude: record.longitude,
  address: null,
  photo_url: null,
  created_at: record.created_at,
  mode: record.mode,
  sync_status: record.sync_status,
  employees: Array.isArray(record.employees)
    ? record.employees[0]
    : record.employees || undefined,
});