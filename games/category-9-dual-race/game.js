const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const keys = new Set();
const FINISH = 630;
let p1, p2, running = false;

function log(t){const d=document.createElement("div");d.textContent=t;logEl.prepend(d);while(logEl.children.length>12)logEl.removeChild(logEl.lastChild)}
function randNext(now){return now+1200+Math.random()*2400}

function reset(){
  const now=performance.now();
  p1={x:30,y:70,v:0,next:randNext(now),boost:0,slow:0,name:"P1"};
  p2={x:30,y:150,v:0,next:randNext(now),boost:0,slow:0,name:"P2"};
  statusEl.textContent="진행 중";logEl.innerHTML="";log("레이스 시작");
}

function power(me,other,now){
  const r=Math.random();
  if(r<0.34){me.boost=now+1200;log(`${me.name} 가속`)}
  else if(r<0.68){me.x+=20+Math.random()*35;log(`${me.name} 순간이동`)}
  else{other.slow=now+1000;log(`${me.name} 방해 -> ${other.name} 둔화`)}
  me.next=randNext(now);
}

function step(now){
  const left=keys.has("a"), right=keys.has("d"), l2=keys.has("arrowleft"), r2=keys.has("arrowright");
  p1.v = left ? -1.5 : right ? 1.8 : 0;
  p2.v = l2 ? -1.5 : r2 ? 1.8 : 0;

  [p1,p2].forEach((p)=>{
    let vv=p.v;
    if(now<p.boost) vv*=1.8;
    if(now<p.slow) vv*=0.4;
    p.x=Math.max(10,p.x+vv);
  });

  if(now>=p1.next) power(p1,p2,now);
  if(now>=p2.next) power(p2,p1,now);

  if(p1.x>=FINISH||p2.x>=FINISH){
    running=false;
    statusEl.textContent=p1.x>=FINISH&&p2.x>=FINISH?"동시 도착 무승부":p1.x>=FINISH?"P1 승리":"P2 승리";
    log(statusEl.textContent);
  }
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle="#9bc7ff66";ctx.beginPath();ctx.moveTo(FINISH,20);ctx.lineTo(FINISH,210);ctx.stroke();
  ctx.fillStyle="#7ce0ff";ctx.fillRect(p1.x,p1.y,24,14);ctx.fillStyle="#d8f7ff";ctx.fillText("P1",8,p1.y+12);
  ctx.fillStyle="#ffb4d0";ctx.fillRect(p2.x,p2.y,24,14);ctx.fillStyle="#ffe7f1";ctx.fillText("P2",8,p2.y+12);
}

function loop(now){if(running)step(now);draw();requestAnimationFrame(loop)}

document.addEventListener("keydown",e=>keys.add(e.key.toLowerCase()));
document.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
startBtn.addEventListener("click",()=>{reset();running=true});
reset();draw();requestAnimationFrame(loop);
