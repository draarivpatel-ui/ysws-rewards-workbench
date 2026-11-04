/* Canvas-based CPU triangle renderer: rotate, zoom, depth-sort, shaded mesh. */
'use strict';
import CAD from './cad-engine.js';
(() => {
  const canvas=document.getElementById('preview'), ctx=canvas.getContext('2d');
  const select=document.getElementById('design');
  let model, yaw=-0.55, pitch=-0.75, zoom=1, dragging=null;
  for (const d of CAD.DESIGNS) { const option=document.createElement('option'); option.value=d.id; option.textContent=d.name; select.append(option); }
  function transform(p) {
    const center=model.bounds.min.map((v,i)=>(v+model.bounds.max[i])/2);
    const [x,y,z]=p.map((v,i)=>v-center[i]);
    const a=x*Math.cos(yaw)-y*Math.sin(yaw), b=x*Math.sin(yaw)+y*Math.cos(yaw);
    return [a,b*Math.cos(pitch)-z*Math.sin(pitch),b*Math.sin(pitch)+z*Math.cos(pitch)];
  }
  function render() {
    if (!model||!ctx) return;
    const box=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.round(box.width*dpr)); canvas.height=Math.max(1,Math.round(box.height*dpr)); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#111b26'; ctx.fillRect(0,0,box.width,box.height);
    const scale=Math.min(box.width,box.height)/Math.max(...model.dimensions)*0.72*zoom;
    const triangles=model.triangles.map(t=>t.map(transform));
    triangles.sort((a,b)=>a.reduce((s,p)=>s+p[2],0)-b.reduce((s,p)=>s+p[2],0));
    for (const t of triangles) {
      const u=t[1].map((v,i)=>v-t[0][i]),v=t[2].map((v,i)=>v-t[0][i]);
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const light=0.4+0.6*Math.abs((n[0]*0.3+n[1]*-0.5+n[2]*0.8)/(Math.hypot(...n)||1));
      ctx.beginPath(); t.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](box.width/2+p[0]*scale,box.height/2-p[1]*scale)); ctx.closePath();
      ctx.fillStyle=`hsl(168 58% ${Math.min(75,25+light*42)}%)`; ctx.fill(); ctx.strokeStyle='rgba(9,30,35,0.16)'; ctx.lineWidth=0.5; ctx.stroke();
    }
  }
  function choose() {
    model=CAD.generate(select.value); document.getElementById('model-name').textContent=model.name;
    document.getElementById('dimensions').textContent=model.dimensions.map(n=>n.toFixed(2)).join(' × ')+' mm';
    const status=document.getElementById('status'); status.textContent=model.validation.pass?'All geometry rules pass':'Rule check failed'; status.className=model.validation.pass?'pass':'fail';
    const list=document.getElementById('checks'); list.replaceChildren();
    for (const check of model.validation.checks) { const li=document.createElement('li'); li.textContent=(check.pass?'✓ ':'✕ ')+check.rule; li.className=check.pass?'pass':'fail'; list.append(li); }
    render();
  }
  function download(extension) { const contents=extension==='step'?CAD.toSTEP(model):CAD.toSTL(model); const url=URL.createObjectURL(new Blob([contents],{type:'text/plain;charset=utf-8'})); const a=document.createElement('a'); a.href=url; a.download=model.id+'.'+extension; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  select.addEventListener('change',choose);
  document.getElementById('reset').addEventListener('click',()=>{yaw=-0.55;pitch=-0.75;zoom=1;render();});
  for (const ext of ['step','stl']) document.getElementById(ext).addEventListener('click',()=>download(ext));
  canvas.addEventListener('pointerdown',e=>{dragging=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;yaw+=(e.clientX-dragging[0])*0.01;pitch+=(e.clientY-dragging[1])*0.01;dragging=[e.clientX,e.clientY];render();});
  for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,()=>dragging=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(0.4,Math.min(3,zoom*Math.exp(-e.deltaY*0.001)));render();},{passive:false});
  canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=0.1;if(e.key==='ArrowRight')yaw+=0.1;if(e.key==='ArrowUp')pitch-=0.1;if(e.key==='ArrowDown')pitch+=0.1;if(e.key==='+'||e.key==='=')zoom=Math.min(3,zoom+0.1);if(e.key==='-')zoom=Math.max(0.4,zoom-0.1);render();});
  window.addEventListener('resize',render); choose();
})();
