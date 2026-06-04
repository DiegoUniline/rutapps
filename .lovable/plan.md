## Objetivo

Mostrar el selector de plan (Individual / Equipo / Empresa) en `/signup`, en lugar de obligar al usuario a elegirlo recién en `/completar-registro`. La selección hecha en signup se pasa a la siguiente pantalla para que llegue ya preseleccionada al checkout de Stripe.

## Alcance (solo UI/flow, sin tocar backend)

### 1. `src/pages/SignupPage.tsx`
- Cargar `subscription_plans` activos (campos: id, slug, nombre, precio_base, usuarios_incluidos, precio_extra_usuario, popular, ideal_para, orden) en un `useEffect`.
- Agregar un nuevo bloque "Elige tu plan" arriba del bloque "Cómo funciona el cobro", con 3 tarjetas (una por plan) en grid responsive (1 col móvil, 3 cols desktop):
  - Nombre, "ideal para", precio base, usuarios incluidos, badge "Más popular" en Equipo.
  - Tarjeta seleccionada con borde primary + check.
- Estado `selectedPlanSlug`:
  - Inicial = `searchParams.get('plan')` → si no, el plan `popular` → si no, el primero.
  - Mantener URL sincronizada (`setSearchParams({ plan: slug })`, preservando otros params como `ref`/`cupon`).
- Texto explicativo del bloque "Cómo funciona el cobro": cambiar para que refleje dinámicamente el plan elegido (precio base + extras a $300/usuario), en lugar del texto genérico actual.
- Al hacer submit exitoso, antes de `navigate(...)`:
  - Guardar `localStorage.setItem('rutapp_selected_plan', selectedPlanSlug)`.
  - Redirigir a `/completar-registro?plan=<slug>` (en vez de sin query).

### 2. `src/pages/CompletarRegistroPage.tsx`
- En el `useEffect` de preselección, si no hay `?plan=` en URL, leer `localStorage.getItem('rutapp_selected_plan')` como fallback antes de caer al `popular`.
- Limpiar la key de localStorage cuando se complete el checkout (después de `navigate` a Stripe) — opcional, no bloqueante.

### 3. Sin cambios en
- Edge functions (`select-plan`, `create-trial-checkout`).
- Base de datos.
- `LandingPage` (ya pasa `?plan=slug` al signup, sigue funcionando).

## Notas técnicas
- Mantener tokens semánticos (primary/foreground) — sin colores hardcoded.
- En móvil, el grid de 3 planes debe quedar apilado y compacto para no inflar mucho el formulario.
- El selector debe respetar el mismo estilo visual del card actual (rounded, shadow sutil) para no romper la jerarquía del formulario.

## Resultado esperado
El usuario ve y elige plan en `/signup`. Cuando llega a `/completar-registro`, su plan ya viene seleccionado y solo tiene que ajustar usuarios (si quiere) y capturar tarjeta.
