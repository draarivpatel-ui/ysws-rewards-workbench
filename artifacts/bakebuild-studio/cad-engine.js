/* Zero-dependency, millimetre-based faceted CAD: one connected manifold solid
 * per model, shared topological edges, planar faces, and no internal mesh faces.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const DESIGNS = [
    { id: 'orpheus_circuit_crest_cutter', name: 'Orpheus Circuit Crest', type: 'cutter', radius: 28, sectors: 64 },
    { id: 'hex_gear_logic_gate_cutter', name: 'Hex Gear Logic Gate', type: 'cutter', radius: 29, sectors: 72 },
    { id: 'stepcheck_sigma_badge_cutter', name: 'Stepcheck Sigma Badge', type: 'cutter', radius: 27, sectors: 64 },
    { id: 'orpheus_fusering_keyring', name: 'Orpheus FuseRing', type: 'keyring', radius: 26, sectors: 64 }
  ];
  const RULES = Object.freeze({ lip: 0.8, wall: 2, height: 12.7, rimWidth: 5, rimHeight: 2, holeDiameter: 6, keyringHeight: 4 });
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => { const m = Math.hypot(...a); return a.map(v => v / m); };
  const number = v => { const s = (Math.abs(v) < 1e-9 ? 0 : v).toFixed(6).replace(/0+$/, ''); return s.includes('.') ? s : s + '.'; };
  function profile(design) {
    return Array.from({ length: design.sectors }, (_, i) => {
      const a = TAU * i / design.sectors;
      let r = design.radius;
      if (design.id.includes('circuit')) r += 3*Math.cos(3*a) + 1.3*Math.cos(8*a);
      if (design.id.includes('hex_gear')) r += 1.5*Math.cos(6*a) + 0.25*Math.cos(12*a);
      if (design.id.includes('sigma')) r += 3*Math.cos(4*a) + 1.5*Math.sin(3*a);
      if (design.type === 'keyring') r += 2.8*Math.cos(3*a) + Math.cos(7*a);
      return [r*Math.cos(a), r*Math.sin(a)];
    });
  }
  // True parallel contour offset: intersections of adjacent translated lines.
  // Unlike radial scaling this gives a specified perpendicular wall thickness.
  function offset(points, distance) {
    return points.map((p, i) => {
      const prev = points[(i + points.length - 1) % points.length];
      const next = points[(i + 1) % points.length];
      const a = unit([p[0]-prev[0], p[1]-prev[1], 0]);
      const b = unit([next[0]-p[0], next[1]-p[1], 0]);
      const n1 = [a[1], -a[0]], n2 = [b[1], -b[0]];
      const det = n1[0]*n2[1]-n1[1]*n2[0];
      if (Math.abs(det) < 1e-10) return [p[0]+distance*n1[0], p[1]+distance*n1[1]];
      const c1 = p[0]*n1[0]+p[1]*n1[1]+distance;
      const c2 = p[0]*n2[0]+p[1]*n2[1]+distance;
      return [(c1*n2[1]-n1[1]*c2)/det, (n1[0]*c2-c1*n2[0])/det];
    });
  }
  function signedVolume(triangles) {
    return triangles.reduce((s, t) => s + t[0].reduce((v, c, i) => v+c*cross(t[1],t[2])[i], 0)/6, 0);
  }
  function shell(design, contour) {
    const vertices = [], faces = [], n = contour.length;
    function ring(points, z) { return points.map(p => { vertices.push([...p,z]); return vertices.length-1; }); }
    function join(a,b,reverse=false) {
      for(let i=0;i<n;i++) { const j=(i+1)%n, face=[a[i],a[j],b[j],b[i]]; faces.push(reverse?face.reverse():face); }
    }
    if(design.type==='cutter') {
      const levels=[0,1.5,RULES.height-RULES.rimHeight,RULES.height];
      const inner=levels.map(z=>ring(contour,z));
      const lip=cutterRing(RULES.lip,levels[0],levels[1]);
      const wall=cutterRing(RULES.wall,levels[1],levels[2]);
      const rim=cutterRing(RULES.rimWidth,levels[2],levels[3]);
      function cutterRing(width,bottom,top) { const p=offset(contour,width); return [ring(p,bottom),ring(p,top)]; }
      for(let i=0;i<3;i++) join(inner[i],inner[i+1],true);
      for(const band of [lip,wall,rim]) join(band[0],band[1]);
      join(lip[0],inner[0],true); // bottom annulus, outward -Z
      join(wall[0],lip[1],true); // underside of wall expansion
      join(rim[0],wall[1],true); // underside of handle expansion
      join(rim[1],inner[3]); // top annulus, outward +Z
    } else {
      const r=RULES.holeDiameter/2/Math.cos(Math.PI/n);
      const hole=contour.map((_,i)=>[r*Math.cos(TAU*i/n),r*Math.sin(TAU*i/n)]);
      const inner=[ring(hole,0),ring(hole,RULES.keyringHeight)];
      const outer=[ring(contour,0),ring(contour,RULES.keyringHeight)];
      join(inner[0],inner[1],true); join(outer[0],outer[1]);
      join(outer[0],inner[0],true); join(outer[1],inner[1]);
    }
    const triangles = [];
    for (const face of faces) for (let i=1;i<face.length-1;i++) triangles.push([vertices[face[0]],vertices[face[i]],vertices[face[i+1]]]);
    return { vertices, faces, triangles };
  }
  function generate(id) {
    const design = DESIGNS.find(d => d.id === id);
    if (!design) throw new Error('Unknown design: ' + id);
    const outerProfile = profile(design), solids = [shell(design,outerProfile)], sections = [];
    function band(inner, outer, bottom, top, label, thickness) {
      sections.push({ label, bottom, top, thickness });
    }
    if (design.type === 'cutter') {
      band(outerProfile,offset(outerProfile,RULES.lip),0,1.5,'cutting lip',RULES.lip);
      band(outerProfile,offset(outerProfile,RULES.wall),1.5,RULES.height-RULES.rimHeight,'main wall',RULES.wall);
      band(outerProfile,offset(outerProfile,RULES.rimWidth),RULES.height-RULES.rimHeight,RULES.height,'top handle rim',RULES.rimWidth);
    } else {
      // Polygon circumscribes a 6 mm circle; the clear inscribed diameter is 6 mm.
      const r = RULES.holeDiameter/2/Math.cos(Math.PI/design.sectors);
      const hole = outerProfile.map((_,i) => [r*Math.cos(TAU*i/design.sectors),r*Math.sin(TAU*i/design.sectors)]);
      band(hole,outerProfile,0,RULES.keyringHeight,'FuseRing body',null);
    }
    const triangles = solids.flatMap(s => s.triangles);
    const points = solids.flatMap(s => s.vertices);
    const min = [0,1,2].map(i => Math.min(...points.map(p => p[i])));
    const max = [0,1,2].map(i => Math.max(...points.map(p => p[i])));
    const model = { ...design, units:'mm', solids, triangles, sections, bounds:{min,max}, dimensions:max.map((v,i)=>v-min[i]), holeDiameter:design.type==='keyring'?RULES.holeDiameter:null, volume:signedVolume(triangles) };
    model.validation = validate(model);
    return model;
  }
  function validate(model) {
    const limit = model.type==='cutter' ? [100,100,100] : [80,80,6];
    const checks = [{ rule:'Maximum envelope', pass:model.dimensions.every((v,i)=>v<=limit[i]+1e-7), actual:model.dimensions, limit }, { rule:'Positive solid volume', pass:Number.isFinite(model.volume)&&model.volume>0, actual:model.volume }];
    if (model.type==='cutter') {
      for (const [label,target] of [['cutting lip',0.8],['main wall',2],['top handle rim',5]]) {
        const section = model.sections.find(s=>s.label===label);
        checks.push({rule:label+' thickness',pass:!!section&&Math.abs(section.thickness-target)<1e-7,actual:section?.thickness,target});
      }
      const rim = model.sections.find(s=>s.label==='top handle rim');
      checks.push({rule:'Cutter height',pass:Math.abs(model.dimensions[2]-12.7)<1e-7,actual:model.dimensions[2],target:12.7});
      checks.push({rule:'Handle rim height',pass:!!rim&&Math.abs(rim.top-rim.bottom-2)<1e-7,actual:rim?rim.top-rim.bottom:null,target:2});
    } else {
      checks.push({rule:'Flat bottom at z = 0',pass:Math.abs(model.bounds.min[2])<1e-7,actual:model.bounds.min[2],target:0});
      checks.push({rule:'Carabiner clear hole >= 5 mm',pass:model.holeDiameter>=5,actual:model.holeDiameter,target:5});
    }
    return { pass:checks.every(c=>c.pass), checks };
  }
  function toSTL(model) {
    const lines = ['solid '+model.id];
    for (const t of model.triangles) {
      const normal = unit(cross(sub(t[1],t[0]),sub(t[2],t[0])));
      lines.push('  facet normal '+normal.map(number).join(' '),'    outer loop');
      for (const p of t) lines.push('      vertex '+p.map(number).join(' '));
      lines.push('    endloop','  endfacet');
    }
    return lines.concat('endsolid '+model.id,'').join('\n');
  }
  function toSTEP(model) {
    const data = []; const add = s => { data.push('#'+(data.length+1)+'='+s+';'); return '#'+data.length; };
    const tuple = p => '('+p.map(number).join(',')+')';
    const application = add("APPLICATION_CONTEXT('automotive design')");
    add("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,"+application+')');
    const productContext = add("PRODUCT_CONTEXT('',"+application+",'mechanical')");
    const product = add("PRODUCT('"+model.id+"','"+model.name+"','',("+productContext+'))');
    const formation = add("PRODUCT_DEFINITION_FORMATION('1','',"+product+')');
    const definitionContext = add("PRODUCT_DEFINITION_CONTEXT('part definition',"+application+",'design')");
    const definition = add("PRODUCT_DEFINITION('design','',"+formation+','+definitionContext+')');
    const shape = add("PRODUCT_DEFINITION_SHAPE('','',"+definition+')');
    const mm = add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))');
    const radian = add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))');
    const steradian = add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
    const tolerance = add("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.000001),"+mm+",'distance_accuracy_value','')");
    const context = add("(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT(("+tolerance+')) GLOBAL_UNIT_ASSIGNED_CONTEXT(('+[mm,radian,steradian].join(',')+")) REPRESENTATION_CONTEXT('',''))");
    const breps = [];
    for (const solid of model.solids) {
      const cp = solid.vertices.map(p=>add("CARTESIAN_POINT('',"+tuple(p)+')'));
      const vp = cp.map(p=>add("VERTEX_POINT('',"+p+')'));
      const edges = new Map(), faces = [];
      for (const face of solid.faces) {
        const oriented = [];
        for (let i=0;i<face.length;i++) {
          const a=face[i],b=face[(i+1)%face.length],key=Math.min(a,b)+':'+Math.max(a,b);
          if (!edges.has(key)) {
            const direction=add("DIRECTION('',"+tuple(unit(sub(solid.vertices[b],solid.vertices[a])))+')');
            const vector=add("VECTOR('',"+direction+',1.)');
            const line=add("LINE('',"+cp[a]+','+vector+')');
            edges.set(key,{a,b,ref:add("EDGE_CURVE('',"+vp[a]+','+vp[b]+','+line+',.T.)')});
          }
          const edge=edges.get(key);
          oriented.push(add("ORIENTED_EDGE('',*,*,"+edge.ref+','+(edge.a===a?'.T.':'.F.')+')'));
        }
        const loop=add("EDGE_LOOP('',("+oriented.join(',')+'))');
        const bound=add("FACE_OUTER_BOUND('',"+loop+',.T.)');
        const p=face.map(i=>solid.vertices[i]);
        const normal=add("DIRECTION('',"+tuple(unit(cross(sub(p[1],p[0]),sub(p[2],p[0]))))+')');
        const axis=add("DIRECTION('',"+tuple(unit(sub(p[1],p[0])))+')');
        const placement=add("AXIS2_PLACEMENT_3D('',"+cp[face[0]]+','+normal+','+axis+')');
        const plane=add("PLANE('',"+placement+')');
        faces.push(add("ADVANCED_FACE('',("+bound+'),'+plane+',.T.)'));
      }
      const shell=add("CLOSED_SHELL('',("+faces.join(',')+'))');
      breps.push(add("MANIFOLD_SOLID_BREP('"+model.id+"',"+shell+')'));
    }
    const representation=add("ADVANCED_BREP_SHAPE_REPRESENTATION('"+model.id+"',("+breps.join(',')+'),'+context+')');
    add('SHAPE_DEFINITION_REPRESENTATION('+shape+','+representation+')');
    return ['ISO-10303-21;','HEADER;',"FILE_DESCRIPTION(('Parametric faceted millimetre manifold solid'),'2;1');","FILE_NAME('"+model.id+".step','2026-11-04T00:00:00',('BakeBuild Studio'),('BakeBuild'),'BakeBuild CAD','BakeBuild CAD','');","FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",'ENDSEC;','DATA;',...data,'ENDSEC;','END-ISO-10303-21;',''].join('\n');
  }
  const api = { DESIGNS, RULES, generate, validate, toSTEP, toSTL, profile, offset, signedVolume };
  if (typeof module==='object'&&module.exports) module.exports=api;
  root.BakeBuildCAD=api;
})(typeof globalThis!=='undefined'?globalThis:this);
const CAD = globalThis.BakeBuildCAD;
export const { DESIGNS, RULES, generate, validate, toSTEP, toSTL, profile, offset, signedVolume } = CAD;
export default CAD;
