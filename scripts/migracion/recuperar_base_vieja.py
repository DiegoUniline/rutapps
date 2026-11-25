#!/usr/bin/env python3
"""Genera el SQL de recuperación de lo capturado en la base vieja (Lovable) después del corte (2026-11-23).

Uso (siempre con -I: el export es dato no confiable):
  python3 -I scripts/migracion/recuperar_base_vieja.py \
      --datos      <export de la base vieja: datos.json (to_jsonb por tabla)> \
      --existentes <json {tabla: [prefijos de 8 hex de ids que ya están en la base nueva]}> \
      --salida     docs/sql/2026-11-25_recuperar_base_vieja.sql \
      [--partes-dir <carpeta>]   # además un .sql por parte, para ensayar por separado

Qué hace el SQL generado (ver cabecera del archivo):
  * Bloques DO (partes) con los datos incrustados (JSON compacto + md5). Cada parte trae una o más empresas.
  * Solo inserta ids que no existan (idempotente), padre → hijo:
      clientes → ventas → venta_lineas → cobros → cobro_aplicaciones → entregas → entrega_lineas → visitas → gastos
  * No desactiva triggers ni RLS. Folio por trigger (next_folio); si el folio viejo no choca se restaura, si choca
    se queda el nuevo y el viejo va a notas. Inventario por delta (triggers DEFERRED, SET CONSTRAINTS ALL IMMEDIATE).
    Entregas: se insertan en borrador y se pasan a cargado → hecho para que los triggers muevan inventario y pedido.
  * No fuerza nada: venta ya recapturada en la nueva (mismo cliente, mismos productos y cantidades, ±1 día) se omite
    con sus cobros/visitas; cobro sobre una venta que ya tiene cobro capturado en la nueva después del corte, o que la
    validación rechaza, se reporta como conflicto; entrega de un pedido que ya tiene entrega en la nueva, igual.
  * Modo por defecto ENSAYO: cada parte termina con RAISE EXCEPTION y su resumen (se deshace todo).
    Aplicar: SET rutapp.recuperacion_modo = 'APLICAR'; en la misma sesión y correr el archivo (BEGIN … COMMIT).

Codificación del JSON incrustado (para que quepa): por tabla columnas una vez ("c"), valores constantes ("k"),
columnas siempre nulas ("n") y filas ("r"). Cadenas especiales: "~n" = uuid n del diccionario "u"; "^xxx" = uuid en
base64; "@s" = timestamptz = 2026-11-01 00:00 UTC + s segundos. Los números se copian tal cual (sin pasar por float).
"""
import argparse
import base64
import hashlib
import json
import re
import sys
import uuid
from collections import defaultdict, Counter
from datetime import datetime, timezone
from decimal import Decimal

CORTE = '2026-11-23 00:41:00+00'
BASE_TS = datetime(2026, 11, 1, tzinfo=timezone.utc)
TABLAS = ['clientes', 'ventas', 'venta_lineas', 'cobros', 'cobro_aplicaciones',
          'entregas', 'entrega_lineas', 'visitas', 'gastos']
UU = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
TS = re.compile(r'^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?\+00:00$')
TAG = 'recup_payload'
NUM = '\x01'


def b64(u):
    return base64.b64encode(uuid.UUID(u).bytes).decode().rstrip('=')


def ts_off(v):
    m = TS.match(v)
    y, mo, dd, h, mi, s, frac = m.groups()
    dt = datetime(int(y), int(mo), int(dd), int(h), int(mi), int(s), tzinfo=timezone.utc)
    secs = int((dt - BASE_TS).total_seconds())
    return '@' + str(secs) + (('.' + frac.rstrip('0')) if frac and frac.rstrip('0') else '')


def cargar(args):
    with open(args.datos, encoding='utf-8') as f:
        d = json.load(f, parse_float=lambda s: NUM + s)
    ex = {}
    if args.existentes:
        with open(args.existentes, encoding='utf-8') as f:
            ex = {k: set(v) for k, v in json.load(f).items()}
    return d, ex


def existe(ex, tabla, rid):
    return rid[:8] in ex.get(tabla, set())


def columnas(d, tabla):
    cols = []
    for r in d.get(tabla) or []:
        for k in r.keys():
            if k not in cols:
                cols.append(k)
    return cols


def agrupar(d, ex):
    """Filas a cargar por empresa (sin las que ya existen) + ids viejos que ya existen (para excluirlos)."""
    cobro_emp = {c['id']: c['empresa_id'] for c in d['cobros']}
    ent_emp = {e['id']: e['empresa_id'] for e in d['entregas']}
    venta_existe = {v['id']: existe(ex, 'ventas', v['id']) for v in d['ventas']}
    cobro_existe = {c['id']: existe(ex, 'cobros', c['id']) for c in d['cobros']}
    por = defaultdict(lambda: defaultdict(list))
    x = defaultdict(lambda: defaultdict(list))
    for t in TABLAS:
        for r in d.get(t) or []:
            if t == 'cobro_aplicaciones':
                emp = cobro_emp[r['cobro_id']]
                if cobro_existe[r['cobro_id']]:
                    continue
            elif t == 'entrega_lineas':
                emp = ent_emp[r['entrega_id']]
            else:
                emp = r['empresa_id']
            if t == 'venta_lineas' and venta_existe.get(r['venta_id']):
                continue
            if t in ('ventas', 'cobros', 'entregas', 'clientes', 'visitas', 'gastos') and existe(ex, t, r['id']):
                if t in ('ventas', 'cobros', 'entregas'):
                    x[emp][t].append(r['id'])
                continue
            por[emp][t].append(r)
    return por, x


