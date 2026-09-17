import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { Water } from './vendor/Water.js';

// Original procedural Jiangnan garden. Units are metres; +Z faces the entrance.
// Repeated masonry, roof tiles and leaves are instanced after construction.
const stage = document.querySelector('#garden-stage');
const host = document.querySelector('#garden-canvas');
const loading = document.querySelector('#garden-loading');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clock = { value: 0 };
let paused = reduced.matches;
let seed = 71427;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const between = (a,b) => a + rand()*(b-a);
const materials = {};
const mat = (name,color,roughness=.82) => materials[name] ||= new THREE.MeshStandardMaterial({color,roughness});
const stone = mat('stone','#b3b2a0'), pale = mat('pale','#d7d2bc'), plaster = mat('plaster','#f2efdf');
const wood = mat('wood','#604735'), darkwood = mat('darkwood','#403b2d'), tile = mat('tile','#414c49');
const tileEdge = mat('tileEdge','#68706a'), earth = mat('earth','#92917a'), moss = mat('moss','#72835b');
const green = mat('green','#748650'), lightGreen = mat('lightGreen','#9ba36a'), deepGreen = mat('deepGreen','#536e43');
const pink = mat('pink','#e4bbb7'), pinkLight = mat('pinkLight','#f2d3c5');
const amber = new THREE.MeshStandardMaterial({color:'#e8bd79',emissive:'#eaa64b',emissiveIntensity:.45,roughness:.7});
const windMaterials = [green,lightGreen,deepGreen,pink,pinkLight];
for (const material of windMaterials) {
  material.onBeforeCompile = shader => {
    shader.uniforms.gardenTime=clock;
    shader.vertexShader='uniform float gardenTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float windSeed = 0.0;
      #ifdef USE_INSTANCING
        windSeed = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z;
      #endif
      transformed.x += sin(gardenTime * 1.35 + windSeed + position.y * 2.0) * 0.024;
      transformed.z += cos(gardenTime * 0.9 + windSeed) * 0.012;`);
  };
  material.customProgramCacheKey=()=> 'garden-wind-v1';
}
const geo={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,8),sphere:new THREE.SphereGeometry(1,10,7),rock:new THREE.IcosahedronGeometry(1,1),leaf:new THREE.IcosahedronGeometry(1,0)};
let scene, renderer, camera, controls;
const staticRoot = new THREE.Group();
const animatedRoot = new THREE.Group();
function mesh(g,m,parent=staticRoot){const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(x,y,z,w,h,d,m,parent=staticRoot){const o=mesh(geo.box,m,parent);o.position.set(x,y,z);o.scale.set(w,h,d);return o;}
function ball(x,y,z,r,m,parent=staticRoot,shape=geo.sphere){const o=mesh(shape,m,parent);o.position.set(x,y,z);o.scale.setScalar(r);return o;}
function rod(a,b,r,m,parent=staticRoot){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);const o=mesh(geo.cylinder,m,parent);o.position.copy(av.add(bv).multiplyScalar(.5));o.scale.set(r,v.length(),r);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;}
function line(points,r,m,parent=staticRoot){for(let i=1;i<points.length;i++)rod(points[i-1],points[i],r,m,parent);}
// Sculpted meshes contain actual subtractive holes and eroded limestone strata.
const limestoneGeometry=await Promise.all(Array.from({length:6},async(_,i)=>{
  try{
    const response=await fetch(`/assets/models/limestone-${i}.bin`);if(!response.ok)throw new Error('Rock asset unavailable');
    const buffer=await response.arrayBuffer(),header=new DataView(buffer),n=header.getUint32(0,true),count=header.getUint32(4,true);let offset=8;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer,offset,n*3),3));offset+=n*12;
    g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(buffer,offset,n*3),3));offset+=n*12;
    g.setAttribute('color',new THREE.BufferAttribute(new Uint8Array(buffer,offset,n*3),3,true));offset+=n*3;
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer.slice(offset,offset+count*4)),1));g.computeBoundingSphere();return g;
  }catch(error){console.warn('Using local rock fallback',error);return geo.rock;}
}));
const dryLimestone=new THREE.MeshStandardMaterial({color:'#d2d0c5',vertexColors:true,roughness:.97});
const wetLimestone=new THREE.MeshStandardMaterial({color:'#68756c',vertexColors:true,roughness:.42});
const shoreGeometries=Array.from({length:4},(_,k)=>{
  const g=new THREE.IcosahedronGeometry(1,3),p=g.attributes.position,colors=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=.085*Math.sin(x*13+z*8+k)*Math.cos(y*11-z*7)+.038*Math.sin(y*27+x*9+k);
    const crease=.055*Math.abs(Math.sin((y+.12*Math.sin(x*5))*19+k));const r=1+n-crease;
    p.setXYZ(i,x*r,y*r,z*r);const c=.72+n*.8-crease*.9;colors.push(c*.99,c,c*.94);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
});
function rock(x,y,z,sx,sy,sz){
  const o=mesh(shoreGeometries[Math.floor(rand()*4)],dryLimestone);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rand()*.5,rand()*6,rand()*.2);return o;
}
function scholarRock(x,y,z,sx,sy,sz,variant=0,wet=false,turn=0){
  const o=mesh(limestoneGeometry[variant%6],wet?wetLimestone:dryLimestone);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(.035*Math.sin(x),turn,.06*Math.sin(z));return o;
}
function shapeExtrusion(points,depth,material,y){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.06,bevelThickness:.025});g.rotateX(-Math.PI/2);const o=mesh(g,material);o.position.y=y;return o;}
function plaque(text,x,y,z,w,parent=staticRoot){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#334339';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#c1ac76';ctx.lineWidth=6;ctx.strokeRect(8,8,496,112);ctx.font='62px "Songti SC", serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e9dbb3';ctx.fillText(text,256,68);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const p=mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshStandardMaterial({map:texture,roughness:1}),parent);p.position.set(x,y,z);return p;}

// Curved tiled gable roofs: individually raised barrel tiles and stone end caps.
function roof(cx,cy,cz,w,d,rise,parent=staticRoot){
  const half=d/2, nx=Math.round(w/.19), rows=12;
  const point=(x,t,side)=>[cx+x,cy+rise*Math.pow(1-t,1.65)+.36*Math.pow(t,7)+.26*Math.pow(Math.abs(x)/(w/2),7)*Math.pow(t,3),cz+side*t*half];
  for(const side of [-1,1]){
    const pos=[],inds=[];
    for(let i=0;i<=nx;i++)for(let j=0;j<=rows;j++)pos.push(...point(-w/2+i*w/nx,j/rows,side));
    for(let i=0;i<nx;i++)for(let j=0;j<rows;j++){const a=i*(rows+1)+j,b=a+rows+1;inds.push(a,b,a+1,b,b+1,a+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(inds);g.computeVertexNormals();const mm=tile.clone();mm.side=THREE.DoubleSide;mesh(g,mm,parent);
    for(let i=0;i<=nx;i++){const x=-w/2+i*w/nx;for(let j=0;j<rows;j++){const a=point(x,j/rows,side),b=point(x,(j+1)/rows,side);a[1]+=.035;b[1]+=.035;rod(a,b,.042,i%5===0?tileEdge:tile,parent);}const p=point(x,1,side);ball(p[0],p[1],p[2],.064,tileEdge,parent);}
    for(let j=1;j<rows;j++){const t=j/rows;line(Array.from({length:17},(_,i)=>point(-w/2+i*w/16,t,side)),.014,tileEdge,parent);}
    for(const x of [-w/2,w/2])line(Array.from({length:17},(_,i)=>point(x,i/16,side)),.075,tileEdge,parent);
  }
  // Fascia follows the exact tiled surface; gables close the exposed roof ends.
  for(const side of [-1,1]){
    const edge=Array.from({length:33},(_,i)=>{const p=point(-w/2+i*w/32,1,side);p[1]-=.075;return p;});
    line(edge,.085,darkwood,parent);
  }
  for(const end of [-1,1]){
    const x=end*(w/2-.48),positions=[],indices=[];
    for(let i=0;i<=32;i++){
      const z=-d/2+i*d/32,t=Math.abs(z)/(d/2),q=point(x,t,z<0?-1:1);
      positions.push(q[0],cy-.18,q[2],q[0],q[1]-.045,q[2]);
      if(i<32){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    const m=plaster.clone();m.side=THREE.DoubleSide;mesh(g,m,parent);
  }
  rod([cx-w/2-.06,cy+rise+.05,cz],[cx+w/2+.06,cy+rise+.05,cz],.105,tileEdge,parent);
  for(const s of [-1,1]){line([[cx+s*w/2,cy+rise,cz],[cx+s*(w/2+.18),cy+rise+.19,cz],[cx+s*(w/2+.22),cy+rise+.38,cz]],.075,tileEdge,parent);}
}
function lattice(x,y,z,w,h,parent=staticRoot){box(x,y,z,w,h,.065,darkwood,parent);box(x,y,z+.043,w-.09,h-.09,.026,amber,parent);for(let i=0;i<=4;i++)box(x-w/2+i*w/4,y,z+.08,.035,h,.04,wood,parent);for(let j=0;j<=6;j++)box(x,y-h/2+j*h/6,z+.084,w,.028,.04,wood,parent);}
function lantern(x,y,z,parent=staticRoot){rod([x,y+.5,z],[x,y+.14,z],.02,darkwood,parent);const o=ball(x,y,z,.18,mat('lantern','#b66746'),parent);o.scale.set(.15,.24,.15);for(let a=0;a<8;a++){const th=a*Math.PI/4;rod([x+Math.cos(th)*.13,y-.18,z+Math.sin(th)*.13],[x+Math.cos(th)*.13,y+.18,z+Math.sin(th)*.13],.013,wood,parent);}box(x,y+.23,z,.22,.04,.22,darkwood,parent);rod([x,y-.2,z],[x,y-.49,z],.023,mat('tassel','#b49150'),parent);}
function building(cx,cz,w=6,d=3.3,height=3.2){
  box(cx,.33,cz,w+.6,.35,d+.8,stone);box(cx,.56,cz,w+.35,.13,d+.65,pale);
  const wallBottom=.64,wallTop=height+.35,wallMid=(wallBottom+wallTop)/2;
  box(cx,wallMid,cz-d/2+.1,w,wallTop-wallBottom,.18,plaster);box(cx-w/2+.09,wallMid,cz,.18,wallTop-wallBottom,d,plaster);box(cx+w/2-.09,wallMid,cz,.18,wallTop-wallBottom,d,plaster);
  box(cx,.68,cz,w,.09,d,wood);
  const front=cz+d/2;
  for(let x=-w/2;x<=w/2+.1;x+=w/4){rod([cx+x,.65,front],[cx+x,height+.35,front],.095,wood);box(cx+x,.64,front,.27,.2,.27,stone);}
  box(cx,height+.16,front,w,.18,.2,darkwood);
  for(const side of [-1,1]){lattice(cx+side*w*.34,2.03,front,w*.23,1.78);box(cx+side*w*.34,.99,front,w*.23,.53,.1,wood);}
  // Recessed reading room with open doors, bookcase, scrolls and a writing desk.
  for(const side of [-1,1]){const g=new THREE.Group();g.position.set(cx+side*.85,0,front);g.rotation.y=side*.65;staticRoot.add(g);lattice(0,2.01,0,.54,2.5,g);}
  box(cx,1.29,cz+.3,1.8,.12,.7,wood);for(const x of [-.72,.72])for(const z of [-.23,.23])box(cx+x,.96,cz+.3+z,.07,.62,.07,darkwood);
  box(cx-.14,1.36,cz+.3,.65,.015,.37,plaster);rod([cx+.41,1.4,cz+.3],[cx+.41,1.67,cz+.3],.055,darkwood);
  box(cx,2.0,cz-d/2+.28,2.4,2.35,.22,darkwood);
  for(let y=1.05;y<3.05;y+=.48){box(cx,y,cz-d/2+.47,2.4,.045,.48,wood);for(let i=0;i<16;i++){const b=box(cx-1.05+i*.14,y+.18,cz-d/2+.49,.09,between(.25,.36),.28,[pale,wood,mat('book','#6c8178'),mat('bookRed','#987468')][Math.floor(rand()*4)]);b.rotation.z=between(-.09,.09);}}
  for(const s of [-1,1]){box(cx+s*1.8,2.05,cz-d/2+.22,.35,1.35,.018,pale);rod([cx+s*1.8-.2,1.38,cz-d/2+.24],[cx+s*1.8+.2,1.38,cz-d/2+.24],.023,wood);}
  for(let i=0;i<4;i++)box(cx,.14+i*.12,front+1.0-i*.23,2.3,.12,.3,pale);
  roof(cx,height+.25,cz,w+1.15,d+1.15,1.42);
  plaque('听 雨 书 房',cx,height-.2,front+.12,1.65);
  lantern(cx-w*.36,height-.48,front+.45);lantern(cx+w*.36,height-.48,front+.45);
  // Exposed rafters under the eaves.
  for(let i=0;i<24;i++){const x=cx-w/2+i*w/23;rod([x,height,cz-1.2],[x,height,front+.35],.04,wood);}
}
function pavilion(x,z){
  const n=8,rad=1.7;const cylinder=new THREE.CylinderGeometry(1,1,1,n);
  const base=mesh(cylinder,pale);base.position.set(x,.36,z);base.scale.set(2.12,.45,2.12);
  const floor=mesh(cylinder,wood);floor.position.set(x,.61,z);floor.scale.set(1.85,.08,1.85);
  for(let i=0;i<n;i++){const a=i*Math.PI*2/n+Math.PI/8,px=x+Math.cos(a)*rad,pz=z+Math.sin(a)*rad;rod([px,.65,pz],[px,3.24,pz],.09,wood);ball(px,.7,pz,.15,stone);
    const b=(i+1)*Math.PI*2/n+Math.PI/8,qx=x+Math.cos(b)*rad,qz=z+Math.sin(b)*rad;
    rod([px,3.05,pz],[qx,3.05,qz],.10,wood);rod([px,2.74,pz],[qx,2.74,qz],.04,wood);
    for(let j=0;j<6;j++){const f=j/6;rod([px+(qx-px)*f,2.75,pz+(qz-pz)*f],[px+(qx-px)*(f+.08),3.03,pz+(qz-pz)*(f+.08)],.025,wood);}
    if(i!==1&&i!==2){rod([px,1.22,pz],[qx,1.22,qz],.06,wood);rod([px,.83,pz],[qx,.83,qz],.04,wood);for(let j=1;j<5;j++){let f=j/5;rod([px+(qx-px)*f,.85,pz+(qz-pz)*f],[px+(qx-px)*f,1.23,pz+(qz-pz)*f],.025,wood);}}
    lantern(px,2.65,pz);
  }
  const roofPoint=(a,t)=>{const r=.06+t*2.45;return [x+Math.cos(a)*r,3.05+1.72*Math.pow(1-t,1.7)+.43*Math.pow(t,8),z+Math.sin(a)*r];};
  for(let side=0;side<8;side++){
    const a0=side*Math.PI/4+Math.PI/8, a1=a0+Math.PI/4;
    const ps=[],indices=[];for(let i=0;i<=8;i++)for(let j=0;j<=12;j++){const t=j/12,p0=roofPoint(a0,t),p1=roofPoint(a1,t),f=i/8;ps.push(p0[0]*(1-f)+p1[0]*f,p0[1]-.13*Math.sin(f*Math.PI)*t,p0[2]*(1-f)+p1[2]*f);}
    for(let i=0;i<8;i++)for(let j=0;j<12;j++){const a=i*13+j,b=a+13;indices.push(a,a+1,b,b,a+1,b+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setIndex(indices);g.computeVertexNormals();const m=tile.clone();m.side=THREE.DoubleSide;mesh(g,m);
    for(let i=0;i<=8;i++)for(let j=0;j<12;j++){const p=ps.slice((i*13+j)*3,(i*13+j)*3+3),q=ps.slice((i*13+j+1)*3,(i*13+j+1)*3+3);p[1]+=.035;q[1]+=.035;rod(p,q,i===0?.075:.035,i===0?tileEdge:tile);}
    const tip=roofPoint(a0,1);line([tip,[tip[0]+Math.cos(a0)*.15,tip[1]+.15,tip[2]+Math.sin(a0)*.15],[tip[0]+Math.cos(a0)*.23,tip[1]+.38,tip[2]+Math.sin(a0)*.23]],.06,tileEdge);
  }
  rod([x,4.75,z],[x,5.17,z],.075,tileEdge);ball(x,4.96,z,.15,tileEdge);ball(x,5.2,z,.085,tileEdge);
  const table=mesh(new THREE.CylinderGeometry(.52,.52,.1,16),stone);table.position.set(x,1.28,z);rod([x,.66,z],[x,1.28,z],.14,stone);for(let a=0;a<3;a++){const t=a*Math.PI*2/3;rod([x+Math.cos(t)*.85,.65,z+Math.sin(t)*.85],[x+Math.cos(t)*.85,1.01,z+Math.sin(t)*.85],.2,stone);}
}
function bridge(cx,cz,length=5,width=1.55){
  // One watertight arch, with the deck and rails derived from the same profile.
  const top=t=>.48+.92*Math.sin(Math.PI*t);
  const profile=(t0,t1,upper,lower,depth,z,material)=>{
    const shape=new THREE.Shape(),samples=Math.max(2,Math.ceil((t1-t0)*64));
    for(let i=0;i<=samples;i++){const t=t0+(t1-t0)*i/samples,x=cx+(t-.5)*length,y=top(t)+upper;i?shape.lineTo(x,y):shape.moveTo(x,y);}
    for(let i=samples;i>=0;i--){const t=t0+(t1-t0)*i/samples;shape.lineTo(cx+(t-.5)*length,top(t)+lower);}
    shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1});
    const o=mesh(g,material);o.position.z=z;return o;
  };
  profile(0,1,0,-.34,width,cz-width/2,stone);
  profile(0,1,.09,.002,width+.08,cz-width/2-.04,pale);
  // Fine transverse joints, rather than independently tilted overlapping slabs.
  for(let i=1;i<28;i++){const t=i/28;box(cx+(t-.5)*length,top(t)+.092,cz,.014,.006,width-.04,tileEdge);}
  for(const side of [-1,1]){
    const z=cz+side*(width/2+.035);
    for(let i=0;i<22;i++)profile(i/22+.0007,(i+1)/22-.0007,.01,-.34,.055,side<0?z-.025:z-.03,i%3?stone:pale);
    // Continuous square stone handrails follow the crown without gaps.
    profile(0,1,.88,.80,.12,z-.06,pale);
    profile(0,1,.38,.32,.085,z-.0425,pale);
    for(let i=0;i<=8;i++){
      const t=i/8,x=cx+(t-.5)*length,y=top(t);
      box(x,y+.5,z,.13,.87,.13,pale);box(x,y+.115,z,.22,.15,.22,stone);ball(x,y+.99,z,.105,pale);
      if(i<8)for(let j=1;j<=3;j++){
        const f=(i+j/4)/8;
        box(cx+(f-.5)*length,top(f)+.59,z,.043,.43,.05,pale);
      }
    }
  }
  // The arch springs from foundations; short landings meet the garden paths.
  for(const side of [-1,1]){
    const x=cx+side*length/2;
    box(x,-.02,cz,.58,.72,width+.45,stone);
    box(x+side*.24,.405,cz,.78,.15,width+.32,pale);
    for(let i=0;i<3;i++)box(x+side*(.57+i*.25),.38-i*.03,cz,.27,.12,width+.3,pale);
    for(const edge of [-1,1])box(x+side*.25,.31,cz+edge*(width/2+.22),.85,.5,.25,stone);
  }
  // Raised, stone-edged approach paths connect both bridge ends to dry land.
  const approach=points=>{
    for(let k=1;k<points.length;k++){
      const [ax,az]=points[k-1],[bx,bz]=points[k],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),steps=Math.ceil(len/.32),yaw=Math.atan2(dx,dz);
      for(let i=0;i<=steps;i++){
        const t=i/steps,x=ax+dx*t,z=az+dz*t;
        const base=box(x,.065,z,1.95,.46,.40,earth);base.rotation.y=yaw;
        const paving=box(x,.315,z,1.64,.08,.35,pale);paving.rotation.y=yaw;
        for(const side of [-1,1]){
          const edge=box(x+side*Math.cos(yaw)*.91,.24,z-side*Math.sin(yaw)*.91,.17,.34,.37,stone);edge.rotation.y=yaw;
        }
      }
    }
  };
  approach([[cx-length/2-.5,cz],[-6.4,cz],[-8.7,3.2]]);
  approach([[cx+length/2+.5,cz],[4.3,4.5],[8.1,4.8]]);
}
function wall(cx,cz,length,rotation=0,h=1.7){
  const g=new THREE.Group();staticRoot.add(g);g.position.set(cx,0,cz);g.rotation.y=rotation;
  box(0,h/2+.2,0,length,h,.22,plaster,g);box(0,.25,0,length,.23,.34,stone,g);
  // A shallow continuous coping, without upturned roof corners at each wall joint.
  box(0,h+.2,0,length+.04,.12,.36,stone,g);
  for(const side of [-1,1]){
    const cap=box(0,h+.29,side*.135,length+.08,.075,.30,tile,g);cap.rotation.x=side*.24;
    rod([-length/2-.04,h+.26,side*.28],[length/2+.04,h+.26,side*.28],.035,tileEdge,g);
    for(let x=-length/2;x<=length/2;x+=.19)rod([x,h+.34,0],[x,h+.27,side*.28],.032,tileEdge,g);
  }
  rod([-length/2-.04,h+.35,0],[length/2+.04,h+.35,0],.045,tileEdge,g);
}
function moonGate(x,z){
  const shape=new THREE.Shape();shape.moveTo(-1.55,0);shape.lineTo(1.55,0);shape.lineTo(1.55,2.9);shape.lineTo(-1.55,2.9);shape.closePath();const hole=new THREE.Path();hole.absarc(0,1.28,1.14,0,Math.PI*2,true);shape.holes.push(hole);const g=new THREE.ExtrudeGeometry(shape,{depth:.3,bevelEnabled:false,curveSegments:40});const o=mesh(g,plaster);o.position.set(x,.17,z);
  const ring=new THREE.TorusGeometry(1.15,.065,8,64);const r=mesh(ring,tileEdge);r.position.set(x,1.45,z+.33);roof(x,3.04,z+.16,3.7,1.05,.5);plaque('沐 山 小 院',x,2.79,z+.34,1.05);
  for(let i=0;i<3;i++)box(x,.09+i*.05,z+1.0-i*.3,2.4,.09,.45,stone);
}
// Curved individual leaves, shared across thousands of instances.
function leafGeometry(){
  const pos=[],uv=[],indices=[];
  for(let i=0;i<=8;i++){
    const t=i/8,w=.43*Math.pow(Math.sin(Math.PI*t),.85)*(i%2?.93:1);
    for(const side of [-1,0,1]){pos.push(side*w,t,.11*Math.sin(Math.PI*t)*(side===0?1:.25));uv.push((side+1)/2,t);}
  }
  for(let i=0;i<8;i++)for(let j=0;j<2;j++){const k=i*3+j;indices.push(k,k+3,k+1,k+1,k+3,k+4);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
const detailedLeaf=leafGeometry(),taperedBranch=new THREE.CylinderGeometry(.52,1,1,9);
function barkMaterial(){
  const c=document.createElement('canvas');c.width=128;c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#9d9580';ctx.fillRect(0,0,128,512);
  for(let i=0;i<100;i++){const x=(i*41.73)%128;ctx.strokeStyle=i%3?'#696450':'#bdb39a';ctx.lineWidth=i%4*.4+.4;ctx.beginPath();ctx.moveTo(x,0);for(let y=0;y<=512;y+=12)ctx.lineTo(x+Math.sin(y*.04+i)*2.7,y);ctx.stroke();}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({color:'#a39b89',map:tex,bumpMap:tex,bumpScale:.065,roughness:.96});
}
const bark=barkMaterial();
for(const m of windMaterials)m.side=THREE.DoubleSide;
function branch(a,b,r){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);const o=mesh(taperedBranch,bark);o.position.copy(av.add(bv).multiplyScalar(.5));o.scale.set(r,v.length(),r);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());}
function foliage(x,y,z,length=.28,m=green,angle=rand()*6){const o=mesh(detailedLeaf,m);o.position.set(x,y,z);o.scale.set(length*.75,length,length);o.rotation.set(between(.65,2.2),angle,between(-.9,.9));return o;}
function flower(x,y,z){
  for(let i=0;i<5;i++){const petal=mesh(detailedLeaf,i%2?pink:pinkLight);petal.position.set(x,y,z);petal.scale.set(.105,.13,.12);petal.rotation.set(-Math.PI/2+between(-.2,.2),0,i*Math.PI*2/5);}
  ball(x,y+.017,z,.025,mat('pollen','#c9a65b'));
}
function tree(x,z,height=4,type='broad'){
  const y=.3,lean=.17,stem=[[x,y,z],[x+.07,y+height*.25,z-.08],[x-lean,y+height*.53,z+.04],[x-.25,y+height*.74,z+.1]];
  for(let i=1;i<stem.length;i++)branch(stem[i-1],stem[i],.19*(1-i*.19));
  for(let i=0;i<7;i++){
    const a=i*2.399,base=[x-.12,y+height*between(.38,.62),z],spread=height*between(.25,.4),tip=[x+Math.cos(a)*spread,y+height*between(.76,.97),z+Math.sin(a)*spread];
    const elbow=[(base[0]+tip[0])*.5,base[1]+(tip[1]-base[1])*.67,(base[2]+tip[2])*.5];branch(base,elbow,.075);branch(elbow,tip,.046);
    if(type==='willow'){
      for(let j=0;j<17;j++){
        const f=.12+j*.052,origin=elbow.map((v,k)=>v+(tip[k]-v)*f);
        const th=a+between(-1.2,1.2),reach=between(.35,.95),len=between(1.4,2.85)*(.65+f*.4);
        const point=t=>[origin[0]+Math.cos(th)*reach*Math.sin(t*Math.PI*.65),origin[1]+.12*Math.sin(t*Math.PI)-len*t,origin[2]+Math.sin(th)*reach*Math.sin(t*Math.PI*.65)];
        const pts=Array.from({length:18},(_,k)=>point(k/17));line(pts,.006,bark);
        const count=Math.floor(len/.085);
        for(let k=1;k<count;k++){
          const t=(k+between(-.2,.2))/count,q=point(t);
          for(const side of [-1,1]){
            const leaf=foliage(q[0]+side*.018,q[1]-side*.025,q[2],between(.22,.32)*(1-.25*t),k%4?green:lightGreen,th);
            leaf.scale.x*=.32;leaf.rotation.set(between(-.35,.35),th+side*.5,Math.PI+side*between(.3,.8));
          }
        }
      }
    }else{
      for(let j=0;j<4;j++){
        const th=a+j*1.65,tip2=[tip[0]+Math.cos(th)*between(.3,.75),tip[1]+between(-.25,.3),tip[2]+Math.sin(th)*between(.3,.75)];branch(tip,tip2,.023);
        for(let k=0;k<4;k++){
          const phi=th+k*1.6,end=[tip2[0]+Math.cos(phi)*.42,tip2[1]+between(-.1,.27),tip2[2]+Math.sin(phi)*.42];branch(tip2,end,.009);
          for(let n=0;n<(type==='blossom'?7:18);n++){
            const t=rand(),px=tip2[0]*(1-t)+end[0]*t+between(-.18,.18),py=tip2[1]*(1-t)+end[1]*t+between(-.1,.1),pz=tip2[2]*(1-t)+end[2]*t+between(-.18,.18);
            if(type==='blossom'&&n%3!==0)flower(px,py,pz);else foliage(px,py,pz,between(.2,.36),[green,lightGreen,deepGreen][Math.floor(rand()*3)]);
          }
        }
      }
    }
  }
  for(let i=0;i<6;i++){const a=i*Math.PI/3;branch([x,.5,z],[x+Math.cos(a)*.44,.21,z+Math.sin(a)*.44],.06);}
}
function shrub(x,z,s=.6){for(let j=0;j<60;j++){const a=rand()*Math.PI*2,r=Math.sqrt(rand())*s;foliage(x+Math.cos(a)*r,.31+rand()*s*.65,z+Math.sin(a)*r,between(.15,.27),[green,lightGreen,deepGreen][j%3]);}}

function stoneLamp(x,z){box(x,.45,z,.45,.2,.45,stone);box(x,.93,z,.18,.9,.18,stone);box(x,1.4,z,.55,.14,.55,pale);box(x,1.65,z,.34,.4,.34,amber);for(const a of [-1,1])for(const b of [-1,1])box(x+a*.2,1.67,z+b*.2,.07,.48,.07,stone);const cap=mesh(new THREE.ConeGeometry(.49,.35,4),tile);cap.position.set(x,2.02,z);cap.rotation.y=Math.PI/4;ball(x,2.25,z,.07,stone);}

let pondSurface,pondBed;
function pond(){
  const shape=new THREE.Shape();shape.moveTo(-7,-1);shape.bezierCurveTo(-8,-5,-2,-6,2,-6);shape.bezierCurveTo(6,-6,8,-3,7,0);shape.bezierCurveTo(8,3,4,5,0,4);shape.bezierCurveTo(-4,5,-7,3,-7,-1);
  const g=new THREE.ShapeGeometry(shape,64);g.rotateX(-Math.PI/2);
  const normalData=new Uint8Array(128*128*4);
  for(let j=0;j<128;j++)for(let i=0;i<128;i++){
    const x=i/128*Math.PI*2,y=j/128*Math.PI*2,k=(j*128+i)*4;
    const nx=.035*Math.cos(x*5+y*3)+.015*Math.cos(x*13-y*7);
    const ny=.025*Math.cos(x*5+y*3)+.018*Math.sin(y*11-x*2);
    const n=new THREE.Vector3(nx,ny,1).normalize();normalData[k]=(n.x*.5+.5)*255;normalData[k+1]=(n.y*.5+.5)*255;normalData[k+2]=(n.z*.5+.5)*255;normalData[k+3]=255;
  }
  const normals=new THREE.DataTexture(normalData,128,128);normals.wrapS=normals.wrapT=THREE.RepeatWrapping;normals.magFilter=THREE.LinearFilter;normals.minFilter=THREE.LinearFilter;normals.needsUpdate=true;
  const waterGeometry=new THREE.ShapeGeometry(shape,64);
  const w=new Water(waterGeometry,{textureWidth:512,textureHeight:512,waterNormals:normals,waterColor:'#3f655c',sunColor:'#e4e4d4',sunDirection:new THREE.Vector3(-12,22,12).normalize(),distortionScale:.65,alpha:.95});
  w.material.uniforms.size.value=3;w.material.uniforms.time=clock;
  w.rotation.x=-Math.PI/2;w.position.set(0,.25,.6);w.castShadow=false;w.receiveShadow=true;staticRoot.add(w);pondSurface=w;
  const bed=mesh(g,new THREE.MeshStandardMaterial({color:'#526357',roughness:1}));bed.position.set(0,.17,.6);bed.castShadow=false;pondBed=bed;
  // A perimeter of irregular stones follows the actual shoreline.
  const pts=shape.getPoints(110);for(let i=0;i<pts.length;i++){const p=pts[i];rock(p.x,.3,-p.y+.6,between(.2,.47),between(.18,.43),between(.22,.4));}
  for(let i=0;i<50;i++){const a=rand()*Math.PI*2,r=between(1.5,5.7),x=Math.cos(a)*r,z=Math.sin(a)*r*.60+.7;if(Math.abs(z-3.1)<1&&Math.abs(x)<3)continue;const lily=mesh(new THREE.CircleGeometry(between(.13,.27),12,0,Math.PI*1.88),[green,lightGreen][i%2]);lily.rotation.x=-Math.PI/2;lily.rotation.z=rand()*6;lily.position.set(x,.277,z);lily.castShadow=false;if(i%5===0){rod([x,.28,z],[x,.5,z],.015,green);for(let a=0;a<7;a++){const b=ball(x+Math.cos(a)*.08,.49,z+Math.sin(a)*.08,.065,pinkLight);b.scale.y*=1.5;}}}
}
function waterfall(){
  // Unequal peaks surround a recessed wet grotto, following Zhan Yuan rockeries.
  const rocks=[
    [-7.95,1.13,-3.65,.85,1.35,.92,0,false,-.25],[-7.66,2.75,-3.69,.88,1.44,.8,1,false,.25],
    [-7.42,4.03,-3.68,.66,.95,.62,2,false,-.18],[-8.58,.58,-3.0,.93,.65,.75,4,false,.6],
    [-8.4,1.82,-3.15,.57,1.08,.67,2,false,.7],[-5.25,1.21,-3.12,.75,1.39,.91,1,false,-.3],
    [-5.22,2.83,-3.15,.75,.83,.72,0,false,.45],[-5.86,3.63,-3.02,.83,.62,.70,4,false,.2],
    [-6.65,3.51,-3.13,.90,.56,.70,3,false,-.12],[-6.31,4.16,-3.54,.51,.69,.60,2,false,.3],
    [-6.5,1.38,-3.07,.94,1.32,.48,1,true,.2],[-6.15,2.55,-2.93,.84,.68,.5,4,true,-.1],
    [-7.13,.67,-2.27,.57,.74,.54,2,true,-.2],[-5.3,.58,-2.12,.71,.72,.73,0,false,.5],
    [-4.95,.32,-1.36,.7,.32,.55,3,false,-.4],[-7.97,.36,-1.89,.7,.43,.8,5,false,.3]
  ];rocks.forEach(r=>scholarRock(...r));
  // The overhanging lip has a dark underside and a narrow, irregular outlet.
  scholarRock(-6.38,3.13,-2.57,.82,.22,.65,5,true,.06);
  for(let i=0;i<14;i++){const a=i*2.399;rock(-6.7+Math.cos(a)*1.8,.32,-3.1+Math.sin(a)*1.55,between(.23,.48),between(.23,.54),between(.25,.55));}
  // Clinging ferns are placed in dry cracks, away from the falling curtain.
  for(const [x,y,z] of [[-7.78,2.5,-2.95],[-5.25,2.13,-2.55],[-7.3,3.74,-3.02],[-5.1,.72,-1.92]]){
    for(let a=0;a<5;a++)for(let j=1;j<7;j++){
      const t=j/7,angle=a*1.25,xx=x+Math.cos(angle)*t*.3,zz=z+Math.sin(angle)*t*.3;
      const leaf=foliage(xx,y+Math.sin(t*Math.PI)*.13,zz,.13,deepGreen,angle);leaf.scale.x*=.45;
    }
  }
  const flowingMaterial=new THREE.ShaderMaterial({uniforms:{time:clock},transparent:true,side:THREE.DoubleSide,depthWrite:false,
    vertexShader:`varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float time;varying vec2 vUv;varying vec3 vNormal;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        float travel=sqrt(vUv.y+.025)*4.8-time*1.9;
        float threads=noise(vec2(vUv.x*67.,travel*2.1));
        float broken=noise(vec2(vUv.x*19.+2.,travel*7.));
        float edge=smoothstep(0.,.045,vUv.x)*smoothstep(0.,.045,1.-vUv.x);
        float holes=smoothstep(.20,.66,threads*.68+broken*.32);
        float shimmer=pow(threads,6.)*.6;
        vec3 color=mix(vec3(.39,.49,.47),vec3(.91,.95,.92),threads*.67+shimmer);
        gl_FragColor=vec4(color,edge*holes*(.22+.50*threads));
      }`});
  function waterStrip(points,width,phase=0){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    const vertices=[],uv=[],indices=[],rows=90,cols=12;
    for(let i=0;i<=rows;i++){
      const t=i/rows,p=curve.getPoint(t),w=width*(.92+.07*Math.sin(t*31+phase)+.04*Math.sin(t*79));
      for(let j=0;j<=cols;j++){const u=j/cols;vertices.push(p.x+(u-.5)*w,p.y+.008*Math.sin(u*24+phase),p.z+.014*Math.sin(u*23+t*8+phase));uv.push(u,t);}
    }
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const m=mesh(g,flowingMaterial);m.castShadow=false;m.renderOrder=2;
  }
  // A shallow rill reaches the lip; free water then falls almost vertically.
  waterStrip([[-6.56,3.79,-3.0],[-6.52,3.39,-2.57],[-6.42,3.30,-2.18]],.28,1);
  waterStrip([[-6.42,3.30,-2.18],[-6.40,3.12,-2.02],[-6.36,2.55,-1.94],[-6.29,1.51,-1.81],[-6.20,.285,-1.60]],.79);
  waterStrip([[-5.99,3.24,-2.22],[-5.94,2.73,-2.08],[-5.97,1.80,-1.98],[-5.90,.285,-1.65]],.12,3);
  waterStrip([[-6.85,3.21,-2.28],[-6.86,2.42,-2.12],[-6.81,1.66,-1.94],[-6.75,.285,-1.7]],.09,5);
  // Fine falling droplets and short ballistic splashes; no solid cyan water tube.
  const count=420,pos=new Float32Array(count*3),specs=Array.from({length:count},(_,i)=>({phase:rand(),x:between(-.39,.39),z:between(-.12,.12),speed:between(.6,1.05),splash:i%3===0,angle:rand()*Math.PI*2}));
  const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');const gradient=ctx.createRadialGradient(16,16,1,16,16,15);gradient.addColorStop(0,'rgba(255,255,255,.9)');gradient.addColorStop(.3,'rgba(255,255,255,.5)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
  const sprite=new THREE.CanvasTexture(c),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));const droplets=new THREE.Points(g,new THREE.PointsMaterial({color:'#edf2ee',map:sprite,size:.046,transparent:true,opacity:.52,depthWrite:false}));animatedRoot.add(droplets);
  droplets.userData.update=t=>{specs.forEach((p,i)=>{const f=(t*p.speed+p.phase)%1;
    if(p.splash){pos[i*3]=-6.2+p.x+Math.cos(p.angle)*f*.50;pos[i*3+1]=.29+Math.sin(Math.PI*f)*.25;pos[i*3+2]=-1.6+p.z+Math.sin(p.angle)*f*.43;}
    else{pos[i*3]=-6.42+p.x+f*.22;pos[i*3+1]=3.28-2.995*f*f;pos[i*3+2]=-2.08+p.z+f*.46;}
  });g.attributes.position.needsUpdate=true;};
  const foamMaterial=new THREE.ShaderMaterial({uniforms:{time:clock},transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float time;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.;float r=length(p*vec2(.85,1.2));float grain=sin(p.x*65.+time*3.)*sin(p.y*59.-time*2.);float foam=(1.-smoothstep(.12,.92,r))*(.22+.14*grain);float ripples=pow(max(0.,sin(r*38.-time*2.)),14.)*(1.-smoothstep(.3,1.,r))*.12;gl_FragColor=vec4(.88,.94,.89,foam+ripples);}`});
  const foam=mesh(new THREE.PlaneGeometry(1.65,1.25),foamMaterial);foam.rotation.x=-Math.PI/2;foam.position.set(-6.22,.282,-1.57);foam.castShadow=false;foam.renderOrder=3;
}
const children=[];
function child(offset,color,size=1){const g=new THREE.Group();animatedRoot.add(g);g.scale.setScalar(size);const skin=mat('skin','#d8ae87'),hair=mat('hair','#34362b'),cloth=mat(color,color),shoe=mat('shoe','#49483e');
  const torso=mesh(new THREE.CylinderGeometry(.14,.21,.36,9),cloth,g);torso.position.y=.6;
  const head=ball(0,.94,0,.155,skin,g);const cap=ball(0,1.015,-.025,.145,hair,g);cap.scale.y*=.65;ball(0,1.12,-.035,.065,hair,g);
  for(const side of [-1,1])ball(side*.057,.952,.138,.014,hair,g);
  const legs=[],arms=[];for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.087,.46,0);g.add(leg);rod([0,0,0],[0,-.3,0],.064,mat('pants','#bbb4a0'),leg);box(0,-.32,.035,.115,.07,.19,shoe,leg);legs.push(leg);const arm=new THREE.Group();arm.position.set(side*.16,.72,0);arm.rotation.z=side*.2;g.add(arm);rod([0,0,0],[0,-.22,0],.06,cloth,arm);ball(0,-.25,0,.054,skin,arm);arms.push(arm);}
  children.push({g,legs,arms,offset});
}
const fish=[];
function koi(){for(let i=0;i<6;i++){const g=new THREE.Group();animatedRoot.add(g);const b=ball(0,0,0,.13,mat(i%2?'koiWhite':'koiOrange',i%2?'#e3cda6':'#c2854c'),g);b.scale.set(.10,.045,.31);const tail=mesh(new THREE.ConeGeometry(.12,.22,3),pale,g);tail.rotation.x=-Math.PI/2;tail.position.z=-.36;g.position.y=.29;fish.push({g,phase:rand()*6,rad:between(1.5,3.5)});}}

