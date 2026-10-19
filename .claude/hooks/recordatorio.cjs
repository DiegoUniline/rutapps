#!/usr/bin/env node
// UserPromptSubmit: antes de cada mensaje del dueño, recuerda al agente dónde va y las reglas clave.
'use strict';
const fs = require('fs');
const path = require('path');

const proyecto = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const estado = path.join(proyecto, 'docs', '00-estado.md');
let lineas = [];
try {
  const e = fs.readFileSync(estado, 'utf8');
  const tomar = re => { const m = e.match(re); return m ? m[1].trim() : null; };
  const paso = tomar(/\*\*Paso:\*\*\s*(.+)/);
  const modulo = tomar(/\*\*Rebanada en curso:\*\*\s*(.+)/) || tomar(/\*\*Módulo en curso:\*\*\s*(.+)/);
  const ultima = tomar(/\*\*Última pregunta:\*\*\s*(.+)/);
  const siguiente = tomar(/\*\*Siguiente paso exacto:\*\*\s*(.+)/);
  if (paso) lineas.push(`Paso actual: ${paso}`);
  if (modulo) lineas.push(`En curso: ${modulo}`);
  if (ultima) lineas.push(`Última pregunta: ${ultima}`);
  if (siguiente) lineas.push(`Siguiente: ${siguiente}`);
} catch { lineas.push('No existe /docs/00-estado.md: si se va a diseñar o construir, empieza por la Vuelta 0.'); }

process.stdout.write(`[Recordatorio Uniline]
${lineas.join('\n')}
AutoPrompter: intención → contexto verificado → objeción e impacto ANTES de construir → diálogo de decisiones materiales → resultado esperado → autorización → ejecución → pruebas → memoria con evidencia. No preguntes por trivialidades.\nReglas: sigue el paso actual y su "Listo cuando" · aplica criterio-uniline y avisa (🧭) · en cada rebanada: qué afecta, qué beneficia, qué pasa si · una pregunta por mensaje con opciones (AskUserQuestion; múltiple = "¿cuáles quitas?") · nada inventado · contradicción = alto · nada destructivo sin CONFIRMO · nada de código antes de APROBADO R<n> · tras decisiones confirmadas o cambios verificados actualiza /docs; no hagas push por simples consultas.
`);
