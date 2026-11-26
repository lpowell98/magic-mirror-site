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
  ["refresh","acctBtn"].forEach(id=>$(id).classList.toggle("hidden",!on));
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

/* ---------- account menu ---------- */
function menu(open){ $("acctMenu").classList.toggle("hidden",!open); $("acctBtn").setAttribute("aria-expanded",String(open)); }
$("acctBtn").onclick=e=>{ e.stopPropagation(); menu($("acctMenu").classList.contains("hidden")); };
$("acctMenu").addEventListener("click",e=>{ if(e.target.closest("button")) menu(false); });
document.addEventListener("click",e=>{ if(!e.target.closest(".acct")) menu(false); });

let didSetup=false;
function setup(){
  if(didSetup) return; didSetup=true;
  D.statuses.forEach(s=>$("fstatus").add(new Option(s,s)));
  [...new Set(D.bookings.map(b=>b.type).filter(Boolean))].sort().forEach(t=>$("ftype").add(new Option(t,t)));
  D.staff.forEach(s=>$("fstaff").add(new Option(s,s)));
  METHODS.forEach(m=>$("qMethod").add(new Option(m,m)));
  const t=key(D.today); calM=new Date(Math.floor(t/10000),Math.floor(t/100)%100-1,1);
}

function show(v){
  view=v; document.querySelectorAll("nav button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===v));
  document.querySelectorAll("main>section").forEach(s=>s.classList.toggle("hidden",s.id!=="v-"+v));
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{ show(b.dataset.v); draw(); saveState(); window.scrollTo(0,0); });
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
const inDays=n=>n===0?"Today":n===1?"Tomorrow":n<0?`${-n} days ago`:`In ${n} days`;
const waiting=()=>{ const s=new Set(); convos().forEach(c=>{ if(c.needs) s.add(c.id); }); return s; };

function draw(){
  $("loading").classList.add("hidden");
  const n=waiting().size; $("msgBadge").innerHTML=n?`<span class="badge" aria-label="${n} waiting">${n}</span>`:"";
  ({overview:drawOverview,bookings:drawBookings,calendar:drawCal,messages:drawMessages,money:drawMoney,blocked:drawBlocked})[view]();
  show(view);
}

/* ---------- rows + quick actions ---------- */
// One-tap actions shown next to a booking: Confirm, Mark paid, Reply.
function quick(b,opts){
  opts=opts||{}; const out=[];
  if(b.status==="Unconfirmed") out.push(`<button type="button" class="qa go" data-act="confirm" data-bid="${b.id}">Confirm</button>`);
  if(bal(b)>0 && live(b)) out.push(`<button type="button" class="qa" data-act="pay" data-bid="${b.id}">Mark paid</button>`);
  if(opts.reply) out.push(`<button type="button" class="qa" data-act="reply" data-bid="${b.id}">Reply</button>`);
  return out.join("");
}
function rowHtml(b,sub,o){
  o=o||{};
  const d=pretty(b.date).replace(/, \d{4}$/,"");
  return `<div class="row"><button type="button" class="rowmain" data-id="${b.id}"${o.focus?` data-focus="${o.focus}"`:""}>
    <span class="when">${esc(d)}${o.soon?`<em>${esc(o.soon)}</em>`:""}</span>
    <span class="what"><b>${esc(b.evName||"(no name)")}</b>${sub?`<small>${esc(sub)}</small>`:""}${o.tags||""}</span>
    ${o.pill===false?"":`<span class="pill s-${esc(b.status)}">${esc(b.status)}</span>`}</button>
    ${o.actions?`<div class="side">${o.actions}</div>`:""}</div>`;
}
function bindRows(el){
  el.querySelectorAll("[data-id]").forEach(r=>r.onclick=()=>openBooking(Number(r.dataset.id),false,r.dataset.focus));
  el.querySelectorAll("[data-act]").forEach(btn=>btn.onclick=e=>{ e.stopPropagation(); act(btn.dataset.act,Number(btn.dataset.bid),btn); });
}
async function act(what,id,btn){
  const b=byId(id); if(!b) return;
  if(what==="reply") return openBooking(id,false,"msgs");
  if(what==="pay") return payDialog(b);
  if(what==="confirm"){ btn.disabled=true;
    try{ setData(await run("adminUpdate",id,{status:"Confirmed"})); toast(`#${id} confirmed`); }catch(e){ fail(e); btn.disabled=false; } }
}
function payDialog(b){
  $("payFor").textContent=`#${b.id} · ${b.evName} · ${money(bal(b))} still owed`;
  $("qAmt").value=bal(b)>0?bal(b):""; $("qMethod").selectedIndex=0;
  $("qDate").value=`${D.today.slice(6)}-${D.today.slice(0,2)}-${D.today.slice(3,5)}`;
  $("qPayForm").dataset.id=b.id; $("payDlg").showModal(); $("qAmt").focus();
}
$("qCancel").onclick=()=>$("payDlg").close();
$("qPayForm").onsubmit=async e=>{ e.preventDefault(); const id=Number(e.target.dataset.id), [py,pm,pd]=($("qDate").value||"").split("-");
  $("qSave").disabled=true;
  try{ setData(await run("adminAddPayment",id,{amount:$("qAmt").value,method:$("qMethod").value,date:py?`${pm}/${pd}/${py}`:"",note:""})); $("payDlg").close(); toast("Payment saved"); }
  catch(err){ fail(err); } $("qSave").disabled=false; };

/* ---------- overview ---------- */
// Collects every open issue per upcoming booking, so each booking shows once with tags.
function issues(){
  const wait=waiting(), out=[];
  upcoming().forEach(b=>{
    const t=[], d=daysTo(b); let score=1000-d;
    if(wait.has(b.id)){ t.push(["msg","Message waiting"]); score+=2000; }
    if(b.status==="Unconfirmed") t.push(["","Not confirmed"]);
    if(!b.signedAt && !/imported/i.test(b.notes)) t.push(["","Contract not signed"]);
    if(bal(b)>0 && d<=14){ t.push(["hot",`${money(bal(b))} due`]); score+=500; }
    if(!b.staff && d<=21) t.push([d<=7?"hot":"","No staff"]);
    if(d<=7) score+=800;
    if(t.length) out.push({b,t,score,d});
  });
  // a message on a past or unknown booking still needs a reply
  convos().filter(c=>c.needs&&!out.some(x=>x.b.id===c.id)).forEach(c=>{ const b=byId(c.id); if(b) out.push({b,t:[["msg","Message waiting"]],score:3000,d:daysTo(b)}); });
  return out.sort((a,b)=>b.score-a.score);
}
function drawOverview(){
  const up=upcoming(), yr=String(today()).slice(0,4);
  const thisYear=D.bookings.filter(b=>live(b)&&String(key(b.date)).slice(0,4)===yr);
  const unconf=up.filter(b=>b.status==="Unconfirmed").length;
  const owed=up.reduce((s,b)=>s+Math.max(0,bal(b)),0);
  const next30=up.filter(b=>daysTo(b)<=30).length;
  $("stats").innerHTML=[
    [up.length,"Upcoming events","hero"],[next30,"In the next 30 days",""],[unconf,"Unconfirmed",""],
    [money(owed),"Still owed (upcoming)","gold"],[money(thisYear.reduce((s,b)=>s+b.paid,0)),yr+" collected",""],[thisYear.length,yr+" bookings",""]
  ].map(([v,l,c])=>`<div class="stat ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  const list=issues();
  $("attnCount").textContent=list.length?`${list.length} booking${list.length===1?"":"s"}`:"";
  $("attnList").innerHTML=list.slice(0,10).map(({b,t,d})=>rowHtml(b,"",{
    soon:inDays(d), focus:t.some(x=>x[0]==="msg")?"msgs":"", pill:false,
    tags:`<span class="tags">${t.map(([c,l])=>`<span class="tag ${c}">${esc(l)}</span>`).join("")}</span>`,
    actions:quick(b,{reply:t.some(x=>x[0]==="msg")})})).join("")||`<div class="empty">All caught up.</div>`;
  $("nextList").innerHTML=up.slice(0,8).map(b=>rowHtml(b,`${b.start}–${b.end} · ${b.vName}`,{soon:daysTo(b)<=7?inDays(daysTo(b)):""})).join("")||`<div class="empty">No upcoming events.</div>`;
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
  // phone view: the same list as cards
  $("bcards").innerHTML=list.map(b=>rowHtml(b,`#${b.id} · ${b.fn} ${b.ln} · ${b.pkg.replace(" Package","")}`,{
    tags:`<span class="tags">${bal(b)>0?`<span class="tag hot">${money(bal(b))} owed</span>`:`<span class="tag">Paid in full</span>`}<span class="tag">${esc(b.staff||"No staff")}</span></span>`,
    actions:quick(b)})).join("")||`<div class="empty">No bookings match.</div>`;
  bindRows($("bcards"));
  $("count").textContent=`${list.length} booking${list.length===1?"":"s"} · ${money(list.reduce((s,b)=>s+b.total,0))} total · ${money(list.reduce((s,b)=>s+Math.max(0,bal(b)),0))} owed`;
}

