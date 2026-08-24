export const APP_WORKFLOW_HTML = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
*{box-sizing:border-box}
html,body{height:100%;margin:0;overflow:hidden}
body{display:flex;flex-direction:column;background:#101018;color:#e6e6ef;
font:13px/1.45 system-ui,"Segoe UI","Microsoft YaHei",sans-serif}
#bar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px;
border-bottom:1px solid #262634;background:#16161e}
#bar .lede{color:#8b949e;font-size:12px}
#status{margin-left:4px;color:#8b949e;font:12px ui-monospace,Consolas,monospace}
#bar .sp{flex:1}
#bar button{background:#26263a;color:#e6e6ef;border:1px solid #33334a;border-radius:8px;
font-size:12px;padding:5px 11px;cursor:pointer}
#bar button:hover{background:#2f2f48}
#go{background:#238636;border-color:#2ea043;font-weight:600;color:#fff}
#go:disabled{opacity:.4}
#zoomv{color:#8b949e;min-width:42px;text-align:center;font-variant-numeric:tabular-nums}
#stage{flex:1;min-height:0;display:flex}
#palette{flex:none;width:132px;padding:10px 8px;border-right:1px solid #262634;background:#14141c;overflow:auto}
#palette .ph{font:11px system-ui;color:#8b949e;letter-spacing:.06em;margin:0 6px 8px}
#palette button{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 6px;padding:7px 8px;
background:#1b1b28;color:#e6e6ef;border:1px solid #2c2c3e;border-radius:8px;cursor:pointer;font:12px system-ui;text-align:left}
#palette button:hover{border-color:#4a6aa0;background:#222233}
#palette .dot{width:8px;height:8px;border-radius:50%;flex:none}
#viewport{flex:1;min-height:0;position:relative;overflow:hidden;cursor:grab}
#viewport.panning{cursor:grabbing}
#viewport.linking{cursor:crosshair}
#canvas{position:absolute;left:0;top:0;transform-origin:0 0;width:2400px;height:1600px;
background-color:#14141e;
background-image:
  linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),
  linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),
  linear-gradient(rgba(255,255,255,.016) 1px,transparent 1px),
  linear-gradient(90deg,rgba(255,255,255,.016) 1px,transparent 1px);