# Columnas sin efecto en la lógica de la carga (texto libre, desglose informativo, GPS, avisos). Solo se omiten con
# --reducido, para el ensayo en producción por partes (menos texto que transcribir); el archivo final las lleva todas.
INFORMATIVAS = {
    'venta_lineas': ['descripcion', 'created_at', 'updated_at', 'precio_unitario_sin_redondeo', 'precio_lista_unitario',
                     'importe_bruto', 'descuento_promocion_monto', 'base_descuento_manual', 'descuento_manual_monto',
                     'descuento_total_monto', 'base_ieps', 'base_iva', 'impuestos_totales', 'descuento_manual',
                     'motivo_descuento_manual', 'descuento_registrado_por', 'promocion_nombre', 'cantidad_bonificada',
                     'es_bonificacion', 'objeto_impuesto', 'comision_pct', 'comision_monto', 'notas',
                     'presentacion_nombre', 'paquetes'],
    'visitas': ['gps_lat', 'gps_lng', 'notas', 'motivo', 'created_at'],
    'cobros': ['notif_error', 'notif_email_status', 'notif_wa_status', 'notas', 'referencia', 'updated_at'],
    'ventas': ['notas', 'concepto', 'descuento_extra_motivo', 'cerrado_snapshot', 'updated_at'],
    'entrega_lineas': ['presentacion_nombre', 'paquetes', 'motivo_no_entrega'],
    'entregas': ['notas', 'motivo_no_entrega', 'updated_at'],
    'clientes': ['direccion', 'colonia', 'contacto', 'telefono', 'email', 'notas', 'gps_lat', 'gps_lng', 'foto_url',
                 'foto_fachada_url', 'rfc_validado_detalle'],
}


def codificar(filas, cols_tabla, x, reducido=False):
    cnt = Counter()
    for rows in filas.values():
        for r in rows:
            for k, v in r.items():
                if k != 'id' and isinstance(v, str) and UU.match(v):
                    cnt[v] += 1
    dic = sorted(u for u, n in cnt.items() if n > 1)
    idx = {u: i for i, u in enumerate(dic)}

    def enc(k, v):
        if isinstance(v, str):
            if v.startswith(NUM):
                return v
            if v[:1] in ('~', '^', '@'):
                raise SystemExit(f'valor que empieza con marcador en {k}: {v[:10]!r}')
            if UU.match(v):
                return ('~%d' % idx[v]) if (k != 'id' and v in idx) else '^' + b64(v)
            if TS.match(v):
                return ts_off(v)
        return v

    out = {'u': [b64(u) for u in dic], 't': {}, 'x': {k: [b64(i) for i in sorted(v)] for k, v in x.items()}}
    for t in TABLAS:
        rows = filas.get(t) or []
        if not rows:
            continue
        todas = [c for c in cols_tabla[t] if not (reducido and c in INFORMATIVAS.get(t, []))]
        cols = [c for c in todas if any(r.get(c) is not None for r in rows)]
        nulas = [c for c in todas if c not in cols]
        const = {}
        if len(rows) > 1:
            for c in cols:
                if c != 'id' and len({json.dumps(r.get(c), sort_keys=True) for r in rows}) == 1:
                    const[c] = enc(c, rows[0].get(c))
        var = [c for c in cols if c not in const]
        out['t'][t] = {'c': var, 'k': const, 'n': nulas, 'r': [[enc(c, r.get(c)) for c in var] for r in rows]}
    txt = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
    txt = re.sub(r'"\\u0001(-?[0-9.eE+\-]+)"', r'\1', txt)
    if '\\u0001' in txt or f'${TAG}$' in txt or '$recup_' in txt:
        raise SystemExit('payload inválido (marcador numérico o etiqueta de dollar-quote)')
    json.loads(txt)
    return txt


