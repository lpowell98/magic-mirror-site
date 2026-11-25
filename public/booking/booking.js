/* ===== Back end: every request goes through the site's /api/booking (functions/api/booking.js),
   which checks the bot test and passes it on to the Apps Script back end. Blank = offline demo mode. ===== */
const API_URL = "/api/booking";
const mmTS = window.mmTS || { render(){}, async token(){ return ""; }, reset(){} };   // bot check (assets/js/turnstile.js)

/* ===== Business settings (pulled from the current BoothBook setup) ===== */
const CFG = {
  deposit: 250, freeMiles: 20, perMile: 0.85,
  eventTypes: ["Baby Shower","Corporate Event","Family Event","Graduation","Holiday & Theme Party","Other","Restaurant, Nightclub or Bar Event","University or Member Event","Wedding"],
  packages: [
    {id:"bronze",name:"Bronze Package",hours:3,price:650,lines:["Three hours of runtime","Unlimited participation - 3 printouts per session","High-quality 4x6 printouts","Text and email sharing","Professional DSLR camera and lighting","2 friendly on-site event attendants","Creative props and accessories","Private online photo gallery"],extras:[]},
    {id:"silver",name:"Silver Package",hours:4,price:850,lines:["Four hours of runtime","Unlimited participation & printouts per session","High-quality 4x6 printouts","Text and email sharing","Professional DSLR camera and lighting","2 friendly on-site event attendants","Creative props and accessories","Private online photo gallery"],extras:["1 custom overlay design","USB drive of all event photos"]},
    {id:"gold",name:"Gold Package",hours:5,price:1100,lines:["Five hours of runtime","Unlimited participation & printouts per session","High-quality 4x6 printouts","Text and email sharing","Professional DSLR camera and lighting","2 friendly on-site event attendants","Creative props and accessories","Private online photo gallery"],extras:["3 custom overlay designs","Professional photo booth backdrop","USB drive of all event photos"]}
  ],
  prints: [
    {id:"tpl",name:"Template Design Print-out",desc:"Choose from over 100 FREE professionally developed templates!",price:0,img:"/booking/img/print-template.png"},
    {id:"cus",name:"Custom Design Print-out",desc:"We'll design a custom template print-out for your event!",price:75,img:"/booking/img/print-custom.png"}
  ],
  times: [
    {id:"t30",name:"Additional Time (30 minutes)",desc:"Add an additional half-hour of time to your rental period.",price:75,img:"/booking/img/time-30.png"},
    {id:"t60",name:"Additional Time (1 hour)",desc:"Add an additional hour of time to your rental period.",price:100,img:"/booking/img/time-60.png"},
    {id:"t120",name:"Additional Time (2 hour)",desc:"Add an additional two hours of time to your rental period.",price:150,img:"/booking/img/time-120.png"}
  ]
};

