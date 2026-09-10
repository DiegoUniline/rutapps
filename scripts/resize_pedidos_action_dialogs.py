from pathlib import Path

p = Path('src/pages/DemandaPage.tsx')
s = p.read_text(encoding='utf-8')

old = '''      <Dialog open={showCrearDialog} onOpenChange={setShowCrearDialog}>
        <DialogContent className="sm:max-w-lg" onPointerDownOutside={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>'''
new = '''      <Dialog open={showCrearDialog} onOpenChange={setShowCrearDialog}>
        <DialogContent
          className="w-[min(96vw,1180px)] sm:max-w-5xl max-h-[92dvh] overflow-visible flex flex-col gap-4"
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 pr-10">'''
if old not in s:
    raise SystemExit('Create dialog opening not found')
s = s.replace(old, new, 1)

old = '''          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">'''
new = '''          <div className="space-y-4 py-2 flex-1 min-h-0">
            <p className="text-sm text-muted-foreground max-w-3xl">'''
if old not in s:
    raise SystemExit('Create dialog body not found')
s = s.replace(old, new, 1)

old = '''            <div className="space-y-3">
              <div>'''
new = '''            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-20">
              <div>'''
if old not in s:
    raise SystemExit('Create controls block not found')
s = s.replace(old, new, 1)

old = '''            <div className="border border-border rounded-md max-h-48 overflow-y-auto">
              <table className="w-full text-[12px]">'''
new = '''            <div className="border border-border rounded-md h-[min(48dvh,430px)] min-h-[260px] overflow-auto relative z-10 bg-background">
              <table className="w-full min-w-[720px] text-[12px]">'''
if old not in s:
    raise SystemExit('Create preview not found')
s = s.replace(old, new, 1)

old = '''          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCrearDialog(false)}>Cancelar</Button>'''
new = '''          <DialogFooter className="shrink-0 border-t border-border pt-4 bg-background">
            <Button variant="outline" onClick={() => setShowCrearDialog(false)}>Cancelar</Button>'''
if old not in s:
    raise SystemExit('Create footer not found')
s = s.replace(old, new, 1)

old = '''      <Dialog open={showSurtirDialog} onOpenChange={setShowSurtirDialog}>
        <DialogContent className="sm:max-w-lg" onPointerDownOutside={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>'''
new = '''      <Dialog open={showSurtirDialog} onOpenChange={setShowSurtirDialog}>
        <DialogContent
          className="w-[min(94vw,920px)] sm:max-w-3xl min-h-[520px] max-h-[90dvh] overflow-visible flex flex-col gap-4"
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 pr-10">'''
if old not in s:
    raise SystemExit('Surtir dialog opening not found')
s = s.replace(old, new, 1)

old = '''          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Se creará una entrega por pedido y se surtirá automáticamente <strong>solo lo que haya en stock</strong> del almacén seleccionado. Los pedidos que no se completen quedarán marcados como parciales.
            </p>
            <div>
              <label className="label-odoo">Almacén origen *</label>'''
new = '''          <div className="space-y-5 py-2 flex-1 min-h-0">
            <p className="text-sm text-muted-foreground max-w-3xl">
              Se creará una entrega por pedido y se surtirá automáticamente <strong>solo lo que haya en stock</strong> del almacén seleccionado. Los pedidos que no se completen quedarán marcados como parciales.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-20">
            <div>
              <label className="label-odoo">Almacén origen *</label>'''
if old not in s:
    raise SystemExit('Surtir body block not found')
s = s.replace(old, new, 1)

old = '''            <div>
              <label className="label-odoo">Repartidor (opcional)</label>
              <ModalSelect
                options={vendedorOptions}
                value={vendedorRutaId}
                onChange={setVendedorRutaId}
                placeholder="Asignar después"
              />
            </div>
          </div>
          <DialogFooter>'''
new = '''            <div>
              <label className="label-odoo">Repartidor (opcional)</label>
              <ModalSelect
                options={vendedorOptions}
                value={vendedorRutaId}
                onChange={setVendedorRutaId}
                placeholder="Asignar después"
              />
            </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border pt-4 bg-background">'''
if old not in s:
    raise SystemExit('Surtir controls/footer block not found')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('Dialogs resized')
