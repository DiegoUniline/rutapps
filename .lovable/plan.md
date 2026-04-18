
Objetivo: corregir que, al recargar `/ventas/mapa-clientes`, la optimización guardada siga viéndose por ruta/color y no “todo parejo”.

1. Hallazgo confirmado
- El problema no es solo visual: la tabla `cliente_orden_ruta` de tu empresa demo tiene rutas por vendedor guardadas, pero también quedaron filas antiguas con `vendedor_id = null`.
- En `MapaClientesPage.tsx`, cuando existe `multiResults`, el mapa sigue renderizando también los marcadores base (`withGps`) después del overlay multirruta. Esos marcadores genéricos tapan los marcadores por color de ruta.
- Además, al guardar multirruta, `persistOrder()` borra por vendedor individual, así que no limpia órdenes previas “globales” y deja basura mezclada para la restauración.

2. Cambios a implementar
- Ajustar el render del mapa para que, si `multiResults` está activo, no se rendericen los marcadores/clusters genéricos ni los numerados base.
- Corregir la persistencia de multirruta:
  - antes de insertar nuevas rutas aplicadas, borrar todo el scope actual (`empresa_id + dia`) cuando el guardado sea multirruta global;
  - evitar que queden filas viejas con `vendedor_id = null`.
- Endurecer la restauración desde `savedOrder`:
  - reconstruir solo la vista multirruta cuando existan varios grupos reales;
  - ignorar/normalizar grupos residuales inconsistentes si coexistieran filas globales y por vendedor.
- Revisar dependencias del `useEffect` que restaura la vista para que la reconstrucción sea estable también cuando `vendedores` termina de cargar después.

3. Archivo principal a tocar
- `src/pages/MapaClientesPage.tsx`

4. Resultado esperado
- Después de “Aplicar cambios”, al recargar:
  - seguirás viendo cada ruta con su propio color;
  - no aparecerá la capa genérica encima;
  - no se mezclarán rutas viejas con nuevas;
  - la vista restaurada coincidirá con lo que guardaste.

5. Verificación que haré al implementarlo
- Optimizar varias rutas.
- Aplicar cambios.
- Recargar la página.
- Confirmar que:
  - se conserva el panel multirruta;
  - los marcadores siguen separados por color/vendedor;
  - no reaparece una ruta global azul/morada encima;
  - la base de datos queda con un solo conjunto consistente de órdenes para ese día.

Detalle técnico
- Causa visual: `multiResults` y los marcadores base se renderizan al mismo tiempo.
- Causa de datos: `persistOrder()` no limpia completamente el scope cuando se guarda una optimización multirruta.
- En esta iteración no hace falta tocar la edge function `optimize-route`; el bug está en restauración/render/persistencia del frontend.
