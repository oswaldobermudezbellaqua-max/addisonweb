/* ============================================================
   ADDISON CLOUD — motor de sincronización en tiempo real (Supabase)
   Datos públicos por diseño (anon/publishable key). Rev.1 · ago-2026
   ============================================================ */
(function(){
  const URL = "https://agbubxdymzuslepjybef.supabase.co";
  const KEY = "sb_publishable_tKCsHId2mSOvARsv3XneIQ_8U_r13-A";
  const REST = URL + "/rest/v1/";
  const HDR = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json" };

  // hash djb2 (idéntico al de la APP)
  function hsh(s){let h=5381;for(let i=0;i<s.length;i++){h=((h<<5)+h+s.charCodeAt(i))>>>0;}return 'h'+h.toString(36)+s.length;}

  function online(){ return navigator.onLine; }

  // ---- API REST mínima sobre Supabase ----
  async function sel(table, query){
    const r = await fetch(REST+table+(query?('?'+query):''), {headers:HDR});
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
  // ============ ESTADO DE PROYECTO EN TIEMPO REAL ============
  // cfg = { proyecto:'sb', storeKey:'sb_ctrl3', getS:()=>S, apply:(data)=>{...}, badge:true }
  function initProject(cfg){
    let pushing=false, lastRemote=0, timer=null;
    const me = (function(){try{return (JSON.parse(sessionStorage.getItem('addison_sess')||localStorage.getItem('addison_sess')||'{}').u)||'?';}catch(e){return '?';}})();

    function setBadge(txt, color){
      let b=document.getElementById('adCloudBadge');
      if(!b){ b=document.createElement('div'); b.id='adCloudBadge';
        b.style.cssText='position:fixed;right:12px;bottom:12px;z-index:99999;font:800 8pt Segoe UI,Arial;padding:7px 13px;border-radius:16px;box-shadow:0 6px 18px rgba(0,0,0,.35);color:#fff';
        document.body.appendChild(b); }
      b.style.background=color||'#0f7a35'; b.textContent=txt;
    }

    async function pull(initial){
      try{
        const rows = await sel('estados_proyecto','proyecto=eq.'+cfg.proyecto+'&select=data,actualizado,por');
        if(!rows.length) return;
        const row=rows[0]; const ts=new Date(row.actualizado).getTime();
        if(ts<=lastRemote && !initial) return;
        lastRemote=ts;
        if(row.data && Object.keys(row.data).length){
          try{ localStorage.setItem(cfg.storeKey, JSON.stringify(row.data)); }catch(e){}
          if(cfg.apply) cfg.apply(row.data);
          if(!initial && row.por && row.por!==me) setBadge('🔄 Actualizado por '+row.por, '#1650a7');
        }
      }catch(e){ /* offline: seguimos con datos locales */ }
    }

    async function doPush(){
      if(!online()) { setBadge('⚠ Sin conexión — se guardó local', '#B26A00'); return; }
      pushing=true;
      try{
        const data = cfg.getS();
        await upsert('estados_proyecto',
          [{proyecto:cfg.proyecto, data:data, actualizado:new Date().toISOString(), por:me}], 'proyecto');
        lastRemote=Date.now()+500;
        setBadge('☁ Guardado y respaldado', '#0f7a35');
        snapshot(cfg.proyecto, (typeof data!=='undefined'?data:collect()), me);
      }catch(e){ setBadge('⚠ Error de nube — guardado local', '#B26A00'); }
      pushing=false;
    }
    function push(){ clearTimeout(timer); timer=setTimeout(doPush, 800); }
    window.cloudPush = push;

    // Sondeo de tiempo real (cada 6 s) — robusto y sencillo
    async function loop(){ if(!pushing) await pull(false); setTimeout(loop, 6000); }

    // Arranque: traer lo de la nube ANTES de mostrar, luego escuchar
    (async function(){
      setBadge('☁ Sincronizando…', '#0A2A4D');
      await pull(true);
      setBadge('☁ En la nube', '#0f7a35');
      setTimeout(()=>{ const b=document.getElementById('adCloudBadge'); if(b) b.style.opacity='0.55'; }, 2500);
      loop();
    })();
    window.addEventListener('online', ()=>{ setBadge('☁ Reconectado', '#0f7a35'); push(); });
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
    localStorage.setItem = function(k,v){ _set(k,v); if(k&&k.indexOf(pref)===0) push(); };
    localStorage.removeItem = function(k){ _rem(k); if(k&&k.indexOf(pref)===0) push(); };

    async function loop(){ if(!pushing) await pull(false); setTimeout(loop, 6000); }
    (async function(){ setBadge('☁ Sincronizando…','#0A2A4D'); await pull(true); setBadge('☁ Listo para la nube','#0f7a35'); setTimeout(()=>{const b=document.getElementById('adCloudBadge');if(b)b.style.opacity='0.55';},2500); loop(); })();
    window.addEventListener('online', ()=>{ setBadge('☁ Reconectado','#0f7a35'); push(); });
    window.addEventListener('offline', ()=>setBadge('⚠ Sin conexión','#B26A00'));
  }

  window.ADCloud = { hsh, login, listUsers, createUser, deleteUser, initProject, initMirror, online, listBackups, getBackup };
})();
