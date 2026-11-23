/**
 * Translates technical errors into human-readable Spanish messages.
 */

interface ErrorExplanation {
  title: string;
  message: string;
  suggestion: string;
  icon: 'network' | 'auth' | 'server' | 'data' | 'permission' | 'generic';
}

const patterns: Array<{ test: RegExp | ((msg: string) => boolean); result: ErrorExplanation }> = [
  // Registro / inicio de sesión (mensajes de Supabase Auth en inglés)
  {
    test: /user already registered|already been registered|email.*already.*(registered|exists|in use)/i,
    result: {
      title: 'Correo ya registrado',
      message: 'Ya existe una cuenta con este correo electrónico.',
      suggestion: 'Inicia sesión con ese correo o usa «¿Olvidaste tu contraseña?».',
      icon: 'auth',
    },
  },
  {
    test: /empresas_telefono_unique/i,
    result: {
      title: 'Teléfono ya registrado',
      message: 'Ya existe una empresa registrada con este número de teléfono.',
      suggestion: 'Usa otro número o inicia sesión con la cuenta que ya tiene ese teléfono.',
      icon: 'data',
    },
  },
  {
    test: /database error saving new user/i,
    result: {
      title: 'No se pudo crear la cuenta',
      message: 'El correo o el teléfono ya están registrados en otra cuenta, o algún dato no es válido.',
      suggestion: 'Revisa correo y teléfono. Si ya tienes cuenta, inicia sesión.',
      icon: 'auth',
    },
  },
  {
    test: /invalid login credentials/i,
    result: {
      title: 'Correo o contraseña incorrectos',
      message: 'El correo o la contraseña no coinciden con ninguna cuenta.',
      suggestion: 'Revisa que estén bien escritos. Si no recuerdas la contraseña, usa «¿Olvidaste tu contraseña?».',
      icon: 'auth',
    },
  },
  {
    test: /email not confirmed/i,
    result: {
      title: 'Correo sin confirmar',
      message: 'Tu cuenta existe, pero el correo todavía no se ha confirmado.',
      suggestion: 'Abre el correo de confirmación que te enviamos (revisa spam) y vuelve a intentarlo.',
      icon: 'auth',
    },
  },
  {
    test: /password should be at least|weak password/i,
    result: {
      title: 'Contraseña muy corta',
      message: 'La contraseña no cumple el mínimo de caracteres.',
      suggestion: 'Usa al menos 6 caracteres.',
      icon: 'auth',
    },
  },
  // Network / connectivity
  {
    test: /fetch|network|failed to fetch|net::err|load failed|cors|aborted|timeout/i,
    result: {
      title: 'No pudimos conectar con el servidor',
      message: 'Tu internet parece estar bien, pero no logramos comunicarnos con nuestro servicio. Esto puede pasar por un firewall, red corporativa, VPN, antivirus, o una caída temporal del servicio.',
      suggestion: 'Intenta de nuevo en 30 segundos. Si sigue fallando: prueba con datos móviles, desactiva VPN/antivirus, o usa otra red. Si nada funciona, contáctanos por WhatsApp.',
      icon: 'network',
    },
  },
  // Edge function errors
  {
    test: /edge function|non-2xx|function.*returned|functions\/v1/i,
    result: {
      title: 'Servicio temporalmente no disponible',
      message: 'Uno de nuestros servicios internos no respondió correctamente. Esto suele resolverse automáticamente.',
      suggestion: 'Espera unos segundos y vuelve a intentarlo. Si persiste, contacta soporte.',
      icon: 'server',
    },
  },
  // Auth errors
  {
    test: /invalid login|invalid.*credential|email.*confirm|not.*authorized|signup.*disabled|email.*taken|already.*registered/i,
    result: {
      title: 'Error de autenticación',
      message: 'Hubo un problema al verificar tu identidad. Las credenciales podrían ser incorrectas o tu cuenta necesita verificación.',
      suggestion: 'Revisa tu email y contraseña. Si acabas de registrarte, verifica tu correo electrónico.',
      icon: 'auth',
    },
  },
  {
    test: /jwt|token.*expired|refresh.*token|session.*expired/i,
    result: {
      title: 'Sesión expirada',
      message: 'Tu sesión ha expirado por seguridad.',
      suggestion: 'Vuelve a iniciar sesión para continuar.',
      icon: 'auth',
    },
  },
  // RLS / permission errors
  {
    test: /row.level.security|policy|permission|denied|forbidden|403/i,
    result: {
      title: 'Sin permisos',
      message: 'No tienes permiso para realizar esta acción. Puede que necesites un rol diferente o que los datos pertenezcan a otra cuenta.',
      suggestion: 'Contacta al administrador de tu empresa para solicitar los permisos necesarios.',
      icon: 'permission',
    },
  },
  // Duplicate / unique constraint
  {
    test: /uq_presentaciones_codigo_barras|codigo_barras.*duplicado|codigo_barras.*ya.*existe|duplicate.*codigo_barras/i,
    result: {
      title: 'Código de barras duplicado',
      message: 'Ya existe otra presentación en tu empresa con este mismo código de barras. Cada presentación debe tener un código único para evitar confusiones en el POS e inventario.',
      suggestion: 'Revisa el código de barras ingresado. Si el producto tiene varias presentaciones, asegúrate de que cada una tenga un código diferente.',
      icon: 'data',
    },
  },
  {
    test: /duplicate|unique|already exists|violates.*unique|23505/i,
    result: {
      title: 'Registro duplicado',
      message: 'Ya existe un registro con esos datos. No se puede crear uno idéntico.',
      suggestion: 'Verifica que no estés duplicando información. Busca el registro existente y edítalo si necesitas hacer cambios.',
      icon: 'data',
    },
  },
  // Foreign key errors
  {
    test: /foreign.key|referenced|constraint|violates.*foreign|23503/i,
    result: {
      title: 'Datos relacionados',
      message: 'Este registro está vinculado a otros datos del sistema y no puede modificarse de esa forma.',
      suggestion: 'Revisa que los datos relacionados (cliente, producto, almacén, etc.) existan y estén activos.',
      icon: 'data',
    },
  },
  // Not null constraint
  {
    test: /not.null|null.*constraint|23502|required|campo.*obligatorio/i,
    result: {
      title: 'Faltan datos obligatorios',
      message: 'No se completaron todos los campos requeridos para guardar este registro.',
      suggestion: 'Revisa el formulario y completa todos los campos marcados como obligatorios.',
      icon: 'data',
    },
  },
  // Storage errors
  {
    test: /storage|bucket|upload.*fail|file.*too|payload.*large|413/i,
    result: {
      title: 'Error al subir archivo',
      message: 'Hubo un problema al subir el archivo. Puede ser demasiado grande o un formato no soportado.',
      suggestion: 'Intenta con un archivo más pequeño (máximo 5MB) en formato JPG, PNG o PDF.',
      icon: 'generic',
    },
  },
  // Rate limit
  {
    test: /rate.limit|too.many|429|throttle/i,
    result: {
      title: 'Demasiadas solicitudes',
      message: 'Has realizado muchas acciones en poco tiempo.',
      suggestion: 'Espera un momento antes de intentar de nuevo.',
      icon: 'server',
    },
  },
  // Server errors
  {
    test: /500|internal.*server|server.*error|unexpected/i,
    result: {
      title: 'Error interno',
      message: 'Ocurrió un error inesperado en el servidor.',
      suggestion: 'Intenta de nuevo. Si el problema persiste, contacta soporte.',
      icon: 'server',
    },
  },
  // Stripe / payment errors
  {
    test: /stripe|payment|card|declined|subscription/i,
    result: {
      title: 'Error de pago',
      message: 'Hubo un problema al procesar el pago o la suscripción.',
      suggestion: 'Verifica los datos de tu tarjeta o intenta con otro método de pago.',
      icon: 'generic',
    },
  },
];

