import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import CAD from '../artifacts/bakebuild-studio/cad-engine.js';
import { boardModel, schematicModel, validateBOM, parseSExpression, safeSupplierURL, usdCents } from '../artifacts/eight-pin-grant-pack/core.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
const json = name => JSON.parse(read(name));
const eight = 'artifacts/eight-pin-grant-pack/';
const domains = 'artifacts/subdomain-pr-packs/';
const bake = 'artifacts/bakebuild-studio/';
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const close=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('eight-pin pack contains editable sources, firmware, explorer and planning disclosure',()=>{
  for(const name of ['chirpkey8.kicad_pro','chirpkey8.kicad_sch','chirpkey8.kicad_pcb','bom.json','bom.csv','firmware/chirpkey8.ino','core.js','app.js','index.html','style.css','JOURNAL.md','README.md','tools/generate.mjs']) assert.ok(read(eight+name).length>0,name);
  assert.equal(typeof json(eight+'chirpkey8.kicad_pro'),'object');
  assert.match(read(eight+'README.md'),/not.*fabrication-ready/i);
  assert.match(read(eight+'JOURNAL.md'),/plan|planned/i);
});

test('KiCad PCB and schematic agree on references and manufacturer part numbers',()=>{
  const board=boardModel(read(eight+'chirpkey8.kicad_pcb'));
  const schematic=schematicModel(read(eight+'chirpkey8.kicad_sch'));
  assert.ok(board.footprints.length>=8); assert.ok(board.segments.length>0); assert.equal(board.outline.length,4);
  const pcb=new Map(board.footprints.map(p=>[p.ref,p.partNumber]));
  const sch=new Map(schematic.symbols.map(s=>[s.ref,s.props['Part Number']]));
  assert.deepEqual([...pcb].sort(),[...sch].sort());
  assert.equal(new Set(board.footprints.map(p=>p.ref)).size,board.footprints.length);
  const controller=board.footprints.find(p=>p.ref==='U1'); assert.equal(controller.pads.length,8);
  const bounds=board.outline.flatMap(l=>[l.a,l.b]);
  close(Math.max(...bounds.map(p=>p[0]))-Math.min(...bounds.map(p=>p[0])),32);
  close(Math.max(...bounds.map(p=>p[1]))-Math.min(...bounds.map(p=>p[1])),24);
  for(const pad of board.footprints.flatMap(p=>p.pads)) assert.ok(board.nets.some(n=>n.id===pad.net));
});

test('grant BOM arithmetic, PCB lot estimate, references and unsafe inputs',()=>{
  const bom=json(eight+'bom.json'), result=validateBOM(bom);
  assert.equal(result.total,1740n); assert.equal(result.withinTarget,true); assert.equal(result.withinGrant,true);
  assert.equal(bom.board.boardsPerLot,3); assert.equal(bom.board.lotPrice,'5.95');
  close(bom.board.areaSquareInches,bom.board.widthMm*bom.board.heightMm/(25.4**2));
  const refs=new Set(boardModel(read(eight+'chirpkey8.kicad_pcb')).footprints.map(p=>p.ref));
  for(const row of bom.rows) for(const ref of row.references) if(refs.has(ref)) refs.delete(ref);
  assert.equal(refs.size,0,'Every board component is covered by BOM');
  const broken=structuredClone(bom); broken.rows[0].lineTotal='0.00'; assert.throws(()=>validateBOM(broken),/line total/);
  for(const input of ['1.001','-1.00','NaN']) assert.throws(()=>usdCents(input));
  for(const url of ['javascript:alert(1)','https://evil.example','https://user:pass@www.digikey.com']) assert.throws(()=>safeSupplierURL(url));
  for(const source of ['(kicad_pcb','(x) trailing','"unterminated']) assert.throws(()=>parseSExpression(source));
});

test('is-a.dev drafts contain public owner and matching host-only CNAME records',()=>{
  for(const name of ['stepcheck','taaltrainer']) {
    const entry=json(domains+'is-a-dev/domains/'+name+'.json');
    assert.deepEqual(Object.keys(entry).sort(),['owner','records']);
    assert.deepEqual(entry.owner,{username:'draarivpatel-ui'});
    assert.deepEqual(entry.records,{CNAME:'draarivpatel-ui.github.io'});
    assert.ok(!JSON.stringify(entry).includes('@')); assert.ok(!entry.records.CNAME.includes('/'));
  }
  assert.match(read(domains+'README.md'),/No PR has been opened/);
  assert.match(read(domains+'README.md'),/cannot simply bind all four names/);
});

test('JS.ORG patch is an applicable draft with two consistent noCF entries',()=>{
  const patch=read(domains+'js-org/cnames_active_patch.diff');
  const additions=patch.split('\n').filter(line=>line.startsWith('+')&&!line.startsWith('+++'));
  assert.equal(additions.length,2);
  for(const name of ['stepcheck','taaltrainer']) assert.ok(additions.some(line=>line.includes('"'+name+'": "draarivpatel-ui.github.io", // noCF')));
  assert.match(patch,/@@ -1,1 \+1,3 @@/);
  // Validates patch syntax against a disposable stdin stream, without upstream writes.
  const stat=execFileSync('git',['apply','--stat','-'],{cwd:root,input:patch,encoding:'utf8'});
  assert.match(stat,/2 insertions/);
});