PLANTILLA = r"""
DO $recup_parte$
DECLARE
  c_corte constant timestamptz := '__CORTE__';
  c_md5   constant text := '__MD5__';
  c_txt   constant text := $__TAG__$__PAYLOAD__$__TAG__$;
  v_modo  text := upper(coalesce(nullif(current_setting('rutapp.recuperacion_modo', true), ''), 'ENSAYO'));
  p jsonb; d jsonb := '{}'; k jsonb := '{}'; v_tab text; v_arr jsonb; v_obj jsonb; v_col text; v_sql text;
  v_id uuid; v_emp uuid; v_match uuid; v_sig text; v_old text; v_new text; v_motivo text; v_det text; v_status text; v_n int;
  v_xv uuid[]; v_xc uuid[]; v_xe uuid[]; v_emps uuid[]; v_pre uuid[];
  v_iv uuid[] := '{}'; v_dup uuid[] := '{}'; v_usadas uuid[] := '{}'; v_ic uuid[] := '{}'; v_ie uuid[] := '{}';
  v_ivis uuid[] := '{}'; v_icli uuid[] := '{}'; v_igas uuid[] := '{}';
  v_folios jsonb := '[]'; v_dups jsonb := '[]'; v_conf jsonb := '[]'; v_nulos jsonb := '[]'; v_antes jsonb; v_rep jsonb;
BEGIN
  IF md5(c_txt) <> c_md5 THEN RAISE EXCEPTION 'Recuperación: los datos incrustados no coinciden con su md5 (copia alterada)'; END IF;
  IF v_modo NOT IN ('ENSAYO', 'APLICAR') THEN RAISE EXCEPTION 'rutapp.recuperacion_modo debe ser ENSAYO o APLICAR (es %)', v_modo; END IF;
  p := c_txt::jsonb;

  -- 0. Decodificar. k = lista de columnas por tabla (las del export: variables + constantes + nulas).
  FOR v_tab IN SELECT jsonb_object_keys(p->'t') LOOP
    SELECT coalesce(jsonb_agg(z.o ORDER BY z.n), '[]') INTO v_arr FROM (
      SELECT rw.n, coalesce((SELECT jsonb_object_agg(kk.key, kk.value) FROM jsonb_each(p->'t'->v_tab->'k') kk), '{}'::jsonb)
                   || coalesce((SELECT jsonb_object_agg(cc.col, vv.val) FROM jsonb_array_elements_text(p->'t'->v_tab->'c') WITH ORDINALITY cc(col, i)
                                 JOIN jsonb_array_elements(rw.fila) WITH ORDINALITY vv(val, j) ON cc.i = vv.j), '{}'::jsonb) AS o
        FROM jsonb_array_elements(p->'t'->v_tab->'r') WITH ORDINALITY rw(fila, n)) z;
    -- marcadores ~ ^ @
    SELECT coalesce(jsonb_agg((SELECT jsonb_object_agg(e.key,
              CASE WHEN jsonb_typeof(e.value) = 'string' AND left(e.value #>> '{}', 1) IN ('~', '^', '@') THEN
                CASE left(e.value #>> '{}', 1)
                  WHEN '~' THEN to_jsonb(encode(decode((p->'u'->>(substr(e.value #>> '{}', 2)::int)) || '==', 'base64'), 'hex')::uuid)
                  WHEN '^' THEN to_jsonb(encode(decode(substr(e.value #>> '{}', 2) || '==', 'base64'), 'hex')::uuid)
                  ELSE to_jsonb(timestamptz '2026-11-01 00:00:00+00' + (substr(e.value #>> '{}', 2) || ' seconds')::interval) END
              ELSE e.value END) FROM jsonb_each(o.o) e) ORDER BY o.n), '[]')
      INTO v_arr FROM jsonb_array_elements(v_arr) WITH ORDINALITY o(o, n);
    d := d || jsonb_build_object(v_tab, v_arr);
    SELECT string_agg(quote_ident(c), ', ') INTO v_sql FROM (
      SELECT jsonb_array_elements_text(p->'t'->v_tab->'c') c
      UNION ALL SELECT jsonb_object_keys(p->'t'->v_tab->'k')
      UNION ALL SELECT jsonb_array_elements_text(p->'t'->v_tab->'n')) s;
    k := k || jsonb_build_object(v_tab, v_sql);
  END LOOP;
  FOREACH v_tab IN ARRAY ARRAY['clientes','ventas','venta_lineas','cobros','cobro_aplicaciones','entregas','entrega_lineas','visitas','gastos'] LOOP
    IF NOT d ? v_tab THEN d := d || jsonb_build_object(v_tab, '[]'::jsonb); END IF;
  END LOOP;
  SELECT array_agg(encode(decode(x || '==', 'base64'), 'hex')::uuid) INTO v_xv FROM jsonb_array_elements_text(coalesce(p->'x'->'ventas', '[]')) x;
  SELECT array_agg(encode(decode(x || '==', 'base64'), 'hex')::uuid) INTO v_xc FROM jsonb_array_elements_text(coalesce(p->'x'->'cobros', '[]')) x;
  SELECT array_agg(encode(decode(x || '==', 'base64'), 'hex')::uuid) INTO v_xe FROM jsonb_array_elements_text(coalesce(p->'x'->'entregas', '[]')) x;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(v_xv, '{}')) i WHERE NOT EXISTS (SELECT 1 FROM public.ventas v WHERE v.id = i))
     OR EXISTS (SELECT 1 FROM unnest(coalesce(v_xc, '{}')) i WHERE NOT EXISTS (SELECT 1 FROM public.cobros c WHERE c.id = i)) THEN
    RAISE EXCEPTION 'Recuperación: una fila que el generador dio por existente no está en la base nueva; regenerar el SQL';
  END IF;
  -- Todos los ids del export (cargables + ya existentes): no cuentan como «capturado en la nueva».
  v_xv := coalesce(v_xv, '{}') || coalesce((SELECT array_agg((e->>'id')::uuid) FROM jsonb_array_elements(d->'ventas') e), '{}');
  v_xc := coalesce(v_xc, '{}') || coalesce((SELECT array_agg((e->>'id')::uuid) FROM jsonb_array_elements(d->'cobros') e), '{}');
  v_xe := coalesce(v_xe, '{}') || coalesce((SELECT array_agg((e->>'id')::uuid) FROM jsonb_array_elements(d->'entregas') e), '{}');
  SELECT array_agg(DISTINCT (e->>'empresa_id')::uuid) INTO v_emps
    FROM jsonb_array_elements((d->'clientes') || (d->'ventas') || (d->'cobros') || (d->'entregas') || (d->'visitas') || (d->'gastos')) e;
  -- Multiempresa: renglones e hijos deben ser de la empresa de su padre.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'venta_lineas') l JOIN jsonb_array_elements(d->'ventas') v ON v->>'id' = l->>'venta_id'
              WHERE l->>'empresa_id' IS DISTINCT FROM v->>'empresa_id')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'cobro_aplicaciones') a JOIN jsonb_array_elements(d->'cobros') c ON c->>'id' = a->>'cobro_id'
                 JOIN public.ventas v ON v.id = (a->>'venta_id')::uuid WHERE v.empresa_id::text <> c->>'empresa_id')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'entregas') e JOIN public.ventas v ON v.id = (e->>'pedido_id')::uuid
                 WHERE v.empresa_id::text <> e->>'empresa_id') THEN
    RAISE EXCEPTION 'Recuperación: hay renglones/aplicaciones/entregas que cruzan empresas';
  END IF;

  -- Ventas previas (ya en la nueva) que tocarán cobros/entregas recuperados: foto de antes.
  SELECT array_agg(DISTINCT v.id) INTO v_pre FROM public.ventas v
   WHERE v.id IN (SELECT (a->>'venta_id')::uuid FROM jsonb_array_elements(d->'cobro_aplicaciones') a
                  UNION SELECT (e->>'pedido_id')::uuid FROM jsonb_array_elements(d->'entregas') e);
  v_pre := coalesce(v_pre, '{}');
  SELECT coalesce(jsonb_object_agg(v.id, jsonb_build_object('status', v.status, 'saldo', v.saldo_pendiente)), '{}')
    INTO v_antes FROM public.ventas v WHERE v.id = ANY(v_pre);

  -- 1. Clientes (código que choca → nuevo con next_folio, el viejo a notas).
  FOR v_obj IN SELECT e FROM jsonb_array_elements(d->'clientes') e ORDER BY e->>'created_at', e->>'id' LOOP
    IF EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = (v_obj->>'id')::uuid) THEN CONTINUE; END IF;
    FOREACH v_col IN ARRAY ARRAY['vendedor_id', 'cobrador_id'] LOOP
      IF (v_obj->>v_col) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles pf WHERE pf.id = (v_obj->>v_col)::uuid) THEN
        v_nulos := v_nulos || jsonb_build_object('tabla', 'clientes', 'id', v_obj->>'id', 'campo', v_col, 'valor', v_obj->>v_col);
        v_obj := jsonb_set(v_obj, ARRAY[v_col], 'null');
      END IF;
    END LOOP;
    v_old := v_obj->>'codigo';
    IF v_old IS NOT NULL AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.empresa_id = (v_obj->>'empresa_id')::uuid AND c.codigo = v_old) THEN
      v_obj := jsonb_set(jsonb_set(v_obj, '{codigo}', 'null'), '{notas}',
                         to_jsonb(concat_ws(' · ', nullif(v_obj->>'notas', ''), 'Recuperado de base anterior, código original ' || v_old)));
    END IF;
    EXECUTE format('INSERT INTO public.clientes (%s) SELECT %1$s FROM jsonb_populate_record(NULL::public.clientes, $1) RETURNING codigo', k->>'clientes')
      INTO v_new USING v_obj;
    v_icli := v_icli || (v_obj->>'id')::uuid;
    IF v_new IS DISTINCT FROM v_old THEN
      v_folios := v_folios || jsonb_build_object('tabla', 'clientes', 'empresa', v_obj->>'empresa_id', 'id', v_obj->>'id', 'viejo', v_old, 'nuevo', v_new);
    END IF;
  END LOOP;

  -- 2. Ventas: omite las ya recapturadas en la nueva; folio por trigger, se restaura el viejo si no choca.
  FOR v_obj IN SELECT e FROM jsonb_array_elements(d->'ventas') e ORDER BY e->>'created_at', e->>'id' LOOP
    v_id := (v_obj->>'id')::uuid; v_emp := (v_obj->>'empresa_id')::uuid;
    IF EXISTS (SELECT 1 FROM public.ventas v WHERE v.id = v_id) THEN CONTINUE; END IF;
    SELECT string_agg((l->>'producto_id') || ':' || round((l->>'cantidad')::numeric, 4)::text, ',' ORDER BY l->>'producto_id', round((l->>'cantidad')::numeric, 4))
      INTO v_sig FROM jsonb_array_elements(d->'venta_lineas') l WHERE (l->>'venta_id')::uuid = v_id;
    v_match := NULL;
    IF v_sig IS NOT NULL THEN
      SELECT v.id INTO v_match FROM public.ventas v
       WHERE v.empresa_id = v_emp AND v.cliente_id = (v_obj->>'cliente_id')::uuid AND v.created_at >= c_corte
         AND v.status::text <> 'cancelado' AND abs(v.fecha - (v_obj->>'fecha')::date) <= 1
         AND NOT (v.id = ANY(v_xv)) AND NOT (v.id = ANY(v_usadas))
         AND (SELECT string_agg(l.producto_id::text || ':' || round(l.cantidad, 4)::text, ',' ORDER BY l.producto_id::text, round(l.cantidad, 4))
                FROM public.venta_lineas l WHERE l.venta_id = v.id) = v_sig
       ORDER BY abs(extract(epoch FROM v.created_at - (v_obj->>'created_at')::timestamptz)), v.id LIMIT 1;
    END IF;
    IF v_match IS NOT NULL THEN
      v_usadas := v_usadas || v_match; v_dup := v_dup || v_id;
      SELECT v_dups || jsonb_build_object('empresa', v_emp, 'vieja_id', v_id, 'vieja_folio', v_obj->>'folio', 'vieja_total', (v_obj->>'total')::numeric,
               'vieja_fecha', v_obj->>'fecha', 'vieja_creada', v_obj->>'created_at', 'nueva_id', v.id, 'nueva_folio', v.folio,
               'nueva_total', v.total, 'nueva_fecha', v.fecha, 'nueva_status', v.status, 'nueva_creada', v.created_at)
        INTO v_dups FROM public.ventas v WHERE v.id = v_match;
      CONTINUE;
    END IF;
    FOREACH v_col IN ARRAY ARRAY['vendedor_id', 'creado_por'] LOOP
      IF (v_obj->>v_col) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles pf WHERE pf.id = (v_obj->>v_col)::uuid) THEN
        v_nulos := v_nulos || jsonb_build_object('tabla', 'ventas', 'id', v_id, 'campo', v_col, 'valor', v_obj->>v_col);
        v_obj := jsonb_set(v_obj, ARRAY[v_col], 'null');
      END IF;
    END LOOP;
    v_old := v_obj->>'folio';
    EXECUTE format('INSERT INTO public.ventas (%s) SELECT %1$s FROM jsonb_populate_record(NULL::public.ventas, $1) RETURNING folio', k->>'ventas')
      INTO v_new USING v_obj;
    v_iv := v_iv || v_id;
    IF v_old IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN
      IF EXISTS (SELECT 1 FROM public.ventas v WHERE v.empresa_id = v_emp AND v.folio = v_old AND v.id <> v_id) THEN
        UPDATE public.ventas SET notas = concat_ws(' · ', nullif(notas, ''), 'Recuperada de base anterior, folio original ' || v_old) WHERE id = v_id;
        v_folios := v_folios || jsonb_build_object('tabla', 'ventas', 'empresa', v_emp, 'id', v_id, 'viejo', v_old, 'nuevo', v_new);
      ELSE
        UPDATE public.ventas SET folio = v_old WHERE id = v_id;
      END IF;
    END IF;
  END LOOP;

  -- 3. Renglones de las ventas insertadas; luego se disparan los DEFERRED (inventario por delta, encabezado, saldo).
  IF (k->>'venta_lineas') IS NOT NULL THEN
    EXECUTE format('INSERT INTO public.venta_lineas (%s) SELECT %1$s FROM jsonb_populate_recordset(NULL::public.venta_lineas, $1) ON CONFLICT (id) DO NOTHING', k->>'venta_lineas')
      USING (SELECT coalesce(jsonb_agg(l), '[]') FROM jsonb_array_elements(d->'venta_lineas') l WHERE (l->>'venta_id')::uuid = ANY(v_iv));
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  -- 4. Cobros + aplicaciones (sin forzar validaciones; lo dudoso queda como conflicto).
  FOR v_obj IN SELECT e FROM jsonb_array_elements(d->'cobros') e ORDER BY e->>'created_at', e->>'id' LOOP
    v_id := (v_obj->>'id')::uuid;
    IF EXISTS (SELECT 1 FROM public.cobros c WHERE c.id = v_id) THEN CONTINUE; END IF;
    v_arr := (SELECT coalesce(jsonb_agg(a), '[]') FROM jsonb_array_elements(d->'cobro_aplicaciones') a WHERE (a->>'cobro_id')::uuid = v_id);
    v_motivo := NULL; v_det := NULL;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_arr) a WHERE (a->>'venta_id')::uuid = ANY(v_dup)) THEN
      v_motivo := 'venta_recapturada_en_nueva';
    ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(v_arr) a WHERE NOT EXISTS (SELECT 1 FROM public.ventas v WHERE v.id = (a->>'venta_id')::uuid)) THEN
      v_motivo := 'venta_inexistente';
    ELSE
      SELECT string_agg(DISTINCT c.id::text || ' $' || ca.monto_aplicado || ' ' || c.fecha || ' ' || c.metodo_pago, '; ') INTO v_det
        FROM jsonb_array_elements(v_arr) a
        JOIN public.cobro_aplicaciones ca ON ca.venta_id = (a->>'venta_id')::uuid
        JOIN public.cobros c ON c.id = ca.cobro_id
       WHERE NOT ((a->>'venta_id')::uuid = ANY(v_iv)) AND c.status <> 'cancelado' AND c.created_at >= c_corte AND NOT (c.id = ANY(v_xc));
      IF v_det IS NOT NULL THEN v_motivo := 'venta_ya_cobrada_en_nueva'; END IF;
    END IF;
    IF v_motivo IS NULL THEN
      BEGIN
        EXECUTE format('INSERT INTO public.cobros (%s) SELECT %1$s FROM jsonb_populate_record(NULL::public.cobros, $1)', k->>'cobros') USING v_obj;
        EXECUTE format('INSERT INTO public.cobro_aplicaciones (%s) SELECT %1$s FROM jsonb_populate_recordset(NULL::public.cobro_aplicaciones, $1) ON CONFLICT (id) DO NOTHING',
                       k->>'cobro_aplicaciones') USING v_arr;
        v_ic := v_ic || v_id;
      EXCEPTION WHEN OTHERS THEN
        v_motivo := 'rechazado_por_validacion'; v_det := SQLERRM;
      END;
    END IF;
    IF v_motivo IS NOT NULL THEN
      v_conf := v_conf || jsonb_build_object('tipo', 'cobro', 'empresa', v_obj->>'empresa_id', 'id', v_id, 'monto', (v_obj->>'monto')::numeric,
        'fecha', v_obj->>'fecha', 'creado', v_obj->>'created_at', 'status', v_obj->>'status', 'metodo', v_obj->>'metodo_pago',
        'ventas', (SELECT jsonb_agg(jsonb_build_object('venta_id', a->>'venta_id', 'aplicado', (a->>'monto_aplicado')::numeric,
                     'folio', coalesce((SELECT v.folio FROM public.ventas v WHERE v.id = (a->>'venta_id')::uuid),
                                       (SELECT e->>'folio' FROM jsonb_array_elements(d->'ventas') e WHERE e->>'id' = a->>'venta_id'))))
                   FROM jsonb_array_elements(v_arr) a),
        'motivo', v_motivo, 'detalle', v_det);
    END IF;
  END LOOP;

  -- 5. Entregas: borrador + renglones; luego cargado → hecho por los triggers del sistema (inventario y pedido).
  FOR v_obj IN SELECT e FROM jsonb_array_elements(d->'entregas') e ORDER BY e->>'created_at', e->>'folio', e->>'id' LOOP
    v_id := (v_obj->>'id')::uuid; v_emp := (v_obj->>'empresa_id')::uuid;
    IF EXISTS (SELECT 1 FROM public.entregas e WHERE e.id = v_id) THEN CONTINUE; END IF;
    v_motivo := NULL; v_det := NULL; v_status := v_obj->>'status';
    IF (v_obj->>'pedido_id')::uuid = ANY(v_dup) THEN
      v_motivo := 'pedido_recapturado_en_nueva';
    ELSIF (v_obj->>'pedido_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ventas v WHERE v.id = (v_obj->>'pedido_id')::uuid) THEN
      v_motivo := 'pedido_inexistente';
    ELSIF v_status NOT IN ('borrador', 'cargado', 'en_ruta', 'hecho') THEN
      v_motivo := 'estado_no_soportado';
    ELSE
      SELECT string_agg(e.folio || ' (' || e.status || ')', ', ') INTO v_det FROM public.entregas e
       WHERE e.pedido_id = (v_obj->>'pedido_id')::uuid AND e.status::text <> 'cancelado' AND NOT (e.id = ANY(v_xe));
      IF v_det IS NOT NULL THEN v_motivo := 'pedido_ya_tiene_entrega_en_nueva'; END IF;
    END IF;
    IF v_motivo IS NULL THEN
      BEGIN
        FOREACH v_col IN ARRAY ARRAY['vendedor_id', 'vendedor_ruta_id'] LOOP
          IF (v_obj->>v_col) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles pf WHERE pf.id = (v_obj->>v_col)::uuid) THEN
            v_nulos := v_nulos || jsonb_build_object('tabla', 'entregas', 'id', v_id, 'campo', v_col, 'valor', v_obj->>v_col);
            v_obj := jsonb_set(v_obj, ARRAY[v_col], 'null');
          END IF;
        END LOOP;
        v_old := v_obj->>'folio';
        EXECUTE format('INSERT INTO public.entregas (%s) SELECT %1$s FROM jsonb_populate_record(NULL::public.entregas, $1) RETURNING folio', k->>'entregas')
          INTO v_new USING v_obj || jsonb_build_object('status', 'borrador', 'fecha_entrega', NULL, 'validado_at', NULL, 'validado_por', NULL);
        EXECUTE format('INSERT INTO public.entrega_lineas (%s) SELECT %1$s FROM jsonb_populate_recordset(NULL::public.entrega_lineas, $1)', k->>'entrega_lineas')
          USING (SELECT coalesce(jsonb_agg(l), '[]') FROM jsonb_array_elements(d->'entrega_lineas') l WHERE (l->>'entrega_id')::uuid = v_id);
        IF v_status IN ('cargado', 'en_ruta', 'hecho') THEN UPDATE public.entregas SET status = 'cargado' WHERE id = v_id; END IF;
        IF v_status = 'en_ruta' THEN UPDATE public.entregas SET status = 'en_ruta' WHERE id = v_id; END IF;
        IF v_status = 'hecho' THEN
          UPDATE public.entregas SET status = 'hecho', fecha_entrega = (v_obj->>'fecha_entrega')::timestamptz,
                 validado_at = (v_obj->>'validado_at')::timestamptz, validado_por = (v_obj->>'validado_por')::uuid
           WHERE id = v_id;
        END IF;
        IF v_old IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN
          IF EXISTS (SELECT 1 FROM public.entregas e WHERE e.empresa_id = v_emp AND e.folio = v_old AND e.id <> v_id) THEN
            UPDATE public.entregas SET notas = concat_ws(' · ', nullif(notas, ''), 'Recuperada de base anterior, folio original ' || v_old) WHERE id = v_id;
            v_folios := v_folios || jsonb_build_object('tabla', 'entregas', 'empresa', v_emp, 'id', v_id, 'viejo', v_old, 'nuevo', v_new);
          ELSE
            UPDATE public.entregas SET folio = v_old WHERE id = v_id;
          END IF;
        END IF;
        v_ie := v_ie || v_id;
      EXCEPTION WHEN OTHERS THEN
        v_motivo := 'rechazada_por_validacion'; v_det := SQLERRM;
      END;
    END IF;
    IF v_motivo IS NOT NULL THEN
      v_conf := v_conf || jsonb_build_object('tipo', 'entrega', 'empresa', v_emp, 'id', v_id, 'folio', v_obj->>'folio', 'status', v_status,
        'pedido_id', v_obj->>'pedido_id', 'pedido_folio', (SELECT v.folio FROM public.ventas v WHERE v.id = (v_obj->>'pedido_id')::uuid),
        'motivo', v_motivo, 'detalle', v_det);
    END IF;
  END LOOP;

  -- 6. Visitas (las de ventas recapturadas no; si su venta no existe, sin venta).
  FOR v_obj IN SELECT e FROM jsonb_array_elements(d->'visitas') e
                WHERE NOT (coalesce((e->>'venta_id')::uuid, '00000000-0000-0000-0000-000000000000') = ANY(v_dup)) LOOP
    IF EXISTS (SELECT 1 FROM public.visitas x WHERE x.id = (v_obj->>'id')::uuid) THEN CONTINUE; END IF;
    IF (v_obj->>'venta_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ventas v WHERE v.id = (v_obj->>'venta_id')::uuid) THEN
      v_obj := jsonb_set(v_obj, '{venta_id}', 'null');
    END IF;
    EXECUTE format('INSERT INTO public.visitas (%s) SELECT %1$s FROM jsonb_populate_record(NULL::public.visitas, $1)', k->>'visitas') USING v_obj;
    v_ivis := v_ivis || (v_obj->>'id')::uuid;
  END LOOP;

  -- 7. Gastos.
  FOR v_obj IN SELECT e FROM jsonb_array_elements(d->'gastos') e LOOP
    IF EXISTS (SELECT 1 FROM public.gastos g WHERE g.id = (v_obj->>'id')::uuid) THEN CONTINUE; END IF;
    IF (v_obj->>'vendedor_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles pf WHERE pf.id = (v_obj->>'vendedor_id')::uuid) THEN
      v_nulos := v_nulos || jsonb_build_object('tabla', 'gastos', 'id', v_obj->>'id', 'campo', 'vendedor_id', 'valor', v_obj->>'vendedor_id');
      v_obj := jsonb_set(v_obj, '{vendedor_id}', 'null');
    END IF;
    IF (v_obj->>'venta_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ventas v WHERE v.id = (v_obj->>'venta_id')::uuid) THEN
      v_obj := jsonb_set(v_obj, '{venta_id}', 'null');
    END IF;
    EXECUTE format('INSERT INTO public.gastos (%s) SELECT %1$s FROM jsonb_populate_record(NULL::public.gastos, $1)', k->>'gastos') USING v_obj;
    v_igas := v_igas || (v_obj->>'id')::uuid;
  END LOOP;

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  -- 8. Resumen por empresa.
  SELECT jsonb_agg(jsonb_build_object(
    'empresa', em.id, 'nombre', em.nombre,
    'clientes', (SELECT count(*) FROM public.clientes c WHERE c.id = ANY(v_icli) AND c.empresa_id = em.id),
    'ventas', (SELECT jsonb_build_object('n', count(*), 'total', coalesce(sum(v.total), 0), 'saldo', coalesce(sum(v.saldo_pendiente), 0),
                 'tipos', (SELECT jsonb_object_agg(t, n) FROM (SELECT v2.tipo || '/' || v2.status t, count(*) n FROM public.ventas v2
                            WHERE v2.id = ANY(v_iv) AND v2.empresa_id = em.id GROUP BY 1) s))
               FROM public.ventas v WHERE v.id = ANY(v_iv) AND v.empresa_id = em.id),
    'venta_lineas', (SELECT count(*) FROM public.venta_lineas l WHERE l.venta_id = ANY(v_iv) AND l.empresa_id = em.id),
    'total_cambio', (SELECT jsonb_agg(jsonb_build_object('folio', v.folio, 'viejo', (e->>'total')::numeric, 'nuevo', v.total))
               FROM jsonb_array_elements(d->'ventas') e JOIN public.ventas v ON v.id = (e->>'id')::uuid
              WHERE v.id = ANY(v_iv) AND v.empresa_id = em.id AND abs(v.total - (e->>'total')::numeric) > 0.005),
    'cobros', (SELECT jsonb_build_object('n', count(*), 'activos', coalesce(sum(c.monto) FILTER (WHERE c.status <> 'cancelado'), 0),
                 'cancelados', coalesce(sum(c.monto) FILTER (WHERE c.status = 'cancelado'), 0),
                 'aplicaciones', (SELECT count(*) FROM public.cobro_aplicaciones ca JOIN public.cobros c3 ON c3.id = ca.cobro_id
                                   WHERE ca.cobro_id = ANY(v_ic) AND c3.empresa_id = em.id))
               FROM public.cobros c WHERE c.id = ANY(v_ic) AND c.empresa_id = em.id),
    'entregas', (SELECT count(*) FROM public.entregas e WHERE e.id = ANY(v_ie) AND e.empresa_id = em.id),
    'entrega_lineas', (SELECT count(*) FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id WHERE e.id = ANY(v_ie) AND e.empresa_id = em.id),
    'visitas', (SELECT count(*) FROM public.visitas x WHERE x.id = ANY(v_ivis) AND x.empresa_id = em.id),
    'gastos', (SELECT count(*) FROM public.gastos g WHERE g.id = ANY(v_igas) AND g.empresa_id = em.id),
    'folios_reasignados', (SELECT jsonb_agg(f - 'empresa') FROM jsonb_array_elements(v_folios) f WHERE f->>'empresa' = em.id::text),
    'recapturadas_omitidas', (SELECT jsonb_agg(f - 'empresa') FROM jsonb_array_elements(v_dups) f WHERE f->>'empresa' = em.id::text),
    'conflictos', (SELECT jsonb_agg(f - 'empresa') FROM jsonb_array_elements(v_conf) f WHERE f->>'empresa' = em.id::text),
    'ventas_previas_afectadas', (SELECT jsonb_agg(jsonb_build_object('folio', v.folio,
                 'status', (v_antes->v.id::text->>'status') || '→' || v.status, 'saldo', (v_antes->v.id::text->>'saldo') || '→' || v.saldo_pendiente))
               FROM public.ventas v WHERE v.id = ANY(v_pre) AND v.empresa_id = em.id
                AND (v.status::text IS DISTINCT FROM v_antes->v.id::text->>'status' OR v.saldo_pendiente IS DISTINCT FROM (v_antes->v.id::text->>'saldo')::numeric)),
    'inventario', (SELECT jsonb_agg(jsonb_build_object('almacen', a.nombre, 'salidas', s.sal, 'entradas', s.ent, 'movs', s.n, 'productos', s.np))
               FROM (SELECT coalesce(mi.almacen_origen_id, mi.almacen_destino_id) alm, sum(mi.cantidad) FILTER (WHERE mi.tipo::text = 'salida') sal,
                            sum(mi.cantidad) FILTER (WHERE mi.tipo::text <> 'salida') ent, count(*) n, count(DISTINCT mi.producto_id) np
                       FROM public.movimientos_inventario mi WHERE mi.empresa_id = em.id AND mi.created_at = now() GROUP BY 1) s
               LEFT JOIN public.almacenes a ON a.id = s.alm),
    'negativos', (SELECT count(*) FROM public.stock_almacen sa WHERE sa.empresa_id = em.id AND sa.cantidad < 0
                   AND EXISTS (SELECT 1 FROM public.movimientos_inventario mi WHERE mi.empresa_id = em.id AND mi.created_at = now()
                                 AND mi.producto_id = sa.producto_id AND sa.almacen_id IN (mi.almacen_origen_id, mi.almacen_destino_id)))
  ) ORDER BY em.nombre) INTO v_rep FROM public.empresas em WHERE em.id = ANY(v_emps);
  v_rep := jsonb_build_object('modo', v_modo, 'perfiles_inexistentes_en_null', v_nulos, 'empresas', v_rep);

  IF v_modo = 'APLICAR' THEN
    RAISE NOTICE 'RECUPERACION APLICADA %', v_rep::text;
  ELSE
    RAISE EXCEPTION 'ENSAYO (se deshizo todo) %', v_rep::text;
  END IF;
END $recup_parte$;
"""


