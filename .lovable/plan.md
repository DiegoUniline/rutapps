# Plan: Sitio de marketing Rutapp (aplicado a /landing-nueva)

## Alcance
Transformar `/landing-nueva` en un sitio de marketing completo con SEO real, páginas por giro y CTA WhatsApp. La app actual sigue funcionando en sus rutas normales.

## Cambios estructurales

### 1. SEO base
- Instalar `react-helmet-async` y envolver el app en `HelmetProvider` (en `src/main.tsx`).
- Crear componente `<SEO />` reutilizable (title, description, OG, Twitter, canonical, JSON-LD opcional).
- Agregar JSON-LD: SoftwareApplication + Organization en home; FAQPage en home y giros.
- Generar `public/robots.txt` y `scripts/generate-sitemap.ts` (predev/prebuild) con todas las rutas marketing.

### 2. Rutas nuevas (todas públicas, indexables)
- `/landing-nueva` → Home rediseñada (queda como la landing oficial nueva)
- `/landing-nueva/giros` → índice de giros
- `/landing-nueva/giros/distribuidoras-de-abarrotes`
- `/landing-nueva/giros/refresqueras-y-bebidas`
- `/landing-nueva/giros/panaderias-y-reparto`
- `/landing-nueva/giros/productos-de-limpieza`
- `/landing-nueva/giros/lacteos-y-cremerias`
- `/landing-nueva/giros/botanas-y-dulces`
- `/landing-nueva/giros/agua-purificada`
- `/landing-nueva/precios`

Nota: las rutas viven bajo `/landing-nueva/*` para no chocar con la app actual. Cuando el usuario decida reemplazar la landing oficial, se promueven a raíz.

### 3. Home reordenada según spec
Orden: Navbar sticky → Hero (H1 de resultado + CTA WhatsApp + Probar gratis) → Barra de prueba social → Problema/Solución → Cómo funciona en 3 pasos → Beneficios → Diferenciadores → Testimonios → Precios (3 planes, toggle mensual/anual, "Recomendado" al centro) → FAQ (acordeón + JSON-LD) → CTA final → Footer.

Mantengo lo que ya brilla: hero con foto real del vendedor, animaciones framer-motion, multi-currency en precios, sección WhatsApp animada, mockups del sistema. Reorganizo para que el orden sea exactamente el del brief.

### 4. CTA WhatsApp global
- Helper `waLink(message)` que construye `https://wa.me/52XXXXXXXXXX?text=...` con placeholder `XXXXXXXXXX` definido en `src/lib/marketing.ts` (un solo lugar para cambiar el número).
- Botón flotante WhatsApp en mobile.

### 5. Plantilla de giro
- `src/components/landing/GiroTemplate.tsx` parametrizada: hero específico, 3 dolores, beneficios mapeados, prueba social, FAQ corto, CTA WhatsApp.
- 7 archivos delgados en `src/pages/landing/giros/` que solo pasan props.

### 6. Página /precios
Extrae la sección de precios actual, agrega comparativa y FAQ de pricing.

### 7. Página /giros índice
Grid con los 7 giros + CTA.

## Detalles técnicos
- Stack ya es React + Vite + Tailwind ✓
- Imágenes existentes ya son `.jpg/.webp` con lazy loading.
- Paleta: respeto la marca actual (azul Rutapp + naranja), no cambio a #1a1a2e porque viola la memoria de marca del proyecto. Si el usuario lo quiere oscuro a fuerza, lo aplico después.
- Sin formularios: CTAs van a WhatsApp y a `/auth` (alta existente = "1 paso").
- Sitemap incluye home actual `/`, `/landing-nueva` y todas las páginas marketing.

## Fuera de alcance
- No toco la app (auth, dashboard, módulos).
- No reemplazo la home `/` actual sin confirmación; la nueva sigue en `/landing-nueva/*`.
- Número de WhatsApp queda como placeholder hasta que lo pases.

## Confirmaciones rápidas
1. ¿Mantengo paleta azul/naranja Rutapp o forzo el `#1a1a2e` oscuro del brief?
2. Número de WhatsApp real (si no, dejo `52XXXXXXXXXX`).
3. ¿Confirmas que las páginas vivan bajo `/landing-nueva/*` por ahora?
