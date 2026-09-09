import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Mail, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type ModulePermissions = Record<string, boolean>;
type TeamPermissions = Record<string, boolean | ModulePermissions>;

interface TeamAccessMember {
  id: string;
  name: string;
  email: string;
  user_id?: string | null;
  email_is_fictitious?: boolean;
  permissions?: TeamPermissions;
}
interface DirectCredentials { email: string; password: string; changed?: boolean; }
interface TeamAccessDialogProps { member: TeamAccessMember | null; onClose: () => void; onCompleted: () => Promise<void> | void; }

const MASTER_MODULES = [
  { key:'dashboard', label:'Dashboard', actions:[['view','Ver']] },
  { key:'empresas', label:'Empresas', actions:[['view','Ver'],['view_detail','Ver detalle'],['edit','Editar'],['manage_users','Gestionar usuarios'],['delete','Eliminar']] },
  { key:'crm', label:'CRM recuperación', actions:[['view','Ver'],['contact','Contactar'],['edit','Editar seguimiento'],['assign','Asignar responsable'],['discard','Marcar perdido']] },
  { key:'subscriptions', label:'Suscripciones', actions:[['view','Ver'],['edit','Modificar'],['cancel','Cancelar / reactivar']] },
  { key:'billing_audit', label:'Auditoría de cobros', actions:[['view','Ver'],['audit','Auditar'],['adjust','Corregir']] },
  { key:'invoices', label:'Facturas', actions:[['view','Ver'],['edit','Modificar']] },
  { key:'pagos', label:'Pagos', actions:[['view','Ver'],['apply','Aplicar'],['reverse','Revertir']] },
  { key:'payment_requests', label:'Pagos transferencia', actions:[['view','Ver'],['approve','Aprobar / rechazar']] },
  { key:'cobros', label:'Cobros', actions:[['view','Ver'],['charge','Cobrar / reintentar']] },
  { key:'cupones', label:'Cupones', actions:[['view','Ver'],['create','Crear'],['edit','Editar'],['disable','Desactivar']] },
  { key:'commissions', label:'Comisiones', actions:[['view','Ver'],['approve','Aprobar'],['pay','Registrar pago']] },
  { key:'partners', label:'Partners', actions:[['view','Ver'],['edit','Administrar']] },
  { key:'whatsapp', label:'WhatsApp', actions:[['view','Ver'],['send','Enviar mensajes']] },
  { key:'wa_bot', label:'Bot WhatsApp', actions:[['view','Ver'],['edit','Modificar bot']] },
  { key:'broadcast', label:'Mensajes en vivo', actions:[['view','Ver'],['send','Enviar']] },
  { key:'notifications', label:'Historial de comunicación', actions:[['view','Ver']] },
  { key:'publicidad', label:'Publicidad', actions:[['view','Ver'],['edit','Administrar']] },
  { key:'anuncios', label:'Anuncios', actions:[['view','Ver'],['send','Publicar']] },
  { key:'campanas', label:'Campañas WA', actions:[['view','Ver'],['run','Ejecutar']] },
  { key:'flags', label:'Funciones en pruebas', actions:[['view','Ver'],['edit','Activar / desactivar']] },
] as const;

const DEFAULT_PERMISSIONS: TeamPermissions = {
  master_access: false,
  crm: { view: true, contact: true, edit: true, assign: false, discard: true },
  empresas: { view: false, view_detail: false, edit: false, manage_users: false, delete: false },
  commissions: { view: true, approve: false, pay: false },
};

const functionErrorMessage = async (error: unknown) => {
  const fallback = error instanceof Error ? error.message : 'No se pudo contactar al servicio de accesos';
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.text !== 'function') return fallback;
  try { const body=await response.clone().text(); const parsed=body?JSON.parse(body):null; return parsed?.error||body||fallback; }
  catch { return fallback; }
};