def bloque(n, empresas, payload):
    md5 = hashlib.md5(payload.encode('utf-8')).hexdigest()
    b = (PLANTILLA.replace('__CORTE__', CORTE).replace('__MD5__', md5).replace('__TAG__', TAG)
         .replace('$recup_parte$', f'$recup_parte{n:02d}$'))
    b = b.replace('__PAYLOAD__', payload)  # al final: el payload no se vuelve a tocar
    return f'\n-- Parte {n:02d}: empresas {", ".join(empresas)}\n' + b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--datos', required=True)
    ap.add_argument('--existentes')
    ap.add_argument('--salida', required=True)
    ap.add_argument('--partes-dir')
    ap.add_argument('--max-kb', type=int, default=60, help='tamaño objetivo de datos por parte')
    ap.add_argument('--reducido', action='store_true',
                    help='omite columnas INFORMATIVAS (solo para ensayar; el archivo final debe ir completo)')
    args = ap.parse_args()
    d, ex = cargar(args)
    cols = {t: columnas(d, t) for t in TABLAS}
    por, x = agrupar(d, ex)
    empresas = [e for e in sorted(set(por) | set(x)) if any(por.get(e, {}).get(t) for t in TABLAS)]
    # Partes: empresas completas, agrupadas hasta ~max-kb de datos.
    tam = {e: len(codificar(por[e], cols, x.get(e, {}), args.reducido)) for e in empresas}
    partes, actual, acum = [], [], 0
    for e in sorted(empresas, key=lambda e: -tam[e]):
        if actual and acum + tam[e] > args.max_kb * 1024:
            partes.append(actual); actual, acum = [], 0
        actual.append(e); acum += tam[e]
    if actual:
        partes.append(actual)
    cuerpo, resumen = [], []
    for n, emps in enumerate(partes, 1):
        filas, xx = defaultdict(list), defaultdict(list)
        for e in emps:
            for t in TABLAS:
                filas[t].extend(por[e].get(t, []))
            for t, ids in x.get(e, {}).items():
                xx[t].extend(ids)
        payload = codificar(filas, cols, xx, args.reducido)
        b = bloque(n, emps, payload)
        cuerpo.append(b)
        resumen.append((n, emps, {t: len(filas[t]) for t in TABLAS if filas[t]}, len(b)))
        if args.partes_dir:
            # Mismo código sin comentarios ni sangría (para ensayar parte por parte con menos texto).
            corto = '\n'.join(l.strip() for l in b.split('\n') if l.strip() and not l.strip().startswith('--'))
            with open(f'{args.partes_dir}/parte{n:02d}.sql', 'w', encoding='utf-8') as f:
                f.write(corto + '\n')
    cab = f"""-- Recuperación de lo capturado en la base vieja (Lovable) después del corte del 2026-11-23.
-- GENERADO por scripts/migracion/recuperar_base_vieja.py (no editar a mano: regenerar).
-- Corte = último dato del respaldo: {CORTE}. Destino: proyecto amybkerwkybffllaxpnz (rutapp).
--
-- MODO POR DEFECTO = ENSAYO: cada parte termina con RAISE EXCEPTION y su resumen; no queda nada escrito.
-- APLICAR (solo con «CONFIRMO …» del dueño), en la MISMA sesión:
--     SET rutapp.recuperacion_modo = 'APLICAR';
--   y correr el archivo completo (BEGIN … COMMIT: todo o nada). Cada parte deja su resumen con RAISE NOTICE.
-- Idempotente: solo inserta ids que no existan; correrlo otra vez no duplica.
-- No desactiva triggers ni RLS. Reporte, conflictos y cómo revertir: docs/sql/2026-11-25_recuperar_base_vieja.md
--
"""
    for n, emps, c, size in resumen:
        cab += f'-- Parte {n:02d} ({size // 1024} KB): {", ".join(e[:8] for e in emps)} · ' + ', '.join(f'{t}={k}' for t, k in c.items()) + '\n'
    sql = cab + '\nBEGIN;\n' + ''.join(cuerpo) + '\nCOMMIT;\n'
    with open(args.salida, 'w', encoding='utf-8') as f:
        f.write(sql)
    print(f'{args.salida}: {len(sql)} bytes, {len(partes)} partes', file=sys.stderr)
    for n, emps, c, size in resumen:
        print(n, size, [e[:8] for e in emps], c, file=sys.stderr)


if __name__ == '__main__':
    main()
