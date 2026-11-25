const $=id=>document.getElementById(id);
const esc=t=>String(t==null?"":t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
// Requests go through the site's /api/booking, which checks the bot test and forwards to Apps Script.
const API_URL="/api/booking";
const mmTS=window.mmTS||{ render(){}, async token(){ return ""; }, reset(){} };
const store={ get:k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set:(k,v)=>{ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch(e){} } };
let TOKEN=store.get("mmrsToken");
async function post(body){ const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); return r.json(); }
const loginError=r=>r.error==="BOT_CHECK"?"We couldn't confirm you're not a robot. Wait a moment and try again.":r.error==="TOO_MANY"?"Too many tries. Wait 15 minutes and try again.":r.error;
async function run(fn,...args){
  const r=await post({action:"adminCall",token:TOKEN,fn,args});
  if(r.ok) return r.value;
  if(r.error==="SIGNED_OUT"){ signOut(true); throw new Error("Please sign in again"); }
  throw new Error(r.error||"Something went wrong");
}
const key=d=>{ const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d||""); return m?Number(m[3]+m[1]+m[2]):0; };
const fromKey=k=>new Date(Math.floor(k/10000),Math.floor(k/100)%100-1,k%100);
const SHORT=new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
const pretty=d=>key(d)?SHORT.format(fromKey(key(d))):d;
const bal=b=>Math.round((b.total-b.paid)*100)/100;
let D=null, cur=null, view="overview", calM=null;

function toast(t){ const el=$("toast"); el.textContent=t; el.classList.remove("hidden"); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.add("hidden"),2600); }
function fail(e){ toast("That didn't save: "+(e&&e.message||e)+". Click Refresh and try again."); }

function setAuthed(on){
  document.querySelector("header nav").classList.toggle("hidden",!on);
  ["refresh","signout","signoutAll","who","pwBtn"].forEach(id=>$(id).classList.toggle("hidden",!on));
  $("v-login").classList.toggle("hidden",on);
  if(!on){ document.querySelectorAll("main>section:not(#v-login)").forEach(s=>s.classList.add("hidden")); $("loading").classList.add("hidden"); }
}
async function load(){
  if(!TOKEN){ setAuthed(false); $("lEmail").focus(); return; }
  setAuthed(true); $("loading").classList.remove("hidden"); $("loading").textContent="Loading bookings…";
  $("who").textContent=store.get("mmrsEmail")||"";
  try{ D=await run("adminData"); }catch(e){ if(TOKEN) $("loading").textContent="Couldn't load: "+(e.message||e); return; }
  $("loading").classList.add("hidden"); setup(); restore();
}
function signOut(silent){
  if(TOKEN&&!silent) post({action:"adminLogout",token:TOKEN}).catch(()=>{});
  TOKEN=null; store.set("mmrsToken",null); closeDrawer&&cur&&closeDrawer();
  setAuthed(false); $("pwForm").classList.remove("hidden"); $("emailForm").classList.add("hidden"); $("codeForm").classList.add("hidden");
  $("lMsg").textContent=silent?"Your session ended. Please sign in again.":"";
}
$("signout").onclick=()=>signOut(false);
$("signoutAll").onclick=async()=>{
  if(!confirm("Sign out on every phone and computer, including this one?")) return;
  try{ await post({action:"adminSignOutAll",token:TOKEN}); }catch(e){}
  signOut(true); $("lMsg").textContent="You're signed out everywhere. Sign in again to continue.";
};
function signedIn(r){ TOKEN=r.token; store.set("mmrsToken",r.token); store.set("mmrsEmail",r.email); $("lMsg").textContent=""; $("lCode").value=""; $("lPw").value=""; load(); }
$("pwForm").onsubmit=async e=>{ e.preventDefault(); const btn=e.target.querySelector("button[type=submit]"); btn.disabled=true; $("lMsg").textContent="Signing in…";
  try{ const r=await post({action:"adminLogin",email:$("lEmail").value,password:$("lPw").value,ts:await mmTS.token($("tsLogin"))}); mmTS.reset($("tsLogin")); if(r.ok) signedIn(r); else $("lMsg").textContent=loginError(r); }
  catch(err){ $("lMsg").textContent="Couldn't reach the booking system. Try again."; } btn.disabled=false; };