/* ===== Helpers ===== */
const $ = id => document.getElementById(id);
const esc = t => String(t==null?"":t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const USD = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const money = n => USD.format(n);
const LONGDATE = new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
const SMOOTH = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
const fmtDate = d => `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
const store = {
  get(){ try{ return JSON.parse(localStorage.getItem("mmrs_bookings")||"[]"); }catch(e){ return []; } },
  set(v){ try{ localStorage.setItem("mmrs_bookings", JSON.stringify(v)); }catch(e){} }
};
let memBookings = store.get();
/* Private booking keys this browser has opened, so returning clients go straight in */
const keys = {
  all(){ try{ return JSON.parse(localStorage.getItem("mmrs_keys")||"{}"); }catch(e){ return {}; } },
  get(id){ return this.all()[String(id)]||""; },
  set(id,k){ if(!k) return; try{ const a=this.all(); a[String(id)]=k; localStorage.setItem("mmrs_keys",JSON.stringify(a)); }catch(e){} }
};
const auth=()=>({ id:S.cur.id, key:S.cur.key||"", ln:S.cur.ln });
let takenDates = new Set();
const HEAD={ home:["Book now","Pick your date, package and extras below. A $250 deposit holds your date. Already booked? Look up your booking with your Booking ID and last name."],
  book:["Book now","Choose your package and extras, then tell us about your event. You'll see the full price before you book."],
  portal:["Your booking","Your invoice, contract, print template and messages, all in one place."] };
function show(view){ ["home","book","portal"].forEach(v=>$("v-"+v).classList.toggle("hidden",v!==view));
  $("pageTitle").textContent=HEAD[view][0]; $("pageLede").textContent=HEAD[view][1]; $("sticky").classList.toggle("hidden",view!=="book"); window.scrollTo(0,0); }

/* ===== State ===== */
const today = new Date(); today.setHours(0,0,0,0);
const S = { date:new Date(today), view:new Date(today.getFullYear(),today.getMonth(),1), eventType:"", pkg:null, print:null, times:new Set(), payOpt:"later", summaryShown:false };

/* ===== Calendar ===== */
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
MONTHS.forEach((m,i)=>$("mSel").add(new Option(m,i)));
for(let y=today.getFullYear(); y<=today.getFullYear()+3; y++) $("ySel").add(new Option(y,y));
CFG.eventTypes.forEach(t=>$("et").add(new Option(t[0]+t.slice(1).toLowerCase(),t)));
function drawCal(){
  const v=S.view; $("mSel").value=v.getMonth(); $("ySel").value=v.getFullYear();
  $("prev").disabled = v.getFullYear()===today.getFullYear() && v.getMonth()===today.getMonth();
  const g=$("calGrid"); g.innerHTML="";
  ["Mo","Tu","We","Th","Fr","Sa","Su"].forEach(d=>g.insertAdjacentHTML("beforeend",`<div class="dow">${d}</div>`));
  const first=(new Date(v.getFullYear(),v.getMonth(),1).getDay()+6)%7;
  const days=new Date(v.getFullYear(),v.getMonth()+1,0).getDate();
  for(let i=0;i<first;i++) g.insertAdjacentHTML("beforeend","<div></div>");
  for(let d=1; d<=days; d++){
    const dt=new Date(v.getFullYear(),v.getMonth(),d);
    const b=document.createElement("button"); b.type="button"; b.className="day"; b.textContent=d;
    let lbl=LONGDATE.format(dt);
    if(dt<today){ b.classList.add("past"); b.disabled=true; }
    else if(isBooked(dt)){ b.classList.add("past","taken"); b.disabled=true; b.title="Fully booked"; lbl+=", fully booked"; }
    b.setAttribute("aria-label",lbl);
    b.setAttribute("aria-pressed", +dt===+S.date ? "true" : "false");
    if(+dt===+S.date) b.classList.add("sel");
    b.onclick=()=>{ S.date=dt; drawCal(); };
    g.appendChild(b);
  }
}
$("prev").onclick=()=>{ S.view.setMonth(S.view.getMonth()-1); drawCal(); };
$("next").onclick=()=>{ S.view.setMonth(S.view.getMonth()+1); drawCal(); };
$("mSel").onchange=$("ySel").onchange=()=>{ S.view=new Date(+$("ySel").value,+$("mSel").value,1); drawCal(); };
drawCal();

/* ===== API ===== */
async function api(params, body){
  if(S.demo){ const a=(body||params||{}).action; return a==="template"||a==="messages" ? {ok:true,messages:[]} : {ok:false}; }
  const res = await fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body||params) });
  return res.json();
}
const TOO_MANY="Too many tries from this device. Please wait a while, or email inquiries@magicmirrorrentalservices.com.";
const BOT="We couldn't confirm you're not a robot. Please wait a moment and try again.";
async function loadTaken(){
  if(!API_URL) return;
  try{ const r = await api({action:"dates"}); if(r.ok){ takenDates = new Set(r.taken); drawCal(); } }catch(e){}
}
loadTaken();
if(!API_URL && /magicmirrorrentalservices\.com$/.test(location.hostname)){
  $("v-home").innerHTML = '<div class="home"><div><h2>Online booking is being updated</h2><p>Please email inquiries@magicmirrorrentalservices.com and we will get you booked.</p></div></div>';
}

function isBooked(d){
  if(API_URL) return takenDates.has(fmtDate(d));
  return memBookings.some(b=>b.date===fmtDate(d) && b.status!=="Cancelled");
}
$("checkBtn").onclick=()=>{
  const msg=$("homeMsg");
  if(!$("et").value || !/^\S+@\S+\.\S+$/.test($("lma").value)){ msg.textContent="Please choose an event type and enter a valid email."; return; }
  if(isBooked(S.date)){ msg.textContent="Sorry, we're fully booked on that date. Please choose another."; return; }
  msg.textContent=""; S.eventType=$("et").value; $("email").value=$("lma").value;
  $("bDate").textContent=LONGDATE.format(S.date); show("book"); refresh();
};
$("changeDate").onclick=()=>show("home");

/* ===== Manage booking =====
   With a key saved in this browser (from an email link or an earlier visit) the booking opens straight away.
   Otherwise we email a 6-digit code to the address on the booking. */
function openWithBooking(b,isNew){ keys.set(b.id,b.key); renderPortal(b,isNew); }
$("searchBtn").onclick=async()=>{
  const id=$("mId").value.trim(), ln=$("mSur").value.trim();
  if(API_URL){
    if(!id||!ln){ $("manageMsg").textContent="Enter your Booking ID and last name."; return; }
    $("manageMsg").textContent="Searching…"; $("searchBtn").disabled=true;
    try{
      const k=keys.get(id);
      if(k){ const r=await api(null,{action:"lookup",id,key:k});
        if(r.ok && String(r.booking.ln).toLowerCase()===ln.toLowerCase()){ $("manageMsg").textContent=""; openWithBooking(r.booking,false); return; } }
      const r=await api(null,{action:"portalCode",id,ln,ts:await mmTS.token($("tsManage"))});
      mmTS.reset($("tsManage"));
      if(r.ok){ $("codeBox").classList.remove("hidden"); $("mCode").value=""; $("mCode").focus();
        $("manageMsg").textContent="If those details match a booking, we've emailed a 6-digit code to the address on it. It expires in 10 minutes."; return; }
      if(r.error==="Unknown action"){   // older back end: look up by last name
        const o=await api(null,{action:"lookup",id,ln});
        if(o.ok){ $("manageMsg").textContent=""; renderPortal(o.booking,false); return; } }
      $("manageMsg").textContent = r.error==="TOO_MANY"?TOO_MANY : r.error==="BOT_CHECK"?BOT : "No booking found. Check your Booking ID and last name.";
    }catch(e){ $("manageMsg").textContent="We couldn't reach the booking system. Please try again."; }
    finally{ $("searchBtn").disabled=false; }
    return;
  }
  const b=memBookings.find(x=>String(x.id)===id && x.ln.toLowerCase()===ln.toLowerCase());
  if(!b){ $("manageMsg").textContent="No booking found. Check your Booking ID and last name."; return; }
  $("manageMsg").textContent=""; renderPortal(b,false);
};
$("codeBtn").onclick=async()=>{
  const id=$("mId").value.trim(), code=$("mCode").value.trim();
  if(!/^\d{6}$/.test(code)){ $("manageMsg").textContent="Enter the 6-digit code from the email."; return; }
  $("codeBtn").disabled=true; $("manageMsg").textContent="Checking…";
  try{ const r=await api(null,{action:"portalVerify",id,code});
    if(r.ok){ $("codeBox").classList.add("hidden"); $("manageMsg").textContent=""; openWithBooking(r.booking,false); }
    else $("manageMsg").textContent = r.error==="CODE_WRONG"?"That code isn't right. Check the email and try again." : r.error==="TOO_MANY"?TOO_MANY : "That code has expired. Click Search to get a new one.";
  }catch(e){ $("manageMsg").textContent="We couldn't reach the booking system. Please try again."; }
  $("codeBtn").disabled=false;
};

/* ===== Packages & extras ===== */
function cartBtn(on,onclick,name){ const w=document.createElement("div"); w.className="cart"+(on?" on":""); const b=document.createElement("button"); b.type="button"; b.textContent=on?"Added":"Add to cart"; b.setAttribute("aria-label",(on?"Remove ":"Add ")+name); b.setAttribute("aria-pressed",on?"true":"false"); b.onclick=onclick; w.append(b,document.createElement("span")); return w; }
function drawPkgs(){
  const box=$("pkgs"); box.innerHTML="";
  CFG.packages.forEach(p=>{
    const el=document.createElement("div"); el.className="pkg";
    el.innerHTML=`<div class="tag">Mirror Me Booth</div><div class="title">${p.name}</div>
      <div class="body"><strong>${p.hours} hours</strong>${p.lines.join("<br>")}</div>
      <div class="extras"><em>Included Extras:</em>${p.extras.map(x=>`<b>${x}</b>`).join("<br>")}</div>
      <div class="foot"><div class="price"><small>$</small>${p.price.toFixed(2)}</div></div>`;
    el.querySelector(".foot").appendChild(cartBtn(S.pkg===p.id,()=>{ S.pkg = S.pkg===p.id?null:p.id; refresh(); },p.name));
    box.appendChild(el);
  });
}
function xcard(x,on,onclick){
  const el=document.createElement("div"); el.className="xcard";
  el.innerHTML=`<img src="${x.img}" alt="" width="280" height="280" loading="lazy"><div class="t">${x.name}</div><div class="d">${x.desc}</div><div class="row"><div class="price">${x.price?`<small>$</small>${x.price.toFixed(2)}`:""}</div></div>`;
  el.querySelector(".row").appendChild(cartBtn(on,onclick,x.name)); return el;
}
function drawExtras(){
  $("printGroup").classList.toggle("hidden",!S.pkg);
  const pr=$("printRow"); pr.innerHTML="";
  CFG.prints.forEach(x=>pr.appendChild(xcard(x,S.print===x.id,()=>{ S.print = S.print===x.id?null:x.id; refresh(); })));
  $("printErr").classList.toggle("hidden",!!S.print);
  const tr=$("timeRow"); tr.innerHTML="";
  CFG.times.forEach(x=>tr.appendChild(xcard(x,S.times.has(x.id),()=>{ S.times.has(x.id)?S.times.delete(x.id):S.times.add(x.id); refresh(); })));
}

/* ===== Times ===== */
(function(){
  const opts=["Please select"]; for(let i=0;i<96;i++){ const m=(5*60+i*15)%(24*60); const h=Math.floor(m/60), mm=m%60; const h12=((h+11)%12)+1; opts.push(`${h12}:${String(mm).padStart(2,"0")} ${h<12?"am":"pm"}`); }
  ["tStart","tEnd"].forEach(id=>opts.forEach((o,i)=>$(id).add(new Option(o,i?o:""))));
})();

/* ===== Travel fee ===== */
function travelFee(){ const mi=parseFloat($("vMiles").value); if(!(mi>0)) return 0; return Math.max(0,mi-CFG.freeMiles)*CFG.perMile; }
$("vMiles").oninput=()=>{ $("vFee").value=travelFee().toFixed(2); drawPay(); };

/* ===== Totals ===== */
function lineItems(){
  const items=[];
  if(S.print){ const x=CFG.prints.find(p=>p.id===S.print); items.push([x.name,x.price]); }
  if(S.pkg){ const p=CFG.packages.find(p=>p.id===S.pkg); items.push(["Mirror Me Booth - "+p.name,p.price]); }
  CFG.times.filter(t=>S.times.has(t.id)).forEach(t=>items.push([t.name,t.price]));
  items.push(["Travel",travelFee()]);
  return items;
}
const total=()=>lineItems().reduce((s,i)=>s+i[1],0);
function drawPay(){
  const t=total(), opts=[["later","Pay later"],["deposit",`${money(Math.min(CFG.deposit,t))} (pay deposit only)`],["full",`${money(t)} (pay full balance)`]];
  $("pay").innerHTML=opts.map(([v,l])=>`<label class="${S.payOpt===v?"on":""}"><input type="radio" name="pay" value="${v}" ${S.payOpt===v?"checked":""}>${l}</label>`).join("");
  $("pay").querySelectorAll("input").forEach(r=>r.onchange=()=>{ S.payOpt=r.value; drawPay(); });
}
function missing(){
  const m=[];
  if(!S.pkg) m.push("pkg"); if(!S.print) m.push("print");
  document.querySelectorAll("#v-book [data-req]").forEach(el=>{ if(!el.value.trim()) m.push(el.id); });
  if(!$("terms").checked) m.push("terms");
  return m;
}
function refresh(){ drawPkgs(); drawExtras(); drawPay(); refreshLight(); }
// cheap update while typing: totals and warnings only, no card redraw
function refreshLight(){
  const warn = S.pkg ? "" : "You have selected 1 service and 0 packages. Please choose a package to continue.";
  $("pkgWarn").textContent=warn; $("pkgWarn").classList.toggle("hidden",!!S.pkg);
  document.querySelectorAll("#v-book [data-req]").forEach(el=>{ if(el.value.trim()) clearErr(el); });
  if($("terms").checked) clearErr($("terms"));
  $("stickyTotal").textContent=money(total());
  if(S.summaryShown){
    $("sumBody").innerHTML=lineItems().map(([n,p])=>`<tr><td>${n}</td><td>${money(p)}</td></tr>`).join("")+`<tr class="total"><td></td><td>${money(total())}</td></tr>`;
  }
  const m=missing();
  $("bottomWarn").textContent = !S.pkg ? warn : (S.tried && m.length ? `Please complete the ${m.length} highlighted field${m.length>1?"s":""} to book.` : "");
  $("bottomWarn").classList.toggle("hidden",!$("bottomWarn").textContent);
}
document.querySelectorAll("#v-book [data-req], #v-book #terms").forEach(el=>el.addEventListener(el.type==="checkbox"?"change":"input",refreshLight));
function setErr(el,msg){ el.setAttribute("aria-invalid","true"); let e=$(el.id+"-err"); if(!e){ e=document.createElement("div"); e.id=el.id+"-err"; e.className="field-err"; (el.type==="checkbox"?el.parentElement:el).insertAdjacentElement("afterend",e); el.setAttribute("aria-describedby",e.id); } e.textContent=msg; }
function clearErr(el){ el.removeAttribute("aria-invalid"); const e=$(el.id+"-err"); if(e) e.remove(); }
$("flyer").onchange=e=>{ const f=e.target.files[0]; if(f && f.size>2*1024*1024){ e.target.value=""; $("bottomWarn").textContent="That file is over 2 MB. Please email it to us instead."; $("bottomWarn").classList.remove("hidden"); } };

$("sumBtn").onclick=()=>{
  S.summaryShown=true; $("sumWrap").classList.remove("hidden"); if(API_URL) mmTS.render($("tsBook")); $("sumBtn").classList.add("hidden"); refresh();
  $("sumWrap").scrollIntoView({behavior:SMOOTH,block:"center"});
};
$("bookBtn").onclick=async()=>{
  const m=missing();
  if(m.length){
    S.tried=true; refresh();
    m.forEach(id=>{ const el=$(id); if(el && id!=="pkg" && id!=="print") setErr(el, id==="terms" ? "Please accept the terms to book." : "This field is required."); });
    const first = m[0]==="pkg" ? document.querySelector("#pkgs .cart button") : m[0]==="print" ? document.querySelector("#printRow .cart button") : $(m[0]);
    if(first){ first.scrollIntoView({behavior:SMOOTH,block:"center"}); first.focus({preventScroll:true}); }
    return;
  }
  const id = (memBookings.reduce((mx,b)=>Math.max(mx,b.id),150))+1;
  const toMin=s=>{ const [t,ap]=s.split(" "); let [h,mm]=t.split(":").map(Number); if(ap==="pm"&&h!==12)h+=12; if(ap==="am"&&h===12)h=0; return h*60+mm; };
  const fromMin=n=>{ n=(n+1440)%1440; const h=Math.floor(n/60),mm=n%60; return `${((h+11)%12)+1}:${String(mm).padStart(2,"0")} ${h<12?"am":"pm"}`; };
  const st=$("tStart").value, en=$("tEnd").value;
  const b={ id, date:fmtDate(S.date), eventType:S.eventType, status:"Unconfirmed",
    start:st, end:en, arrive:fromMin(toMin(st)-60), depart:en?fromMin(toMin(en)+30):"",
    evName:$("evName").value, vName:$("vName").value, vAddr:$("vAddr").value, vZip:$("vZip").value,
    fn:$("fn").value, ln:$("ln").value, email:$("email").value, phone:$("phone").value,
    items:lineItems().filter(i=>i[0]!=="Travel"||i[1]>0), total:total(), paid:0, payOpt:S.payOpt };
  if(API_URL){
    const btn=$("bookBtn"); btn.disabled=true; btn.textContent="Booking…";
    const payload={ action:"book", date:b.date, eventType:b.eventType, pkg:S.pkg, print:S.print, times:[...S.times],
      miles:$("vMiles").value, email:b.email, phone:b.phone, evName:b.evName, start:b.start, end:b.end,
      arrive:b.arrive, depart:b.depart, vName:b.vName, vAddr:b.vAddr, vZip:b.vZip, fn:b.fn, ln:b.ln,
      street:$("street").value, zip:$("zip").value, coupon:$("coupon").value, ref:$("ref").value,
      payOpt:S.payOpt, terms:$("terms").checked };
    try{
      payload.ts=await mmTS.token($("tsBook"));
      const r=await api(null,payload);
      mmTS.reset($("tsBook"));
      if(r.ok){ takenDates.add(b.date); openWithBooking(r.booking,true);
        if(S.payOpt!=="later"){ const amt=S.payOpt==="full"?r.booking.total:Math.min(CFG.deposit,r.booking.total); startPay(amt,$("payBtn")); } }
      else{
        const w=$("bottomWarn");
        w.textContent = r.error==="DATE_TAKEN" ? "Sorry, that date was just booked. Please choose another date." : r.error==="TOO_MANY" ? TOO_MANY : r.error==="BOT_CHECK" ? BOT : "Something went wrong: "+r.error;
        w.classList.remove("hidden");
      }
    }catch(e){
      $("bottomWarn").textContent="We couldn't reach the booking system. Please try again or email inquiries@magicmirrorrentalservices.com.";
      $("bottomWarn").classList.remove("hidden");
    }
    btn.disabled=false; btn.textContent="Book now";
    return;
  }
  memBookings.push(b); store.set(memBookings);
  renderPortal(b,true);
};

/* ===== Portal ===== */
const ICONS={
  cal:'<svg width="30" height="30" viewBox="0 0 24 24" fill="#8E5BB8"><rect x="3" y="5" width="18" height="16" rx="2"/><rect x="3" y="5" width="18" height="4" fill="#662D91"/><g fill="#fff"><rect x="6" y="11" width="2.5" height="2.5"/><rect x="10.7" y="11" width="2.5" height="2.5"/><rect x="15.5" y="11" width="2.5" height="2.5"/><rect x="6" y="15.5" width="2.5" height="2.5"/><rect x="10.7" y="15.5" width="2.5" height="2.5"/></g></svg>',
  inv:'<svg width="26" height="30" viewBox="0 0 20 24" fill="#A98CC4"><path d="M2 0h11l7 7v17H2z"/><rect x="5" y="11" width="10" height="5" fill="#662D91"/><rect x="5" y="18" width="10" height="1.5" fill="#662D91"/></svg>',
  con:'<svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2h10l5 5v15H3z" fill="#C9B3DD"/><path d="M9 18l9-9 3 3-9 9H9z" fill="#662D91"/><path d="M5 16c2-3 3 1 5-2" stroke="#662D91" fill="none"/></svg>',
  tpl:'<svg width="30" height="26" viewBox="0 0 24 20"><rect width="24" height="20" rx="2" fill="#662D91"/><circle cx="7" cy="6" r="2" fill="#fff"/><path d="M3 17l6-6 4 4 3-3 5 5z" fill="#fff"/></svg>',
  msg:'<svg width="32" height="28" viewBox="0 0 26 22"><ellipse cx="10" cy="8" rx="10" ry="7" fill="#C9B3DD"/><ellipse cx="17" cy="13" rx="8" ry="6" fill="#662D91"/></svg>',
  ok:'<svg width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#F6DD8E"/><path d="M7 12l3 3 7-7" stroke="#E8B923" stroke-width="2.5" fill="none"/></svg>'
};
function renderPortal(b,isNew){
  $("thanks").classList.toggle("hidden",!isNew);
  const kv=(k,v)=>`<div class="kv"><b>${k}</b><span>${esc(v||"")}</span></div>`;
  $("pOrder").innerHTML=kv("Booking ID",b.id)+kv("Event Date",b.date)+kv("Event Time",b.start+(b.end?" - "+b.end:""))+kv("Arrival Time",b.arrive)+kv("Departure Time",b.depart)+kv("Event Name",b.evName)+kv("Venue Name",b.vName)+kv("Venue Address",b.vAddr)+kv("Venue Postcode",b.vZip)+kv("Status",b.status);
  $("pYou").innerHTML=kv("First Name",b.fn)+kv("Last Name",b.ln)+kv("Company","")+kv("E-mail",b.email)+kv("Telephone","")+kv("Mobile Phone",b.phone)+kv("Additional Notes","");
  $("pLines").innerHTML=b.items.map(([n,p])=>`<tr><td><b>${esc(n)}</b></td><td>${money(p)}</td></tr>`).join("");
  const due=b.total-b.paid;
  $("pTotals").innerHTML=kv("Sub Total",money(b.total))+kv("Order Total",money(b.total))+kv("Balance Due",money(due));
  const tiles=[["Deposit",Math.min(CFG.deposit,due)],["Half the balance",due/2],["Full balance",due]];
  $("payTiles").innerHTML=tiles.map(([l,v],i)=>`<button type="button" class="paytile${i===2?" on":""}" data-v="${v}" aria-pressed="${i===2}"><small>${l}</small><span>${money(v)}</span></button>`).join("");
  $("payAmt").value=due.toFixed(2);
  $("payTiles").querySelectorAll(".paytile").forEach(t=>t.onclick=()=>{ $("payTiles").querySelectorAll(".paytile").forEach(x=>{ x.classList.remove("on"); x.setAttribute("aria-pressed","false"); }); t.classList.add("on"); t.setAttribute("aria-pressed","true"); $("payAmt").value=(+t.dataset.v).toFixed(2); });
  $("payNote").textContent="";
  $("payBtn").onclick=()=>startPay($("payAmt").value,$("payBtn"));
  $("payBtn").disabled=!(due>0.005); if(!(due>0.005)) $("payNote").textContent="Your booking is paid in full. Thank you!";
  S.cur=b;
  renderTabs(); selectTab("bookings"); show("portal");
}

/* ===== Portal tabs ===== */
const TABS=[["bookings","cal","Bookings"],["invoice","inv","Invoice"],["contract","con","Contract"],["template","tpl","Choose Template"],["messages","msg","Send Message"],["details","ok","Confirm Details"]];
const live=()=>!!API_URL && S.cur && (S.cur.key||S.cur.ln) && S.cur.status!=="Cancelled";
function tabState(t){
  const b=S.cur;
  if(t==="contract") return b.signedAt?["✓","signed"]:["!","needs signature"];
  if(t==="template") return b.template?["✓","chosen"]:["!","not chosen yet"];
  if(t==="details") return b.detailsAt?["✓","confirmed"]:["!","needs confirming"];
  if(t==="messages" && S.msgCount) return [String(S.msgCount), S.msgCount+" message"+(S.msgCount>1?"s":"")];
  return null;
}
function renderTabs(){
  const cur=S.tab||"bookings";
  $("tabs").innerHTML=TABS.map(([id,ic,label])=>{
    const st=tabState(id), done=st&&st[0]==="✓", cnt=st&&/^\d+$/.test(st[0]);
    return `<button type="button" role="tab" class="tab${done?" done":""}" id="tab-${id}" data-tab="${id}" aria-controls="pane-${id}" aria-selected="${id===cur}" tabindex="${id===cur?0:-1}" aria-label="${label}${st?", "+st[1]:""}">${st?`<div class="badge${cnt?" cnt":""}" aria-hidden="true">${st[0]}</div>`:""}<div class="ic">${ICONS[ic]}</div>${label}</button>`;
  }).join("");
  $("tabs").querySelectorAll(".tab").forEach(t=>t.onclick=()=>selectTab(t.dataset.tab));
  $("tabs").onkeydown=e=>{ const ids=TABS.map(t=>t[0]); let k=ids.indexOf(S.tab);
    if(e.key==="ArrowRight") k=(k+1)%ids.length; else if(e.key==="ArrowLeft") k=(k-1+ids.length)%ids.length; else return;
    e.preventDefault(); selectTab(ids[k]); $("tab-"+ids[k]).focus(); };
  const next = !live() ? null : !S.cur.signedAt ? ["contract","Next step: review and sign your contract to secure your date.","Sign contract"]
    : !S.cur.template ? ["template","Next step: choose the design for your photo prints.","Choose template"]
    : !S.cur.detailsAt ? ["details","Next step: confirm your event details and on-site contact.","Confirm details"] : null;
  $("nextStep").classList.toggle("hidden",!next);
  if(next){ $("nextText").textContent=next[1]; $("nextBtn").textContent=next[2]; $("nextBtn").onclick=()=>selectTab(next[0]); }
}
function selectTab(id){
  S.tab=id;
  TABS.forEach(([t])=>{ $("pane-"+t).classList.toggle("hidden",t!==id); const b=$("tab-"+t); if(b){ b.setAttribute("aria-selected",t===id); b.tabIndex=t===id?0:-1; } });
  if(id==="invoice") drawInvoice();
  if(id==="contract") openContract();
  if(id==="template") drawTemplates();
  if(id==="messages") loadMessages();
  if(id==="details") fillDetails();
}
const needLive=(el)=>{ if(live()) return true; $(el).innerHTML='<p class="intro">This is available once your booking is saved online. Please email inquiries@magicmirrorrentalservices.com.</p>'; return false; };

/* Invoice */
function drawInvoice(){
  const b=S.cur, due=b.total-b.paid, ev=new Date(b.date), dueBy=new Date(ev); dueBy.setDate(dueBy.getDate()-14);
  const kv=(k,v,c)=>`<div class="kv${c?" "+c:""}"><b>${k}</b><span>${v}</span></div>`;
  $("invoiceDoc").innerHTML=`<div class="inv-head"><div><img src="/images/brand/logo.webp" alt="Magic Mirror Rental Services" width="116" height="71"><p style="margin:10px 0 0">Magic Mirror Rental Services<br>inquiries@magicmirrorrentalservices.com</p></div>
    <div class="inv-meta"><h3 style="color:var(--paper-ink)">Invoice</h3><div>Invoice <b>#${b.id}</b></div><div>Issued <b>${esc(b.created||LONGDATE.format(new Date()))}</b></div><div>Status <b>${esc(b.status)}</b></div></div></div>
    <div class="inv-cols"><div><h4>Bill to</h4>${esc(b.fn)} ${esc(b.ln)}<br>${esc(b.email||"")}<br>${esc(b.phone||"")}${b.street?"<br>"+esc(b.street):""}</div>
    <div><h4>Event</h4>${esc(b.evName)}<br>${esc(isNaN(ev)?b.date:LONGDATE.format(ev))}, ${esc(b.start)}${b.end?" – "+esc(b.end):""}<br>${esc(b.vName)}<br>${esc(b.vAddr)} ${esc(b.vZip||"")}</div></div>
    <table class="summary"><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>${b.items.map(([n,p])=>`<tr><td>${esc(n)}</td><td>${money(p)}</td></tr>`).join("")}</tbody></table>
    <div class="inv-tot">${kv("Subtotal",money(b.total))}${kv("Paid",money(b.paid))}${kv("Balance due",money(due),"big")}</div>
    <p class="inv-note">A non-refundable ${money(CFG.deposit)} reservation fee is due when you sign your contract. The remaining balance is due by <b>${isNaN(dueBy)?"14 days before your event":LONGDATE.format(dueBy)}</b> (14 days before your event).</p>`;
}
$("printInvoice").onclick=()=>window.print();

/* Templates: the print designs from the site's Print templates page.
   [file, name, shape (l = landscape, p = portrait), occasions]. Names are what gets saved to the booking. */
const TEMPLATES=[
  ["dec14-ny-dr-4x6-ps","New Year","l","holiday",[1200,800],[[420,40,1150,555]]],
  ["holiday-cheer-2-4x6-drb","Holiday Cheer","l","holiday",[1200,800],[[120,39,1081,677]]],
  ["black-ice-2-4x6-cropped","Black Ice","l","holiday corporate",[1200,800],[[133,44,1066,656]]],
  ["fiesta-2-drb-4x6-single-pse","Fiesta","l","holiday birthday",[1200,800],[[157,27,1043,617]]],
  ["pot-o-gold-2-4x6-cropped","Pot o' Gold","l","holiday",[1200,800],[[136,47,1063,662]]],
  ["midnight-watercolor-drb-4x6-pse","Midnight Watercolor","l","wedding corporate",[1200,800],[[111,46,1088,692]]],
  ["baby-safari-1-portrait-mirror-4x6-cropped","Baby Safari","l","baby",[1200,800],[[37,43,406,598],[415,43,785,598],[794,43,1163,598]]],
  ["ever-after-portrait-mirror-1-4x6-cropped","Ever After","l","wedding birthday",[1200,800],[[42,43,409,596],[418,43,789,597],[798,43,1166,595]]],
  ["nov15a-dr-4x6-ps","Autumn Glow","l","holiday wedding",[1200,800],[[424,20,1194,520],[424,536,794,780],[808,536,1194,780]]],
  ["painted-leaves-portrait-mirror-1-cropped","Painted Leaves","l","wedding",[1200,800],[[40,41,410,596],[419,41,788,596],[797,41,1168,596]]],
  ["red-carpet-4x6-ps","Red Carpet","l","corporate birthday",[1200,807],[[89,66,717,501],[829,69,1130,265],[829,303,1129,501]]],
  ["sweetheart-black-1-4x6-cropped","Sweetheart Black","l","wedding",[1200,800],[[424,24,1173,521],[424,537,790,780],[807,537,1172,780]]],
  ["winterreds-single","Winter Reds","p","holiday",[1200,1785],[[214,155,988,1316]]],
  ["boo-2-portrait-mirror-4x6-full-bleed","Boo","p","holiday",[1200,1785],[[119,136,1081,1540]]],
  ["art-deco-2-portrait-mirror-4x6-cropped","Art Deco","p","wedding corporate",[1200,1800],[[109,127,1095,1600]]],
  ["b-w-grad-2-portrait-mirror-4x6-cropped","Black & White Grad","p","graduation",[1200,1800],[[180,280,1005,1515]]],
  ["birthday_vert_1","Birthday","p","birthday",[750,1125],[[141,151,608,900]]],
  ["babyshowerh","Baby Shower","p","baby",[750,1125],[[110,110,640,840]]],
  ["graduationv","Graduation","p","graduation",[750,1125],[[86,60,666,850]]],
  ["hope-2-portrait-mirror-4x6-cropped","Hope","p","corporate",[1200,1800],[[104,115,1093,1500]]]
].map(([f,name,shape,occ,size,wins])=>({f,name,shape,occ:occ.split(" "),size,wins}));
/* Photo-count versions. A design's own layout is shown as-is; other counts are a mock-up of how the
   photos would sit in its photo area until real artwork for that version is added. */
const VERSIONS=[1,2,3];
const vLabel=n=>n+" photo"+(n>1?"s":"");
const nativeN=t=>t.wins.length;
const tplValue=(name,n)=>name+" · "+vLabel(n);
const parseTpl=v=>{ const m=/^(.*) · (\d) photos?$/.exec(v||""); return m?[m[1],+m[2]]:[v||"",0]; };
const OCCASIONS=[["all","All"],["wedding","Wedding"],["birthday","Birthday"],["holiday","Holiday"],["graduation","Graduation"],["baby","Baby shower"],["corporate","Corporate"]];
const SHAPES=[["all","All shapes"],["l","Landscape"],["p","Portrait"]];
const ZOOM='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>';
const tplByName=n=>TEMPLATES.find(t=>t.name===n);
const tplSrc=(t,thumb)=>`/images/templates/${t.f}${thumb?"-thumb":""}.webp`;
S.tplOcc="all"; S.tplShape="all";
function drawChips(){
  const count=(o,sh)=>TEMPLATES.filter(t=>(o==="all"||t.occ.includes(o))&&(sh==="all"||t.shape===sh)).length;
  $("tplOcc").innerHTML=OCCASIONS.map(([id,l])=>`<button type="button" class="chip" data-v="${id}" aria-pressed="${S.tplOcc===id}">${l}<small>${count(id,S.tplShape)}</small></button>`).join("");
  $("tplShape").innerHTML=SHAPES.map(([id,l])=>`<button type="button" class="chip" data-v="${id}" aria-pressed="${S.tplShape===id}">${l}</button>`).join("");
  $("tplOcc").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{ S.tplOcc=c.dataset.v; drawChips(); drawTplGrid(); });
  $("tplShape").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{ S.tplShape=c.dataset.v; drawChips(); drawTplGrid(); });
}
function drawTplGrid(){
  const list=TEMPLATES.filter(t=>(S.tplOcc==="all"||t.occ.includes(S.tplOcc))&&(S.tplShape==="all"||t.shape===S.tplShape));
  const tile=t=>`<div class="tpl"><button type="button" role="radio" class="tplopt" aria-checked="${S.tplPick===t.name}" data-name="${esc(t.name)}"><img src="${tplSrc(t,1)}" alt="" width="600" height="${t.shape==="p"?900:400}" loading="lazy"><span>${esc(t.name)}<small>${vLabel(nativeN(t))}</small></span></button><button type="button" class="tplzoom" data-name="${esc(t.name)}" aria-label="Preview ${esc(t.name)} larger and choose photo count">${ZOOM}</button></div>`;
  const sec=(sh,label)=>{ const g=list.filter(t=>t.shape===sh); return g.length?`<section class="tplsec"><h4>${label} · ${g.length}</h4><div class="tplgrid ${sh==="l"?"land":"port"}">${g.map(tile).join("")}</div></section>`:""; };
  $("tplGrid").innerHTML=sec("l","Landscape prints")+sec("p","Portrait prints");
  $("tplEmpty").classList.toggle("hidden",list.length>0);
  $("tplGrid").querySelectorAll(".tplopt").forEach(o=>o.onclick=()=>pickTpl(o.dataset.name));
  $("tplGrid").querySelectorAll(".tplzoom").forEach(z=>z.onclick=()=>openTplView(z.dataset.name));
}
function pickTpl(name,n){
  const t=tplByName(name);
  S.tplPick=t?name:""; S.tplN=t?(n||S.tplN&&S.tplPick===name&&S.tplN||nativeN(t)):0;
  $("tplGrid").querySelectorAll(".tplopt").forEach(x=>x.setAttribute("aria-checked",x.dataset.name===S.tplPick));
  $("tplSel").textContent=t?tplValue(t.name,S.tplN):"None chosen yet";
  $("tplSelImg").classList.toggle("hidden",!t); if(t) $("tplSelImg").src=tplSrc(t,1);
  $("tplMsg").textContent=""; $("tplMsg").classList.remove("err");
}
/* Where the photos sit for a given count, in the design's own pixels */
function tplSlots(t,n){
  if(n===nativeN(t)) return t.wins;
  const x0=Math.min(...t.wins.map(w=>w[0])), y0=Math.min(...t.wins.map(w=>w[1])), x1=Math.max(...t.wins.map(w=>w[2])), y1=Math.max(...t.wins.map(w=>w[3]));
  const W=x1-x0, H=y1-y0, g=Math.round(Math.min(W,H)*.03);
  if(n===1) return [[x0,y0,x1,y1]];
  if(W>=H){ if(n===2){ const m=x0+(W-g)/2; return [[x0,y0,m,y1],[m+g,y0,x1,y1]]; }
    const m=x0+(W-g)*.6, h=y0+(H-g)/2; return [[x0,y0,m,y1],[m+g,y0,x1,h],[m+g,h+g,x1,y1]]; }
  const h=(H-g*(n-1))/n; return Array.from({length:n},(_,i)=>[x0,y0+i*(h+g),x1,y0+i*(h+g)+h]);
}
const CAM='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
function drawTplPreview(){
  const t=tplByName(S.tplViewing), n=S.tplViewN, [W,H]=t.size, pc=(v,d)=>(v/d*100).toFixed(2)+"%";
  const box=(r,cls,inner)=>`<div class="${cls}" style="left:${pc(r[0],W)};top:${pc(r[1],H)};width:${pc(r[2]-r[0],W)};height:${pc(r[3]-r[1],H)}">${inner||""}</div>`;
  const native=n===nativeN(t);
  const x0=Math.min(...t.wins.map(w=>w[0])), y0=Math.min(...t.wins.map(w=>w[1])), x1=Math.max(...t.wins.map(w=>w[2])), y1=Math.max(...t.wins.map(w=>w[3]));
  $("tplSlots").innerHTML=(native?"":box([x0,y0,x1,y1],"tplmat"))+tplSlots(t,n).map((r,i)=>box(r,"tplslot",CAM+"<b>Photo "+(i+1)+"</b>")).join("");
  $("tplVers").querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-checked",+c.dataset.n===n));
  $("tplVerNote").textContent=native?"This is the design's original layout.":"Mock-up: we'll adjust the artwork for "+vLabel(n)+" and show it on your proof.";
  const chosen=S.tplPick===t.name&&S.tplN===n;
  $("tplViewPick").textContent=chosen?"✓ Chosen":"Choose this design, "+vLabel(n);
}
function openTplView(name){
  const t=tplByName(name); if(!t) return; S.tplViewing=name;
  S.tplViewN = S.tplPick===name&&S.tplN ? S.tplN : nativeN(t);
  const occ=t.occ.map(o=>OCCASIONS.find(x=>x[0]===o)[1]).join(" · ");
  $("tplViewTags").textContent=occ+" · "+(t.shape==="p"?"Portrait":"Landscape");
  $("tplViewName").textContent=t.name;
  $("tplViewPrint").className="tplprint"+(t.shape==="p"?" port":"");
  $("tplViewImg").src=tplSrc(t,0);
  $("tplVers").innerHTML=VERSIONS.map(n=>`<button type="button" class="chip" role="radio" data-n="${n}">${vLabel(n)}</button>`).join("");
  $("tplVers").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{ S.tplViewN=+c.dataset.n; drawTplPreview(); });
  $("tplViewText").value=$("tplText").value; $("tplViewOv").textContent=$("tplText").value;
  drawTplPreview();
  const d=$("tplView"); if(d.showModal) d.showModal(); else d.setAttribute("open","");
}
function closeTplView(){ const d=$("tplView"); if(d.close) d.close(); else d.removeAttribute("open"); }
$("tplViewClose").onclick=closeTplView;
$("tplView").addEventListener("click",e=>{ if(e.target===$("tplView")) closeTplView(); });
$("tplViewText").oninput=()=>{ $("tplText").value=$("tplViewText").value; $("tplViewOv").textContent=$("tplViewText").value; };
$("tplViewPick").onclick=()=>{ pickTpl(S.tplViewing,S.tplViewN); closeTplView(); const o=$("tplGrid").querySelector(`.tplopt[aria-checked="true"]`); if(o) o.focus(); };
function drawTemplates(){
  if(!needLive("tplGrid")) return;
  const b=S.cur;
  if(!S.tplPick){ const [n,c]=parseTpl(b.template); S.tplPick=n; S.tplN=c; }
  if(b.customPrint) $("tplIntro").textContent="You chose a custom design. Pick the closest style below as a starting point, and add your text. We'll send you a proof.";
  drawChips(); drawTplGrid(); pickTpl(S.tplPick,S.tplN);
  if(!$("tplText").value) $("tplText").value=b.templateText||"";
  $("tplMsg").textContent = b.template ? `Saved: ${b.template}.` : "";
}
$("tplSave").onclick=async()=>{
  const m=$("tplMsg"); m.classList.remove("err");
  if(!S.tplPick){ m.classList.add("err"); m.textContent="Please choose a template."; return; }
  const val=tplValue(S.tplPick,S.tplN);
  const btn=$("tplSave"); btn.disabled=true; btn.textContent="Saving…";
  try{ const r=await api(null,{action:"template",...auth(),template:val,templateText:$("tplText").value});
    if(r.ok){ S.cur.template=val; S.cur.templateText=$("tplText").value; m.textContent=`Saved: ${val}. We'll send you a proof before your event.`; renderTabs(); }
    else { m.classList.add("err"); m.textContent="We couldn't save your template. Please try again."; } }
  catch(e){ m.classList.add("err"); m.textContent="We couldn't reach the booking system. Please try again."; }
  btn.disabled=false; btn.textContent="Save template";
};

