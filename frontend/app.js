let listings = [
  {id:1,title:"Noise-Cancelling Headphones",price:45000,category:"Electronics",emoji:"🎧",seller:"Amaka Mercy",initials:"AM",location:"Main Campus",condition:"Great condition",saved:false,desc:"Great condition and lightly used. Perfect for lectures, study sessions and travel."},
  {id:2,title:"Calculus & Engineering Textbook",price:8500,category:"Books",emoji:"📚",seller:"Chinedu Kalu",initials:"CK",location:"Science Block",condition:"Like new",saved:false,desc:"Clean copy with no missing pages. Ideal for 200–300 level engineering students."},
  {id:3,title:"Nike Campus Sneakers",price:28000,category:"Fashion",emoji:"👟",seller:"Tobi Okeke",initials:"TO",location:"Hostel B",condition:"Good",saved:false,desc:"Comfortable everyday sneakers. Size 42. Available for campus pickup."},
  {id:4,title:"Mini Study Lamp",price:12000,category:"Hostel",emoji:"💡",seller:"Ada Nwosu",initials:"AN",location:"Main Campus",condition:"New",saved:false,desc:"Compact LED study lamp with adjustable brightness and USB charging."},
  {id:5,title:"Scientific Calculator",price:15000,category:"Electronics",emoji:"🧮",seller:"Amaka Mercy",initials:"AM",location:"Library Gate",condition:"Good",saved:false,desc:"Fully working scientific calculator. Great for maths, physics and engineering."},
  {id:6,title:"Campus Graphic Design",price:10000,category:"Services",emoji:"🎨",seller:"Daniel Eze",initials:"DE",location:"Online",condition:"Available",saved:false,desc:"Clean flyers, posters and social graphics for student businesses and events."},
  {id:7,title:"Classic Hoodie",price:18000,category:"Fashion",emoji:"🧥",seller:"Sarah Joy",initials:"SJ",location:"Hostel A",condition:"Like new",saved:false,desc:"Warm, comfortable hoodie. Worn only a few times."},
  {id:8,title:"Academic Planner",price:5000,category:"Books",emoji:"📓",seller:"Favour Obi",initials:"FO",location:"Main Campus",condition:"New",saved:false,desc:"Undated student planner for classes, assignments and exam preparation."},
  {id:9,title:"Desk Fan",price:16000,category:"Hostel",emoji:"🌀",seller:"Kelvin Udo",initials:"KU",location:"Hostel C",condition:"Good",saved:false,desc:"Quiet rechargeable desk fan with multiple speed settings."},
  {id:10,title:"Laptop Stand",price:22000,category:"Electronics",emoji:"💻",seller:"Alex Okafor",initials:"AO",location:"Main Campus",condition:"New",saved:false,desc:"Foldable aluminium laptop stand for better posture and study comfort."},
  {id:11,title:"Lab Coat",price:7000,category:"Fashion",emoji:"🥼",seller:"Mira James",initials:"MJ",location:"Medical Block",condition:"Good",saved:false,desc:"Clean white lab coat suitable for science and medical practicals."},
  {id:12,title:"Assignment Typing Service",price:3000,category:"Services",emoji:"⌨️",seller:"Victor Ibe",initials:"VI",location:"Online",condition:"Available",saved:false,desc:"Fast, clean typing and document formatting for school work."}
];

