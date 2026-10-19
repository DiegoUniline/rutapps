---
name: investigacion-giro
description: Investigar a fondo un giro de negocio en la web antes de entrevistar al dueño (procesos, documentos, regulación, términos, dolores, software líder, volúmenes) para hacer mejores preguntas y propuestas. Úsala al iniciar el diseño de cualquier sistema nuevo o cuando aparezca un giro/proceso que no dominas.
---

# Investigación del giro

## Objetivo
Llegar a la entrevista sabiendo tanto del giro como un consultor con años en él, para:
- Saber qué preguntar y en qué orden.
- Detectar casos borde que el dueño no menciona.
- Proponer con fundamento.
Lo investigado NO decide nada: todo queda 🟡 hasta que el dueño lo confirme para SU negocio.

## Qué investigar (8–20 búsquedas, separadas por tema)
1. **Operación**: cómo funciona un día típico, roles, flujo del cliente de punta a punta.
2. **Documentos**: formatos, tickets, contratos, órdenes, reportes que usa el giro.
3. **Dinero**: modelos de cobro, anticipos, crédito, comisiones, propinas, tarifas variables, temporadas.
4. **Regulación**: México (SAT/CFDI, NOMs, COFEPRIS, PROFECO, SCT, protección de datos LFPDPPP, lo que aplique) y el país del cliente si es otro. Registros obligatorios y tiempos de conservación.
5. **Términos**: glosario del giro (palabras que el dueño usará).
6. **Software líder**: 3–5 sistemas del giro (México/LatAm e internacionales): módulos que ofrecen, precios, y QUÉ SE QUEJAN los usuarios (reseñas, foros). Las quejas son oportunidades.
7. **Dolores frecuentes**: errores, fugas de dinero, fraudes internos, problemas de inventario/agenda típicos del giro.
8. **Volúmenes**: tamaño típico de negocio, transacciones por día, número de productos/clientes/unidades, picos (temporadas, horas).
9. **Integraciones típicas**: pagos, delivery, WhatsApp, básculas, impresoras, GPS, aseguradoras, etc.

## Reglas
- Fuentes primero oficiales (gobierno, cámaras del sector, documentación de software), luego blogs/reseñas.
- Cada dato con su fuente. Parafrasea, no copies textos.
- Si algo varía por país o tamaño de negocio, dilo.
- Si no hay acceso a web: avisa en una línea y usa conocimiento general marcado 🟡 "sin verificar".
- No más de lo útil: el documento sirve para entrevistar y proponer, no es una tesis.

## Salida: /docs/investigacion-giro.md
```
# Investigación: <giro> — <fecha>

## Resumen (5 líneas)
## Cómo opera (flujo típico)
## Roles
## Documentos y formatos
## Dinero
## Regulación aplicable
| Norma | Qué exige | Impacto en datos | Fuente |
## Glosario
| Término | Significado |
## Software líder
| Sistema | Fuerte en | Quejas frecuentes | Precio aprox | Fuente |
## Dolores frecuentes → oportunidad
## Volúmenes típicos (para escalabilidad)
## Integraciones típicas
## Preguntas que esto me genera para el dueño
(lista interna; se hacen una por una)
## Fuentes
```
Después: copia términos a /docs/glosario.md (🟡), registra en /docs/bitacora.md y actualiza /docs/00-estado.md.
