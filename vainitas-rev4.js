(function () {
  'use strict';
  const data = window.LV4_DATA;
  const diary = window.LV_DIARIO;
  if (!data || !diary) return;
  const { start, cut, end, items } = data;
  const { controlCut } = diary;
  const titles = {
    civil: 'Fundaciones y obra civil', estructura: 'Estructura y arriostramiento',
    pintura: 'Fondo anticorrosivo y esmalte', cubierta: 'Cubierta Acerolit',
    drenaje: 'Canaletas y bajantes', cerramiento: 'Cerramiento lateral',
    electricidad: 'Electricidad y fotovoltaico', transporte: 'Transporte y movilización',
  };
  const schedule = [
    { group: 'estructura', label: 'Galpón 2 · fabricar y montar estructura', from: '2026-11-20', to: '2026-11-30' },
    { group: 'pintura', label: 'Galpón 2 · fondo, esmalte y retoques por tramo', from: '2026-11-20', to: '2026-12-02' },
    { group: 'cubierta', label: 'Galpón 1 · terminar cubierta', from: '2026-11-20', to: '2026-11-26' },
    { group: 'cubierta', label: 'Galpón 2 · instalar cubierta por tramos liberados', from: '2026-12-01', to: '2026-12-06' },
    { group: 'drenaje', label: 'Galpón 1 · instalar drenaje pluvial', from: '2026-11-27', to: '2026-12-03' },
    { group: 'drenaje', label: 'Galpón 2 · instalar drenaje pluvial', from: '2026-12-02', to: '2026-12-07' },
    { group: 'cerramiento', label: 'Ambos galpones · instalar pantallas laterales', from: '2026-11-27', to: '2026-12-07' },
    { group: 'electricidad', label: 'Instalar alumbrado, protecciones y sistema solar', from: '2026-12-08', to: '2026-12-11' },
    { label: 'Pruebas funcionales, drenaje y entrega', from: '2026-12-12', to: '2026-12-12', milestone: true },
  ];
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
  const byId = new Map(items.map(item => [item.id, item]));
  const weights = new Map(items.map(item => [item.id, {
    material: item.weight * item.supplyShare,
    obra: item.weight * (1 - item.supplyShare),
  }]));
  const tasks = diary.program.flatMap(([ids, stage, fraction, from, to]) => ids.map(id => ({
    id, stage, from, to, weight: weights.get(id)[stage] * fraction,
  })));
  const history = new Map();
  const acceptedEvidence = 'Corte interno acordado al cierre del 18/11. Incluye el suministro confirmado en sitio y los metrados acumulados. El diario original registra 95 m² de cubierta de esa jornada.';
  const physical = new Map();
  const delivered = new Map();
  for (const [date, ref, installed = {}, supplied = {}] of diary.history) {
    for (const [id, percent] of Object.entries(installed)) physical.set(Number(id), percent / 100);
    for (const [id, percent] of Object.entries(supplied)) delivered.set(Number(id), percent / 100);
    const integral = items.reduce((sum, item) => {
      const fraction = Math.min(item.field / item.qty, physical.get(item.id) || 0);
      const delivery = Math.max(fraction, delivered.get(item.id) || 0);
      const weight = weights.get(item.id);
      return sum + Math.min(item.opening, fraction * weight.obra + delivery * weight.material);
    }, 0);
    history.set(date, { integral, ref });
  }
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
        const item = byId.get(Number(id));
        if (item && typeof q === 'number' && Number.isFinite(q) && q >= item.field - 0.00001 && q <= item.qty) {
          quantities.set(item.id, q);
        }
      }
    }
    const integral = items.reduce((sum, p) => sum + earned(p, quantities.get(p.id)), 0);
    return { quantities, integral };
  }
  function planned(date) {
    if (date < start) return null;
    if (date >= end) return 100;
    return tasks.reduce((sum, row) => {
      const fraction = clamp((days(row.from, date) + 1) / (days(row.from, row.to) + 1), 0, 1);
      return sum + row.weight * fraction;
    }, 0);
  }
  function daily(date, allReports) {
    const recorded = allReports.find(r => r.f === date);
    const plan = planned(date);
    if (date < controlCut) {
      const prior = [...history.keys()].filter(f => f <= date).at(-1);
      const point = history.get(prior);
      return {
        date, recorded, history: true, plan, lastMeasure: prior,
        integral: point?.integral ?? null,
        ref: history.get(date)?.ref || 'Sin metrado disponible para la jornada. Se mantiene el último acumulado acreditado.',
      };
    }
    const values = valuesOn(date, allReports);
    if (date === controlCut) {
      return { ...values, date, recorded, history: true, plan, lastMeasure: date, ref: acceptedEvidence };
    }
    const last = allReports.filter(r => r.f >= cut && r.f <= date && r.lv4?.quantities).at(-1);
    const pending = last?.f !== date;
    return { ...values, date, recorded, history: false, pending, plan, lastMeasure: last?.f || controlCut,
      integral: pending ? null : values.integral };
  }
  function cutNote(day) {
    if (day.history) return day.ref;
    if (day.pending) return 'Reporte pendiente. Último corte registrado el ' + dateLabel(day.lastMeasure) + '.';
    return 'Avance acumulado al cierre de la jornada.';
  }
  function status(day) {
    if (day.pending) return 'Pendiente';
    if (!validPercent(day.integral) || !validPercent(day.plan)) return 'Preinicio';
    const delta = day.integral - day.plan;
    return delta >= 2 ? 'Adelantado' : delta >= -2 ? 'En línea' : 'Retrasado';
  }
  function datesThrough(all, until) {
    return [...new Set([...history.keys(), ...all.map(r => r.f), controlCut])]
      .sort().filter(f => !until || f <= until);
  }
  function difference(day) {
    if (!validPercent(day.integral) || !validPercent(day.plan)) return '—';
    const delta = day.integral - day.plan;
    return (delta > 0.00001 ? '+' : '') + number(delta) + ' pts';
  }
  function historyTable(allReports, until, limit = 0, details = false) {
    const dates = datesThrough(allReports, until);
    const rows = limit ? dates.slice(-limit).reverse() : dates;
    return '<div class="lv-scroll"><table><thead><tr><th>Fecha</th><th>Día</th><th class="r">Real</th><th class="r">Plan</th><th class="r">Desviación</th><th>Estado</th>' +
      (details ? '<th>Respaldo del corte</th>' : '') + '</tr></thead><tbody>' +
      rows.map(date => {
        const d = daily(date, allReports);
        const deltaColor = d.integral >= d.plan ? '#0f7a35' : '#b03a2e';
        const day = days(start,date)+1;
        return '<tr><td>' + dateLabel(date) + '</td><td>' + (day > 0 ? day : '—') + '</td><td class="r"><b>' +
          pct(d.integral) + '</b></td><td class="r">' + pct(d.plan) + '</td><td class="r" style="color:' + deltaColor + '">' +
          difference(d) + '</td><td>' + status(d) + '</td>' + (details ? '<td>' + esc(cutNote(d)) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function chart(allReports, until, width = 500) {
    const through = until < today() ? until : today();
    const points = datesThrough(allReports,through).filter(f => f >= start)
      .map(date => daily(date,allReports)).filter(d => validPercent(d.integral));
    const last = points.at(-1)?.date;
    const duration = days(start,last > end ? last : end)+1;
    return bridge.chart(width,240,last,{
      duration,
      dayOf: date => days(start,date)+1,
      planned: day => planned(dateAt(start,day-1)),
      label: day => {
        const parts = dateAt(start,day-1).split('-');
        const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        return parts[2]+'-'+months[Number(parts[1])-1];
      },
      points: points.map(p => [days(start,p.date)+1,p.integral]),
    });
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
    const ids = new Set((catalogItems.get(row.n) || []).map(item => item.id));
    const windows = tasks.filter(task => ids.has(task.id));
    if (!windows.length) return { from: start, to: end };
    return { from: windows.map(w=>w.from).sort()[0], to: windows.map(w=>w.to).sort().at(-1) };
  }
  function progress(all, through) {
    const asOf = through < controlCut ? controlCut : through;
    const last = daily(asOf,all).lastMeasure;
    const d = daily(last,all);
    const previous = [controlCut,...all.filter(r=>r.f>=cut&&r.f<last&&Object.keys(r.lv4?.quantities||{}).length).map(r=>r.f)]
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
          const xa=x(controlCut), xb=x(last);
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
  const valuesAtCut = valuesOn(controlCut, []);
  function ganttView(all, through) {
    const p = progress(all, through), dateDay=days(start,p.d.date)+1, available=days(through,end);
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
    const selected = el('rFecha')?.value || today();
    const day = daily(selected, all);
    const comparison = day.pending ? daily(day.lastMeasure,all) : day;
    el('curva').innerHTML = chart(all, selected);
    el('tabContraste').innerHTML = historyTable(all, selected, 12) +
      '<details style="margin-top:6px"><summary>Ver respaldo de los cortes diarios</summary>' +
      '<p>Real histórico reconstruido con el Diario, el informe CVM del 26/10 y los pesos Rev. 4. Los tramos con metrado parcial se estiman con el respaldo disponible. Los siete partes de preinicio se incorporan al saldo inicial del 05/10. El cierre del 18/11 incorpora el suministro confirmado en sitio sin fecha individual de recepción respaldada.</p>' +
      historyTable(all, selected, 0, true) + '</details>';
    const delta = comparison.integral - comparison.plan;
    const elapsed = days(start,comparison.date)+1;
    const reportDay = elapsed > 0 ? ' (día ' + elapsed + ')' : ' · preinicio';
    el('desv').className = 'callout' + (comparison.plan === null ? '' : delta >= 0 ? ' grn' : ' red');
    el('desv').innerHTML = '<b>Al ' + dateLabel(comparison.date) + reportDay +
      ':</b> real <b>' + pct(comparison.integral) + '</b> vs plan <b>' + pct(comparison.plan) +
      '</b> → desviación <b>' + difference(comparison) + '</b>.' +
      (day.pending ? '<br>Reporte del ' + dateLabel(selected) + ' pendiente.' : '<br>' + esc(cutNote(day)));
    const current = valuesOn(today(), all);
    el('hoyPend').innerHTML = pendingList(current);
    renderGantt();
    kpis();
  }
  function kpis() {
    const all = reports();
    const date = today() < controlCut ? controlCut : today();
    const current = daily(date,all);
    const state = current.pending ? daily(current.lastMeasure,all) : current;
    el('kAv').textContent = pct(state.integral);
    el('kPlanHoy').textContent = pct(state.plan);
    el('kPlanLabel').textContent = 'vs plan al ' + dateLabel(state.date) + ' ';
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
      editor.innerHTML = '<h5>2 · Respaldo del corte histórico</h5><p>' + esc(cutNote(daily(f, all))) + '</p>';
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
    if (info) info.textContent = f < cut ? 'Diario original · consulta' : 'Día ' + (days(start,f)+1) + ' · fecha tope 12/12/2026';
    if (el('lvLegacyEditor')) el('lvLegacyEditor').hidden = true;
    for (const id of ['rTexto', 'rNov', 'rFotos', 'rPers']) {
      if (el(id)) el(id).disabled = !access || f < cut;
    }
    if (el('lvSave')) el('lvSave').hidden = f < cut || !access;
  }
  function readForm(f, previous) {
    if (f !== formDate || loadedReport !== JSON.stringify(previous || null)) {
      throw new Error('El corte cambió durante la edición. Conserva una copia de tu borrador y vuelve a abrir esa fecha antes de guardar.');
    }
    if (f < cut) throw new Error('El reporte histórico se conserva como original de consulta.');
    return { quantities: Object.fromEntries(draft) };
  }
  function list() {
    const all = reports();
    const dates = [...new Set([...all.map(r => r.f), controlCut])].sort().reverse();
    el('rCount').textContent = all.length + ' diarios · corte de control ' + dateLabel(controlCut);
    el('rLista').innerHTML = dates.map(date => {
      const d = daily(date, all), originalIndex = bridge.getReports().findIndex(r => r.f === date);
      const status = 'Real: <b>' + pct(d.integral) + '</b> · Plan: ' + pct(d.plan);
      return '<div class="repcard"><b>' + date + '</b> · ' + status +
        (d.history ? '' : ' <button type="button" class="btn sm g" onclick="LVRevision.print(\'' + date + '\')">PDF reporte</button>') +
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
    if (date < cut) return;
    const all = reports(), d = daily(date, all), r = d.recorded;
    if (!r) return;
    const tab = window.open('', '_blank');
    if (!tab) return alert('Permite abrir la vista de impresión en este navegador.');
    tab.document.title = 'Las Vainitas · ' + date;
    tab.document.body.textContent = 'Preparando reporte…';
    const photos = await Promise.allSettled((r?.fotos || []).map(item => bridge.photo(item)));
    const images = photos.flatMap(image => image.status === 'fulfilled' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(image.value || '') ? [image.value] : []);
    const notes = '<p>Real: <b>' + pct(d.integral) + '</b> · Plan: <b>' + pct(d.plan) + '</b> · Desviación: <b>' +
      difference(d) + '</b>.</p><p>Último corte: ' + dateLabel(d.lastMeasure) + '. Día ' + (days(start,date)+1) +
      ' de 69. Programa del 05/10 al 12/12/2026.</p>';
    const footer = '<h2>Programa de cierre y saldo</h2>' + ganttView(all,date) + pendingList(d);
    const content = '<p><b>Fecha:</b> ' + date + ' · <b>Tope de ejecución:</b> 12/12/2026.</p>' + notes +
      '<h2>Actividades de la jornada</h2><p>' + prose(r?.txt) + '</p><h2>Novedades</h2><p>' + prose(r?.nov) + '</p>' +
      '<h2>Curva y cortes diarios</h2>' + chart(all, date, 640) + historyTable(all, date, 12) + footer +
      '<h2>Registro fotográfico</h2>' + (images.length ? images.map(image => '<img class="foto" src="' + image + '">').join('') : '<p>Sin fotografías incorporadas a este corte.</p>');
    bridge.print('LAS VAINITAS · REPORTE DIARIO DE OBRA', 'Galpones de Arenas · Planta Las Vainitas · CVM', content, true, 'ADD-RD-' + date.replaceAll('-', '') + '-OPS · Rev. 1', tab);
  }
  function legacyDisplay() {
    const state = valuesOn(today() < cut ? cut : today(), reports());
    return Object.fromEntries([...catalogItems.keys()].map(id => [id, Math.round(rowPercent(id,state)*100)/100]));
  }
  window.LVRevision = {
    install: api => { bridge = api; }, cut, today, loadForm, readForm, list, render, renderGantt, kpis, print, openDate, legacyDisplay, period,
    model: { daily, valuesOn, planned, schedule, opening, tasks },
  };
})();
