# Rebanadas

| Rebanada | Historias | Estado |
|---|---|---|
| R1 · Control de gastos | H-01 a H-06 | 🔨 en construcción (APROBADO 2026-11-12) |
| R2 · Reposición y reporte mensual | H-07 + Excel mensual | ⏭️ después |

## R1 · Control de gastos
### Impacto
- Afecta: nada previo (primera rebanada).
- Prepara para R2: `configuracion.fondo` y el cálculo de saldo en función SQL, para que la reposición solo sume un movimiento.
- Qué pasa si (cruce): si en R2 se registra reposición, el aviso de saldo bajo debe reiniciarse → se dejó `alerta_enviada` en configuración (D-030).

### Demo y aprendizajes
- (pendiente: después de OT-007)
