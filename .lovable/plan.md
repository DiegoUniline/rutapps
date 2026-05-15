## 🧪 Sandbox para Partners

Cada partner aprobado tendrá UNA empresa sandbox **permanente**, **vacía** y con **límites duros**. La idea: que pueda probar todo, dar demos y soporte, pero nunca usarla como sistema productivo.

### 1. Base de datos (`supabase/migrations/...`)

**Cambios al esquema:**
- `empresas`: agregar `is_partner_sandbox boolean DEFAULT false` + `partner_owner_id uuid REFERENCES partners(id)`
- `partners`: agregar `sandbox_empresa_id uuid REFERENCES empresas(id)` (cache rápido)
- Índice parcial en `empresas(partner_owner_id) WHERE is_partner_sandbox`

**Triggers de límite (bloquean inserts cuando se excede):**

| Tabla | Límite | Mensaje |
|---|---|---|
| `clientes` | 10 | "Sandbox limitado a 10 clientes. Para más, tu prospecto necesita su propia cuenta." |
| `productos` | 20 | "Sandbox limitado a 20 productos." |
| `ventas` | 50 | "Sandbox limitado a 50 ventas. Borra ventas viejas o usa una cuenta real." |
| `compras` | 20 | "Sandbox limitado a 20 compras." |
| `profiles` (mismo empresa_id) | 1 | "El sandbox solo permite 1 usuario (tú)." |
| `almacenes` | 2 | "Sandbox limitado a 2 almacenes." |

Cada trigger verifica `is_partner_sandbox = true` antes de aplicar el límite — las empresas normales no se ven afectadas.

**Bloqueos absolutos (vía triggers BEFORE INSERT):**
- `cfdis` → bloquear si empresa es sandbox ("Facturación CFDI no disponible en Sandbox")
- `wa_messages` / envíos masivos WhatsApp → bloquear
- `listas` con `es_publica = true` → bloquear (no pueden compartir catálogo público)

**Función `create_partner_sandbox(p_partner_id uuid)`:**
- Crea `empresa` marcada como `is_partner_sandbox = true`
- Crea `subscription` con `es_manual = true, status = 'active'` (sin cobros)
- Guarda `partner_owner_id` y actualiza `partners.sandbox_empresa_id`
- Llama al trigger `auto_create_empresa_basics` (genera tarifa + lista General por defecto)
- NO siembra datos (vacío, como pediste)

### 2. Edge Function `partner-sandbox-login`

Reutiliza el patrón de `demo-login` pero **persistente**:
1. Verifica que el usuario autenticado sea un `partner` activo
2. Si `partners.sandbox_empresa_id` es null → crea sandbox + auth user con email `sandbox-{ref_slug}@sandbox.rutapp.mx`
3. Genera un `signInWithOtp` mágico → devuelve URL de sesión al frontend
4. Al regresar al partner panel, el botón siempre funciona (reutiliza la misma empresa)

### 3. UI Partner (`/partner`)

**`PartnerDashboard.tsx`:**
- Card destacada nueva arriba: **"🧪 Tu Sandbox"** con botón **"Abrir Sandbox"** y texto: *"Empresa de pruebas con tus datos reales nunca mezclados. Úsala para demos y aprender el sistema."*
- Muestra contadores actuales: `3/10 clientes • 7/20 productos • 12/50 ventas`

**`PartnersLandingPage.tsx`:**
- Nueva sección "Pruébalo antes de promocionarlo": *"Al aprobarte como partner, recibes un sandbox personal con todo el sistema desbloqueado (límite 10 clientes / 20 productos / 50 ventas) para que conozcas Rutapp de adentro."*

### 4. Banner global en sandbox

Componente `<SandboxBanner />` montado en `AppLayout` cuando `empresa.is_partner_sandbox`:
- Barra naranja sticky arriba: `🧪 Modo Sandbox Partner — Datos de prueba | 3/10 clientes • 7/20 productos`
- Botón "Volver al Panel Partner" que cierra sesión sandbox y regresa a `/partner`

### 5. Bloqueo en hooks de upgrade

En `useSuscripcion`, `BillingPage`, intentos de pago Stripe/OpenPay → si `is_partner_sandbox` muestra: *"El sandbox no admite suscripción. Sirve solo para pruebas."*

---

### Archivos a crear/editar

```text
NUEVO  supabase/migrations/{timestamp}_partner_sandbox.sql
NUEVO  supabase/functions/partner-sandbox-login/index.ts
NUEVO  src/components/SandboxBanner.tsx
EDIT   src/pages/partner/PartnerDashboard.tsx  (card Sandbox + contadores)
EDIT   src/pages/PartnersLandingPage.tsx      (sección "Pruébalo")
EDIT   src/layouts/AppLayout.tsx               (montar SandboxBanner)
EDIT   src/pages/BillingPage.tsx               (bloquear upgrade si sandbox)
```

---

### ⚠️ Una decisión clave que necesito confirmar

El partner ya tiene su cuenta auth para `/partner`. Para entrar al sandbox hay dos opciones:

**A) Cuenta auth separada para el sandbox** (recomendado)
- Email autogenerado `sandbox-{slug}@sandbox.rutapp.mx`
- Login mágico desde el botón "Abrir Sandbox"
- Nunca mezcla con su empresa real si algún día compra Rutapp

**B) Misma cuenta auth, dos empresas**
- Switch de empresa en el sidebar
- Requiere refactor mayor del sistema (hoy es 1 user → 1 empresa)

Voy con **A** salvo que digas lo contrario. ¿Apruebo y aplico?