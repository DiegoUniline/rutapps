# Recuperación de lo capturado en la base vieja después del corte (2026-11-25)

Estado: **APLICADO 2026-11-25** (`CONFIRMO aplicar recuperación base vieja` del dueño). Ver «Aplicación» al final.

- Archivo a aplicar: `docs/sql/2026-11-25_recuperar_base_vieja.sql` (generado; 6 partes, 439 KB; trae los datos del export).
- Generador: `scripts/migracion/recuperar_base_vieja.py` (el export queda fuera del repo, en el scratchpad de la sesión).
- Bitácora del ensayo en producción: `scripts/migracion/recuperacion/ensayo_prod.md`.
- Diferencias de las ventas anteriores al corte: `scripts/migracion/recuperacion/diferencias_ventas_previas.txt`.
- Corte = último dato del respaldo: 2026-11-23 00:41 UTC. Destino: proyecto `amybkerwkybffllaxpnz`.

## Qué hace el SQL

1. Solo inserta filas cuyo id no existe en la base nueva (idempotente; correrlo dos veces no duplica: probado en
   Postgres local, segunda corrida 0 filas). Orden padre→hijo: clientes → ventas → venta_lineas → cobros →
   cobro_aplicaciones → entregas → entrega_lineas → visitas → gastos.
2. No desactiva triggers ni RLS. El folio lo pone el sistema (`auto_folio_venta` → `next_folio`, `auto_folio_entrega`,
   `auto_codigo_cliente`). Si el folio viejo está libre se conserva; si ya lo usa otra venta de la empresa, se queda el
   nuevo y el viejo va a `notas` («Recuperada de base anterior, folio original X»). `next_folio` se calcula con MAX del
   folio: un ensayo deshecho no consume folios.
3. Inventario por los triggers del sistema (`fn_sync_venta_inventario`, DEFERRED; se disparan con
   `SET CONSTRAINTS ALL IMMEDIATE`). Entregas: se insertan en borrador y pasan a cargado → hecho por los triggers.
4. Sin forzar validaciones:
   - Venta ya recapturada a mano en la nueva (misma empresa y cliente, mismos productos y cantidades, ±1 día, creada
     después del corte) → se omite junto con su cobro y su visita.
   - Cobro a una venta que ya tiene un cobro capturado en la nueva después del corte, o que rechaza
     `fn_validate_cobro_aplicacion_no_excede_saldo` / `fn_validate_cobro_no_sobreaplicado` → conflicto, no se inserta.
   - Entrega de un pedido que ya tiene entrega en la nueva → conflicto.
   - Perfil de vendedor inexistente en la nueva (solo 97806dba, cliente de HOLKAN) → NULL.
5. Sin sesión (`fn_assert_empresa` lo permite sin `auth.uid()`, como `docs/sql/2026-11-23_verificar_d062.sql`).
6. Modo por defecto ENSAYO: termina con RAISE EXCEPTION y el resumen; nada persiste.

## Resultado del ensayo en producción (2026-11-25, todo deshecho)

Verificado antes: todas las referencias existen en la nueva (16 empresas, 327 clientes, 493 productos, 12 almacenes,
27 listas, 16 tarifas, 22 unidades, 10 presentaciones, 25 usuarios, 2 zonas, 78 ventas previas, turno POS) salvo el
perfil 97806dba. El turno POS b3eb486c de La Vaquita sigue **abierto** (requisito de `validar_cobro_pos_turno`).

