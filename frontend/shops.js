(() => {
const $=s=>document.querySelector(s);
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const TOKEN_KEY="studmart_token";
const token=(()=>{try{return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)}catch{return null}})();
const CAT_ICON={Electronics:"⌁",Books:"▤",Fashion:"✧",Hostel:"⌂"};
let toastTimer;

// Build DOM nodes from data (never innerHTML with shop or listing text)
function el(tag,props={},...kids){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(props)){
    if(v===undefined||v===null||v===false)continue;
    if(k==="class")n.className=v;
    else if(k==="text")n.textContent=v;
    else if(k.startsWith("on"))n.addEventListener(k.slice(2),v);
    else n.setAttribute(k,v===true?"":v);
  }
  for(const kid of kids.flat()){if(kid!==null&&kid!==undefined&&kid!==false)n.append(kid.nodeType?kid:document.createTextNode(String(kid)))}
  return n;
}
function notice(t){const x=$("#toast");x.textContent=t;x.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove("show"),3000)}
const money=n=>"₦"+Number(n).toLocaleString("en-NG");
const tick=v=>v?el("span",{class:"tick",title:"Verified student","aria-label":"Verified student",text:"✓"}):null;

async function api(path){
  let r;
  try{r=await fetch(API_BASE+path,{headers:{Accept:"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}})}
  catch{throw new Error("we couldn't reach the STUDMART server. Check your connection.")}
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.message||`Request failed (${r.status})`);e.status=r.status;throw e}
  return d;
}
// WhatsApp link from a Nigerian number, same rule as the marketplace
function whatsapp(phone){
  if(!phone)return null;
  const digits=phone.replace(/\D/g,"");
  if(digits.length<7||!/^[+\d\s()-]+$/.test(phone))return null;
  return `https://wa.me/${digits.startsWith("0")?"234"+digits.slice(1):digits}`;
}

// ---------- directory ----------
async function loadDirectory(){
  const grid=$("#shopGrid");
  grid.replaceChildren(el("p",{class:"shop-empty",text:"Loading shops…"}));
  try{
    const d=await api("/api/shops");
    if(!d.shops.length){grid.replaceChildren(el("p",{class:"shop-empty",text:"No shops yet. Open the first one on campus!"}));return}
    grid.replaceChildren(...d.shops.map(s=>el("a",{class:"shop-card",href:`./shops.html?id=${encodeURIComponent(s.id)}`},
      el("div",{class:"mark",text:(s.name||"S")[0].toUpperCase()}),
      el("h2",{},s.name,tick(s.verified)),
      el("small",{text:s.address}),
      el("small",{text:s.school||""}),
      el("div",{class:"count",text:`${s.listingCount} item${s.listingCount===1?"":"s"} for sale`}))));
  }catch(err){grid.replaceChildren(el("p",{class:"shop-empty",text:`Couldn't load shops: ${err.message}`}))}
}

// ---------- one shop ----------
function renderHead(s){
  const wa=whatsapp(s.phone);
  $("#shopHead").replaceChildren(
    el("div",{class:"eyebrow",text:"SHOP"}),
    el("h1",{},s.name,tick(s.verified)),
    el("div",{class:"meta",text:[s.address,s.school].filter(Boolean).join(" · ")}),
    s.description?el("p",{text:s.description}):null,
    wa?el("a",{class:"btn dark",href:wa,target:"_blank",rel:"noopener",text:"WhatsApp the shop ↗"}):null);
}
function listingTile(l){
  return el("a",{class:"listing",href:`./index.html?listing=${encodeURIComponent(l.id)}`},
    el("div",{class:"listing-img",style:"position:relative"},
      l.imageUrl?el("img",{src:l.imageUrl,alt:"",loading:"lazy",referrerpolicy:"no-referrer"}):el("span",{text:CAT_ICON[l.category]||"✳"})),
    el("div",{class:"listing-body"},
      el("small",{text:l.category}),
      el("h3",{text:l.title}),
      el("div",{},el("b",{text:money(l.price)}),l.status==="sold"?el("span",{class:"sold-note",text:"SOLD"}):null)));
}
async function loadShop(id){
  $("#dirView").hidden=true;$("#shopView").hidden=false;
  const grid=$("#shopListings");
  grid.replaceChildren(el("p",{class:"shop-empty",text:"Loading…"}));
  try{
    const d=await api(`/api/shops/${encodeURIComponent(id)}`);
    document.title=`${d.shop.name} · STUDMART`;
    renderHead(d.shop);
    grid.replaceChildren(...(d.listings.length?d.listings.map(listingTile):[el("p",{class:"shop-empty",text:"This shop has nothing listed yet."})]));
  }catch(err){
    $("#shopHead").replaceChildren();
    grid.replaceChildren(el("p",{class:"shop-empty",text:err.status===404?"We couldn't find that shop.":`Couldn't load this shop: ${err.message}`}));
  }
}

const id=new URLSearchParams(location.search).get("id");
if(id&&/^[0-9a-f-]{36}$/.test(id))loadShop(id);
else loadDirectory();
})();
