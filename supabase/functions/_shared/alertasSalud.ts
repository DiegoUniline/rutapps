// D-064 · Lógica PURA de las alertas de salud (sin Deno ni red): qué hallazgos hay, cuáles son
// nuevos y cómo se arma el correo resumen. La usa la edge function `alertas-salud` y la prueba
// src/test/alertasSalud.test.ts.

export interface ConfigAlertas {
  destinatarios: string[];
  activo: boolean;
  umbral_errores_hora: number;
  horas_pendientes: number;
}

export interface FallaCron {
  runid: number | string;
  jobname: string | null;
  start_time: string;
  mensaje: string | null;
}

export interface ErrorHttp {
  id: number | string;
  status_code: number | null;
  created: string;
  mensaje: string | null;
}

export interface DispositivoSalud {
  dispositivo_id: string;
  user_id: string;
  empresa_nombre: string | null;
  usuario: string | null;
  version: string | null;
  pendientes: number;
  fallidas: number;
  ultimo_sync_ok: string | null;
  ultimo_error: string | null;
  horas_sin_sync: number | string | null;
}

export interface GrupoErrores {
  origen: string;
  mensaje: string;
  empresa_nombre: string | null;
  conteo: number | string;
}

export interface DatosSalud {
  ahora: Date;
  config: Pick<ConfigAlertas, 'umbral_errores_hora' | 'horas_pendientes'>;
  fallasCron: FallaCron[];
  erroresHttp: ErrorHttp[];
  dispositivos: DispositivoSalud[];
  erroresUltimaHora: number;
  gruposErrores: GrupoErrores[];
}

export type TipoHallazgo = 'cron' | 'http' | 'dispositivo' | 'errores';

export interface Hallazgo {
  clave: string;
  tipo: TipoHallazgo;
  titulo: string;
  detalle: string;
}

const corto = (s: string | null | undefined, n = 160) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Hora UTC de la corrida (AAAA-MM-DDTHH): una alerta de «pico de errores» por hora. */
export function horaClave(d: Date): string {
  return d.toISOString().slice(0, 13);
}

export function evaluarHallazgos(d: DatosSalud): Hallazgo[] {
  const out: Hallazgo[] = [];

  for (const f of d.fallasCron) {
    out.push({
      clave: `cron:${f.runid}`,
      tipo: 'cron',
      titulo: `Cron fallido: ${f.jobname ?? 'desconocido'}`,
      detalle: `${f.start_time} · ${corto(f.mensaje)}`,
    });
  }

  for (const h of d.erroresHttp) {
    out.push({
      clave: `http:${h.id}`,
      tipo: 'http',
      titulo: `Llamada HTTP con error${h.status_code ? ` (${h.status_code})` : ''}`,
      detalle: `${h.created} · ${corto(h.mensaje)}`,
    });
  }

  for (const x of d.dispositivos) {
    const quien = `${x.usuario ?? 'usuario'} · ${x.empresa_nombre ?? 'empresa'} · disp. ${x.dispositivo_id}${x.version ? ` · v${x.version}` : ''}`;
    if (x.fallidas > 0) {
      // Clave con el número de fallidas: si suben, se vuelve a avisar; si siguen igual, no.
      out.push({
        clave: `disp:${x.user_id}:${x.dispositivo_id}:fallidas:${x.fallidas}`,
        tipo: 'dispositivo',
        titulo: `${x.fallidas} operación(es) fallida(s) en un celular`,
        detalle: `${quien}${x.ultimo_error ? ` · ${corto(x.ultimo_error, 120)}` : ''}`,
      });
    }
    const horas = Number(x.horas_sin_sync ?? 0);
    if (x.pendientes > 0 && horas >= d.config.horas_pendientes) {
      // Un aviso por episodio: mientras no sincronice, la clave (último sync ok) no cambia.
      out.push({
        clave: `disp:${x.user_id}:${x.dispositivo_id}:pend:${x.ultimo_sync_ok ?? 'nunca'}`,
        tipo: 'dispositivo',
        titulo: `${x.pendientes} pendiente(s) sin subir hace ${Math.floor(horas)} h`,
        detalle: quien,
      });
    }
  }

  if (d.erroresUltimaHora >= d.config.umbral_errores_hora) {
    const top = d.gruposErrores.slice(0, 5)
      .map((g) => `${g.conteo}× ${g.origen}: ${corto(g.mensaje, 80)}${g.empresa_nombre ? ` (${g.empresa_nombre})` : ''}`)
      .join(' | ');
    out.push({
      clave: `errores:${horaClave(d.ahora)}`,
      tipo: 'errores',
      titulo: `Pico de errores: ${d.erroresUltimaHora} en la última hora (umbral ${d.config.umbral_errores_hora})`,
      detalle: top,
    });
  }

  return out;
}

/** Destinatarios válidos y sin repetir (la BD ya los valida; aquí se vuelve a filtrar). */
export function destinatariosValidos(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  return [...new Set(lista.map((x) => String(x ?? '').trim().toLowerCase()).filter((x) => re.test(x)))].slice(0, 10);
}

const ETIQUETA: Record<TipoHallazgo, string> = {
  cron: 'Crons fallidos',
  http: 'Llamadas HTTP con error',
  dispositivo: 'Celulares',
  errores: 'Errores de la app',
};

export function armarResumen(nuevos: Hallazgo[], ahora: Date): { asunto: string; secciones: { titulo: string; lineas: string[] }[] } {
  const secciones = (Object.keys(ETIQUETA) as TipoHallazgo[])
    .map((tipo) => ({
      titulo: ETIQUETA[tipo],
      lineas: nuevos.filter((h) => h.tipo === tipo).map((h) => `${h.titulo} — ${h.detalle}`),
    }))
    .filter((s) => s.lineas.length > 0);
  const asunto = `RutApp · ${nuevos.length} alerta${nuevos.length === 1 ? '' : 's'} de salud · ${ahora.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  return { asunto, secciones };
}
