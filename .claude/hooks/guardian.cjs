#!/usr/bin/env node
// Guardián Uniline — PreToolUse hook.
// deny  = bloqueado siempre (catastrófico).
// ask   = Claude Code te pide aprobación a TI antes de ejecutar (destructivo / producción).
// Sin salida = permitido.
'use strict';
const fs = require('fs');
const path = require('path');

let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw || '{}'); } catch { return; }
  const r = evaluar(input);
  if (!r) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: r.decision,
      permissionDecisionReason: `🛑 Guardián Uniline: ${r.motivo}` +
        (r.decision === 'ask'
          ? ' — Requiere tu aprobación. Antes debes haber explicado qué se pierde, qué depende de esto y cómo se revierte.'
          : ' — Bloqueado. No lo intentes por otra vía; explica al dueño y propón alternativa segura.')
    }
  }));
});

function evaluar({ tool_name = '', tool_input = {}, cwd = process.cwd() }) {
  if (tool_name === 'Bash') return bash(String(tool_input.command || ''), cwd);
  if (tool_name === 'Write') return escribir(tool_input.file_path, cwd);
  if (tool_name === 'Edit' || tool_name === 'MultiEdit') return editarMigracion(tool_input.file_path);
  if (tool_name.startsWith('mcp__')) return mcp(tool_name, tool_input);
  return null;
}

// ---------- SQL ----------
function limpiarSQL(s, conservarTextos) {
  let t = String(s || '')
    .replace(/(^|\s)--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (!conservarTextos) t = t.replace(/'(?:[^']|'')*'/g, "''");
  return t;
}
function sql(texto, conservarTextos) {
  const s = limpiarSQL(texto, conservarTextos);
  const sentencias = s.split(';').map(x => x.trim()).filter(Boolean);
  if (/\bdrop\s+(database|schema\s+(if\s+exists\s+)?(public|auth|storage)\b)/i.test(s))
    return { decision: 'deny', motivo: 'DROP DATABASE / DROP SCHEMA de sistema' };
  const reglas = [
    [/\bdrop\s+(table|column|schema|function|procedure|policy|trigger|view|materialized\s+view|index|type|extension|sequence|role)\b/i, 'DROP'],
    [/\btruncate\b/i, 'TRUNCATE'],
    [/\bdelete\s+from\b/i, 'DELETE de datos'],
    [/\balter\s+table\b[\s\S]*\bdrop\b/i, 'ALTER TABLE … DROP (columna/constraint/default/not null)'],
    [/\balter\s+column\b[\s\S]*\btype\b/i, 'cambio de tipo de columna'],
    [/\bdisable\s+row\s+level\s+security\b|\bno\s+force\s+row\s+level\s+security\b/i, 'desactivar RLS'],
    [/\brename\s+(to|column)\b/i, 'RENAME (rompe referencias)'],
    [/\b(grant|revoke)\b/i, 'cambio de permisos de BD'],
    [/\b(insert|update|delete)\b[\s\S]*\bauth\.(users|identities|sessions)\b/i, 'modificar auth.*'],
  ];
  for (const [re, m] of reglas) if (re.test(s)) return { decision: 'ask', motivo: `SQL destructivo: ${m}` };
  for (const st of sentencias)
    if (/^\s*update\b/i.test(st) && !/\bwhere\b/i.test(st))
      return { decision: 'ask', motivo: 'UPDATE sin WHERE (afecta toda la tabla)' };
  return null;
}

