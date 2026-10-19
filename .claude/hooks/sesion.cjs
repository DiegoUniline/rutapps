#!/usr/bin/env node
// SessionStart: carga la constitución Uniline y el estado de /docs en cada sesión.
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
const proyecto = process.env.CLAUDE_PROJECT_DIR || process.cwd();
let out = '';
try { out += fs.readFileSync(path.join(raiz, 'core', 'principios.md'), 'utf8'); } catch {}

const docs = path.join(proyecto, 'docs');
const estado = path.join(docs, '00-estado.md');
if (fs.existsSync(estado) || fs.existsSync(path.join(docs, '00-mapa.md'))) {
  out += '\n\n## Estado del proyecto\nExiste /docs. Continúa desde /docs/00-estado.md; antes de cualquier cambio lee /docs/00-mapa.md y el módulo afectado.\n';
  try {
    let e = fs.readFileSync(estado, 'utf8');
    if (e.length > 6000) e = e.slice(0, 6000) + '\n…(truncado, lee el archivo completo)';
    out += '\n### /docs/00-estado.md\n' + e + '\n';
  } catch {}
  try {
    const p = fs.readFileSync(path.join(docs, 'preguntas.md'), 'utf8');
    const abiertas = (p.match(/·\s*ABIERTA/g) || []).length;
    if (abiertas) out += `Hay ${abiertas} preguntas ABIERTAS en /docs/preguntas.md.\n`;
  } catch {}
} else {
  out += '\n\n## Estado del proyecto\nNo existe /docs. Si se va a trabajar en este proyecto, sugiere /iniciar.\n';
}
out += '\nAutoPrompter: lee skills/autoprompter/SKILL.md antes de trabajo, investiga antes de preguntar, objeta antes de construir, dialoga decisiones materiales, comprueba antes de afirmar éxito.\n';
out += '\nComandos Uniline: /iniciar /disenar /modulo /proponer /inventario /auditar /reauditar /cambio /corregir /probar /respuestas /estado /autoprompt\n';
process.stdout.write(out);