function landscape(){
  shapeExtrusion([[-11,-8.7],[10,-8.7],[11,-7.7],[11,7],[9.5,8.5],[-10,8.5],[-11,7.5]],.52,earth,-.48);
  shapeExtrusion([[-10.95,-8.65],[9.95,-8.65],[10.95,-7.65],[10.95,6.95],[9.45,8.45],[-9.95,8.45],[-10.95,7.45]],.12,mat('ground','#c5c7a8'),.04);
  // Hand-laid garden paths and courtyards.
  for(let i=0;i<33;i++)for(let j=0;j<3;j++){const x=-9.7+i*.6,z=6.5+j*.48;const b=box(x,.24,z,.56,.085,.44,i%3?stone:pale);b.rotation.y=between(-.04,.04);}
  for(let i=0;i<16;i++)for(let j=0;j<4;j++)box(-4.2+i*.55,.23,-3.9+j*.42,.51,.08,.38,(i+j)%3?stone:pale);
  for(let i=0;i<21;i++){const t=i/20,a=-.1+t*2.7;const x=8.8*Math.cos(a),z=5.6*Math.sin(a)-.5;const b=box(x,.24,z,.58,.085,.7,stone);b.rotation.y=-a;}
  for(let i=0;i<12;i++){const z=-1+i*.62;box(-8.7,.24,z,1.45,.09,.56,stone);}
  pond();building(-1.3,-6.0,6.7,3.4,3.3);building(6.3,-5.9,3.6,2.8,2.7);pavilion(6.5,2.2);bridge(-.3,3.1,5.5,1.5);waterfall();
  wall(0,-8.3,21,0,1.45);wall(-10.55,-.5,15.8,Math.PI/2,1.4);wall(10.45,-.5,15.8,Math.PI/2,1.4);
  wall(-9.1,7.6,2.9,0,1.25);moonGate(-6.2,7.46);wall(2.9,7.6,15.1,0,1.12);
  // Low front wall reveals the water; perforated lattice screens add depth.
  for(const x of [-1.3,3.2,7.3]){box(x,.93,7.74,1.1,.61,.03,darkwood);box(x,.93,7.77,1,.51,.03,plaster);for(let i=-2;i<=2;i++){rod([x+i*.16,.68,7.8],[x+i*.16,1.17,7.8],.018,tileEdge);rod([x-.46,.93+i*.08,7.8],[x+.46,.93+i*.08,7.8],.018,tileEdge);}}
  const treeSpecs=[[-8.8,-6.7,4.4,'broad'],[-4.5,-7.9,4.7,'broad'],[3.2,-7.9,4.7,'broad'],[9,-6.9,4.4,'broad'],[-9,-.6,3.9,'blossom'],[-8.3,.6,4.1,'willow'],[8.8,-1.4,4.5,'willow'],[9.0,5.5,3.6,'broad'],[-7.4,5.2,3.7,'blossom'],[3.9,6.4,3.7,'willow'],[-3.9,-3.1,3.1,'blossom'],[3,-3.5,3,'blossom'],[-9.3,3.3,3.6,'broad']];
  for(const t of treeSpecs)tree(...t);
  for(let i=0;i<95;i++){const x=between(-10,10),z=between(-7.8,7.2);if(Math.abs(x)>8.5||z>5.8||z< -7.2){shrub(x,z,between(.25,.5));if(i%4===0)rock(x,.34,z,.4,.4,.34);}}
  for(const [x,z] of [[-4.3,4.3],[4.1,4.3],[-7.9,-1],[4,-3.2]])stoneLamp(x,z);
  for(let i=0;i<35;i++){const a=rand()*6,x=Math.cos(a)*between(7.5,9.8),z=Math.sin(a)*between(5.7,6.2);rock(x,.32,z,between(.22,.65),between(.3,.75),between(.3,.6));}
  // Tiny flowering grasses along the paths.
  for(let i=0;i<80;i++){const x=between(-9,9),z=between(5.65,6.25);rod([x,.23,z],[x+.04,.55,z],.009,green);ball(x+.04,.57,z,.045,i%2?pink:pinkLight);}
  child(0,'#ac7055',1.06);child(1.7,'#68888a',1.02);child(3.2,'#c4a574',.91);koi();
}
function batchStatic(){
  staticRoot.updateMatrixWorld(true);const batches=new Map();const keep=[];
  staticRoot.traverse(o=>{if(!o.isMesh)return;const key=o.geometry.uuid+'/'+o.material.uuid+'/'+o.castShadow;let b=batches.get(key);if(!b){b={geometry:o.geometry,material:o.material,shadow:o.castShadow,objects:[]};batches.set(key,b);}b.objects.push(o);});
  for(const b of batches.values()){if(b.material.isShaderMaterial||b.objects.includes(pondSurface)||b.objects.includes(pondBed)){for(const o of b.objects){const matrix=o.matrixWorld.clone();matrix.decompose(o.position,o.quaternion,o.scale);keep.push(o);}continue;}const instance=new THREE.InstancedMesh(b.geometry,b.material,b.objects.length);instance.castShadow=b.shadow;instance.receiveShadow=true;b.objects.forEach((o,i)=>instance.setMatrixAt(i,o.matrixWorld));instance.instanceMatrix.needsUpdate=true;instance.computeBoundingSphere();keep.push(instance);}
  staticRoot.clear();keep.forEach(o=>staticRoot.add(o));
}
const anchors={study:new THREE.Vector3(-1.5,4.9,-5),bridge:new THREE.Vector3(-3.4,2.6,3.1),pavilion:new THREE.Vector3(6.5,5.35,2.2),waterfall:new THREE.Vector3(-6.5,4.5,-2.9)};
const pins=[...document.querySelectorAll('.garden-pin')];
const projected=new THREE.Vector3();
function updatePins(){
  const w=stage.clientWidth,h=stage.clientHeight,placed=[];
  for(const pin of pins){
    projected.copy(anchors[pin.dataset.place]).project(camera);
    const pw=pin.offsetWidth||110,ph=pin.offsetHeight||52;
    let x=Math.max(pw/2+6,Math.min(w-pw/2-6,(projected.x*.5+.5)*w));
    let y=Math.max(ph+12,Math.min(h-85,(-projected.y*.5+.5)*h-22));
    for(let pass=0;pass<4;pass++)for(const r of placed){if(Math.abs(x-r.x)<(pw+r.w)/2+5&&Math.abs(y-r.y)<Math.max(ph,r.h)+7)y=Math.max(ph+12,r.y-r.h-9);}
    placed.push({x,y,w:pw,h:ph});pin.style.left=x+'px';pin.style.top=y+'px';pin.hidden=projected.z>1||projected.z< -1;
  }
}
let elapsed=0,last=0,visible=true,failed=false;
function frame(now){if(failed)return;requestAnimationFrame(frame);if(document.hidden||!visible){last=now;return;}const dt=Math.min((now-last)/1000,.04);last=now;if(!paused)elapsed+=dt;clock.value=elapsed;
  children.forEach(({g,legs,arms,offset})=>{const t=elapsed*.55+offset;g.position.set(Math.sin(t)*2.8-1.8,.28+Math.abs(Math.sin(t*10))*.065,-3.25+Math.cos(t)*.27);g.rotation.y=Math.atan2(Math.cos(t)*2.8,-Math.sin(t)*.42);legs.forEach((l,i)=>l.rotation.x=Math.sin(t*10+i*Math.PI)*.75);arms.forEach((a,i)=>a.rotation.x=-Math.sin(t*10+i*Math.PI)*.7);});
  fish.forEach(({g,phase,rad})=>{const a=elapsed*.13+phase;g.position.x=Math.cos(a)*rad;g.position.z=Math.sin(a)*rad*.6+.1;g.rotation.y=-a;});
  animatedRoot.children.forEach(o=>o.userData.update?.(elapsed));controls.update(dt);updatePins();renderer.render(scene,camera);
}
let previousCompact;
function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;const compact=w<650;if(previousCompact!==compact){previousCompact=compact;reset();}camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);updatePins();}
function reset(){const mobile=stage.clientWidth<650;camera.position.set(mobile?31:23,mobile?30:21,mobile?39:28);controls.target.set(0,.5,0);controls.update();}
function syncPause(){document.querySelector('#garden-pause').setAttribute('aria-label',paused?'继续园林动画':'暂停园林动画');document.querySelector('#garden-pause').setAttribute('aria-pressed',String(paused));document.querySelector('#garden-pause').innerHTML=paused?'▷ <span>继续</span>':'Ⅱ <span>暂停</span>';}
function fallback(error){failed=true;console.error('Garden renderer unavailable:',error);stage.classList.add('is-fallback');loading.innerHTML='<span>小院暂以静景呈现，四处入口仍可探访。</span>';loading.style.cssText='inset:20px 20px auto;background:#ffffffe0;padding:16px;';document.querySelector('.garden-controls').hidden=true;host.replaceChildren();}
try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
  host.append(renderer.domElement);scene=new THREE.Scene();scene.add(staticRoot,animatedRoot);camera=new THREE.PerspectiveCamera(35,1,.1,160);
  scene.add(new THREE.HemisphereLight('#f7f4de','#8b9b85',2.1));const sun=new THREE.DirectionalLight('#fff0d6',2.7);sun.position.set(-12,22,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;sun.shadow.normalBias=.06;sun.shadow.bias=-.0003;scene.add(sun);scene.add(new THREE.AmbientLight('#bfd6d9',.3));
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.13}));ground.rotation.x=-Math.PI/2;ground.position.y=-.64;ground.receiveShadow=true;scene.add(ground);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=false;controls.minDistance=20;controls.maxDistance=70;controls.minPolarAngle=.25;controls.maxPolarAngle=Math.PI*.46;controls.autoRotateSpeed=.55;controls.zoomSpeed=.65;controls.rotateSpeed=.65;
  reset();landscape();batchStatic();resize();
  loading.hidden=true;stage.dataset.ready='true';
  new ResizeObserver(resize).observe(stage);new IntersectionObserver(([e])=>{visible=e.isIntersecting;},{rootMargin:'100px'}).observe(stage);
  document.querySelector('#garden-reset').onclick=()=>{controls.autoRotate=false;document.querySelector('#garden-rotate').setAttribute('aria-pressed','false');reset();};
  document.querySelector('#garden-rotate').onclick=e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));};
  document.querySelector('#garden-pause').onclick=()=>{paused=!paused;if(paused){controls.autoRotate=false;document.querySelector('#garden-rotate').setAttribute('aria-pressed','false');}syncPause();};syncPause();
  reduced.addEventListener('change',e=>{paused=e.matches;if(paused){controls.autoRotate=false;document.querySelector('#garden-rotate').setAttribute('aria-pressed','false');}syncPause();});
  document.querySelector('#garden-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(stage.requestFullscreen)await stage.requestFullscreen();else stage.classList.toggle('is-expanded');}catch{stage.classList.toggle('is-expanded');}resize();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){stage.classList.remove('is-expanded');resize();}});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback('WebGL context lost');});
  requestAnimationFrame(frame);
  // Read-only diagnostics for browser verification.
  window.gardenDiagnostics=()=>({ready:stage.dataset.ready==='true',paused,time:elapsed,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,camera:camera.position.toArray(),instances:staticRoot.children.reduce((n,o)=>n+(o.count||0),0)});
} catch(error) {fallback(error);}
