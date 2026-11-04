// Small source-derived preview parser, not a substitute for KiCad ERC/DRC.
export function parseSExpression(text) {
  if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('Invalid KiCad text size');
  let i = 0, nodes = 0;
  function value(depth = 0) {
    if (depth > 80 || ++nodes > 100_000) throw new Error('KiCad complexity limit');
    while (/\s/.test(text[i] ?? '') && i < text.length) i++;
    if (text[i] === '(') {
      i++; const list = [];
      while (true) {
        while (/\s/.test(text[i] ?? '') && i < text.length) i++;
        if (text[i] === ')') { i++; return list; }
        if (i >= text.length) throw new Error('Unclosed KiCad expression');
        list.push(value(depth + 1));
      }
    }
    if (text[i] === '"') {
      const start = i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i++] === '"') return JSON.parse(text.slice(start, i));
      }
      throw new Error('Unclosed KiCad string');
    }
    const start = i;
    while (i < text.length && !/[\s()]/.test(text[i])) i++;
    if (i === start) throw new Error('Unexpected KiCad token');
    const token = text.slice(start, i);
    return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token) ? Number(token) : token;
  }
  const root = value();
  if (text.slice(i).trim()) throw new Error('Trailing KiCad data');
  if (!Array.isArray(root)) throw new Error('Missing KiCad root');
  return root;
}
export const children = (node, name) => node.filter(item => Array.isArray(item) && item[0] === name);
export const child = (node, name) => children(node, name)[0];
export const properties = node => Object.fromEntries(children(node, 'property').map(p => [p[1], p[2]]));
export function boardModel(text) {
  const root = parseSExpression(text);
  if (root[0] !== 'kicad_pcb' || child(root, 'version')?.[1] !== 20240108) throw new Error('Expected KiCad 8 PCB');
  const footprints = children(root, 'footprint').map(fp => {
    const at = child(fp, 'at'), props = properties(fp);
    if (!at || !props.Reference || !props['Part Number']) throw new Error('Incomplete footprint');
    return { ref: props.Reference, value: props.Value, partNumber: props['Part Number'], x: at[1], y: at[2], node: fp,
      pads: children(fp, 'pad').map(p => {
        const pos = child(p, 'at'), size = child(p, 'size'), net = child(p, 'net');
        return { n: String(p[1]), shape: p[3], x: at[1] + pos[1], y: at[2] + pos[2], w: size[1], h: size[2], net: net[1], netName: net[2], layers: child(p, 'layers').slice(1), drill: child(p, 'drill')?.[1], node: p };
      }) };
  });
  const segments = children(root, 'segment').map(s => ({ a: child(s, 'start').slice(1), b: child(s, 'end').slice(1), width: child(s, 'width')[1], layer: child(s, 'layer')[1], net: child(s, 'net')[1] }));
  const vias = children(root, 'via').map(v => ({ at: child(v, 'at').slice(1), size: child(v, 'size')[1], drill: child(v, 'drill')[1], net: child(v, 'net')[1] }));
  return { root, footprints, segments, vias, nets: children(root, 'net').map(n => ({ id: n[1], name: n[2] })),
    outline: children(root, 'gr_line').filter(n => child(n, 'layer')[1] === 'Edge.Cuts').map(n => ({ a: child(n, 'start').slice(1), b: child(n, 'end').slice(1) })),
    texts: children(root, 'gr_text').map(n => ({ text: n[1], at: child(n, 'at').slice(1), size: child(child(child(n, 'effects'), 'font'), 'size')[1], layer: child(n, 'layer')[1] })) };
}
export function schematicModel(text) {
  const root = parseSExpression(text);
  if (root[0] !== 'kicad_sch' || child(root, 'version')?.[1] !== 20231120) throw new Error('Expected KiCad 8 schematic');
  const libs = new Map(children(child(root, 'lib_symbols'), 'symbol').map(s => [s[1], s]));
  const symbols = children(root, 'symbol').map(s => {
    const lib = libs.get(child(s, 'lib_id')[1]), at = child(s, 'at'), props = properties(s);
    if (!lib || !props['Part Number']) throw new Error('Missing embedded symbol or manufacturer number');
    return { ref: props.Reference, props, at: at.slice(1), node: s, lib,
      pins: children(lib, 'symbol').flatMap(unit => children(unit, 'pin')).map(p => ({ n: String(child(p, 'number')[1]), name: child(p, 'name')[1], at: child(p, 'at').slice(1), length: child(p, 'length')[1] })) };
  });
  return { root, symbols, wires: children(root, 'wire').map(w => children(child(w, 'pts'), 'xy').map(n => n.slice(1))), labels: children(root, 'label'), texts: children(root, 'text') };
}
export function usdCents(value) {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) throw new Error('USD must have two decimal places');
  const [d, c] = value.split('.'); return BigInt(d) * 100n + BigInt(c);
}
export const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function safeSupplierURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !['www.digikey.com', 'www.mouser.com', 'docs.oshpark.com'].includes(u.hostname)) throw new Error('Invalid supplier URL');
  return u.href;
}
export function validateBOM(bom) {
  if (bom.schemaVersion !== 1 || bom.currency !== 'USD' || !Array.isArray(bom.rows) || bom.rows.length > 100) throw new Error('Invalid BOM');
  let sum = 0n;
  for (const row of bom.rows) {
    if (!Number.isInteger(row.quantity) || row.quantity < 0 || !Array.isArray(row.references) || !row.references.length) throw new Error('Invalid BOM quantity/reference');
    safeSupplierURL(row.sourceUrl);
    const amount = usdCents(row.unitPrice) * BigInt(row.quantity);
    if (amount !== usdCents(row.lineTotal)) throw new Error('Incorrect line total');
    sum += amount;
  }
  if (sum !== usdCents(bom.pricing.partsAndPCB)) throw new Error('Incorrect BOM subtotal');
  const total = sum + usdCents(bom.pricing.shippingAllowance) + usdCents(bom.pricing.taxAllowance);
  if (total !== usdCents(bom.pricing.estimatedTotal)) throw new Error('Incorrect budget total');
  return { subtotal: sum, total, withinTarget: total <= usdCents(bom.pricing.target), withinGrant: total <= usdCents(bom.pricing.grantCap) };
}