/* Messages */
function drawThread(list){
  S.msgCount=list.length;
  $("thread").innerHTML = list.length ? list.map(x=>`<div class="bubble${x.from==="You"?" me":""}"><small>${esc(x.from)} · ${esc(x.at)}</small></div>`).join("") : '<p class="empty">No messages yet.</p>';
  $("thread").querySelectorAll(".bubble").forEach((el,i)=>el.appendChild(document.createTextNode(list[i].text)));
}
async function loadMessages(){
  if(!needLive("thread")) return;
  $("thread").innerHTML='<p class="empty">Loading messages…</p>';
  try{ const r=await api(null,{action:"messages",...auth()}); if(r.ok){ drawThread(r.messages); renderTabs(); } }
  catch(e){ $("thread").innerHTML='<p class="empty">We couldn\'t load your messages.</p>'; }
}
$("msgSend").onclick=async()=>{
  const t=$("msgText").value.trim(), st=$("msgStatus"); st.classList.remove("err");
  if(!t){ st.classList.add("err"); st.textContent="Please type a message."; $("msgText").focus(); return; }
  const btn=$("msgSend"); btn.disabled=true; btn.textContent="Sending…";
  try{ const r=await api(null,{action:"message",...auth(),text:t});
    if(r.ok){ drawThread(r.messages); renderTabs(); $("msgText").value=""; st.textContent="Message sent. We'll reply by email and here."; }
    else { st.classList.add("err"); st.textContent="We couldn't send your message. Please try again."; } }
  catch(e){ st.classList.add("err"); st.textContent="We couldn't reach the booking system. Please email inquiries@magicmirrorrentalservices.com."; }
  btn.disabled=false; btn.textContent="Send message";
};

