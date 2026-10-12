(() => {
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const TOKEN_KEY="studmart_token";
const token=(()=>{try{return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)}catch{return null}})();
const STATUS_LABEL={none:"Not verified",pending:"Pending",approved:"Verified",rejected:"Rejected"};
let userTimer;

// Build DOM nodes instead of HTML strings, so user-written text can never inject markup
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
function notice(t){const x=$("#toast");x.textContent=t;x.classList.add("show");clearTimeout(notice.timer);notice.timer=setTimeout(()=>x.classList.remove("show"),3000)}
async function api(path,{method="GET",body}={}){
  let r;
  try{
    r=await fetch(API_BASE+path,{method,headers:{Accept:"application/json",Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  }catch{throw new Error("Can't reach the server. Check your connection.")}
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.message||`Request failed (${r.status})`);e.status=r.status;throw e}
  return d;
}
const money=n=>"₦"+Number(n).toLocaleString("en-NG");
const fmtDate=s=>s?new Date(s).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"}):"—";
const pill=status=>el("span",{class:`pill pill-${status}`,text:STATUS_LABEL[status]||status});

// ---------- verification requests ----------
function requestCard(u){
  const v=u.verification;
  return el("article",{class:"card-a"},
    el("div",{class:"ra-head"},
      el("div",{},el("b",{text:u.name}),el("small",{text:`${u.email} · ${u.school||"no school given"}`})),
      pill(v.status)),
    el("p",{class:"ra-note",text:v.note?`“${v.note}”`:"No note from the student."}),
    el("small",{class:"ra-meta",text:`Requested ${fmtDate(v.requestedAt)} · ${u.listingCount} listing(s)`}),
    el("div",{class:"ra-actions"},
      el("a",{class:"btn light",href:v.studentIdUrl,target:"_blank",rel:"noopener noreferrer",text:"View student ID ↗"}),
      el("button",{class:"btn dark",type:"button",text:"Approve",onclick:()=>decide(u,"approve")}),
      el("button",{class:"btn light danger",type:"button",text:"Reject",onclick:()=>decide(u,"reject")})));
}
async function loadPending(){
  const box=$("#tab-pending");
  box.replaceChildren(el("p",{class:"empty-a",text:"Loading…"}));
  try{
    const d=await api("/api/admin/users?status=pending");
    $("#pendingCount").textContent=d.users.length?`(${d.users.length})`:"";
    box.replaceChildren(...(d.users.length?d.users.map(requestCard):[el("p",{class:"empty-a",text:"No pending requests. You're all caught up."})]));
  }catch(err){box.replaceChildren(el("p",{class:"empty-a",text:`Couldn't load requests: ${err.message}`}))}
}

// ---------- all users ----------
function userRow(u){
  const s=u.verification.status;
  const actions=[];
  if(s!=="approved")actions.push(el("button",{type:"button",text:"Verify",onclick:()=>decide(u,"approve")}));
  if(s==="approved")actions.push(el("button",{type:"button",text:"Revoke",onclick:()=>decide(u,"revoke")}));
  if(s==="pending")actions.push(el("button",{type:"button",text:"Reject",onclick:()=>decide(u,"reject")}));
  return el("div",{class:"mrow"},
    el("div",{},el("b",{text:u.name}),el("small",{text:`${u.email} · ${u.school||"—"} · ${u.listingCount} listing(s) · joined ${fmtDate(u.createdAt)}`})),
    el("div",{class:"mrow-actions"},pill(s),...actions));
}
async function loadUsers(){
  const box=$("#userList");
  const params=new URLSearchParams();
  const q=$("#userSearch").value.trim(), status=$("#userStatus").value;
  if(q)params.set("q",q);
  if(status)params.set("status",status);
  box.replaceChildren(el("p",{class:"empty-a",text:"Loading…"}));
  try{
    const d=await api(`/api/admin/users?${params}`);
    box.replaceChildren(...(d.users.length?d.users.map(userRow):[el("p",{class:"empty-a",text:"No users match."})]));
  }catch(err){box.replaceChildren(el("p",{class:"empty-a",text:`Couldn't load users: ${err.message}`}))}
}

// Approve / reject / revoke, then refresh whichever list is showing
async function decide(u,action){
  if((action==="reject"||action==="revoke")&&!confirm(`${action==="reject"?"Reject":"Revoke"} verification for ${u.name}?`))return;
  try{
    const d=await api(`/api/admin/users/${u.id}/verification`,{method:"POST",body:{action}});
    notice(d.message);
    refreshVisible();
  }catch(err){notice(err.message)}
}

// ---------- listings ----------
function listingRow(l){
  return el("div",{class:"mrow"},
    el("div",{},el("b",{text:l.title}),el("small",{text:`${money(l.price)} · ${l.category} · ${l.status} · ${l.seller.name} (${l.seller.email})`})),
    el("div",{class:"mrow-actions"},el("button",{type:"button",class:"danger",text:"Remove",onclick:()=>removeListing(l)})));
}
async function loadListings(){
  const box=$("#listingList");
  box.replaceChildren(el("p",{class:"empty-a",text:"Loading…"}));
  try{
    const d=await api("/api/admin/listings");
    box.replaceChildren(...(d.listings.length?d.listings.map(listingRow):[el("p",{class:"empty-a",text:"No listings yet."})]));
  }catch(err){box.replaceChildren(el("p",{class:"empty-a",text:`Couldn't load listings: ${err.message}`}))}
}
async function removeListing(l){
  if(!confirm(`Remove "${l.title}" from STUDMART? The seller is not notified by the site.`))return;
  try{
    const d=await api(`/api/admin/listings/${l.id}`,{method:"DELETE"});
    notice(d.message);loadListings();
  }catch(err){notice(err.message)}
}

// ---------- tabs ----------
let currentTab="pending";
function showTab(name){
  currentTab=name;
  $$(".a-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  ["pending","users","listings","billboard"].forEach(t=>{$(`#tab-${t}`).hidden=t!==name});
  refreshVisible();
}
function refreshVisible(){
  if(currentTab==="pending")loadPending();
  else if(currentTab==="users")loadUsers();
  else if(currentTab==="billboard")loadBillboard();
  else loadListings();
}

// ---------- billboard editor ----------
const media=window.StudmartMedia;
const MAX_SLIDES=8;
const THEMES=[["orange","Orange"],["deep","Deep orange"],["amber","Amber (dark text)"],["crimson","Crimson"]];
let slides=[];
function blankSlide(){return {kicker:"",title:"",body:"",buttonText:"Learn more",buttonLink:"./shops.html",imageUrl:"",theme:"orange"}}
function moveSlide(i,d){const j=i+d;if(j<0||j>=slides.length)return;[slides[i],slides[j]]=[slides[j],slides[i]];renderEditor()}
function slideCard(s,i){
  const field=(label,node)=>el("label",{class:"bb-field"},label,node);
  const photoInput=el("input",{type:"file",accept:"image/jpeg,image/png,image/webp",onchange:async e=>{
    const file=e.target.files[0];if(!file)return;
    notice("Uploading photo…");
    try{s.imageUrl=await media.uploadImage(file,token);renderEditor();notice("Photo uploaded. Save to publish.")}
    catch(err){notice(err.message);e.target.value=""}
  }});
  return el("article",{class:"card-a"},
    el("div",{class:"bb-head"},el("b",{text:`Slide ${i+1}`}),el("div",{class:"mrow-actions"},
      el("button",{type:"button",text:"Up",disabled:i===0,onclick:()=>moveSlide(i,-1)}),
      el("button",{type:"button",text:"Down",disabled:i===slides.length-1,onclick:()=>moveSlide(i,1)}),
      el("button",{type:"button",class:"danger",text:"Remove",onclick:()=>{slides.splice(i,1);renderEditor()}}))),
    el("div",{class:"bb-grid"},
      field("Small label",el("input",{maxlength:"40",value:s.kicker,oninput:e=>{s.kicker=e.target.value}})),
      field("Title",el("input",{maxlength:"80",value:s.title,oninput:e=>{s.title=e.target.value}})),
      field("Text",el("textarea",{maxlength:"220",oninput:e=>{s.body=e.target.value}},s.body)),
      field("Button text",el("input",{maxlength:"30",value:s.buttonText,oninput:e=>{s.buttonText=e.target.value}})),
      field("Button link (e.g. ./shops.html, #market, or https://…)",el("input",{maxlength:"200",value:s.buttonLink,oninput:e=>{s.buttonLink=e.target.value}})),
      field("Colour",el("select",{onchange:e=>{s.theme=e.target.value}},...THEMES.map(([v,t])=>el("option",{value:v,selected:v===s.theme,text:t}))))),
    el("div",{class:"bb-photo"},
      s.imageUrl?el("img",{src:media.imgSrc(s.imageUrl),alt:"",class:"bb-thumb"}):el("span",{class:"bb-noimg",text:"No photo"}),
      photoInput,
      s.imageUrl?el("button",{type:"button",text:"Remove photo",onclick:()=>{s.imageUrl="";renderEditor()}}):null));
}
function renderEditor(){
  $("#bbEditor").replaceChildren(...(slides.length
    ?slides.map(slideCard)
    :[el("p",{class:"empty-a",text:"No slides saved. The home page is showing its built-in slides."})]));
}
async function loadBillboard(){
  try{
    const r=await fetch(API_BASE+"/api/billboard",{headers:{Accept:"application/json"}});
    const d=await r.json();
    slides=d.slides||[];
  }catch{notice("Couldn't load the billboard. Check your connection.")}
  renderEditor();
}
async function saveBillboard(){
  const btn=$("#bbSave");btn.disabled=true;
  try{
    const d=await api("/api/admin/billboard",{method:"PUT",body:{slides}});
    slides=d.slides||[];renderEditor();
    notice("Billboard saved. The home page is updated.");
  }catch(err){notice(err.message)}
  finally{btn.disabled=false}
}

// ---------- start: only admins get the dashboard ----------
function gate(title,text){
  const g=$("#gate");
  g.hidden=false;
  g.replaceChildren(el("h2",{text:title}),el("p",{text}),el("a",{class:"btn dark",href:"./index.html",text:"Go to STUDMART ↗"}));
}
async function init(){
  if(!token){gate("Log in first","Log in to STUDMART with an admin account, then come back to this page.");return}
  try{
    const d=await api("/api/auth/me");
    if(!d.user.isAdmin){gate("No admin access","This account isn't an admin. Admin access is set by the STUDMART team.");return}
    $("#adminName").textContent=`Signed in as ${d.user.name}`;
    $("#app").hidden=false;
    loadPending();
  }catch(err){
    if(err.status===401)gate("Session expired","Log in to STUDMART again, then come back to this page.");
    else gate("Couldn't load the dashboard",err.message);
  }
}

$$(".a-tabs button").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
$("#userSearch").addEventListener("input",()=>{clearTimeout(userTimer);userTimer=setTimeout(loadUsers,300)});
$("#userStatus").addEventListener("change",loadUsers);
$("#bbAdd").addEventListener("click",()=>{if(slides.length>=MAX_SLIDES){notice(`A billboard can have up to ${MAX_SLIDES} slides.`);return}slides.push(blankSlide());renderEditor()});
$("#bbSave").addEventListener("click",saveBillboard);
init();
})();