| Empresa | Clientes | Ventas (total) | Cobros insertados | Visitas | Entregas | Recapturadas omitidas | Conflictos |
|---|---|---|---|---|---|---|---|
| GPO ABARROTERO GAMA | 0 | 20 ($50,657.17) | 16 ($41,924.34) | 20 | 0 | 1 | 1 cobro |
| GLOBAL TRADE LOGISTICS | 1 | 18 pedidos ($41,666.32) | 0 | 18 | 0 | 3 | 56 cobros |
| Quesos y Carnes Frías La Vaquita (POS) | 0 | 47 ($53,515.32; 3 canceladas) | 45 ($51,612.37 + $1,331.44 cancelados) | 0 | 0 | 0 | 0 |
| Distribuidora Dylan | 1 | 26 ($8,654.06) | 26 ($8,654.06) | 26 | 0 | 0 | 0 |
| Super Dulces Trade Enterprice | 0 | 28 ($9,078.40) | 3 ($1,480.70) | 28 | 0 | 4 | 2 cobros |
| MAYAKIL | 0 | 2 ($840) | 2 ($840) | 142 | 0 | 0 | 2 cobros |
| Distribuidora MG | 0 | 1 ($68) | 7 ($1,394) | 0 | 11 (68 renglones) | 0 | 7 entregas |
| CARIOKA SAC | 1 | 1 ($4,805) | 0 | 1 | 0 | 6 | 0 |
| Grupo Imperio | 0 | 2 ($7,270) | 2 ($7,270) | 0 | 0 | 0 | 0 |
| Aguas Madero | 0 | 2 ($713) | 2 ($713) | 2 | 0 | 0 | 0 |
| RubiPets | 0 | 1 ($530) | 1 ($530) | 1 | 0 | 1 | 1 cobro |
| Dulces Jersey | 0 | 0 | 3 ($1,575) | 0 | 0 | 0 | 0 |
| Distribuidora Tampico | 0 | 0 | 0 | 0 | 0 | 0 | 1 cobro |
| DIFASUR | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| DISTRIBUCIONES HOLKAN | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Hielo Villanueva | 0 | 0 | 0 | 0 | 0 | 0 | 0 (1 gasto $390) |
| **Total** | **5** | **148 ($177,797.27)** | **107 ($115,993.47 activos)** | **238** | **11** | **15** | **63 cobros + 7 entregas** |

Cuadre contra el export: 163 ventas nuevas = 148 + 15 recapturadas; 170 cobros = 107 + 63; 18 entregas = 11 + 7;
253 visitas = 238 + 15 de ventas recapturadas.

### Folios reasignados (el viejo ya lo usa otra venta en la nueva; el original queda en notas)
- GAMA VTA-9383..9403 → VTA-9583..9602 · GLOBAL TRADE PED-7693..7712 → PED-7793..7810 y CLI-1216 → CLI-1220
- La Vaquita VTA-2372..2418 → VTA-2426..2472 · Dylan VTA-1466..1491 → VTA-1505..1530 y CLI-0864 → CLI-0873
- Super Dulces VTA-2082..2113 → VTA-2173..2200 · MAYAKIL VTA-1943/1944 → VTA-1958/1959
- MG PED-5049 → PED-5086 y entregas ENT-5075..5091 → ENT-5082..5092 · CARIOKA PED-1046 → PED-1059 y CLI-0337 → CLI-0340
- Aguas Madero VTA-1075/1076 → VTA-1094/1095 · Grupo Imperio VTA-3676/3677 → VTA-3682/3683 · RubiPets VTA-5539 → VTA-5601
- HOLKAN CLI-0001 → CLI-0008
(El número exacto depende del día en que se aplique: se calcula en ese momento.)

### Ventas omitidas por estar recapturadas en la nueva (15)
GAMA VTA-9388 = VTA-9528 · GLOBAL TRADE PED-7692 = PED-7692, PED-7705 = PED-7743, PED-7710 ($44,280) = PED-7792 ·
Super Dulces VTA-2083 = VTA-2090, VTA-2086 = VTA-2085, VTA-2090 = VTA-2087, VTA-2095 = VTA-2136 · CARIOKA PED-1041 = PED-1048,
PED-1042 ($693) = PED-1047 ($684), PED-1043 ($504) = PED-1046 ($486), PED-1044 = PED-1045, PED-1045 = PED-1044,
PED-1047 = PED-1049 · RubiPets VTA-5540 = VTA-5571. Coinciden cliente, productos y cantidades; en CARIOKA el total difiere
(precio distinto). ❓ El dueño confirma que son la misma venta.

### Conflictos (no se insertan; se listan para revisión)
- **Cobros a ventas ya cobradas en la nueva (59):** 56 de GLOBAL TRADE a PED-7564..7667 (cobrados en la nueva el 23-nov
  por el mismo monto, salvo **PED-7576: viejo $680, nueva $420 → posible faltante $260**); MAYAKIL $168 (VTA-1941) y $182
  (VTA-1239); Distribuidora Tampico $6,610.40 a VTA-9430 (en la nueva $10.40 efectivo + $6,600 transferencia);
  RubiPets $650 a VTA-5406 (en la nueva $650 transferencia del 24-nov).
- **Cobros de ventas recapturadas (4):** GAMA $55.90 (VTA-9388); Super Dulces $116.50 y $916.50; GLOBAL TRADE: incluido arriba.
  ❓ Verificar que la venta recapturada tenga su cobro en la nueva.
- **Entregas (7, Distribuidora MG):** ENT-5076..5081 y ENT-5092 viejas para PED-5048..5043 y PED-5032: la nueva ya tiene
  ENT-5075..5081 (cargadas) para esos pedidos.
