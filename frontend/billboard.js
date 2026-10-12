(() => {
// Home page billboard: slides come from the server (edited by admins). If none are saved yet,
// the built-in slides in index.html are used. Autoplays, pauses on hover or focus, supports arrows, dots and swipe.
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const board=document.getElementById("billboard"), track=document.getElementById("bbTrack"), dots=document.getElementById("bbDots");
if(!board||!track||!dots)return;
const reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const imgSrc=u=>(u&&u.startsWith("/uploads/"))?API_BASE+u:u;
let slides=[], dotEls=[], index=0, timer=null;

function el(tag,props={},...kids){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(props)){
    if(v===undefined||v===null||v===false)continue;
    if(k==="class")n.className=v;
    else if(k==="text")n.textContent=v;
    else n.setAttribute(k,v===true?"":v);
  }
  for(const kid of kids.flat()){if(kid!==null&&kid!==undefined&&kid!==false)n.append(kid.nodeType?kid:document.createTextNode(String(kid)))}
  return n;
}
// Builds the slides from server data (text is set as text, never as HTML)
function buildSlides(list){
  track.replaceChildren(...list.map((s,i)=>el("article",{class:`bb-slide theme-${s.theme||"orange"}${i===0?" is-active":""}`,"aria-roledescription":"slide"},
    el("div",{class:"bb-copy"},
      s.kicker?el("small",{text:s.kicker}):null,
      el("h2",{text:s.title}),
      s.body?el("p",{text:s.body}):null,
      el("a",{class:"btn cream",href:s.buttonLink,text:`${s.buttonText||"Learn more"} ↗`})),
    el("div",{class:`bb-art${s.imageUrl?" photo":""}`},
      s.imageUrl?el("img",{src:imgSrc(s.imageUrl),alt:"",loading:"lazy"}):el("span",{text:"✳"})))));
}
function show(i){
  if(!slides.length)return;
  index=(i+slides.length)%slides.length;
  slides.forEach((s,n)=>{s.classList.toggle("is-active",n===index);s.setAttribute("aria-hidden",n===index?"false":"true")});
  dotEls.forEach((d,n)=>{d.classList.toggle("active",n===index);d.setAttribute("aria-current",n===index?"true":"false")});
}
function next(){show(index+1)}
function start(){stop();if(!reduce&&slides.length>1)timer=setInterval(next,5500)}
function stop(){clearInterval(timer);timer=null}
function restart(){start()}
// Reads the slides currently in the track, then (re)builds the dots
function setup(){
  stop();
  slides=[...track.querySelectorAll(".bb-slide")];
  dots.replaceChildren();
  dotEls=slides.map((_,i)=>{
    const b=document.createElement("button");
    b.type="button";b.className="bb-dot";b.setAttribute("aria-label",`Show slide ${i+1}`);
    b.addEventListener("click",()=>{show(i);restart()});
    dots.appendChild(b);
    return b;
  });
  show(0);start();
}

document.getElementById("bbNext").addEventListener("click",()=>{next();restart()});
document.getElementById("bbPrev").addEventListener("click",()=>{show(index-1);restart()});
board.addEventListener("mouseenter",stop);
board.addEventListener("mouseleave",start);
board.addEventListener("focusin",stop);
board.addEventListener("focusout",start);
let x0=null;
board.addEventListener("touchstart",e=>{x0=e.touches[0].clientX},{passive:true});
board.addEventListener("touchend",e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>40){dx<0?next():show(index-1);restart()}});

setup();
fetch(API_BASE+"/api/billboard",{headers:{Accept:"application/json"}})
  .then(r=>r.ok?r.json():null)
  .then(d=>{if(d&&Array.isArray(d.slides)&&d.slides.length){buildSlides(d.slides);setup()}})
  .catch(()=>{}); // keep the built-in slides if the server can't be reached
})();
