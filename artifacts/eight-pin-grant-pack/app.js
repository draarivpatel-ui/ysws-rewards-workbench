import { boardModel, schematicModel, validateBOM, safeSupplierURL, child, children } from './core.js';

const $ = id => document.getElementById(id);
const ns = 'http://www.w3.org/2000/svg';
const money = value => `$${(Number(value) / 100).toFixed(2)}`;
function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function field(list, name, value) {
  const dt = document.createElement('dt'), dd = document.createElement('dd');
  dt.textContent = name; dd.textContent = value; list.append(dt, dd);
}
async function source(path, json = false) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return json ? response.json() : response.text();
}

async function start() {
  const [pcb, sch, bom] = await Promise.all([source('chirpkey8.kicad_pcb'), source('chirpkey8.kicad_sch'), source('bom.json', true)]);
  const board = boardModel(pcb), schematic = schematicModel(sch), budget = validateBOM(bom);
  const byRef = new Map(bom.rows.flatMap(row => row.references.map(ref => [ref, row])));
  let selected = '', view = [-1, -1, 34, 26];
  function inspect(ref) {
    selected = ref;
    const row = byRef.get(ref), fp = board.footprints.find(f => f.ref === ref);
    $('detail-title').textContent = ref;
    $('detail-body').textContent = row?.description ?? fp?.value ?? 'Source component';
    $('detail-fields').replaceChildren();
    if (row) {
      field($('detail-fields'), 'Manufacturer part number', row.partNumber);
      field($('detail-fields'), 'Manufacturer', row.manufacturer);
      field($('detail-fields'), 'Quantity / unit estimate', `${row.quantity} / $${row.unitPrice}`);
      field($('detail-fields'), 'Price evidence', row.quoteStatus);
      $('supplier-link').href = safeSupplierURL(row.sourceUrl);
    }
    if (fp) {
      field($('detail-fields'), 'Board position', `${fp.x}, ${fp.y} mm`);
      field($('detail-fields'), 'Connected nets', [...new Set(fp.pads.map(p => p.netName))].join(', '));
    }
    $('supplier-link').hidden = !row;
    document.querySelectorAll('[data-ref]').forEach(n => {
      const match = n.dataset.ref === selected;
      n.classList.toggle('selected', match);
      if (n.getAttribute('role') === 'button') n.setAttribute('aria-pressed', String(match));
    });
  }
  function selectable(node, ref) {
    node.dataset.ref = ref; node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Inspect ${ref}`); node.setAttribute('aria-pressed', String(ref === selected));
    node.addEventListener('click', () => inspect(ref));
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(ref); }
    });
    node.classList.toggle('selected', ref === selected);
    return node;
  }
  for (const net of board.nets.filter(n => n.id)) {
    const option = document.createElement('option'); option.value = net.id; option.textContent = net.name;
    $('net-filter').append(option);
  }
  function renderPCB() {
    const root = $('pcb-svg'); root.replaceChildren(); root.setAttribute('viewBox', view.join(' '));
    root.append(svg('rect', { x: 0, y: 0, width: 32, height: 24, rx: .3, fill: '#15352e' }));
    const net = $('net-filter').value, front = $('front-layer').checked, back = $('back-layer').checked;
    const opacity = id => !net || String(id) === net ? 1 : .16;
    for (const segment of board.segments) {
      if (!(segment.layer === 'F.Cu' ? front : back)) continue;
      root.append(svg('line', { x1: segment.a[0], y1: segment.a[1], x2: segment.b[0], y2: segment.b[1],
        stroke: segment.layer === 'F.Cu' ? '#f2b675' : '#75b8ee', 'stroke-width': segment.width, 'stroke-linecap': 'round', opacity: opacity(segment.net) }));
    }
    for (const via of board.vias) if (front || back) {
      root.append(svg('circle', { cx: via.at[0], cy: via.at[1], r: via.size / 2, fill: '#e4ce8b', opacity: opacity(via.net) }));
      root.append(svg('circle', { cx: via.at[0], cy: via.at[1], r: via.drill / 2, fill: '#101719' }));
    }
    for (const fp of board.footprints) {
      const group = selectable(svg('g', { class: 'footprint' }), fp.ref);
      const padXs = fp.pads.map(p => p.x), padYs = fp.pads.map(p => p.y);
      group.append(svg('rect', { x: Math.min(...padXs) - 1, y: Math.min(...padYs) - 1,
        width: Math.max(...padXs) - Math.min(...padXs) + 2, height: Math.max(...padYs) - Math.min(...padYs) + 2,
        fill: 'transparent', stroke: '#a9bbb5', 'stroke-width': .12 }));
      for (const pad of fp.pads) {
        if (!pad.layers.includes('*.Cu') && !pad.layers.some(l => l === 'F.Cu' ? front : l === 'B.Cu' && back)) continue;
        group.append(svg('rect', { x: pad.x - pad.w / 2, y: pad.y - pad.h / 2, width: pad.w, height: pad.h,
          rx: pad.shape === 'circle' || pad.shape === 'oval' ? Math.min(pad.w, pad.h) / 2 : .12,
          fill: '#e4ce8b', opacity: opacity(pad.net) }));
        if (pad.drill) group.append(svg('circle', { cx: pad.x, cy: pad.y, r: pad.drill / 2, fill: '#101719' }));
      }
      if ($('silk-layer').checked) group.append(svg('text', { x: fp.x, y: Math.min(...padYs) - 1.3, fill: '#e6eee9', 'font-size': .9, 'text-anchor': 'middle' }, fp.ref));
      root.append(group);
    }
    for (const line of board.outline) root.append(svg('line', { x1: line.a[0], y1: line.a[1], x2: line.b[0], y2: line.b[1], stroke: '#c8ec86', 'stroke-width': .15 }));
    if ($('silk-layer').checked) for (const label of board.texts.filter(t => t.layer === 'F.SilkS')) {
      root.append(svg('text', { x: label.at[0], y: label.at[1], 'font-size': label.size, fill: '#e6eee9' }, label.text));
    }
  }
  function renderSchematic() {
    const root = $('schematic-svg');
    for (const wire of schematic.wires) root.append(svg('polyline', { points: wire.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#82c4a2', 'stroke-width': .3 }));
    for (const label of schematic.labels) {
      const at = child(label, 'at'); root.append(svg('text', { x: at[1], y: at[2] - .6, fill: '#c8ec86', 'font-size': 1.4 }, label[1]));
    }
    for (const symbol of schematic.symbols) {
      const group = selectable(svg('g', { transform: `translate(${symbol.at[0]} ${symbol.at[1]}) rotate(${-symbol.at[2]})` }), symbol.ref);
      for (const unit of children(symbol.lib, 'symbol')) for (const rect of children(unit, 'rectangle')) {
        const a = child(rect, 'start').slice(1), b = child(rect, 'end').slice(1);
        group.append(svg('rect', { x: Math.min(a[0], b[0]), y: -Math.max(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), fill: '#203035', stroke: '#e4ce8b', 'stroke-width': .25 }));
      }
      for (const pin of symbol.pins) {
        const [x, y, angle] = pin.at, r = angle * Math.PI / 180;
        group.append(svg('line', { x1: x, y1: -y, x2: x + Math.cos(r) * pin.length, y2: -y - Math.sin(r) * pin.length, stroke: '#e4ce8b', 'stroke-width': .25 }));
        group.append(svg('text', { x: x, y: -y - .5, fill: '#a9bbb5', 'font-size': .95 }, `${pin.n} ${pin.name}`));
      }
      root.append(group);
      for (const prop of children(symbol.node, 'property').filter(p => ['Reference', 'Value'].includes(p[1]))) {
        const at = child(prop, 'at');
        root.append(svg('text', { x: at[1], y: at[2], fill: '#e6eee9', 'font-size': 1.4 }, prop[2]));
      }
    }
    for (const text of schematic.texts) {
      const at = child(text, 'at'); root.append(svg('text', { x: at[1], y: at[2], fill: '#a9bbb5', 'font-size': 1.3 }, text[1]));
    }
  }
  function renderBOM() {
    const query = $('bom-filter').value.trim().toLowerCase();
    const rows = bom.rows.filter(row => [row.references.join(' '), row.partNumber, row.description, row.supplier].join(' ').toLowerCase().includes(query));
    $('bom-body').replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr'), refs = document.createElement('td');
      for (const ref of row.references) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = ref; button.dataset.ref = ref;
        button.addEventListener('click', () => inspect(ref)); button.classList.toggle('selected', selected === ref); refs.append(button);
      }
      tr.append(refs);
      for (const text of [row.partNumber, row.quantity, `$${row.unitPrice}`, `$${row.lineTotal}`, row.supplier]) {
        const td = document.createElement('td'); td.textContent = text; tr.append(td);
      }
      $('bom-body').append(tr);
    }
    $('bom-count').textContent = `${rows.length} of ${bom.rows.length} BOM rows. Totals always include all rows.`;
  }
  $('estimate').textContent = `${money(budget.total)} estimated total`;
  for (const [name, amount] of [['Parts + PCB', budget.subtotal], ['Shipping allowance', BigInt(bom.pricing.shippingAllowance.replace('.', ''))], ['Tax allowance', BigInt(bom.pricing.taxAllowance.replace('.', ''))], ['Estimated total', budget.total]]) field($('totals'), name, money(amount));
  const tabs = [...document.querySelectorAll('[data-tab]')];
  function activate(tab, focus = false) {
    for (const item of tabs) {
      const active = item === tab; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
      $(`panel-${item.dataset.tab}`).hidden = !active;
    }
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next !== undefined) { event.preventDefault(); activate(tabs[next], true); }
    });
  });
  for (const id of ['front-layer', 'back-layer', 'silk-layer', 'net-filter']) $(id).addEventListener('change', renderPCB);
  $('bom-filter').addEventListener('input', renderBOM);
  function zoom(factor, px = .5, py = .5) {
    const width = Math.min(102, Math.max(5, view[2] * factor)), ratio = width / view[2];
    view = [view[0] + view[2] * px * (1 - ratio), view[1] + view[3] * py * (1 - ratio), width, view[3] * ratio];
    $('pcb-svg').setAttribute('viewBox', view.join(' '));
  }
  document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.zoom === 'reset') { view = [-1, -1, 34, 26]; $('pcb-svg').setAttribute('viewBox', view.join(' ')); }
    else zoom(button.dataset.zoom === 'in' ? .8 : 1.25);
  }));
  $('pcb-svg').addEventListener('wheel', event => {
    event.preventDefault(); const rect = $('pcb-svg').getBoundingClientRect();
    zoom(event.deltaY < 0 ? .9 : 1.1, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  }, { passive: false });
  let drag;
  $('pcb-svg').style.touchAction = 'none';
  $('pcb-svg').addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('[data-ref]')) return;
    drag = { x: event.clientX, y: event.clientY, view: [...view] }; $('pcb-svg').setPointerCapture(event.pointerId);
  });
  $('pcb-svg').addEventListener('pointermove', event => {
    if (!drag) return; const rect = $('pcb-svg').getBoundingClientRect();
    const scale = Math.min(rect.width / drag.view[2], rect.height / drag.view[3]);
    view = [drag.view[0] - (event.clientX - drag.x) / scale, drag.view[1] - (event.clientY - drag.y) / scale, ...drag.view.slice(2)];
    $('pcb-svg').setAttribute('viewBox', view.join(' '));
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('pcb-svg').addEventListener(type, () => { drag = undefined; });
  renderPCB(); renderSchematic(); renderBOM();
  $('explorer').hidden = false;
  $('status').textContent = `Loaded ${board.footprints.length} footprints, ${board.segments.length} routed segments and ${schematic.symbols.length} symbols from the local KiCad files. Preview only, not ERC/DRC.`;
}

$('load-kicanvas').addEventListener('click', async () => {
  const button = $('load-kicanvas'); button.disabled = true; $('kicanvas-status').textContent = 'Loading optional external KiCanvas engine…';
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.type = 'module'; script.src = 'https://kicanvas.org/kicanvas.js';
      const timeout = setTimeout(() => reject(new Error('KiCanvas network timeout')), 15000);
      script.onload = () => { clearTimeout(timeout); resolve(); }; script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('KiCanvas network request failed')); };
      document.head.append(script);
    });
    for (const file of ['chirpkey8.kicad_pcb', 'chirpkey8.kicad_sch']) {
      const embed = document.createElement('kicanvas-embed'); embed.setAttribute('src', new URL(file, import.meta.url).href); embed.setAttribute('controls', 'full');
      $('kicanvas-host').append(embed);
    }
    $('kicanvas-status').textContent = 'KiCanvas engine loaded. Its embedded viewers report their own file-loading errors.';
  } catch (error) { $('kicanvas-status').textContent = `${error.message}. The local explorer remains available.`; button.disabled = false; }
});
start().catch(error => { $('status').textContent = `${error.message}. Serve this folder over HTTP; module fetches do not work reliably from file://.`; });
