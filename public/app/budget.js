// Money > Operational Budget: recurring business costs, saved to the "Budget" tab of the Google Sheet.
// Unsaved edits are kept as a draft on this device until Save is pressed.
(function(){
  const $=id=>document.getElementById(id);
  const esc=t=>String(t==null?"":t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const ls={ get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch(e){} } };

  const CATS=["Website & email","Software & design tools","Mailbox","Insurance","Legal & registration","Equipment & supplies"];
  // a = amount per bill, f = how often it bills (m monthly, q quarterly, y yearly),
  // cut = what "Apply suggested cuts" does: "off" switches it off, a number sets a new amount.
  // Amounts come from the Blue Business Plus card, Jan 1 to Nov 26, 2026, sales tax included.
  const DEFAULTS=[
    {cat:CATS[0],n:"Google Workspace",a:29.85,f:"m",on:1,h:"$17.85 a month until Oct, then $29.85 in Nov",cut:17.85,flag:1},
    {cat:CATS[1],n:"Adobe",a:21.24,f:"m",on:1,h:"Overlaps with Canva",cut:"off"},
    {cat:CATS[1],n:"Canva",a:179.87,f:"y",on:1,h:"Renews in May"},
    {cat:CATS[1],n:"Claude",a:212.50,f:"y",on:1,h:"Annual plan paid in May"},
    {cat:CATS[1],n:"Claude extra charge (Nov)",a:81.88,f:"m",on:0,h:"Turn on if this repeats each month",flag:1},
    {cat:CATS[2],n:"iPostal mailbox",a:149.00,f:"y",on:1,h:"The renewal was charged twice in Oct",flag:1},
    {cat:CATS[2],n:"iPostal storage fees",a:1.10,f:"m",on:1,h:"Avoid by shredding or forwarding mail",cut:"off"},
    {cat:CATS[3],n:"Hiscox",a:51.67,f:"m",on:1,h:"Liability insurance, get quotes before renewal"},
    {cat:CATS[4],n:"ZenBusiness",a:968.00,f:"y",on:1,h:"$620 + $149 + $199 in Oct",cut:500,flag:1},
    {cat:CATS[5],n:"B&H Photo (printer media)",a:233.75,f:"y",on:1,h:"4x6 prints, bought once in Sep"},
    {cat:CATS[5],n:"Amazon",a:10.00,f:"m",on:1,h:"About $110 so far this year"},
    {cat:CATS[5],n:"Amazon Prime",a:14.99,f:"m",on:0,h:"$14.99 a month Mar to Aug, nothing since"},
    {cat:CATS[5],n:"Home Depot",a:6.14,f:"y",on:1,h:"One purchase in Jun"},
  ];
  const MULT={m:12,q:4,y:1};
  const DRAFT="mmrsBudgetDraft";
  const usd=(v,d)=>(v<0?"−":"")+"$"+Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
  const yearly=i=>i.on?(Number(i.a)||0)*MULT[i.f]:0;
  let uid=1;
  const withIds=list=>list.map(x=>Object.assign({cut:"",flag:0,h:""},x,{id:"i"+(uid++)}));
  const BASE=DEFAULTS.reduce((s,i)=>s+yearly(i),0);
  // What gets saved, without the on-page ids, so two copies can be compared.
  const plain=list=>list.map(i=>({cat:i.cat,n:i.n,a:Number(i.a)||0,f:i.f,on:i.on?1:0,h:i.h||"",flag:i.flag?1:0,cut:i.cut===undefined?"":i.cut}));
  const sig=list=>JSON.stringify(plain(list));

  let items=withIds(DEFAULTS), savedSig=null, savedAt="", loaded=false, loading=false, saving=false, undo=null, err="";

  const cats=()=>{ const out=CATS.slice(); items.forEach(i=>{ if(out.indexOf(i.cat)===-1) out.push(i.cat); }); return out; };
  const dirty=()=>loaded&&sig(items)!==savedSig;

  function render(){
    $("bCats").innerHTML=cats().map((name,ci)=>`<div class="card bcat">
      <div class="bcat-h"><h2>${esc(name)}</h2><div class="ct" id="bct${ci}"></div></div>
      <div class="bhead" aria-hidden="true"><span>On</span><span>Line item</span><span class="num">Amount</span><span>Billed</span><span class="num">Per month</span><span class="num">Per year</span><span></span></div>
      ${items.filter(i=>i.cat===name).map(i=>`<div class="bitem${i.on?"":" off"}" data-id="${i.id}">
        <label class="sw"><input type="checkbox" ${i.on?"checked":""} aria-label="Include ${esc(i.n)}"><span></span></label>
        <div class="nm"><input type="text" value="${esc(i.n)}" aria-label="Name of line item" maxlength="80" placeholder="Name this item">${i.flag?`<span class="tag hot">check</span>`:""}${i.h?`<small>${esc(i.h)}</small>`:""}</div>
        <label><span class="lbl">Amount</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${Number(i.a)||0}" aria-label="Amount for ${esc(i.n)}"></label>
        <label><span class="lbl">Billed</span><select aria-label="How often ${esc(i.n)} bills"><option value="m"${i.f==="m"?" selected":""}>Monthly</option><option value="q"${i.f==="q"?" selected":""}>Quarterly</option><option value="y"${i.f==="y"?" selected":""}>Yearly</option></select></label>
        <div class="num"><span class="lbl">Per month</span><span class="pm"></span></div>
        <div class="num"><span class="lbl">Per year</span><span class="py"></span></div>
        <button type="button" class="bdel" aria-label="Delete ${esc(i.n)}" title="Delete">✕</button>
      </div>`).join("")||`<div class="empty" style="padding:12px 18px">No line items yet.</div>`}
      <button type="button" class="badd" data-cat="${esc(name)}">+ Add line item</button></div>`).join("");
    totals();
  }
  function totals(){
    let all=0;
    cats().forEach((name,ci)=>{ const t=items.filter(i=>i.cat===name).reduce((s,i)=>s+yearly(i),0); all+=t;
      const el=$("bct"+ci); if(el) el.innerHTML=`${usd(t/12,0)}<span>/mo</span> · ${usd(t,0)}<span>/yr</span>`; });
    items.forEach(i=>{ const row=document.querySelector(`.bitem[data-id="${i.id}"]`); if(!row) return;
      const y=yearly(i); row.querySelector(".pm").textContent=usd(y/12,2); row.querySelector(".py").textContent=usd(y,2);
      row.classList.toggle("off",!i.on); });
    const sv=BASE-all;
    $("bStats").innerHTML=`<div class="stat hero"><b>${usd(all/12,0)}</b><span>Budget per month</span></div>
      <div class="stat"><b>${usd(all,0)}</b><span>Budget per year</span></div>
      <div class="stat"><b>${usd(BASE,0)}</b><span>2026 run rate per year</span></div>
      <div class="stat save"><b class="${sv<0?"neg":""}">${usd(sv,0)}</b><span>Yearly savings vs 2026</span></div>`;
    status();
  }
  function status(){
    const d=dirty();
    if(loaded) ls.set(DRAFT,d?JSON.stringify(plain(items)):null);
    $("bSaveBar").classList.toggle("dirty",d);
    $("bSave").disabled=!d||saving||!loaded;
    $("bSave").textContent=saving?"Saving…":"Save";
    $("bUndo").classList.toggle("hidden",!undo);
    $("bStatus").textContent=err?err:!loaded?"Loading your budget…":undo?`Deleted ${undo.item.n||"a line item"}. Press Save to keep this change.`
      :d&&savedSig===""?"This budget isn't in your Google Sheet yet. Press Save to keep it.":d?"You have unsaved changes.":savedAt?`All changes saved (${savedAt}).`:"Nothing saved yet. Press Save to keep this budget.";
  }
  const find=el=>{ const r=el.closest(".bitem"); return r&&items.find(i=>i.id===r.dataset.id); };

  async function load(){
    if(loaded||loading||typeof run!=="function"||typeof TOKEN==="undefined"||!TOKEN) return;
    loading=true; err=""; status();
    try{
      const r=await run("adminBudgetGet");
      savedAt=r.savedAt||"";
      const fromSheet=Array.isArray(r.items)&&r.items.length?r.items:null;
      const base=fromSheet||DEFAULTS;
      savedSig=fromSheet?sig(withIds(fromSheet)):"";   // "" = never saved, so Save is offered
      let draft=null; try{ draft=JSON.parse(ls.get(DRAFT)); }catch(e){}
      items=withIds(Array.isArray(draft)&&draft.length?draft:base);
      loaded=true;
    }catch(e){ err="Couldn't load your saved budget: "+(e&&e.message||e)+". Refresh the page to try again."; }
    loading=false; render();
  }
  async function save(){
    if(saving) return; saving=true; err=""; status();
    try{
      const r=await run("adminBudgetSave",plain(items));
      savedAt=r.savedAt||""; items=withIds(r.items||[]); savedSig=sig(items); undo=null;
      if(typeof toast==="function") toast("Budget saved");
    }catch(e){ err="That didn't save: "+(e&&e.message||e)+". Try again."; }
    saving=false; render();
  }

  function init(){
    const box=$("bCats"); if(!box) return;
    box.addEventListener("input",e=>{ const t=e.target, i=find(t); if(!i) return;
      if(t.type==="checkbox") i.on=t.checked?1:0;
      else if(t.type==="number") i.a=Math.max(0,parseFloat(t.value)||0);
      else if(t.tagName==="SELECT") i.f=t.value;
      else i.n=t.value;
      undo=null; err=""; totals(); });
    box.addEventListener("change",e=>{ const t=e.target, i=find(t); if(!i) return;
      if(t.tagName==="SELECT"){ i.f=t.value; totals(); }
      if(t.type==="text"&&t.closest(".nm")){ i.n=t.value.trim(); t.value=i.n; totals(); } });
    box.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
      if(b.classList.contains("badd")){ const n=withIds([{cat:b.dataset.cat,n:"",a:0,f:"m",on:1}])[0]; items.push(n); undo=null; render();
        const el=document.querySelector(`.bitem[data-id="${n.id}"] .nm input`); if(el) el.focus(); }
      if(b.classList.contains("bdel")){ const i=find(b); const at=items.indexOf(i); items.splice(at,1); undo={item:i,at}; render(); $("bUndo").focus(); } });
    $("bUndo").onclick=()=>{ if(!undo) return; items.splice(undo.at,0,undo.item); const id=undo.item.id; undo=null; render();
      const el=document.querySelector(`.bitem[data-id="${id}"] .nm input`); if(el) el.focus(); };
    $("bSave").onclick=save;
    $("bCuts").onclick=()=>{ items.forEach(i=>{ if(i.cut==="off") i.on=0; else if(i.cut!==""&&isFinite(Number(i.cut))) i.a=Number(i.cut); }); undo=null; render(); };
    $("bReset").onclick=()=>{ items=withIds(DEFAULTS); undo=null; render(); };
    window.addEventListener("beforeunload",e=>{ if(dirty()){ e.preventDefault(); e.returnValue=""; } });

    // Money button opens a menu: Overview or Operational Budget.
    const btn=$("moneyBtn"), menu=$("moneyMenu"); if(!btn||!menu) return;
    const items_=[...menu.querySelectorAll("[data-m]")];
    const open=on=>{ menu.classList.toggle("hidden",!on); btn.setAttribute("aria-expanded",String(on)); if(on) items_[0].focus(); };
    const pick=m=>{ items_.forEach(x=>x.dataset.m===m?x.setAttribute("aria-current","page"):x.removeAttribute("aria-current"));
      $("m-overview").classList.toggle("hidden",m!=="overview"); $("m-budget").classList.toggle("hidden",m!=="budget");
      $("moneyTitle").textContent=m==="budget"?"Operational Budget":"Money"; ls.set("mmrsMoneyTab",m);
      if(m==="budget") load(); };
    btn.onclick=e=>{ e.stopPropagation(); open(menu.classList.contains("hidden")); };
    // app.js also gives these buttons its tab handler, which opens the Money view first.
    items_.forEach(x=>x.addEventListener("click",()=>{ pick(x.dataset.m); open(false); btn.focus(); }));
    menu.addEventListener("keydown",e=>{ const k=items_.indexOf(document.activeElement);
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); items_[(k+(e.key==="ArrowDown"?1:items_.length-1))%items_.length].focus(); } });
    document.addEventListener("click",e=>{ if(!e.target.closest(".navdd")) open(false); });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!menu.classList.contains("hidden")){ open(false); btn.focus(); } });
    pick(ls.get("mmrsMoneyTab")==="budget"?"budget":"overview");
    // Load once the budget is actually on screen (for example right after signing in).
    new MutationObserver(()=>{ if(!$("v-money").classList.contains("hidden")&&!$("m-budget").classList.contains("hidden")) load(); })
      .observe($("v-money"),{attributes:true,attributeFilter:["class"]});
    render();
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
