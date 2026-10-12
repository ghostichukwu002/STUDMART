(() => {
// Shared helpers for uploaded photos: upload, preview, and turning stored paths into image URLs
const API_BASE=(window.STUDMART_API_URL||"https://studmart.onrender.com").replace(/\/+$/,"");
const MAX_BYTES=3*1024*1024;
const TYPES=["image/jpeg","image/png","image/webp"];
// Uploaded photos are stored on the API server as /uploads/...
function imgSrc(u){ if(!u)return ""; return u.startsWith("/uploads/")?API_BASE+u:u; }
function readAsDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result);
    r.onerror=()=>reject(new Error("Couldn't read that photo. Try another one."));
    r.readAsDataURL(file);
  });
}
// Checks the file in the browser, then sends it. Returns the stored path, e.g. /uploads/<id>.jpg
async function uploadImage(file,token){
  if(!TYPES.includes(file.type))throw new Error("Please choose a JPEG, PNG or WebP photo.");
  if(file.size>MAX_BYTES)throw new Error("Photos must be 3 MB or smaller.");
  const data=await readAsDataUrl(file);
  let r;
  try{
    r=await fetch(API_BASE+"/api/uploads",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({data})});
  }catch{throw new Error("We couldn't reach the STUDMART server to upload your photo.")}
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.message||"Upload failed. Try again.");
  return d.url;
}
// Shows the chosen photo under a file input
function preview(input,img){
  input.addEventListener("change",()=>{
    const f=input.files[0];
    if(!f){img.hidden=true;img.removeAttribute("src");return}
    img.src=URL.createObjectURL(f);img.hidden=false;
  });
}
window.StudmartMedia={API_BASE,imgSrc,uploadImage,preview};
})();