/* Confirm details */
function fillDetails(){
  const b=S.cur, kv=(k,v)=>`<div class="kv"><b>${k}</b><span>${esc(v||"")}</span></div>`;
  $("detailsSummary").innerHTML=kv("Event",b.evName)+kv("Date",b.date)+kv("Time",b.start+(b.end?" – "+b.end:""))+kv("Venue",b.vName)+kv("Address",(b.vAddr||"")+" "+(b.vZip||""));
  $("dName").value=b.onsiteName||$("dName").value||`${b.fn} ${b.ln}`; $("dPhone").value=b.onsitePhone||$("dPhone").value||b.phone||"";
  $("dGuests").value=b.guests||$("dGuests").value; $("dNotes").value=b.setupNotes||$("dNotes").value;
  $("dMsg").classList.remove("err"); $("dMsg").textContent=b.detailsAt?`Confirmed on ${b.detailsAt}. You can update and confirm again any time.`:"";
  if(!live()){ $("dSave").disabled=true; $("dMsg").textContent="Available once your booking is saved online."; }
}
$("detailsForm").addEventListener("submit",async e=>{
  e.preventDefault(); const m=$("dMsg"); m.classList.remove("err");
  ["dName","dPhone","dConfirm"].forEach(id=>$(id).removeAttribute("aria-invalid"));
  const bad=(t,id)=>{ m.classList.add("err"); m.textContent=t; $(id).setAttribute("aria-invalid","true"); $(id).focus(); };
  if(!$("dName").value.trim()) return bad("Please enter an on-site contact name.","dName");
  if(!$("dPhone").value.trim()) return bad("Please enter an on-site contact phone.","dPhone");
  if(!$("dConfirm").checked) return bad("Please confirm the details are correct.","dConfirm");
  const btn=$("dSave"); btn.disabled=true; btn.textContent="Saving…";
  const body={action:"details",...auth(),onsiteName:$("dName").value,onsitePhone:$("dPhone").value,guests:$("dGuests").value,setupNotes:$("dNotes").value,confirm:true};
  try{ const r=await api(null,body);
    if(r.ok){ Object.assign(S.cur,{onsiteName:body.onsiteName,onsitePhone:body.onsitePhone,guests:body.guests,setupNotes:body.setupNotes,detailsAt:r.detailsAt}); m.textContent=`Thank you. Details confirmed on ${r.detailsAt}.`; renderTabs(); }
    else { m.classList.add("err"); m.textContent="We couldn't save your details. Please try again."; } }
  catch(err){ m.classList.add("err"); m.textContent="We couldn't reach the booking system. Please try again."; }
  btn.disabled=false; btn.textContent="Confirm details";
});

