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
