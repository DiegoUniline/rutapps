/** D-064 · Ayudas puras del panel «Salud» del Super Admin. */

export interface DispositivoPanel {
  dispositivo_id: string;
  empresa_id: string;
  empresa_nombre: string | null;
  user_id: string;
  usuario: string | null;
  plataforma: string | null;
  version: string | null;
  pendientes: number;
  fallidas: number;
  ultimo_sync_ok: string | null;
  ultimo_error: string | null;
  updated_at: string;
  horas_sin_sync: number | string | null;
}

export interface ErrorAgrupado {
  origen: string;
  mensaje: string;
  empresa_id: string | null;
  empresa_nombre: string | null;
  conteo: number | string;
  usuarios: number | string;
  ultima: string;
  version: string | null;
}

export interface JobCron {
  jobid: number;
  jobname: string | null;
  schedule: string;
  active: boolean;
  ultima_corrida: string | null;
  ultimo_status: string | null;
  ultimo_error: string | null;
  fallas: number;
}

export interface SaludCrons {
  cron_disponible: boolean;
  net_disponible: boolean;
  jobs: JobCron[];
  fallas: { runid: number; jobname: string | null; start_time: string; mensaje: string | null }[];
  http_errores: { id: number; status_code: number | null; created: string; mensaje: string | null }[];
  http_timeouts: number;
}

export interface ConfigAlertasPanel {
  destinatarios: string[];
  activo: boolean;
  umbral_errores_hora: number;
  horas_pendientes: number;
}

/** Texto libre (comas, espacios, saltos de línea) → lista de correos sin repetir, en minúsculas. */
export function parsearDestinatarios(texto: string): { validos: string[]; invalidos: string[] } {
  const partes = texto.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const validos = [...new Set(partes.filter((x) => re.test(x)))];
  const invalidos = [...new Set(partes.filter((x) => !re.test(x)))];
  return { validos, invalidos };
}

/** Estado del celular para el semáforo: fallidas > atorado (pendientes viejos) > pendientes. */
export function estadoDispositivo(d: Pick<DispositivoPanel, 'fallidas' | 'pendientes' | 'horas_sin_sync'>, horasLimite: number): 'fallidas' | 'atorado' | 'pendientes' | 'ok' {
  if (d.fallidas > 0) return 'fallidas';
  const horas = Number(d.horas_sin_sync ?? 0);
  if (d.pendientes > 0 && horas >= horasLimite) return 'atorado';
  if (d.pendientes > 0) return 'pendientes';
  return 'ok';
}