- Ningún cobro fue rechazado por las validaciones de saldo.

### Efecto en inventario (salidas por las ventas recuperadas)
GAMA Almacén General −1,407 piezas (177 productos, **12 negativos nuevos**) · La Vaquita Ruta 2 −475.285 (36; ya
negativos) · Dylan Almacén General −705 (62; **1 negativo nuevo**) · Super Dulces SD001 K −83, SD002 B −14 · MG Quiche −63
(33; **2 negativos nuevos**; incluye entregas) · MAYAKIL −51 · Aguas Madero −31 (ya negativos) · Grupo Imperio −19 ·
RubiPets −1. GLOBAL TRADE y CARIOKA sin movimiento (pedidos sin entregar). Es la mercancía que sí salió del camión/almacén;
si el inventario se contó físicamente después del corte, ❓ el dueño decide si se ajusta.

### Ventas previas (ya en la nueva) que cambian por los cobros/entregas recuperados
Distribuidora MG PED-5036..5042: confirmado → entregado y saldo → 0 (entregas «hecho» y cobros de la vieja). Dulces Jersey
VTA-2993 saldo $1,750 → $175.

## Diferencias de las 87 ventas anteriores al corte (vieja vs nueva) — solo reporte, no se tocan
Detalle en `scripts/migracion/recuperacion/diferencias_ventas_previas.txt` (comparación del 25-nov; 81 comparadas
automáticamente; 7 no se pudieron leer por campos vacíos y quedaron cubiertas por el ensayo: VTA-9430, VTA-1941, VTA-5406 y 4 más).
- **GLOBAL TRADE (51):** en la vieja se convirtieron a venta directa; en la nueva siguen como pedido. 12 con total distinto
  (p. ej. PED-7593 $18,642 vieja vs $17,922 nueva con cobro de $18,642; PED-7629 $1,350 vs $860; PED-7647 $1,354 vs $982;
  PED-7655 $945 vs $635). PED-7608 borrador→confirmado; PED-7627 y PED-7652 confirmado en la vieja, borrador en la nueva;
  PED-7675 pedido en la vieja y venta directa en la nueva ($1,776 vs $1,752). ❓ Cuál es el bueno lo decide el dueño.
- **Distribuidora MG:** PED-5036..5042 entregados en la vieja (los arregla la recuperación); PED-5032, 5043..5048 con saldo
  distinto (la nueva ya los tiene en 0) y entregas duplicadas listadas arriba.
- **PED-0470:** borrador en la vieja, confirmado en la nueva.

## Cómo aplicar (solo con `CONFIRMO aplicar recuperación base vieja`)
1. Revisar antes las ❓ (recapturas, faltante de PED-7576, inventario).
2. Ensayo total en la misma sesión (SQL Editor o psql), sin persistir:
   `SET rutapp.recuperacion_modo = 'ENSAYO_TOTAL';` + el archivo completo → termina con el resumen de todas las partes.
3. Aplicar: `SET rutapp.recuperacion_modo = 'APLICAR';` + el archivo completo (BEGIN … COMMIT: todo o nada).
4. Efectos colaterales al aplicar: avisos internos («Nueva venta», «Cobro recibido», «Entrega completada») por cada fila
   (`notify_on_*`, `trg_inotif_*`; solo en la app, sin correo ni WhatsApp), historial de ventas/entregas, kardex.

## Cómo revertir
Todo lo insertado conserva el id de la base vieja. Antes de aplicar, guardar la lista de ids (`docs/sql/…sql` la trae
incrustada) y, si hay que revertir, **cancelar** (no borrar) las ventas y cobros recuperados con el flujo del sistema
(cancelación devuelve inventario y saldo), y cancelar las entregas. Borrar físicamente requiere `CONFIRMO` y solo aplica a
filas sin pagos/facturas (D-035). Folios y notas reasignados quedan como evidencia.

## Limitaciones del ensayo (honestidad)
- Para que cupiera en las llamadas, el ensayo en producción usó la versión `--compacto` (sin columnas informativas: notas,
  GPS, descuentos desglosados; ids de renglones/visitas generados; fechas al segundo) y, en 5 empresas, la plantilla sin
  las secciones vacías para ellas. La lógica es la misma; el archivo completo se verificó en Postgres local (mismo
  resultado que la versión compacta, columnas idénticas al export, idempotente).
- Distribuidora MG se ensayó dentro de una parte cuya salida llegó truncada; los conteos clave sí se leyeron.
- El resultado puede cambiar al aplicar si en la nueva se capturan más ventas/cobros de esos días (eso solo aumenta las
  recapturas/conflictos detectados; no duplica).

