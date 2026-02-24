const canvas=document.getElementById("stage"),ctx=canvas.getContext("2d");
const pick=document.getElementById("pick"),start=document.getElementById("start"),statusEl=document.getElementById("status"),ptEl=document.getElementById("pt");
const names=["Astra","Bolt","Crow","Dune"]; const colors=["#7be0ff","#ffd28d","#97ffb2","#f9a2ff"]; const finish=620;
let racers=[],run=false,pts=Number(localStorage.getItem("cat10_pts")||120); ptEl.textContent=pts;
names.forEach((n,i)=>{const o=document.createElement("option");o.value=i;o.textContent=`${i+1}. ${n}`;pick.appendChild(o)});
function reset(){racers=names.map((n,i)=>({n,x:26,y:50+i*58,s:1+Math.random()*0.8,next:0}));run=true;statusEl.textContent="진행 중"}
function step(){
  racers.forEach(r=>{r.s+= (Math.random()-0.48)*0.08; r.s=Math.max(0.75,Math.min(2.3,r.s)); if(Math.random()<0.03)r.s*=1.22; r.x+=r.s;});
  const w=racers.findIndex(r=>r.x>=finish);
  if(w>=0){run=false; const ok=Number(pick.value)===w; pts=Math.max(0,pts+(ok?55:-20)); ptEl.textContent=pts; localStorage.setItem("cat10_pts",String(pts)); statusEl.textContent=`우승 ${racers[w].n} / ${ok?"적중 +55":"실패 -20"}`;}
}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="#9ac4ff66";ctx.beginPath();ctx.moveTo(finish,16);ctx.lineTo(finish,270);ctx.stroke();racers.forEach((r,i)=>{ctx.fillStyle=colors[i];ctx.fillRect(r.x,r.y,24,14);ctx.fillStyle="#eaf4ff";ctx.fillText(r.n,8,r.y+12);});}
function loop(){if(run)step();draw();requestAnimationFrame(loop)}
start.addEventListener("click",reset);reset();loop();