$("useCode").onclick=()=>{ if(!$("lEmail").reportValidity()) return; $("codeTo").textContent=$("lEmail").value; $("pwForm").classList.add("hidden"); $("emailForm").classList.remove("hidden"); $("lMsg").textContent=""; };
$("usePw").onclick=()=>{ $("emailForm").classList.add("hidden"); $("pwForm").classList.remove("hidden"); $("lMsg").textContent=""; };
$("pwBtn").onclick=()=>{ $("pwUser").value=store.get("mmrsEmail")||""; $("pw1").value=""; $("pw2").value=""; $("pwMsg").textContent=""; $("pwDlg").showModal(); $("pw1").focus(); };
$("pwCancel").onclick=()=>$("pwDlg").close();
$("setPwForm").onsubmit=async e=>{ e.preventDefault();
  if($("pw1").value!==$("pw2").value){ $("pwMsg").textContent="The two passwords don't match."; return; }
  $("pwSave").disabled=true; $("pwMsg").textContent="Saving…";
  try{ const r=await post({action:"adminSetPassword",token:TOKEN,password:$("pw1").value});
    if(r.ok){ $("pwDlg").close(); toast("Password saved"); } else if(r.error==="SIGNED_OUT"){ $("pwDlg").close(); signOut(true); } else $("pwMsg").textContent=r.error;
  }catch(err){ $("pwMsg").textContent="Couldn't reach the booking system. Try again."; } $("pwSave").disabled=false; };
$("emailForm").onsubmit=async e=>{ e.preventDefault(); const btn=e.target.querySelector("button"); btn.disabled=true; $("lMsg").textContent="Sending…";
  try{ const r=await post({action:"adminCode",email:$("lEmail").value,ts:await mmTS.token($("tsLogin"))}); mmTS.reset($("tsLogin"));
    if(!r.ok){ $("lMsg").textContent=loginError(r); btn.disabled=false; return; }
    $("emailForm").classList.add("hidden"); $("pwForm").classList.add("hidden"); $("codeForm").classList.remove("hidden");
    $("codeSent").textContent="If "+$("lEmail").value+" is an owner account, a code is on its way. It expires in 10 minutes."; $("lMsg").textContent=""; $("lCode").focus();
  }catch(err){ $("lMsg").textContent="Couldn't reach the booking system. Try again."; } btn.disabled=false; };
$("codeForm").onsubmit=async e=>{ e.preventDefault(); const btn=e.target.querySelector("button[type=submit]"); btn.disabled=true; $("lMsg").textContent="Checking…";
  try{ const r=await post({action:"adminVerify",email:$("lEmail").value,code:$("lCode").value});
    if(r.ok) signedIn(r);
    else $("lMsg").textContent=r.error;
  }catch(err){ $("lMsg").textContent="Couldn't reach the booking system. Try again."; } btn.disabled=false; };
$("backBtn").onclick=()=>{ $("codeForm").classList.add("hidden"); $("pwForm").classList.remove("hidden"); $("lMsg").textContent=""; $("lEmail").focus(); };
function setData(d){ D=d; draw(); if(cur) openBooking(cur, true); }

let didSetup=false;
function setup(){
  if(didSetup) return; didSetup=true;
  D.statuses.forEach(s=>$("fstatus").add(new Option(s,s)));
  [...new Set(D.bookings.map(b=>b.type).filter(Boolean))].sort().forEach(t=>$("ftype").add(new Option(t,t)));
  D.staff.forEach(s=>$("fstaff").add(new Option(s,s)));
  const t=key(D.today); calM=new Date(Math.floor(t/10000),Math.floor(t/100)%100-1,1);
}

