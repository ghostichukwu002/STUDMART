(() => {
const $=s=>document.querySelector(s);
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const TOKEN_KEY="studmart_token", USER_KEY="studmart_user";
const readToken=()=>{try{return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)}catch{return null}};
let token=readToken(), user=null, toastTimer;

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
const devBadge=v=>v?el("span",{class:"dev-badge",title:"STUDMART developer","aria-label":"STUDMART developer",text:"✓"}):null;

async function api(path,{method="GET",body}={}){
  let r;
  try{r=await fetch(API_BASE+path,{method,headers:{Accept:"application/json",Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined})}
  catch{throw new Error("We couldn't reach the STUDMART server. Check your connection.")}
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.message||`Request failed (${r.status})`);e.status=r.status;throw e}
  return d;
}
function gate(title,text){
  const g=$("#gate");
  g.replaceChildren(el("h2",{text:title}),el("p",{text}),el("a",{class:"btn dark",href:"./index.html",text:"Go to STUDMART ↗"}));
  g.hidden=false;
}
function row(label,value){return value?[el("dt",{text:label}),el("dd",{text:value})]:[]}

function renderWho(){
  const shop=user.accountType==="shop"&&user.shop;
  const initials=shop?(user.shop.name||"S")[0].toUpperCase():`${(user.firstName||"")[0]||""}${(user.lastName||"")[0]||""}`.toUpperCase()||"S";
  $("#whoCard").replaceChildren(
    el("div",{class:"acct-who"},el("div",{class:"acct-avatar"},user.avatarUrl?el("img",{src:StudmartMedia.imgSrc(user.avatarUrl),alt:""}):initials),
      el("div",{},el("b",{},shop?user.shop.name:`${user.firstName} ${user.lastName}`,devBadge(user.developer)),
        el("small",{text:user.email}),el("br"),
        el("span",{class:"acct-tag",text:shop?"SHOP ACCOUNT":"PERSONAL ACCOUNT"}))),
    el("dl",{class:"acct-row"},
      ...(shop
        ?[...row("Owner",`${user.firstName} ${user.lastName}`),...row("Shop address",user.shop.address),...row("WhatsApp",user.shop.phone),...row("About",user.shop.description)]
        :[...row("School",user.school),...row("Bio",user.bio)])));
  if(!shop&&!user.bio&&!user.school)$("#whoCard").append(el("p",{class:"empty",text:"Add your school and a short bio in Edit profile so buyers know who you are."}));
}

// Verification is for personal (student) accounts only
function renderVerify(){
  const card=$("#verifyCard");
  if(user.accountType==="shop"){card.hidden=true;return}
  card.hidden=false;
  const status=(user.verification||{}).status||"none";
  if(status==="approved"){card.replaceChildren(el("h2",{text:"Student verification"}),el("p",{class:"verify-state ok"},tick(true),"Your account is verified. Buyers see a blue tick on your listings."));return}
  if(status==="pending"){card.replaceChildren(el("h2",{text:"Student verification"}),el("p",{class:"verify-state",text:"Your student verification is under review. We'll email you once it's decided."}));return}
  const vMsg=el("p",{class:"msg"});
  if(status==="rejected")vMsg.textContent="Your last request wasn't approved. You can send a new one with a clearer student ID link.";
  const url=el("input",{name:"studentIdUrl",type:"url",maxlength:"500",placeholder:"https://… link to a photo of your student ID"});
  const note=el("textarea",{name:"note",maxlength:"300",placeholder:"Anything that helps us match you (optional)"});
  const form=el("form",{novalidate:true,onsubmit:async e=>{
    e.preventDefault();vMsg.textContent="";vMsg.style.color="#9c493e";
    const studentIdUrl=url.value.trim();
    if(!/^https:\/\//.test(studentIdUrl)){vMsg.textContent="Please paste an https:// link to your student ID.";return}
    try{
      const d=await api("/api/verification",{method:"POST",body:{studentIdUrl,note:note.value.trim()}});
      user=d.user;localStorage.setItem(USER_KEY,JSON.stringify(user));renderVerify();notice(d.message||"Verification request sent.");
    }catch(err){vMsg.textContent=err.message}
  }},
    el("p",{class:"verify-state",text:"Get a blue tick by proving you're a student. Upload your student ID to a link you control (for example Google Drive) and paste it here. Only STUDMART admins see it."}),
    el("label",{},"Student ID link",url),
    el("label",{},"Note (optional)",note),
    el("button",{class:"btn dark",type:"submit"},el("span",{text:"Request verification"}),el("b",{text:"↗"})),
    vMsg);
  card.replaceChildren(el("h2",{text:"Student verification"}),form);
}

async function loadMyListings(){
  const box=$("#myListings");
  try{
    const d=await api("/api/me/listings");
    if(!d.listings.length){box.replaceChildren(el("p",{class:"empty",text:"You haven't posted anything yet. Use Sell an item on the marketplace."}));return}
    box.replaceChildren(...d.listings.map(l=>el("div",{class:"mrow"},
      el("div",{},el("b",{text:l.title}),el("small",{text:`${money(l.price)} · ${l.status==="sold"?"Sold":"Active"}`})),
      el("div",{class:"mrow-actions"},
        el("a",{href:`./index.html?listing=${encodeURIComponent(l.id)}`,text:"Edit"}),
        el("button",{type:"button",text:l.status==="sold"?"Reopen":"Mark sold",onclick:()=>setStatus(l,l.status==="sold"?"active":"sold")}),
        el("button",{type:"button",class:"danger",text:"Delete",onclick:()=>removeListing(l)})))));
  }catch(err){box.replaceChildren(el("p",{class:"empty",text:`Couldn't load your listings: ${err.message}`}))}
}
async function setStatus(l,status){
  try{await api(`/api/listings/${l.id}`,{method:"PATCH",body:{status}});notice(status==="sold"?"Marked as sold.":"Listing is available again.");loadMyListings()}
  catch(err){notice(err.message)}
}
async function removeListing(l){
  if(!confirm(`Delete "${l.title}"? This can't be undone.`))return;
  try{await api(`/api/listings/${l.id}`,{method:"DELETE"});notice("Listing deleted.");loadMyListings()}
  catch(err){notice(err.message)}
}

$("#logoutBtn").addEventListener("click",()=>{
  try{for(const s of [localStorage,sessionStorage]){s.removeItem(TOKEN_KEY);s.removeItem(USER_KEY)}}catch{}
  location.href="./index.html";
});

async function init(){
  if(!token){gate("Log in first","Log in to STUDMART to see your profile.");return}
  try{
    const d=await api("/api/auth/me");
    user=d.user;
    renderWho();renderVerify();loadMyListings();
    $("#view").hidden=false;
  }catch(err){
    if(err.status===401)gate("Your session has ended","Log in to STUDMART again to see your profile.");
    else gate("Couldn't load your profile",err.message);
  }
}
init();
})();
