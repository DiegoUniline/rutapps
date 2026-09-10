export type CrmPitchAction = 'next' | 'stay' | 'end';

export interface CrmPitchResponse {
  id: string;
  label: string;
  reply: string;
  action: CrmPitchAction;
  finalTitle?: string;
  finalNote?: string;
  success?: boolean;
}

export interface CrmPitchStep {
  id: string;
  title: string;
  subtitle: string;
  pitch: string;
  tips: string[];
  responses: CrmPitchResponse[];
}

export interface CrmPitchQuickAnswer {
  id: string;
  question: string;
  answer: string;
}

export interface CrmCallPitchConfig {
  title: string;
  goal: string;
  steps: CrmPitchStep[];
  quickAnswers: CrmPitchQuickAnswer[];
}

const id = (prefix: string, n: number) => `${prefix}-${n}`;

export const DEFAULT_CRM_CALL_PITCH: CrmCallPitchConfig = {
  title: 'Pitch de llamada · RutApp',
  goal: 'Agendar asesoría de 10–15 min',
  steps: [
    {
      id: id('step', 1),
      title: 'Inicio',
      subtitle: 'Preséntate y pide un minuto.',
      pitch: 'Hola, ¿[Nombre]? Soy Frida de RutApp, la plataforma de preventa y venta en ruta. Vi que hace unos días te registraste con nosotros y quería comentarte algo, ¿tienes un minuto?',
      tips: ['Tono rápido y claro. Debe sonar a seguimiento de su cuenta, no a venta fría.', 'No empieces explicando funciones de RutApp.'],
      responses: [
        { id: id('r1', 1), label: 'Dijo que sí', reply: 'Perfecto. Sigue al siguiente punto y no expliques la plataforma todavía.', action: 'next' },
        { id: id('r1', 2), label: '¿De qué se trata?', reply: 'Es sobre tu cuenta. Vi que ya comenzaste a configurarla y quiero ayudarte a dar el siguiente paso.', action: 'next' },
        { id: id('r1', 3), label: 'No puede hablar ahora', reply: 'Sin problema, te contacto en otro momento. Que tengas buen día.', action: 'end', finalTitle: 'Reagendar llamada', finalNote: 'No pudo atender. Vuelve a marcar en otro horario.' },
      ],
    },
    {
      id: id('step', 2),
      title: 'Detectar el freno',
      subtitle: 'Haz una pregunta y guarda silencio.',
      pitch: 'Vi que ya comenzaste a configurar tu cuenta y justamente quiero ayudarte a dar el siguiente paso: hacer tu primera venta con RutApp. ¿Tuviste algún problema o se te complicó algo?',
      tips: ['Escucha: lo que diga aquí es lo que vas a usar en la propuesta.', 'Anota el freno exacto para retomarlo con sus propias palabras.'],
      responses: [
        { id: id('r2', 1), label: 'Sí, tuve un problema', reply: 'Claro. Cuéntame, ¿qué fue lo que se te complicó? Así puedo ayudarte a resolverlo o guiarte.', action: 'next' },
        { id: id('r2', 2), label: 'No, todo bien', reply: 'Perfecto. Entonces justamente podemos aprovecharlo para que des el siguiente paso y hagas tu primera venta.', action: 'next' },
        { id: id('r2', 3), label: 'No la he usado', reply: 'Entiendo. Justamente por eso quería contactarte: puedo acompañarte paso a paso para que empieces a usarla.', action: 'next' },
        { id: id('r2', 4), label: 'Ya no me interesa', reply: 'Entiendo, no hay problema. ¿Te puedo preguntar qué fue lo que hizo que ya no te interesara? Así lo tomo en cuenta.', action: 'end', finalTitle: 'No interesado', finalNote: 'Registra el motivo que dio antes de cerrar.' },
      ],
    },
    {
      id: id('step', 3),
      title: 'Propuesta',
      subtitle: 'Ofrece el resultado, no las funciones.',
      pitch: 'Justamente por eso te llamaba. Podemos hacer una asesoría de 10–15 minutos y te acompaño paso a paso para que hagas tu primera venta en RutApp.',
      tips: ['Enfatiza: “Te acompaño a hacer tu primera venta.”', 'Evita convertir la llamada en un recorrido por todas las funciones.'],
      responses: [
        { id: id('r3', 1), label: 'Se ve interesado', reply: 'Perfecto. Pasa al cierre de inmediato; no agregues información de más.', action: 'next' },
        { id: id('r3', 2), label: '¿Y qué vamos a hacer?', reply: 'Revisamos tu cuenta y te voy guiando para que puedas levantar y realizar tu primera venta en RutApp.', action: 'next' },
        { id: id('r3', 3), label: '¿Cuánto cuesta?', reply: 'Te puedo explicar los costos, pero primero quiero que veas cómo la usas en tu negocio. La asesoría es para acompañarte con tu primera venta.', action: 'next' },
        { id: id('r3', 4), label: 'Rechaza la asesoría', reply: 'Entiendo. ¿Qué fue lo que no te convenció? Así se lo comento al equipo.', action: 'end', finalTitle: 'No interesado', finalNote: 'Registra el motivo. Puedes ofrecer volver a contactarlo más adelante.' },
      ],
    },
    {
      id: id('step', 4),
      title: 'Cierre',
      subtitle: 'Pregunta por el día. Solo eso.',
      pitch: '¿Qué día te viene bien que lo revisemos?',
      tips: ['Si duda, ofrece dos opciones concretas de día.', 'Después de preguntar, guarda silencio y deja que responda.'],
      responses: [
        { id: id('r4', 1), label: 'Propuso un día', reply: 'Perfecto, quedamos [día] a las [hora]. Te acompaño para hacer tu primera venta. Confirma por dónde lo contactas.', action: 'next' },
        { id: id('r4', 2), label: 'No tengo tiempo', reply: 'Claro, entiendo. Son solo 10–15 minutos. ¿Qué día te vendría mejor esta semana?', action: 'stay' },
        { id: id('r4', 3), label: 'Prefiere que le escribas', reply: 'Sin problema. Te escribo por WhatsApp para agendarlo cuando puedas.', action: 'end', finalTitle: 'Seguimiento por WhatsApp', finalNote: 'Manda el mensaje hoy mismo con dos opciones de horario.' },
      ],
    },
    {
      id: id('step', 5),
      title: 'Confirmación',
      subtitle: 'Repite fecha, hora y beneficio.',
      pitch: 'Perfecto, te confirmo la asesoría para [día] a las [hora]. La idea es que salgamos de ahí con tu primera venta en RutApp.',
      tips: ['Antes de colgar, confirma el número o correo de contacto.', 'Cierra corto: agradece y termina; no abras temas nuevos.'],
      responses: [
        { id: id('r5', 1), label: 'Sí, asesoría agendada', reply: 'Quedamos entonces [día] a las [hora]. Muchas gracias, hablamos pronto.', action: 'end', finalTitle: 'Asesoría agendada', finalNote: 'Registra la cita y manda la confirmación por WhatsApp.', success: true },
        { id: id('r5', 2), label: 'Quedó pendiente la hora', reply: 'Te escribo para confirmarte el horario en cuanto lo tengas claro.', action: 'end', finalTitle: 'Pendiente de confirmar', finalNote: 'Vuelve a marcar mañana para cerrar la fecha.' },
      ],
    },
  ],
  quickAnswers: [
    { id: id('q', 1), question: '¿De qué se trata?', answer: 'Es sobre tu cuenta. Vi que ya comenzaste a configurarla y quiero ayudarte a dar el siguiente paso: hacer tu primera venta con RutApp.' },
    { id: id('q', 2), question: 'No tengo tiempo', answer: 'Claro, entiendo. Son solo 10–15 minutos. ¿Qué día te vendría mejor esta semana?' },
    { id: id('q', 3), question: '¿Cuánto cuesta?', answer: 'Te puedo explicar los costos, pero primero quiero que veas cómo la usas en tu negocio. La asesoría es para acompañarte con tu primera venta.' },
    { id: id('q', 4), question: '¿Qué es RutApp?', answer: 'Es la plataforma para gestionar preventa y venta en ruta: clientes, productos, pedidos y ventas desde un solo lugar.' },
    { id: id('q', 5), question: 'No la he usado', answer: 'Justamente por eso te contacto. Te acompaño paso a paso para que empieces a usarla y hagas tu primera venta.' },
    { id: id('q', 6), question: 'Todo bien, sin problemas', answer: 'Perfecto. Entonces lo que quiero es ayudarte a dar el siguiente paso y hacer tu primera venta en RutApp.' },
    { id: id('q', 7), question: 'Ya no me interesa', answer: 'Entiendo, no hay problema. Antes de cerrar, ¿te puedo preguntar qué fue lo que hizo que ya no te interesara? Así lo tomo en cuenta.' },
    { id: id('q', 8), question: 'Sí, me interesa', answer: 'Perfecto. Entonces agendemos la asesoría. ¿Qué día te viene bien?' },
  ],
};

export function normalizeCrmCallPitch(value: unknown): CrmCallPitchConfig {
  if (!value || typeof value !== 'object') return DEFAULT_CRM_CALL_PITCH;
  const candidate = value as Partial<CrmCallPitchConfig>;
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) return DEFAULT_CRM_CALL_PITCH;
  return {
    title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title : DEFAULT_CRM_CALL_PITCH.title,
    goal: typeof candidate.goal === 'string' && candidate.goal.trim() ? candidate.goal : DEFAULT_CRM_CALL_PITCH.goal,
    steps: candidate.steps,
    quickAnswers: Array.isArray(candidate.quickAnswers) ? candidate.quickAnswers : [],
  };
}

export function personalizePitch(text: string, leadName?: string | null) {
  return text.split('[Nombre]').join(leadName?.trim() || '');
}

export function newPitchId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
