from pathlib import Path

p = Path('src/pages/DemandaPage.tsx')
s = p.read_text(encoding='utf-8')

old_late = """  const [showAsignarDialog, setShowAsignarDialog] = useState(false);\n  const [asignarRepartidorId, setAsignarRepartidorId] = useState('');\n\n  // ── Asignar / Cambiar repartidor en entregas activas ──"""
new_late = """  // ── Asignar / Cambiar repartidor en entregas activas ──"""
if old_late not in s:
    raise SystemExit('Late showAsignarDialog state block not found')
s = s.replace(old_late, new_late, 1)

anchor = "  const [vendedoresOpen, setVendedoresOpen] = useState(false);"
replacement = """  const [vendedoresOpen, setVendedoresOpen] = useState(false);\n  const [showAsignarDialog, setShowAsignarDialog] = useState(false);\n  const [asignarRepartidorId, setAsignarRepartidorId] = useState('');"""
if anchor not in s:
    raise SystemExit('State anchor not found')
s = s.replace(anchor, replacement, 1)

# Guard against future accidental duplication / TDZ reintroduction.
if s.count('const [showAsignarDialog, setShowAsignarDialog] = useState(false);') != 1:
    raise SystemExit('Unexpected showAsignarDialog declaration count')
if s.count('const [asignarRepartidorId, setAsignarRepartidorId] = useState(\'\');') != 1:
    raise SystemExit('Unexpected asignarRepartidorId declaration count')

use_pos = s.index('enabled: !!empresa?.id && (vendedoresOpen || showCrearDialog || showSurtirDialog || showAsignarDialog)')
decl_pos = s.index('const [showAsignarDialog, setShowAsignarDialog] = useState(false);')
if decl_pos > use_pos:
    raise SystemExit('showAsignarDialog is still referenced before declaration')

p.write_text(s, encoding='utf-8')
print('TDZ fix applied successfully')
