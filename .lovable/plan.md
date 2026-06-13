Mostrar siempre **"Iniciar sesión"** en el header móvil de la landing, junto al botón "Probar".

## Cambio único

Archivo: `src/pages/LandingPage.tsx` (línea ~248)

Añadir el link `/login` también en la versión móvil del header — antes del botón "Probar":

```tsx
<div className="flex md:hidden items-center gap-1.5">
  <Link to="/login" className="px-2.5 py-1 text-xs font-medium" style={{ color: BRAND.ink2 }}>
    Entrar
  </Link>
  <Link to="/signup" className="px-2.5 py-1 text-xs font-semibold text-white rounded" style={{ background: BRAND.ink }}>
    Probar
  </Link>
  <button onClick={() => setMobileMenu(!mobileMenu)} className="p-1.5" aria-label="Menú">
    {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
  </button>
</div>
```

Uso de "Entrar" en lugar de "Iniciar sesión" en móvil para que el header no se rompa con el logo + hamburguesa. Sigue siendo claro y siempre visible. En desktop ya está visible "Iniciar sesión", no cambia.
