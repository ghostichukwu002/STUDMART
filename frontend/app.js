(() => {
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const auth=$("#auth"), form=$("#authForm"), msg=$("#message"), toast=$("#toast");
const profile=$("#profile"), profileForm=$("#profileForm"), profileMsg=$("#profileMsg");
const passwordForm=$("#passwordForm"), passwordMsg=$("#passwordMsg");
const listingModal=$("#listingModal"), sellModal=$("#sellModal"), sellForm=$("#sellForm"), sellMsg=$("#sellMsg");
const resetModal=$("#resetModal"), resetForm=$("#resetForm"), resetMsg=$("#resetMsg");
const USER_KEY="studmart_user", TOKEN_KEY="studmart_token", GREEN="#50742a", RED="#9c493e";
const CAT_ICON={Electronics:"⌁",Books:"▤",Fashion:"✧",Hostel:"⌂"};
const CAT_BG={Electronics:"camera-bg",Books:"books-bg",Fashion:"shoes-bg",Hostel:"lamp-bg"};
let mode="login",timer,searchTimer;
let token=null;          // session token while the page is open
let user=null;           // signed-in user, as returned by the server
let category="All", searchTerm="";
let listings=[];         // what the grid currently shows (before the Saved filter)
let detail=null;         // listing open in the detail modal
let resetToken=null;
// ---------- click feedback ----------
// The element a click or form submit started. request() shows a spinner on it while the server answers.
let activeTrigger=null;
document.addEventListener("click",e=>{
  activeTrigger=e.target.closest("button,a.btn,.listing")||null;
  setTimeout(()=>{activeTrigger=null},0);
},true);
document.addEventListener("submit",e=>{
  activeTrigger=e.submitter||e.target.querySelector("[type=submit]")||null;
  setTimeout(()=>{activeTrigger=null},0);
},true);
function busyStart(el){
  if(!el||el.classList.contains("chip"))return ()=>{};
  el.classList.add("is-loading");el.setAttribute("aria-busy","true");
  if(el.tagName==="BUTTON")el.disabled=true;
  return ()=>{el.classList.remove("is-loading");el.removeAttribute("aria-busy");if(el.tagName==="BUTTON")el.disabled=false};
}
function skeletonCards(n){
  return Array.from({length:n},()=>el("article",{class:"listing skeleton","aria-hidden":"true"},
    el("div",{class:"listing-img"}),
    el("div",{class:"listing-body"},el("div",{class:"bar w40"}),el("div",{class:"bar w60"}),el("div",{class:"bar"}))));
}
const toastTarget={style:{},set textContent(t){notice(t)}}; // lets handleSessionError report to the toast

function notice(t){toast.textContent=t;toast.classList.add("show");clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove("show"),3000)}
const money=n=>"₦"+Number(n).toLocaleString("en-NG");
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

// ---------- session storage (browser-safe: storage can be blocked or throw) ----------
// The token and a copy of the user are stored together, in localStorage ("remember me") or sessionStorage.
function saveSession(t,u,remember){clearToken();try{const s=remember?localStorage:sessionStorage;s.setItem(TOKEN_KEY,t);s.setItem(USER_KEY,JSON.stringify(u))}catch{}}
function readSession(){
  try{
    const s=localStorage.getItem(TOKEN_KEY)?localStorage:sessionStorage;
    const t=s.getItem(TOKEN_KEY);
    if(!t)return null;
    let u=null;try{u=JSON.parse(s.getItem(USER_KEY)||"null")}catch{}
    return {token:t,user:u};
  }catch{return null}
}
function storeUser(u){
  try{const s=localStorage.getItem(TOKEN_KEY)?localStorage:sessionStorage;if(s.getItem(TOKEN_KEY))s.setItem(USER_KEY,JSON.stringify(u))}catch{}
}
function clearToken(){for(const s of [localStorage,sessionStorage]){try{s.removeItem(TOKEN_KEY);s.removeItem(USER_KEY)}catch{}}}

// ---------- API ----------
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const API_PATHS={login:"/api/auth/login",signup:"/api/auth/register",forgot:"/api/auth/forgot-password",reset:"/api/auth/reset-password",me:"/api/auth/me",profile:"/api/auth/profile",password:"/api/auth/change-password",listings:"/api/listings",myListings:"/api/me/listings",mySaved:"/api/me/saved"};
async function doRequest(path,{method="POST",body,auth:useAuth=false}={}){
  const headers={Accept:"application/json"};
  if(body!==undefined)headers["Content-Type"]="application/json";
  if(useAuth&&token)headers.Authorization=`Bearer ${token}`;
  let r;
  try{r=await fetch(API_BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}
  catch{throw new Error("we couldn't reach the STUDMART server. Check your connection and try again.")}
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.message||d.error||`Request failed (${r.status})`);e.status=r.status;throw e}
  return d;
}