/* ===== Contract signing ===== */
async function openContract(){
  const b=S.cur;
  if(!live()){ $("contractDoc").textContent="Your contract is available once your booking is saved online."; $("signForm").classList.add("hidden"); return; }
  $("contractDoc").textContent="Loading contract…"; $("signMsg").textContent="";
  $("signForm").classList.add("hidden"); $("signedNote").classList.add("hidden");
  try{
    const r=await api(null,{action:"contract",...auth()});
    if(!r.ok){ $("contractDoc").textContent="We couldn't load your contract. Please email inquiries@magicmirrorrentalservices.com."; return; }
    $("contractDoc").innerHTML=r.html; $("consentText").textContent=r.consent;
    const signed=!!r.signedAt;
    $("signForm").classList.toggle("hidden",signed);
    $("signedNote").classList.toggle("hidden",!signed);
    if(signed) $("signedNote").textContent=`Signed by ${r.signer} on ${r.signedAt}. A copy was emailed to you.`;
    else { if(!$("signerName").value) $("signerName").value=`${b.fn} ${b.ln}`; sizePad(); }
  }catch(e){ $("contractDoc").textContent="We couldn't reach the booking system. Please try again."; }
}

// signature pad: draw with mouse/finger, or type a name
const pad=$("sigPad"), pctx=pad.getContext("2d"); let drawing=false, inked=false, sigMode="draw";
function sizePad(){
  const r=pad.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  pad.width=Math.round(r.width*dpr); pad.height=Math.round(r.height*dpr);
  pctx.setTransform(dpr,0,0,dpr,0,0); clearPad();
}
function clearPad(){ pctx.fillStyle="#ffffff"; pctx.fillRect(0,0,pad.width,pad.height); inked=false; if(sigMode==="type") drawTyped(); }
function pos(e){ const r=pad.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; }
pad.addEventListener("pointerdown",e=>{ if(sigMode!=="draw") return; drawing=true; pad.setPointerCapture(e.pointerId); const [x,y]=pos(e); pctx.beginPath(); pctx.moveTo(x,y); });
pad.addEventListener("pointermove",e=>{ if(!drawing) return; const [x,y]=pos(e); pctx.lineTo(x,y); pctx.strokeStyle="#17121b"; pctx.lineWidth=2.4; pctx.lineCap="round"; pctx.lineJoin="round"; pctx.stroke(); inked=true; });
["pointerup","pointercancel","pointerleave"].forEach(t=>pad.addEventListener(t,()=>{ drawing=false; }));
function drawTyped(){
  const t=$("sigTyped").value.trim(); const r=pad.getBoundingClientRect();
  pctx.fillStyle="#ffffff"; pctx.fillRect(0,0,r.width,r.height);
  if(!t){ inked=false; return; }
  pctx.fillStyle="#17121b"; pctx.font='600 46px "Dancing Script", cursive'; pctx.textBaseline="middle"; pctx.fillText(t,24,r.height/2,r.width-48); inked=true;
}
function setMode(m){
  sigMode=m; $("modeDraw").setAttribute("aria-pressed",m==="draw"); $("modeType").setAttribute("aria-pressed",m==="type");
  $("typeWrap").classList.toggle("hidden",m!=="type");
  $("sigHelp").textContent = m==="draw" ? "Click and drag with your mouse, or sign with your finger on a phone or tablet." : "Your typed name is shown in the box as your signature.";
  clearPad(); if(m==="type"){ if(!$("sigTyped").value) $("sigTyped").value=$("signerName").value; document.fonts.load('600 46px "Dancing Script"').then(drawTyped); $("sigTyped").focus(); }
}
$("modeDraw").onclick=()=>setMode("draw"); $("modeType").onclick=()=>setMode("type");
$("sigTyped").addEventListener("input",drawTyped);
$("sigClear").onclick=()=>{ if(sigMode==="type") $("sigTyped").value=""; clearPad(); };
window.addEventListener("resize",()=>{ if(!$("pane-contract").classList.contains("hidden") && !inked) sizePad(); });

