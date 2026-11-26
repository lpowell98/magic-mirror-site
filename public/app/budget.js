// Money > Budget: an operating budget for the vendors under review.
// It runs in the browser only and saves to this device (localStorage).
(function(){
  const $=id=>document.getElementById(id);
  const esc=t=>String(t==null?"":t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const ls={ get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };

  const CATS=["Website & email","Software & design tools","Mailbox","Insurance","Legal & registration","Equipment & supplies"];
  // a = amount per bill, f = how often it bills (m monthly, q quarterly, y yearly), cut = what "Apply suggested cuts" changes.
  // Amounts come from the Blue Business Plus card, Jan 1 to Nov 26, 2026, sales tax included.
  const DEFAULTS=[
    {c:0,n:"Google Workspace",a:29.85,f:"m",on:1,h:"$17.85 a month until Oct, then $29.85 in Nov",cut:{a:17.85},flag:1},
    {c:1,n:"Adobe",a:21.24,f:"m",on:1,h:"Overlaps with Canva",cut:{on:0}},
    {c:1,n:"Canva",a:179.87,f:"y",on:1,h:"Renews in May"},
    {c:1,n:"Claude",a:212.50,f:"y",on:1,h:"Annual plan paid in May"},
    {c:1,n:"Claude extra charge (Nov)",a:81.88,f:"m",on:0,h:"Turn on if this repeats each month",flag:1},
    {c:2,n:"iPostal mailbox",a:149.00,f:"y",on:1,h:"The renewal was charged twice in Oct",flag:1},
    {c:2,n:"iPostal storage fees",a:1.10,f:"m",on:1,h:"Avoid by shredding or forwarding mail",cut:{on:0}},
    {c:3,n:"Hiscox",a:51.67,f:"m",on:1,h:"Liability insurance, get quotes before renewal"},
    {c:4,n:"ZenBusiness",a:968.00,f:"y",on:1,h:"$620 + $149 + $199 in Oct",cut:{a:500},flag:1},
    {c:5,n:"B&H Photo (printer media)",a:233.75,f:"y",on:1,h:"4x6 prints, bought once in Sep"},
    {c:5,n:"Amazon",a:10.00,f:"m",on:1,h:"About $110 so far this year"},
    {c:5,n:"Amazon Prime",a:14.99,f:"m",on:0,h:"$14.99 a month Mar to Aug, nothing since"},
    {c:5,n:"Home Depot",a:6.14,f:"y",on:1,h:"One purchase in Jun"},
  ];
  const MULT={m:12,q:4,y:1};
  const KEY="mmrsBudget1";
  const usd=(v,d)=>(v<0?"−":"")+"$"+Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
  const yearly=i=>i.on?(Number(i.a)||0)*MULT[i.f]:0;
  const fresh=()=>DEFAULTS.map((d,i)=>Object.assign({id:"d"+i},d));
  const BASE=fresh().reduce((s,i)=>s+yearly(i),0);

  let items=null;
  try{ items=JSON.parse(ls.get(KEY)); }catch(e){}
  if(!Array.isArray(items)) items=fresh();
  let uid=Date.now();
  const save=()=>ls.set(KEY,JSON.stringify(items));

  function render(){
    $("bCats").innerHTML=CATS.map((name,ci)=>`<div class="card bcat">
      <div class="bcat-h"><h2>${name}</h2><div class="ct" id="bct${ci}"></div></div>
      <div class="bhead" aria-hidden="true"><span>On</span><span>Line item</span><span class="num">Amount</span><span>Billed</span><span class="num">Per month</span><span class="num">Per year</span><span></span></div>
      ${items.filter(i=>i.c===ci).map(i=>`<div class="bitem${i.on?"":" off"}" data-id="${i.id}">
        <label class="sw"><input type="checkbox" ${i.on?"checked":""} aria-label="Include ${esc(i.n)}"><span></span></label>
        <div class="nm"><input type="text" value="${esc(i.n)}" aria-label="Line item name" maxlength="60">${i.flag?`<span class="tag hot">check</span>`:""}${i.h?`<small>${esc(i.h)}</small>`:""}</div>
        <label><span class="lbl">Amount</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${Number(i.a)||0}" aria-label="Amount for ${esc(i.n)}"></label>
        <label><span class="lbl">Billed</span><select aria-label="How often ${esc(i.n)} bills"><option value="m"${i.f==="m"?" selected":""}>Monthly</option><option value="q"${i.f==="q"?" selected":""}>Quarterly</option><option value="y"${i.f==="y"?" selected":""}>Yearly</option></select></label>
        <div class="num"><span class="lbl">Per month</span><span class="pm"></span></div>
        <div class="num"><span class="lbl">Per year</span><span class="py"></span></div>
        ${i.id[0]==="u"?`<button type="button" class="bdel" aria-label="Remove ${esc(i.n)}">✕</button>`:"<span></span>"}
      </div>`).join("")}
      <button type="button" class="badd" data-c="${ci}">+ Add line item</button></div>`).join("");
    totals();
  }
  function totals(){
    let all=0;
    CATS.forEach((_,ci)=>{ const t=items.filter(i=>i.c===ci).reduce((s,i)=>s+yearly(i),0); all+=t;
      const el=$("bct"+ci); if(el) el.innerHTML=`${usd(t/12,0)}<span>/mo</span> · ${usd(t,0)}<span>/yr</span>`; });
    items.forEach(i=>{ const row=document.querySelector(`.bitem[data-id="${i.id}"]`); if(!row) return;
      const y=yearly(i); row.querySelector(".pm").textContent=usd(y/12,2); row.querySelector(".py").textContent=usd(y,2);
      row.classList.toggle("off",!i.on); });
    const sv=BASE-all;
    $("bStats").innerHTML=`<div class="stat hero"><b>${usd(all/12,0)}</b><span>Budget per month</span></div>
      <div class="stat"><b>${usd(all,0)}</b><span>Budget per year</span></div>
      <div class="stat"><b>${usd(BASE,0)}</b><span>2026 run rate per year</span></div>
      <div class="stat save"><b class="${sv<0?"neg":""}">${usd(sv,0)}</b><span>Yearly savings</span></div>`;
    save();
  }
  const find=el=>{ const r=el.closest(".bitem"); return r&&items.find(i=>i.id===r.dataset.id); };

  function init(){
    const box=$("bCats"); if(!box) return;
    box.addEventListener("input",e=>{ const t=e.target, i=find(t); if(!i) return;
      if(t.type==="checkbox") i.on=t.checked?1:0;
      else if(t.type==="number") i.a=Math.max(0,parseFloat(t.value)||0);
      else if(t.tagName==="SELECT") i.f=t.value;
      else i.n=t.value;
      totals(); });
    box.addEventListener("change",e=>{ if(e.target.tagName==="SELECT"){ const i=find(e.target); if(i){ i.f=e.target.value; totals(); } } });
    box.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
      if(b.classList.contains("badd")){ const n={id:"u"+(uid++),c:Number(b.dataset.c),n:"New item",a:0,f:"m",on:1}; items.push(n); render();
        const el=document.querySelector(`.bitem[data-id="${n.id}"] .nm input`); if(el){ el.focus(); el.select(); } }
      if(b.classList.contains("bdel")){ const i=find(b); items=items.filter(x=>x!==i); render(); } });
    $("bCuts").onclick=()=>{ items.forEach(i=>{ const d=DEFAULTS.find(x=>x.n===i.n&&x.cut); if(d&&i.id[0]==="d") Object.assign(i,d.cut); }); render(); };
    $("bReset").onclick=()=>{ items=fresh(); render(); };

    // Overview / Budget tabs inside Money
    const tabs=[...document.querySelectorAll(".subtabs [data-m]")];
    const pick=m=>{ tabs.forEach(t=>t.setAttribute("aria-selected",t.dataset.m===m));
      $("m-overview").classList.toggle("hidden",m!=="overview"); $("m-budget").classList.toggle("hidden",m!=="budget");
      ls.set("mmrsMoneyTab",m); };
    tabs.forEach(t=>t.onclick=()=>pick(t.dataset.m));
    tabs.forEach((t,k)=>t.addEventListener("keydown",e=>{ if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft") return;
      const nx=tabs[(k+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length]; nx.focus(); pick(nx.dataset.m); }));
    pick(ls.get("mmrsMoneyTab")==="budget"?"budget":"overview");
    render();
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