// ---------- Bash ----------
function bash(cmd, cwd) {
  const c = cmd.replace(/\s+/g, ' ');
  const deny = [
    [/\brm\s+(-[a-z]*\s+)*-?[a-z]*r[a-z]*f?[a-z]*\s+(-[a-z]+\s+)*(\/|~|\$HOME|\*|\.\/?\s*$|\.\.)(\s|$)/i, 'rm recursivo sobre raíz, home, * o carpeta actual'],
    [/\b(mkfs|dd\s+if=|format\s+[a-z]:)/i, 'formateo / escritura de disco'],
    [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'fork bomb'],
    [/\bgit\s+push\b(?=.*\s(--force(-with-lease)?|-f)(\s|$))(?=.*[\s:+](main|master|production|prod)(\s|$))/i, 'force push a rama principal'],
  ];
  for (const [re, m] of deny) if (re.test(c)) return { decision: 'deny', motivo: m };

  const ask = [
    [/(^|[;&|]\s*|\bsudo\s+|\bxargs\s+)(rm|rmdir|unlink|shred)\b/i, 'borrar archivos'],
    [/\bfind\b.*\s-delete\b|\bfind\b.*-exec\s+rm\b/i, 'borrado masivo con find'],
    [/(^|[;&|]\s*)mv\s/i, 'mover/renombrar archivos'],
    [/\bgit\s+reset\s+--hard\b/i, 'git reset --hard (pierde cambios)'],
    [/\bgit\s+clean\s+-[a-z]*f/i, 'git clean (borra archivos no versionados)'],
    [/\bgit\s+push\b.*(\s--force(-with-lease)?\b|\s-f\b)/i, 'git push forzado'],
    [/\bgit\s+branch\s+-D\b|\bgit\s+push\b.*\s--delete\b|\bgit\s+push\s+\S+\s+:\S/i, 'borrar rama'],
    [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)|\bgit\s+checkout\s+--\s/i, 'descartar cambios locales'],
    [/\bgit\s+stash\s+(drop|clear)\b/i, 'borrar stash'],
    [/\bgit\s+(rebase|filter-branch|filter-repo)\b/i, 'reescribir historial'],
    [/\bsupabase\s+db\s+(reset|push)\b/i, 'supabase db reset/push'],
    [/\bsupabase\s+migration\s+(repair|squash)\b/i, 'alterar historial de migraciones'],
    [/\bsupabase\s+functions\s+(deploy|delete)\b/i, 'deploy/borrado de edge functions'],
    [/\bsupabase\s+secrets\s+(set|unset)\b/i, 'cambiar secrets'],
    [/\bsupabase\s+(link|projects\s+delete|branches\s+delete)\b/i, 'operación sobre proyecto remoto'],
    [/\bclasp\s+(push|deploy|undeploy|delete)\b/i, 'Apps Script a producción'],
    [/\b(vercel\b.*--prod|netlify\s+deploy\b.*--prod|firebase\s+deploy)\b/i, 'deploy a producción'],
    [/\b(npm|pnpm|yarn|bun)\s+(uninstall|remove|rm|un)\b/i, 'quitar dependencias'],
    [/\b(dropdb|pg_restore\b.*--clean)\b/i, 'borrar/restaurar BD'],
    [/\bchmod\s+-R\b|\bchown\s+-R\b/i, 'cambio masivo de permisos de archivos'],
  ];
  for (const [re, m] of ask) if (re.test(c)) return { decision: 'ask', motivo: m };

  // SQL dentro de psql / supabase / heredoc
  if (/\b(psql|supabase|pg_dump|pgcli)\b/i.test(c)) {
    const r = sql(cmd, true);
    if (r) return r;
  }

  // redirección '>' que sobrescribe un archivo existente
  const re = /(?:^|[^>0-9&])>\s*(?!&)(?!>)([^\s;&|<>]+)/g;
  let m;
  while ((m = re.exec(cmd))) {
    const destino = m[1].replace(/^["']|["']$/g, '');
    if (/^\/dev\//.test(destino)) continue;
    const abs = path.isAbsolute(destino) ? destino : path.join(cwd, destino);
    if (fs.existsSync(abs) && !esDocs(abs))
      return { decision: 'ask', motivo: `sobrescribir archivo existente con '>' (${destino})` };
  }
  return null;
}

// ---------- Write / Edit ----------
function esDocs(p) {
  return /(^|[\\/])docs[\\/]/.test(p) || /(^|[\\/])(CLAUDE|AGENTS)\.md$/.test(p);
}
function escribir(fp, cwd) {
  if (!fp) return null;
  const abs = path.isAbsolute(fp) ? fp : path.join(cwd, fp);
  if (/[\\/]supabase[\\/]migrations[\\/]/.test(abs) && fs.existsSync(abs))
    return { decision: 'ask', motivo: 'reescribir una migración existente (puede estar aplicada)' };
  if (fs.existsSync(abs) && !esDocs(abs))
    return { decision: 'ask', motivo: `sobrescribir completo un archivo existente (${path.basename(abs)}); preferir Edit parcial` };
  return null;
}
function editarMigracion(fp) {
  if (fp && /[\\/]supabase[\\/]migrations[\\/]/.test(fp))
    return { decision: 'ask', motivo: 'editar una migración existente (si ya se aplicó, debe ser migración nueva)' };
  return null;
}

// ---------- MCP ----------
function mcp(nombre, inp) {
  const n = nombre.toLowerCase();
  if (/apply_migration/.test(n))
    return sql(inp.query) && sql(inp.query).decision === 'deny'
      ? sql(inp.query)
      : { decision: 'ask', motivo: `aplicar migración en BD remota${sql(inp.query) ? ' — contiene ' + sql(inp.query).motivo : ''}` };
  if (/execute_sql|run_sql|query/.test(n) && inp && (inp.query || inp.sql)) {
    const r = sql(inp.query || inp.sql);
    if (r) return r;
    if (/\b(insert|update|upsert|merge|create|alter|comment)\b/i.test(limpiarSQL(inp.query || inp.sql)))
      return { decision: 'ask', motivo: 'SQL que escribe en BD remota' };
    return null;
  }
  if (/(delete|trash|drop|purge|remove|reset|pause|merge_branch|rebase_branch|deploy|secret|restore_project)/.test(n))
    return { decision: 'ask', motivo: `acción remota sensible (${nombre})` };
  return null;
}