$("signForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const msg=$("signMsg"), name=$("signerName").value.trim(), title=$("signerTitle").value.trim();
  const fail=(t,el)=>{ msg.textContent=t; if(el){ el.setAttribute("aria-invalid","true"); el.focus(); } };
  ["signerName","signerTitle","esignConsent"].forEach(id=>$(id).removeAttribute("aria-invalid"));
  if(!inked) return fail("Please add your signature in the box.", sigMode==="type"?$("sigTyped"):$("modeDraw"));
  if(!name) return fail("Please enter the signer's name.",$("signerName"));
  if(!title) return fail("Please enter the signer's title, e.g. Client.",$("signerTitle"));
  if(!$("esignConsent").checked) return fail("Please agree to sign electronically.",$("esignConsent"));
  const btn=$("signBtn"); btn.disabled=true; btn.textContent="Signing…"; msg.textContent="";
  const body={ action:"sign", ...auth(), signerName:name, signerTitle:title,
    modelRelease:$("modelRelease").checked, consent:true, signature:pad.toDataURL("image/png") };
  let r=null;
  try{ r=await api(null,body); }catch(err){}
  btn.disabled=false; btn.textContent="Accept & sign";
  if(r && r.ok){
    S.cur.signedAt=r.signedAt; openContract(); renderTabs();
  } else if(r && r.error==="ALREADY_SIGNED"){ openContract(); }
  else msg.textContent="We couldn't save your signature. Please try again, or email inquiries@magicmirrorrentalservices.com.";
});