for(const design of CAD.DESIGNS) {
  test(design.id+': bounds, dimensional rules, offsets and clear hole',()=>{
    const model=CAD.generate(design.id); assert.equal(model.validation.pass,true);
    assert.equal(model.solids.length,1); assert.ok(model.volume>0);
    const limit=design.type==='cutter'?[100,100,100]:[80,80,6];
    const points=model.triangles.flat();
    for(let axis=0;axis<3;axis++) { const min=Math.min(...points.map(p=>p[axis])),max=Math.max(...points.map(p=>p[axis])); close(model.bounds.min[axis],min);close(model.bounds.max[axis],max);close(model.dimensions[axis],max-min);assert.ok(max-min<=limit[axis]); }
    if(design.type==='cutter') {
      close(model.dimensions[2],12.7);
      const contour=CAD.profile(design);
      for(const width of [0.8,2,5]) {
        const out=CAD.offset(contour,width);
        for(let i=0;i<contour.length;i++) { const j=(i+1)%contour.length,a=contour[i],b=contour[j],edge=subtract(b,a); const distance=p=>Math.abs(edge[0]*(p[1]-a[1])-edge[1]*(p[0]-a[0]))/Math.hypot(...edge);close(distance(out[i]),width);close(distance(out[j]),width); }
      }
      assert.deepEqual(model.sections.map(s=>s.thickness),[0.8,2,5]);close(model.sections[2].top-model.sections[2].bottom,2);
    } else {
      close(model.bounds.min[2],0);close(model.dimensions[2],4);assert.ok(model.holeDiameter>=5);
      const hole=model.solids[0].vertices.slice(0,design.sectors);
      for(let i=0;i<hole.length;i++){const a=hole[i],b=hole[(i+1)%hole.length];const clear=2*Math.abs(a[0]*b[1]-a[1]*b[0])/Math.hypot(b[0]-a[0],b[1]-a[1]);close(clear,6);}
    }
    const invalid={...model,dimensions:[101,101,101]};assert.equal(CAD.validate(invalid).pass,false);
  });
  test(design.id+': closed connected genus-one topology and planar outward faces',()=>{
    const model=CAD.generate(design.id),solid=model.solids[0],edges=new Map();
    for(const face of solid.faces) {
      const p=face.map(i=>solid.vertices[i]),normal=cross(subtract(p[1],p[0]),subtract(p[2],p[0]));assert.ok(Math.hypot(...normal)>1e-8);
      for(const v of p) close(dot(normal,subtract(v,p[0])),0);
      for(let i=0;i<face.length;i++){const a=face[i],b=face[(i+1)%face.length],key=[Math.min(a,b),Math.max(a,b)].join(':');const uses=edges.get(key)||[];uses.push([a,b]);edges.set(key,uses);}
      for(let i=1;i<face.length-1;i++) assert.ok(dot(normal,cross(subtract(p[i],p[0]),subtract(p[i+1],p[0])))>0,'triangulation respects face orientation');
    }
    for(const uses of edges.values()) { assert.equal(uses.length,2); assert.deepEqual(uses[0],[uses[1][1],uses[1][0]]); }
    assert.equal(solid.vertices.length-edges.size+solid.faces.length,0,'Euler characteristic for a solid with one through-hole');
    const visited=new Set([0]);let changed=true;while(changed){changed=false;for(const uses of edges.values()){const[a,b]=uses[0];if(visited.has(a)!==visited.has(b)){visited.add(a);visited.add(b);changed=true;}}}assert.equal(visited.size,solid.vertices.length);
    close(CAD.signedVolume(solid.triangles),model.volume);
    const triangleEdges=new Map();for(const triangle of model.triangles) for(let i=0;i<3;i++){const a=triangle[i].map(v=>v.toFixed(6)).join(','),b=triangle[(i+1)%3].map(v=>v.toFixed(6)).join(',');const key=[a,b].sort().join('|');triangleEdges.set(key,(triangleEdges.get(key)||0)+1);}for(const count of triangleEdges.values())assert.equal(count,2,'STL edge is manifold');
  });
  test(design.id+': STEP entity references, ASCII STL and deterministic manifest hashes',()=>{
    const model=CAD.generate(design.id),manifest=json(bake+'exports/manifest.json');
    const entry=manifest.models.find(m=>m.id===design.id);assert.ok(entry);assert.equal(entry.solidCount,1);
    for(const [extension,serialize] of [['step',CAD.toSTEP],['stl',CAD.toSTL]]){
      const contents=read(bake+'exports/'+design.id+'.'+extension);assert.equal(contents,serialize(model));assert.equal(Buffer.byteLength(contents),entry.files[extension].bytes);assert.equal(createHash('sha256').update(contents).digest('hex'),entry.files[extension].sha256);
      if(extension==='step'){
        assert.ok(contents.startsWith('ISO-10303-21;\nHEADER;'));assert.ok(contents.endsWith('END-ISO-10303-21;\n'));
        for(const token of ['HEADER;','DATA;','MANIFOLD_SOLID_BREP','CLOSED_SHELL','ADVANCED_FACE','FACE_OUTER_BOUND','EDGE_LOOP','ORIENTED_EDGE','EDGE_CURVE','VERTEX_POINT','CARTESIAN_POINT','PLANE','ENDSEC;'])assert.ok(contents.includes(token),token);
        const entities=[...contents.matchAll(/^#(\d+)=(.*);$/gm)],ids=new Set(entities.map(m=>m[1]));assert.equal(ids.size,entities.length);
        for(const[,id,value]of entities)for(const match of value.matchAll(/#(\d+)/g))assert.ok(ids.has(match[1]),'resolved STEP reference '+id);
        assert.equal(entities.filter(e=>e[2].startsWith('MANIFOLD_SOLID_BREP')).length,1);assert.match(contents,/SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
      }else{
        assert.ok(contents.startsWith('solid '+model.id+'\n'));assert.ok(contents.endsWith('endsolid '+model.id+'\n'));assert.equal((contents.match(/facet normal/g)||[]).length,model.triangles.length);assert.equal((contents.match(/      vertex /g)||[]).length,model.triangles.length*3);assert.ok(!/NaN|Infinity/.test(contents));
        const parsed=[...contents.matchAll(/      vertex (\S+) (\S+) (\S+)/g)].map(m=>m.slice(1).map(Number)),expected=model.triangles.flat();for(let i=0;i<parsed.length;i++)for(let j=0;j<3;j++)close(parsed[i][j],expected[i][j]);
      }
    }
  });
}

test('CAD rejects unknown models and export directory contains exactly all deliverables',()=>{
  assert.throws(()=>CAD.generate('unknown'),/Unknown design/);
  const names=readdirSync(new URL('../'+bake+'exports/',import.meta.url));
  assert.deepEqual(names.sort(),['manifest.json',...CAD.DESIGNS.flatMap(d=>[d.id+'.step',d.id+'.stl',d.id+'.png'])].sort());
  for(const design of CAD.DESIGNS){
    const bytes=readFileSync(new URL('../'+bake+'exports/'+design.id+'.png',import.meta.url));
    assert.equal(bytes.subarray(1,4).toString('latin1'),'PNG');
    assert.equal(bytes.subarray(12,16).toString('latin1'),'IHDR');
  }
});

test('workbench renders and responds to selection, orbit, zoom, reset and download handlers',()=>{
  const elements=new Map();let draws=0,clicked=0,created=0,revoked=0;
  function element(){return {value:'',children:[],events:{},className:'',textContent:'',append(item){this.children.push(item);if(!this.value&&item.value)this.value=item.value;},replaceChildren(){this.children=[];},addEventListener(event,fn){this.events[event]=fn;},click(){clicked++;},remove(){},setPointerCapture(){},getBoundingClientRect(){return {width:600,height:480};},getContext(){return new Proxy({},{get:(_,key)=>key==='fill'?()=>draws++:()=>{}});}};}
  for(const id of ['preview','design','reset','model-name','dimensions','status','checks','step','stl'])elements.set(id,element());
  const document={getElementById:id=>elements.get(id),createElement:element,body:element()};
  const window={devicePixelRatio:1,addEventListener(){}};
  const URL={createObjectURL(){created++;return 'blob:test';},revokeObjectURL(){revoked++;}};
  const source=read(bake+'app.js').replace("import CAD from './cad-engine.js';",'');
  vm.runInNewContext(source,{CAD,document,window,URL,Blob,setTimeout:fn=>fn()});
  assert.equal(elements.get('design').children.length,4);assert.ok(draws>0);
  const preview=elements.get('preview');for(const event of ['pointerdown','pointermove','pointerup','wheel','keydown'])assert.equal(typeof preview.events[event],'function');
  preview.events.pointerdown({clientX:10,clientY:10,pointerId:1});preview.events.pointermove({clientX:30,clientY:40});preview.events.pointerup({});preview.events.wheel({deltaY:30,preventDefault(){}});preview.events.keydown({key:'ArrowRight',preventDefault(){}});
  elements.get('reset').events.click();elements.get('design').value=CAD.DESIGNS[3].id;elements.get('design').events.change();assert.equal(elements.get('model-name').textContent,CAD.DESIGNS[3].name);
  elements.get('step').events.click();elements.get('stl').events.click();assert.equal(clicked,2);assert.equal(created,2);assert.equal(revoked,2);
  const html=read(bake+'index.html');assert.match(html,/<script type="module" src="app.js"><\/script>/);assert.match(html,/aria-live="polite"/);
});
