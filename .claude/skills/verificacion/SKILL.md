---
name: verificacion
description: Cómo comprobar con evidencia que un cambio funciona antes de decir "listo" (build, tipos, BD, RLS, flujo, regresión). Úsala al terminar cualquier cambio o al revisar trabajo de otro agente.
---

# Verificación

"Debería funcionar" no es verificación. Cada punto se reporta con la evidencia (salida del comando, resultado de la consulta, captura del flujo).

## Checklist según lo que cambió
| Cambió | Verifica |
|---|---|
| Código TS/React | `npm run build` (o el script del proyecto) sin errores; `npx tsc --noEmit` si existe; lint si el proyecto lo usa |
| BD | migración corre en local/rama; consulta de verificación; tipos regenerados; datos existentes intactos (conteos antes/después) |
| RLS / permisos | prueba con usuario de otra empresa y con rol sin permiso (skill `rls-multiempresa`) |
| Proceso con dinero | caso normal + caso borde (parcial, cancelación, redondeo) con números concretos que cuadren |
| Formulario | obligatorios, formatos, duplicado, error de red; que la BD rechace lo que el front rechaza |
| Apps Script | ejecutar función sobre datos de prueba; revisar log; tiempo de ejecución |
| AppSheet | probar con usuario de cada rol; security filter; bots disparados |
| Edge function | invocar con token de usuario real de prueba; respuesta y logs |

## Regresión
Identifica qué más usa lo que cambiaste (grep de referencias) y prueba al menos un flujo de cada uso.

## Datos
- Nunca verifiques escribiendo en datos reales de producción.
- Usa transacción con ROLLBACK, rama de Supabase, BD local o registros de prueba marcados.

## Reporte
```
Verificado:
- build ✅ (0 errores)
- migración ✅ local; clientes antes 1,240 / después 1,240
- RLS ✅ usuario empresa B → 0 filas
- alta con factura ✅ / sin factura ✅ / RFC inválido rechazado por BD ✅
No verificado: impresión de ticket (sin impresora en este entorno)
```
Lo no verificado se dice siempre.