async function request(path,opts){
  const done=busyStart(activeTrigger);
  try{return await doRequest(path,opts)}finally{done()}
}

// ---------- modals ----------
function openModal(m){m.classList.add("open");m.setAttribute("aria-hidden","false");document.body.style.overflow="hidden"}
function closeModal(m){m.classList.remove("open");m.setAttribute("aria-hidden","true");if(!document.querySelector(".auth.open"))document.body.style.overflow=""}

// ---------- session state ----------
function setSession(u){user=u;storeUser(u);render()}
function render(){
  const loggedIn=!!user;
  $("#guestActions").hidden=loggedIn;
  $("#userActions").hidden=!loggedIn;
  $("#marketFoot").hidden=loggedIn;
  if(loggedIn){
    const initials=`${(user.firstName||"")[0]||""}${(user.lastName||"")[0]||""}`.toUpperCase()||"S";
    $$(".js-initials").forEach(e=>e.textContent=initials);
    $(".js-first").textContent=user.firstName||"Account";
  }
}
function signOut(reason){
  token=null;user=null;clearToken();render();
  closeModal(profile);
  if(reason)notice(reason);
  loadListings();
}
// On page load: show the saved user straight away, then confirm the session with the server.
// Free hosting can take a minute to wake up, so a failed check is retried instead of logging the user out.
// Only a 401 (expired or invalid session) signs the user out.
async function restoreSession(attempt=0){
  const saved=readSession();
  if(!saved){render();loadListings();return}
  token=saved.token;
  if(saved.user&&attempt===0){user=saved.user;render()}
  try{
    const d=await request(API_PATHS.me,{method:"GET",auth:true});
    setSession(d.user);
    loadListings();
  }catch(err){
    if(err.status===401){signOut("Your session has ended. Please log in again.");return}
    if(attempt<8){
      setTimeout(()=>restoreSession(attempt+1),Math.min(3000*(attempt+1),15000));
    }else{
      render();loadListings();notice("Couldn't reach STUDMART. Refresh to try again.");
    }
  }
}
// Errors on signed-in actions: an expired session logs the user out, anything else is shown inline
function handleSessionError(err,target){
  if(err.status===401){signOut("Your session expired. Please log in again.");return}
  target.style.color=RED;target.textContent=err.message;
}