function show(v){
  view=v; document.querySelectorAll("nav button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===v));
  document.querySelectorAll("main>section").forEach(s=>s.classList.toggle("hidden",s.id!=="v-"+v));
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{ show(b.dataset.v); draw(); saveState(); });
$("refresh").onclick=async()=>{ $("refresh").disabled=true; try{ setData(await run("adminData")); toast("Up to date"); }catch(e){fail(e);} $("refresh").disabled=false; };

/* ---------- derived ---------- */
const today=()=>key(D.today);
const live=b=>b.status!=="Cancelled";
const upcoming=()=>D.bookings.filter(b=>live(b)&&key(b.date)>=today()).sort((a,b)=>key(a.date)-key(b.date));
function convos(){
  const m={}; D.messages.forEach(x=>{ (m[x.id]=m[x.id]||[]).push(x); });
  return Object.keys(m).map(id=>{ const list=m[id].sort((a,b)=>a.ts-b.ts); const last=list[list.length-1];
    return { id:Number(id), list, last, needs:last.from==="Client" }; }).sort((a,b)=>b.last.ts-a.last.ts);
}
const byId=id=>D.bookings.find(b=>b.id===Number(id));
const daysTo=b=>Math.round((fromKey(key(b.date))-fromKey(today()))/864e5);

function draw(){
  $("loading").classList.add("hidden");
  const n=convos().filter(c=>c.needs).length; $("msgBadge").innerHTML=n?`<span class="badge">${n}</span>`:"";
  ({overview:drawOverview,bookings:drawBookings,calendar:drawCal,messages:drawMessages,blocked:drawBlocked})[view]();
  show(view);
}

function rowHtml(b,sub){
  return `<button type="button" class="row" data-id="${b.id}"><span class="when">${esc(pretty(b.date).replace(/, \d{4}$/,""))}</span>
    <span class="what"><b>${esc(b.evName||"(no name)")}</b><small>${esc(sub||(b.fn+" "+b.ln+" · "+b.pkg))}</small></span>
    <span class="pill s-${esc(b.status)}">${esc(b.status)}</span></button>`;
}
function bindRows(el){ el.querySelectorAll("[data-id]").forEach(r=>r.onclick=()=>openBooking(Number(r.dataset.id))); }

function drawOverview(){
  const up=upcoming(), yr=String(today()).slice(0,4);
  const thisYear=D.bookings.filter(b=>live(b)&&String(key(b.date)).slice(0,4)===yr);
  const unconf=up.filter(b=>b.status==="Unconfirmed").length;
  const owed=up.reduce((s,b)=>s+Math.max(0,bal(b)),0);
  const next30=up.filter(b=>daysTo(b)<=30).length;
  $("stats").innerHTML=[
    [up.length,"Upcoming events"],[next30,"In the next 30 days"],[unconf,"Unconfirmed upcoming"],
    [money(owed),"Balance owed (upcoming)"],[money(thisYear.reduce((s,b)=>s+b.paid,0)),yr+" collected"],[thisYear.length,yr+" bookings"]
  ].map(([v,l])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  $("nextList").innerHTML=up.slice(0,8).map(b=>rowHtml(b,`${b.start}–${b.end} · ${b.vName}`)).join("")||`<div class="empty">No upcoming events.</div>`;
  const attn=[];
  up.forEach(b=>{
    if(b.status==="Unconfirmed") attn.push([b,"Not confirmed yet"]);
    if(!b.signedAt && !/imported/i.test(b.notes)) attn.push([b,"Contract not signed"]);
    if(bal(b)>0 && daysTo(b)<=14) attn.push([b,`${money(bal(b))} due — event in ${daysTo(b)} days`]);
    if(!b.staff && daysTo(b)<=21) attn.push([b,"No staff assigned"]);
  });
  convos().filter(c=>c.needs).forEach(c=>{ const b=byId(c.id); if(b) attn.unshift([b,"Message waiting: "+c.last.text.slice(0,60)]); });
  $("attnList").innerHTML=attn.slice(0,12).map(([b,t])=>rowHtml(b,t)).join("")||`<div class="empty">All caught up.</div>`;
  bindRows($("nextList")); bindRows($("attnList"));
}

/* ---------- bookings ---------- */
["fq","fwhen","fstatus","fpaid","ftype","fstaff"].forEach(id=>$(id).addEventListener("input",drawBookings));
function drawBookings(){
  const q=$("fq").value.trim().toLowerCase(), w=$("fwhen").value, st=$("fstatus").value, pd=$("fpaid").value, ty=$("ftype").value, sf=$("fstaff").value, t=today();
  let list=D.bookings.filter(b=>{
    const k=key(b.date);
    if(w==="up"&&k<t) return false; if(w==="past"&&k>=t) return false;
    if(st&&b.status!==st) return false; if(ty&&b.type!==ty) return false;
    if(pd==="owe"&&!(bal(b)>0)) return false; if(pd==="paid"&&bal(b)>0) return false;
    if(sf==="-"&&b.staff) return false; if(sf&&sf!=="-"&&b.staff.split(",").map(s=>s.trim()).indexOf(sf)===-1) return false;
    if(q&&![b.id,b.fn,b.ln,b.evName,b.vName,b.email,b.phone,b.vAddr].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
  list.sort((a,b)=>w==="up"?key(a.date)-key(b.date):key(b.date)-key(a.date));
  $("tbody").innerHTML=list.map(b=>`<tr data-id="${b.id}"><td><button type="button" class="idbtn" aria-label="Open booking ${b.id}, ${esc(b.fn+" "+b.ln)}">#${b.id}</button></td><td>${esc(pretty(b.date))}</td><td>${esc(b.fn+" "+b.ln)}</td>
    <td class="ev">${esc(b.evName)}</td><td>${esc(b.pkg.replace(" Package",""))}</td><td><span class="pill s-${esc(b.status)}">${esc(b.status)}</span></td>
    <td class="num">${money(b.total)}</td><td class="num ${bal(b)>0?"owe":""}">${money(bal(b))}</td><td>${esc(b.staff||"—")}</td></tr>`).join("")
    ||`<tr><td colspan="9" class="empty">No bookings match.</td></tr>`;
  $("tbody").querySelectorAll("tr[data-id]").forEach(r=>{ r.onclick=()=>openBooking(Number(r.dataset.id)); });
  $("count").textContent=`${list.length} booking${list.length===1?"":"s"} · ${money(list.reduce((s,b)=>s+b.total,0))} total · ${money(list.reduce((s,b)=>s+Math.max(0,bal(b)),0))} owed`;
}

/* ---------- calendar ---------- */
const MONTH=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"});
$("calPrev").onclick=()=>{ calM.setMonth(calM.getMonth()-1); drawCal(); };
$("calNext").onclick=()=>{ calM.setMonth(calM.getMonth()+1); drawCal(); };
$("calToday").onclick=()=>{ const t=today(); calM=new Date(Math.floor(t/10000),Math.floor(t/100)%100-1,1); drawCal(); };
const k8=d=>d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
const COLORS={Unconfirmed:"#4a3a12;color:#ffd27a",Confirmed:"#123a2a;color:#7be0b0",Completed:"#2a2a35;color:#bdb6c6",Cancelled:"#3d1517;color:#ff9a9d"};
function drawCal(){
  $("calTitle").textContent=MONTH.format(calM);
  const start=new Date(calM); start.setDate(1-start.getDay());
  const blocked={}; D.blocked.forEach(x=>blocked[key(x.date)]=x.reason||"Blocked");
  const byDay={}; D.bookings.forEach(b=>{ (byDay[key(b.date)]=byDay[key(b.date)]||[]).push(b); });
  let h=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>`<div class="dow">${d}</div>`).join("");
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const k=k8(d);
    const cls=["day"]; if(d.getMonth()!==calM.getMonth()) cls.push("out"); if(k===today()) cls.push("today"); if(blocked[k]) cls.push("blocked");
    h+=`<div class="${cls.join(" ")}" ${blocked[k]?`title="${esc(blocked[k])}"`:""}><span class="n">${d.getDate()}</span>${(byDay[k]||[]).map(b=>
      `<button type="button" class="chip" style="background:${COLORS[b.status]}" data-id="${b.id}" title="${esc(b.evName)}">${esc(b.start)} ${esc(b.evName)}</button>`).join("")}
      ${blocked[k]?`<span class="chip" style="background:none;color:var(--muted)">⛔ ${esc(blocked[k])}</span>`:""}</div>`;
  }
  $("cal").innerHTML=h; bindRows($("cal"));
}

/* ---------- messages ---------- */
function drawMessages(){
  const cs=convos();
  $("convList").innerHTML=cs.map(c=>{ const b=byId(c.id)||{id:c.id,evName:"Booking #"+c.id,fn:"",ln:"",date:"",status:""};
    return `<button type="button" class="row" data-id="${c.id}"><span class="when">${esc(c.last.at.split(" ")[0])}</span>
      <span class="what"><b>${esc(b.fn+" "+b.ln)} · #${c.id} ${esc(b.evName)}</b><small>${esc((c.last.from==="Client"?"":"You: ")+c.last.text)}</small></span>
      ${c.needs?`<span class="pill s-Unconfirmed">Needs reply</span>`:""}</button>`; }).join("")||`<div class="empty">No messages yet. Clients can message you from their booking portal.</div>`;
  $("convList").querySelectorAll("[data-id]").forEach(r=>r.onclick=()=>openBooking(Number(r.dataset.id),false,"msgs"));
}

/* ---------- blocked ---------- */
function drawBlocked(){
  const list=[...D.blocked].sort((a,b)=>key(a.date)-key(b.date)).filter(x=>key(x.date)>=today());
  $("blockList").innerHTML=list.map(x=>`<div class="row" style="cursor:default"><span class="when">${esc(x.date)}</span><span class="what"><b>${esc(pretty(x.date))}</b><small>${esc(x.reason||"—")}</small></span>
    <button type="button" class="btn ghost" data-un="${esc(x.date)}">Unblock</button></div>`).join("")||`<div class="empty">No upcoming blocked dates.</div>`;
  $("blockList").querySelectorAll("[data-un]").forEach(b=>b.onclick=async()=>{ if(!confirm(`Unblock ${b.dataset.un}? Clients will be able to book it again.`)) return; b.disabled=true; try{ setData(await run("adminUnblock",b.dataset.un)); toast("Date unblocked"); }catch(e){fail(e); b.disabled=false;} });
}
$("blockForm").onsubmit=async e=>{ e.preventDefault(); const v=$("bDate").value; if(!v) return;
  const [y,m,d]=v.split("-"); const date=`${m}/${d}/${y}`;
  if(D.bookings.some(b=>live(b)&&b.date===date) && !confirm("There's already a booking on this date. Block it anyway?")) return;
  try{ setData(await run("adminBlock",date,$("bReason").value)); $("blockForm").reset(); toast("Blocked "+date); }catch(err){fail(err);} };

/* ---------- booking drawer ---------- */
const METHODS=["Credit card (Square)","PayPal","Stripe","Cash","Check","Zelle","Venmo","Other"];
let opener=null;
function openBooking(id,keep,focus){
  const b=byId(id); if(!b) return; if(!keep){ opener=document.activeElement; } cur=id; if(!keep) saveState();
  document.querySelector("header").inert=true; document.querySelector("main").inert=true;
  const scroll=keep?$("drawer").scrollTop:0;
  const pays=D.payments.filter(p=>p.id===id), thread=D.messages.filter(m=>m.id===id).sort((a,c)=>a.ts-c.ts);
  const staff=b.staff.split(",").map(s=>s.trim()).filter(Boolean);
  const [y,m,d]=[D.today.slice(6),D.today.slice(0,2),D.today.slice(3,5)];
  $("drawer").innerHTML=`
    <div class="dh"><div><h2 id="dTitle">#${b.id} · ${esc(b.evName)}</h2><p>${esc(pretty(b.date))} · ${esc(b.start)}–${esc(b.end)} · ${esc(b.type)}</p></div>
      <button type="button" class="x" id="dClose" aria-label="Close">×</button></div>
    <div class="f" style="margin-bottom:14px">
      <label>Status<select id="dStatus">${D.statuses.map(s=>`<option ${s===b.status?"selected":""}>${s}</option>`).join("")}</select></label>
      <fieldset><legend>Staff</legend><div class="checks">${D.staff.map(s=>`<label><input type="checkbox" class="dStaff" value="${esc(s)}" ${staff.includes(s)?"checked":""}> ${esc(s)}</label>`).join("")}</div></fieldset>
    </div>
    <div class="sec"><h3>Client & event</h3><dl>
      <dt>Client</dt><dd>${esc(b.fn+" "+b.ln)}</dd>
      <dt>Email</dt><dd><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></dd>
      <dt>Phone</dt><dd><a href="tel:${esc(b.phone.replace(/[^\d+]/g,""))}">${esc(b.phone)}</a></dd>
      <dt>Venue</dt><dd>${esc(b.vName)}<br><a href="https://maps.google.com/?q=${encodeURIComponent(b.vAddr+" "+b.vZip)}">${esc(b.vAddr)} ${esc(b.vZip)}</a></dd>
      <dt>Arrive / leave</dt><dd>${esc(b.arrive||"—")} / ${esc(b.depart||"—")}</dd>
      <dt>Package</dt><dd>${esc([b.pkg,b.print,b.xtime].filter(Boolean).join(" · "))}</dd>
      <dt>Miles</dt><dd>${esc(b.miles||"—")}</dd>
      <dt>Booked</dt><dd>${esc(b.created)}</dd>
      ${b.notes?`<dt>Notes</dt><dd>${esc(b.notes)}</dd>`:""}
    </dl></div>
    <div class="sec"><h3>Payments</h3>
      <div class="money"><div><b>${money(b.total)}</b><span>Total</span></div><div><b>${money(b.paid)}</b><span>Paid</span></div><div><b class="${bal(b)>0?"owe":""}">${money(bal(b))}</b><span>Balance</span></div></div>
      ${pays.length?`<table style="margin-bottom:10px"><tbody>${pays.map(p=>`<tr style="cursor:default"><td>${esc(p.date)}</td><td>${esc(p.method)}</td><td class="ev">${esc(p.note)}</td><td class="num">${money(p.amount)}</td></tr>`).join("")}</tbody></table>`:""}
      <form class="f" id="payForm">
        <label>Amount<input type="number" id="pAmt" name="payment-amount" min="0.01" step="0.01" inputmode="decimal" style="width:110px" required value="${bal(b)>0?bal(b):""}"></label>
        <label>Method<select id="pMethod">${METHODS.map(x=>`<option>${x}</option>`).join("")}</select></label>
        <label>Date<input type="date" id="pDate" name="payment-date" value="${y}-${m}-${d}"></label>
        <label style="flex:1;min-width:140px">Note<input type="text" id="pNote" name="payment-note" autocomplete="off" maxlength="300"></label>
        <button class="btn" type="submit">Add payment</button>
      </form></div>
    <div class="sec"><h3>Contract</h3>${b.signedAt?`<p>Signed by <b>${esc(b.signer)}</b> on ${esc(b.signedAt)}${b.pdf?` · <a href="${esc(b.pdf)}" target="_blank" rel="noopener">Open signed PDF</a>`:""}</p>`:`<p style="color:var(--muted)">Not signed${/imported/i.test(b.notes)?" here (signed in BoothBook if it was a past booking)":""}.</p>`}</div>
    <div class="sec"><h3>Template & details</h3><dl>
      <dt>Template</dt><dd>${esc(b.template||"Not chosen")}${b.templateText?`<br><small style="color:var(--muted)">${esc(b.templateText)}</small>`:""}</dd>
      <dt>On-site contact</dt><dd>${esc([b.onsiteName,b.onsitePhone].filter(Boolean).join(" · ")||"—")}</dd>
      <dt>Guests</dt><dd>${esc(b.guests||"—")}</dd>
      <dt>Setup notes</dt><dd>${esc(b.setupNotes||"—")}</dd>
      <dt>Confirmed</dt><dd>${esc(b.detailsAt||"Not yet")}</dd></dl></div>
    <div class="sec"><h3>Email the client</h3><div class="btns">
      <button type="button" class="btn ghost" data-send="portal">Booking link</button>
      <button type="button" class="btn ghost" data-send="contract">Sign contract</button>
      <button type="button" class="btn ghost" data-send="template">Choose template</button>
      <button type="button" class="btn ghost" data-send="details">Confirm details</button>
      <button type="button" class="btn ghost" data-send="payment">Payment reminder</button></div></div>
    <div class="sec"><h3>Notes</h3>
      <div class="f"><label style="width:100%">Admin notes (only you)<textarea id="nAdmin" name="admin-notes">${esc(b.adminNotes)}</textarea></label>
      <label style="width:100%">Team notes (included in staff emails)<textarea id="nTeam" name="team-notes">${esc(b.teamNotes)}</textarea></label>
      <button type="button" class="btn" id="nSave">Save notes</button></div></div>
    <div class="sec" id="msgs"><h3>Messages</h3>
      <div class="thread">${thread.map(x=>`<div class="bubble ${x.from==="Client"?"":"me"}"><small>${esc(x.from==="Client"?b.fn:"You")} · ${esc(x.at)}</small>${esc(x.text)}</div>`).join("")||`<div class="empty">No messages.</div>`}</div>
      <div class="f"><label style="width:100%">Reply (emails ${esc(b.email)} and shows in their portal)<textarea id="rText" name="reply" maxlength="2000"></textarea></label>
      <button type="button" class="btn" id="rSend">Send reply</button></div></div>`;
  $("drawer").classList.remove("hidden"); $("scrim").classList.remove("hidden"); document.body.style.overflow="hidden";
  $("drawer").scrollTop=scroll;
  if(focus==="msgs") $("msgs").scrollIntoView(); else if(!keep) $("dClose").focus();
  $("dClose").onclick=closeDrawer;
  const busy=async(btn,fn)=>{ btn.disabled=true; try{ await fn(); }catch(e){ fail(e); } btn.disabled=false; };
  $("dStatus").onchange=e=>{ if(e.target.value==="Cancelled"&&!confirm(`Cancel booking #${id}? The date ${b.date} will open up for new bookings.`)){ e.target.value=b.status; return; } busy(e.target,async()=>{ setData(await run("adminUpdate",id,{status:e.target.value})); toast("Status: "+e.target.value); }); };
  document.querySelectorAll(".dStaff").forEach(c=>c.onchange=()=>busy(c,async()=>{
    const v=[...document.querySelectorAll(".dStaff:checked")].map(x=>x.value).join(", ");
    setData(await run("adminUpdate",id,{staff:v})); toast(v?"Staff: "+v:"Staff cleared"); }));
  $("payForm").onsubmit=e=>{ e.preventDefault(); const btn=e.submitter||e.target.querySelector("button");
    const [py,pm,pd]=($("pDate").value||"").split("-");
    busy(btn,async()=>{ setData(await run("adminAddPayment",id,{amount:$("pAmt").value,method:$("pMethod").value,date:py?`${pm}/${pd}/${py}`:"",note:$("pNote").value})); toast("Payment added"); }); };
  $("nSave").onclick=e=>busy(e.target,async()=>{ setData(await run("adminUpdate",id,{adminNotes:$("nAdmin").value,teamNotes:$("nTeam").value})); toast("Notes saved"); });
  $("rSend").onclick=e=>{ if(!$("rText").value.trim()) return; busy(e.target,async()=>{ setData(await run("adminReply",id,$("rText").value)); toast("Reply sent"); }); };
  document.querySelectorAll("[data-send]").forEach(btn=>btn.onclick=()=>{
    if(!confirm(`Email "${btn.textContent}" to ${b.email}?`)) return;
    busy(btn,async()=>{ const r=await run("adminResend",id,btn.dataset.send); toast("Sent to "+r.sentTo); }); });
}
function closeDrawer(){ cur=null; $("drawer").classList.add("hidden"); $("scrim").classList.add("hidden"); document.body.style.overflow="";
  document.querySelector("header").inert=false; document.querySelector("main").inert=false; saveState();
  if(opener&&document.contains(opener)) opener.focus(); opener=null; }

/* ---------- keep tab and open booking in the URL (survives reload) ---------- */
function saveState(){ const q=new URLSearchParams(); if(view!=="overview") q.set("v",view); if(cur) q.set("b",String(cur)); const s=q.toString(); try{ history.replaceState(null,"",location.pathname+(s?"?"+s:"")); }catch(e){} }
function restore(){ const p=new URLSearchParams(location.search); const v=p.get("v"); if(v&&v!=="login"&&$("v-"+v)) view=v; draw(); const b=p.get("b"); if(b&&byId(b)) openBooking(Number(b)); }
$("scrim").onclick=closeDrawer;
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&cur) closeDrawer(); });

load();