export default function TeamAccessDialog({ member, onClose, onCompleted }: TeamAccessDialogProps) {
  const hasAccount = Boolean(member?.user_id);
  const isFictitious = Boolean(member?.email_is_fictitious);
  const [mode, setMode] = useState<'invite' | 'direct' | 'reset_password'>('invite');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<DirectCredentials | null>(null);
  const [permissions,setPermissions]=useState<TeamPermissions>(DEFAULT_PERMISSIONS);
  const [permissionReason,setPermissionReason]=useState('');
  const [permissionSaving,setPermissionSaving]=useState(false);

  useEffect(() => {
    if (!member) return;
    setMode(member.user_id ? 'reset_password' : member.email_is_fictitious ? 'direct' : 'invite');
    setPassword(''); setCredentials(null); setPermissionReason('');
    setPermissions({ ...DEFAULT_PERMISSIONS, ...(member.permissions || {}) });
  }, [member?.id, member?.user_id, member?.email_is_fictitious, member?.permissions]);

  const masterAccess=Boolean(permissions.master_access);
  const enabledModules=useMemo(()=>MASTER_MODULES.filter(module=>Boolean((permissions[module.key] as ModulePermissions|undefined)?.view)).length,[permissions]);
  const close=()=>{if(saving||permissionSaving)return;setCredentials(null);setPassword('');onClose();};
  const finishAndClose=async()=>{await onCompleted();setCredentials(null);setPassword('');onClose();};
  const copyCredentials=async()=>{if(!credentials)return;await navigator.clipboard.writeText(`Usuario: ${credentials.email}\nContraseña: ${credentials.password}`);toast.success('Credenciales copiadas');};

  const createAccess=async()=>{
    if(!member)return;
    if((mode==='direct'||mode==='reset_password')&&password&&password.length<8){toast.error('La contraseña debe tener al menos 8 caracteres');return;}
    setSaving(true);
    try{
      const{data:result,error}=await supabase.functions.invoke('admin-team-account',{body:{person_id:member.id,access_mode:mode,...((mode==='direct'||mode==='reset_password')&&password?{temporary_password:password}:{})}});
      if(error)throw new Error(await functionErrorMessage(error)); if(result?.error)throw new Error(result.error);
      if(mode==='invite'){toast.success(result?.existing_account?'Cuenta existente vinculada correctamente':'Invitación enviada por correo');await finishAndClose();return;}
      const temporaryPassword=String(result?.temporary_password||'');
      if(!temporaryPassword)throw new Error(mode==='reset_password'?'La contraseña cambió, pero no se recibió la nueva clave':'La cuenta se activó, pero no se recibió la contraseña temporal');
      setCredentials({email:String(result?.email||member.email),password:temporaryPassword,changed:mode==='reset_password'||Boolean(result?.existing_account)});
      toast.success(mode==='reset_password'||result?.existing_account?'Contraseña actualizada y cuenta confirmada':'Acceso directo creado');await onCompleted();
    }catch(error){toast.error(error instanceof Error?error.message:'No se pudo administrar el acceso');}finally{setSaving(false);}
  };

  const setAction=(module:string,action:string,value:boolean)=>setPermissions(current=>({...current,[module]:{...((current[module] as ModulePermissions)||{}),[action]:value,...(action==='view'&&!value?Object.fromEntries(Object.keys((current[module] as ModulePermissions)||{}).filter(key=>key!=='view').map(key=>[key,false])):{})}}));
  const savePermissions=async()=>{
    if(!member)return;
    if(permissionReason.trim().length<3){toast.error('Indica el motivo del cambio de permisos');return;}
    setPermissionSaving(true);
    try{const{error}=await rpcClient.rpc('admin_set_team_permissions',{p_person_id:member.id,p_permissions:permissions,p_reason:permissionReason});if(error)throw error;toast.success('Permisos del Panel Master actualizados');setPermissionReason('');await onCompleted();}
    catch(error){toast.error(error instanceof Error?error.message:'No se pudieron guardar los permisos');}finally{setPermissionSaving(false);}
  };

  return <Dialog open={!!member} onOpenChange={open=>{if(!open)close();}}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
    <DialogHeader><DialogTitle>Administrar {member?.name}</DialogTitle><DialogDescription>{member?.email} · Acceso y permisos individuales</DialogDescription></DialogHeader>
    <Tabs defaultValue="acceso" className="space-y-4"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="acceso"><KeyRound className="mr-2 h-4 w-4"/>Acceso</TabsTrigger><TabsTrigger value="permisos"><SlidersHorizontal className="mr-2 h-4 w-4"/>Permisos Master</TabsTrigger></TabsList>
      <TabsContent value="acceso" className="space-y-5">
        {credentials?<div className="space-y-4"><div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><div className="mb-3 flex items-center gap-2 font-bold text-emerald-700"><Check className="h-4 w-4"/>{credentials.changed?'Contraseña actualizada':'Cuenta creada y activa'}</div><p className="text-xs text-muted-foreground">Estas credenciales se muestran una sola vez.</p><div className="mt-4 grid gap-3"><div><Label>Usuario</Label><Input readOnly value={credentials.email}/></div><div><Label>Contraseña</Label><Input readOnly value={credentials.password} className="font-mono font-bold"/></div></div></div><Button className="w-full" variant="outline" onClick={copyCredentials}><Copy className="mr-2 h-4 w-4"/>Copiar usuario y contraseña</Button></div>:<>
          {isFictitious&&<div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 text-sm"><b>Correo ficticio / solo usuario</b><p className="mt-1 text-xs text-muted-foreground">No se enviará invitación ni se pedirá verificarlo.</p></div>}
          {!hasAccount?<div className={cn('grid gap-3',!isFictitious&&'sm:grid-cols-2')}>{!isFictitious&&<button type="button" onClick={()=>setMode('invite')} className={cn('rounded-xl border p-4 text-left',mode==='invite'?'border-primary bg-primary/5 ring-1 ring-primary':'hover:bg-muted/50')}><Mail className="mb-3 h-5 w-5"/><p className="font-bold">Invitación por correo</p><p className="mt-1 text-xs text-muted-foreground">Para un buzón real.</p></button>}<button type="button" onClick={()=>setMode('direct')} className={cn('rounded-xl border p-4 text-left',mode==='direct'?'border-primary bg-primary/5 ring-1 ring-primary':'hover:bg-muted/50')}><KeyRound className="mb-3 h-5 w-5"/><p className="font-bold">Acceso directo</p><p className="mt-1 text-xs text-muted-foreground">Usuario y contraseña sin correo.</p></button></div>:<div className="rounded-xl border border-primary/30 bg-primary/5 p-4"><div className="flex items-center gap-2 font-bold"><KeyRound className="h-5 w-5"/>Cambiar contraseña</div><p className="mt-1 text-xs text-muted-foreground">No se necesita conocer la contraseña anterior.</p></div>}
          {(mode==='direct'||mode==='reset_password')&&<div className="space-y-2 rounded-xl border p-4"><Label>{mode==='reset_password'?'Nueva contraseña (opcional)':'Contraseña temporal (opcional)'}</Label><Input type="text" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Déjala vacía para generar una segura" autoComplete="off"/></div>}
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground"><ShieldCheck className="mr-1 inline h-4 w-4 text-amber-600"/>La contraseña nunca se guarda en texto plano.</div>
        </>}
        {!credentials&&<div className="flex justify-end"><Button onClick={createAccess} disabled={saving}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{mode==='invite'?'Enviar invitación':mode==='reset_password'?'Cambiar contraseña':'Crear acceso directo'}</Button></div>}
      </TabsContent>
      <TabsContent value="permisos" className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/[0.04] p-4"><div><p className="font-black">Acceso al Panel Master</p><p className="text-xs text-muted-foreground">Si está apagado, seguirá entrando únicamente a Mi Equipo. Si está activo, verá solo los módulos marcados abajo.</p></div><button type="button" onClick={()=>setPermissions(current=>({...current,master_access:!Boolean(current.master_access)}))} className={cn('relative h-7 w-12 rounded-full transition',masterAccess?'bg-primary':'bg-muted-foreground/30')}><span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all',masterAccess?'left-6':'left-1')}/></button></div>
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{enabledModules} módulo(s) visibles</span><span>Los permisos son exclusivos de {member?.name}</span></div>
        <div className="space-y-3">{MASTER_MODULES.map(module=>{const modulePermissions=(permissions[module.key] as ModulePermissions)||{};return <div key={module.key} className={cn('rounded-xl border p-4',masterAccess&&modulePermissions.view?'border-primary/30':'border-border')}><div className="flex items-center justify-between gap-3"><div><p className="font-bold">{module.label}</p><p className="text-[11px] text-muted-foreground">Primero habilita Ver; las acciones adicionales dependen de ese permiso.</p></div><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(modulePermissions.view)} disabled={!masterAccess} onChange={e=>setAction(module.key,'view',e.target.checked)}/> Ver</label></div>{module.actions.length>1&&<div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t pt-3">{module.actions.filter(([action])=>action!=='view').map(([action,label])=><label key={action} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(modulePermissions[action])} disabled={!masterAccess||!modulePermissions.view} onChange={e=>setAction(module.key,action,e.target.checked)}/>{label}</label>)}</div>}</div>})}</div>
        <div><Label>Motivo del cambio *</Label><Input value={permissionReason} onChange={e=>setPermissionReason(e.target.value)} placeholder="Ej. Se habilita facturación solo para auditoría" className="mt-1"/></div>
        <div className="flex justify-end"><Button onClick={savePermissions} disabled={permissionSaving}>{permissionSaving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Guardar permisos</Button></div>
      </TabsContent>
    </Tabs>
    <DialogFooter><Button variant="outline" onClick={close} disabled={saving||permissionSaving}>Cerrar</Button></DialogFooter>
  </DialogContent></Dialog>;
}