const schoolsByState = {
  "Abia":["Abia State University","Michael Okpara University of Agriculture"],
  "Adamawa":["Modibbo Adama University","American University of Nigeria"],
  "Akwa Ibom":["University of Uyo","Akwa Ibom State University"],
  "Anambra":["Nnamdi Azikiwe University","Chukwuemeka Odumegwu Ojukwu University"],
  "Bauchi":["Abubakar Tafawa Balewa University","Bauchi State University"],
  "Bayelsa":["Niger Delta University","Federal University Otuoke"],
  "Benue":["Benue State University","University of Agriculture, Makurdi"],
  "Borno":["University of Maiduguri","Borno State University"],
  "Cross River":["University of Calabar","Cross River University of Technology"],
  "Delta":["Delta State University","Federal University of Petroleum Resources"],
  "Ebonyi":["Alex Ekwueme Federal University","Ebonyi State University"],
  "Edo":["University of Benin","Edo State University"],
  "Ekiti":["Federal University Oye-Ekiti","Ekiti State University"],
  "Enugu":["University of Nigeria, Nsukka","Enugu State University of Science and Technology"],
  "Gombe":["Gombe State University","Federal University of Kashere"],
  "Imo":["Imo State University","Federal University of Technology, Owerri"],
  "Jigawa":["Federal University Dutse","Sule Lamido University"],
  "Kaduna":["Ahmadu Bello University","Kaduna State University"],
  "Kano":["Bayero University Kano","Northwest University Kano"],
  "Katsina":["Federal University Dutsin-Ma","Umaru Musa Yar'Adua University"],
  "Kebbi":["Federal University Birnin Kebbi","Kebbi State University of Science and Technology"],
  "Kogi":["Federal University Lokoja","Kogi State University"],
  "Kwara":["University of Ilorin","Kwara State University"],
  "Lagos":["University of Lagos","Lagos State University","Yaba College of Technology"],
  "Nasarawa":["Nasarawa State University","Federal University of Lafia"],
  "Niger":["Federal University of Technology, Minna","Ibrahim Badamasi Babangida University"],
  "Ogun":["Covenant University","Federal University of Agriculture, Abeokuta","Olabisi Onabanjo University"],
  "Ondo":["Federal University of Technology, Akure","Adekunle Ajasin University"],
  "Osun":["Obafemi Awolowo University","Osun State University"],
  "Oyo":["University of Ibadan","Ladoke Akintola University of Technology"],
  "Plateau":["University of Jos","Plateau State University"],
  "Rivers":["University of Port Harcourt","Rivers State University"],
  "Sokoto":["Usmanu Danfodiyo University","Sokoto State University"],
  "Taraba":["Taraba State University","Federal University Wukari"],
  "Yobe":["Yobe State University","Federal University Gashua"],
  "Zamfara":["Federal University Gusau","Zamfara State University"],
  "Federal Capital Territory":["University of Abuja","Baze University","Nile University of Nigeria"]
};

let activeFilter="All";
const views=[...document.querySelectorAll(".view")];
let activeView=null;
let transitionTimer;
let currentUser=null;
const API_BASE=(window.STUDMART_API_URL||"/api").replace(/\/$/,"");
function setAuthError(id,message){const element=document.getElementById(id);if(element)element.textContent=message||"";}
function initialsFor(name){return String(name||"ST").split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase();}
function renderProfileState(){
  const auth=document.getElementById("profileAuth");
  const dashboard=document.getElementById("profileDashboard");
  if(!auth||!dashboard)return;
  auth.classList.toggle("hidden",Boolean(currentUser));
  dashboard.classList.toggle("hidden",!currentUser);
  if(!currentUser)return;
  const stats=currentUser.stats||{};
  document.getElementById("profileAvatar").textContent=initialsFor(currentUser.name);
  document.getElementById("profileName").textContent=currentUser.name||"Student seller";
  document.getElementById("profileDetails").textContent=[currentUser.department,currentUser.level,currentUser.campus].filter(Boolean).join(" · ")||"Student member · Choose your campus";
  document.getElementById("profileMemberSince").textContent=`Member since ${currentUser.memberSince||"today"}`;
  document.getElementById("profileCampus").textContent=currentUser.campus||"Campus not set";
  document.getElementById("profileDepartment").textContent=currentUser.department||"Student member";
  document.getElementById("profileVerified").textContent=currentUser.verified?"✓ SCHOOL VERIFIED":"✓ STUDENT MEMBER";
  document.getElementById("profileListingsCount").textContent=stats.listings??0;
  document.getElementById("profileRating").textContent=stats.rating||"—";
  document.getElementById("profileSales").textContent=stats.sales??0;
  document.getElementById("profileSavedCount").textContent=stats.saved??0;
}
async function apiRequest(path,options={}){
  const headers={"Content-Type":"application/json",...(options.headers||{})};
  const token=localStorage.getItem("studmartToken");
  if(token)headers.Authorization=`Bearer ${token}`;
  const response=await fetch(`${API_BASE}${path}`,{...options,headers});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||"Something went wrong. Please try again.");
  return payload;
}
async function restoreAuth(){
  if(!localStorage.getItem("studmartToken"))return;
  try{const payload=await apiRequest("/me");currentUser=payload.user;renderProfileState();}
  catch(error){localStorage.removeItem("studmartToken");localStorage.removeItem("studmartUser");currentUser=null;renderProfileState();}
}