// ---------- login / sign-up ----------
function setMode(m){mode=m==="signup"?"signup":"login";$$(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));$("#names").style.display=mode==="signup"?"grid":"none";$("#school").style.display=mode==="signup"?"block":"none";$("#extras").style.display=mode==="login"?"flex":"none";$("#authTitle").innerHTML=mode==="signup"?"Your campus era<span>.</span>":"Good to see you<span>.</span>";$("#authSub").textContent=mode==="signup"?"Create your student account and get exploring.":"Log in to pick up where you left off.";$("#submitText").textContent=mode==="signup"?"Create my account":"Log in to STUDMART";$("#switchText").textContent=mode==="signup"?"Already part of the community?":"New around here?";$("#switchMode").textContent=mode==="signup"?"Log in":"Create an account";$("#password").autocomplete=mode==="signup"?"new-password":"current-password";msg.textContent=""}
function openAuth(m){setMode(m);auth.classList.add("open");auth.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";setTimeout(()=>(m==="signup"?$('input[name="firstName"]'):$('input[name="email"]'))?.focus({preventScroll:true}),180)}
function closeAuth(){auth.classList.remove("open");auth.setAttribute("aria-hidden","true");if(!document.querySelector(".auth.open"))document.body.style.overflow="";msg.textContent=""}

form.addEventListener("submit",async e=>{
  e.preventDefault();msg.textContent="";msg.style.color=RED;
  const d=Object.fromEntries(new FormData(form).entries());
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email||"")){msg.textContent="Please enter a valid email address.";return}
  if((d.password||"").length<6){msg.textContent="Your password must be at least 6 characters.";return}
  if(mode==="signup"&&(!d.firstName?.trim()||!d.lastName?.trim()||!d.school?.trim())){msg.textContent="Please complete your name and school/campus.";return}
  const btn=$(".submit");btn.disabled=true;$("#submitText").textContent=mode==="signup"?"Creating account…":"Logging in…";
  try{
    const payload=mode==="signup"
      ?{firstName:d.firstName.trim(),lastName:d.lastName.trim(),email:d.email.trim(),password:d.password,school:d.school.trim()}
      :{email:d.email.trim(),password:d.password};
    const result=await request(API_PATHS[mode],{body:payload});
    if(!result.token||!result.user)throw new Error("the server didn't return a session. Please try again.");
    const remember=!!form.querySelector(".remember input")?.checked;
    saveSession(result.token,result.user,remember);token=result.token;setSession(result.user);
    msg.style.color=GREEN;msg.textContent=result.message||(mode==="signup"?"Account created successfully!":"Logged in successfully!");
    notice(msg.textContent);
    loadListings();
    setTimeout(closeAuth,1000);
  }catch(err){
    msg.textContent=err.status===404?"The server doesn't have this sign-in route yet. Check the backend deployment.":`Could not ${mode==="signup"?"create your account":"log you in"}: ${err.message}`;
  }finally{btn.disabled=false;$("#submitText").textContent=mode==="signup"?"Create my account":"Log in to STUDMART"}
});
$("#forgot").addEventListener("click",async()=>{
  const email=$('input[name="email"]').value.trim();
  if(!email){msg.style.color=RED;msg.textContent="Enter your email address first.";return}
  try{const r=await request(API_PATHS.forgot,{body:{email}});msg.style.color=GREEN;msg.textContent=r.message||"If an account exists, reset instructions will be sent."}
  catch(err){msg.style.color=RED;msg.textContent=`Password reset is not available right now: ${err.message}`}
});