const TECNICO = /violates|constraint|relation|column|function|syntax|null value|duplicate key|PGRST|JWT|fetch|undefined|TypeError|ReferenceError|status code|\bat [A-Za-z_$.]+ \(/i;

/**
 * ¿Es un mensaje escrito para el usuario por nosotros (RAISE EXCEPTION en la BD, edge
 * function o `throw new Error('…')` en el front)? Esos se muestran tal cual: ya dicen qué pasó.
 */
export function esMensajePropio(error: unknown, msg: string): boolean {
  const m = msg.trim();
  if (!m || m.length > 400 || TECNICO.test(m)) return false;
  const code = error && typeof error === 'object' && 'code' in error ? String((error as any).code) : '';
  if (code === 'P0001') return true;
  return /[áéíóúñ¿¡]/i.test(m)
    || /^(no |ya |el |la |los |las |debe|debes|falta|sin |solo |hay |este |esta |selecciona|ingresa|captura|primero )/i.test(m);
}

export function translateError(error: unknown): ErrorExplanation {
  let msg = '';
  if (error instanceof Error) {
    msg = error.message;
  } else if (typeof error === 'string') {
    msg = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    msg = String((error as any).message);
  } else {
    msg = String(error);
  }

  if (esMensajePropio(error, msg)) {
    return {
      title: 'No se pudo completar',
      message: msg.trim(),
      suggestion: 'Corrige lo que indica el mensaje y vuelve a intentarlo.',
      icon: 'data',
    };
  }

  for (const p of patterns) {
    const match = typeof p.test === 'function' ? p.test(msg) : p.test.test(msg);
    if (match) return p.result;
  }

  return {
    title: 'Algo salió mal',
    message: 'Ocurrió un error inesperado al realizar la operación.',
    suggestion: 'Intenta de nuevo. Si el problema persiste, contacta soporte técnico.',
    icon: 'generic',
  };
}

/** Texto de una sola línea para un toast: el mensaje propio tal cual, o la explicación traducida. */
export function mensajeError(error: unknown): string {
  const t = translateError(error);
  return t.icon === 'data' && t.title === 'No se pudo completar' ? t.message : `${t.title}. ${t.message}`;
}

export function getRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message);
  return String(error);
}