function setupSchoolSelector(){
  const stateSelect=document.getElementById("schoolState");
  const schoolSelect=document.getElementById("schoolName");
  const saveButton=document.getElementById("saveSchool");
  const note=document.getElementById("schoolNote");
  if(!stateSelect||!schoolSelect)return;
  const states=Object.keys(schoolsByState);
  stateSelect.innerHTML=states.map(state=>`<option value="${state}">${state}</option>`).join("");
  function updateSchools(){
    schoolSelect.innerHTML=schoolsByState[stateSelect.value].map(school=>`<option value="${school}">${school}</option>`).join("");
  }
  stateSelect.addEventListener("change",updateSchools);
  saveButton?.addEventListener("click",()=>{
    const school=schoolSelect.value;
    localStorage.setItem("studmartSchool",JSON.stringify({state:stateSelect.value,school}));
    note.textContent=`Marketplace set to ${school}.`;
    note.classList.add("saved");
    toast("School preference saved ✓");
  });
  try{
    const saved=JSON.parse(localStorage.getItem("studmartSchool"));
    if(saved?.state&&schoolsByState[saved.state]){
      stateSelect.value=saved.state;
      updateSchools();
      if([...schoolSelect.options].some(option=>option.value===saved.school))schoolSelect.value=saved.school;
      note.textContent=`Currently browsing around ${saved.school}.`;
      note.classList.add("saved");
      return;
    }
  }catch(error){}
  updateSchools();
}
function setupAuth() {
  document.querySelectorAll("[data-auth-mode]").forEach(tab => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.authMode;

      document.querySelectorAll("[data-auth-mode]").forEach(item => {
        item.classList.toggle("active", item === tab);
      });

      document.getElementById("loginForm")
        ?.classList.toggle("hidden", mode !== "login");

      document.getElementById("signupForm")
        ?.classList.toggle("hidden", mode !== "signup");

      setAuthError("loginError", "");
      setAuthError("signupError", "");
    });
  });

  // LOGIN
  document.getElementById("loginForm")
    ?.addEventListener("submit", async event => {
      event.preventDefault();

      const loginForm = event.currentTarget;
      const form = new FormData(loginForm);

      setAuthError("loginError", "");

      try {
        const payload = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password")
          })
        });

        if (!payload.token || !payload.user) {
          throw new Error("The server returned an invalid login response.");
        }

        localStorage.setItem("studmartToken", payload.token);
        localStorage.setItem(
          "studmartUser",
          JSON.stringify(payload.user)
        );

        currentUser = payload.user;
        loginForm.reset();

        renderProfileState();
        showView("profile");
        toast("Welcome back!");
      } catch (error) {
        setAuthError("loginError", error.message);
      }
    });

  // REGISTRATION
  document.getElementById("signupForm")
    ?.addEventListener("submit", async event => {
      event.preventDefault();

      const signupForm = event.currentTarget;
      const form = new FormData(signupForm);

      setAuthError("signupError", "");

      try {
        const payload = await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password")
          })
        });

        if (!payload.token || !payload.user) {
          throw new Error("The server returned an invalid registration response.");
        }

        localStorage.setItem("studmartToken", payload.token);
        localStorage.setItem(
          "studmartUser",
          JSON.stringify(payload.user)
        );

        currentUser = payload.user;
        signupForm.reset();

        renderProfileState();
        showView("profile");
        toast("Account created successfully!");
      } catch (error) {
        setAuthError("signupError", error.message);
      }
    });

  // LOGOUT
  document.getElementById("logoutBtn")
    ?.addEventListener("click", async () => {
      try {
        await apiRequest("/auth/logout", {
          method: "POST"
        });
      } catch (error) {
        // Clear the local session even if the server is unavailable.
      }

      localStorage.removeItem("studmartToken");
      localStorage.removeItem("studmartUser");

      currentUser = null;
      renderProfileState();
      showView("profile");

      toast("You have been logged out.");
    });

  // RESTORE EXISTING SESSION
  restoreAuth();
}
async function loadListingsFromApi(){
  try{
    const response=await fetch(`${API_BASE}/listings`);
    if(!response.ok)return;
    const payload=await response.json();
    if(Array.isArray(payload.listings)&&payload.listings.length){
      listings=payload.listings.map(item=>({...item,saved:Boolean(item.saved)}));
      const active=location.hash.slice(1)||"home";
      showView(active);
    }
  }catch(error){
    // Opening index.html directly still uses the seeded demo data above.
  }
}
function showView(name){
  if(!document.getElementById(name)) name="home";
  const changed=activeView!==null&&activeView!==name;
  activeView=name;
  views.forEach(v=>v.classList.toggle("active",v.id===name));
  document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===name));
  window.location.hash=name;
  window.scrollTo({top:0,behavior:"smooth"});
  if(changed){
    const transition=document.getElementById("pageTransition");
    transition?.classList.remove("run");
    void transition?.offsetWidth;
    transition?.classList.add("run");
    clearTimeout(transitionTimer);
    transitionTimer=setTimeout(()=>transition?.classList.remove("run"),620);
  }
  if(name==="marketplace") renderListings("marketListings");
  if(name==="home") renderListings("homeListings", listings.slice(0,6));
  if(name==="profile"){renderProfileState();if(currentUser)renderListings("profileListings", listings.filter(x=>x.seller===currentUser.name));}
  if(name==="categories") renderCategories();
  if(name==="messages") renderConversations();
  if(name==="saved") renderSaved();
}
function money(n){return "₦"+n.toLocaleString("en-NG")}
function renderListings(id,data=listings){
  const el=document.getElementById(id); if(!el)return;
  let arr=[...data];
  if(activeFilter!=="All") arr=arr.filter(x=>x.category===activeFilter);
  const sort=document.getElementById("sortSelect")?.value;
  if(sort==="low")arr.sort((a,b)=>a.price-b.price);
  if(sort==="high")arr.sort((a,b)=>b.price-a.price);
  el.innerHTML=arr.map(x=>`
    <article class="listing" data-id="${x.id}">
      <div class="listing-photo"><span class="status">${x.condition}</span><button class="heart" data-save="${x.id}" onclick="event.stopPropagation();toggleSave(${x.id})">${x.saved?"♥":"♡"}</button>${x.emoji}</div>
      <div class="listing-info">
        <h3>${x.title}</h3><div class="listing-price">${money(x.price)}</div>
        <div class="listing-meta"><span>⌖ ${x.location}</span><span>·</span><span>${x.category}</span></div>
        <div class="seller-line"><span class="seller-avatar">${x.initials}</span><span>${x.seller}</span><span class="verified-dot">✓</span></div>
      </div>
    </article>`).join("");
  el.querySelectorAll(".listing").forEach(card=>card.addEventListener("click",()=>openListing(+card.dataset.id)));
  const count=document.getElementById("resultCount"); if(count && id==="marketListings") count.textContent=`${arr.length} item${arr.length===1?"":"s"}`;
}
function toggleSave(id){
  const item=listings.find(x=>x.id===id); if(!item)return;
  item.saved=!item.saved; toast(item.saved?"Saved to your favourites":"Removed from favourites");
  if(document.getElementById("marketplace").classList.contains("active"))renderListings("marketListings");
  if(document.getElementById("saved").classList.contains("active"))renderSaved();
}
function renderSaved(){
  const saved=listings.filter(x=>x.saved), el=document.getElementById("savedListings"), state=document.getElementById("savedState");
  state.style.display=saved.length?"none":"block"; el.innerHTML="";
  if(saved.length) renderListings("savedListings",saved);
}
function openListing(id){
  const x=listings.find(a=>a.id===id); if(!x)return;
  document.getElementById("modalProduct").textContent=x.emoji;
  document.getElementById("modalCategory").textContent=x.category;
  document.getElementById("modalTitle").textContent=x.title;
  document.getElementById("modalPrice").textContent=money(x.price);
  document.getElementById("modalDesc").textContent=x.desc;
  document.getElementById("modalSeller").innerHTML=`<div class="avatar">${x.initials}</div><div><strong>${x.seller}</strong><small>✓ Verified student · ${x.location}</small></div>`;
  document.getElementById("listingModal").classList.add("show");
}
function setupMessageSeller(){
  document.getElementById("messageSellerBtn")?.addEventListener("click",()=>{
    const seller=document.querySelector("#modalSeller strong")?.textContent?.trim() || "Seller";
    document.getElementById("listingModal")?.classList.remove("show");
    messageSeller(seller);
  });
}


