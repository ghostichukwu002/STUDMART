(() => {
const $=s=>document.querySelector(s);
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const TOKEN_KEY="studmart_token", USER_KEY="studmart_user";
const readToken=()=>{try{return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)}catch{return null}};
const token=readToken();
const profileForm=$("#profileForm"), passwordForm=$("#passwordForm"), profileMsg=$("#profileMsg"), passwordMsg=$("#passwordMsg");
let toastTimer, user=null;
const RED="#9c493e", GREEN="#50742a";

function notice(t){const x=$("#toast");x.textContent=t;x.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove("show"),3000)}
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
  g.replaceChildren();
  for(const [tag,props,t] of [["h2",{},title],["p",{},text],["a",{class:"btn dark",href:"./index.html"},"Go to STUDMART ↗"]]){
    const n=document.createElement(tag);Object.entries(props).forEach(([k,v])=>n.setAttribute(k,v));n.textContent=t;g.append(n);
  }
  g.hidden=false;
}
function fill(){
  const f=profileForm.elements, shop=user.accountType==="shop"&&user.shop;
  f.firstName.value=user.firstName||"";f.lastName.value=user.lastName||"";
  $("#personalFields").hidden=!!shop;$("#shopFields").hidden=!shop;
  $("#editTitle").firstChild.textContent=shop?"Edit your shop ":"Edit profile";
  $("#editSub").textContent=shop
    ?"Your shop details appear on your listings and your shop page. Your shop can be in any town or area."
    :"Your school and bio appear on your listings so buyers know who you are.";
  if(shop){f.shopName.value=user.shop.name||"";f.shopAddress.value=user.shop.address||"";f.shopPhone.value=user.shop.phone||"";f.shopDescription.value=user.shop.description||""}
  else{f.school.value=user.school||"";f.bio.value=user.bio||""}
}

profileForm.addEventListener("submit",async e=>{
  e.preventDefault();profileMsg.textContent="";profileMsg.style.color=RED;
  const f=profileForm.elements, shop=user.accountType==="shop";
  const body={firstName:f.firstName.value.trim(),lastName:f.lastName.value.trim()};
  if(shop){
    Object.assign(body,{school:"",bio:"",shopName:f.shopName.value.trim(),shopAddress:f.shopAddress.value.trim(),shopPhone:f.shopPhone.value.trim(),shopDescription:f.shopDescription.value.trim()});
    if(!body.shopName||!body.shopAddress||!body.shopPhone){profileMsg.textContent="Please add your shop name, address and phone or WhatsApp.";return}
  }else{
    Object.assign(body,{school:f.school.value.trim(),bio:f.bio.value.trim()});
    if(!body.school){profileMsg.textContent="Please enter your school or campus.";return}
  }
  if(!body.firstName||!body.lastName){profileMsg.textContent="Please enter your first and last name.";return}
  const btn=$("#saveBtn");btn.disabled=true;btn.classList.add("is-loading");
  try{
    const d=await api("/api/auth/profile",{method:"PATCH",body});
    user=d.user;localStorage.setItem(USER_KEY,JSON.stringify(user));
    fill();profileMsg.style.color=GREEN;profileMsg.textContent="Saved. Your profile is updated.";notice("Profile saved.");
  }catch(err){profileMsg.textContent=err.message}
  finally{btn.disabled=false;btn.classList.remove("is-loading")}
});

passwordForm.addEventListener("submit",async e=>{
  e.preventDefault();passwordMsg.textContent="";passwordMsg.style.color=RED;
  const f=passwordForm.elements;
  if(f.newPassword.value.length<6){passwordMsg.textContent="Your new password must be at least 6 characters.";return}
  try{
    const d=await api("/api/auth/change-password",{method:"POST",body:{currentPassword:f.currentPassword.value,newPassword:f.newPassword.value}});
    passwordForm.reset();passwordMsg.style.color=GREEN;passwordMsg.textContent=d.message||"Password changed.";
  }catch(err){passwordMsg.textContent=err.message}
});

async function init(){
  if(!token){gate("Log in first","Log in to STUDMART to edit your profile.");return}
  try{
    const d=await api("/api/auth/me");
    user=d.user;fill();$("#editArea").hidden=false;
  }catch(err){
    if(err.status===401)gate("Your session has ended","Log in to STUDMART again to edit your profile.");
    else gate("Couldn't load your profile",err.message);
  }
}
init();
})();