## Aplicación (2026-11-25)
- Forma: la misma lógica del archivo, cargada en un esquema temporal `recup_tmp` (payload por parte verificado con md5 =
  el del archivo; función con la plantilla del archivo) y ejecutada por parte con `ENSAYO_TOTAL` (todo deshecho) y luego
  `APLICAR`. Probado antes en Postgres local: mismo estado final que el archivo original. `recup_tmp` se borró al terminar.
- Ensayo total previo: idéntico al ensayo anterior salvo folios (GAMA 13 negativos nuevos en vez de 12).
- Resultado aplicado: **148 ventas ($177,797.27)**, 107 cobros ($115,993.47 activos + $1,331.44 cancelados), 238 visitas,
  11 entregas (68 renglones), 5 clientes, 1 gasto. 15 recapturadas omitidas; 63 cobros y 7 entregas en conflicto (no insertados).
- Verificación: segunda corrida por parte = 0 filas en todas las tablas (idempotente); ventas con nota «Recuperada de base
  anterior» = 148 / $177,797.27 por empresa como en la tabla; sin folios duplicados en ventas/entregas ni aplicaciones duplicadas.
- Folios finales: GAMA VTA-9383..9403 → VTA-9588..9607 · GLOBAL TRADE PED-7693..7712 → PED-7801..7818, CLI-1216 → CLI-1222 ·
  La Vaquita VTA-2372..2418 → VTA-2426..2472 · Dylan VTA-1466..1491 → VTA-1514..1539, CLI-0864 → CLI-0878 ·
  Super Dulces VTA-2082..2113 → VTA-2173..2200 · MAYAKIL VTA-1943/1944 → VTA-1958/1959 · MG PED-5049 → PED-5086,
  ENT-5075..5091 → ENT-5082..5092 · CARIOKA PED-1046 → PED-1059, CLI-0337 → CLI-0340 · Aguas Madero VTA-1075/1076 →
  VTA-1094/1095 · Grupo Imperio VTA-3676/3677 → VTA-3682/3683 · RubiPets VTA-5539 → VTA-5601 · HOLKAN CLI-0001 → CLI-0009.
- Pendiente: export nuevo de la base vieja para lo capturado después de 2026-11-24 18:25 (misma consulta; carga idempotente)
  y las ❓ del dueño (recapturas, PED-7576 $260, inventario negativo, diferencias previas de GLOBAL TRADE).

## Segunda carga (2026-11-25, export de las 08:49)
- El export nuevo solo trae 5 pedidos más de GLOBAL TRADE (capturados 2026-11-24 21:43–21:48 CDMX) con sus 5 visitas; nada
  más nuevo ni cambiado. Mismo generador con `--existentes` leído de producción; plantilla idéntica a la aplicada.
- Ensayo total: solo esos 5 entran; recapturas y conflictos iguales que en la primera carga. Aplicado:
  PED-7713..7717 → **PED-7823..7827** ($1,081, $1,260, $950, $10,224 confirmados; $1,684.24 borrador; total $15,199.24).
- Verificado: segunda corrida 0 filas, sin folios duplicados. `recup_tmp` borrado.

## Tercera carga (2026-11-27, export de las 09:59)
- Nuevo en la vieja: Dylan — Rodrigo CEL. 50549871, 26-nov 18:25–19:42, 11 ventas $9,672.38 con 11 cobros, 11 visitas y 5 clientes;
  Super Dulces — Brandon Rangel, 25-nov, 1 venta $206.70; Dofa — Jesus Camacho, 25-nov, 1 venta $94.
- Se cargó solo lo nuevo (mismo generador y misma función verificada por md5). Producto «Galleta chiky 14u» (alta en la vieja tras el corte,
  91f637bb) → «galleta chiky 14 u» de la nueva (e7100f94, código 621, mismo precio $22.50).
- Aplicado: Dylan VTA-1492..1502 → **VTA-1611..1621**, CLI-0865..0869 → CLI-0902..0906; Super Dulces VTA-2114 → **VTA-2329**.
  Dofa VTA-1951 ya estaba recapturada en la nueva (VTA-1986): omitida junto con su cobro.
- Verificado: segunda corrida 0 filas; sin folios duplicados; Rodrigo con 11 ventas fecha 26-nov saldo 0. `recup_tmp` borrado.
- Causa: el celular de Rodrigo tiene instalada también la app vieja y el 26 capturó en ella.