const conversations = [
  {id:"amaka-mercy", name:"Amaka Mercy", initials:"AM", status:"Online · Verified student", preview:"Is the calculator still available?", time:"Now"},
  {id:"chidi-okeke", name:"Chidi Okeke", initials:"CO", status:"Active recently · Verified student", preview:"I can meet at the library.", time:"12m"},
  {id:"grace-obi", name:"Grace Obi", initials:"GO", status:"Online · Verified student", preview:"Thanks, I'll take it.", time:"1h"}
];

function renderConversations(selectedId="amaka-mercy"){
  const list=document.getElementById("conversationList");
  if(!list)return;
  list.innerHTML=conversations.map(c=>`
    <button class="conversation ${c.id===selectedId?"active":""}" type="button" data-conversation="${c.id}">
      <span class="avatar">${c.initials}</span>
      <span><strong>${c.name}</strong><small>${c.preview}</small></span>
      <small class="conversation-time">${c.time}</small>
    </button>
  `).join("");
  list.querySelectorAll("[data-conversation]").forEach(button=>{
    button.addEventListener("click",()=>selectConversation(button.dataset.conversation));
  });
}

function selectConversation(id){
  const c=conversations.find(item=>item.id===id);
  if(!c)return;
  document.querySelectorAll("[data-conversation]").forEach(button=>{
    button.classList.toggle("active",button.dataset.conversation===id);
  });
  const avatar=document.querySelector(".chat-head .avatar");
  const name=document.querySelector(".chat-head strong");
  const status=document.querySelector(".chat-head small");
  if(avatar)avatar.textContent=c.initials;
  if(name)name.textContent=c.name;
  if(status)status.textContent="● "+c.status;
}

