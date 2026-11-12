/* Fino · Долги — кредиты, рассрочки, досрочка, стратегия. */
(function(){'use strict';
/* ===================== ENGINE START ===================== */
const pad=n=>String(n).padStart(2,'0');
const ymd=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
function todayStr(){const t=new Date();return ymd(t.getFullYear(),t.getMonth()+1,t.getDate());}
function parts(ds){return ds.split('-').map(Number);}
function utc(ds){const [y,m,d]=parts(ds);return Date.UTC(y,m-1,d);}
function days(a,b){return Math.round((utc(b)-utc(a))/864e5);}
function addMonths(ds,k){const [y,m,d]=parts(ds);let mm=m-1+k;const yy=y+Math.floor(mm/12);mm=((mm%12)+12)%12;const last=new Date(Date.UTC(yy,mm+1,0)).getUTCDate();return ymd(yy,mm+1,Math.min(d,last));}
function monthsBetween(a,b){const [y1,m1]=parts(a),[y2,m2]=parts(b);return (y2-y1)*12+(m2-m1);}
function annuity(B,r,n){if(n<=0)return B;if(r<=0)return B/n;return B*r/(1-Math.pow(1+r,-n));}

function monthlyRate(L){
  if(L.rate>0) return L.rate/1200;
  const s=L.schedule;
  if(s&&s.length){const P=L.principal||(s[0].bal+s[0].prin);if(P>0)return s[0].int/P;}
  return 0;
}
/* Base schedule: imported from the bank document, or generated from parameters */
function genBase(L){
  if(L.schedule&&L.schedule.length) return L.schedule.map(r=>({d:r.d,pay:+r.pay,prin:+r.prin,int:+r.int,bal:+r.bal}));
  const n=Math.round(L.termMonths||0), r=monthlyRate(L); let B=+L.principal||0;
  if(!n||!B||!L.firstPaymentDate) return [];
  const A=annuity(B,r,n), P=B/n, rows=[];
  for(let i=0;i<n;i++){
    const d=addMonths(L.firstPaymentDate,i), int=B*r;
    let prin=L.type==='diff'?P:A-int;
    if(i===n-1||prin>B) prin=B;
    B-=prin; rows.push({d,pay:prin+int,prin,int,bal:Math.max(0,B)});
  }
  return rows;
}
/* Effective schedule with early repayments.
   early: [{d, amt, mode:'term'|'payment'}]. Interest in a period with an early payment is split by days. */
function simulate(L,early){
  const base=genBase(L); if(!base.length) return [];
  const E=(early||[]).filter(e=>e&&e.amt>0&&e.d).slice().sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0);
  if(!E.length) return base.map(r=>({...r,kind:'reg'}));
  const r=monthlyRate(L), rows=[], dates=base.map(x=>x.d);
  let i=0; const firstE=E[0].d;
  while(i<base.length&&base[i].d<firstE){rows.push({...base[i],kind:'reg'});i++;}
  let B=i>0?base[i-1].bal:(+L.principal||(base[0].bal+base[0].prin));
  let prev=i>0?base[i-1].d:(L.issueDate&&L.issueDate<base[0].d?L.issueDate:addMonths(base[0].d,-1));
  const ref=base[Math.min(i,base.length-1)];
  let A=(i>=base.length-1&&L.type!=='diff')?annuity(B,r,1):ref.pay;
  if(!L.schedule||!L.schedule.length){ if(L.type!=='diff') A=annuity(B,r,base.length-i); }
  let P=ref.prin;
  let ei=0; while(ei<E.length&&E[ei].d<=prev) ei++;
  for(;i<dates.length&&B>0.005;i++){
    const d1=dates[i], span=Math.max(1,days(prev,d1));
    let acc=0,cur=prev;
    while(ei<E.length&&E[ei].d<=d1){
      const e=E[ei++]; acc+=B*Math.max(0,days(cur,e.d)); cur=e.d>cur?e.d:cur;
      const amt=Math.min(+e.amt,B); if(amt<=0) continue;
      B-=amt; rows.push({d:e.d,pay:amt,prin:amt,int:0,bal:Math.max(0,B),kind:'early',mode:e.mode,eid:e.id,plan:!!e.plan});
      const m=dates.length-i;
      if(e.mode==='payment'&&B>0.005){ if(L.type==='diff') P=B/m; else A=annuity(B,r,m); }
    }
    acc+=B*Math.max(0,days(cur,d1));
    const int=r*acc/span;
    if(B<=0.005){B=0; if(int>0.5) rows.push({d:d1,pay:int,prin:0,int,bal:0,kind:'reg'}); break;}
    let prin=L.type==='diff'?P:A-int; if(prin<0) prin=0;
    if(i===dates.length-1||prin>=B) prin=B;
    B-=prin; rows.push({d:d1,pay:prin+int,prin,int,bal:Math.max(0,B),kind:'reg'});
    prev=d1;
  }
  return rows;
}
const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
/* Status as of `today`: every payment whose date has come is treated as paid (auto-deduct). */
function stats(L,today,early){
  const ev=early===undefined?(L.early||[]):early;
  const rows=simulate(L,ev), base=simulate(L,[]);
  const paid=rows.filter(x=>x.d<=today), left=rows.filter(x=>x.d>today);
  const lastPaid=paid.length?paid[paid.length-1]:null;
  const principal=+L.principal||(rows.length?rows[0].bal+rows[0].prin:0);
  const balance=lastPaid?lastPaid.bal:principal;
  const regLeft=left.filter(x=>x.kind==='reg');
  const next=regLeft[0]||null;
  const totalInt=sum(rows,x=>x.int), baseInt=sum(base,x=>x.int);
  return {
    rows,base,paid,left,principal,balance,next,
    paidTotal:sum(paid,x=>x.pay), intPaid:sum(paid,x=>x.int), prinPaid:principal-balance,
    leftTotal:sum(left,x=>x.pay), intLeft:sum(left,x=>x.int),
    totalInt, baseInt, saved:Math.max(0,baseInt-totalInt),
    endDate:rows.length?rows[rows.length-1].d:null,
    baseEnd:base.length?base[base.length-1].d:null,
    monthsLeft:regLeft.length,
    lastPaidDate:lastPaid?lastPaid.d:(L.issueDate||null),
    closed:balance<=0.5,
    progress:principal>0?Math.min(1,Math.max(0,(principal-balance)/principal)):0,
    r:monthlyRate(L)
  };
}
/* Amount to close the loan fully on date `onDate` (balance + interest accrued since last payment) */
function payoffAmount(L,st,onDate){
  if(st.closed) return 0;
  const from=st.lastPaidDate||onDate; const dd=Math.max(0,days(from,onDate));
  return st.balance+st.balance*st.r*dd/30.4;
}
/* What-if: one-time lump + monthly extra on each future payment date */
function scenario(L,today,{lump=0,lumpDate=null,monthly=0,mode='term'}={}){
  const E=[...(L.early||[])];
  if(lump>0) E.push({d:lumpDate||today,amt:lump,mode,plan:true});
  if(monthly>0){ for(const r of genBase(L)) if(r.d>today) E.push({d:r.d,amt:monthly,mode,plan:true}); }
  const st=stats(L,today,E);
  const after=st.rows.filter(x=>x.d>(lumpDate||today)&&x.kind==='reg');
  return {...st,newPayment:after.length?after[0].pay:0};
}
/* Minimal monthly extra to close by targetDate */
function requiredMonthly(L,today,target,mode='term'){
  const cur=stats(L,today); if(cur.closed) return 0;
  if(cur.endDate<=target) return 0;
  let lo=0,hi=cur.balance+1;
  const ok=x=>{const s=scenario(L,today,{monthly:x,mode});return s.endDate<=target;};
  if(!ok(hi)) return null;
  for(let k=0;k<45;k++){const mid=(lo+hi)/2; if(ok(mid)) hi=mid; else lo=mid;}
  return Math.ceil(hi/100)*100;
}
/* Multi-loan strategy (monthly model): avalanche = highest rate first, snowball = smallest balance first */
function strategy(loans,today,extra,method,rollover=true){
  const st=loans.map(L=>{const s=stats(L,today);const r=s.r;
    const pay=s.next?s.next.pay:0, prin=s.next?s.next.prin:0;
    return {L,id:L.id,name:L.name,B:s.balance,r,eff:(+L.gesv||+L.rate||r*1200),type:L.type,A:pay,P:prin,done:s.closed?0:null};});
  let month=0,totalInt=0;
  const active=()=>st.filter(x=>x.B>0.5);
  while(active().length&&month<720){
    month++; let pool=extra;
    for(const x of st){
      if(x.B<=0.5){ if(rollover&&x.A>0&&x.done!==0) pool+=x.A; continue; }
      const int=x.B*x.r; totalInt+=int;
      let prin=x.type==='diff'?Math.min(x.P,x.B):Math.min(x.A-int,x.B);
      if(prin<0) prin=0;
      if(x.A<=0) prin=x.B; // no schedule info: treat as closing
      x.B-=prin; if(x.B<=0.5){x.B=0;x.done=month;}
    }
    if(pool>0){
      const order=active().sort(method==='snowball'?(a,b)=>a.B-b.B:(a,b)=>b.eff-a.eff||a.B-b.B);
      for(const x of order){ if(pool<=0) break; const p=Math.min(pool,x.B); x.B-=p; pool-=p; if(x.B<=0.5){x.B=0;x.done=month;} }
    }
  }
  return {months:month,totalInt,endDate:addMonths(today,month),perLoan:st.map(x=>({id:x.id,name:x.name,eff:x.eff,month:x.done,date:x.done?addMonths(today,x.done):null}))};
}
/* Heuristic parser for pasted schedule text (fallback when AI is unavailable) */
function heuristicParse(text){
  const rows=[];
  for(const line of text.split(/\r?\n/)){
    const dm=line.match(/(\d{2})[./-](\d{2})[./-](\d{4})|(\d{4})-(\d{2})-(\d{2})/); if(!dm) continue;
    const d=dm[1]?ymd(+dm[3],+dm[2],+dm[1]):ymd(+dm[4],+dm[5],+dm[6]);
    const rest=line.replace(dm[0],' ');
    const nums=(rest.match(/\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g)||[]).map(s=>parseFloat(s.replace(/[\s ]/g,'').replace(',','.'))).filter(n=>!isNaN(n));
    if(nums.length<3) continue;
    let found=null;
    for(let a=0;a<nums.length&&!found;a++)for(let b=0;b<nums.length&&!found;b++)for(let c=b+1;c<nums.length&&!found;c++){
      if(a===b||a===c) continue; if(Math.abs(nums[a]-(nums[b]+nums[c]))<=Math.max(1,nums[a]*0.002)&&nums[a]>0) found=[a,b,c];
    }
    if(!found) continue;
    const used=new Set(found); const others=nums.filter((_,k)=>!used.has(k));
    const bal=others.length?Math.max(...others):0;
    rows.push({d,pay:nums[found[0]],x:nums[found[1]],y:nums[found[2]],bal});
  }
  if(rows.length<2) return null;
  const h=Math.floor(rows.length/2), avg=(a,f)=>sum(a,f)/a.length;
  const xDown=avg(rows.slice(0,h),r=>r.x)>avg(rows.slice(h),r=>r.x);
  return rows.map(r=>({d:r.d,pay:r.pay,int:xDown?r.x:r.y,prin:xDown?r.y:r.x,bal:r.bal}));
}
/* ================= Долги — интерфейс ================= */
const F=()=>window.__fino;
const D=()=>{const S=F().S(); if(!S.debts) S.debts={loans:[],settings:{}}; const st=S.debts.settings; if(st.depositRate==null) st.depositRate=13; if(st.emergency==null) st.emergency=3; if(!Array.isArray(S.debts.loans)) S.debts.loans=[]; return S.debts;};
const loans=()=>D().loans;
const CUR={KZT:'₸',USD:'$',EUR:'€',RUB:'₽'};
const nf0=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
const nf2=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const money=(n,c)=>(n<0?'−':'')+nf0.format(Math.abs(Math.round(n||0)))+' '+(c||'₸');
const pct=n=>n?nf2.format(n)+'%':'0%';
const fd=ds=>{if(!ds)return '—';const [y,m,d]=parts(ds);return `${pad(d)}.${pad(m)}.${y}`;};
const MON=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const fm=ds=>{if(!ds)return '—';const [y,m]=parts(ds);return `${MON[m-1]} ${y}`;};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
const plural=(n,a,b,c)=>{n=Math.abs(n)%100;const n1=n%10;if(n>10&&n<20)return c;if(n1>1&&n1<5)return b;if(n1===1)return a;return c;};
const mtxt=n=>{const y=Math.floor(n/12),m=n%12;const p=[];if(y)p.push(y+' '+plural(y,'год','года','лет'));if(m||!y)p.push(m+' '+plural(m,'месяц','месяца','месяцев'));return p.join(' ');};
const cur=L=>L.currency||'₸';
const TODAY=()=>todayStr();
const toast=t=>F().toast(t);
const KINDS={credit:['Кредит','💳'],installment:['Рассрочка','🛍️'],auto:['Автокредит','🚗'],mortgage:['Ипотека','🏠'],card:['Кредитка','💳'],other:['Другое','📄']};
const kindOf=L=>KINDS[L.ltype]?L.ltype:((+L.rate||+L.gesv)?'credit':'installment');
const X='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

let st={tab:'overview',loanId:null,filter:'all',early:{loanId:null,lump:0,lumpDate:null,monthly:0,target:''},strat:{extra:50000,rollover:true}};

/* ---------- storage ---------- */
function save(quiet){ F().persist(); syncOps(); if(!quiet) F().render(); }
function saveLoan(L,quiet){ const a=loans(); const i=a.findIndex(x=>x.id===L.id); if(i>=0)a[i]=L; else a.push(L); save(quiet); if(!quiet) checkCelebrations(); }
function removeLoan(id){ D().loans=loans().filter(x=>x.id!==id); save(); }

/* ---------- salary from Fino incomes ---------- */
function avgSalaryFino(){
  const S=F().S(), now=new Date(), tot=[];
  for(let k=1;k<=3;k++){const d=new Date(now.getFullYear(),now.getMonth()-k,1);const ym=d.getFullYear()+'-'+pad(d.getMonth()+1);
    tot.push((S.ops||[]).filter(o=>o.type==='income'&&o.category==='salary'&&o.date.slice(0,7)===ym).reduce((a,o)=>a+o.amount,0));}
  const p=tot.filter(v=>v>0); return p.length?p.reduce((a,b)=>a+b,0)/p.length:0;
}
function salaryInfo(){ const m=+D().settings.salary||0; if(m) return {v:m,src:'manual'}; const f=avgSalaryFino(); return f?{v:f,src:'fino'}:{v:0,src:null}; }

/* ---------- loan payments → Fino expenses ---------- */
function syncOps(){
  const S=F().S(), set=D().settings, on=!!set.toFino, from=set.toFinoFrom||TODAY(), t=TODAY(), want={};
  if(on) for(const L of loans()){ let rows=[]; try{rows=stats(L,t).rows;}catch(e){}
    for(const r of rows){ if(r.d>t||r.d<from) continue; const id='qz-'+L.id+'-'+r.d+'-'+r.kind;
      want[id]={id,type:'expense',category:'loans',amount:Math.round(r.pay),date:r.d,note:(r.kind==='early'?'Досрочное погашение: ':'Платёж по кредиту: ')+(L.name||'Кредит'),src:'Долги',created:Date.now()}; } }
  let changed=false; const n=S.ops.length;
  S.ops=S.ops.filter(o=>!(typeof o.id==='string'&&o.id.indexOf('qz-')===0&&!want[o.id])); if(S.ops.length!==n) changed=true;
  for(const id in want){ const ex=S.ops.find(o=>o.id===id); if(!ex){S.ops.push(want[id]);changed=true;} else if(ex.amount!==want[id].amount){ex.amount=want[id].amount;changed=true;} }
  if(Object.keys(want).length&&!S.cats.expense.some(c=>c.id==='loans')){ S.cats.expense.push({id:'loans',name:'Кредиты',emoji:'🏦'}); changed=true; }
  if(changed) F().persist();
  return changed;
}

/* ---------- views ---------- */
function html(){
  const L=st.loanId&&loans().find(x=>x.id===st.loanId); if(st.loanId&&!L) st.loanId=null;
  const head=`<div class="title-row"><div class="view-title">Долги</div><button class="btn sm dark" data-d="add">＋ Добавить</button></div>`;
  if(!loans().length) return head+viewEmpty();
  if(L) return head+viewLoan(L);
  const tabs=[['overview','Обзор'],['early','Досрочка'],['strategy','Стратегия'],['tips','Советы']];
  const body=st.tab==='early'?viewEarly():st.tab==='strategy'?viewStrategy():st.tab==='tips'?viewTips():viewOverview();
  return head+`<div class="seg dbt-tabs">${tabs.map(([k,l])=>`<button data-dt="${k}" class="${st.tab===k?'on':''}">${l}</button>`).join('')}</div><div class="dbt">${body}</div>`;
}
function bind(el){
  el.querySelectorAll('[data-dt]').forEach(b=>b.onclick=()=>{st.tab=b.dataset.dt;F().render();});
  el.querySelectorAll('[data-d="add"]').forEach(b=>b.onclick=()=>openLoanSheet(null));
  if(!loans().length){ el.querySelectorAll('[data-d="doc"]').forEach(b=>b.onclick=()=>openLoanSheet(null,'doc')); el.querySelectorAll('[data-d="man"]').forEach(b=>b.onclick=()=>openLoanSheet(null,'manual')); return; }
  if(st.loanId){ bindLoan(el,loans().find(x=>x.id===st.loanId)); return; }
  if(st.tab==='early') bindEarly(el); else if(st.tab==='strategy') bindStrategy(el); else if(st.tab==='tips') bindTips(el); else bindOverview(el);
}
function viewEmpty(){return `<div class="card soft empty"><div style="font-size:40px">💳</div><div class="e1">Добавь первый кредит или рассрочку</div>
<div>Загрузи график погашения из банка (PDF, Excel, текст) — подтяну сумму, ставку, ГЭСВ, срок и все платежи. Или заполни вручную.</div>
<div class="btn-row"><button class="btn dark" data-d="doc">Загрузить график</button><button class="btn" data-d="man">Ввести вручную</button></div></div>`;}

function zone(share){return share<=0.3?['good','Комфортно','До 30% — здоровая нагрузка']:share<=0.5?['warn','Ощутимо','30–50% — бюджет напряжён, новые кредиты лучше не брать']:['bad','Опасно','Больше 50% — высокий риск: в приоритете досрочка, никаких новых долгов'];}
function monthLoad(ls,ym){let s=0;for(const L of ls)for(const r of stats(L,TODAY()).rows)if(r.kind==='reg'&&r.d.slice(0,7)===ym)s+=r.pay;return s;}
function pill(L,s){ if(s.closed) return '<span class="dpill good">Закрыт ✓</span>'; if(s.next&&days(TODAY(),s.next.d)<=5) return `<span class="dpill warn">Платёж через ${days(TODAY(),s.next.d)} дн.</span>`; const e=+L.gesv||+L.rate; return e?`<span class="dpill">${pct(e)}${L.gesv?' ГЭСВ':''}</span>`:'<span class="dpill acc">без %</span>'; }

function viewOverview(){
  const all=loans(), Fk=st.filter;
  const list=all.filter(L=>Fk==='all'||kindOf(L)===Fk);
  const cnt={}; all.forEach(L=>cnt[cur(L)]=(cnt[cur(L)]||0)+1); const c=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0]||'₸';
  const A=list.filter(L=>cur(L)===c).map(L=>({L,s:stats(L,TODAY())}));
  const open=A.filter(x=>!x.s.closed), closed=A.filter(x=>x.s.closed);
  const T={taken:sum(A,x=>x.s.principal),prinPaid:sum(A,x=>x.s.prinPaid),bal:sum(A,x=>x.s.balance),left:sum(A,x=>x.s.leftTotal),paid:sum(A,x=>x.s.paidTotal),
    intAll:sum(A,x=>x.s.totalInt),intPaid:sum(A,x=>x.s.intPaid),intLeft:sum(A,x=>x.s.intLeft),saved:sum(A,x=>x.s.saved),monthly:sum(open,x=>x.s.next?x.s.next.pay:0)};
  const prog=T.taken?T.prinPaid/T.taken:0, other=all.filter(L=>cur(L)!==c).length;
  const kp=[...new Set(all.map(kindOf))];
  const chips=kp.length>1?`<div class="dbt-chips">${[['all','Все · '+all.length]].concat(kp.map(k=>[k,KINDS[k][1]+' '+KINDS[k][0]+' · '+all.filter(L=>kindOf(L)===k).length])).map(([k,l])=>`<button data-df="${k}" class="${Fk===k?'on':''}">${l}</button>`).join('')}</div>`:'';
  const si=salaryInfo(); let sal;
  if(si.v){
    const share=T.monthly/si.v, z=zone(share);
    const ms=[];for(let k=0;k<12;k++){const ym=addMonths(TODAY().slice(0,8)+'01',k).slice(0,7);ms.push({ym,v:monthLoad(open.map(x=>x.L),ym)});}
    const mx=Math.max(si.v*0.6,...ms.map(m=>m.v))||1;
    let run=T.monthly; const steps=open.map(x=>({L:x.L,d:x.s.endDate,pay:x.s.next?x.s.next.pay:0})).sort((a,b)=>a.d<b.d?-1:1).map(e=>{run-=e.pay;const r=Math.max(0,run);return `<li>после <b>${fm(e.d)}</b> закроется «${esc(e.L.name)}» → платежи <b>${money(r,c)}</b> (${Math.round(r/si.v*100)}% зарплаты), освободится ${money(e.pay,c)}</li>`;}).join('');
    sal=`<div class="card"><h2>Нагрузка на зарплату <button class="btn sm" data-d="sal">${money(si.v,c)}${si.src==='fino'?' · из доходов':''}</button></h2>
      <div class="dbt-dti"><span class="v ${z[0]}">${(share*100).toFixed(0)}%</span><span class="dpill ${z[0]}">${z[1]}</span></div>
      <div class="dbar big"><i class="${z[0]}" style="width:${Math.min(100,share*100).toFixed(1)}%"></i><span class="mk" style="left:30%"></span><span class="mk" style="left:50%"></span></div>
      <div class="muted">${money(T.monthly,c)} из ${money(si.v,c)} уходит на кредиты · после платежей остаётся <b class="ink">${money(si.v-T.monthly,c)}</b>. ${z[2]}.</div>
      <div class="dbt-mbars">${ms.map(m=>`<div><em>${m.v?Math.round(m.v/si.v*100)+'%':''}</em><i class="${zone(m.v/si.v)[0]}" style="height:${Math.max(2,m.v/mx*100).toFixed(0)}%"></i><span>${MON[+m.ym.slice(5)-1]}</span></div>`).join('')}</div>
      ${steps?`<div class="dbt-sub">Когда станет легче</div><ul class="dbt-steps">${steps}</ul>`:''}</div>`;
  } else sal=`<div class="card"><h2>Нагрузка на зарплату</h2><div class="muted" style="margin-bottom:12px">Добавь доходы с категорией «Зарплата» во вкладке Операции — подтяну среднюю за 3 месяца. Или укажи вручную.</div><button class="btn sm dark" data-d="sal">Указать зарплату</button></div>`;
  const card=({L,s})=>{const cc=cur(L),k=KINDS[kindOf(L)];return `<button class="card dloan" data-loan="${L.id}">
    <div class="r1"><div><div class="nm">${k[1]} ${esc(L.name||'Кредит')}</div><div class="muted" style="font-size:12px">${k[0]}${L.bank?' · '+esc(L.bank):''}</div></div>${pill(L,s)}</div>
    <div class="dbar"><i style="width:${(s.progress*100).toFixed(1)}%"></i></div>
    <div class="r2 muted"><span>погашено ${(s.progress*100).toFixed(0)}%</span><span>${s.closed?'закрыт '+fm(s.endDate):'до '+fm(s.endDate)}</span></div>
    <div class="dmeta"><div><span>Взято</span><b>${money(s.principal,cc)}</b></div><div><span>Осталось</span><b>${money(s.balance,cc)}</b></div>
    <div><span>Платёж</span><b>${s.next?money(s.next.pay,cc):'—'}</b><span>${s.next?fd(s.next.d):''}</span></div><div><span>Переплата</span><b>${money(s.totalInt,cc)}</b><span>уже ${money(s.intPaid,cc)}</span></div></div></button>`;};
  const rowT=({L,s})=>{const cc=cur(L),k=KINDS[kindOf(L)];return `<tr class="${s.closed?'paid':''}" data-loan="${L.id}"><td>${k[1]} <b>${esc(L.name)}</b><div class="muted" style="font-size:11px">${k[0]}${L.bank?' · '+esc(L.bank):''}</div></td><td>${money(s.principal,cc)}</td><td>${money(s.paidTotal,cc)}</td><td><b>${money(s.balance,cc)}</b></td><td>${s.next?money(s.next.pay,cc):'—'}</td><td>${pct(+L.gesv||+L.rate)}</td><td>${s.closed?'✓ '+fm(s.endDate):fm(s.endDate)}</td><td style="width:80px"><div class="dbar" style="margin:0"><i style="width:${(s.progress*100).toFixed(0)}%"></i></div></td></tr>`;};
  const up=[]; for(const {L,s} of open) for(const r of s.left) if(r.kind==='reg'&&days(TODAY(),r.d)<=35) up.push({L,r}); up.sort((a,b)=>a.r.d<b.r.d?-1:1);
  return `${chips}
  <div class="card dhero"><div class="lbl">Осталось погасить${Fk!=='all'?' · '+KINDS[Fk][0]:''}</div><div class="big num">${money(T.bal,c)}</div>
    <div class="sub">вместе с процентами впереди — ${money(T.left,c)}</div>
    <div class="dbar big inv"><i style="width:${(prog*100).toFixed(1)}%"></i></div>
    <div class="h3"><div><span>Всего взято</span><b>${money(T.taken,c)}</b></div><div><span>Погашено долга</span><b>${money(T.prinPaid,c)} · ${(prog*100).toFixed(0)}%</b></div><div><span>Активных / закрытых</span><b>${open.length} / ${closed.length}</b></div></div></div>
  <div class="dkpis">
    <div class="card soft"><div class="k">Платёж в месяц</div><div class="v num">${money(T.monthly,c)}</div><div class="s">по всем активным</div></div>
    <div class="card soft"><div class="k">Уже выплачено</div><div class="v num">${money(T.paid,c)}</div><div class="s">из них процентов ${money(T.intPaid,c)}</div></div>
    <div class="card soft"><div class="k">Переплата всего</div><div class="v num">${money(T.intAll,c)}</div><div class="s">впереди ещё ${money(T.intLeft,c)}</div></div>
    <div class="card soft"><div class="k">Сэкономил досрочкой</div><div class="v num good">${money(T.saved,c)}</div><div class="s">по внесённым досрочным</div></div></div>
  ${other?`<div class="dnote warn">${other} ${plural(other,'кредит','кредита','кредитов')} в другой валюте — в итоги не входят.</div>`:''}
  ${sal}
  <div class="card dtable desk"><h2>Все обязательства</h2><div class="scx"><table><thead><tr><th>Обязательство</th><th>Взято</th><th>Выплачено</th><th>Осталось</th><th>Платёж</th><th>Ставка</th><th>Закрытие</th><th></th></tr></thead><tbody>${[...open,...closed].map(rowT).join('')}</tbody>
    <tfoot><tr><td>Итого</td><td>${money(T.taken,c)}</td><td>${money(T.paid,c)}</td><td>${money(T.bal,c)}</td><td>${money(T.monthly,c)}</td><td></td><td></td><td>${(prog*100).toFixed(0)}%</td></tr></tfoot></table></div></div>
  <div class="mob"><div class="dbt-sub">Все обязательства</div><div class="grid">${open.map(card).join('')}</div>
  ${closed.length?`<div class="dbt-sub">Закрытые 🎉</div><div class="grid">${closed.map(card).join('')}</div>`:''}</div>
  <div class="card"><h2>Ближайшие платежи</h2>${up.length?`<div class="scx"><table><thead><tr><th>Дата</th><th>Кредит</th><th>Платёж</th><th>Долг</th><th>Проценты</th></tr></thead><tbody>${up.map(({L,r})=>`<tr><td>${fd(r.d)} <span class="muted">· ${days(TODAY(),r.d)} дн.</span></td><td>${esc(L.name)}</td><td><b>${money(r.pay,cur(L))}</b></td><td>${money(r.prin,cur(L))}</td><td>${money(r.int,cur(L))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">В ближайший месяц платежей нет.</div>'}
  <div class="muted" style="margin-top:10px;font-size:12px">🔄 В день платежа сумма сама списывается с остатка — отмечать ничего не нужно.</div></div>`;
}
function bindOverview(el){
  el.querySelectorAll('[data-loan]').forEach(b=>b.onclick=()=>{st.loanId=b.dataset.loan;F().render();F().scrollTop();});
  el.querySelectorAll('[data-df]').forEach(b=>b.onclick=()=>{st.filter=b.dataset.df;F().render();});
  el.querySelectorAll('[data-d="sal"]').forEach(b=>b.onclick=salarySheet);
}
function salarySheet(){
  const si=salaryInfo();
  F().openSheet(`<h3>Зарплата в месяц<button class="x" data-close aria-label="Закрыть">${X}</button></h3>
    <div class="field"><label>На руки, после налогов</label><input type="number" inputmode="numeric" id="smV" value="${+D().settings.salary||''}" placeholder="${si.src==='fino'?Math.round(si.v):''}"></div>
    <div class="muted">Оставь пустым — возьму среднюю зарплату за последние 3 месяца из доходов (категория «Зарплата»).</div>
    <div class="btn-row" style="justify-content:flex-end"><button class="btn" data-close>Отмена</button><button class="btn dark" id="smOk">Сохранить</button></div>`,sh=>{
    sh.querySelector('#smOk').onclick=()=>{D().settings.salary=+sh.querySelector('#smV').value||0;F().closeSheet();save();};});
}

/* ---------- loan detail ---------- */
function schedTable(L,s){
  const c=cur(L),t=TODAY(); let nx=false;
  return `<div class="scx dsched"><table><thead><tr><th>Дата</th><th>Платёж</th><th>Долг</th><th>Проценты</th><th>Остаток</th><th></th></tr></thead><tbody>${s.rows.map(r=>{const paid=r.d<=t;let cl=r.kind==='early'?'early':(paid?'paid':'');if(!paid&&r.kind==='reg'&&!nx){cl+=' next';nx=true;}
    return `<tr class="${cl}"><td>${fd(r.d)}</td><td>${money(r.pay,c)}</td><td>${money(r.prin,c)}</td><td>${money(r.int,c)}</td><td>${money(r.bal,c)}</td><td style="font-size:11px">${r.kind==='early'?(paid?'досрочно ✓':'досрочно, план'):(paid?'✓':'')}</td></tr>`;}).join('')}</tbody></table></div>`;
}
function viewLoan(L){
  const s=stats(L,TODAY()),c=cur(L),k=KINDS[kindOf(L)];
  const early=(L.early||[]).slice().sort((a,b)=>a.d<b.d?-1:1);
  return `<button class="dback" data-d="back">← Все долги</button>
  <div class="card"><h2 style="margin-bottom:4px">${k[1]} ${esc(L.name||'Кредит')}<span style="display:flex;gap:6px"><button class="btn sm" data-d="edit">Изменить</button><button class="btn sm danger" data-d="del">Удалить</button></span></h2>
   <div class="muted">${k[0]}${L.bank?' · '+esc(L.bank):''} · ${L.type==='diff'?'дифференцированный':'аннуитет'} · ставка ${pct(+L.rate||s.r*1200)} · ГЭСВ ${pct(+L.gesv)} · ${L.termMonths||s.base.length} мес.</div>
   <div class="dbar big"><i style="width:${(s.progress*100).toFixed(1)}%"></i></div>
   <div class="dmeta three">
    <div><span>Остаток долга</span><b>${money(s.balance,c)}</b><span>из ${money(s.principal,c)}</span></div>
    <div><span>Следующий платёж</span><b>${s.next?money(s.next.pay,c):'—'}</b><span>${s.next?fd(s.next.d):''}</span></div>
    <div><span>Закрою</span><b>${fm(s.endDate)}</b><span>осталось ${mtxt(s.monthsLeft)}${s.endDate!==s.baseEnd?' · по графику '+fm(s.baseEnd):''}</span></div>
    <div><span>Переплата всего</span><b>${money(s.totalInt,c)}</b><span>${s.principal?Math.round(s.totalInt/s.principal*100)+'% от суммы':''}</span></div>
    <div><span>Уже переплатил</span><b>${money(s.intPaid,c)}</b><span>впереди ${money(s.intLeft,c)}</span></div>
    <div><span>Сэкономлено</span><b class="good">${money(s.saved,c)}</b><span>досрочкой</span></div>
    <div><span>Закрыть сегодня</span><b>${money(payoffAmount(L,s,TODAY()),c)}</b><span>остаток + проценты</span></div>
   </div>${L.notes?`<div class="dnote">📌 ${esc(L.notes)}</div>`:''}</div>
  <div class="card"><h2>Остаток долга</h2><div class="dleg"><span><i style="background:var(--s1)"></i>Фактически</span><span><i style="background:var(--s2)"></i>По графику банка</span></div><div class="dchart" id="dch1"></div></div>
  <div class="card"><h2>Досрочное погашение</h2>
    <div class="dform"><div class="field"><label>Дата</label><input type="date" id="eD" value="${TODAY()}"></div><div class="field"><label>Сумма, ${c}</label><input type="number" inputmode="numeric" id="eA" placeholder="100000"></div>
    <div class="field"><label>Режим</label><select id="eM"><option value="term">Сокращение срока</option><option value="payment">Уменьшение платежа</option></select></div><div class="field"><label>&nbsp;</label><button class="btn dark" id="eAdd" style="width:100%">Записать</button></div></div>
    <div id="ePrev" class="dnote good" style="display:none"></div>
    ${early.length?`<div class="scx"><table><thead><tr><th>Дата</th><th>Сумма</th><th>Режим</th><th></th></tr></thead><tbody>${early.map(e=>`<tr><td>${fd(e.d)}</td><td>${money(e.amt,c)}</td><td>${e.mode==='payment'?'уменьшение платежа':'сокращение срока'}</td><td><button class="btn sm danger" data-edel="${e.id}">Удалить</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">Досрочных погашений пока не было.</div>'}</div>
  <div class="card"><h2>График платежей</h2>${schedTable(L,s)}</div>`;
}
function bindLoan(el,L){
  const c=cur(L);
  el.querySelector('[data-d="back"]').onclick=()=>{st.loanId=null;F().render();};
  el.querySelector('[data-d="edit"]').onclick=()=>openLoanSheet(L,'manual');
  el.querySelector('[data-d="del"]').onclick=()=>F().openSheet(`<h3>Удалить «${esc(L.name)}»?<button class="x" data-close>${X}</button></h3><div class="muted">Все данные по этому долгу будут удалены.</div><div class="btn-row" style="justify-content:flex-end"><button class="btn" data-close>Отмена</button><button class="btn dark" id="dOk">Удалить</button></div>`,sh=>{sh.querySelector('#dOk').onclick=()=>{F().closeSheet();st.loanId=null;removeLoan(L.id);toast('Удалено');};});
  el.querySelectorAll('[data-edel]').forEach(b=>b.onclick=()=>{saveLoan({...L,early:(L.early||[]).filter(e=>e.id!==b.dataset.edel)});toast('Досрочка удалена');});
  const g=id=>el.querySelector('#'+id);
  const prev=()=>{const a=+g('eA').value,d=g('eD').value,m=g('eM').value,box=g('ePrev');if(!(a>0)||!d){box.style.display='none';return;}
    const now=stats(L,TODAY()),sc=scenario(L,TODAY(),{lump:a,lumpDate:d,mode:m});box.style.display='';
    box.innerHTML=`Экономия <b>${money(now.totalInt-sc.totalInt,c)}</b> · закрытие ${fm(sc.endDate)}${m==='payment'?` · новый платёж ≈ <b>${money(sc.newPayment,c)}</b>`:` · на ${mtxt(Math.max(0,monthsBetween(sc.endDate,now.endDate)))} раньше`}`;};
  ['eA','eD','eM'].forEach(id=>g(id).addEventListener('input',prev));
  g('eAdd').onclick=()=>{const a=+g('eA').value,d=g('eD').value;if(!(a>0)||!d){toast('Укажи дату и сумму');return;}saveLoan({...L,early:[...(L.early||[]),{id:uid(),d,amt:a,mode:g('eM').value}]});toast('Досрочное погашение записано');};
  const s=stats(L,TODAY()); lineChart(g('dch1'),[{label:'Фактически',rows:s.rows,color:'var(--s1)'},{label:'По графику банка',rows:s.base,color:'var(--s2)'}],c);
}

/* ---------- early repayment calculator ---------- */
function openLoans(){return loans().filter(L=>!stats(L,TODAY()).closed);}
function viewEarly(){
  const op=openLoans(); if(!op.length) return '<div class="card soft empty"><div class="e1">Все долги закрыты 🎉</div></div>';
  const e=st.early; if(!op.find(L=>L.id===e.loanId)) e.loanId=op[0].id; if(!e.lumpDate) e.lumpDate=TODAY();
  const L=loans().find(x=>x.id===e.loanId),c=cur(L);
  return `<div class="card"><div class="dform">
    <div class="field"><label>Кредит</label><select id="qL">${op.map(x=>`<option value="${x.id}" ${x.id===e.loanId?'selected':''}>${esc(x.name)} — ${pct(+x.gesv||+x.rate)}</option>`).join('')}</select></div>
    <div class="field"><label>Разовый платёж, ${c}</label><input type="number" inputmode="numeric" id="qA" value="${e.lump||''}" placeholder="0"></div>
    <div class="field"><label>Дата разового</label><input type="date" id="qD" value="${e.lumpDate}"></div>
    <div class="field"><label>Каждый месяц сверху, ${c}</label><input type="number" inputmode="numeric" id="qM" value="${e.monthly||''}" placeholder="0"></div></div></div>
  <div id="qOut"></div>
  <div class="card"><h2>Хочу закрыть к дате</h2><div class="dform"><div class="field"><label>Целевая дата</label><input type="date" id="qT" value="${e.target}"></div><div id="qTout" class="muted" style="align-self:center"></div></div></div>`;
}
function earlyOut(el){
  const e=st.early,L=loans().find(x=>x.id===e.loanId);if(!L)return;const c=cur(L),now=stats(L,TODAY()),has=e.lump>0||e.monthly>0;
  const t=scenario(L,TODAY(),{lump:e.lump,lumpDate:e.lumpDate,monthly:e.monthly,mode:'term'}),p=scenario(L,TODAY(),{lump:e.lump,lumpDate:e.lumpDate,monthly:e.monthly,mode:'payment'});
  const svT=now.totalInt-t.totalInt,svP=now.totalInt-p.totalInt,best=svT>=svP?'t':'p';
  const box=(title,s,sv,key)=>`<div class="card ${has&&best===key?'dbest':''}"><h2>${title}${has&&best===key?'<span class="dpill good">выгоднее</span>':''}</h2><dl class="ddl">
    <dt>Закрытие</dt><dd>${fm(s.endDate)}</dd><dt>Осталось</dt><dd>${mtxt(s.monthsLeft)}</dd>
    <dt>Платёж</dt><dd>${money(key==='n'?(now.next?now.next.pay:0):(s.newPayment||0),c)}${key!=='n'&&e.monthly>0?' + '+money(e.monthly,c):''}</dd>
    <dt>Проценты впереди</dt><dd>${money(s.intLeft,c)}</dd><dt>Экономия</dt><dd class="good">${key==='n'?'—':money(sv,c)}</dd></dl></div>`;
  let rec='';
  if(has){ rec=`<div class="dnote good">💡 ${best==='t'?`Выбирай <b>сокращение срока</b> — сэкономишь ${money(svT,c)} (на ${money(svT-svP,c)} больше) и закроешь на ${mtxt(Math.max(0,monthsBetween(t.endDate,now.endDate)))} раньше.${svP>0?` Уменьшение платежа — только если нужен запас в бюджете (платёж станет ${money(p.newPayment,c)}).`:''}`:`Здесь выгоднее уменьшение платежа — на ${money(svP-svT,c)}.`}</div>`;
    const ef=+L.gesv||+L.rate; if(ef&&ef<D().settings.depositRate) rec+=`<div class="dnote warn">⚠️ ГЭСВ ${pct(ef)} ниже ставки депозита ${pct(D().settings.depositRate)} — деньги на депозите могут принести больше, чем сэкономит досрочка.</div>`; }
  el.querySelector('#qOut').innerHTML=`<div class="dcmp">${box('Сейчас',now,0,'n')}${box('Сокращение срока',t,svT,'t')}${box('Уменьшение платежа',p,svP,'p')}</div>${rec}
   ${has&&e.lump>0?`<div class="btn-row" style="justify-content:flex-start;margin:0 0 14px"><button class="btn" id="qRec">✅ Я внёс этот платёж — записать</button></div>`:''}
   <div class="card"><h2>Остаток долга</h2><div class="dleg"><span><i style="background:var(--s1)"></i>С досрочкой</span><span><i style="background:var(--s2)"></i>Без досрочки</span></div><div class="dchart" id="dch2"></div></div>`;
  lineChart(el.querySelector('#dch2'),[{label:'С досрочкой',rows:t.rows,color:'var(--s1)'},{label:'Без досрочки',rows:now.rows,color:'var(--s2)'}],c);
  const r=el.querySelector('#qRec'); if(r) r.onclick=()=>{const a=e.lump,d=e.lumpDate;e.lump=0;saveLoan({...L,early:[...(L.early||[]),{id:uid(),d,amt:a,mode:best==='p'?'payment':'term'}]});toast('Записано в досрочные погашения');};
  targetOut(el);
}
function targetOut(el){
  const e=st.early,L=loans().find(x=>x.id===e.loanId),o=el.querySelector('#qTout');if(!o||!L)return;const c=cur(L);
  if(!e.target){o.innerHTML=`Сейчас закроешь в <b class="ink">${fm(stats(L,TODAY()).endDate)}</b>. Выбери дату — посчитаю, сколько докидывать в месяц.`;return;}
  if(e.target<=TODAY()){o.textContent='Дата должна быть в будущем.';return;}
  const need=requiredMonthly(L,TODAY(),e.target);
  if(need===null){o.textContent='К этой дате не закрыть даже полным погашением в ближайший платёж.';return;}
  if(need===0){o.textContent='✅ Ты и так закроешь к этой дате.';return;}
  const s=scenario(L,TODAY(),{monthly:need}),now=stats(L,TODAY());
  o.innerHTML=`Докидывай <b class="ink">${money(need,c)}</b> в месяц → закроешь в <b class="ink">${fm(s.endDate)}</b>, экономия <b class="good">${money(now.totalInt-s.totalInt,c)}</b>.`;
}
function bindEarly(el){
  const q=id=>el.querySelector('#'+id); if(!q('qL')) return;
  q('qL').onchange=()=>{st.early.loanId=q('qL').value;F().render();};
  const upd=()=>{st.early.lump=+q('qA').value||0;st.early.lumpDate=q('qD').value||TODAY();st.early.monthly=+q('qM').value||0;earlyOut(el);};
  ['qA','qD','qM'].forEach(id=>q(id).addEventListener('input',upd));
  q('qT').addEventListener('input',ev=>{st.early.target=ev.target.value;targetOut(el);});
  earlyOut(el);
}

/* ---------- strategy ---------- */
function viewStrategy(){
  const op=openLoans(); if(!op.length) return '<div class="card soft empty"><div class="e1">Нет открытых долгов 🎉</div></div>';
  const S=st.strat;
  return `<div class="card"><div class="muted" style="margin-bottom:12px">Сколько свободных денег в месяц готов направлять на досрочку? Посчитаю порядок и когда станешь свободен от долгов.</div>
  <div class="dform"><div class="field"><label>Свободно в месяц, ${cur(op[0])}</label><input type="number" inputmode="numeric" id="sE" value="${S.extra}"></div>
  <div class="field"><label>Освободившиеся платежи</label><select id="sR"><option value="1" ${S.rollover?'selected':''}>Перекидывать на следующий долг</option><option value="0" ${!S.rollover?'selected':''}>Не перекидывать</option></select></div></div></div><div id="sOut"></div>`;
}
function strategyOut(el){
  const S=st.strat,op=openLoans(),c=cur(op[0]);
  const base=strategy(op,TODAY(),0,'avalanche',false),av=strategy(op,TODAY(),S.extra,'avalanche',S.rollover),sn=strategy(op,TODAY(),S.extra,'snowball',S.rollover);
  const best=av.totalInt<=sn.totalInt?'av':'sn',win=best==='av'?av:sn;
  const card=(t,r,key,desc)=>`<div class="card ${key&&best===key?'dbest':''}"><h2>${t}${key&&best===key?'<span class="dpill good">лучший</span>':''}</h2><div class="muted" style="margin:-8px 0 10px;font-size:12px">${desc}</div><dl class="ddl">
    <dt>Без долгов</dt><dd>${fm(r.endDate)}</dd><dt>Через</dt><dd>${mtxt(r.months)}</dd><dt>Проценты впереди</dt><dd>${money(r.totalInt,c)}</dd>${key?`<dt>Экономия</dt><dd class="good">${money(base.totalInt-r.totalInt,c)}</dd>`:''}</dl></div>`;
  const order=win.perLoan.slice().sort((a,b)=>(a.month||1e9)-(b.month||1e9));
  el.querySelector('#sOut').innerHTML=`<div class="dcmp">${card('Только по графику',base,null,'без досрочных платежей')}${card('Лавина',av,'av','сначала самый дорогой (выше ГЭСВ)')}${card('Снежный ком',sn,'sn','сначала самый маленький остаток')}</div>
   <div class="dnote good">💡 <b>${best==='av'?'Лавина':'Снежный ком'}</b> выгоднее: сэкономишь ${money(base.totalInt-win.totalInt,c)} и закроешь все долги на ${mtxt(Math.max(0,base.months-win.months))} раньше.${best==='av'&&sn.totalInt-av.totalInt<1000?' Разница со снежным комом минимальна — выбирай тот, что мотивирует.':''}</div>
   <div class="card"><h2>Порядок закрытия</h2><div class="scx"><table><thead><tr><th>#</th><th>Долг</th><th>Ставка</th><th>Закроется</th></tr></thead><tbody>${order.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${pct(x.eff)}</td><td>${x.date?fm(x.date):'—'}</td></tr>`).join('')}</tbody></table></div>
   <div class="muted" style="font-size:12px;margin-top:10px">Каждый месяц: обычные платежи + свободная сумма${S.rollover?' + платежи закрытых долгов':''} → в первый долг из очереди.</div></div>`;
}
function bindStrategy(el){
  const e=el.querySelector('#sE'); if(!e) return;
  const upd=()=>{st.strat.extra=+e.value||0;st.strat.rollover=el.querySelector('#sR').value==='1';strategyOut(el);};
  e.addEventListener('input',upd); el.querySelector('#sR').onchange=upd; strategyOut(el);
}

/* ---------- tips ---------- */
function viewTips(){
  const S=D().settings, op=openLoans(), tips=[];
  if(op.length){
    const rk=op.slice().sort((a,b)=>(+b.gesv||+b.rate||0)-(+a.gesv||+a.rate||0)), top=rk[0];
    if(rk.length>1) tips.push(['🎯',`Гаси первым «${esc(top.name)}»`,`У него самая высокая ${top.gesv?'ГЭСВ':'ставка'} — ${pct(+top.gesv||+top.rate)}. Каждый тенге досрочки здесь экономит больше всего. Остальные — по графику.`]);
    let ms=0;
    for(const L of rk){const s=stats(L,TODAY()),c=cur(L);ms+=s.next?s.next.pay:0;const amt=s.next?Math.round(s.next.pay/1000)*1000:0;if(!amt)continue;
      const t=scenario(L,TODAY(),{lump:amt,mode:'term'}),p=scenario(L,TODAY(),{lump:amt,mode:'payment'}),ef=+L.gesv||+L.rate;
      let x=`Если внести ${money(amt,c)} (≈ один платёж) досрочно сейчас: сокращение срока сэкономит <b class="good">${money(s.totalInt-t.totalInt,c)}</b> и закроет на ${mtxt(Math.max(0,monthsBetween(t.endDate,s.endDate)))} раньше; уменьшение платежа — ${money(s.totalInt-p.totalInt,c)}, платёж станет ${money(p.newPayment,c)}.`;
      if(s.intLeft<s.balance*0.05) x+=` Процентов впереди всего ${money(s.intLeft,c)} — это максимум возможной экономии.`;
      if(ef&&ef<S.depositRate) x+=` ⚠️ ГЭСВ ${pct(ef)} ниже депозита ${pct(S.depositRate)} — выгоднее держать деньги на депозите.`;
      tips.push(['📊',esc(L.name),x]);}
    tips.push(['🛟','Сначала подушка безопасности',`Перед активной досрочкой держи запас минимум на ${S.emergency} мес. платежей — это ≈ ${money(ms*S.emergency,cur(op[0]))}. Досрочку назад не вернёшь, а просрочка стоит дороже.`]);
  }
  tips.push(['✂️','Сокращай срок, а не платёж','При том же взносе сокращение срока почти всегда экономит больше. Уменьшение платежа — когда важен запас в бюджете.']);
  tips.push(['⏱️','Вноси как можно раньше','Проценты начисляются на остаток каждый день: чем раньше внесёшь, тем больше сэкономишь.']);
  tips.push(['📅','Удобнее всего — в день платежа','Так банк проще пересчитает график, и сумма сразу уйдёт в основной долг. Проверь в приложении банка минимальную сумму.']);
  tips.push(['🧾','После досрочки — новый график','Скачай обновлённый график в приложении банка и загрузи сюда — расчёты станут точными до тенге.']);
  return `<div class="card"><h2>Настройки</h2><div class="dform">
    <div class="field"><label>Ставка по депозиту, %</label><input type="number" step="0.1" id="tD" value="${S.depositRate}"></div>
    <div class="field"><label>Подушка, месяцев платежей</label><input type="number" id="tE" value="${S.emergency}"></div>
    <div class="field"><label>Зарплата (на руки)</label><input type="number" inputmode="numeric" id="tS" value="${+S.salary||''}" placeholder="${salaryInfo().src==='fino'?Math.round(salaryInfo().v)+' — из доходов':''}"></div></div>
    <label class="dchk"><input type="checkbox" id="tF" ${S.toFino?'checked':''}><span><b>Записывать платежи в расходы</b><br><span class="muted">В день платежа появится расход в категории «Кредиты». Не включай, если загружаешь выписки из банка — платежи задвоятся.</span></span></label></div>
  <div class="card"><h2>Рекомендации</h2><div class="dtips">${tips.map(([i,t,p])=>`<div><span class="ic">${i}</span><div><b>${t}</b><p>${p}</p></div></div>`).join('')}</div></div>`;
}
function bindTips(el){
  const q=id=>el.querySelector('#'+id); let to;
  const upd=()=>{const S=D().settings;S.depositRate=+q('tD').value||0;S.emergency=+q('tE').value||0;S.salary=+q('tS').value||0;clearTimeout(to);to=setTimeout(()=>save(),800);};
  ['tD','tE','tS'].forEach(id=>q(id).addEventListener('input',upd));
  q('tF').onchange=()=>{const S=D().settings;S.toFino=q('tF').checked;if(S.toFino&&!S.toFinoFrom)S.toFinoFrom=TODAY();save(true);toast(S.toFino?'Платежи с сегодняшнего дня будут попадать в расходы':'Выключено');};
}

/* ---------- SVG chart ---------- */
function lineChart(host,series,c){
  if(!host) return;
  const months=new Set(); series.forEach(s=>s.rows.forEach(r=>months.add(r.d.slice(0,7)))); const labels=[...months].sort(); if(labels.length<2){host.innerHTML='';return;}
  const data=series.map(s=>{const m={};s.rows.forEach(r=>m[r.d.slice(0,7)]=r.bal);let last=s.rows.length?s.rows[0].bal+s.rows[0].prin:0,end=false;
    return labels.map(k=>{if(end)return null;if(k in m){last=m[k];if(last<=0.5){end=true;return 0;}}return last;});});
  const W=640,H=220,pl=48,pr=10,pt=10,pb=24,mx=Math.max(1,...data.flat().filter(v=>v!=null));
  const x=i=>pl+(W-pl-pr)*i/(labels.length-1), y=v=>pt+(H-pt-pb)*(1-v/mx);
  const ticks=[0,mx/2,mx].map(v=>`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${pl-6}" y="${y(v)+4}" text-anchor="end">${v>=1e6?nf2.format(+(v/1e6).toFixed(1))+'м':nf0.format(v/1000)+'k'}</text>`).join('');
  const step=Math.ceil(labels.length/6); const xl=labels.map((k,i)=>i%step===0?`<text x="${x(i)}" y="${H-6}" text-anchor="middle">${MON[+k.slice(5)-1]} ${k.slice(2,4)}</text>`:'').join('');
  const paths=data.map((d,si)=>{let p='';d.forEach((v,i)=>{if(v==null)return;p+=(p?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1);});return `<path d="${p}" fill="none" stroke="${series[si].color}" stroke-width="2" stroke-linejoin="round"/>`;}).join('');
  const ti=labels.indexOf(TODAY().slice(0,7));
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="dsvg">${ticks}${xl}${ti>=0?`<line x1="${x(ti)}" x2="${x(ti)}" y1="${pt}" y2="${H-pb}" class="today"/><text x="${x(ti)+4}" y="${pt+10}">сегодня</text>`:''}${paths}<line class="hv" y1="${pt}" y2="${H-pb}" x1="-10" x2="-10"/></svg><div class="dtip"></div>`;
  const svg=host.querySelector('svg'),tip=host.querySelector('.dtip'),hv=host.querySelector('.hv');
  const move=ev=>{const r=svg.getBoundingClientRect();const px=((ev.touches?ev.touches[0].clientX:ev.clientX)-r.left)/r.width*W;const i=Math.max(0,Math.min(labels.length-1,Math.round((px-pl)/(W-pl-pr)*(labels.length-1))));
    hv.setAttribute('x1',x(i));hv.setAttribute('x2',x(i));tip.style.display='block';tip.style.left=Math.min(r.width-150,Math.max(0,x(i)/W*r.width-70))+'px';
    tip.innerHTML=`<b>${fm(labels[i]+'-01')}</b>`+series.map((s,si)=>data[si][i]==null?'':`<div><i style="background:${s.color}"></i>${s.label}: ${money(data[si][i],c)}</div>`).join('');};
  svg.addEventListener('pointermove',move);svg.addEventListener('touchmove',move,{passive:true});svg.addEventListener('pointerleave',()=>{tip.style.display='none';hv.setAttribute('x1',-10);hv.setAttribute('x2',-10);});
}

/* ---------- celebration ---------- */
const celebratedNow=new Set();
function checkCelebrations(){
  const fresh=[]; let dirty=false;
  for(const L of loans()){ if(L.celebrated||celebratedNow.has(L.id)) continue; const s=stats(L,TODAY()); if(!s.closed||!s.rows.length) continue;
    celebratedNow.add(L.id); L.celebrated=true; dirty=true;
    const ad=L.createdAt?new Date(L.createdAt):new Date(); const as=ymd(ad.getFullYear(),ad.getMonth()+1,ad.getDate());
    if(days(s.endDate,as)<=31) fresh.push({L,s}); }
  if(dirty) F().persist();
  if(fresh.length) celebrate(fresh,loans().every(L=>stats(L,TODAY()).closed));
}
function celebrate(items,all){
  const c=cur(items[0].L), freed=sum(items,x=>{const g=x.s.rows.filter(r=>r.kind==='reg');return g.length>1?g[g.length-2].pay:(g[0]?g[0].pay:0);});
  const name=(F().S().settings||{}).name;
  F().openSheet(`<div class="dcel"><div class="em">${all?'🏆':'🎉'}</div><h3 style="justify-content:center">${all?'Ты свободен от долгов!':'Поздравляю'+(name?', '+esc(name):'')+'!'}</h3>
    <div class="muted">${all?'Все кредиты и рассрочки закрыты. Теперь эти деньги работают на тебя — самое время отложить их в подушку или инвестиции.':'Одним долгом меньше. Так держать!'}</div>
    ${items.map(({L,s})=>`<div class="it"><b>${KINDS[kindOf(L)][1]} «${esc(L.name)}» полностью погашен!</b><div class="muted">Выплачено всего ${money(s.paidTotal,cur(L))}, из них процентов ${money(s.intPaid,cur(L))}${s.saved>0?` · досрочкой сэкономил <b class="good">${money(s.saved,cur(L))}</b>`:''}${s.endDate<s.baseEnd?` · на ${mtxt(monthsBetween(s.endDate,s.baseEnd))} раньше графика`:''}</div></div>`).join('')}
    ${!all&&freed>0?`<div class="dnote good">Освободилось ≈ ${money(freed,c)} в месяц. Перекинь их на следующий долг — смотри «Стратегию».</div>`:''}
    <button class="btn dark" data-close style="width:100%;margin-top:14px">Ура! 🎊</button></div>`);
  confetti();
}
function confetti(){
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv=document.createElement('canvas');cv.className='dconf';document.body.appendChild(cv);
  const g=cv.getContext('2d'),W=cv.width=innerWidth,H=cv.height=innerHeight,cols=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#6250d6'];
  const P=Array.from({length:160},()=>({x:Math.random()*W,y:-20-Math.random()*H*.5,vx:(Math.random()-.5)*3,vy:2+Math.random()*3,s:5+Math.random()*6,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:cols[Math.floor(Math.random()*6)]}));
  const t0=performance.now();(function f(t){g.clearRect(0,0,W,H);for(const p of P){p.x+=p.vx;p.y+=p.vy;p.vy+=.04;p.r+=p.vr;g.save();g.translate(p.x,p.y);g.rotate(p.r);g.fillStyle=p.c;g.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);g.restore();}if(t-t0<4200)requestAnimationFrame(f);else cv.remove();})(t0);
}

/* ---------- add / edit sheet + document import ---------- */
function openLoanSheet(L,tab){
  const draft=L?JSON.parse(JSON.stringify(L)):{id:uid(),name:'',ltype:'credit',bank:'',currency:'₸',principal:'',rate:'',gesv:'',termMonths:'',issueDate:'',firstPaymentDate:'',type:'annuity',schedule:null,early:[],notes:'',createdAt:Date.now()};
  let mode=tab||(L?'manual':'doc');
  F().openSheet(`<h3>${L?'Изменить':'Новый долг'}<button class="x" data-close aria-label="Закрыть">${X}</button></h3>
    ${L?'':`<div class="seg" id="mt" style="margin-bottom:14px"><button data-t="doc">Из документа</button><button data-t="manual">Вручную</button></div>`}
    <div id="docP"><label class="ddrop" id="drop"><input type="file" id="file" accept=".pdf,image/*,.xlsx,.xls,.csv,.txt" hidden><div style="font-size:28px">📄</div><b>Выбери файл графика</b><div class="muted">PDF, Excel, CSV${F().AI().ready?', фото или скрин':''}</div></label>
      <div class="field" style="margin-top:12px"><label>…или вставь текст графика из приложения банка</label><textarea id="paste" rows="4" placeholder="Скопируй таблицу графика и вставь сюда"></textarea></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn dark" id="readBtn">Распознать</button><span id="docSt" class="muted"></span></div></div>
    <div id="manP"><div id="schN"></div><div class="dform">
      <div class="field"><label>Название</label><input id="fName" placeholder="Автокредит"></div>
      <div class="field"><label>Тип</label><select id="fK">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}">${v[1]} ${v[0]}</option>`).join('')}</select></div>
      <div class="field"><label>Банк</label><input id="fBank" placeholder="Halyk, Kaspi…"></div>
      <div class="field"><label>Валюта</label><select id="fCur">${Object.values(CUR).map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Сумма кредита</label><input id="fP" type="number" inputmode="numeric"></div>
      <div class="field"><label>Ставка, % годовых</label><input id="fR" type="number" step="0.01" inputmode="decimal"></div>
      <div class="field"><label>ГЭСВ, %</label><input id="fG" type="number" step="0.01" inputmode="decimal"></div>
      <div class="field"><label>Срок, месяцев</label><input id="fN" type="number" inputmode="numeric"></div>
      <div class="field"><label>Дата выдачи</label><input id="fI" type="date"></div>
      <div class="field"><label>Первый платёж</label><input id="fF" type="date"></div>
      <div class="field"><label>Тип платежей</label><select id="fT"><option value="annuity">Аннуитет (равные)</option><option value="diff">Дифференцированный</option></select></div>
      <div class="field"><label>Заметки</label><input id="fNotes" placeholder="страховка, комиссии…"></div></div>
      <div id="fPrev" class="dnote"></div>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn" data-close>Отмена</button><button class="btn dark" id="fSave">Сохранить</button></div></div>`,sh=>{
    const q=s=>sh.querySelector(s);
    const setTab=x=>{mode=x;q('#docP').style.display=x==='doc'?'':'none';q('#manP').style.display=x==='manual'?'':'none';sh.querySelectorAll('#mt button').forEach(b=>b.classList.toggle('on',b.dataset.t===x));};
    sh.querySelectorAll('#mt button').forEach(b=>b.onclick=()=>setTab(b.dataset.t)); setTab(mode);
    const read=()=>{draft.name=q('#fName').value.trim();draft.ltype=q('#fK').value;draft.bank=q('#fBank').value.trim();draft.currency=q('#fCur').value;draft.principal=+q('#fP').value||0;draft.rate=+q('#fR').value||0;draft.gesv=+q('#fG').value||0;draft.termMonths=+q('#fN').value||0;draft.issueDate=q('#fI').value;draft.firstPaymentDate=q('#fF').value;draft.type=q('#fT').value;draft.notes=q('#fNotes').value.trim();};
    const schN=()=>{const n=q('#schN');if(draft.schedule&&draft.schedule.length){n.innerHTML=`<div class="dnote good">${draft._ai?'✨ Распознано ИИ — проверь значения. ':''}✓ График из документа: ${draft.schedule.length} платежей (${fd(draft.schedule[0].d)} — ${fd(draft.schedule[draft.schedule.length-1].d)}). <button class="btn sm" id="dropS">Считать по параметрам</button></div>`;n.querySelector('#dropS').onclick=()=>{draft.schedule=null;schN();prev();};}else n.innerHTML='';};
    const prev=()=>{read();const p=q('#fPrev');const s=(draft.principal||draft.schedule)?stats(draft,TODAY()):null;
      if(!s||!s.rows.length){p.innerHTML='Заполни сумму, ставку, срок и дату первого платежа — покажу расчёт.';return;}
      p.innerHTML=`Платёж ≈ <b>${money(s.base[0].pay,draft.currency)}</b> · переплата <b>${money(s.baseInt,draft.currency)}</b> · остаток сейчас <b>${money(s.balance,draft.currency)}</b> · оплачено ${s.paid.filter(r=>r.kind==='reg').length} из ${s.base.length}`;};
    const fill=()=>{q('#fName').value=draft.name||'';q('#fK').value=kindOf(draft);q('#fBank').value=draft.bank||'';q('#fCur').value=draft.currency||'₸';q('#fP').value=draft.principal||'';q('#fR').value=draft.rate||'';q('#fG').value=draft.gesv||'';q('#fN').value=draft.termMonths||'';q('#fI').value=draft.issueDate||'';q('#fF').value=draft.firstPaymentDate||'';q('#fT').value=draft.type||'annuity';q('#fNotes').value=draft.notes||'';schN();prev();};
    sh.querySelectorAll('#manP input,#manP select').forEach(i=>i.addEventListener('input',prev)); fill();
    q('#fSave').onclick=()=>{read(); if(!draft.name) draft.name=draft.bank?'Кредит '+draft.bank:KINDS[draft.ltype][0];
      const hs=draft.schedule&&draft.schedule.length;
      if(!hs&&!(draft.principal&&draft.termMonths&&draft.firstPaymentDate)){toast('Нужны сумма, срок и дата первого платежа');return;}
      if(hs&&!draft.principal) draft.principal=draft.schedule[0].bal+draft.schedule[0].prin;
      const nl=JSON.parse(JSON.stringify(draft)); delete nl._ai; F().closeSheet(); st.loanId=nl.id; saveLoan(nl); toast(L?'Сохранено':'Долг добавлен');};
    let file=null; q('#file').onchange=()=>{file=q('#file').files[0];if(file)q('#docSt').textContent='Файл: '+file.name;};
    q('#readBtn').onclick=async()=>{const paste=q('#paste').value.trim();if(!file&&!paste){toast('Выбери файл или вставь текст');return;}
      const b=q('#readBtn'),s=q('#docSt');b.disabled=true;
      try{s.textContent='Читаю документ…';const src=file?await extractFile(file,m=>s.textContent=m):{text:paste,images:[]};s.textContent='Распознаю график…';
        const res=await parseDoc(src,m=>s.textContent=m);draft._ai=!!F().AI().ready;applyParsed(draft,res);fill();setTab('manual');toast(draft._ai?'Распознано с помощью ИИ — проверь данные перед сохранением':'Готово — проверь данные и сохрани');}
      catch(e){s.innerHTML=`<span style="color:var(--danger)">${esc(e.message||'Не удалось распознать')}</span>`;}
      b.disabled=false;};
  });
}
function canvasBlob(cv){return new Promise(r=>cv.toBlob(r,'image/jpeg',.85));}
async function extractFile(file,status){
  const name=file.name.toLowerCase(), ls=F().loadScript;
  if(file.type==='application/pdf'||name.endsWith('.pdf')){
    status('Открываю PDF…'); await ls('lib/pdf.min.js'); const lib=window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc='lib/pdf.worker.min.js';
    const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise; let text='';
    for(let p=1;p<=pdf.numPages;p++){const pg=await pdf.getPage(p);const tc=await pg.getTextContent();const lines={};for(const it of tc.items){const yy=Math.round(it.transform[5]);(lines[yy]=lines[yy]||[]).push([it.transform[4],it.str]);}
      text+=Object.keys(lines).map(Number).sort((a,b)=>b-a).map(yy=>lines[yy].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(' ')).join('\n')+'\n';}
    if(text.replace(/\s/g,'').length>200||!F().AI().ready) return {text,images:[]};
    status('Сканированный PDF — готовлю страницы…'); const images=[];
    for(let p=1;p<=Math.min(pdf.numPages,8);p++){const pg=await pdf.getPage(p);const vp=pg.getViewport({scale:1.6});const cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;images.push(await canvasBlob(cv));}
    return {text:'',images};
  }
  if(file.type.startsWith('image/')){ if(!F().AI().ready) throw new Error('Фото графиков распознаются только через Claude. Загрузи PDF/Excel или вставь текст.');
    const url=URL.createObjectURL(file),img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(new Error('Не удалось открыть изображение'));img.src=url;});
    const k=Math.min(1,2000/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=img.width*k;cv.height=img.height*k;cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(url);return {text:'',images:[await canvasBlob(cv)]}; }
  if(/\.(xlsx|xls)$/.test(name)){ status('Читаю Excel…'); try{await ls('lib/xlsx.full.min.js');}catch(e){await ls('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');}
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true}); return {text:wb.SheetNames.map(n=>XLSX.utils.sheet_to_csv(wb.Sheets[n],{dateNF:'yyyy-mm-dd'})).join('\n'),images:[]}; }
  return {text:await file.text(),images:[]};
}
const PROMPT=`Ты извлекаешь данные кредита из документа банка (Казахстан; язык русский, казахский или английский): график погашения, договор или скриншот приложения банка.
Верни ТОЛЬКО JSON без пояснений и markdown:
{"name":"короткое название (Автокредит / Ипотека / Рассрочка)","kind":"credit|installment|auto|mortgage|card|other","bank":"банк или null","currency":"KZT|USD|EUR|RUB","principal":сумма,"rate":номинальная ставка % или null,"gesv":ГЭСВ % или null,"termMonths":срок в месяцах,"issueDate":"YYYY-MM-DD" или null,"firstPaymentDate":"YYYY-MM-DD","type":"annuity" или "diff","notes":"комиссии, страховка, условия досрочки коротко или пустая строка","schedule":[["YYYY-MM-DD",платёж,основной_долг,вознаграждение,остаток_после_платежа],...]}
Числа без пробелов и валюты, разделитель — точка. В schedule все строки по порядку без «Итого». Нет графика — schedule: []. Нет поля — null.`;
async function parseDoc(src,status){
  const AI=F().AI();
  if(!AI.ready){ const rows=src.text?heuristicParse(src.text):null; if(rows) return {schedule:rows.map(r=>[r.d,r.pay,r.prin,r.int,r.bal])};
    throw new Error('Не нашёл строки графика. Проверь, что в тексте есть даты и суммы платежей, или введи данные вручную.'); }
  const opts={modelTier:'default',onText:({text})=>{const n=(text.match(/\["\d{4}-/g)||[]).length;if(n)status(`Распознаю график… ${n} строк`);}};
  let input=PROMPT; if(src.images&&src.images.length){opts.images=src.images;input+='\n\nДокумент — на приложенных изображениях.';} else input+='\n\nТекст документа:\n'+src.text.slice(0,90000);
  let res; try{res=await AI.sample(input,opts);}catch(e){ if(e&&e.code==='rate_limited') throw new Error('Слишком много запросов — попробуй через минуту.'); throw new Error('Не удалось связаться с Claude'); }
  const t=res.text||'',a=t.indexOf('{'),b=t.lastIndexOf('}'); if(a<0) throw new Error('Не нашёл данные кредита в документе.');
  try{return JSON.parse(t.slice(a,b+1));}catch(e){const cut=t.slice(a),k=cut.lastIndexOf(']');try{const o=JSON.parse(cut.slice(0,k+1)+']}');o._truncated=true;return o;}catch(e2){throw new Error('Ответ получился неполным. Загрузи только страницы с графиком.');}}
}
const num=v=>{if(v==null||v==='')return 0;if(typeof v==='number')return v;const n=parseFloat(String(v).replace(/[\s ]/g,'').replace(',','.'));return isNaN(n)?0:n;};
const nd=v=>{if(!v)return '';const s=String(v);let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];m=s.match(/(\d{2})[./](\d{2})[./](\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};
function applyParsed(dr,o){
  const sc=(o.schedule||[]).map(r=>Array.isArray(r)?{d:nd(r[0]),pay:num(r[1]),prin:num(r[2]),int:num(r[3]),bal:num(r[4])}:{d:nd(r.d||r.date),pay:num(r.pay),prin:num(r.prin),int:num(r.int),bal:num(r.bal)}).filter(r=>r.d&&r.pay>0).sort((a,b)=>a.d<b.d?-1:1);
  for(const r of sc){if(!r.prin&&r.int)r.prin=r.pay-r.int;if(!r.int&&r.prin)r.int=Math.max(0,r.pay-r.prin);}
  if(o.name)dr.name=String(o.name); if(KINDS[o.kind])dr.ltype=o.kind; else if(/рассроч/i.test(o.name||''))dr.ltype='installment';
  if(o.bank)dr.bank=String(o.bank); if(o.currency&&CUR[o.currency])dr.currency=CUR[o.currency];
  dr.principal=num(o.principal)||dr.principal; dr.rate=num(o.rate)||dr.rate; dr.gesv=num(o.gesv)||dr.gesv; dr.issueDate=nd(o.issueDate)||dr.issueDate;
  if(o.notes)dr.notes=String(o.notes); if(o.type==='diff'||o.type==='annuity')dr.type=o.type;
  if(sc.length>=2&&!o._truncated){
    if(!sc.some(r=>r.bal>0)){let B=dr.principal||sum(sc,r=>r.prin);for(const r of sc){B-=r.prin;r.bal=Math.max(0,B);}}
    dr.schedule=sc; if(!dr.principal)dr.principal=Math.round((sc[0].bal+sc[0].prin)*100)/100; dr.firstPaymentDate=sc[0].d; dr.termMonths=num(o.termMonths)||sc.length;
    if(!dr.rate&&dr.principal)dr.rate=Math.round(sc[0].int/dr.principal*1200*100)/100;
    if(sc.every(r=>r.int<0.5))dr.rate=0;
  } else { dr.termMonths=num(o.termMonths)||dr.termMonths; dr.firstPaymentDate=nd(o.firstPaymentDate)||dr.firstPaymentDate; }
}

window.FinoDebts={html,bind,syncOps,checkCelebrations,summary:()=>{const op=openLoans();return {count:op.length,bal:sum(op,L=>stats(L,TODAY()).balance),monthly:sum(op,L=>{const s=stats(L,TODAY());return s.next?s.next.pay:0;})};}};
})();
