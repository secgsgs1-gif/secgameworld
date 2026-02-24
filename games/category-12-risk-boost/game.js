const c=document.getElementById("stage"),ctx=c.getContext("2d"),hold=document.getElementById("hold"),start=document.getElementById("start"),statusEl=document.getElementById("status");
let run=false,x=30,heat=0,holding=false,dist=0,best=Number(localStorage.getItem("cat12_best")||0);const finish=630;
function reset(){run=true;x=30;heat=0;holding=false;dist=0;statusEl.textContent=`진행 중 / 최고 ${best}`}
function fail(){run=false;statusEl.textContent=`폭주 실패! 거리 ${Math.floor(dist)} / 최고 ${best}`}
function win(){run=false;const d=Math.floor(dist);if(d>best){best=d;localStorage.setItem("cat12_best",String(best));}statusEl.textContent=`도착 성공! 거리 ${d} / 최고 ${best}`}
function step(){
  if(!run)return;
  let v=1.9;
  if(holding){heat=Math.min(100,heat+1.2);v+=heat*0.045;} else {heat=Math.max(0,heat-0.9);}
  const risk=(heat/100)*0.055;
  if(Math.random()<risk){fail();return;}
  x+=v; dist+=v;
  if(x>=finish)win();
}
function draw(){ctx.clearRect(0,0,700,240);ctx.strokeStyle="#ffc29c66";ctx.beginPath();ctx.moveTo(finish,20);ctx.lineTo(finish,220);ctx.stroke();ctx.fillStyle="#ffae75";ctx.fillRect(x,120,26,16);ctx.fillStyle="#fff3ea";ctx.fillText(`Heat: ${Math.floor(heat)}%`,12,20);ctx.fillText(`Risk: ${(heat/100*5.5).toFixed(2)}%/tick`,120,20);ctx.fillText(`Distance: ${Math.floor(dist)}`,300,20)}
function loop(){step();draw();requestAnimationFrame(loop)}
hold.addEventListener("mousedown",()=>holding=true);hold.addEventListener("mouseup",()=>holding=false);hold.addEventListener("mouseleave",()=>holding=false);hold.addEventListener("touchstart",e=>{e.preventDefault();holding=true},{passive:false});hold.addEventListener("touchend",()=>holding=false);
start.addEventListener("click",reset);reset();loop();
