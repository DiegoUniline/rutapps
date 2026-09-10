from pathlib import Path

p = Path('src/pages/EstadoCuentaClientePage.tsx')
s = p.read_text(encoding='utf-8')

old = "import { useListPreferences } from '@/hooks/useListPreferences';"
new = old + "\nimport AplicarPagoClienteDialog from '@/components/finanzas/AplicarPagoClienteDialog';"
if old not in s:
    raise SystemExit('import anchor not found')
s = s.replace(old, new, 1)

old = "  const [selectedId, setSelectedId] = useState<string | null>(null);"
new = old + "\n  const [showAplicarPago, setShowAplicarPago] = useState(false);"
if old not in s:
    raise SystemExit('state anchor not found')
s = s.replace(old, new, 1)

old = """          <Button size=\"sm\" className=\"gap-2\" onClick={() => navigate('/finanzas/aplicar-pagos')}>
            <Banknote className=\"h-3.5 w-3.5\" /> Aplicar pago
          </Button>"""
new = """          <Button size=\"sm\" className=\"gap-2\" onClick={() => setShowAplicarPago(true)}>
            <Banknote className=\"h-3.5 w-3.5\" /> Aplicar pago
          </Button>
          <AplicarPagoClienteDialog
            open={showAplicarPago}
            onOpenChange={setShowAplicarPago}
            cliente={{ id: selected.id, nombre: selected.nombre, codigo: selected.codigo }}
          />"""
if old not in s:
    raise SystemExit('payment button block not found')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('Inline payment wired into Saldos Cliente')
