from pathlib import Path

page = Path('src/pages/ProductosListPage.tsx')
s = page.read_text()

old = "import { Plus, Upload, Trash2, CheckCircle2, FileSpreadsheet, Boxes } from 'lucide-react';"
new = "import { Plus, Upload, Trash2, CheckCircle2, FileSpreadsheet, Boxes, Tags } from 'lucide-react';"
assert old in s, 'No se encontro import lucide'
s = s.replace(old, new, 1)

old = "  const [bulkActivating, setBulkActivating] = useState(false);\n  const [confirmActivateOpen, setConfirmActivateOpen] = useState(false);"
new = old + "\n  const [bulkPriceMode, setBulkPriceMode] = useState(false);\n  const [confirmAllPriceListsOpen, setConfirmAllPriceListsOpen] = useState(false);"
assert old in s, 'No se encontro bloque de estados'
s = s.replace(old, new, 1)

marker = "  const FILTER_OPTIONS = useMemo(() => ["
assert marker in s, 'No se encontro FILTER_OPTIONS'
handler = '''  const invalidateProductPricing = () => {
    ['productos', 'productos-page', 'productos-select', 'pos-productos', 'productos-ajuste', 'producto'].forEach(key =>
      qc.invalidateQueries({ queryKey: [key] })
    );
  };

  const handleBulkPriceLists = async (allProducts = false) => {
    const ids = Array.from(selected);
    if (!allProducts && ids.length === 0) return;
    if (!empresa?.id) { toast.error('No se pudo identificar la empresa actual'); return; }

    setBulkPriceMode(true);
    try {
      let query: any = supabase
        .from('productos')
        .update({ usa_listas_precio: true } as any)
        .eq('empresa_id', empresa.id);
      if (!allProducts) query = query.in('id', ids);
      const { error } = await query;
      if (error) throw error;

      if (allProducts) {
        toast.success('Todos los productos ahora usan Listas de precio');
        setConfirmAllPriceListsOpen(false);
      } else {
        toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} cambiados a Listas de precio`);
        setSelected(new Set());
      }
      invalidateProductPricing();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo cambiar el modo de precio');
    } finally {
      setBulkPriceMode(false);
    }
  };

'''
s = s.replace(marker, handler + marker, 1)

old = '''                <button onClick={() => setImportOpen(true)} className="btn-odoo-secondary shrink-0 gap-1">
                  <Upload className="h-3.5 w-3.5" /> Importar
                </button>'''
new = '''                <button
                  onClick={() => setConfirmAllPriceListsOpen(true)}
                  disabled={bulkPriceMode || !empresa?.id}
                  className="btn-odoo-secondary shrink-0 gap-1"
                  title="Cambiar todos los productos de la empresa a Listas de precio"
                >
                  <Tags className="h-3.5 w-3.5" /> {bulkPriceMode ? 'Aplicando…' : 'Todos → Listas'}
                </button>
                <button onClick={() => setImportOpen(true)} className="btn-odoo-secondary shrink-0 gap-1">
                  <Upload className="h-3.5 w-3.5" /> Importar
                </button>'''
assert old in s, 'No se encontro boton Importar'
s = s.replace(old, new, 1)

marker = '''      <MobileProductoQuickForm
        open={mobileNewOpen}'''
assert marker in s, 'No se encontro MobileProductoQuickForm'
dialog = '''      <AlertDialog open={confirmAllPriceListsOpen} onOpenChange={setConfirmAllPriceListsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar todos a Listas de precio</AlertDialogTitle>
            <AlertDialogDescription>
              Se activará el modo <strong>Listas de precio</strong> en todos los productos de esta empresa, incluidos activos, inactivos y borradores. No se borran precios ni reglas existentes. Los productos nuevos que se importen después conservarán este modo automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPriceMode}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkPriceMode}
              onClick={(e) => { e.preventDefault(); handleBulkPriceLists(true); }}
            >
              {bulkPriceMode ? 'Aplicando…' : 'Cambiar todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
'''
s = s.replace(marker, dialog + marker, 1)

old = '''          ...((empresa as any)?.maneja_lotes ? ['''
new = '''          {
            label: bulkPriceMode ? 'Aplicando…' : 'Listas de precio',
            icon: Tags,
            onClick: () => handleBulkPriceLists(false),
          },
          ...((empresa as any)?.maneja_lotes ? ['''
assert old in s, 'No se encontro punto de acciones masivas'
s = s.replace(old, new, 1)

page.write_text(s)

imp = Path('src/lib/importUtils.ts')
s = imp.read_text()

old = '''  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  // (Stock inicial ya no se toca aquí; no necesitamos almacén por defecto.)'''
new = '''  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  // Si el catálogo completo ya trabaja con Listas de precio, los productos NUEVOS
  // importados heredan ese modo. Las reimportaciones de productos existentes no
  // pisan su configuración individual de precio.
  let defaultUsePriceLists = false;
  try {
    const productsTable: any = supabase.from('productos');
    const [{ count: totalProducts, error: totalError }, { count: listPriceProducts, error: listError }] = await Promise.all([
      productsTable.select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
      (supabase.from('productos') as any).select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('usa_listas_precio', true),
    ]);
    if (!totalError && !listError && (totalProducts ?? 0) > 0) {
      defaultUsePriceLists = totalProducts === listPriceProducts;
    }
  } catch {
    // Compatibilidad: si no se puede determinar el modo global, se conserva el
    // comportamiento previo de la importación.
  }

  // (Stock inicial ya no se toca aquí; no necesitamos almacén por defecto.)'''
assert old in s, 'No se encontro inicio importProducts'
s = s.replace(old, new, 1)

old_insert = "const { data: inserted, error } = await supabase.from('productos').insert(productData).select('id').single();"
new_insert = "const { data: inserted, error } = await supabase.from('productos').insert({ ...productData, usa_listas_precio: defaultUsePriceLists } as any).select('id').single();"
assert s.count(old_insert) >= 2, f'Se esperaban 2 inserts de producto, encontrados {s.count(old_insert)}'
s = s.replace(old_insert, new_insert, 2)

imp.write_text(s)

dlg = Path('src/components/ImportDialog.tsx')
s = dlg.read_text()
old = '''                <li>Si un catálogo (marca, zona, etc.) no existe, se creará automáticamente</li>
                <li>Si el código ya existe, se actualizarán los datos</li>'''
new = '''                <li>Si un catálogo (marca, zona, etc.) no existe, se creará automáticamente</li>
                {type === 'productos' && <li>Si todo tu catálogo usa <strong>Listas de precio</strong>, los productos nuevos importados conservarán ese modo</li>}
                <li>Si el código ya existe, se actualizarán los datos sin cambiar su modo de precio</li>'''
assert old in s, 'No se encontro bloque de tips ImportDialog'
s = s.replace(old, new, 1)
dlg.write_text(s)