/* ---------- calendar ---------- */
const MONTH=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"});
const DOW=new Intl.DateTimeFormat("en-US",{weekday:"short"});
$("calPrev").onclick=()=>{ calM.setMonth(calM.getMonth()-1); drawCal(); };
$("calNext").onclick=()=>{ calM.setMonth(calM.getMonth()+1); drawCal(); };
$("calToday").onclick=()=>{ const t=today(); calM=new Date(Math.floor(t/10000),Math.floor(t/100)%100-1,1); drawCal(); };
const k8=d=>d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
function drawCal(){
  $("calTitle").textContent=MONTH.format(calM);
  const start=new Date(calM); start.setDate(1-start.getDay());
  const blocked={}; D.blocked.forEach(x=>blocked[key(x.date)]=x.reason||"Blocked");
  const byDay={}; D.bookings.forEach(b=>{ (byDay[key(b.date)]=byDay[key(b.date)]||[]).push(b); });
  const chip=(b,long)=>`<button type="button" class="chip s-${esc(b.status)}" data-id="${b.id}" title="${esc(b.evName)}">${esc(b.start)} ${esc(b.evName)}${long?` · ${esc(b.vName)}`:""}</button>`;
  let h=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>`<div class="dow">${d}</div>`).join("");
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const k=k8(d);
    const cls=["day"]; if(d.getMonth()!==calM.getMonth()) cls.push("out"); if(k===today()) cls.push("today"); if(blocked[k]) cls.push("blocked");
    h+=`<div class="${cls.join(" ")}" ${blocked[k]?`title="${esc(blocked[k])}"`:""}><span class="n">${d.getDate()}</span>${(byDay[k]||[]).map(b=>chip(b)).join("")}
      ${blocked[k]?`<span class="chip" style="background:none;color:var(--muted);cursor:default">⛔ ${esc(blocked[k])}</span>`:""}</div>`;
  }
  $("cal").innerHTML=h; bindRows($("cal"));
  // phone view: only the days in this month that have something on them
  const days=[], last=new Date(calM.getFullYear(),calM.getMonth()+1,0).getDate();
  for(let i=1;i<=last;i++){ const d=new Date(calM.getFullYear(),calM.getMonth(),i), k=k8(d); if(byDay[k]||blocked[k]) days.push([d,k]); }
  $("agenda").innerHTML=days.map(([d,k])=>`<div class="aday${k===today()?" today":""}"><div class="d"><small>${DOW.format(d)}</small><b>${d.getDate()}</b></div><div class="evs">
    ${(byDay[k]||[]).map(b=>chip(b,true)).join("")}${blocked[k]?`<span class="chip" style="background:none;color:var(--muted);cursor:default">⛔ Blocked · ${esc(blocked[k])}</span>`:""}</div></div>`).join("")
    ||`<div class="empty">Nothing booked or blocked in ${esc(MONTH.format(calM))}.</div>`;
  bindRows($("agenda"));
}