/* ===== Online payment (Stripe Checkout) ===== */
async function startPay(amount,btn){
  const note=$("payNote"), amt=Math.round(parseFloat(String(amount).replace(/[^\d.]/g,""))*100)/100;
  if(!(amt>=1)){ note.textContent="Enter an amount of at least $1.00."; $("payAmt").focus(); return; }
  btn.disabled=true; btn.textContent="Opening secure payment…"; note.textContent="";
  try{ const r=await api(null,{action:"pay",...auth(),amount:amt});
    if(r.ok&&r.url){ location.href=r.url; return; }
    note.textContent=r.error==="NOT_FOUND"?"We couldn't find your booking. Please look it up again.":(r.error||"We couldn't start the payment. Please try again.");
  }catch(e){ note.textContent="We couldn't reach the payment system. Please try again, or email inquiries@magicmirrorrentalservices.com."; }
  btn.disabled=false; btn.textContent="Make payment";
}

/* ===== Deep link from emails and Stripe: /booking/?id=123&k=<private key>[&paid=cs_…|&paycancel=1]
   Older emails use &ln=Smith instead of a key; those go through the emailed-code step. ===== */
(async()=>{ const q=new URLSearchParams(location.search), id=q.get("id"), ln=q.get("ln");
  if(!id) return;
  const key=q.get("k")||keys.get(id), paid=q.get("paid"), cancelled=q.get("paycancel");
  $("mId").value=id; if(ln) $("mSur").value=ln;
  history.replaceState(null,"",location.pathname+"?id="+encodeURIComponent(id));   // keep the key out of the address bar
  if(!key){ if(ln) $("searchBtn").click(); return; }
  try{
    if(paid){
      $("manageMsg").textContent="Confirming your payment…";
      const r=await api(null,{action:"confirmPay",id,key,session:paid});
      if(r.ok){ openWithBooking(r.booking,false); $("manageMsg").textContent=""; $("payBtn").scrollIntoView({block:"center"});
        $("payNote").textContent="Thank you! Your payment of "+money(r.amount)+" was received. A receipt is on its way to your email."; return; }
      $("manageMsg").textContent=r.error||"We couldn't confirm your payment yet. If you were charged, we'll update your booking shortly.";
    }
    const r=await api(null,{action:"lookup",id,key});
    if(!r.ok){ $("manageMsg").textContent="That link has expired. Enter your last name and click Search, and we'll email you a code."; return; }
    if(!paid) $("manageMsg").textContent="";
    openWithBooking(r.booking,false);
    if(cancelled){ $("payBtn").scrollIntoView({block:"center"}); $("payNote").textContent="Payment cancelled. Nothing was charged."; }
  }catch(e){ $("manageMsg").textContent="We couldn't reach the booking system. Please try again."; }
})();

/* ===== Preview-only demo: on a pages.dev preview or localhost, /booking/?demo=template opens a sample
   booking on the Choose Template tab so designs can be reviewed without a real booking. Nothing is sent
   to the booking system. Never runs on the live domain. ===== */
if(/\.pages\.dev$|^localhost$|^127\./.test(location.hostname) && new URLSearchParams(location.search).get("demo")){
  S.demo=true;
  renderPortal({id:"DEMO",key:"demo",date:"2027-06-14",start:"6:00 PM",end:"10:00 PM",arrive:"5:00 PM",depart:"10:30 PM",evName:"Sample wedding",vName:"Sample venue",vAddr:"Boston, MA",vZip:"",status:"Booked",fn:"Sample",ln:"Client",email:"",phone:"",items:[["Silver Package",850]],total:850,paid:250,signedAt:"demo"},false);
  const t=new URLSearchParams(location.search).get("demo"); if(TABS.some(x=>x[0]===t)) selectTab(t);
}