// ---------- choose a new password (opened from the emailed link: site.com/#reset=TOKEN) ----------
function checkResetLink(){
  const m=location.hash.match(/^#reset=([a-f0-9]{64})$/);
  if(!m)return;
  resetToken=m[1];resetMsg.textContent="";resetForm.reset();openModal(resetModal);
}
resetForm.addEventListener("submit",async e=>{
  e.preventDefault();resetMsg.textContent="";
  const f=resetForm.elements;
  if(f.password.value.length<6){resetMsg.style.color=RED;resetMsg.textContent="Your password must be at least 6 characters.";return}
  if(f.password.value!==f.confirm.value){resetMsg.style.color=RED;resetMsg.textContent="The passwords don't match.";return}
  try{
    const d=await request(API_PATHS.reset,{body:{token:resetToken,password:f.password.value}});
    resetMsg.style.color=GREEN;resetMsg.textContent=d.message||"Password updated.";
    history.replaceState(null,"",location.pathname+location.search);
    setTimeout(()=>{closeModal(resetModal);openAuth("login")},1500);
  }catch(err){resetMsg.style.color=RED;resetMsg.textContent=err.message}
});

// ---------- profile ----------
function fillProfileForm(){
  if(!user)return;
  const f=profileForm.elements;
  f.firstName.value=user.firstName||"";f.lastName.value=user.lastName||"";
  f.school.value=user.school||"";f.bio.value=user.bio||"";
  $("#profileEmail").textContent=user.email||"";
}
function openProfile(){
  if(!user){openAuth("login");return}
  fillProfileForm();profileMsg.textContent="";passwordMsg.textContent="";passwordForm.reset();
  openModal(profile);
  loadMyListings();
  setTimeout(()=>profileForm.elements.firstName.focus({preventScroll:true}),180);
}
profileForm.addEventListener("submit",async e=>{
  e.preventDefault();profileMsg.textContent="";
  const f=profileForm.elements;
  const body={firstName:f.firstName.value.trim(),lastName:f.lastName.value.trim(),school:f.school.value.trim(),bio:f.bio.value.trim()};
  if(!body.firstName||!body.lastName||!body.school){profileMsg.style.color=RED;profileMsg.textContent="Please fill in your name and school.";return}
  const btn=profileForm.querySelector("button[type=submit]");btn.disabled=true;btn.querySelector("span").textContent="Saving…";
  try{
    const d=await request(API_PATHS.profile,{method:"PATCH",body,auth:true});
    setSession(d.user);fillProfileForm();
    profileMsg.style.color=GREEN;profileMsg.textContent=d.message||"Profile saved.";notice("Profile saved.");
  }catch(err){handleSessionError(err,profileMsg)}
  finally{btn.disabled=false;btn.querySelector("span").textContent="Save profile"}
});
passwordForm.addEventListener("submit",async e=>{
  e.preventDefault();passwordMsg.textContent="";
  const f=passwordForm.elements;
  const currentPassword=f.currentPassword.value,newPassword=f.newPassword.value;
  if(newPassword.length<6){passwordMsg.style.color=RED;passwordMsg.textContent="Your new password must be at least 6 characters.";return}
  try{
    const d=await request(API_PATHS.password,{body:{currentPassword,newPassword},auth:true});
    passwordForm.reset();passwordMsg.style.color=GREEN;passwordMsg.textContent=d.message||"Password changed.";
  }catch(err){handleSessionError(err,passwordMsg)}
});
function logout(){signOut("You've been logged out.")}

// ---------- listings: grid, filters, search ----------
function stateMsg(t){return el("p",{class:"grid-state",text:t})}
function listingCard(l){
  const img=el("div",{class:`listing-img ${CAT_BG[l.category]||"camera-bg"}`},
    el("span",{class:"condition",text:l.condition.toUpperCase()}),
    l.status==="sold"?el("span",{class:"condition sold-tag",text:"SOLD"}):null,
    el("button",{class:`save${l.saved?" saved":""}`,type:"button",text:l.saved?"♥":"♡","aria-label":l.saved?"Remove from saved":"Save listing",onclick:e=>{e.stopPropagation();toggleSave(l)}}),
    l.imageUrl?el("img",{src:l.imageUrl,alt:"",loading:"lazy",referrerpolicy:"no-referrer"}):el("div",{class:"cat-icon",text:CAT_ICON[l.category]||"✳"}));
  return el("article",{class:`listing reveal visible${l.status==="sold"?" sold":""}`,tabindex:"0",role:"button",onclick:()=>openListing(l.id),
      onkeydown:e=>{if(e.key==="Enter")openListing(l.id)}},
    img,
    el("div",{class:"listing-body"},
      el("small",{text:`${l.category} · ${l.seller.name}`}),
      el("h3",{text:l.title}),
      el("div",{},el("b",{text:money(l.price)}),el("span",{text:`● ${l.pickup}`}))));
}
function renderGrid(){
  const visible=category==="Saved"?listings.filter(l=>l.saved):listings;
  const grid=$("#grid");
  if(!visible.length){
    grid.replaceChildren(stateMsg(category==="Saved"
      ?"Nothing saved yet. Tap ♡ on a listing to keep it here."
      :searchTerm?"No listings match your search."
      :"No listings here yet. Be the first to sell something!"));
    return;
  }
  grid.replaceChildren(...visible.map(listingCard));
}
async function loadListings(){
  const grid=$("#grid");
  if(category==="Saved"&&!user){listings=[];grid.replaceChildren(stateMsg("Log in to see your saved finds."));return}
  grid.replaceChildren(...skeletonCards(8));
  try{
    if(category==="Saved"){
      listings=(await request(API_PATHS.mySaved,{method:"GET",auth:true})).listings;
    }else{
      const params=new URLSearchParams();
      if(category!=="All")params.set("category",category);
      if(searchTerm)params.set("q",searchTerm);
      listings=(await request(`${API_PATHS.listings}?${params}`,{method:"GET",auth:true})).listings;
    }
    renderGrid();
  }catch(err){
    grid.replaceChildren(stateMsg(`Couldn't load listings: ${err.message}`));
  }
}
async function toggleSave(l){
  if(!user){openAuth("login");return}
  try{
    const d=await request(`${API_PATHS.listings}/${l.id}/save`,{method:"POST",auth:true});
    l.saved=d.saved;
    if(detail&&detail.id===l.id)fillDetailSave();
    renderGrid();
    notice(d.saved?"Saved to your finds.":"Removed from saved.");
  }catch(err){handleSessionError(err,toastTarget)}
}

// ---------- listing detail ----------
function contactLink(contact){
  if(!contact)return null;
  const digits=contact.replace(/\D/g,"");
  if(digits.length<7||!/^[+\d\s()-]+$/.test(contact))return null;
  const intl=digits.startsWith("0")?"234"+digits.slice(1):digits;
  return `https://wa.me/${intl}`;
}
function fillDetailSave(){
  const b=$("#lmSave");
  b.textContent=detail.saved?"♥ Saved":"♡ Save";
}
async function openListing(id){
  try{
    const d=await request(`${API_PATHS.listings}/${id}`,{method:"GET",auth:true});
    detail=d.listing;
    const l=detail;
    const img=$("#lmImg");
    img.className=`lm-img ${CAT_BG[l.category]||"camera-bg"}`;
    img.replaceChildren(l.imageUrl?el("img",{src:l.imageUrl,alt:"",referrerpolicy:"no-referrer"}):el("div",{class:"cat-icon",text:CAT_ICON[l.category]||"✳"}));
    $("#lmCat").textContent=`${l.category} · ${l.condition}${l.status==="sold"?" · SOLD":""}`;
    $("#lmTitle").textContent=l.title;
    $("#lmPrice").textContent=money(l.price);
    $("#lmFacts").replaceChildren(el("span",{text:`📍 ${l.pickup}`}),el("span",{text:`Condition: ${l.condition}`}));
    $("#lmDesc").textContent=l.description;
    $("#lmSeller").textContent=`Sold by ${l.seller.name}${l.seller.school?` · ${l.seller.school}`:""}`;
    fillDetailSave();
    const wa=contactLink(l.contact);
    const c=$("#lmContact");
    if(wa){c.href=wa;c.hidden=false}else c.hidden=true;
    $("#lmSave").hidden=!!l.isOwner;
    $("#lmOwner").hidden=!l.isOwner;
    $("#lmSold").textContent=l.status==="sold"?"Mark available":"Mark sold";
    openModal(listingModal);
  }catch(err){notice(`Couldn't open listing: ${err.message}`)}
}
$("#lmSave").addEventListener("click",()=>{if(detail)toggleSave(detail)});
$("#lmEdit").addEventListener("click",()=>{const l=detail;closeModal(listingModal);openSell(l)});
$("#lmSold").addEventListener("click",()=>{if(detail)setStatus(detail,detail.status==="sold"?"active":"sold")});
$("#lmDelete").addEventListener("click",()=>{if(detail)removeListing(detail)});

async function setStatus(l,status){
  try{
    const d=await request(`${API_PATHS.listings}/${l.id}`,{method:"PATCH",body:{status},auth:true});
    Object.assign(l,d.listing);
    notice(status==="sold"?"Marked as sold.":"Listing is available again.");
    loadListings();loadMyListings();
    if(detail&&detail.id===l.id)openListing(l.id);
  }catch(err){handleSessionError(err,toastTarget)}
}
async function removeListing(l){
  if(!confirm(`Delete "${l.title}"? This can't be undone.`))return;
  try{
    await request(`${API_PATHS.listings}/${l.id}`,{method:"DELETE",auth:true});
    closeModal(listingModal);notice("Listing deleted.");
    loadListings();loadMyListings();
  }catch(err){handleSessionError(err,toastTarget)}
}

// ---------- sell / edit ----------
function openSell(l){
  if(!user){openAuth("login");return}
  sellForm.reset();
  const f=sellForm.elements;
  f.listingId.value=l?l.id:"";
  $("#sellTitle").textContent=l?"Edit listing":"Sell an item";
  $("#sellSubmit span").textContent=l?"Save changes":"Post listing";
  if(l){
    f.title.value=l.title;f.category.value=l.category;f.condition.value=l.condition;
    f.price.value=l.price;f.pickup.value=l.pickup;f.contact.value=l.contact||"";
    f.imageUrl.value=l.imageUrl||"";f.description.value=l.description;
  }
  sellMsg.textContent="";
  openModal(sellModal);
  setTimeout(()=>f.title.focus({preventScroll:true}),180);
}
$("#sellBtn").addEventListener("click",()=>openSell());
$("#dockSell").addEventListener("click",()=>openSell());
$("#dockSaved").addEventListener("click",()=>{
  if(!user){openAuth("login");return}
  $('.chip[data-cat="Saved"]').click();
  $("#market").scrollIntoView({behavior:"smooth"});
});
sellForm.addEventListener("submit",async e=>{
  e.preventDefault();sellMsg.textContent="";sellMsg.style.color=RED;
  const f=sellForm.elements;
  const body={title:f.title.value.trim(),category:f.category.value,condition:f.condition.value,price:f.price.value,
    pickup:f.pickup.value.trim(),contact:f.contact.value.trim(),imageUrl:f.imageUrl.value.trim(),description:f.description.value.trim()};
  const id=f.listingId.value;
  const btn=$("#sellSubmit");btn.disabled=true;
  try{
    const d=id
      ?await request(`${API_PATHS.listings}/${id}`,{method:"PATCH",body,auth:true})
      :await request(API_PATHS.listings,{body,auth:true});
    closeModal(sellModal);notice(id?"Listing updated.":"Your listing is live.");
    if(category==="Saved")category="All",$$(".chip").forEach(c=>c.classList.toggle("active",c.dataset.cat==="All"));
    loadListings();loadMyListings();
  }catch(err){handleSessionError(err,sellMsg)}
  finally{btn.disabled=false}
});

// ---------- your listings (inside the profile panel) ----------
async function loadMyListings(){
  const box=$("#myListings");
  if(!user){box.replaceChildren();return}
  box.replaceChildren(el("p",{class:"empty",text:"Loading…"}));
  try{
    const d=await request(API_PATHS.myListings,{method:"GET",auth:true});
    if(!d.listings.length){box.replaceChildren(el("p",{class:"empty",text:"You haven't posted anything yet."}));return}
    box.replaceChildren(...d.listings.map(l=>el("div",{class:"mrow"},
      el("div",{},el("b",{text:l.title}),el("small",{text:`${money(l.price)} · ${l.status==="sold"?"Sold":"Active"}`})),
      el("div",{class:"mrow-actions"},
        el("button",{type:"button",text:"Edit",onclick:()=>openSell(l)}),
        el("button",{type:"button",text:l.status==="sold"?"Reopen":"Mark sold",onclick:()=>setStatus(l,l.status==="sold"?"active":"sold")}),
        el("button",{type:"button",text:"Delete",onclick:()=>removeListing(l)})))));
  }catch(err){
    box.replaceChildren(el("p",{class:"empty",text:`Couldn't load your listings: ${err.message}`}));
  }
}

// ---------- wiring ----------
$$("[data-auth]").forEach(b=>b.addEventListener("click",()=>user?openProfile():openAuth(b.dataset.auth)));
$$("[data-close]").forEach(b=>b.addEventListener("click",closeAuth));
$$("[data-close-profile],[data-close-modal]").forEach(b=>b.addEventListener("click",()=>closeModal(b.closest(".auth"))));
$$(".tabs button").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
$("#switchMode").addEventListener("click",()=>setMode(mode==="login"?"signup":"login"));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeAuth();$$(".auth.open").forEach(closeModal)}});
$("#showPass").addEventListener("click",()=>{const p=$("#password");p.type=p.type==="password"?"text":"password";$("#showPass").textContent=p.type==="password"?"Show":"Hide"});
$("#openProfile").addEventListener("click",openProfile);
$("#logout").addEventListener("click",logout);
$("#logoutProfile").addEventListener("click",logout);
$("#hamb").addEventListener("click",()=>$("#navLinks").classList.toggle("open"));$("#navLinks").querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>$("#navLinks").classList.remove("open")));
$$(".chip").forEach(c=>c.addEventListener("click",()=>{
  if(c.dataset.cat==="Saved"&&!user){openAuth("login");return}
  category=c.dataset.cat;
  $$(".chip").forEach(x=>x.classList.toggle("active",x===c));
  loadListings();
}));
$("#search").addEventListener("input",e=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{searchTerm=e.target.value.trim();loadListings()},300);
});
if("IntersectionObserver"in window){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("visible");io.unobserve(e.target)}}),{threshold:.08});$$(".reveal").forEach((el,i)=>{el.style.transitionDelay=`${i%4*60}ms`;io.observe(el)})}else $$(".reveal").forEach(e=>e.classList.add("visible"));
$("#google").addEventListener("click",()=>notice("Google sign-in needs your STUDMART Firebase Authentication configuration."));
window.addEventListener("hashchange",checkResetLink);

window.STUDMART={openLogin:()=>openAuth("login"),openSignup:()=>openAuth("signup"),openProfile,openSell,logout,closeAuth};
checkResetLink();
restoreSession();
})();
