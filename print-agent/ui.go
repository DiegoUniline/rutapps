package main

const uiHTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rutapp Impresora</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#111827;--mut:#6b7280;--bd:#e5e7eb;--pri:#2563eb;--ok:#16a34a;--err:#dc2626}
*{box-sizing:border-box}body{margin:0;font:14px system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--fg)}
.w{max-width:460px;margin:40px auto;padding:0 16px}.c{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:22px}
h1{font-size:18px;margin:0 0 4px}p{color:var(--mut);margin:0 0 18px;font-size:12px}label{display:block;font-weight:600;font-size:12px;margin:14px 0 6px}
select,button{width:100%;padding:10px;border-radius:8px;border:1px solid var(--bd);font:inherit;background:#fff}
.seg{display:flex;gap:8px}.seg button{flex:1;font-weight:600}.seg .on{background:var(--pri);color:#fff;border-color:var(--pri)}
.row{display:flex;gap:8px;margin-top:20px}.pri{background:var(--pri);color:#fff;border-color:var(--pri);font-weight:600}
#msg{margin-top:14px;font-size:12px;min-height:16px}.ok{color:var(--ok)}.err{color:var(--err)}
.ft{display:flex;justify-content:space-between;margin-top:14px;font-size:11px;color:var(--mut)}.ft a{color:var(--mut);cursor:pointer}
</style></head><body><div class="w"><div class="c">
<h1>Rutapp Impresora</h1><p>Agente activo. Elige la impresora de tickets y el ancho del papel.</p>
<label>Impresora</label><select id="pr"></select>
<label>Ancho de papel</label><div class="seg"><button data-a="58">58 mm</button><button data-a="80">80 mm</button></div>
<div class="row"><button id="test">Imprimir prueba</button><button id="save" class="pri">Guardar</button></div>
<div id="msg"></div>
<div class="ft"><span id="ver"></span><a id="un">Desinstalar</a></div>
</div></div>
<script>
let ancho='80';const $=s=>document.querySelector(s);
const msg=(t,ok)=>{const m=$('#msg');m.textContent=t;m.className=ok?'ok':'err'};
const seg=()=>document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.a===ancho));
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{ancho=b.dataset.a;seg()});
const post=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})}).then(r=>r.json());
async function init(){
 const [st,pl]=await Promise.all([fetch('/status').then(r=>r.json()),fetch('/printers').then(r=>r.json())]);
 ancho=st.ancho||'80';seg();$('#ver').textContent='v'+st.version;
 const sel=st.printer||pl.default||'';$('#pr').innerHTML=(pl.printers||[]).map(p=>'<option'+(p===sel?' selected':'')+'>'+p.replace(/</g,'&lt;')+'</option>').join('')||'<option value="">No hay impresoras instaladas</option>';
}
$('#save').onclick=async()=>{const r=await post('/config',{printer:$('#pr').value,ancho});r.ok?msg('Guardado. Ya puedes imprimir desde Rutapp.',1):msg(r.error)};
$('#test').onclick=async()=>{msg('Imprimiendo…',1);const r=await post('/test',{printer:$('#pr').value,ancho});r.ok?msg('Prueba enviada a '+r.printer,1):msg(r.error)};
$('#un').onclick=async()=>{if(!confirm('¿Desinstalar Rutapp Impresora?'))return;await post('/uninstall').catch(()=>{});document.body.innerHTML='<div class="w"><div class="c">Desinstalado. Puedes cerrar esta pestaña.</div></div>'};
init().catch(e=>msg(String(e)));
</script></body></html>`
