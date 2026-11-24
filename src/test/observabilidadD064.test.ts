// D-064 · Fase 4: telemetría interna (errores sin datos personales, freno), salud del
// dispositivo (freno 1/min con envío final), lógica de alertas y la migración (estática).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  construirPayloadError,
  crearFreno,
  crearReportadorErrores,
  esErrorIgnorable,
  plataformaActual,
  rutaSinDatos,
  sinDatosPersonales,
  type EntornoTelemetria,
} from '@/lib/telemetriaInterna';
import { construirPayloadSalud, crearReporteSalud, type EstadoSaludDispositivo } from '@/lib/saludDispositivo';
import { estadoDispositivo, parsearDestinatarios } from '@/lib/saludPanel';
import {
  armarResumen,
  destinatariosValidos,
  evaluarHallazgos,
  type DatosSalud,
} from '../../supabase/functions/_shared/alertasSalud';

const raiz = path.resolve(__dirname, '../..');
const leer = (p: string) => readFileSync(path.join(raiz, p), 'utf8');

const ENTORNO: EntornoTelemetria = {
  version: 'abc123',
  ruta: '/ruta/venta/0c5e1d2a-1111-2222-3333-444455556666?cliente=Juan%20Perez#ticket',
  dispositivoId: 'disp-1',
  plataforma: 'android',
};

