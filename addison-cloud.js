/* ============================================================
   ADDISON CLOUD — motor de sincronización en tiempo real (Supabase)
   Datos públicos por diseño (anon/publishable key). Rev.5 · 02-oct-2026 (escritura condicionada anti-colisión, hash canónico, sin publicaciones vacías)
   ============================================================ */
(function(){
  const URL = "https://agbubxdymzuslepjybef.supabase.co";
  const KEY = "sb_publishable_tKCsHId2mSOvARsv3XneIQ_8U_r13-A";
  const REST = URL + "/rest/v1/";
  const HDR = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json" };

  // hash djb2 (idéntico al de la APP)
  function hsh(s){let h=5381;for(let i=0;i<s.length;i++){h=((h<<5)+h+s.charCodeAt(i))>>>0;}return 'h'+h.toString(36)+s.length;}

  function online(){ return navigator.onLine; }
  // Serialización CANÓNICA (claves ordenadas): la nube (jsonb) reordena las claves, así que el hash
  // debe depender solo del contenido, nunca del orden en que se crearon los campos.
  function canon(v){
    if(v===null||typeof v!=='object') return JSON.stringify(v===undefined?null:v);
    if(Array.isArray(v)) return '['+v.map(canon).join(',')+']';
    const ks=Object.keys(v).filter(function(k){return v[k]!==undefined;}).sort();
    return '{'+ks.map(function(k){return JSON.stringify(k)+':'+canon(v[k]);}).join(',')+'}';
  }
  // Escritura CONDICIONADA: solo escribe si la fila sigue con el mismo 'actualizado' que leímos.
  // Devuelve true si escribió; false si otro equipo escribió antes (colisión) → hay que releer y fusionar.
  async function writeIf(table, key, keyVal, seenTs, obj){
    if(!seenTs){ await upsert(table, [Object.assign({},obj)], key); return true; }
    const q = key+'=eq.'+encodeURIComponent(keyVal)+'&actualizado=eq.'+encodeURIComponent(seenTs);
    const h = Object.assign({}, HDR, {"Prefer":"return=representation"});
    const r = await fetch(REST+table+'?'+q, {method:'PATCH', headers:h, body:JSON.stringify(obj)});
    if(!r.ok) throw new Error('patch '+table+' '+r.status+' '+(await r.text()));
    const rows = await r.json();
    return Array.isArray(rows) && rows.length>0;
  }

  // ---- API REST mínima sobre Supabase ----
  async function sel(table, query){
    const r = await fetch(REST+table+(query?('?'+query):''), {headers:HDR, cache:'no-store'});
    if(!r.ok) throw new Error('sel '+table+' '+r.status);
    return r.json();
  }
  async function upsert(table, obj, onConflict){
    const h = Object.assign({}, HDR, {"Prefer":"resolution=merge-duplicates,return=minimal"});
    const q = onConflict?('?on_conflict='+onConflict):'';
    const r = await fetch(REST+table+q, {method:'POST', headers:h, body:JSON.stringify(obj)});
    if(!r.ok) throw new Error('upsert '+table+' '+r.status+' '+(await r.text()));
    return true;
  }
  async function del(table, query){
    const r = await fetch(REST+table+'?'+query, {method:'DELETE', headers:HDR});
    if(!r.ok) throw new Error('del '+table+' '+r.status);
    return true;
  }

  // ============ USUARIOS GLOBALES ============
  async function login(u, c){
    u = (u||'').trim().toLowerCase();
    const rows = await sel('usuarios', 'u=eq.'+encodeURIComponent(u)+'&activo=eq.true&select=*');
    if(!rows.length) return null;
    const r = rows[0];
    if(r.h !== hsh(c)) return null;
    return { u:r.u, nom:r.nom, rol:r.rol, proy:r.proy, perms:r.perms };
  }
  async function listUsers(){ return sel('usuarios','select=*&order=creado_en.asc'); }
  async function createUser(obj){
    // obj: {u,claveEnClaro,nom,rol,proy,perms,creado_por}
    const row = { u:obj.u, h:hsh(obj.clave), nom:obj.nom, rol:obj.rol,
                  proy:obj.proy||[], perms:obj.perms||{}, activo:true, creado_por:obj.creado_por||'admin' };
    await upsert('usuarios', row, 'u');
    return true;
  }
  async function deleteUser(u){ if(u==='admin') throw new Error('admin protegido'); return del('usuarios','u=eq.'+encodeURIComponent(u)); }


  // ---- Respaldo automático versionado (cada edición → snapshot; retiene 30 por proyecto) ----
  async function snapshot(proyecto, data, usuario){
    try{
      await fetch(REST+'respaldos', {method:'POST', headers:Object.assign({},HDR,{Prefer:'return=minimal'}),
        body:JSON.stringify([{proyecto:proyecto, usuario:usuario, data:data}])});
      const olds = await sel('respaldos','proyecto=eq.'+proyecto+'&select=id&order=id.desc&offset=30');
      if(olds.length){
        const ids=olds.map(function(o){return o.id;}).join(',');
        await fetch(REST+'respaldos?id=in.('+ids+')',{method:'DELETE',headers:HDR});
      }
    }catch(e){/* el respaldo nunca debe bloquear el guardado */}
  }
  async function listBackups(proyecto){ return sel('respaldos','proyecto=eq.'+proyecto+'&select=id,usuario,en&order=id.desc&limit=30'); }
  async function getBackup(id){ const r=await sel('respaldos','id=eq.'+id+'&select=data'); return r.length?r[0].data:null; }

  // ---- Fusión anti-aplastamiento ----
  // Combina el estado de la nube (rem) con el local (loc) sin perder registros de ninguno:
  // listas → unión sin duplicados; mapas → registro por registro (gana el editor local);
  // valores simples → gana el local (es la intención del que está guardando).
  function keyOf(name, x){
    if(!x||typeof x!=='object') return null;
    if(x.id!==undefined&&x.id!==null&&x.id!=='') return 'id:'+x.id;
    if(name==='reps'&&x.f) return 'f:'+x.f;
    return null;
  }
  function sinFotos(x){ const o=Object.assign({},x); delete o.fotos; return JSON.stringify(o); }
  function todasRef(x){ return Array.isArray(x.fotos)&&x.fotos.length>0&&x.fotos.every(function(f){return String(f).indexOf('foto')===0;}); }
  // Une dos listas: los registros con clave (reps→fecha, id) quedan UNA sola vez (gana el local,
  // salvo que sólo difieran en fotos y una versión ya tenga las fotos en la nube); el resto, unión exacta.
  function mergeList(name, r, l){
    const seen={}, res=[], byKey={};
    l.concat(r).forEach(function(x){
      const key=keyOf(name,x);
      if(key){
        if(byKey[key]!==undefined){
          const prev=res[byKey[key]];               // versión local (va primero)
          if(sinFotos(prev)===sinFotos(x) && !todasRef(prev) && todasRef(x)) res[byKey[key]]=x;
          return;
        }
        byKey[key]=res.length; res.push(x); return;
      }
      const s=JSON.stringify(x); if(!seen[s]){seen[s]=1;res.push(x);}
    });
    return res;
  }
  // Devuelve los nombres de las listas/mapas donde `nuevo` tendría MENOS registros que `viejo`.
  const LISTAS=['reps','gastos','extras','pers','prov','serv','maqx','tram','sols','cots','ali'];
  function perdidas(viejo, nuevo){
    const out=[];
    if(!viejo||!nuevo) return out;
    LISTAS.forEach(function(k){
      if(Array.isArray(viejo[k]) && (viejo[k].length > ((nuevo[k]||[]).length))) out.push(k+' '+((nuevo[k]||[]).length)+'/'+viejo[k].length);
    });
    ['mov','fondo','arq'].forEach(function(k){
      const a=viejo.caja&&viejo.caja[k], b=nuevo.caja&&nuevo.caja[k];
      if(Array.isArray(a) && a.length > ((b||[]).length)) out.push('caja.'+k+' '+((b||[]).length)+'/'+a.length);
    });
    return out;
  }
  function mergeStates(rem, loc){ return mergeAny('', rem, loc); }
  // Fusión recursiva: listas → unión por clave; objetos → clave por clave (entrando también
  // en objetos anidados como `caja`, `proc` o `maq`); valores simples → gana el local.
  function mergeAny(name, r, l){
    if(l===undefined) return r; if(r===undefined) return l;
    if(Array.isArray(r)&&Array.isArray(l)) return mergeList(name, r, l);
    if(r&&l&&typeof r==='object'&&typeof l==='object'&&!Array.isArray(r)&&!Array.isArray(l)){
      const out={}, keys={};
      Object.keys(r).forEach(function(k){keys[k]=1;}); Object.keys(l).forEach(function(k){keys[k]=1;});
      Object.keys(keys).forEach(function(k){ out[k]=mergeAny(k, r[k], l[k]); });
      return out;
    }
    return l;
  }
  // ============ FOTOS FUERA DEL ESTADO (tabla fotos) ============
  // Las fotos de los reportes se guardan una por una en la tabla `fotos`; el estado del proyecto
  // sólo conserva la referencia 'foto:ID'. Así el estado pesa KB en vez de MB y ninguna cuota se llena.
  const FCACHE = {};
  let FTAB = null;   // 'fotos' | 'respaldos' (se decide una vez por sesión)
  async function tablaFotos(){
    if(FTAB) return FTAB;
    try{ const r=await fetch(REST+'fotos?select=id&limit=1',{headers:HDR,cache:'no-store'}); FTAB = r.ok ? 'fotos' : 'respaldos'; }
    catch(e){ FTAB='respaldos'; }
    return FTAB;
  }
  async function subirFoto(proyecto, rep, dataURL){
    const tab = await tablaFotos();
    const body = tab==='fotos' ? [{proyecto:proyecto, rep:rep||'', data:dataURL}]
                               : [{proyecto:'fotos_'+proyecto, usuario:'foto', data:{rep:rep||'', img:dataURL}}];
    const r = await fetch(REST+tab, {method:'POST', headers:Object.assign({},HDR,{Prefer:'return=representation'}), body:JSON.stringify(body)});
    if(!r.ok) throw new Error('subirFoto '+r.status);
    const j = await r.json(); const id = j[0].id;
    const ref = (tab==='fotos'?'foto:':'fotob:')+id; FCACHE[ref]=dataURL; return ref;
  }
  async function fotoData(ref){
    if(!ref) return '';
    ref=String(ref);
    if(ref.indexOf('foto:')!==0 && ref.indexOf('fotob:')!==0) return ref;   // base64 antiguo
    if(FCACHE[ref]) return FCACHE[ref];
    try{
      let d='';
      if(ref.indexOf('foto:')===0){ const rows=await sel('fotos','id=eq.'+ref.slice(5)+'&select=data'); d=rows.length?rows[0].data:''; }
      else { const rows=await sel('respaldos','id=eq.'+ref.slice(6)+'&select=data'); d=rows.length&&rows[0].data?rows[0].data.img:''; }
      if(d) FCACHE[ref]=d; return d||'';
    }catch(e){ return ''; }
  }
  function esRef(x){ x=String(x||''); return x.indexOf('foto:')===0||x.indexOf('fotob:')===0; }
  // Migra las fotos base64 que aún vivan dentro del estado (reps[].fotos) a la tabla fotos.
  async function migrarFotos(proyecto, S, onDone){
    if(!online()||!S||!Array.isArray(S.reps)) return 0;
    let n=0;
    for(const r of S.reps){
      if(!Array.isArray(r.fotos)) continue;
      for(let i=0;i<r.fotos.length;i++){
        const x=r.fotos[i];
        if(typeof x==='string' && x.indexOf('data:')===0){
          try{ r.fotos[i] = await subirFoto(proyecto, r.f, x); n++; }catch(e){ return n; }
        }
      }
    }
    if(n && onDone) onDone(n);
    return n;
  }
  // Rellena <img data-foto="foto:ID"> dentro de un contenedor
  function cargarImgs(root){
    (root||document).querySelectorAll('img[data-foto]').forEach(function(img){
      const ref=img.getAttribute('data-foto'); if(!ref) return;
      fotoData(ref).then(function(d){ if(d) img.src=d; img.removeAttribute('data-foto'); });
    });
  }
  // ============ ESTADO DE PROYECTO EN TIEMPO REAL ============
  // cfg = { proyecto:'sb', storeKey:'sb_ctrl3', getS:()=>S, apply:(data)=>{...}, badge:true }
  function initProject(cfg){
    let pushing=false, lastHash='', timer=null, pending=false, retryAt=0;
    const DK = cfg.storeKey+'_pend';              // bandera persistente: hay cambios locales sin subir
    const me = (function(){try{return (JSON.parse(sessionStorage.getItem('addison_sess')||localStorage.getItem('addison_sess')||'{}').u)||'?';}catch(e){return '?';}})();
    function hOf(d){ try{ return hsh(canon(d)); }catch(e){ return ''; } }
    function setPend(v){ pending=!!v; try{ if(v) localStorage.setItem(DK,'1'); else localStorage.removeItem(DK); }catch(e){} }
    function hasPend(){ try{ return pending || localStorage.getItem(DK)==='1'; }catch(e){ return pending; } }
    function saveLocal(d){ try{ localStorage.setItem(cfg.storeKey, JSON.stringify(d)); }catch(e){ /* cuota llena: la nube manda */ } }

    function setBadge(txt, color){
      let b=document.getElementById('adCloudBadge');
      if(!b){ b=document.createElement('div'); b.id='adCloudBadge';
        b.style.cssText='position:fixed;right:12px;bottom:12px;z-index:99999;font:800 8pt Segoe UI,Arial;padding:7px 13px;border-radius:16px;box-shadow:0 6px 18px rgba(0,0,0,.35);color:#fff';
        document.body.appendChild(b); }
      b.style.background=color||'#0f7a35'; b.textContent=txt; b.style.opacity='1';
    }

    window.ADCloud.proyecto = cfg.proyecto;
    async function pull(initial){
      try{
        const rows = await sel('estados_proyecto','proyecto=eq.'+cfg.proyecto+'&select=data,actualizado,por');
        if(!rows.length) return;
        const row=rows[0];
        if(!(row.data && Object.keys(row.data).length)) return;
        const h=hOf(row.data);
        if(h===lastHash && !initial) return;           // la nube no cambió (se compara CONTENIDO, no relojes)
        lastHash=h;
        let data=row.data, huboLocal=false;
        if(initial){
          // AL ABRIR: si este equipo tiene cambios que no llegaron a la nube, se FUSIONAN; nunca se pisan.
          let local=null; try{ local=JSON.parse(localStorage.getItem(cfg.storeKey)||'null'); }catch(e){}
          if(hasPend() && local && typeof local==='object' && Object.keys(local).length){
            const merged=mergeStates(row.data, local);
            if(JSON.stringify(merged)!==JSON.stringify(row.data)){ data=merged; huboLocal=true; }
          }
        }else if(hasPend()){
          // Hay un guardado local esperando subir: la nube se FUSIONA con él, no lo reemplaza.
          data=mergeStates(row.data, cfg.getS());
        }
        saveLocal(data);
        if(cfg.apply) cfg.apply(data);
        if(huboLocal){ setBadge('🔗 Se recuperaron cambios locales no subidos', '#1650a7'); push(); }
        else if(!initial && row.por && row.por!==me) setBadge('🔄 Actualizado por '+row.por, '#1650a7');
      }catch(e){ /* offline: seguimos con datos locales */ }
    }

    async function doPush(){
      if(!online()) { setBadge('⚠ Sin conexión — guardado local; se subirá al reconectar', '#B26A00'); return; }
      pushing=true; clearTimeout(timer); timer=null;
      try{
        let protegido=false, escrito=false, intentos=0;
        while(!escrito && intentos<4){
          intentos++;
          let data = cfg.getS();
          // Se lee la nube COMPLETA (contenido + sello de tiempo) justo antes de escribir
          let R=null, seenTs=null, desfasado=false;
          try{
            const rows = await sel('estados_proyecto','proyecto=eq.'+cfg.proyecto+'&select=data,actualizado');
            if(rows.length){ seenTs=rows[0].actualizado; if(rows[0].data && Object.keys(rows[0].data).length){ R=rows[0].data; desfasado=(hOf(R)!==lastHash); } }
          }catch(e){ /* si no se pudo leer, se intenta publicar igual */ }

          // CANDADO ANTI-BORRADO (estado al día): si lo que se publica tiene menos registros que la nube,
          // se pide confirmación expresa si la merma es grande; si no se confirma, se fusiona.
          if(R && !desfasado){
            const faltan = perdidas(R, data);
            const grande = faltan.some(function(x){ const n=x.split(' ')[1].split('/'); return (+n[1]-+n[0])>1; });
            if(faltan.length && grande){
              const ok = (typeof confirm==='function') && confirm('⚠ ATENCIÓN — posible pérdida de datos\n\nLo que este equipo va a publicar tiene MENOS registros que la nube:\n\n  · '+faltan.join('\n  · ')+'\n\n¿Confirmas que borraste eso a propósito?\n\nSi no estás seguro, pulsa Cancelar: se conservará todo.');
              if(!ok){ data = mergeStates(R, data); saveLocal(data); if(cfg.apply) cfg.apply(data); protegido=true; }
            }
          }
          // ANTI-APLASTAMIENTO (estado desfasado): otro equipo publicó algo que aquí no se vio → se FUSIONA.
          if(R && desfasado){
            data = mergeStates(R, data);
            const faltan = perdidas(R, data);
            if(faltan.length){
              setBadge('🛡 Publicación detenida para no borrar datos ('+faltan.join(', ')+')', '#b03a2e');
              pushing=false; retryAt=Date.now()+10000; return;
            }
            saveLocal(data); if(cfg.apply) cfg.apply(data);
            setBadge('🔗 Fusionado con cambios de otros usuarios', '#1650a7');
          }
          // SIN CAMBIOS REALES: no se publica nada (evita que un equipo "repita" un estado viejo)
          if(R && hOf(R)===hOf(data)){ lastHash=hOf(R); setPend(false); setBadge('☁ En la nube', '#0f7a35'); pushing=false; return; }

          // ESCRITURA CONDICIONADA: solo si nadie escribió entre la lectura y ahora. Si hubo colisión,
          // se vuelve a leer, fusionar y escribir (hasta 4 intentos). Nunca se pisa lo del otro equipo.
          escrito = await writeIf('estados_proyecto','proyecto',cfg.proyecto,seenTs,
            {proyecto:cfg.proyecto, data:data, actualizado:new Date().toISOString(), por:me});
          if(escrito){
            lastHash=hOf(data); setPend(false);
            setBadge(protegido?'🛡 Guardado — se conservaron los registros de la nube':'☁ Guardado y respaldado', protegido?'#1650a7':'#0f7a35');
            snapshot(cfg.proyecto, data, me);
          }else{
            lastHash='';   // fuerza la fusión con lo recién publicado por el otro equipo
            setBadge('🔁 Otro equipo guardó al mismo tiempo — fusionando…', '#1650a7');
            await new Promise(function(r){ setTimeout(r, 400+Math.random()*600); });
          }
        }
        if(!escrito){ retryAt=Date.now()+6000; setBadge('⚠ Nube ocupada — se reintenta en unos segundos', '#B26A00'); }
      }catch(e){ retryAt=Date.now()+8000; setBadge('⚠ Error de nube — guardado local, reintentando…', '#B26A00'); }
      pushing=false;
    }
    function push(){ setPend(true); clearTimeout(timer); timer=setTimeout(doPush, 800); }
    window.cloudPush = push;

    // Sondeo de tiempo real (cada 6 s) + reintento automático de lo pendiente
    async function loop(){
      if(!pushing){
        if(hasPend() && !timer && online() && Date.now()>=retryAt) await doPush();
        else await pull(false);
      }
      setTimeout(loop, 6000);
    }

    // Arranque: traer lo de la nube ANTES de mostrar, luego escuchar
    (async function(){
      setBadge('☁ Sincronizando…', '#0A2A4D');
      await pull(true);
      if(hasPend()){ push(); } else { setBadge('☁ En la nube', '#0f7a35'); }
      setTimeout(()=>{ const b=document.getElementById('adCloudBadge'); if(b) b.style.opacity='0.55'; }, 2500);
      loop();
      // Migrar fotos base64 que sigan dentro del estado → tabla de fotos (aligera estado, respaldos y sondeo)
      setTimeout(function(){ try{ migrarFotos(cfg.proyecto, cfg.getS(), function(n){ setBadge('📷 '+n+' fotos movidas a la nube', '#0f7a35'); try{ if(typeof window.save==='function') window.save(); }catch(e){} push(); }); }catch(e){} }, 4000);
    })();
    window.addEventListener('online', ()=>{ setBadge('☁ Reconectado', '#0f7a35'); if(hasPend()) push(); });
    window.addEventListener('offline', ()=>setBadge('⚠ Sin conexión', '#B26A00'));
  }

  // ============ MODO ESPEJO GENÉRICO ============
  // Deja una página "lista para la nube": cualquier dato que guarde en localStorage
  // bajo el prefijo indicado se sube solo, y se baja de la nube al abrir.
  // cfg = { proyecto:'p33', prefix:'p33_', onRemote?:function(map){} }
  function initMirror(cfg){
    const pref = cfg.prefix || (cfg.proyecto + '_');
    let lastRemote = 0, pushing = false, timer = null;
    const me = (function(){try{return (JSON.parse(sessionStorage.getItem('addison_sess')||localStorage.getItem('addison_sess')||'{}').u)||'?';}catch(e){return '?';}})();

    function setBadge(txt, color){
      let b=document.getElementById('adCloudBadge');
      if(!b){ b=document.createElement('div'); b.id='adCloudBadge';
        b.style.cssText='position:fixed;right:12px;bottom:12px;z-index:99999;font:800 8pt Segoe UI,Arial;padding:7px 13px;border-radius:16px;box-shadow:0 6px 18px rgba(0,0,0,.35);color:#fff';
        document.body.appendChild(b);} b.style.background=color||'#0f7a35'; b.textContent=txt;
    }
    function collect(){ const o={}; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.indexOf(pref)===0) o[k]=localStorage.getItem(k); } return o; }
    function applyMap(map){ let changed=false; Object.keys(map||{}).forEach(function(k){ if(localStorage.getItem(k)!==map[k]){ try{localStorage.setItem(k,map[k]);changed=true;}catch(e){} } }); return changed; }

    async function pull(initial){
      try{
        const rows = await sel('estados_proyecto','proyecto=eq.'+cfg.proyecto+'&select=data,actualizado,por');
        if(!rows.length) return;
        const row=rows[0], ts=new Date(row.actualizado).getTime();
        if(ts<=lastRemote && !initial) return;
        lastRemote=ts;
        if(row.data && Object.keys(row.data).length){
          const changed=applyMap(row.data);
          if(changed){
            if(cfg.onRemote) cfg.onRemote(row.data);
            else if(!initial){ setBadge('🔄 Datos actualizados', '#1650a7'); setTimeout(()=>location.reload(), 600); }
          }
        }
      }catch(e){}
    }
    async function doPush(){
      if(!online()){ setBadge('⚠ Sin conexión — guardado local', '#B26A00'); return; }
      pushing=true;
      try{
        await upsert('estados_proyecto',[{proyecto:cfg.proyecto, data:collect(), actualizado:new Date().toISOString(), por:me}], 'proyecto');
        lastRemote=Date.now()+500; setBadge('☁ Guardado en la nube', '#0f7a35');
      }catch(e){ setBadge('⚠ Error de nube — guardado local', '#B26A00'); }
      pushing=false;
    }
    function push(){ clearTimeout(timer); timer=setTimeout(doPush, 800); }
    window.cloudPush = push;

    // Interceptar escrituras a localStorage con el prefijo del proyecto
    const _set = localStorage.setItem.bind(localStorage);
    const _rem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function(k,v){ try{ _set(k,v); }catch(e){} if(k&&k.indexOf(pref)===0) push(); };
    localStorage.removeItem = function(k){ _rem(k); if(k&&k.indexOf(pref)===0) push(); };

    async function loop(){ if(!pushing) await pull(false); setTimeout(loop, 6000); }
    (async function(){ setBadge('☁ Sincronizando…','#0A2A4D'); await pull(true); setBadge('☁ Listo para la nube','#0f7a35'); setTimeout(()=>{const b=document.getElementById('adCloudBadge');if(b)b.style.opacity='0.55';},2500); loop(); })();
    window.addEventListener('online', ()=>{ setBadge('☁ Reconectado','#0f7a35'); push(); });
    window.addEventListener('offline', ()=>setBadge('⚠ Sin conexión','#B26A00'));
  }

  window.ADCloud = { hsh, canon, login, listUsers, createUser, deleteUser, initProject, initMirror, online, listBackups, getBackup, mergeStates, perdidas, subirFoto, fotoData, esRef, migrarFotos, cargarImgs, proyecto:null };
})();