function messageSeller(seller){
  const target=conversations.find(c=>c.name.toLowerCase()===String(seller).toLowerCase());
  showView("messages");
  renderConversations(target?.id || "amaka-mercy");
  if(target)selectConversation(target.id);
  toast(`Chat opened with ${seller}`);
}

function renderCategories(){
  const cats=[["📚","Books","Textbooks, notes, planners and study materials."],["💻","Electronics","Laptops, calculators, headphones and accessories."],["👟","Fashion","Sneakers, clothes, bags and everyday campus style."],["🛏️","Hostel","Room essentials, furniture, lamps and appliances."],["🛠️","Services","Design, typing, tutoring and student services."],["＋","Others","Anything useful that does not fit elsewhere."]];
  document.getElementById("categoryLarge").innerHTML=cats.map((c,i)=>`<div class="category-large"><div class="cat-icon">${c[0]}</div><div><h2>${c[1]}</h2><p>${c[2]}</p></div><button data-cat="${c[1]}">Explore ${c[1]} →</button></div>`).join("");
  document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{activeFilter=b.dataset.cat;showView("marketplace");document.querySelectorAll(".chip").forEach(c=>c.classList.toggle("active",c.dataset.filter===activeFilter))});
}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
document.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",()=>{activeFilter=c.dataset.filter;document.querySelectorAll(".chip").forEach(x=>x.classList.toggle("active",x===c));renderListings("marketListings")}));
document.getElementById("sortSelect")?.addEventListener("change",()=>renderListings("marketListings"));
document.getElementById("searchInput").addEventListener("input",e=>{
  const q=e.target.value.toLowerCase().trim(); if(q && !document.getElementById("marketplace").classList.contains("active"))showView("marketplace");
  if(!q){renderListings("marketListings");return}
  renderListings("marketListings",listings.filter(x=>(x.title+" "+x.category+" "+x.seller).toLowerCase().includes(q)));
});
document.querySelector(".modal-close").onclick=()=>document.getElementById("listingModal").classList.remove("show");
document.getElementById("listingModal").addEventListener("click",e=>{if(e.target.id==="listingModal")e.currentTarget.classList.remove("show")});
document.getElementById("profileBtn").onclick=()=>showView("profile");
setupMessageSeller();
document.getElementById("notifyBtn").onclick=()=>toast("You're all caught up ✓");
document.getElementById("sellForm").addEventListener("submit",e=>{e.preventDefault();toast("Listing created — frontend demo only");e.target.reset()});
document.querySelectorAll(".category-card").forEach(b=>b.addEventListener("click",()=>{activeFilter=b.dataset.category;showView("marketplace");document.querySelectorAll(".chip").forEach(c=>c.classList.toggle("active",c.dataset.filter===activeFilter))}));
setupSchoolSelector();
setupAuth();
window.addEventListener("hashchange",()=>showView(location.hash.slice(1)||"home"));
showView(location.hash.slice(1)||"home");
loadListingsFromApi();