describe('telemetría interna: sin datos personales', () => {
  it('quita correos, tokens y teléfonos del texto', () => {
    const t = sinDatosPersonales('Falló para juan.perez@correo.com tel +52 33 1234 5678 token eyJhbGciOi.eyJzdWIiOiIx.abc');
    expect(t).not.toMatch(/juan\.perez|1234 5678|eyJhbGciOi/);
    expect(t).toContain('[correo]');
    expect(t).toContain('[numero]');
    expect(t).toContain('[token]');
  });

  it('la ruta va sin consulta, sin ancla y sin ids', () => {
    expect(rutaSinDatos(ENTORNO.ruta)).toBe('/ruta/venta/:id');
    expect(rutaSinDatos(null)).toBeNull();
  });

  it('payload: solo llaves permitidas; datos de la fila, nombres y listas no viajan', () => {
    const err = Object.assign(new Error('duplicate key (email)=(ana@x.com)'), { code: '23505' });
    const p = construirPayloadError(err, {
      origen: 'syncQueue.deadLetter',
      tabla: 'clientes',
      operacion: 'insert',
      datos: { nombre: 'Ana', telefono: '3312345678' },
      cliente: 'Ana López',
      rechazadas: [{ venta_id: 'x', monto: 100 }],
      componentStack: 'at Comp (x.tsx)',
    }, ENTORNO)!;
    expect(p.p_origen).toBe('syncQueue.deadLetter');
    expect(p.p_mensaje).toContain('[correo]');
    expect(p.p_ruta).toBe('/ruta/venta/:id');
    expect(p.p_detalle).toEqual({ codigo: '23505', tabla: 'clientes', operacion: 'insert', rechazadas_n: 1, componentStack: 'at Comp (x.tsx)' });
    const todo = JSON.stringify(p);
    expect(todo).not.toMatch(/Ana|3312345678|ana@x\.com|Juan|monto/);
    expect(p.p_version).toBe('abc123');
    expect(p.p_dispositivo_id).toBe('disp-1');
  });

  it('errores de red no se reportan (ruido de una PWA offline)', () => {
    expect(esErrorIgnorable(new TypeError('Failed to fetch'))).toBe(true);
    expect(construirPayloadError(new Error('NetworkError when attempting to fetch resource.'), undefined, ENTORNO)).toBeNull();
    expect(construirPayloadError(new Error('violates check constraint'), undefined, ENTORNO)?.p_origen).toBe('app');
  });

  it('plataforma sin modelo ni versión', () => {
    expect(plataformaActual('Mozilla/5.0 (Linux; Android 13; SM-A135M) AppleWebKit')).toBe('android');
    expect(plataformaActual('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
    expect(plataformaActual('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
  });
});

describe('telemetría interna: freno y envío', () => {
  it('el mismo error una vez por minuto y máx. 10 por minuto', () => {
    let t = 0;
    const permitir = crearFreno({ ahora: () => t });
    expect(permitir('a')).toBe(true);
    expect(permitir('a')).toBe(false);
    for (let i = 0; i < 9; i++) expect(permitir(`b${i}`)).toBe(true);
    expect(permitir('c')).toBe(false); // ya van 10 en el minuto
    t = 60_000;
    expect(permitir('a')).toBe(true);
  });

  it('si la RPC falla: console.warn, devuelve false y NO lanza', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ error: { message: 'permission denied' } }));
    const reportar = crearReportadorErrores({ rpc, haySesion: async () => true, entorno: () => ENTORNO });
    await expect(reportar(new Error('x'), { origen: 'prueba' })).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith('registrar_error_app', expect.objectContaining({ p_origen: 'prueba', p_mensaje: 'x' }));
    expect(warn).toHaveBeenCalled();

    const lanza = crearReportadorErrores({ rpc: () => { throw new Error('sin red'); }, haySesion: async () => true, entorno: () => ENTORNO });
    await expect(lanza(new Error('y'))).resolves.toBe(false);
    warn.mockRestore();
  });

  it('sin sesión no se llama a la RPC; con sesión y OK devuelve true', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const sinSesion = crearReportadorErrores({ rpc, haySesion: async () => false, entorno: () => ENTORNO });
    expect(await sinSesion(new Error('z'))).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const conSesion = crearReportadorErrores({ rpc, haySesion: async () => true, entorno: () => ENTORNO });
    expect(await conSesion(new Error('z'))).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('salud del dispositivo: freno 1 por minuto con envío final', () => {
  const estado = (pendientes: number, fallidas = 0): EstadoSaludDispositivo => ({ pendientes, fallidas, ultimoError: null, ultimoSyncOk: null });

  it('manda ya, junta lo que llega dentro del minuto y al final manda el ÚLTIMO estado', async () => {
    let t = 1_000_000;
    const timers: { fn: () => void; ms: number }[] = [];
    const enviados: number[] = [];
    const r = crearReporteSalud({
      enviar: async (e) => { enviados.push(e.pendientes); },
      ahora: () => t,
      programarTimer: (fn, ms) => { timers.push({ fn, ms }); },
    });
    await r.programar(estado(5));
    t += 10_000; await r.programar(estado(3));
    t += 10_000; await r.programar(estado(0));
    expect(enviados).toEqual([5]);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(50_000);
    t += 40_000; timers[0].fn();
    await Promise.resolve();
    expect(enviados).toEqual([5, 0]); // el panel no se queda con «3 pendientes» ya subidos
  });

  it('forzar (al abrir la app) manda sin esperar; un envío que falla no lanza', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let t = 0;
    const enviar = vi.fn(async () => { throw new Error('500'); });
    const r = crearReporteSalud({ enviar, ahora: () => t, programarTimer: () => undefined });
    await r.programar(estado(1));
    t += 1_000;
    await expect(r.programar(estado(2), true)).resolves.toBeUndefined();
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('payload acotado y sin datos personales', () => {
    const p = construirPayloadSalud(
      { pendientes: -3, fallidas: 2.7, ultimoError: 'clientes: duplicate key (email)=(luis@x.mx)', ultimoSyncOk: Date.UTC(2026, 10, 23, 12) },
      { dispositivoId: 'd'.repeat(80), version: 'v1', plataforma: 'ios' },
    );
    expect(p.p_pendientes).toBe(0);
    expect(p.p_fallidas).toBe(2);
    expect(p.p_dispositivo_id).toHaveLength(64);
    expect(p.p_ultimo_error).not.toContain('luis@x.mx');
    expect(p.p_ultimo_sync_ok).toBe('2026-11-23T12:00:00.000Z');
  });
});

describe('panel y alertas', () => {
  it('destinatarios: separa, normaliza y reporta inválidos', () => {
    expect(parsearDestinatarios(' Ops@Ejemplo.mx, ops@ejemplo.mx;\nsoporte@ejemplo.mx  malo ')).toEqual({
      validos: ['ops@ejemplo.mx', 'soporte@ejemplo.mx'],
      invalidos: ['malo'],
    });
    expect(destinatariosValidos(['A@b.co', 'x', null, 'a@b.co'])).toEqual(['a@b.co']);
  });

  it('semáforo del celular', () => {
    expect(estadoDispositivo({ fallidas: 1, pendientes: 0, horas_sin_sync: 0 }, 6)).toBe('fallidas');
    expect(estadoDispositivo({ fallidas: 0, pendientes: 2, horas_sin_sync: '7.5' }, 6)).toBe('atorado');
    expect(estadoDispositivo({ fallidas: 0, pendientes: 2, horas_sin_sync: 1 }, 6)).toBe('pendientes');
  });

  const base: DatosSalud = {
    ahora: new Date('2026-11-24T15:17:00Z'),
    config: { umbral_errores_hora: 20, horas_pendientes: 6 },
    fallasCron: [],
    erroresHttp: [],
    dispositivos: [],
    erroresUltimaHora: 0,
    gruposErrores: [],
  };

  it('sin nada que avisar → sin hallazgos', () => {
    expect(evaluarHallazgos(base)).toEqual([]);
  });

  it('cron fallido, HTTP con error, celular con fallidas / atorado y pico de errores', () => {
    const h = evaluarHallazgos({
      ...base,
      fallasCron: [{ runid: 77, jobname: 'purge-gps-history-daily', start_time: '2026-11-24T15:00:00Z', mensaje: 'column "created_at" does not exist' }],
      erroresHttp: [{ id: 191, status_code: 500, created: '2026-11-24T15:09:00Z', mensaje: '{"error":"x"}' }],
      dispositivos: [
        { dispositivo_id: 'd1', user_id: 'u1', empresa_nombre: 'Demo', usuario: 'Vend', version: 'v1', pendientes: 0, fallidas: 2, ultimo_sync_ok: null, ultimo_error: 'ventas: x', horas_sin_sync: 1 },
        { dispositivo_id: 'd2', user_id: 'u2', empresa_nombre: 'Demo', usuario: 'Vend2', version: 'v1', pendientes: 4, fallidas: 0, ultimo_sync_ok: '2026-11-24T06:00:00Z', ultimo_error: null, horas_sin_sync: 9.3 },
        { dispositivo_id: 'd3', user_id: 'u3', empresa_nombre: 'Demo', usuario: 'Vend3', version: 'v1', pendientes: 4, fallidas: 0, ultimo_sync_ok: '2026-11-24T14:00:00Z', ultimo_error: null, horas_sin_sync: 1.3 },
      ],
      erroresUltimaHora: 25,
      gruposErrores: [{ origen: 'app', mensaje: 'boom', empresa_nombre: 'Demo', conteo: 25 }],
    });
    expect(h.map((x) => x.clave)).toEqual([
      'cron:77',
      'http:191',
      'disp:u1:d1:fallidas:2',
      'disp:u2:d2:pend:2026-11-24T06:00:00Z',
      'errores:2026-11-24T15',
    ]);
    const { asunto, secciones } = armarResumen(h, base.ahora);
    expect(asunto).toContain('5 alertas');
    expect(secciones.map((s) => s.titulo)).toEqual(['Crons fallidos', 'Llamadas HTTP con error', 'Celulares', 'Errores de la app']);
  });

  it('dedupe: misma situación → misma clave (no se vuelve a avisar); si suben las fallidas, clave nueva', () => {
    const disp = { dispositivo_id: 'd1', user_id: 'u1', empresa_nombre: null, usuario: null, version: null, pendientes: 0, fallidas: 2, ultimo_sync_ok: null, ultimo_error: null, horas_sin_sync: 0 };
    const a = evaluarHallazgos({ ...base, dispositivos: [disp] })[0].clave;
    const b = evaluarHallazgos({ ...base, ahora: new Date('2026-11-24T16:17:00Z'), dispositivos: [disp] })[0].clave;
    const c = evaluarHallazgos({ ...base, dispositivos: [{ ...disp, fallidas: 3 }] })[0].clave;
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});

describe('migración D-064 (estática)', () => {
  const sql = leer('supabase/migrations/20261123090000_d064_observabilidad.sql');

  it('tablas con RLS y sin escritura directa para authenticated/anon', () => {
    for (const t of ['app_errores', 'dispositivos_sync', 'alertas_config', 'alertas_enviadas']) {
      expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`);
    }
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
  });

  it('RPC SECURITY DEFINER con search_path fijo; anon sin EXECUTE; purga solo servidor', () => {
    const funciones = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    expect(funciones).toEqual(expect.arrayContaining([
      'registrar_error_app', 'registrar_salud_dispositivo', 'admin_salud_errores',
      'admin_salud_dispositivos', 'admin_salud_crons', 'admin_guardar_alertas_config', 'purgar_observabilidad',
    ]));
    const definers = sql.split('CREATE OR REPLACE FUNCTION').slice(1).filter((f) => f.includes('SECURITY DEFINER'));
    for (const f of definers) expect(f).toContain("SET search_path TO 'public'");
    for (const fn of ['registrar_error_app', 'registrar_salud_dispositivo', 'admin_salud_errores', 'admin_salud_crons']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon;`));
    }
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.purgar_observabilidad() TO service_role;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.purgar_observabilidad() FROM PUBLIC, anon, authenticated;');
  });

  it('límite por usuario, tamaño acotado y empresa/usuario puestos por el servidor', () => {
    expect(sql).toContain("v_min >= 20 OR v_hora >= 300");
    expect(sql).toContain('pg_column_size(v_detalle) > 4096');
    expect(sql).toContain('v_empresa := public.get_my_empresa_id();');
    expect(sql).not.toMatch(/p_empresa_id|p_user_id/);
  });

  it('crons: purga a 30 días y alerta horaria en minuto no redondo con x-cron-secret de Vault', () => {
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("cron.schedule('alertas-salud-horaria', '17 * * * *'");
    expect(sql).toContain("'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)");
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // sin llaves en el repo
  });

  it('la función alertas-salud se publica con config.toml y valida al llamador', () => {
    expect(leer('supabase/config.toml')).toMatch(/\[functions\.alertas-salud\]\s*\nverify_jwt = false/);
    const fn = leer('supabase/functions/alertas-salud/index.ts');
    expect(fn).toContain('isPrivilegedCaller(req)');
    expect(fn).toContain('sendAppEmail("alertas-salud"');
  });
});

describe('Sentry intacto', () => {
  it('captureAppError sigue mandando a Sentry si hay DSN y además al reporte interno', () => {
    const obs = leer('src/lib/observability.ts');
    expect(obs).toContain('if (initialized) Sentry.captureException(error');
    expect(obs).toContain("import('@/lib/telemetriaRuntime')");
    expect(obs).toContain('VITE_SENTRY_DSN');
  });
});