background-size:100px 100px,100px 100px,20px 20px,20px 20px}
#wires{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.node{position:absolute;width:220px;background:#1b1b28;border:1px solid #2c2c3e;border-radius:12px;
box-shadow:0 4px 14px rgba(0,0,0,.35);user-select:none;cursor:grab;overflow:visible}
.node.dragging{cursor:grabbing;border-color:#79c0ff;box-shadow:0 8px 24px rgba(121,192,255,.35)}
.node.sel{border-color:#79c0ff}
.node.ok{border-color:rgba(126,231,135,.5)}
.node.err{border-color:rgba(255,180,174,.55)}
.node.run{border-color:#e3b341}
.node .hd{display:flex;align-items:center;gap:8px;padding:10px 10px 6px 14px}
.node .dot{width:8px;height:8px;border-radius:50%;flex:none}
.node .t{font:600 13px system-ui;min-width:0;overflow:hidden;text-overflow:ellipsis}
.node .x{margin-left:auto;width:22px;height:22px;border:none;border-radius:6px;background:transparent;
color:#6a6a82;cursor:pointer;font:14px/1 system-ui}
.node .x:hover{background:#2a2a38;color:#ffb4ae}
.node .ports{position:relative;margin:2px 0 10px}
.port{position:absolute;left:0;right:0;display:flex;align-items:center;height:28px;
font:11px ui-monospace,Consolas,monospace;color:#8b949e}
.port .lab-in{padding-left:14px}
.port .lab-out{margin-left:auto;padding-right:14px}
.pin{width:10px;height:10px;border-radius:50%;border:2px solid #79c0ff;background:#14141e;flex:none;cursor:crosshair}
.port .pin.in{margin-left:-5px;border-color:#79c0ff}
.port .pin.out{margin-right:-5px;border-color:#7ee787}
#viewport.linking .pin.in{box-shadow:0 0 0 3px rgba(121,192,255,.35)}
.node .body{padding:0 12px 12px}
.node textarea{display:block;width:100%;min-height:44px;max-height:72px;resize:vertical;
background:#1a1a24;color:#e6e6ef;border:1px solid #333;border-radius:8px;padding:7px 8px;font:12px inherit}
.node .io{font:11px ui-monospace,Consolas,monospace;color:#d7d7e4;white-space:pre-wrap;
word-break:break-word;max-height:72px;overflow:auto}
#hint{position:absolute;right:12px;bottom:10px;z-index:2;font-size:11px;color:rgba(255,255,255,.28);pointer-events:none}
</style></head><body>
<div id="bar">
  <span class="lede">从左侧添加节点，从输出端口拖到输入端口连线</span>
  <span id="status">idle</span>
  <span class="sp"></span>
  <button id="go" type="button">Run</button>
  <button id="fit" type="button">全览</button>
  <button id="zout" type="button">−</button>
  <span id="zoomv">100%</span>
  <button id="zin" type="button">＋</button>
</div>
<div id="stage">
  <aside id="palette"><div class="ph">添加节点</div><div id="kinds"></div></aside>
  <div id="viewport">
    <div id="canvas"><svg id="wires"></svg></div>
    <div id="hint">拖端口连线 · 双击输入口断开 · Delete 删节点</div>
  </div>
</div>
<script>
const NODE_W=220, PORT_Y=51, PORT_H=28;
const vp=document.getElementById("viewport");
const canvas=document.getElementById("canvas");
const wiresEl=document.getElementById("wires");
const status=document.getElementById("status");
const go=document.getElementById("go");
const zoomv=document.getElementById("zoomv");
const kindsEl=document.getElementById("kinds");
const cam={x:36,y:36,k:1};
const pos={};
let kinds=[{kind:"echo",inputs:["text"],outputs:["text"]},{kind:"upper",inputs:["text"],outputs:["text"]}];
let graph=null,runRec=null,busy=false,selected=null,addN=0;
let drag=null,pan=null,link=null;
function applyCam(){
  canvas.style.transform="translate("+cam.x+"px,"+cam.y+"px) scale("+cam.k+")";
  zoomv.textContent=Math.round(cam.k*100)+"%";
}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];});}
function dump(v){try{return JSON.stringify(v);}catch(e){return String(v);}}
function color(kind){
  if(kind==="input")return "#79c0ff";
  if(kind==="echo")return "#7ee787";
  if(kind==="upper")return "#d2a8ff";
  return "#e3b341";
}
function kindInfo(kind){
  for(let i=0;i<kinds.length;i++) if(kinds[i].kind===kind) return kinds[i];
  return {kind:kind,inputs:["text"],outputs:["text"]};
}
function recOf(id){
  const nodes=runRec&&runRec.nodes||[];
  for(let i=0;i<nodes.length;i++) if(nodes[i].nodeId===id) return nodes[i];
}
function inPorts(n){
  if(n.kind==="input") return [];
  return kindInfo(n.kind).inputs.slice();
}
function outPorts(n){
  if(n.kind==="input") return ["text"];
  const rec=recOf(n.id);
  if(rec&&rec.outputs) return Object.keys(rec.outputs);
  return kindInfo(n.kind).outputs.slice();
}
function cloneGraph(g){
  return {id:g.id,nodes:(g.nodes||[]).map(function(n){ return {id:n.id,kind:n.kind,in:Object.assign({},n.in||{})}; })};
}
function items(){
  const list=[{id:"$input",kind:"input",title:"input"}];
  (graph&&graph.nodes||[]).forEach(function(n){ list.push({id:n.id,kind:n.kind,title:n.id,in:n.in}); });
  list.forEach(function(n,i){ if(!pos[n.id]) pos[n.id]={x:48+i*280,y:72}; });
  return list;
}
function itemOf(id){
  const list=items();
  for(let i=0;i<list.length;i++) if(list[i].id===id) return list[i];
}
function orderNodes(nodes){
  const ids=new Set(nodes.map(function(n){ return n.id; }));
  const indeg={}, adj={};
  nodes.forEach(function(n){ indeg[n.id]=0; adj[n.id]=[]; });
  nodes.forEach(function(n){
    Object.keys(n.in||{}).forEach(function(k){
      const w=n.in[k];
      if(w&&w.from==="node"&&ids.has(w.node)){ adj[w.node].push(n.id); indeg[n.id]++; }
    });
  });
  const q=[], seen={}, out=[], byId={};
  nodes.forEach(function(n){ byId[n.id]=n; if(indeg[n.id]===0) q.push(n.id); });
  while(q.length){
    const id=q.shift();
    if(seen[id]) continue;
    seen[id]=true; out.push(byId[id]);
    (adj[id]||[]).forEach(function(nxt){ indeg[nxt]--; if(indeg[nxt]===0) q.push(nxt); });
  }
  nodes.forEach(function(n){ if(!seen[n.id]) out.push(n); });
  return out;
}
function mutate(next){
  graph=next; runRec=null; render();
}
function nextId(kind){
  const used=new Set((graph.nodes||[]).map(function(n){ return n.id; }));
  if(!used.has(kind)) return kind;
  let i=2, id=kind+"-"+i;
  while(used.has(id)){ i++; id=kind+"-"+i; }
  return id;
}
function addNode(kind){
  if(!graph) return;
  const id=nextId(kind);
  const node={id:id,kind:kind,in:{}};
  const rect=vp.getBoundingClientRect();
  const ox=(rect.width/2-cam.x)/cam.k-NODE_W/2+(addN%5)*28;
  const oy=(rect.height/2-cam.y)/cam.k-40+(addN%5)*28;
  addN++;
  pos[id]={x:ox,y:oy};
  selected=id;
  mutate({id:graph.id,nodes:orderNodes(graph.nodes.concat([node]))});
}
function connect(fromId,fp,toId,tp){
  if(!graph||fromId===toId||toId==="$input") return;
  const wire=fromId==="$input"?{from:"input",key:fp}:{from:"node",node:fromId,key:fp};
  const nodes=graph.nodes.map(function(n){
    if(n.id!==toId) return n;
    const inn=Object.assign({},n.in||{});
    inn[tp]=wire;
    return {id:n.id,kind:n.kind,in:inn};
  });
  mutate({id:graph.id,nodes:orderNodes(nodes)});
}
function disconnect(toId,tp){
  if(!graph||toId==="$input") return;
  const nodes=graph.nodes.map(function(n){
    if(n.id!==toId) return n;
    const inn=Object.assign({},n.in||{});
    delete inn[tp];
    return {id:n.id,kind:n.kind,in:inn};
  });
  mutate({id:graph.id,nodes:nodes});
}
function removeNode(id){
  if(!graph||id==="$input") return;
  const nodes=graph.nodes.filter(function(n){ return n.id!==id; }).map(function(n){
    const inn=Object.assign({},n.in||{});
    let ch=false;
    Object.keys(inn).forEach(function(k){
      if(inn[k]&&inn[k].from==="node"&&inn[k].node===id){ delete inn[k]; ch=true; }
    });
    return ch?{id:n.id,kind:n.kind,in:inn}:n;
  });
  delete pos[id];
  if(selected===id) selected=null;
  mutate({id:graph.id,nodes:nodes});
}
function wireList(){
  const out=[];
  (graph&&graph.nodes||[]).forEach(function(n){
    Object.keys(n.in||{}).forEach(function(port){
      const w=n.in[port];
      if(!w) return;
      if(w.from==="input") out.push({from:"$input",fp:w.key,to:n.id,tp:port});
      if(w.from==="node") out.push({from:w.node,fp:w.key,to:n.id,tp:port});
    });
  });
  return out;
}
function pinXY(id,side,name){
  const p=pos[id];
  if(!p) return null;
  const n=itemOf(id);
  const names=side==="in"?inPorts(n):outPorts(n);
  const idx=Math.max(0,names.indexOf(name));
  return {x: side==="in"?p.x:p.x+NODE_W, y:p.y+PORT_Y+idx*PORT_H};
}
function bezier(a,b){
  const dx=Math.max(56,(b.x-a.x)*0.4);
  return "M "+a.x+" "+a.y+" C "+(a.x+dx)+" "+a.y+","+(b.x-dx)+" "+b.y+","+b.x+" "+b.y;
}
function drawWires(){
  const parts=['<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1 L10 5 L0 9 z" fill="#79c0ff"/></marker></defs>'];
  wireList().forEach(function(w){
    const a=pinXY(w.from,"out",w.fp),b=pinXY(w.to,"in",w.tp);
    if(!a||!b) return;
    parts.push('<path d="'+bezier(a,b)+'" fill="none" stroke="#79c0ff" stroke-width="1.75" marker-end="url(#arr)"/>');
  });
  if(link&&link.mx!=null){
    const a=pinXY(link.from,"out",link.fp);
    if(a) parts.push('<path d="'+bezier(a,{x:link.mx,y:link.my})+'" fill="none" stroke="#79c0ff" stroke-width="1.5" stroke-dasharray="6 4"/>');
  }
  wiresEl.innerHTML=parts.join("");
}
function screenToCanvas(cx,cy){
  const rect=vp.getBoundingClientRect();
  return {x:(cx-rect.left-cam.x)/cam.k,y:(cy-rect.top-cam.y)/cam.k};
}
function renderPalette(){
  kindsEl.innerHTML=kinds.map(function(k){
    return '<button type="button" data-kind="'+esc(k.kind)+'"><span class="dot" style="background:'+color(k.kind)+'"></span>'+esc(k.kind)+"</button>";
  }).join("");
}
function render(){
  const list=items();
  canvas.querySelectorAll(".node").forEach(function(n){ n.remove(); });
  list.forEach(function(n){
    const rec=recOf(n.id);
    const p=pos[n.id];
    const el=document.createElement("div");
    el.className="node"+(n.kind==="input"?" input":"")+(n.id===selected?" sel":"")+(rec?(rec.ok?" ok":" err"):"");
    el.dataset.id=n.id;
    el.style.left=p.x+"px";
    el.style.top=p.y+"px";
    const ins=inPorts(n);
    const outs=outPorts(n);
    const rows=Math.max(ins.length,outs.length,1);
    let ports="";
    for(let i=0;i<rows;i++){
      const inn=ins[i], out=outs[i];
      ports+='<div class="port" style="top:'+(i*PORT_H)+'px">';
      if(inn) ports+='<span class="pin in" data-side="in" data-port="'+esc(inn)+'"></span><span class="lab-in">'+esc(inn)+"</span>";
      if(out) ports+='<span class="lab-out">'+esc(out)+'</span><span class="pin out" data-side="out" data-port="'+esc(out)+'"></span>';
      ports+="</div>";
    }
    let body="";
    if(n.kind==="input"){
      const prev=document.getElementById("box");
      const val=prev?prev.value:"hello workflow";
      body='<div class="body"><textarea id="box">'+esc(val)+"</textarea></div>";
    } else if(rec){
      body='<div class="body"><div class="io">'+(rec.ok?esc(dump(rec.outputs)):esc(rec.error||"失败"))+"</div></div>";
    }
    const del=n.kind==="input"?"":'<button class="x" type="button" data-del title="删除">×</button>';
    el.innerHTML='<div class="hd"><span class="dot" style="background:'+color(n.kind)+'"></span><span class="t">'+esc(n.title)+"</span>"+del+"</div>"+
      '<div class="ports" style="height:'+(rows*PORT_H)+'px">'+ports+"</div>"+body;
    canvas.appendChild(el);
  });
  drawWires();
}
function setZoom(k,cx,cy){
  const nk=Math.min(2.2,Math.max(0.4,k));
  const rect=vp.getBoundingClientRect();
  const px=(cx==null?rect.width/2:cx-rect.left);
  const py=(cy==null?rect.height/2:cy-rect.top);
  const wx=(px-cam.x)/cam.k, wy=(py-cam.y)/cam.k;
  cam.k=nk; cam.x=px-wx*cam.k; cam.y=py-wy*cam.k; applyCam();
}
function fit(){
  const list=items();
  if(!list.length) return;
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  list.forEach(function(n){
    const p=pos[n.id];
    minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
    maxX=Math.max(maxX,p.x+NODE_W); maxY=Math.max(maxY,p.y+140);
  });
  const rect=vp.getBoundingClientRect();
  const k=Math.min(1,(rect.width-96)/(maxX-minX),(rect.height-96)/(maxY-minY));
  cam.k=Math.max(0.4,k);
  cam.x=(rect.width-(minX+maxX)*cam.k)/2;
  cam.y=(rect.height-(minY+maxY)*cam.k)/2;
  applyCam();
}
kindsEl.onclick=function(e){
  const btn=e.target.closest("button[data-kind]");
  if(btn) addNode(btn.getAttribute("data-kind"));
};
vp.addEventListener("wheel",function(e){
  e.preventDefault();
  setZoom(cam.k*(e.deltaY>0?0.9:1.11),e.clientX,e.clientY);
},{passive:false});
vp.addEventListener("mousedown",function(e){
  if(e.target.closest("textarea,button,#bar,#palette")) return;
  const pin=e.target.closest(".pin");
  if(pin){
    e.preventDefault(); e.stopPropagation();
    const node=pin.closest(".node");
    const side=pin.getAttribute("data-side");
    const name=pin.getAttribute("data-port");
    if(side==="out"){
      const c=screenToCanvas(e.clientX,e.clientY);
      link={from:node.dataset.id,fp:name,mx:c.x,my:c.y};
      vp.classList.add("linking");
      drawWires();
    }
    return;
  }
  const node=e.target.closest(".node");
  if(node){
    drag={id:node.dataset.id,dx:e.clientX,dy:e.clientY,ox:pos[node.dataset.id].x,oy:pos[node.dataset.id].y,moved:false};
    node.classList.add("dragging");
    return;
  }
  selected=null;
  canvas.querySelectorAll(".node.sel").forEach(function(n){ n.classList.remove("sel"); });
  pan={x:e.clientX,y:e.clientY,ox:cam.x,oy:cam.y};
  vp.classList.add("panning");
});
vp.addEventListener("dblclick",function(e){
  const pin=e.target.closest(".pin.in");
  if(!pin) return;
  const node=pin.closest(".node");
  disconnect(node.dataset.id, pin.getAttribute("data-port"));
});
window.addEventListener("mousemove",function(e){
  if(link){
    const c=screenToCanvas(e.clientX,e.clientY);
    link.mx=c.x; link.my=c.y; drawWires();
  } else if(drag){
    const dx=e.clientX-drag.dx, dy=e.clientY-drag.dy;
    if(Math.abs(dx)+Math.abs(dy)>4) drag.moved=true;
    pos[drag.id]={x:drag.ox+dx/cam.k,y:drag.oy+dy/cam.k};
    const el=canvas.querySelector('[data-id="'+drag.id+'"]');
    if(el){ el.style.left=pos[drag.id].x+"px"; el.style.top=pos[drag.id].y+"px"; }
    drawWires();
  } else if(pan){
    cam.x=pan.ox+(e.clientX-pan.x);
    cam.y=pan.oy+(e.clientY-pan.y);
    applyCam();
  }
});
window.addEventListener("mouseup",function(e){
  if(link){
    const pin=e.target.closest&&(e.target.closest(".pin.in")||(e.target.closest(".port")&&e.target.closest(".port").querySelector(".pin.in")));
    if(pin){
      const node=pin.closest(".node");
      connect(link.from, link.fp, node.dataset.id, pin.getAttribute("data-port"));
    } else drawWires();
    link=null; vp.classList.remove("linking");
  }
  if(drag){
    const el=canvas.querySelector('[data-id="'+drag.id+'"]');
    if(el) el.classList.remove("dragging");
    if(!drag.moved){
      selected=drag.id;
      canvas.querySelectorAll(".node").forEach(function(n){ n.classList.toggle("sel", n.dataset.id===selected); });
    }
  }
  drag=null; pan=null; vp.classList.remove("panning");
});
canvas.addEventListener("click",function(e){
  const btn=e.target.closest("[data-del]");
  if(!btn) return;
  e.stopPropagation();
  removeNode(btn.closest(".node").dataset.id);
});
document.addEventListener("keydown",function(e){
  if(e.key==="Enter"&&!e.shiftKey&&e.target.id==="box"){ e.preventDefault(); run(); return; }
  if((e.key==="Delete"||e.key==="Backspace")&&selected&&selected!=="$input"&&e.target.id!=="box"){
    e.preventDefault(); removeNode(selected);
  }
});
async function loadGraph(){
  if(!window.wh||!window.wh.call){ status.textContent="无 RPC"; renderPalette(); return; }
  const kr=await window.wh.call("workflowNodes","kinds",[]);
  if(kr.ok&&kr.result) kinds=kr.result;
  renderPalette();
  const r=await window.wh.call("workflowNodes","demoGraph",[]);
  if(!r.ok){ status.textContent=r.error||"节点插件未装入"; return; }
  graph=cloneGraph(r.result); status.textContent="idle"; render();
}
async function run(){
  const box=document.getElementById("box");
  const text=box?box.value:"";
  if(busy||!window.wh||!window.wh.call||!graph) return;
  busy=true; go.disabled=true; status.textContent="running";
  canvas.querySelectorAll(".node:not(.input)").forEach(function(n){ n.classList.add("run"); });
  try{
    const r=await window.wh.call("workflow","run",[{graph:graph,input:{text:text}}]);
    if(!r.ok){ status.textContent="error"; runRec=null; }
    else { runRec=r.result; status.textContent=r.result.status; }
    render();
  }catch(err){ status.textContent="error"; }
  busy=false; go.disabled=false;
}
go.onclick=run;
document.getElementById("fit").onclick=fit;
document.getElementById("zin").onclick=function(){ setZoom(cam.k*1.15); };
document.getElementById("zout").onclick=function(){ setZoom(cam.k/1.15); };
applyCam();
renderPalette();
loadGraph();
</script></body></html>`;
