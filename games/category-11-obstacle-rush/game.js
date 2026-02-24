const c=document.getElementById("stage"),x=c.getContext("2d"),start=document.getElementById("start"),statusEl=document.getElementById("status");
let p,obs,run=false,score=0,spawn=0,effect=null,effectUntil=0;
function reset(){p={x:80,y:200,w:24,h:24,vy:0,jump:8.8};obs=[];run=true;score=0;spawn=0;effect=null;effectUntil=0;statusEl.textContent="진행 중"}
function onGround(){return p.y>=200}
function jump(){if(onGround()){p.vy=-p.jump;}}
function maybeCard(now){if(Math.random()<0.006){const cards=["slow","small","shield"];effect=cards[Math.floor(Math.random()*cards.length)];effectUntil=now+3500;statusEl.textContent=`카드: ${effect}`;}}
function step(now){
  score+=1; spawn-=1; if(spawn<=0){obs.push({x:720,w:18+Math.random()*24,h:20+Math.random()*34});spawn=48+Math.random()*42;}
  const speed = effect==="slow"&&now<effectUntil?3.2:4.7;
  obs.forEach(o=>o.x-=speed); obs=obs.filter(o=>o.x+o.w>0);
  p.vy+=0.42; p.y+=p.vy; if(p.y>200){p.y=200;p.vy=0;}
  maybeCard(now);
  if(now>effectUntil){effect=null;statusEl.textContent="진행 중";}
  const pw=effect==="small"&&now<effectUntil?14:p.w, ph=effect==="small"&&now<effectUntil?14:p.h;
  const hit=obs.some(o=> p.x < o.x+o.w && p.x+pw > o.x && p.y+ph > 240-o.h);
  if(hit && !(effect==="shield"&&now<effectUntil)){run=false;statusEl.textContent=`게임오버 / 점수 ${score}`;}
}
function draw(now){x.clearRect(0,0,700,260);x.fillStyle="#2e5c37";x.fillRect(0,224,700,36);x.fillStyle="#e7ffe7";x.fillText(`Score: ${score}`,12,18);if(effect&&now<effectUntil)x.fillText(`Effect: ${effect}`,120,18);const pw=effect==="small"&&now<effectUntil?14:p.w, ph=effect==="small"&&now<effectUntil?14:p.h;x.fillStyle="#97ffc1";x.fillRect(p.x,p.y,pw,ph);x.fillStyle="#ffd48a";obs.forEach(o=>x.fillRect(o.x,240-o.h,o.w,o.h));}
function loop(now){if(run)step(now);draw(now);requestAnimationFrame(loop)}
start.addEventListener("click",reset);document.addEventListener("keydown",e=>{if(e.code==="Space")jump();});reset();loop();
