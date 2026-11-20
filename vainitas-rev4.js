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
  const physicalOpening = items.reduce((sum, p) => sum + p.weight * p.field / p.qty, 0);
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
    const physical = items.reduce((sum, p) => sum + p.weight * quantities.get(p.id) / p.qty, 0);
    const integral = items.reduce((sum, p) => {
      const remaining = p.qty - p.field;
      return sum + (remaining > 0
        ? p.opening + (p.weight - p.opening) * (quantities.get(p.id) - p.field) / remaining
        : p.weight);
    }, 0);
    return { quantities, physical, integral };
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
        date, recorded, history: true, legacy: recorded ? bridge.original(date) : null,
        physical: validPercent(reviewed?.physical) && reviewed.ref ? reviewed.physical : null,
        integral: validPercent(reviewed?.integral) && reviewed.ref ? reviewed.integral : null,
        ref: reviewed?.ref || '', plan: null,
      };
    }
    const values = valuesOn(date, allReports);
    const last = allReports.filter(r => r.f >= cut && r.f <= date && Object.keys(r.lv4?.quantities || {}).length).at(-1);
    return { ...values, date, recorded, history: false, plan: planned(date), lastMeasure: last?.f || cut };
  }
  function historyTable(allReports, until, limit = 0) {
    const dates = [...new Set([...allReports.map(r => r.f), cut])].sort().filter(f => !until || f <= until);
    const rows = limit ? dates.slice(-limit) : dates;
    return '<div class="lv-scroll"><table><thead><tr><th>Fecha</th><th>Serie anterior</th><th>Obra y transporte</th><th>Integral conciliado</th><th>Plan vigente</th><th>Estado del corte</th></tr></thead><tbody>' +
      rows.map(date => {
        const d = daily(date, allReports);
        const status = d.history ? (d.ref || 'Pendiente de conciliación documental') : (date === cut ? 'Corte base de sinceración' : 'Metrado al ' + dateLabel(d.lastMeasure));
        return '<tr><td>' + dateLabel(date) + '</td><td>' + pct(d.legacy) + '</td><td>' + pct(d.physical) + '</td><td>' + pct(d.integral) + '</td><td>' + pct(d.plan) + '</td><td>' + esc(status) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function chart(allReports, until) {
    const width = 700, height = 228, left = 46, right = 20, top = 23, bottom = 42;
    const first = allReports[0]?.f < start ? allReports[0].f : start;
    const last = allReports.at(-1)?.f > end ? allReports.at(-1).f : end;
    const x = f => left + days(first, f) / days(first, last) * (width - left - right);
    const y = v => height - bottom - clamp(v, 0, 100) / 100 * (height - top - bottom);
    const points = (rows, prop) => rows.filter(r => validPercent(r[prop])).map(r => x(r.date).toFixed(1) + ',' + y(r[prop]).toFixed(1)).join(' ');
    const rows = [...new Set([...allReports.map(r => r.f), cut])].sort().filter(f => !until || f <= until).map(f => daily(f, allReports));
    const oldRows = rows.filter(r => r.history);
    const newRows = rows.filter(r => !r.history && (r.date === cut || r.lastMeasure === r.date));
    const planRows = Array.from({ length: days(cut, end) + 1 }, (_, i) => {
      const date = dateAt(cut, i); return { date, plan: planned(date) };
    });
    const line = (pts, color, dash = '') => pts ? '<polyline fill="none" stroke="' + color + '" stroke-width="2.4" ' + (dash ? 'stroke-dasharray="' + dash + '" ' : '') + 'points="' + pts + '"/>' : '';
    const dot = (rows, key, color) => rows.filter(r => validPercent(r[key])).map(r => '<circle cx="' + x(r.date) + '" cy="' + y(r[key]) + '" r="3" fill="' + color + '"><title>' + r.date + ' · ' + pct(r[key]) + '</title></circle>').join('');
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Curva por fecha: registro original, avance conciliado y plan al 12 de diciembre" style="width:100%;height:auto;background:#fff">' +
      [0, 25, 50, 75, 100].map(v => '<line x1="' + left + '" x2="' + (width-right) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#d6e1ed"/><text x="' + (left-7) + '" y="' + (y(v)+4) + '" text-anchor="end" font-size="11" fill="#475e76">' + v + '%</text>').join('') +
      [first, '2026-10-19', '2026-11-02', cut, '2026-12-01', end].map(f => '<text x="' + x(f) + '" y="' + (height-bottom+19) + '" text-anchor="middle" font-size="11" fill="#475e76">' + dateLabel(f) + '</text>').join('') +
      '<line x1="' + x(cut) + '" x2="' + x(cut) + '" y1="' + top + '" y2="' + y(0) + '" stroke="#a27124" stroke-dasharray="4 4"/>' +
      line(points(oldRows, 'legacy'), '#8390a0', '4 4') +
      (until && until < cut ? '' : line(points(planRows, 'plan'), '#3074b8', '6 3')) +
      line(points(newRows, 'integral'), '#116b58') + line(points(newRows, 'physical'), '#a5671f') +
      dot(newRows, 'integral', '#116b58') + dot(newRows, 'physical', '#a5671f') +
      dot(oldRows, 'integral', '#116b58') + dot(oldRows, 'physical', '#a5671f') + '</svg>' +
      '<p><span style="color:#56677b">— Serie anterior</span> · <span style="color:#116b58">— Integral conciliado</span> · <span style="color:#825013">— Obra y transporte</span> · <span style="color:#225b8f">— Plan desde el 19/11</span></p>';
  }
  function gantt() {
    const length = days(cut, end);
    const tick = ['2026-11-20', '2026-11-27', '2026-12-04', '2026-12-12'];
    const x = f => 270 + days(cut, f) / length * 435;
    const y = i => 38 + i * 29;
    const height = y(schedule.length) + 24;
    const bars = schedule.map((r, i) => {
      const color = r.milestone ? '#a27124' : r.group === 'electricidad' ? '#17538e' : '#147662';
      return '<text x="8" y="' + (y(i)+12) + '" font-size="11" fill="#123252">' + esc(r.label) + '</text><rect x="' + (x(r.from)-3) + '" y="' + y(i) + '" width="' + Math.max(8, x(r.to)-x(r.from)+4) + '" height="14" rx="3" fill="' + color + '"><title>' + dateLabel(r.from) + ' – ' + dateLabel(r.to) + '</title></rect>';
    }).join('');
    return '<svg viewBox="0 0 725 ' + height + '" role="img" aria-label="Ventanas previstas de montaje, electricidad y entrega" style="width:100%;height:auto;background:#fff">' +
      tick.map(f => '<line x1="' + x(f) + '" x2="' + x(f) + '" y1="26" y2="' + (height-16) + '" stroke="#d6e1ed"/><text x="' + x(f) + '" y="19" text-anchor="middle" font-size="11" fill="#475e76">' + dateLabel(f) + '</text>').join('') + bars + '</svg>' +
      '<p>Meta de obra constructiva: 07/12. Instalación eléctrica: 08–11/12, una vez liberada toda la construcción. Pruebas y entrega: 12/12. Ventanas de control sujetas a productividad y condiciones de campo.</p>';
  }
  function balanceTable(state, showComplete = false) {
    return '<div class="lv-scroll"><table><thead><tr><th>Part. Rev. 4</th><th>Actividad pendiente</th><th>Ejecutado acumulado</th><th>Saldo por medir</th><th>Saldo integral (puntos)</th></tr></thead><tbody>' +
      items.filter(p => showComplete || state.quantities.get(p.id) < p.qty - 0.00001).map(p => {
        const q = state.quantities.get(p.id);
        const residual = p.qty === p.field ? 0 : (p.weight - p.opening) * (p.qty-q) / (p.qty-p.field);
        return '<tr><td>' + code(p) + '</td><td>' + esc(p.label) + '</td><td>' + number(q) + ' ' + esc(p.unit) + '</td><td>' + number(p.qty-q) + ' ' + esc(p.unit) + '</td><td>' + number(residual, 3) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function renderGantt() {
    const target = el('ganttBox');
    if (!target) return;
    const all = reports(), active = daily(today() < cut ? cut : today(), all);
    target.innerHTML = '<div class="callout"><b>05/10–12/12/2026 · 69 días calendario.</b> Avance integral ' + pct(active.integral) + ' · obra y transporte ' + pct(active.physical) + '.</div>' +
      gantt() + '<h5>Saldo por partida · Rev. 4</h5>' + balanceTable(active);
    if (el('lvActiveItems')) el('lvActiveItems').innerHTML = balanceTable(active, true);
    if (el('lvExecution')) el('lvExecution').innerHTML = gantt();
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
      ? '<b>Registro del ' + dateLabel(selected) + '.</b> Serie anterior: ' + pct(day.legacy) + '. Integral conciliado: ' + pct(day.integral) + '. ' + esc(day.ref || historicalEvidence[selected] || 'La conciliación requiere respaldo de ese día.')
      : '<b>Al ' + dateLabel(selected) + ' · día ' + (days(start, selected)+1) + '.</b> Integral ' + pct(day.integral) + ' · obra y transporte ' + pct(day.physical) + ' · plan ' + pct(day.plan) + ' · diferencia ' + number(day.integral - day.plan) + ' puntos · metrado al ' + dateLabel(day.lastMeasure) + '.';
    const current = daily(today() < cut ? cut : today(), all);
    el('hoyPend').innerHTML = balanceTable(current);
    renderGantt();
    kpis();
  }
  function kpis() {
    const date = today() < cut ? cut : today(), state = daily(date, reports());
    el('kAv').textContent = pct(state.integral);
    el('kPlanHoy').textContent = pct(state.plan);
    if (el('lvPhysical')) el('lvPhysical').textContent = pct(state.physical);
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
      editor.innerHTML = '<p><b>Conciliar un corte anterior</b>. Indica porcentajes con respaldo de esa fecha.</p>' +
        '<label>Obra y transporte (%) <input id="lvOldPhysical" type="number" min="0" max="100" step="0.01" value="' + (validPercent(h.physical) ? h.physical : '') + '"></label> ' +
        '<label>Integral (%) <input id="lvOldIntegral" type="number" min="0" max="100" step="0.01" value="' + (validPercent(h.integral) ? h.integral : '') + '"></label><br>' +
        '<label>Planilla, diario o acta de respaldo <input id="lvOldSource" maxlength="220" type="text" value="' + esc(h.ref || '') + '"></label>' +
        (historicalEvidence[f] ? '<p>' + esc(historicalEvidence[f]) + '</p>' : '');
    } else {
      editor.innerHTML = '<p><b>Metrado acumulado instalado · Rev. 4</b>. Actualiza únicamente las partidas medidas en este día.</p>' +
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
    const rawPhysical = el('lvOldPhysical')?.value || '';
    const rawIntegral = el('lvOldIntegral')?.value || '';
    if (!rawPhysical && !rawIntegral && !ref) throw new Error('Indica los datos y el respaldo con los que se concilia este corte.');
    const readPercent = (raw) => raw === '' ? null : Number(raw);
    const physical = readPercent(rawPhysical), integral = readPercent(rawIntegral);
    if (!ref || (physical === null && integral === null) ||
      (physical !== null && !validPercent(physical)) || (integral !== null && !validPercent(integral)) ||
      (physical !== null && integral !== null && physical > integral)) {
      throw new Error('Indica un respaldo y al menos un porcentaje válido. El avance integral debe cubrir la obra ejecutada.');
    }
    return { historical: { physical, integral, ref } };
  }
  function list() {
    const all = reports();
    const dates = [...new Set([...all.map(r => r.f), cut])].sort().reverse();
    el('rCount').textContent = all.length + ' diarios · corte de control 19/11';
    el('rLista').innerHTML = dates.map(date => {
      const d = daily(date, all), originalIndex = bridge.getReports().findIndex(r => r.f === date);
      const status = d.history ? 'Original ' + pct(d.legacy) + ' · conciliado ' + pct(d.integral) : 'Integral ' + pct(d.integral) + ' · obra y transporte ' + pct(d.physical);
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
      ? '<p>Serie anterior: <b>' + pct(d.legacy) + '</b> · Obra conciliada: <b>' + pct(d.physical) + '</b> · Integral conciliado: <b>' + pct(d.integral) + '</b>.</p><p>' + esc(d.ref || historicalEvidence[date] || 'Corte pendiente de conciliación documental.') + '</p>'
      : '<p>Integral conciliado: <b>' + pct(d.integral) + '</b> · Obra y transporte: <b>' + pct(d.physical) + '</b> · Plan: <b>' + pct(d.plan) + '</b>.</p><p>Metrado al ' + dateLabel(d.lastMeasure) + '. Día ' + (days(start,date)+1) + ' de 69. El avance integral incluye suministro acopiado y el ajuste de apertura del 19/11.</p>';
    const footer = d.history ? '<h2>Antecedente y relación con el nuevo corte</h2><p>El programa reprogramado y su curva integral se aplican desde el 19/11/2026. La presente revisión conserva el diario y distingue las cifras que tienen respaldo para la fecha de este documento.</p>' : '<h2>Programa de cierre y saldo</h2>' + gantt() + balanceTable(d);
    const content = '<p><b>Fecha:</b> ' + date + ' · <b>Tope de ejecución:</b> 12/12/2026.</p>' + notes +
      '<h2>Actividades de la jornada</h2><p>' + prose(r?.txt) + '</p><h2>Novedades</h2><p>' + prose(r?.nov) + '</p>' +
      '<h2>Curva y cortes diarios</h2>' + chart(all, date) + historyTable(all, date, 12) + footer +
      '<h2>Registro fotográfico</h2>' + (images.length ? images.map(image => '<img class="foto" src="' + image + '">').join('') : '<p>Sin fotografías incorporadas a este corte.</p>');
    const title = d.history ? 'REVISIÓN DOCUMENTAL DEL DIARIO' : r ? 'REPORTE DIARIO DE OBRA' : 'BORRADOR DEL CORTE DE CONTROL';
    bridge.print('LAS VAINITAS · ' + title, 'Galpones de Arenas · Planta Las Vainitas · CVM', content, true, 'ADD-RD-' + date.replaceAll('-', '') + '-OPS · Rev. 1', tab);
  }
  function legacyDisplay() {
    const state = valuesOn(today() < cut ? cut : today(), reports());
    const groups = new Map();
    for (const p of items) {
      if (!p.legacy) continue;
      const g = groups.get(p.legacy) || { base: 0, installed: 0 };
      g.base += p.weight;
      g.installed += p.weight * state.quantities.get(p.id) / p.qty;
      groups.set(p.legacy, g);
    }
    return Object.fromEntries([...groups].map(([id,g]) => [id, Math.round(g.installed / g.base * 10000) / 100]));
  }
  window.LVRevision = {
    install: api => { bridge = api; }, cut, today, loadForm, readForm, list, render, renderGantt, kpis, print, openDate, legacyDisplay,
    model: { daily, valuesOn, planned, schedule, opening, physicalOpening },
  };
})();
