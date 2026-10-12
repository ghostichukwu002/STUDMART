(() => {
const $=s=>document.querySelector(s);
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const TOKEN_KEY="studmart_token";
const token=(()=>{try{return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)}catch{return null}})();
const form=$("#postForm"), msg=$("#postMsg"), btn=$("#postSubmit");
let toastTimer;

function notice(t){const x=$("#toast");x.textContent=t;x.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove("show"),3000)}
function show(text,ok){msg.style.color=ok?"#50742a":"#9c493e";msg.textContent=text}
// Shows a message in place of the form (not logged in / session ended)
function gate(title,text){
  const g=$("#gate");
  g.replaceChildren();
  const h=document.createElement("h2");h.textContent=title;
  const p=document.createElement("p");p.textContent=text;
  const a=document.createElement("a");a.className="btn dark";a.href="./index.html";a.textContent="Go to STUDMART ↗";
  g.append(h,p,a);
  g.hidden=false;
  $("#postArea").hidden=true;
}
function showForm(who){
  $("#gate").hidden=true;
  $("#postArea").hidden=false;
  if(who)$("#postWho").textContent=`Posting as ${who}. Your listing is visible to everyone on STUDMART.`;
}

async function init(){
  if(!token){gate("Log in first","Posting needs a STUDMART account. Log in on the home page, then come back here.");return}
  // Only check the session to greet the seller. The form is never blocked by profile details.
  try{
    const r=await fetch(API_BASE+"/api/auth/me",{headers:{Accept:"application/json",Authorization:`Bearer ${token}`}});
    if(r.status===401){gate("Your session has ended","Log in to STUDMART again, then come back to post.");return}
    const d=await r.json().catch(()=>({}));
    const who=d.user?.accountType==="shop"&&d.user.shop?d.user.shop.name:d.user?`${d.user.firstName} ${d.user.lastName}`:"";
    showForm(who);
  }catch{
    // Server might be waking up: still show the form, the post itself will report any problem
    showForm("");
  }
}

form.addEventListener("submit",async e=>{
  e.preventDefault();show("",true);
  const f=form.elements;
  const body={
    title:f.title.value.trim(),category:f.category.value,condition:f.condition.value,price:f.price.value,
    pickup:f.pickup.value.trim(),contact:f.contact.value.trim(),imageUrl:"",description:f.description.value.trim()
  };
  if(!body.title||!body.price||!body.pickup||!body.description){show("Please fill in the title, price, pickup location and description.",false);return}
  btn.classList.add("is-loading");btn.disabled=true;
  try{
    if(f.photo.files[0])body.imageUrl=await StudmartMedia.uploadImage(f.photo.files[0],token);
    const r=await fetch(API_BASE+"/api/listings",{
      method:"POST",
      headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${token}`},
      body:JSON.stringify(body)
    });
    const d=await r.json().catch(()=>({}));
    if(r.status===401){gate("Your session has ended","Log in to STUDMART again, then come back to post.");return}
    if(!r.ok)throw new Error(d.message||`Request failed (${r.status})`);
    form.reset();$("#photoPreview").hidden=true;show("Your listing is live! Post another, or go back to the marketplace.",true);
    notice("Your listing is live.");
  }catch(err){
    const offline=err instanceof TypeError;
    show(offline?"We couldn't reach the STUDMART server. Check your connection and try again.":err.message,false);
  }finally{btn.classList.remove("is-loading");btn.disabled=false}
});

StudmartMedia.preview(form.elements.photo,$("#photoPreview"));
init();
})();
