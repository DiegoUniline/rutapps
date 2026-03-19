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
  // Network / connectivity
  {
    test: /fetch|network|failed to fetch|net::err|load failed|cors|aborted|timeout/i,
    result: {
      title: 'Problema de conexión',
      message: 'No se pudo conectar con el servidor. Esto puede deberse a una conexión a internet inestable o un problema temporal del servicio.',
      suggestion: 'Verifica tu conexión a internet e intenta de nuevo en unos segundos.',
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

export function getRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message);
  return String(error);
}
