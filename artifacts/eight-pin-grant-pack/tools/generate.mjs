// Deterministic KiCad 8 artifact generator. Output is an apply_patch document,
// never a shell rewrite. Run from the pipeline root and pipe through apply_patch.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const q = JSON.stringify;
const number = (n) => Number(n.toFixed(4));
const id = (name) => {
  const hex = createHash('sha256').update('ChirpKey-8/v1/' + name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const rootId = id('schematic');
const nets = ['', '+3V3', 'GND', 'UPDI', 'TOUCH_SENSE', 'TOUCH', 'BUTTON', 'BUZZ_A_GPIO', 'BUZZ_A', 'BUZZ_B_GPIO', 'BUZZ_B', 'LED_GPIO', 'LED_A'];
const netId = (name) => nets.indexOf(name);
const passive = (n, name, x, y, angle) => ({ n: String(n), name, x, y, angle, type: 'passive' });
const pins2 = [passive(1, '1', -5.08, 0, 0), passive(2, '2', 5.08, 0, 180)];
const parts = [
  { ref: 'U1', value: 'ATtiny412-SSNR', mpn: 'ATtiny412-SSNR', manufacturer: 'Microchip Technology', price: '1.15', supplier: 'DigiKey', footprint: 'ChirpKey8:SOIC-8_3.9x4.9mm_P1.27mm', x: 12.3, y: 9.2, sx: 55.88, sy: 43.18, body: [3.9, 4.9],
    pins: [passive(1, 'VDD', -11.43, 3.81, 0), passive(2, 'PA6', -11.43, 1.27, 0), passive(3, 'PA7', -11.43, -1.27, 0), passive(4, 'PA1', -11.43, -3.81, 0), passive(8, 'GND', 11.43, 3.81, 180), passive(7, 'PA0/UPDI', 11.43, 1.27, 180), passive(6, 'PA3', 11.43, -1.27, 180), passive(5, 'PA2', 11.43, -3.81, 180)].map(p => ({ ...p, type: ['1', '8'].includes(p.n) ? 'power_in' : 'bidirectional' })),
    pads: [1,2,3,4,5,6,7,8].map(n => ({ n: String(n), x: n < 5 ? -2.475 : 2.475, y: n < 5 ? -1.905 + (n - 1) * 1.27 : 1.905 - (n - 5) * 1.27, w: 1.95, h: 0.6 })),
    connections: { 1: '+3V3', 2: 'TOUCH_SENSE', 3: 'BUTTON', 4: 'BUZZ_A_GPIO', 5: 'BUZZ_B_GPIO', 6: 'LED_GPIO', 7: 'UPDI', 8: 'GND' } },
  { ref: 'BZ1', value: 'CMT-1203-SMT-TR (piezo)', mpn: 'CMT-1203-SMT-TR', manufacturer: 'Same Sky (formerly CUI Devices)', price: '2.25', supplier: 'DigiKey', footprint: 'ChirpKey8:CMT-1203-SMT-TR', x: 24.5, y: 9.5, sx: 134.62, sy: 43.18, body: [12,12], pins: pins2,
    pads: [{ n: '1', x: 0, y: -6, w: 6, h: 3 }, { n: '2', x: 0, y: 6, w: 6, h: 3 }], connections: { 1: 'BUZZ_A', 2: 'BUZZ_B' } },
  { ref: 'D1', value: 'Red LED', mpn: 'LTST-C171KRKT', manufacturer: 'Lite-On', price: '0.22', supplier: 'DigiKey', footprint: 'ChirpKey8:LED_0805', x: 14, y: 19.5, sx: 134.62, sy: 104.14, body: [2,1.25], pins: [passive(1, 'K', -5.08, 0, 0), passive(2, 'A', 5.08, 0, 180)],
    pads: [{ n: '1', x: -1, y: 0, w: 1, h: 1.4 }, { n: '2', x: 1, y: 0, w: 1, h: 1.4 }], connections: { 1: 'GND', 2: 'LED_A' } },
  { ref: 'C1', value: '100 nF / 50 V', mpn: 'C0805C104K5RACTU', manufacturer: 'KEMET', price: '0.12', supplier: 'DigiKey', footprint: 'ChirpKey8:C_0805', x: 8, y: 5, sx: 55.88, sy: 73.66, body: [2,1.25], pins: pins2,
    pads: [{ n: '1', x: -.95, y: 0, w: 1.05, h: 1.4 }, { n: '2', x: .95, y: 0, w: 1.05, h: 1.4 }], connections: { 1: '+3V3', 2: 'GND' } },
  { ref: 'R1', value: '10 kOhm / LED', mpn: 'RC0805FR-0710KL', manufacturer: 'Yageo', price: '0.10', supplier: 'DigiKey', footprint: 'ChirpKey8:R_0805', x: 14, y: 16.4, sx: 134.62, sy: 88.9, body: [2,1.25], pins: pins2,
    pads: [{ n: '1', x: -.95, y: 0, w: 1.05, h: 1.4 }, { n: '2', x: .95, y: 0, w: 1.05, h: 1.4 }], connections: { 1: 'LED_GPIO', 2: 'LED_A' } },
  { ref: 'R2', value: '10 kOhm / touch', mpn: 'RC0805FR-0710KL', manufacturer: 'Yageo', price: '0.10', supplier: 'DigiKey', footprint: 'ChirpKey8:R_0805', x: 11.3, y: 13.3, sx: 55.88, sy: 88.9, body: [2,1.25], pins: pins2,
    pads: [{ n: '1', x: -.95, y: 0, w: 1.05, h: 1.4 }, { n: '2', x: .95, y: 0, w: 1.05, h: 1.4 }], connections: { 1: 'TOUCH_SENSE', 2: 'TOUCH' } },
  { ref: 'R3', value: '220 Ohm / piezo A', mpn: 'RC0805FR-07220RL', manufacturer: 'Yageo', price: '0.10', supplier: 'DigiKey', footprint: 'ChirpKey8:R_0805', x: 12.7, y: 4.3, sx: 104.14, sy: 43.18, body: [2,1.25], pins: pins2,
    pads: [{ n: '1', x: -.95, y: 0, w: 1.05, h: 1.4 }, { n: '2', x: .95, y: 0, w: 1.05, h: 1.4 }], connections: { 1: 'BUZZ_A_GPIO', 2: 'BUZZ_A' } },
  { ref: 'R4', value: '220 Ohm / piezo B', mpn: 'RC0805FR-07220RL', manufacturer: 'Yageo', price: '0.10', supplier: 'DigiKey', footprint: 'ChirpKey8:R_0805', x: 15.5, y: 13.3, sx: 104.14, sy: 58.42, body: [2,1.25], pins: pins2,
    pads: [{ n: '1', x: -.95, y: 0, w: 1.05, h: 1.4 }, { n: '2', x: .95, y: 0, w: 1.05, h: 1.4 }], connections: { 1: 'BUZZ_B_GPIO', 2: 'BUZZ_B' } },
  { ref: 'SW1', value: 'Transmit button', mpn: 'B3U-1000P', manufacturer: 'Omron', price: '0.90', supplier: 'Mouser', footprint: 'ChirpKey8:SW_SPST_B3U-1000P', x: 25, y: 20, sx: 55.88, sy: 119.38, body: [3,2.5], pins: pins2,
    pads: [{ n: '1', x: -1.7, y: 0, w: .9, h: 1.7 }, { n: '2', x: 1.7, y: 0, w: .9, h: 1.7 }], connections: { 1: 'BUTTON', 2: 'GND' } },
  { ref: 'J1', value: '3V3 / GND / UPDI', mpn: 'M20-9990345', manufacturer: 'Harwin', price: '0.45', supplier: 'DigiKey', footprint: 'ChirpKey8:PinHeader_1x03_P2.54mm', x: 4.2, y: 5.7, sx: 55.88, sy: 104.14, body: [2.54,7.62],
    pins: [passive(1, 'GND', -5.08, 2.54, 0), passive(2, '3V3 IN', -5.08, 0, 0), passive(3, 'UPDI', -5.08, -2.54, 0)].map(p => ({ ...p, type: p.n === '3' ? 'passive' : 'power_out' })),
    pads: [1,2,3].map(n => ({ n: String(n), x: 0, y: (n - 2) * 2.54, w: 1.7, h: 1.7, drill: 1 })), connections: { 1: 'GND', 2: '+3V3', 3: 'UPDI' } },
  { ref: 'TP1', value: 'Covered copper touch electrode', mpn: 'CHIRPKEY8-PCB-V1.0', manufacturer: 'Aariv Patel / OSH Park', price: '0.00', supplier: 'OSH Park', footprint: 'ChirpKey8:Touch_D8.4mm', x: 6.5, y: 17.8, sx: 55.88, sy: 134.62, body: [8.4,8.4], pins: [passive(1, 'TOUCH', -5.08, 0, 0)],
    pads: [{ n: '1', x: 0, y: 0, w: 8.4, h: 8.4, circle: true, covered: true }], connections: { 1: 'TOUCH' }, integral: true }
];

function prop(name, value, x, y, hidden = false, pcb = false) {
  return `(property ${q(name)} ${q(value)} (at ${number(x)} ${number(y)} 0) ${pcb ? '(layer "F.' + (hidden ? 'Fab' : 'SilkS') + '") ' : ''}(effects (font (size ${pcb ? '.7 .7' : '1.016 1.016'})${pcb ? ' (thickness .15)' : ''})${hidden ? ' hide' : ''}))`;
}
function makeSchematic() {
  const library = parts.map(p => {
    const name = p.ref + '_Device';
    const bw = p.ref === 'U1' ? 8.89 : 2.54;
    const bh = p.ref === 'U1' ? 6.35 : 3.81;
    return `(symbol ${q('ChirpKey8:' + name)} (pin_names (offset .508)) (exclude_from_sim no) (in_bom ${p.integral ? 'no' : 'yes'}) (on_board yes)
      ${prop('Reference', p.ref.replace(/[0-9]/g, ''), 0, -bh - 2.54)}
      ${prop('Value', p.value, 0, -bh - 5.08)}
      ${prop('Footprint', p.footprint, 0, 0, true)} ${prop('Datasheet', '', 0, 0, true)}
      ${prop('Part Number', p.mpn, 0, 0, true)} ${prop('Manufacturer', p.manufacturer, 0, 0, true)}
      (symbol ${q(name + '_0_1')} (rectangle (start ${-bw} ${bh}) (end ${bw} ${-bh}) (stroke (width .254) (type default)) (fill (type background))))
      (symbol ${q(name + '_1_1')} ${p.pins.map(pin => `(pin ${pin.type} line (at ${pin.x} ${pin.y} ${pin.angle}) (length 2.54) (name ${q(pin.name)} (effects (font (size 1.016 1.016)))) (number ${q(pin.n)} (effects (font (size 1.016 1.016)))))`).join('\n')}))`;
  }).join('\n');
  const symbols = [], wiring = [];
  for (const p of parts) {
    const bh = p.ref === 'U1' ? 6.35 : 3.81;
    symbols.push(`(symbol (lib_id ${q('ChirpKey8:' + p.ref + '_Device')}) (at ${p.sx} ${p.sy} 0) (unit 1) (exclude_from_sim no) (in_bom ${p.integral ? 'no' : 'yes'}) (on_board yes) (dnp no) (uuid ${id('sym/' + p.ref)})
      ${prop('Reference', p.ref, p.sx, p.sy - bh - 5.08)} ${prop('Value', p.value, p.sx, p.sy - bh - 2.54)}
      ${prop('Footprint', p.footprint, p.sx, p.sy, true)} ${prop('Datasheet', '', p.sx, p.sy, true)}
      ${prop('Part Number', p.mpn, p.sx, p.sy, true)} ${prop('Manufacturer', p.manufacturer, p.sx, p.sy, true)}
      ${p.pins.map(pin => `(pin ${q(pin.n)} (uuid ${id(p.ref + '/pin/' + pin.n)}))`).join('\n')}
      (instances (project "chirpkey8" (path ${q('/' + rootId)} (reference ${q(p.ref)}) (unit 1)))))`);
    for (const pin of p.pins) {
      const x = number(p.sx + pin.x), y = number(p.sy - pin.y), dx = pin.angle === 0 ? -3.81 : 3.81;
      const end = number(x + dx), net = p.connections[pin.n];
      wiring.push(`(wire (pts (xy ${x} ${y}) (xy ${end} ${y})) (stroke (width 0) (type default)) (uuid ${id(p.ref + '/wire/' + pin.n)}))`);
      wiring.push(`(label ${q(net)} (at ${end} ${y} 0) (effects (font (size 1.016 1.016)) (justify ${dx < 0 ? 'right' : 'left'} bottom)) (uuid ${id(p.ref + '/label/' + pin.n)}))`);
    }
  }
  const notes = [
    ['ChirpKey-8 v1.0', 35.56, 15.24, 2.54],
    ['8-pin acoustic FSK + capacitive touch token | Aariv Patel', 35.56, 22.86, 1.27],
    ['3.3 V regulated supply only. J1 powers and programs via UPDI.', 35.56, 149.86, 1.27],
    ['Piezo BZ1 is differentially driven by PA1/PA2 through two 220 Ohm resistors.', 35.56, 154.94, 1.27],
    ['PA6 weak-pullup RC timing measures the masked TP1 electrode via R2.', 35.56, 160.02, 1.27],
    ['PA7 button uses internal pullup. PA3 drives the low-current red LED.', 35.56, 165.1, 1.27],
    ['AI-assisted design. No human hours, fabrication, grant approval or secure authentication claimed.', 35.56, 170.18, 1.016]
  ].map(([t,x,y,s],i) => `(text ${q(t)} (at ${x} ${y} 0) (effects (font (size ${s} ${s})) (justify left)) (uuid ${id('note/' + i)}))`).join('\n');
  return `(kicad_sch (version 20231120) (generator "chirpkey8_generator") (generator_version "1.0") (uuid ${rootId}) (paper "A4")
    (title_block (title "ChirpKey-8") (rev "1.0") (company "Aariv Patel") (comment 1 "3.3 V | ATtiny412-SSNR | AI-assisted design"))
    (lib_symbols ${library}) ${notes} ${wiring.join('\n')} ${symbols.join('\n')}
    (sheet_instances (path "/" (page "1"))))\n`;
}

// Two-layer grid router. All foreign copper gets 0.20 mm clearance, including
// pad edges. Layer changes create real plated vias, never disconnected artwork.
const STEP = .1, NX = 321, NY = 241, CELLS = NX * NY;
const encode = (x,y,l) => l * CELLS + y * NX + x;
const decode = n => { const l = n >= CELLS ? 1 : 0; n -= l * CELLS; return [n % NX, Math.floor(n / NX), l]; };
const physical = n => { const [x,y,l] = decode(n); return [number(x * STEP), number(y * STEP), l]; };
class Heap {
  items = [];
  push(n, score) { let i = this.items.length; this.items.push([n,score]); while(i) { const p = (i-1)>>1; if(this.items[p][1] <= score) break; this.items[i] = this.items[p]; i=p; } this.items[i]=[n,score]; }
  pop() { const first = this.items[0], last = this.items.pop(); if(this.items.length) { let i=0; while(2*i+1<this.items.length) { let c=2*i+1; if(c+1<this.items.length && this.items[c+1][1]<this.items[c][1]) c++; if(this.items[c][1]>=last[1]) break; this.items[i]=this.items[c]; i=c; } this.items[i]=last; } return first; }
}
function mark(mask, shape, margin) {
  const rx = (shape.w ?? shape.r*2)/2 + margin, ry = (shape.h ?? shape.r*2)/2 + margin;
  const minX=Math.max(0,Math.floor((shape.x-rx)/STEP)), maxX=Math.min(NX-1,Math.ceil((shape.x+rx)/STEP));
  const minY=Math.max(0,Math.floor((shape.y-ry)/STEP)), maxY=Math.min(NY-1,Math.ceil((shape.y+ry)/STEP));
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
    if(shape.r !== undefined && Math.hypot(x*STEP-shape.x,y*STEP-shape.y)>shape.r+margin) continue;
    if(shape.r === undefined && (Math.abs(x*STEP-shape.x)>rx || Math.abs(y*STEP-shape.y)>ry)) continue;
    for(const l of shape.layers) mask[encode(x,y,l)]=1;
  }
}
function routeBoard() {
  const shapes = [], segments = [], vias = [], pads = [];
  for(const p of parts) for(const pad of p.pads) {
    const x=number(p.x+pad.x), y=number(p.y+pad.y), layers=pad.drill?[0,1]:[0];
    const net=netId(p.connections[pad.n]);
    pads.push({ ref:p.ref, n:pad.n, net, x,y,layers });
    shapes.push({ x,y,net,layers, ...(pad.circle ? { r:pad.w/2 } : { w:pad.w,h:pad.h }) });
  }
  for(let net=1;net<nets.length;net++) {
    const targets=pads.filter(p=>p.net===net), connected=[targets.shift()];
    while(targets.length) {
      let best=[Infinity,0,0];
      for(let a=0;a<connected.length;a++) for(let b=0;b<targets.length;b++) {
        const d=Math.hypot(connected[a].x-targets[b].x,connected[a].y-targets[b].y);
        if(d<best[0]) best=[d,a,b];
      }
      const start=connected[best[1]], finish=targets.splice(best[2],1)[0];
      const blocked=new Uint8Array(CELLS*2), noVia=new Uint8Array(CELLS*2);
      for(const shape of shapes) if(shape.net!==net) { mark(blocked,shape,.325); mark(noVia,shape,.525); }
      // Nothing on B.Cu beneath the touch electrode, including this net.
      const touch={x:6.5,y:17.8,r:4.6,layers:[1]}; mark(blocked,touch,.125); mark(noVia,touch,.325);
      const src=encode(Math.round(start.x/STEP),Math.round(start.y/STEP),0);
      const dst=encode(Math.round(finish.x/STEP),Math.round(finish.y/STEP),0);
      const [tx,ty] = decode(dst), heap=new Heap(), cost=new Float64Array(CELLS*2).fill(Infinity), prev=new Int32Array(CELLS*2).fill(-1), closed=new Uint8Array(CELLS*2);
      const heuristic=n=>{const[x,y,l]=decode(n);return Math.abs(tx-x)+Math.abs(ty-y)+l*60;};
      cost[src]=0; heap.push(src,heuristic(src));
      while(heap.items.length) {
        const [cur]=heap.pop(); if(closed[cur])continue; closed[cur]=1; if(cur===dst)break;
        const[x,y,l]=decode(cur);
        for(const[dx,dy,dl,weight]of[[1,0,0,1],[-1,0,0,1],[0,1,0,1],[0,-1,0,1],[0,0,1,60]]) {
          const xx=x+dx,yy=y+dy,ll=dl?1-l:l;
          if(xx<6||xx>314||yy<6||yy>234)continue;
          const n=encode(xx,yy,ll); if(blocked[n]||closed[n])continue;
          if(dl && (noVia[cur]||noVia[n]||x<9||x>311||y<9||y>231))continue;
          if(cost[cur]+weight<cost[n]) {cost[n]=cost[cur]+weight;prev[n]=cur;heap.push(n,cost[n]+heuristic(n));}
        }
      }
      if(!closed[dst])throw new Error('Routing failed on '+nets[net]+' to '+finish.ref);
      const path=[]; for(let n=dst;n!==-1;n=prev[n])path.push(n);path.reverse();
      const points=path.map(physical);
      const emit=(a,b,l)=>{if(a[0]===b[0]&&a[1]===b[1])return; segments.push({a:a.slice(0,2),b:b.slice(0,2),layer:l,net,width:.25});};
      emit([start.x,start.y],points[0],0); emit(points.at(-1),[finish.x,finish.y],0);
      let begin=points[0];
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i];
        if(a[2]!==b[2]) {
          emit(begin,a,a[2]); begin=b;
          if(!vias.some(v=>v.x===a[0]&&v.y===a[1]&&v.net===net)) {
            vias.push({x:a[0],y:a[1],net,size:.65,drill:.3}); shapes.push({x:a[0],y:a[1],net,r:.325,layers:[0,1]});
          }
        } else if(i===points.length-1 || points[i+1][2]!==b[2] || (b[0]===a[0])!==(points[i+1][0]===b[0])) {emit(begin,b,b[2]);begin=b;}
      }
      for(const[x,y,l]of points) shapes.push({x,y,r:.125,layers:[l],net});
      connected.push(finish);
    }
  }
  return { segments,vias };
}
function line(a,b,layer,uid,width=.15) { return `(fp_line (start ${a[0]} ${a[1]}) (end ${b[0]} ${b[1]}) (stroke (width ${width}) (type default)) (layer ${q(layer)}) (uuid ${id(uid)}))`; }
function footprint(p) {
  const [w,h]=p.body, uid='fp/'+p.ref;
  const minX=Math.min(-w/2,...p.pads.map(p=>p.x-p.w/2))-.25, maxX=Math.max(w/2,...p.pads.map(p=>p.x+p.w/2))+.25;
  const minY=Math.min(-h/2,...p.pads.map(p=>p.y-p.h/2))-.25, maxY=Math.max(h/2,...p.pads.map(p=>p.y+p.h/2))+.25;
  let graphics='';
  if(p.integral) graphics=`(fp_circle (center 0 0) (end 4.5 0) (stroke (width .15) (type default)) (fill none) (layer "F.SilkS") (uuid ${id(uid+'/touch-ring')}))`;
  else {
    const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
    graphics=corners.map((a,i)=>line(a,corners[(i+1)%4],'F.Fab',uid+'/fab/'+i,.1)).join('\n');
    // Silkscreen outside all solderable pads, avoiding pad/mask overlaps.
    graphics += '\n'+line([minX,minY-.15],[maxX,minY-.15],'F.SilkS',uid+'/silk-top');
    graphics += '\n'+line([minX,maxY+.15],[maxX,maxY+.15],'F.SilkS',uid+'/silk-bottom');
  }
  const court=[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]];
  graphics+='\n'+court.map((a,i)=>line(a,court[(i+1)%4],'F.CrtYd',uid+'/court/'+i,.05)).join('\n');
  const referenceY = p.ref==='BZ1' ? 0 : minY-1;
  return `(footprint ${q(p.footprint)} (layer "F.Cu") (uuid ${id(uid)}) (at ${p.x} ${p.y})
    ${prop('Reference',p.ref,0,referenceY,false,true)} ${prop('Value',p.value,0,0,true,true)} ${prop('Part Number',p.mpn,0,0,true,true)}
    (path ${q('/'+rootId+'/'+id('sym/'+p.ref))}) (attr ${p.ref==='J1'?'through_hole':'smd'}${p.integral?' exclude_from_pos_files exclude_from_bom':''}) ${graphics}
    ${p.pads.map(pad=>`(pad ${q(pad.n)} ${pad.drill?'thru_hole': 'smd'} ${pad.circle?'circle':pad.drill&&pad.n==='1'?'rect':'roundrect'} (at ${pad.x} ${number(pad.y)}) (size ${pad.w} ${pad.h}) ${pad.drill?'(drill '+pad.drill+')':''} (layers ${pad.drill?'"*.Cu" "*.Mask"':pad.covered?'"F.Cu"':'"F.Cu" "F.Paste" "F.Mask"'}) ${!pad.circle&&!(pad.drill&&pad.n==='1')?'(roundrect_rratio .2)':''} (net ${netId(p.connections[pad.n])} ${q(p.connections[pad.n])}) (uuid ${id(uid+'/pad/'+pad.n)}))`).join('\n')})`;
}
function makePCB() {
  const {segments,vias}=routeBoard();
  const layerList=[[0,'F.Cu','signal'],[31,'B.Cu','signal'],[34,'B.Paste','user'],[35,'F.Paste','user'],[36,'B.SilkS','user'],[37,'F.SilkS','user'],[38,'B.Mask','user'],[39,'F.Mask','user'],[44,'Edge.Cuts','user'],[46,'B.CrtYd','user'],[47,'F.CrtYd','user'],[48,'B.Fab','user'],[49,'F.Fab','user']];
  const edge=[[0,0],[32,0],[32,24],[0,24]];
  const texts=[['ChirpKey-8',11.5,1.8,1],['v1.0',11.5,2.9,.7],['TOUCH',6.5,17.8,1],['SEND',25,22,.7],['GND',1.7,3.16,.55],['3V3',1.7,5.7,.55],['UPDI',1.7,8.24,.55],['ChirpKey-8 v1.0 — Aariv Patel',16,23.1,.7]];
  return `(kicad_pcb (version 20240108) (generator "chirpkey8_generator") (generator_version "1.0")
    (general (thickness 1.6)) (paper "A4")
    (title_block (title "ChirpKey-8") (rev "1.0") (company "Aariv Patel"))
    (layers ${layerList.map(([i,n,t])=>`(${i} ${q(n)} ${t})`).join('\n')})
    (setup (pad_to_mask_clearance 0) (solder_mask_min_width .1016) (allow_soldermask_bridges_in_footprints no))
    ${nets.map((n,i)=>`(net ${i} ${q(n)})`).join('\n')}
    ${parts.map(footprint).join('\n')}
    ${edge.map((p,i)=>`(gr_line (start ${p[0]} ${p[1]}) (end ${edge[(i+1)%4][0]} ${edge[(i+1)%4][1]}) (stroke (width .05) (type default)) (layer "Edge.Cuts") (uuid ${id('edge/'+i)}))`).join('\n')}
    ${texts.map(([t,x,y,s],i)=>`(gr_text ${q(t)} (at ${x} ${y}) (layer "F.SilkS") (uuid ${id('silk/'+i)}) (effects (font (size ${s} ${s}) (thickness .15))))`).join('\n')}
    ${segments.map((s,i)=>`(segment (start ${s.a.join(' ')}) (end ${s.b.join(' ')}) (width ${s.width}) (layer ${q(s.layer?'B.Cu':'F.Cu')}) (net ${s.net}) (uuid ${id('track/'+i)}))`).join('\n')}
    ${vias.map((v,i)=>`(via (at ${v.x} ${v.y}) (size ${v.size}) (drill ${v.drill}) (layers "F.Cu" "B.Cu") (net ${v.net}) (uuid ${id('via/'+i)}))`).join('\n')})\n`;
}
function makeBOM() {
  const grouped=new Map();
  for(const p of parts) {
    const row=grouped.get(p.mpn)??{ references:[],partNumber:p.mpn,manufacturer:p.manufacturer,description:p.value,quantity:0,unitPrice:p.price,supplier:p.supplier,quoteStatus:p.integral?'included-in-PCB':'unverified-estimate',sourceUrl:p.integral?'https://docs.oshpark.com/services/two-layer/':p.supplier==='Mouser'?'https://www.mouser.com/c/?q='+encodeURIComponent(p.mpn):'https://www.digikey.com/en/products/result?keywords='+encodeURIComponent(p.mpn) };
    row.references.push(p.ref);if(!p.integral)row.quantity++; grouped.set(p.mpn,row);
  }
  const rows=[...grouped.values()].map(r=>({...r,lineTotal:(Number(r.unitPrice)*r.quantity).toFixed(2)}));
  rows.push({references:['PCB'],partNumber:'CHIRPKEY8-PCB-V1.0',manufacturer:'Aariv Patel / OSH Park',description:'32 x 24 mm 2-layer prototype lot (3 bare boards)',quantity:1,unitPrice:'5.95',lineTotal:'5.95',supplier:'OSH Park',quoteStatus:'published-area-rate-not-checkout-quote',sourceUrl:'https://docs.oshpark.com/services/two-layer/',boardsSupplied:3});
  const cents=rows.reduce((s,r)=>s+Math.round(Number(r.unitPrice)*100)*r.quantity,0);
  return {schemaVersion:1,currency:'USD',assemblies:1,board:{widthMm:32,heightMm:24,layers:2,areaSquareInches:768/(25.4**2),ratePerSquareInch:'5.00',lotPrice:'5.95',boardsPerLot:3},rows,
    pricing:{status:'estimate-not-exact-vendor-quote',partsAndPCB:(cents/100).toFixed(2),shippingAllowance:'5.00',taxAllowance:'0.96',estimatedTotal:((cents+500+96)/100).toFixed(2),target:'18.40',grantCap:'35.00',exactQuoteVerified:false,disclosure:'Component prices and shipping/tax allowances are planning estimates, not live DigiKey/Mouser quotes. Supplier pages were blocked. OSH Park publishes $5/sq in for THREE boards; 32*24/25.4^2*5 rounds to $5.95 per lot. Refresh checkout quotes before submission or ordering.'}};
}
export function generatePack() {
  const bom=makeBOM();
  const project={meta:{filename:'chirpkey8.kicad_pro',version:1},board:{design_settings:{defaults:{board_outline_line_width:.05,copper_line_width:.25},rules:{min_clearance:.2,min_track_width:.25,min_via_diameter:.65,min_through_hole_diameter:.3,min_copper_edge_clearance:.4,min_via_annular_width:.15,solder_mask_clearance:0,solder_mask_min_width:.1016},rule_severities:{},track_widths:[.25,.4],via_dimensions:[{diameter:.65,drill:.3}]}},net_settings:{classes:[{name:'Default',clearance:.2,track_width:.25,via_diameter:.65,via_drill:.3,microvia_diameter:.3,microvia_drill:.1}],meta:{version:3},netclass_assignments:{},netclass_patterns:[]},schematic:{drawing:{default_line_thickness:6,default_text_size:50},meta:{version:1}},sheets:[[rootId,'ChirpKey-8']],text_variables:{PROJECT_NAME:'ChirpKey-8'}};
  const csvCell=s=>'"'+String(s).replaceAll('"','""')+'"';
  const csv=['Reference,Part Number,Manufacturer,Description,Quantity,Unit Price USD,Line Total USD,Supplier,Price Status,Source URL',...bom.rows.map(r=>[r.references.join(' '),r.partNumber,r.manufacturer,r.description,r.quantity,r.unitPrice,r.lineTotal,r.supplier,r.quoteStatus,r.sourceUrl].map(csvCell).join(','))].join('\n')+'\n';
  return {'chirpkey8.kicad_pro':JSON.stringify(project,null,2)+'\n','chirpkey8.kicad_sch':makeSchematic(),'chirpkey8.kicad_pcb':makePCB(),'bom.json':JSON.stringify(bom,null,2)+'\n','bom.csv':csv};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const generated=generatePack(),prefix='artifacts/eight-pin-grant-pack/';
  if(process.argv.includes('--check')) {
    for(const[name,text]of Object.entries(generated)) if(readFileSync(new URL('../'+name,import.meta.url),'utf8')!==text)throw new Error('Stale generated file '+name);
    console.log('All five generated files match their deterministic source.');
  } else if(process.argv.includes('--emit-patch')) {
    console.log('*** Begin Patch\n'+Object.entries(generated).map(([name,text])=>'*** Add File: '+prefix+name+'\n'+text.trimEnd().split('\n').map(l=>'+'+l).join('\n')).join('\n')+'\n*** End Patch');
  } else throw new Error('Use --check or --emit-patch.');
}
