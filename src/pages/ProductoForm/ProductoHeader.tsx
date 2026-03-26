import { Save, X, Trash2, Star, Camera } from 'lucide-react';
import type { Producto } from '@/types';

interface Props {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
  setForm: (fn: (prev: Partial<Producto>) => Partial<Producto>) => void;
  isNew: boolean;
  isDirty: boolean;
  starred: boolean;
  setStarred: (v: boolean) => void;
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  nameInputRef: React.RefObject<HTMLInputElement>;
  imageInputRef: React.RefObject<HTMLInputElement>;
  uploadingImage: boolean;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSave: () => void;
  handleDelete: () => void;
  onDiscard: () => void;
  saving: boolean;
}

export function ProductoHeader({ form, set, isNew, isDirty, starred, setStarred, editingName, setEditingName, nameInputRef, imageInputRef, uploadingImage, handleImageUpload, handleSave, handleDelete, onDiscard, saving }: Props) {
  return (
    <>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[12px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={onDiscard}>Producto</span>
        <div className="flex items-center gap-1">
          {['activo', 'inactivo', 'borrador'].map(s => (
            <button key={s} type="button" onClick={() => set('status', s)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${form.status === s ? 'bg-primary text-primary-foreground border-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
              {s === 'activo' ? 'Activo' : s === 'inactivo' ? 'Inactivo' : 'Borrador'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setStarred(!starred)} className="text-warning hover:scale-110 transition-transform shrink-0">
              <Star className={`h-5 w-5 ${starred ? 'fill-warning' : ''}`} />
            </button>
            {isNew || editingName ? (
              <input ref={nameInputRef} type="text" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)}
                onBlur={() => { if (!isNew) setEditingName(false); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                placeholder="Nombre del producto" autoFocus
                className="text-[22px] font-bold text-foreground leading-tight bg-transparent border-b border-primary/40 focus:border-primary outline-none flex-1 min-w-[180px] max-w-md placeholder:text-muted-foreground/50" />
            ) : (
              <h1 className="text-[22px] font-bold text-foreground leading-tight cursor-pointer hover:text-primary transition-colors truncate" onClick={() => setEditingName(true)}>
                {form.nombre || 'Producto'}
              </h1>
            )}
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <button onClick={handleSave} disabled={saving || !isDirty} className={isDirty ? "btn-odoo-primary" : "btn-odoo-secondary opacity-60 cursor-not-allowed"}>
                <Save className="h-3.5 w-3.5" /> Guardar
              </button>
              <button onClick={onDiscard} className="btn-odoo-secondary"><X className="h-3.5 w-3.5" /> Descartar</button>
              {!isNew && <button onClick={handleDelete} className="btn-odoo-secondary text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
          <div className="odoo-module-checks mt-1.5 mb-1">
            <label className="odoo-module-check"><input type="checkbox" checked={!!form.se_puede_vender} onChange={e => set('se_puede_vender', e.target.checked)} /> Puede ser vendido</label>
            <label className="odoo-module-check"><input type="checkbox" checked={!!form.se_puede_comprar} onChange={e => set('se_puede_comprar', e.target.checked)} /> Puede ser comprado</label>
          </div>
        </div>
        <div className="hidden sm:block shrink-0">
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          {form.imagen_url ? (
            <div className="relative group cursor-pointer" onClick={() => imageInputRef.current?.click()}>
              <img src={form.imagen_url} alt="" className="w-[100px] h-[100px] rounded object-cover border border-border" />
              <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="h-6 w-6 text-white" /></div>
            </div>
          ) : (
            <div onClick={() => imageInputRef.current?.click()} className={`w-[100px] h-[100px] rounded border-2 border-dashed border-border flex items-center justify-center bg-card cursor-pointer hover:border-primary/40 transition-colors ${uploadingImage ? 'animate-pulse' : ''}`}>
              <Camera className="h-7 w-7 text-muted-foreground/40" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
