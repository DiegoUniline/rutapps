# Visión — Caja Chica
**Fecha:** 2026-11-10 · **Certeza general:** ✅ confirmado por el dueño salvo donde se indica

## Qué es
App web para celular que registra cada gasto de la caja chica del restaurante, con comprobante, y muestra en todo momento cuánto queda del fondo. ✅ (P-001, P-004)

## Para quién
| Rol | Qué hace | Certeza |
|---|---|---|
| Dueño | Ve todo, cancela gastos, cambia el fondo y las categorías, recibe avisos | ✅ P-002 |
| Cajero | Registra gastos y edita los suyos del mismo día | ✅ P-002 |

## Alcance
- Un solo negocio, una sola caja (no multiempresa, no sucursales). ✅ P-001
- Fondo fijo de $3,000; aviso cuando baje de $500. ✅ P-003, D-022
- Uso principal desde celular. ✅ P-004
- Tecnología: Supabase + app web (PWA). ✅ P-006

## Problema que resuelve
"No sé en qué se va el dinero ni quién lo gastó." ✅ P-005

## Fuera de alcance v1
- Reposición del fondo con su propio registro (⏭️ después)
- Reporte mensual en Excel (⏭️ después)
- Varias cajas o sucursales (❌)
- Facturación / deducibilidad automática (❌)