/* ---------- messages ---------- */
function drawMessages(){
  const cs=convos();
  $("convList").innerHTML=cs.map(c=>{ const b=byId(c.id)||{id:c.id,evName:"Booking #"+c.id,fn:"",ln:"",date:"",status:""};
    return `<div class="row"><button type="button" class="rowmain" data-id="${c.id}" data-focus="msgs"><span class="when">${esc(c.last.at.split(" ")[0])}</span>
      <span class="what"><b>${esc((b.fn+" "+b.ln).trim()||"Client")} · #${c.id} ${esc(b.evName)}</b><small>${esc((c.last.from==="Client"?"":"You: ")+c.last.text)}</small></span>
      ${c.needs?`<span class="pill s-Unconfirmed">Needs reply</span>`:""}</button></div>`; }).join("")||`<div class="empty">No messages yet. Clients can message you from their booking portal.</div>`;
  bindRows($("convList"));
}

/* ---------- money ---------- */
const MON=new Intl.DateTimeFormat("en-US",{month:"short"});
const MONY=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"});
function drawMoney(){
  const t=today(), y=Math.floor(t/10000), m=Math.floor(t/100)%100-1;
  // 12 months: the 5 before this one, this one, and the 6 after
  const months=[]; for(let i=-5;i<=6;i++){ const d=new Date(y,m+i,1); months.push({d,ym:d.getFullYear()*100+d.getMonth()+1,paid:0,owed:0,n:0}); }
  const idx={}; months.forEach((x,i)=>idx[x.ym]=i);
  D.bookings.filter(live).forEach(b=>{ const i=idx[Math.floor(key(b.date)/100)]; if(i===undefined) return;
    months[i].paid+=Math.min(b.paid,b.total); months[i].owed+=Math.max(0,bal(b)); months[i].n++; });
  const max=Math.max(1,...months.map(x=>x.paid+x.owed));
  const step=[100,250,500,1000,2500,5000,10000].find(s=>max/s<=4)||Math.ceil(max/4/1000)*1000, top=Math.ceil(max/step)*step;
  let grid=""; for(let v=step;v<=top;v+=step) grid+=`<div class="gridline" style="bottom:${v/top*100}%"><span>${money(v).replace(".00","")}</span></div>`;
  $("chart").innerHTML=grid+months.map((x,i)=>`<div class="bar${i===5?" now":""}" tabindex="0" data-i="${i}" aria-label="${MONYformat(x)}">
    ${x.paid?`<i class="p" style="height:${x.paid/top*100}%"></i>`:""}${x.owed?`<i class="o" style="height:${x.owed/top*100}%"></i>`:""}</div>`).join("");
  $("months").innerHTML=months.map((x,i)=>`<span class="${i===5?"now":""}">${MON.format(x.d)}</span>`).join("");
  $("chartTbl").innerHTML=`<thead><tr><th>Month</th><th class="num">Events</th><th class="num">Paid</th><th class="num">Still owed</th></tr></thead><tbody>`+
    months.map(x=>`<tr style="cursor:default"><td>${MONY.format(x.d)}</td><td class="num">${x.n}</td><td class="num">${money(x.paid)}</td><td class="num">${money(x.owed)}</td></tr>`).join("")+`</tbody>`;
  const tip=$("tip"), card=$("chart").parentElement;
  $("chart").querySelectorAll(".bar").forEach(bar=>{
    const x=months[Number(bar.dataset.i)];
    const showTip=()=>{ tip.innerHTML=`<b>${MONY.format(x.d)}</b><div><span><i style="background:var(--c-paid)"></i>Paid</span><span>${money(x.paid)}</span></div><div><span><i style="background:var(--c-owed)"></i>Still owed</span><span>${money(x.owed)}</span></div><div><span>Events</span><span>${x.n}</span></div>`;
      tip.classList.remove("hidden"); const r=bar.getBoundingClientRect(), c=card.getBoundingClientRect();
      const left=Math.min(Math.max(8,r.left-c.left+r.width/2-tip.offsetWidth/2),c.width-tip.offsetWidth-8);
      tip.style.left=left+"px"; tip.style.top=Math.max(8,r.top-c.top+r.height-(x.paid+x.owed)/top*r.height-tip.offsetHeight-10)+"px"; };
    bar.onmouseenter=showTip; bar.onfocus=showTip; bar.onclick=showTip;
    bar.onmouseleave=()=>tip.classList.add("hidden"); bar.onblur=()=>tip.classList.add("hidden");
  });
  const up=upcoming(), yr=String(y);
  const owed=up.reduce((s,b)=>s+Math.max(0,bal(b)),0), soon=up.filter(b=>daysTo(b)<=30).reduce((s,b)=>s+Math.max(0,bal(b)),0);
  const ytd=D.bookings.filter(b=>live(b)&&String(key(b.date)).slice(0,4)===yr);
  $("mStats").innerHTML=[[money(owed),"Still owed (all upcoming)","hero"],[money(soon),"Due in the next 30 days","gold"],
    [money(ytd.reduce((s,b)=>s+b.paid,0)),yr+" collected",""],[money(ytd.reduce((s,b)=>s+b.total,0)),yr+" booked",""]]
    .map(([v,l,c])=>`<div class="stat ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  const due=up.filter(b=>bal(b)>0);
  $("dueCount").textContent=due.length?`${due.length} booking${due.length===1?"":"s"}`:"";
  $("dueList").innerHTML=due.map(b=>{ const d=daysTo(b);
    return rowHtml(b,`${b.fn} ${b.ln} · ${money(b.paid)} of ${money(b.total)} paid`,{soon:inDays(d),
      tags:`<span class="tags"><span class="tag ${d<=14?"hot":""}">${money(bal(b))} owed</span></span>`,actions:quick(b)}); }).join("")||`<div class="empty">Every upcoming booking is paid in full.</div>`;
  bindRows($("dueList"));
  drawPromos();
}

/* ---------- promo codes ---------- */
const promoOffText=p=>p.type==="percent"?`${+p.amount}% off`:`${money(p.amount)} off`;
function drawPromos(){
  const list=(D.promos||[]).slice().sort((a,b)=>(b.problem?0:1)-(a.problem?0:1)||String(b.created).localeCompare(String(a.created)));
  const live=list.filter(p=>!p.problem).length;
  $("promoCount").textContent=list.length?`${live} active`:"";
  $("promoList").innerHTML=list.map(p=>{
    const used=D.bookings.filter(b=>String(b.coupon||"").toUpperCase()===p.code);
    const state=p.problem?(!p.active?"Paused":/expired/.test(p.problem)?"Expired":"Used up"):"Active";
    const pill=state==="Active"?"s-Confirmed":state==="Paused"?"s-Completed":"s-Cancelled";
    const sub=[promoOffText(p), `${p.uses} use${p.uses===1?"":"s"}${p.maxUses?` of ${p.maxUses}`:""}`, p.expires?`expires ${pretty(p.expires)}`:"no expiry", p.note].filter(Boolean).join(" · ");
    return `<div class="row"><div class="rowmain" style="cursor:default"><span class="when" style="color:var(--accent);font-weight:800;letter-spacing:.04em">${esc(p.code)}</span>
      <span class="what"><b>${esc(promoOffText(p))}</b><small>${esc(sub)}</small>${used.length?`<span class="tags">${used.slice(0,4).map(b=>`<button type="button" class="tag" data-id="${b.id}" style="border:0;cursor:pointer">#${b.id} ${esc(b.evName)}</button>`).join("")}${used.length>4?`<span class="tag">+${used.length-4} more</span>`:""}</span>`:""}</span>
      <span class="pill ${pill}">${state}</span></div>
      <div class="side"><button type="button" class="qa" data-promo="${esc(p.code)}" data-on="${p.active?"0":"1"}">${p.active?"Pause":"Turn on"}</button></div></div>`;
  }).join("")||`<div class="empty">No promo codes yet. Create one above.</div>`;
  $("promoList").querySelectorAll("[data-id]").forEach(t=>t.onclick=()=>openBooking(Number(t.dataset.id)));
  $("promoList").querySelectorAll("[data-promo]").forEach(btn=>btn.onclick=async()=>{ btn.disabled=true;
    try{ setData(await run("adminPromoActive",btn.dataset.promo,btn.dataset.on==="1")); toast(btn.dataset.on==="1"?btn.dataset.promo+" is on":btn.dataset.promo+" paused"); }catch(e){ fail(e); btn.disabled=false; } });
}
$("prType").onchange=()=>{ $("prAmt").max=$("prType").value==="percent"?"100":""; };
$("prType").onchange();
$("promoForm").onsubmit=async e=>{ e.preventDefault();
  const code=$("prCode").value.trim().toUpperCase(), ex=$("prExp").value, [y,m,d]=ex?ex.split("-"):[];
  if((D.promos||[]).some(p=>p.code===code)){ toast("There's already a code named "+code); return; }
  $("prSave").disabled=true;
  try{ setData(await run("adminPromoSave",{code,type:$("prType").value,amount:$("prAmt").value,expires:ex?`${m}/${d}/${y}`:"",maxUses:$("prMax").value,note:$("prNote").value}));
    $("promoForm").reset(); $("prType").onchange(); toast(code+" created"); }
  catch(err){ fail(err); } $("prSave").disabled=false; };
function MONYformat(x){ return `${MONY.format(x.d)}: ${money(x.paid)} paid, ${money(x.owed)} still owed, ${x.n} event${x.n===1?"":"s"}`; }

/* ---------- blocked ---------- */
function drawBlocked(){
  const list=[...D.blocked].sort((a,b)=>key(a.date)-key(b.date)).filter(x=>key(x.date)>=today());
  $("blockList").innerHTML=list.map(x=>`<div class="row"><div class="rowmain" style="cursor:default"><span class="when">${esc(pretty(x.date).replace(/, \d{4}$/,""))}</span><span class="what"><b>${esc(x.reason||"Blocked")}</b><small>${esc(pretty(x.date))}</small></span></div>
    <div class="side"><button type="button" class="qa" data-un="${esc(x.date)}">Unblock</button></div></div>`).join("")||`<div class="empty">No upcoming blocked dates.</div>`;
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
  menu(false); document.querySelector("header").inert=true; document.querySelector("main").inert=true;
  const scroll=keep&&$("dscroll")?$("dscroll").scrollTop:0;
  const pays=D.payments.filter(p=>p.id===id), thread=D.messages.filter(m=>m.id===id).sort((a,c)=>a.ts-c.ts);
  const staff=b.staff.split(",").map(s=>s.trim()).filter(Boolean);
  const [y,m,d]=[D.today.slice(6),D.today.slice(0,2),D.today.slice(3,5)];
  const dd=daysTo(b);
  $("drawer").innerHTML=`<div class="dscroll" id="dscroll">
    <div class="dh"><div><h2 id="dTitle">#${b.id} · ${esc(b.evName)}</h2><p>${esc(pretty(b.date))} · ${esc(b.start)}–${esc(b.end)} · ${esc(b.type)}${dd>=0&&dd<=60?` · <b style="color:var(--accent)">${esc(inDays(dd))}</b>`:""}</p></div>
      <button type="button" class="x" id="dClose" aria-label="Close">×</button></div>
    <div class="f" style="margin-bottom:4px;gap:16px">
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
      ${b.coupon?`<dt>Promo code</dt><dd><b style="color:var(--accent)">${esc(b.coupon)}</b>${(()=>{ const p=(D.promos||[]).find(x=>x.code===String(b.coupon).toUpperCase()); return p?` · ${esc(promoOffText(p))}`:""; })()}</dd>`:""}
      <dt>Miles</dt><dd>${esc(b.miles||"—")}</dd>
      <dt>Booked</dt><dd>${esc(b.created)}</dd>
      ${b.notes?`<dt>Notes</dt><dd>${esc(b.notes)}</dd>`:""}
    </dl></div>
    <div class="sec" id="pays"><h3>Payments</h3>
      <div class="money"><div><b>${money(b.total)}</b><span>Total</span></div><div><b>${money(b.paid)}</b><span>Paid</span></div><div><b class="${bal(b)>0?"owe":""}">${money(bal(b))}</b><span>Balance</span></div></div>
      ${pays.length?`<table class="paytbl" style="margin-bottom:10px"><tbody>${pays.map(p=>`<tr style="cursor:default"><td>${esc(p.date)}</td><td>${esc(p.method)}</td><td>${esc(p.note)}</td><td class="num">${money(p.amount)}</td></tr>`).join("")}</tbody></table>`:""}
      <form class="f" id="payForm">
        <label style="flex:1 1 100px">Amount<input type="number" id="pAmt" name="payment-amount" min="0.01" step="0.01" inputmode="decimal" style="width:100%" required value="${bal(b)>0?bal(b):""}"></label>
        <label style="flex:1 1 150px">Method<select id="pMethod" style="width:100%">${METHODS.map(x=>`<option>${x}</option>`).join("")}</select></label>
        <label style="flex:1 1 140px">Date<input type="date" id="pDate" name="payment-date" value="${y}-${m}-${d}" style="width:100%"></label>
        <label style="flex:1 1 140px">Note<input type="text" id="pNote" name="payment-note" autocomplete="off" maxlength="300" style="width:100%"></label>
        <button class="btn" type="submit">Add payment</button>
      </form></div>
    <div class="sec"><h3>Contract</h3>${b.signedAt?`<p style="margin:0">Signed by <b>${esc(b.signer)}</b> on ${esc(b.signedAt)}${b.pdf?` · <a href="${esc(b.pdf)}" target="_blank" rel="noopener">Open signed PDF</a>`:""}</p>`:`<p style="color:var(--muted);margin:0">Not signed${/imported/i.test(b.notes)?" here (signed in BoothBook if it was a past booking)":""}.</p>`}</div>
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
      <button type="button" class="btn" id="rSend">Send reply</button></div></div>
    </div>
    <div class="dbar">
      ${b.status==="Unconfirmed"?`<button type="button" class="btn" id="bConfirm">Confirm booking</button>`:""}
      ${bal(b)>0&&live(b)?`<button type="button" class="btn ${b.status==="Unconfirmed"?"ghost":""}" id="bPay">Record payment</button>`:""}
      <button type="button" class="btn ghost" id="bReply">Reply</button>
      <a class="btn ghost" href="tel:${esc(b.phone.replace(/[^\d+]/g,""))}" style="text-decoration:none;text-align:center">Call</a>
    </div>`;
  $("drawer").classList.remove("hidden"); $("scrim").classList.remove("hidden"); document.body.style.overflow="hidden";
  $("dscroll").scrollTop=scroll;
  if(focus==="msgs"){ $("msgs").scrollIntoView(); if(!keep) $("rText").focus({preventScroll:true}); } else if(!keep) $("dClose").focus();
  $("dClose").onclick=closeDrawer;
  const busy=async(btn,fn)=>{ btn.disabled=true; try{ await fn(); }catch(e){ fail(e); } btn.disabled=false; };
  if($("bConfirm")) $("bConfirm").onclick=e=>busy(e.target,async()=>{ setData(await run("adminUpdate",id,{status:"Confirmed"})); toast(`#${id} confirmed`); });
  if($("bPay")) $("bPay").onclick=()=>{ $("pays").scrollIntoView({behavior:"smooth"}); $("pAmt").focus({preventScroll:true}); };
  $("bReply").onclick=()=>{ $("msgs").scrollIntoView({behavior:"smooth"}); $("rText").focus({preventScroll:true}); };
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
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ if(cur) closeDrawer(); menu(false); } });

load();
