(function () {
  'use strict';
  const data = window.LV4_DATA;
  if (!data) return;
  const { start, cut, end, items } = data;
  const titles = {
    civil: 'Fundaciones y obra civil', estructura: 'Estructura y arriostramiento',
    pintura: 'Fondo anticorrosivo y esmalte', cubierta: 'Cubierta Acerolit',
    drenaje: 'Canaletas y bajantes', cerramiento: 'Cerramiento lateral',
    electricidad: 'Electricidad y fotovoltaico', transporte: 'Transporte y movilización',
  };
  const schedule = [
    { group: 'estructura', label: 'Galpón 2 · fabricar y montar estructura', from: '2026-11-20', to: '2026-11-30', share: 1 },
    { group: 'pintura', label: 'Galpón 2 · fondo, esmalte y retoques por tramo', from: '2026-11-20', to: '2026-12-02', share: 1 },
    { group: 'cubierta', label: 'Galpón 1 · terminar cubierta', from: '2026-11-20', to: '2026-11-26', share: 267.696 / 715.936 },
    { group: 'cubierta', label: 'Galpón 2 · instalar cubierta por tramos liberados', from: '2026-12-01', to: '2026-12-06', share: 448.24 / 715.936 },
    { group: 'drenaje', label: 'Galpón 1 · instalar drenaje pluvial', from: '2026-11-27', to: '2026-12-03', share: 0.5 },
    { group: 'drenaje', label: 'Galpón 2 · instalar drenaje pluvial', from: '2026-12-02', to: '2026-12-07', share: 0.5 },
    { group: 'cerramiento', label: 'Ambos galpones · instalar pantallas laterales', from: '2026-11-27', to: '2026-12-07', share: 1 },
    { group: 'electricidad', label: 'Instalar alumbrado, protecciones y sistema solar', from: '2026-12-08', to: '2026-12-11', share: 1 },
    { label: 'Pruebas funcionales, drenaje y entrega', from: '2026-12-12', to: '2026-12-12', milestone: true },
  ];
  const historicalEvidence = {
    '2026-11-16': 'El diario registra 6 de las 10 columnas del galpón 2 instaladas y el armado de 14 m de canaletas y bajantes. El armado se registra como fabricación.',
    '2026-11-17': 'El diario registra el montaje de las 4 columnas restantes del galpón 2, el inicio de fabricación de cabrillas y la continuidad de cubierta en el galpón 1.',
    '2026-11-18': 'El diario registra 95 m² de cubierta colocados durante la jornada en el galpón 1, recubrimientos y fabricación de cabrillas del galpón 2. Los 95 m² corresponden a la jornada.',
  };
  const el = id => document.getElementById(id);
  const ms = f => Date.parse(f + 'T00:00:00Z');
  const days = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
  const dateAt = (f, d) => new Date(ms(f) + d * 86400000).toISOString().slice(0, 10);
  const dateLabel = f => f.slice(8) + '/' + f.slice(5, 7);
  const number = (n, digits = 2) => Number(n).toLocaleString('es-VE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = n => n === null || n === undefined ? '—' : number(n) + ' %';
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const esc = input => String(input ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const prose = input => esc(input || 'Sin registro en este corte.').replace(/\n/g, '<br>');
  const code = p => String(p.id).padStart(2, '0');
  const opening = items.reduce((sum, p) => sum + p.opening, 0);
  const groupBalance = Object.fromEntries(Object.keys(titles).map(group => [
    group, items.filter(p => p.group === group).reduce((sum, p) => sum + p.weight - p.opening, 0),
  ]));
  let bridge;
  let draft = new Map();
  let formDate = '';
  let loadedReport = null;

  function today() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = type => parts.find(p => p.type === type).value;
    return value('year') + '-' + value('month') + '-' + value('day');
  }
  function reports() {
    return (bridge.getReports() || []).filter(r => /^\d{4}-\d\d-\d\d$/.test(r.f)).slice().sort((a, b) => a.f.localeCompare(b.f));
  }
  function validPercent(x) { return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100; }
  function earned(item, quantity) {
    if (item.qty <= item.field) return item.weight;
    const fraction = clamp((quantity - item.field) / (item.qty - item.field), 0, 1);
    return item.opening + (item.weight - item.opening) * fraction;
  }
  function valuesOn(date, allReports) {
    const quantities = new Map(items.map(p => [p.id, p.field]));
    for (const report of allReports) {
      if (report.f < cut || report.f > date) continue;
      for (const [id, q] of Object.entries(report.lv4?.quantities || {})) {
        const item = items.find(p => p.id === Number(id));
        if (item && typeof q === 'number' && Number.isFinite(q) && q >= item.field - 0.00001 && q <= item.qty) {
          quantities.set(item.id, q);
        }
      }
    }
    const integral = items.reduce((sum, p) => sum + earned(p, quantities.get(p.id)), 0);
    return { quantities, integral };
  }
  function planned(date) {
    if (date < cut) return null;
    if (date >= end) return 100;
    return opening + schedule.reduce((sum, row) => {
      if (row.milestone) return sum;
      const fraction = clamp((days(row.from, date) + 1) / (days(row.from, row.to) + 1), 0, 1);
      return sum + groupBalance[row.group] * row.share * fraction;
    }, 0);
  }
  function daily(date, allReports) {
    const recorded = allReports.find(r => r.f === date);
    if (date < cut) {
      const reviewed = recorded?.lv4?.historical;
      return {
        date, recorded, history: true,
        integral: validPercent(reviewed?.integral) && reviewed.ref ? reviewed.integral : null,
        ref: reviewed?.ref || '', plan: null,
      };
    }
    const values = valuesOn(date, allReports);
    const last = allReports.filter(r => r.f >= cut && r.f <= date && Object.keys(r.lv4?.quantities || {}).length).at(-1);
    return { ...values, date, recorded, history: false, plan: planned(date), lastMeasure: last?.f || cut };
  }
  function difference(day) {
    if (!validPercent(day.integral) || !validPercent(day.plan)) return '—';
    const delta = day.integral - day.plan;
    return (delta > 0.00001 ? '+' : '') + number(delta) + ' pts';
  }
  function historyTable(allReports, until, limit = 0) {
    const dates = [...new Set([...allReports.map(r => r.f), cut])].sort().filter(f => !until || f <= until);
    const rows = limit ? dates.slice(-limit) : dates;
    return '<div class="lv-scroll"><table><thead><tr><th>Fecha</th><th>Día</th><th>Plan</th><th>Real</th><th>Desviación</th><th>Estado del corte</th></tr></thead><tbody>' +
      rows.map(date => {
        const d = daily(date, allReports);
        const status = d.history ? (d.ref || 'Pendiente de conciliación documental') : (date === cut ? 'Corte base de sinceración' : 'Metrado al ' + dateLabel(d.lastMeasure));
        const day = days(start,date)+1;
        return '<tr><td>' + dateLabel(date) + '</td><td>' + (day > 0 ? day : '—') + '</td><td>' + pct(d.plan) + '</td><td><b>' + pct(d.integral) + '</b></td><td>' + difference(d) + '</td><td>' + esc(status) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function chart(allReports, until) {
    const width = 700, height = 228, left = 46, right = 20, top = 23, bottom = 42;
    const first = until && until < cut ? start : cut;
    const last = allReports.at(-1)?.f > end ? allReports.at(-1).f : end;
    const x = f => left + days(first, f) / days(first, last) * (width - left - right);
    const y = v => height - bottom - clamp(v, 0, 100) / 100 * (height - top - bottom);
    const points = (rows, prop) => rows.filter(r => validPercent(r[prop])).map(r => x(r.date).toFixed(1) + ',' + y(r[prop]).toFixed(1)).join(' ');
    const dates = [...new Set([...allReports.map(r => r.f), cut])].sort();
    const rows = dates.filter(f => f >= first && (!until || f <= until)).map(f => daily(f, allReports));
    const oldRows = rows.filter(r => r.history);
    const newRows = rows.filter(r => !r.history && (r.date === cut || r.lastMeasure === r.date));
    const planRows = Array.from({ length: days(cut, end) + 1 }, (_, i) => {
      const date = dateAt(cut, i); return { date, plan: planned(date) };
    });
    const line = (pts, color, dash = '') => pts ? '<polyline fill="none" stroke="' + color + '" stroke-width="2.4" ' + (dash ? 'stroke-dasharray="' + dash + '" ' : '') + 'points="' + pts + '"/>' : '';
    const dot = (rows, key, color) => rows.filter(r => validPercent(r[key])).map(r => '<circle cx="' + x(r.date) + '" cy="' + y(r[key]) + '" r="3" fill="' + color + '"><title>' + r.date + ' · ' + pct(r[key]) + '</title></circle>').join('');
    const ticks = [first, ...['2026-11-26','2026-12-03','2026-12-10'].filter(f=>f>first&&days(f,last)>3), last];
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Curva de avance real y programado al 12 de diciembre" style="width:100%;height:auto;background:#fff">' +
      [0, 25, 50, 75, 100].map(v => '<line x1="' + left + '" x2="' + (width-right) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#d6e1ed"/><text x="' + (left-7) + '" y="' + (y(v)+4) + '" text-anchor="end" font-size="11" fill="#475e76">' + v + '%</text>').join('') +
      ticks.map(f => '<text x="' + x(f) + '" y="' + (height-bottom+19) + '" text-anchor="middle" font-size="11" fill="#475e76">' + dateLabel(f) + '</text>').join('') +
      (until && until < cut ? '' : line(points(planRows, 'plan'), '#3074b8')) +
      line(points(newRows, 'integral'), '#116b58') + dot(newRows, 'integral', '#116b58') +
      dot(oldRows, 'integral', '#116b58') + '</svg>' +
      '<p><span style="color:#225b8f">— Plan programado</span> · <span style="color:#116b58">— Avance real</span></p>';
  }
  const catalogItems = new Map();
  for (const item of items) {
    if (item.legacy) catalogItems.set(item.legacy, [...(catalogItems.get(item.legacy) || []), item]);
  }
  function rowPercent(id, state) {
    const related = catalogItems.get(id) || [];
    const base = related.reduce((total,p)=>total+p.weight,0);
    return base ? clamp(related.reduce((total,p)=>total+earned(p,state.quantities.get(p.id)),0)/base*100,0,100) : null;
  }
  function period(row) {
    const related = catalogItems.get(row.n) || [];
    const groups = new Set(related.filter(p=>p.qty>p.field).map(p=>p.group));
    const windows = schedule.filter(w=>groups.has(w.group));
    if (windows.length) return { from:windows.map(w=>w.from).sort()[0], to:windows.map(w=>w.to).sort().at(-1) };
    const cutoffDay = days(start,cut);
    const from = clamp(row.a-1,0,cutoffDay);
    return { from:dateAt(start,from), to:dateAt(start,clamp(row.b-1,from,cutoffDay)) };
  }
  function progress(all, through) {
    const asOf = through < cut ? cut : through;
    const d = daily(asOf,all), last = d.lastMeasure;
    const previous = [cut,...all.filter(r=>r.f>=cut&&r.f<last&&Object.keys(r.lv4?.quantities||{}).length).map(r=>r.f)]
      .find(f=>days(f,last)>0&&days(f,last)<=14);
    const earlier = previous ? valuesOn(previous,all) : null;
    const span = earlier ? days(previous,last) : 0;
    const rate = span ? (d.integral-earlier.integral)/span : null;
    const projection = rate>=0.01&&d.integral<100 ? dateAt(last,Math.ceil((100-d.integral)/rate)) : null;
    return { d,last,earlier,span,rate,projection };
  }
  function ganttChart(summary, mode) {
    const { d,last,earlier,span,projection } = summary;
    const rows = bridge.getPartidas();
    const width=1000, left=237, right=36, top=54, rowH=23, height=top+rows.length*rowH+43;
    const axisEnd = [end,last,projection].filter(Boolean).sort().at(-1);
    const extent = clamp(days(start,axisEnd),days(start,end),days(start,end)+30);
    const x = f=>left+clamp(days(start,f),0,extent)*(width-left-right)/extent;
    const ticks = Array.from({length:Math.floor(extent/7)+1},(_,i)=>dateAt(start,i*7))
      .filter(f=>f===start||Math.abs(days(f,end))>3);
    ticks.push(end);
    ticks.sort();
    const colors={C1:'#8a5a2b',C2:'#014695',C3:'#0d676c',C4:'#6a3e9e',C5:'#c45e00',C6:'#8a96ad'};
    const label = (xx,yy,v,attr='')=>'<text x="'+xx+'" y="'+yy+'" font-size="9" fill="#314963" '+attr+'>'+esc(v)+'</text>';
    const rect = (xx,yy,ww,hh,color,extra='')=>'<rect x="'+xx+'" y="'+yy+'" width="'+Math.max(2,ww)+'" height="'+hh+'" fill="'+color+'" '+extra+'/>';
    const mark = (f, color) => '<line x1="'+x(f)+'" x2="'+x(f)+'" y1="34" y2="'+(height-34)+'" stroke="'+color+'" stroke-width="1.3"/>';
    let body = ticks.map((f,i) => {
      const nx=x(ticks[i+1]||dateAt(start,extent));
      return (i%2===0&&nx>x(f)?rect(x(f),34,nx-x(f),height-68,'#edf3fa'):'')+
        mark(f,'#d9e3ee')+label(x(f),height-15,dateLabel(f),'text-anchor="middle"');
    }).join('');
    rows.forEach((row,i)=>{
      const yy=top+i*rowH, window=period(row);
      const a=x(window.from), b=x(window.to), length=Math.max(5,b-a);
      const measured=rowPercent(row.n,d);
      body+=label(left-6,yy+10,(row.cod||row.n)+' · '+row.t.slice(0,39),'text-anchor="end"');
      if(measured===null) return;
      if(mode==='plan'){
        body+=rect(a,yy,length,14,colors[row.s]||'#014695','rx="3"');
        if(measured>0) body+=rect(a,yy,length*measured/100,14,'#ffc400','rx="3" opacity="0.85"');
        if(length>48) body+=label((a+b)/2,yy+10,Math.round(measured)+' %','text-anchor="middle" style="fill:'+(measured>=50?'#0a2a4d':'#fff')+';font-weight:bold"');
      } else {
        body+=rect(a,yy+2,length,3,'#9aaabd','opacity="0.72"');
        const baseline=rowPercent(row.n,valuesAtCut);
        if(measured>0) {
          const xa=x(cut), xb=x(last);
          const realColor=measured>=99.999?'#0a2a4d':'#176854';
          if(measured>baseline+0.00001&&xb>xa) body+=rect(xa,yy+6,xb-xa,10,realColor,'rx="2"');
          body+='<circle cx="'+xb+'" cy="'+(yy+11)+'" r="3.8" fill="'+realColor+'"><title>'+esc(pct(measured))+'</title></circle>';
          body+=label(xb+6,yy+14,pct(measured));
        }
        const old=earlier?rowPercent(row.n,earlier):null;
        const pace=old===null||!span?0:(measured-old)/span;
        if(pace>=0.01&&measured<99.999) {
          const projected=dateAt(last,Math.ceil((100-measured)/pace));
          body+=rect(x(last),yy+7,x(projected)-x(last),8,'#176854','opacity=".3" stroke="#176854" stroke-dasharray="3 2"');
        }
      }
    });
    body+=mark(end,'#0a2a4d')+label(x(end),24,'META 12/12','text-anchor="middle"');
    body+=mark(last,'#b03a2e')+label(x(last),mode==='plan'?24:13,'CORTE '+dateLabel(last),'text-anchor="middle"');
    const name=mode==='plan'?'Programa por partida':'Ejecución real y proyección por partida';
    return '<div class="lv-gantt"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+name+'" style="width:100%;height:auto;background:#fff">'+body+'</svg></div>';
  }
  const valuesAtCut = valuesOn(cut, []);
  function ganttView(all, through) {
    const p = progress(all, through), dateDay=days(start,p.d.date)+1, available=days(p.d.date,end);
    const cards = [
      [pct(p.d.plan),'Plan al día '+dateDay],
      [pct(p.d.integral),'Real al corte '+dateLabel(p.last)],
      [difference(p.d),'Desviación real − plan'],
      [p.rate===null?'—':number(p.rate)+' %/d','Ritmo medido'],
      [p.projection?dateLabel(p.projection):'—','Terminación proyectada'],
      [available>0?number((100-p.d.integral)/available)+' %/d':'—','Ritmo para cerrar al 12/12'],
    ];
    return '<div class="kpi" style="margin:6px 0 10px">'+cards.map(([v,t])=>'<div class="kb"><div class="v">'+esc(v)+'</div><div class="l">'+esc(t)+'</div></div>').join('')+'</div>'+
      '<h5 style="margin:8px 0 4px">A · PROGRAMA (PLAN) — ventanas por partida y porcentaje real</h5>'+
      '<p>05/10–12/12/2026 · 69 días calendario. Relleno amarillo = avance real.</p>'+ganttChart(p,'plan')+
      '<h5 style="margin:14px 0 4px">B · EJECUCIÓN REAL Y PROYECCIÓN — según los reportes diarios</h5>'+
      '<p>La línea gris marca la ventana programada. La proyección se calcula cuando hay dos cortes comparables.</p>'+ganttChart(p,'real');
  }
  function pendingList(state) {
    const groups = [...new Set(items.filter(p=>state.quantities.get(p.id)<p.qty-0.00001).map(p=>p.group))];
    return groups.length ? groups.map(group=>{
      const windows=schedule.filter(row=>row.group===group);
      return '<div style="border-left:3px solid var(--blue);padding-left:6px;margin:5px 0"><b>'+esc(titles[group])+'</b> · '+windows.map(w=>esc(w.label)+' ('+dateLabel(w.from)+'–'+dateLabel(w.to)+')').join(' · ')+'</div>';
    }).join('') : '<span class="ok-r">Sin actividades pendientes.</span>';
  }
  function renderGantt() {
    const target = el('ganttBox');
    if (target) target.innerHTML = ganttView(reports(),today());
  }
  function render() {
    const all = reports();
    const last = (...xs) => xs.sort().at(-1);
    const selected = el('rFecha')?.value || last(all.at(-1)?.f || cut, cut);
    const day = daily(selected, all);
    el('curva').innerHTML = chart(all, selected);
    el('tabContraste').innerHTML = historyTable(all, selected, 10);
    el('desv').className = 'callout';
    el('desv').innerHTML = day.history
      ? '<b>Registro del ' + dateLabel(selected) + '.</b> Real: ' + pct(day.integral) + '. ' + esc(day.ref || historicalEvidence[selected] || 'La conciliación requiere respaldo de ese día.')
      : '<b>Al ' + dateLabel(selected) + ' · día ' + (days(start, selected)+1) + '.</b> Real: ' + pct(day.integral) + ' · Plan: ' + pct(day.plan) + ' · Desviación: ' + difference(day) + ' · Último corte: ' + dateLabel(day.lastMeasure) + '.';
    const current = daily(today() < cut ? cut : today(), all);
    el('hoyPend').innerHTML = pendingList(current);
    renderGantt();
    kpis();
  }
  function kpis() {
    const date = today() < cut ? cut : today(), state = daily(date, reports());
    el('kAv').textContent = pct(state.integral);
    el('kPlanHoy').textContent = pct(state.plan);
  }
  function loadForm() {
    const f = el('rFecha').value;
    const all = reports();
    const current = all.find(r => r.f === f);
    const saved = current?.lv4;
    formDate = f;
    loadedReport = JSON.stringify(current || null);
    draft = new Map(Object.entries(saved?.quantities || {}).map(([id,q]) => [Number(id),q]));
    const editor = el('lvRevEditor');
    if (!editor) return;
    const access = bridge.canEdit();
    if (f < cut) {
      const h = saved?.historical || {};
      editor.innerHTML = '<h5>2 · Avance acumulado del corte anterior</h5>' +
        '<label>Avance real (%) <input id="lvOldIntegral" type="number" min="0" max="100" step="0.01" value="' + (validPercent(h.integral) ? h.integral : '') + '"></label><br>' +
        '<label>Planilla, diario o acta de respaldo <input id="lvOldSource" maxlength="220" type="text" value="' + esc(h.ref || '') + '"></label>' +
        (historicalEvidence[f] ? '<p>' + esc(historicalEvidence[f]) + '</p>' : '');
    } else {
      editor.innerHTML = '<h5>2 · Avance por partida (acumulado)</h5><p>Actualiza las cantidades acumuladas de las partidas medidas en este día.</p>' +
        '<label>Partida <select id="lvPartida"><option value="">Seleccionar</option>' +
        items.filter(p => p.field < p.qty).map(p => '<option value="' + p.id + '">' + code(p) + ' · ' + esc(p.label.slice(0, 70)) + '</option>').join('') + '</select></label> ' +
        '<label>Cantidad <input id="lvQuantity" type="number" min="0" step="any" style="width:110px"></label> <button type="button" id="lvAdd" class="btn sm">Añadir medición</button>' +
        '<p id="lvMeterHint"></p><div id="lvDraft"></div>';
      const showDraft = () => {
        el('lvDraft').innerHTML = [...draft].map(([id, q]) => '<span class="chip">Partida ' + id + ': ' + number(q, 3) + ' ' + esc(items.find(p => p.id === id)?.unit || '') + '</span>').join(' ');
      };
      const showHint = () => {
        const p = items.find(r => r.id === Number(el('lvPartida').value));
        el('lvMeterHint').textContent = !p ? '' : 'Anterior: ' + number(valuesOn(dateAt(f, -1), all).quantities.get(p.id), 3) + ' ' + p.unit + ' · Contratado: ' + number(p.qty, 3) + ' ' + p.unit + '.';
        if (p) el('lvQuantity').value = draft.get(p.id) ?? '';
      };
      el('lvPartida').addEventListener('change', showHint);
      el('lvAdd').addEventListener('click', () => {
        if (!bridge.canEdit()) return;
        const p = items.find(r => r.id === Number(el('lvPartida').value));
        const input = el('lvQuantity'), q = Number(input.value);
        if (!p || !input.value || !Number.isFinite(q)) return alert('Selecciona la partida y escribe la cantidad acumulada.');
        if (q < p.field - 0.00001 || q > p.qty) return alert('La cantidad debe estar entre el metrado de apertura y el contratado.');
        const prior = valuesOn(dateAt(f, -1), all).quantities.get(p.id);
        if (q < prior && !confirm('La cantidad es menor a la del corte anterior. ¿Registrar esta corrección?')) return;
        draft.set(p.id, q);
        showDraft();
      });
      showDraft();
    }
    if (!access) editor.querySelectorAll('input,select,button').forEach(input => input.disabled = true);
    const info = el('rDiaInfo');
    if (info) info.textContent = f < cut ? 'Diario histórico · corte por conciliar' : 'Día ' + (days(start,f)+1) + ' · fecha tope 12/12/2026';
    if (el('lvLegacyEditor')) el('lvLegacyEditor').hidden = true;
    for (const id of ['rTexto', 'rNov', 'rFotos', 'rPers']) {
      if (el(id)) el(id).disabled = !access || f < cut;
    }
    if (el('lvSave')) el('lvSave').textContent = f < cut ? 'Guardar conciliación histórica' : 'Guardar reporte del día';
  }
  function readForm(f, previous) {
    if (f !== formDate || loadedReport !== JSON.stringify(previous || null)) {
      throw new Error('El corte cambió durante la edición. Conserva una copia de tu borrador y vuelve a abrir esa fecha antes de guardar.');
    }
    if (f >= cut) return { quantities: Object.fromEntries(draft) };
    const ref = el('lvOldSource')?.value.trim() || '';
    const rawIntegral = el('lvOldIntegral')?.value || '';
    const integral = rawIntegral === '' ? null : Number(rawIntegral);
    if (!ref || !validPercent(integral)) {
      throw new Error('Indica el avance real de esa fecha y su respaldo documental.');
    }
    return { historical: { ...previous?.lv4?.historical, integral, ref } };
  }
  function list() {
    const all = reports();
    const dates = [...new Set([...all.map(r => r.f), cut])].sort().reverse();
    el('rCount').textContent = all.length + ' diarios · corte de control 19/11';
    el('rLista').innerHTML = dates.map(date => {
      const d = daily(date, all), originalIndex = bridge.getReports().findIndex(r => r.f === date);
      const status = 'Real: <b>' + pct(d.integral) + '</b> · Plan: ' + pct(d.plan) + (d.history&&!d.ref?' · Pendiente de conciliación':'');
      return '<div class="repcard"><b>' + date + '</b> · ' + status +
        ' <button type="button" class="btn sm g" onclick="LVRevision.print(\'' + date + '\')">' + (d.history ? 'PDF revisión del corte' : d.recorded ? 'PDF reporte ajustado' : 'Vista del corte') + '</button>' +
        (originalIndex >= 0 && d.history ? ' <button type="button" class="btn sm" onclick="verRep(' + originalIndex + ',\'OPS\')">Copia original</button>' : '') +
        (originalIndex >= 0 && bridge.isAdmin() ? ' <button type="button" class="btn sm" onclick="verRep(' + originalIndex + ',\'JD\')">Copia económica original</button>' : '') +
        ' <button type="button" class="btn sm" onclick="LVRevision.openDate(\'' + date + '\')">Abrir fecha</button></div>';
    }).join('');
  }
  function openDate(date) {
    el('rFecha').value = date;
    bridge.loadDay();
    el('rFecha').scrollIntoView({ block: 'center' });
    el('rFecha').focus();
  }
  async function print(date) {
    const tab = window.open('', '_blank');
    if (!tab) return alert('Permite abrir la vista de impresión en este navegador.');
    tab.document.title = 'Las Vainitas · ' + date;
    tab.document.body.textContent = 'Preparando reporte…';
    const all = reports(), d = daily(date, all), r = d.recorded;
    const photos = await Promise.allSettled((r?.fotos || []).map(item => bridge.photo(item)));
    const images = photos.flatMap(image => image.status === 'fulfilled' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(image.value || '') ? [image.value] : []);
    const notes = d.history
      ? '<p>Avance real al corte: <b>' + pct(d.integral) + '</b>.</p><p>' + esc(d.ref || historicalEvidence[date] || 'Corte pendiente de conciliación documental.') + '</p>'
      : '<p>Real: <b>' + pct(d.integral) + '</b> · Plan: <b>' + pct(d.plan) + '</b> · Desviación: <b>' + difference(d) + '</b>.</p><p>Último corte: ' + dateLabel(d.lastMeasure) + '. Día ' + (days(start,date)+1) + ' de 69. Plan reprogramado desde el corte del 19/11.</p>';
    const footer = d.history ? '<h2>Antecedente y relación con el nuevo corte</h2><p>El programa reprogramado se aplica desde el 19/11/2026.</p>' : '<h2>Programa de cierre y saldo</h2>' + ganttView(all,date) + pendingList(d);
    const content = '<p><b>Fecha:</b> ' + date + ' · <b>Tope de ejecución:</b> 12/12/2026.</p>' + notes +
      '<h2>Actividades de la jornada</h2><p>' + prose(r?.txt) + '</p><h2>Novedades</h2><p>' + prose(r?.nov) + '</p>' +
      '<h2>Curva y cortes diarios</h2>' + chart(all, date) + historyTable(all, date, 12) + footer +
      '<h2>Registro fotográfico</h2>' + (images.length ? images.map(image => '<img class="foto" src="' + image + '">').join('') : '<p>Sin fotografías incorporadas a este corte.</p>');
    const title = d.history ? 'REVISIÓN DOCUMENTAL DEL DIARIO' : r ? 'REPORTE DIARIO DE OBRA' : 'BORRADOR DEL CORTE DE CONTROL';
    bridge.print('LAS VAINITAS · ' + title, 'Galpones de Arenas · Planta Las Vainitas · CVM', content, true, 'ADD-RD-' + date.replaceAll('-', '') + '-OPS · Rev. 1', tab);
  }
  function legacyDisplay() {
    const state = valuesOn(today() < cut ? cut : today(), reports());
    return Object.fromEntries([...catalogItems.keys()].map(id => [id, Math.round(rowPercent(id,state)*100)/100]));
  }
  window.LVRevision = {
    install: api => { bridge = api; }, cut, today, loadForm, readForm, list, render, renderGantt, kpis, print, openDate, legacyDisplay, period,
    model: { daily, valuesOn, planned, schedule, opening },
  };
})();
