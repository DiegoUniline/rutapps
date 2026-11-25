# Ensayo en producción (amybkerwkybffllaxpnz) — bitácora de partes

Generado con `--compacto --max-kb 38` (5 partes; ids de hojas generados, fechas al segundo; mismo resultado que el
archivo completo en el ensayo local). Cada parte se corrió en modo ENSAYO (termina en RAISE EXCEPTION: nada persiste).

## Parte 05 — 2026-11-25 · md5 OK · se deshizo
Empresas: Aguas Madero (e5846b60), CARIOKA SAC (7b96979b), DIFASUR (ceddb9bd), DISTRIBUCIONES HOLKAN (170a7f5c),
Distribuidora Tampico (41cdb6df), Dulces Jersey (27d242e0), Grupo Imperio (c80ffbd9), Hielo Villanueva (281abd1b), RubiPets (66ac277d).

| Empresa | Clientes | Ventas (total) | Cobros (monto) | Visitas | Gastos | Folios reasignados | Recapturadas omitidas | Conflictos |
|---|---|---|---|---|---|---|---|---|
| Aguas Madero | 0 | 2 ($713) | 2 ($713) | 2 | 0 | VTA-1075→VTA-1094, VTA-1076→VTA-1095 | 0 | 0 |
| CARIOKA SAC | 1 | 1 ($4,805) | 0 | 1 | 0 | CLI-0337→CLI-0340, PED-1046→PED-1059 | 6 (PED-1041..1045, PED-1047 ya recapturados en la nueva) | 0 |
| DIFASUR | 1 | 0 | 0 | 0 | 0 | — | 0 | 0 |
| DISTRIBUCIONES HOLKAN | 1 | 0 | 0 | 0 | 0 | CLI-0001→CLI-0008 | 0 | 0 |
| Distribuidora Tampico | 0 | 0 | 0 (1 conflicto $6,610.40) | 0 | 0 | — | 0 | cobro $6,610.40 a VTA-9430: ya cobrada en la nueva ($10.40 efectivo + $6,600 transferencia) |
| Dulces Jersey | 0 | 0 | 3 ($1,575) | 0 | 0 | — | 0 | 0 · VTA-2993 saldo 1750→175 |
| Grupo Imperio | 0 | 2 ($7,270) | 2 ($7,270) | 0 | 0 | VTA-3676→VTA-3682, VTA-3677→VTA-3683 | 0 | 0 |
| Hielo Villanueva | 0 | 0 | 0 | 0 | 1 | — | 0 | 0 |
| RubiPets | 0 | 1 ($530) | 1 ($530) | 1 | 0 | VTA-5539→VTA-5601 | 1 (VTA-5540 = VTA-5571 nueva) | cobro $650 a VTA-5406: ya cobrada en la nueva ($650 transferencia 24-nov) |

Inventario: Aguas Madero −31 piezas (6 productos, ya negativos antes), Grupo Imperio −19 (5 productos), RubiPets −1. Sin negativos nuevos.
Perfil inexistente 97806dba (vendedor/cobrador del cliente de HOLKAN) → NULL.

## Parte 04 — 2026-11-25 · md5 OK · se deshizo (salida truncada a la mitad por la herramienta; se repite al final con reporte compacto)
Empresas: Distribuidora MG (2deead6d), 0f476f87, f8bc6fdc.
- Distribuidora MG: 1 venta (PED-5049→PED-5086, $68), 7 cobros ($1,394), 11 entregas insertadas (68 renglones), 7 entregas en
  conflicto «pedido_ya_tiene_entrega_en_nueva» (ENT-5076..5081 y 5092 viejas = ENT-5075..5081 ya capturadas en la nueva para
  PED-5048..5043 y PED-5032), folios ENT reasignados (ENT-5075→5082 … ENT-5091→5092), inventario almacén Quiche −63
  (33 productos, 2 negativos nuevos), pedidos previos PED-5037..5042 confirmado→entregado con saldo→0.
- f8bc6fdc: 4 ventas recapturadas omitidas (VTA-2083=VTA-2090, VTA-2086=VTA-2085, VTA-2090=VTA-2087, VTA-2095=VTA-2136),
  folios VTA-2082..2113 ya usados en la nueva → reasignados a VTA-2175..2200 (folio viejo en notas), 79 movimientos de inventario.

## Parte 01 — 2026-11-25 · md5 OK · se deshizo
GPO ABARROTERO GAMA (5d2d9498): 20 ventas ($50,657.17, saldo $8,732.83, 243 renglones), 16 cobros ($41,924.34), 20 visitas.
Folios VTA-9383..9403 ya usados en la nueva → VTA-9583..9602 (folio viejo en notas). Recapturada omitida: VTA-9388 $55.90
= VTA-9528 nueva (24-nov); su cobro $55.90 queda como conflicto «venta_recapturada_en_nueva». Inventario Almacén General
−1,407 piezas en 177 productos; 12 negativos nuevos (13 en total). 243 movimientos de inventario.

## Parte 02 — 2026-11-25 · md5 OK · se deshizo
GLOBAL TRADE LOGISTICS (49d2b8d2): 1 cliente (CLI-1216→CLI-1220), 18 pedidos ($41,666.32; 17 confirmados + 1 borrador; sin
entrega → sin movimiento de inventario), 118 renglones, 18 visitas. Folios PED-7693..7712 ya usados → PED-7793..7810.
Recapturados omitidos: PED-7692 (= PED-7692 nueva, mismo total), PED-7705 (= PED-7743), PED-7710 $44,280 (= PED-7792).
Cobros: 0 insertados; los 56 cobros viejos del 22-nov (todos a pedidos anteriores al corte PED-7564..7667) ya se capturaron
en la nueva el 23-nov con el mismo monto → conflicto «venta_ya_cobrada_en_nueva». Única diferencia de monto: cobro f8115271
$680 a PED-7576, en la nueva solo hay $420 (posible faltante de $260: revisar con el dueño).

## Parte 03 (regenerada con --max-kb 12: una empresa por parte) — 2026-11-25 · md5 OK · se deshizo
Para que cupiera en una llamada se transcribió la plantilla sin las secciones vacías para esta empresa (clientes, entregas,
visitas, gastos, revisión multiempresa); la lógica de ventas, renglones y cobros es la misma del generador.
Quesos y Carnes Frías La Vaquita (ebebc168, POS): 47 ventas ($53,515.32; 44 confirmadas + 3 canceladas; saldo $571.51 =
VTA-2410 $393.51 + VTA-2413 $178 sin cobro), 135 renglones, 45 cobros POS aceptados ($51,612.37 activos + $1,331.44
cancelados; el turno POS b3eb486c sigue abierto en la nueva). Folios VTA-2372..2418 ya usados → VTA-2426..2472.
Sin recapturas ni conflictos. Inventario almacén «Ruta 2» −475.285 (36 productos; 35 ya negativos, 0 nuevos). 130 movimientos.
