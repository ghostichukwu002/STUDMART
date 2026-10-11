(() => {
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const auth=$("#auth"), form=$("#authForm"), msg=$("#message"), toast=$("#toast");
const profile=$("#profile"), profileForm=$("#profileForm"), profileMsg=$("#profileMsg");
const passwordForm=$("#passwordForm"), passwordMsg=$("#passwordMsg");
const TOKEN_KEY="studmart_token", GREEN="#50742a", RED="#9c493e";
let mode="login",timer;
let token=null; // session token while the page is open
let user=null;  // signed-in user, as returned by the server

function notice(t){toast.textContent=t;toast.classList.add("show");clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove("show"),3000)}

// ---------- session storage (browser-safe: storage can be blocked or throw) ----------
function saveToken(t,remember){clearToken();try{(remember?localStorage:sessionStorage).setItem(TOKEN_KEY,t)}catch{}}
function readToken(){try{return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)}catch{return null}}
function clearToken(){try{localStorage.removeItem(TOKEN_KEY)}catch{}try{sessionStorage.removeItem(TOKEN_KEY)}catch{}}

// ---------- API ----------
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const API_PATHS={login:"/api/auth/login",signup:"/api/auth/register",forgot:"/api/auth/forgot-password",me:"/api/auth/me",profile:"/api/auth/profile",password:"/api/auth/change-password"};
async function request(path,{method="POST",body,auth:useAuth=false}={}){
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

// ---------- session state ----------
function setSession(u){user=u;render()}
function render(){
  const loggedIn=!!user;
  $("#guestActions").hidden=loggedIn;
  $("#userActions").hidden=!loggedIn;
  if(loggedIn){
    const initials=`${(user.firstName||"")[0]||""}${(user.lastName||"")[0]||""}`.toUpperCase()||"S";
    $$(".js-initials").forEach(el=>el.textContent=initials);
    $(".js-first").textContent=user.firstName||"Account";
  }
}
function signOut(reason){
  token=null;user=null;clearToken();render();closeProfile();
  if(reason)notice(reason);
}
async function restoreSession(){
  const saved=readToken();
  if(!saved){render();return}
  token=saved;
  try{const d=await request(API_PATHS.me,{method:"GET",auth:true});setSession(d.user)}
  catch(err){if(err.status===401)signOut();else render()}
}
// Errors on signed-in actions: an expired session logs the user out, anything else is shown inline
function handleSessionError(err,el){
  if(err.status===401){signOut("Your session expired. Please log in again.");return}
  el.style.color=RED;el.textContent=err.message;
}

// ---------- login / sign-up modal ----------
function setMode(m){mode=m==="signup"?"signup":"login";$$(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));$("#names").style.display=mode==="signup"?"grid":"none";$("#school").style.display=mode==="signup"?"block":"none";$("#extras").style.display=mode==="login"?"flex":"none";$("#authTitle").innerHTML=mode==="signup"?"Your campus era<span>.</span>":"Good to see you<span>.</span>";$("#authSub").textContent=mode==="signup"?"Create your student account and get exploring.":"Log in to pick up where you left off.";$("#submitText").textContent=mode==="signup"?"Create my account":"Log in to STUDMART";$("#switchText").textContent=mode==="signup"?"Already part of the community?":"New around here?";$("#switchMode").textContent=mode==="signup"?"Log in":"Create an account";$("#password").autocomplete=mode==="signup"?"new-password":"current-password";msg.textContent=""}
function openAuth(m){setMode(m);auth.classList.add("open");auth.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";setTimeout(()=>(m==="signup"?$('input[name="firstName"]'):$('input[name="email"]'))?.focus({preventScroll:true}),180)}
function closeAuth(){auth.classList.remove("open");auth.setAttribute("aria-hidden","true");document.body.style.overflow="";msg.textContent=""}

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
    saveToken(result.token,remember);token=result.token;setSession(result.user);
    msg.style.color=GREEN;msg.textContent=result.message||(mode==="signup"?"Account created successfully!":"Logged in successfully!");
    notice(msg.textContent);
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

// ---------- profile modal ----------
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
  profile.classList.add("open");profile.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
  setTimeout(()=>profileForm.elements.firstName.focus({preventScroll:true}),180);
}
function closeProfile(){
  profile.classList.remove("open");profile.setAttribute("aria-hidden","true");
  if(!auth.classList.contains("open"))document.body.style.overflow="";
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
  const currentPassword=f.currentPassword.value, newPassword=f.newPassword.value;
  if(newPassword.length<6){passwordMsg.style.color=RED;passwordMsg.textContent="Your new password must be at least 6 characters.";return}
  try{
    const d=await request(API_PATHS.password,{body:{currentPassword,newPassword},auth:true});
    passwordForm.reset();passwordMsg.style.color=GREEN;passwordMsg.textContent=d.message||"Password changed.";
  }catch(err){handleSessionError(err,passwordMsg)}
});
function logout(){signOut("You've been logged out.")}

// ---------- wiring ----------
$$("[data-auth]").forEach(b=>b.addEventListener("click",()=>user?openProfile():openAuth(b.dataset.auth)));
$$("[data-close]").forEach(b=>b.addEventListener("click",closeAuth));
$$("[data-close-profile]").forEach(b=>b.addEventListener("click",closeProfile));
$$(".tabs button").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
$("#switchMode").addEventListener("click",()=>setMode(mode==="login"?"signup":"login"));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeAuth();closeProfile()}});
$("#showPass").addEventListener("click",()=>{const p=$("#password");p.type=p.type==="password"?"text":"password";$("#showPass").textContent=p.type==="password"?"Show":"Hide"});
$("#openProfile").addEventListener("click",openProfile);
$("#logout").addEventListener("click",logout);
$("#logoutProfile").addEventListener("click",logout);
$("#hamb").addEventListener("click",()=>$("#navLinks").classList.toggle("open"));$("#navLinks").querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>$("#navLinks").classList.remove("open")));
$$(".chip").forEach(c=>c.addEventListener("click",()=>{$$(".chip").forEach(x=>x.classList.toggle("active",x===c));$$(".listing").forEach(card=>card.hidden=c.dataset.cat!=="All"&&card.dataset.cat!==card.dataset.category)}));
$$(".save").forEach(b=>b.addEventListener("click",()=>{b.classList.toggle("saved");b.textContent=b.classList.contains("saved")?"♥":"♡";notice(b.classList.contains("saved")?"Saved in this preview. Log in to keep your finds.":"Removed from saved items.")}));
if("IntersectionObserver"in window){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("visible");io.unobserve(e.target)}}),{threshold:.08});$$(".reveal").forEach((el,i)=>{el.style.transitionDelay=`${i%4*60}ms`;io.observe(el)})}else $$(".reveal").forEach(e=>e.classList.add("visible"));
$("#google").addEventListener("click",()=>notice("Google sign-in needs your STUDMART Firebase Authentication configuration."));

window.STUDMART={openLogin:()=>openAuth("login"),openSignup:()=>openAuth("signup"),openProfile,logout,closeAuth};
restoreSession();
})();
