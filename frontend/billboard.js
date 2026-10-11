(() => {
// Billboard slideshow: autoplays, pauses on hover or focus, and respects reduced-motion settings
const slides=[...document.querySelectorAll(".bb-slide")];
const dots=document.getElementById("bbDots");
const board=document.getElementById("billboard");
if(!slides.length||!dots||!board)return;
const reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let index=0, timer=null;
slides.forEach((_,i)=>{
  const b=document.createElement("button");
  b.type="button";b.className="bb-dot";b.setAttribute("aria-label",`Show slide ${i+1}`);
  b.addEventListener("click",()=>{show(i);restart()});
  dots.appendChild(b);
});
const dotEls=[...dots.children];
function show(i){
  index=(i+slides.length)%slides.length;
  slides.forEach((s,n)=>{s.classList.toggle("is-active",n===index);s.setAttribute("aria-hidden",n===index?"false":"true")});
  dotEls.forEach((d,n)=>{d.classList.toggle("active",n===index);d.setAttribute("aria-current",n===index?"true":"false")});
}
function next(){show(index+1)}
function start(){if(!reduce)timer=setInterval(next,5500)}
function stop(){clearInterval(timer);timer=null}
function restart(){stop();start()}
document.getElementById("bbNext").addEventListener("click",()=>{next();restart()});
document.getElementById("bbPrev").addEventListener("click",()=>{show(index-1);restart()});
board.addEventListener("mouseenter",stop);
board.addEventListener("mouseleave",start);
board.addEventListener("focusin",stop);
board.addEventListener("focusout",start);
// swipe on touch screens
let x0=null;
board.addEventListener("touchstart",e=>{x0=e.touches[0].clientX},{passive:true});
board.addEventListener("touchend",e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>40){dx<0?next():show(index-1);restart()}});
show(0);start();
})();
