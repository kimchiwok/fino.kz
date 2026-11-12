/* Fino Junior — режим для подростков 14–17 лет: копилка с целями и уроки финансовой грамотности. Данные только на устройстве. */
(function(){
'use strict';
const F=()=>window.__fino;
const J=()=>{ const S=F().S(); if(!S.junior) S.junior={goals:[],lessons:{},xp:0}; if(!Array.isArray(S.junior.goals)) S.junior.goals=[]; if(!S.junior.lessons) S.junior.lessons={}; return S.junior; };
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
const money=v=>nf.format(Math.round(v||0))+' '+((F().S().settings||{}).currency||'₸');
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const daysTo=ds=>Math.ceil((new Date(ds+'T00:00:00')-new Date(today()+'T00:00:00'))/864e5);
const X='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const save=()=>{ F().persist(); F().render(); };

const JUNIOR_CATS={
  expense:[{id:'j_food',name:'Еда и перекусы',emoji:'🍔'},{id:'j_transport',name:'Транспорт',emoji:'🚌'},{id:'j_fun',name:'Развлечения',emoji:'🎬'},{id:'j_games',name:'Игры и приложения',emoji:'🎮'},{id:'j_clothes',name:'Одежда',emoji:'👟'},{id:'j_gifts',name:'Подарки',emoji:'🎁'},{id:'j_study',name:'Учёба',emoji:'📚'},{id:'j_other',name:'Другое',emoji:'📦'}],
  income:[{id:'j_pocket',name:'Карманные деньги',emoji:'💰'},{id:'j_gift_in',name:'Подарили',emoji:'🎉'},{id:'j_job',name:'Подработка',emoji:'🧹'},{id:'j_stipend',name:'Стипендия',emoji:'🎓'},{id:'j_other_in',name:'Другое',emoji:'➕'}]
};

/* ---------- уроки ---------- */
const LESSONS=[
 {id:'budget',emoji:'📒',title:'Бюджет: куда уходят деньги',min:3,
  body:`<p>Бюджет — это план: сколько денег приходит и куда они уходят. Без плана деньги «растворяются»: вроде ничего не купил, а кошелёк пустой.</p>
<p><b>Простое правило 50/30/20</b> (его можно подстроить под себя):</p>
<ul><li><b>50%</b> — на нужное: проезд, еда в школе, учёба.</li><li><b>30%</b> — на желания: кино, игры, кафе с друзьями.</li><li><b>20%</b> — в копилку на цель.</li></ul>
<p>Записывай траты хотя бы месяц — увидишь, где «утекает» больше всего. Для этого и есть вкладка «Операции».</p>`,
  quiz:[{q:'Что такое бюджет?',a:['План доходов и расходов','Сумма на карте','Скидка в магазине'],c:0,e:'Бюджет — это план: сколько приходит и как ты это распределяешь.'},
        {q:'По правилу 50/30/20, какую долю советуют откладывать?',a:['5%','20%','50%'],c:1,e:'20% — в копилку на цели.'},
        {q:'Зачем записывать траты?',a:['Чтобы похвастаться','Чтобы увидеть, куда уходят деньги','Это обязательно по закону'],c:1,e:'Записи показывают, где деньги «утекают» незаметно.'}]},
 {id:'needs',emoji:'🛒',title:'Нужно или хочется?',min:3,
  body:`<p><b>Нужное</b> — то, без чего не обойтись: проезд, еда, школьные принадлежности. <b>Желания</b> — то, что приятно, но можно отложить: новая игра, третьи кроссовки.</p>
<p>Желания — это нормально. Важно, чтобы они не съедали деньги на нужное и на цели.</p>
<p><b>Правило 24 часов:</b> захотел что-то дорогое — подожди сутки. Если желание не прошло, покупка, скорее всего, осознанная. Часто через день оказывается, что вещь не так уж нужна.</p>
<p>Остерегайся «скидка только сегодня» — это приём, чтобы ты купил не подумав.</p>`,
  quiz:[{q:'Что из этого скорее «нужное»?',a:['Скин в игре','Проездной на автобус','Пятая кепка'],c:1,e:'Без проезда до школы не обойтись — это нужное.'},
        {q:'Правило 24 часов — это…',a:['Подождать сутки перед дорогой покупкой','Тратить всё за день','Копить ровно 24 дня'],c:0,e:'Пауза помогает отличить настоящее желание от импульса.'},
        {q:'Надпись «скидка только сегодня» нужна, чтобы…',a:['Помочь тебе сэкономить','Подтолкнуть купить быстро, не подумав','Соблюсти закон'],c:1,e:'Это маркетинговый приём срочности.'}]},
 {id:'goals',emoji:'🎯',title:'Как копить на цель',min:4,
  body:`<p>Копить проще, когда есть понятная цель: <b>что</b>, <b>сколько стоит</b> и <b>к какому сроку</b>. «Накопить на наушники за 30 000 ₸ к 1 марта» работает лучше, чем «накопить сколько-нибудь».</p>
<p><b>Посчитай шаг:</b> 30 000 ₸ за 15 недель — это 2 000 ₸ в неделю. Маленькая сумма пугает меньше большой.</p>
<p><b>Сначала заплати себе:</b> получил карманные — сразу отложи часть в копилку, а не то, что «останется» в конце (обычно не остаётся ничего).</p>
<p>Создай цель во вкладке «Цели» — Fino сам посчитает, сколько откладывать в неделю.</p>`,
  quiz:[{q:'Нужно 12 000 ₸ за 6 недель. Сколько откладывать в неделю?',a:['1 000 ₸','2 000 ₸','6 000 ₸'],c:1,e:'12 000 ÷ 6 = 2 000 ₸ в неделю.'},
        {q:'Что значит «сначала заплати себе»?',a:['Купить себе подарок','Отложить часть денег сразу, как они пришли','Не платить за проезд'],c:1,e:'Откладывай в начале, а не из того, что останется.'},
        {q:'Какая цель сформулирована лучше?',a:['Накопить денег','Накопить 30 000 ₸ на наушники к 1 марта','Стать богатым'],c:1,e:'Есть сумма, предмет и срок — такую цель можно измерить.'}]},
 {id:'interest',emoji:'📈',title:'Как деньги растут: проценты',min:4,
  body:`<p>Если положить деньги на <b>депозит</b> в банк, банк платит тебе вознаграждение — процент за то, что пользуется твоими деньгами.</p>
<p><b>Сложный процент</b> — когда проценты начисляются и на уже полученные проценты. Пример для наглядности: 100 000 ₸ под 12% годовых.</p>
<ul><li>Через год: 112 000 ₸</li><li>Через 2 года: 125 440 ₸</li><li>Через 3 года: ≈ 140 493 ₸ — на 4 493 ₸ больше, чем если бы проценты не «капитализировались» (136 000 ₸).</li></ul>
<p>Чем раньше начинаешь копить, тем сильнее работает сложный процент.</p>
<p><b>Инфляция</b> — рост цен. Деньги «под подушкой» со временем покупают меньше. Поэтому сбережения стоит хранить там, где они хоть немного растут. Открыть депозит до 18 лет можно только с участием родителей.</p>`,
  quiz:[{q:'Что такое сложный процент?',a:['Процент, который сложно посчитать','Проценты начисляются и на полученные ранее проценты','Комиссия банка'],c:1,e:'Проценты «на проценты» — поэтому рост ускоряется.'},
        {q:'Что такое инфляция?',a:['Рост цен со временем','Рост зарплат','Скидки в магазинах'],c:0,e:'Из-за инфляции одна и та же сумма покупает меньше.'},
        {q:'100 000 ₸ под 12% годовых через год станут…',a:['100 012 ₸','112 000 ₸','120 000 ₸'],c:1,e:'12% от 100 000 — это 12 000 ₸.'}]},
 {id:'cards',emoji:'💳',title:'Карта и безопасность',min:3,
  body:`<p>Банковская карта удобна, но у неё есть секреты, которые <b>никому нельзя сообщать</b>:</p>
<ul><li><b>PIN-код</b> карты;</li><li><b>CVV</b> — три цифры на обороте;</li><li><b>коды из SMS</b> и пуш-уведомлений банка.</li></ul>
<p>Сотрудник банка <b>никогда</b> не спрашивает коды из SMS и CVV. Если звонят «из банка» или «из полиции» и просят код или перевести деньги «на безопасный счёт» — это мошенники. Положи трубку и расскажи родителям.</p>
<p>Не переходи по ссылкам «вы выиграли приз» и не вводи данные карты на незнакомых сайтах.</p>`,
  quiz:[{q:'Звонят «из банка» и просят код из SMS. Что делать?',a:['Продиктовать код','Положить трубку и рассказать родителям','Отправить код в мессенджер'],c:1,e:'Настоящий банк никогда не просит код из SMS.'},
        {q:'Что можно сообщать другим людям?',a:['PIN-код','CVV','Ничего из этого'],c:2,e:'PIN, CVV и коды — только твои секреты.'},
        {q:'Пришла ссылка «Вы выиграли телефон, введите данные карты». Это…',a:['Удача','Скорее всего, мошенники','Акция магазина'],c:1,e:'Призы не требуют данных карты — это фишинг.'}]},
 {id:'credit',emoji:'🏦',title:'Кредиты и долги',min:4,
  body:`<p><b>Кредит</b> — деньги в долг, которые нужно вернуть <b>с процентами</b>. Разница между тем, что вернул, и тем, что взял, — <b>переплата</b>.</p>
<p>Реальную стоимость кредита показывает <b>ГЭСВ</b> — годовая эффективная ставка вознаграждения. Она учитывает и проценты, и комиссии. Сравнивай кредиты именно по ГЭСВ.</p>
<p><b>Рассрочка</b> бывает без переплаты, но это всё равно долг: каждый месяц нужно платить, даже если вещь уже надоела.</p>
<p>Если долгов много, они «съедают» доход: в Fino для взрослых есть расчёт, какую часть зарплаты занимают платежи. Брать кредиты можно с 18 лет — а понимать, как они работают, полезно заранее.</p>`,
  quiz:[{q:'Что такое переплата по кредиту?',a:['Штраф за опоздание','Разница между возвращённым и взятым','Скидка банка'],c:1,e:'Это сколько ты заплатил сверх взятой суммы.'},
        {q:'Как сравнивать кредиты честно?',a:['По рекламе','По ГЭСВ','По цвету карты'],c:1,e:'ГЭСВ учитывает проценты и комиссии.'},
        {q:'Рассрочка 0% — это…',a:['Подарок','Тоже долг, который надо платить каждый месяц','Бесплатная покупка'],c:1,e:'Без переплаты, но обязательства остаются.'}]},
 {id:'scams',emoji:'🚨',title:'«Лёгкие деньги» и мошенники',min:4,
  body:`<p>Мошенники часто ищут подростков, обещая «лёгкий заработок»:</p>
<ul><li><b>«Оформи карту и передай нам — заплатим»</b>, «принимай переводы и пересылай дальше за процент». Человек, через чей счёт проходят чужие деньги, называется <b>дроппер</b>. Это помощь мошенникам, за которую грозит <b>уголовная ответственность</b> — даже если ты «просто дал карту».</li>
<li><b>Финансовые пирамиды:</b> «вложи 10 000 — через неделю получишь 30 000», «приведи друзей». Доход платят из денег новых участников, пока схема не рухнет.</li>
<li><b>«Гарантированный доход»</b> на криптовалюте, ставках или «трейдинге» — гарантий высокой прибыли не бывает.</li></ul>
<p><b>Правило:</b> если обещают много денег быстро и без усилий — это ловушка. Не передавай никому свою карту, логины и коды. Сомневаешься — спроси родителей.</p>`,
  quiz:[{q:'Предлагают деньги за то, чтобы ты оформил карту и отдал её. Это…',a:['Подработка','Схема дропперов — уголовная ответственность','Помощь другу'],c:1,e:'Передача карты для чужих переводов — участие в мошенничестве.'},
        {q:'Признак финансовой пирамиды:',a:['Обещают огромный доход и просят приводить друзей','Платят зарплату за работу','Банк начисляет 12% по депозиту'],c:0,e:'Высокая «гарантированная» прибыль + привлечение новых — классическая пирамида.'},
        {q:'Что делать, если предложение кажется слишком выгодным?',a:['Соглашаться быстрее','Посоветоваться с родителями и не передавать данные','Отправить данные карты, чтобы проверить'],c:1,e:'Слишком выгодно = повод остановиться и проверить.'}]}
];
const BADGES=[
 {id:'first_lesson',emoji:'🌱',name:'Первый урок',test:j=>Object.values(j.lessons).some(l=>l.done)},
 {id:'half',emoji:'📚',name:'Половина курса',test:j=>Object.values(j.lessons).filter(l=>l.done).length>=4},
 {id:'all',emoji:'🏅',name:'Финансово грамотный',test:j=>LESSONS.every(l=>j.lessons[l.id]&&j.lessons[l.id].done)},
 {id:'perfect',emoji:'💯',name:'Без ошибок',test:j=>Object.values(j.lessons).some(l=>l.best===3)},
 {id:'first_goal',emoji:'🎯',name:'Первая цель',test:j=>j.goals.length>0},
 {id:'goal_done',emoji:'🏆',name:'Цель достигнута',test:j=>j.goals.some(g=>g.saved>=g.target)}
];

/* ---------- views ---------- */
function goalsView(){
  const g=J().goals;
  const card=x=>{ const p=Math.min(1,x.saved/x.target), left=Math.max(0,x.target-x.saved);
    let plan=''; if(x.deadline&&left>0){ const d=daysTo(x.deadline); if(d>0){ const w=Math.max(1,Math.ceil(d/7)); plan=`Откладывай <b>${money(Math.ceil(left/w/100)*100)}</b> в неделю — успеешь к ${new Date(x.deadline).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}`; } else plan='Срок прошёл — можно продлить или поменять сумму'; }
    return `<div class="card jgoal"><div class="jg-h"><span class="jg-e">${esc(x.emoji||'🎯')}</span><div style="flex:1;min-width:0"><b>${esc(x.name)}</b><div class="muted">${money(x.saved)} из ${money(x.target)}</div></div>${p>=1?'<span class="jpill">Готово! 🎉</span>':''}</div>
      <div class="jbar"><i style="width:${(p*100).toFixed(1)}%"></i></div>
      <div class="muted" style="margin:6px 0 10px">${p>=1?'Ты накопил на цель. Так держать!':'Осталось '+money(left)+(plan?' · '+plan:'')}</div>
      <div class="btn-row" style="justify-content:flex-start;margin:0"><button class="btn sm dark" data-jadd="${x.id}">＋ Отложить</button>${x.saved>0?`<button class="btn sm" data-jtake="${x.id}">Взять</button>`:''}<button class="btn sm danger" data-jdel="${x.id}">Удалить</button></div></div>`; };
  return `<div class="title-row"><div class="view-title">Цели</div><button class="btn sm dark" data-jnew>＋ Новая цель</button></div>
   ${g.length?`<div class="grid">${g.map(card).join('')}</div>`:`<div class="card soft empty"><div style="font-size:40px">🐷</div><div class="e1">Накопи на мечту</div><div>Наушники, велосипед, поездка — поставь цель и срок, а Fino посчитает, сколько откладывать в неделю.</div><div class="btn-row"><button class="btn dark" data-jnew>Создать цель</button></div></div>`}`;
}
function learnView(){
  const j=J(), done=LESSONS.filter(l=>j.lessons[l.id]&&j.lessons[l.id].done).length;
  const badges=BADGES.map(b=>{const ok=b.test(j);return `<div class="jbadge ${ok?'on':''}" title="${esc(b.name)}"><span>${b.emoji}</span><small>${esc(b.name)}</small></div>`;}).join('');
  return `<div class="view-title">Уроки</div>
   <div class="card jprog"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>Прогресс курса</b><span class="muted">${done} из ${LESSONS.length} · ${j.xp||0} XP</span></div><div class="jbar"><i style="width:${done/LESSONS.length*100}%"></i></div><div class="jbadges">${badges}</div></div>
   <div class="grid" style="margin-top:14px">${LESSONS.map((l,i)=>{const st=j.lessons[l.id];return `<button class="card jlesson" data-jlesson="${l.id}"><span class="jl-e">${l.emoji}</span><span style="flex:1;min-width:0;text-align:left"><b>${i+1}. ${esc(l.title)}</b><span class="muted" style="display:block">${l.min} мин · тест из ${l.quiz.length} вопросов</span></span>${st&&st.done?`<span class="jpill">✓ ${st.best}/${l.quiz.length}</span>`:'<span class="muted">→</span>'}</button>`;}).join('')}</div>`;
}
function homeCard(){
  const j=J(), next=LESSONS.find(l=>!(j.lessons[l.id]&&j.lessons[l.id].done)), g=j.goals.filter(x=>x.saved<x.target)[0];
  return `<div class="card jhome"><div class="jh-t">Fino Junior</div><div class="jh-row">
    ${g?`<button class="jh-b" data-goto="goals"><span>🎯 ${esc(g.name)}</span><b>${Math.round(g.saved/g.target*100)}%</b><div class="jbar"><i style="width:${Math.min(100,g.saved/g.target*100)}%"></i></div></button>`:`<button class="jh-b" data-goto="goals"><span>🐷 Поставь первую цель</span><b>Копилка</b></button>`}
    ${next?`<button class="jh-b" data-goto="learn"><span>${next.emoji} Следующий урок</span><b>${esc(next.title)}</b></button>`:`<button class="jh-b" data-goto="learn"><span>🏅 Курс пройден</span><b>${j.xp||0} XP</b></button>`}
  </div></div>`;
}
function bind(el,view){
  el.querySelectorAll('[data-jnew]').forEach(b=>b.onclick=()=>goalSheet());
  el.querySelectorAll('[data-jadd]').forEach(b=>b.onclick=()=>moveSheet(b.dataset.jadd,1));
  el.querySelectorAll('[data-jtake]').forEach(b=>b.onclick=()=>moveSheet(b.dataset.jtake,-1));
  el.querySelectorAll('[data-jdel]').forEach(b=>b.onclick=()=>{ const g=J().goals.find(x=>x.id===b.dataset.jdel); F().openSheet(`<h3>Удалить цель «${esc(g.name)}»?<button class="x" data-close>${X}</button></h3><div class="sheet-actions"><button class="btn" data-close>Отмена</button><button class="btn dark" id="jdOk">Удалить</button></div>`,sh=>{sh.querySelector('#jdOk').onclick=()=>{J().goals=J().goals.filter(x=>x.id!==g.id);F().closeSheet();save();};}); });
  el.querySelectorAll('[data-jlesson]').forEach(b=>b.onclick=()=>lessonSheet(b.dataset.jlesson));
}
function goalSheet(){
  const EM=['🎧','📱','🚲','👟','🎮','✈️','🎁','💻','🎸','🐷'];
  let em='🎧';
  F().openSheet(`<h3>Новая цель<button class="x" data-close>${X}</button></h3>
    <div class="jem">${EM.map(e=>`<button data-em="${e}" class="${e===em?'on':''}" aria-label="Иконка ${e}">${e}</button>`).join('')}</div>
    <div class="field"><label>На что копишь?</label><input id="jgN" maxlength="40" placeholder="Например, наушники"></div>
    <div class="field"><label>Сколько стоит</label><input id="jgT" type="number" inputmode="numeric" placeholder="30000"></div>
    <div class="field"><label>К какому сроку (необязательно)</label><input id="jgD" type="date"></div>
    <div class="sheet-actions"><button class="btn" data-close>Отмена</button><button class="btn dark" id="jgOk">Создать</button></div>`,sh=>{
    sh.querySelectorAll('[data-em]').forEach(b=>b.onclick=()=>{em=b.dataset.em;sh.querySelectorAll('[data-em]').forEach(x=>x.classList.toggle('on',x===b));});
    sh.querySelector('#jgOk').onclick=()=>{ const n=sh.querySelector('#jgN').value.trim(), t=+sh.querySelector('#jgT').value;
      if(!n||!(t>0)){F().toast('Укажи название и сумму');return;}
      J().goals.push({id:uid(),name:n,emoji:em,target:t,deadline:sh.querySelector('#jgD').value||'',saved:0,history:[],created:Date.now()}); F().closeSheet(); save(); F().toast('Цель создана — удачи!'); };
  });
}
function moveSheet(id,dir){
  const g=J().goals.find(x=>x.id===id); if(!g) return;
  F().openSheet(`<h3>${dir>0?'Отложить в копилку':'Взять из копилки'}<button class="x" data-close>${X}</button></h3>
    <div class="muted" style="margin-bottom:10px">${esc(g.emoji)} ${esc(g.name)} · сейчас ${money(g.saved)}</div>
    <div class="field"><label>Сумма</label><input id="jmA" type="number" inputmode="numeric" placeholder="2000"></div>
    <div class="sheet-actions"><button class="btn" data-close>Отмена</button><button class="btn dark" id="jmOk">${dir>0?'Отложить':'Взять'}</button></div>`,sh=>{
    setTimeout(()=>{try{sh.querySelector('#jmA').focus();}catch(e){}},120);
    sh.querySelector('#jmOk').onclick=()=>{ let a=+sh.querySelector('#jmA').value; if(!(a>0)){F().toast('Введи сумму');return;}
      if(dir<0) a=Math.min(a,g.saved); const was=g.saved<g.target;
      g.saved=Math.max(0,g.saved+dir*a); g.history.push({d:today(),amt:dir*a}); F().closeSheet(); save();
      if(was&&g.saved>=g.target) celebrate(g); else F().toast(dir>0?'Отложено '+money(a):'Взято '+money(a)); };
  });
}
function lessonSheet(id){
  const l=LESSONS.find(x=>x.id===id); if(!l) return;
  F().openSheet(`<h3>${l.emoji} ${esc(l.title)}<button class="x" data-close>${X}</button></h3><div class="jtext">${l.body}</div>
    <div class="sheet-actions"><button class="btn dark" id="jqGo" style="width:100%">Пройти тест</button></div>`,sh=>{
    sh.querySelector('#jqGo').onclick=()=>quiz(l);
  });
}
function quiz(l){
  let i=0,score=0;
  const step=()=>{
    if(i>=l.quiz.length){ const j=J(), prev=j.lessons[l.id]||{}; const firstDone=!prev.done;
      j.lessons[l.id]={done:true,best:Math.max(prev.best||0,score),at:today()}; if(firstDone) j.xp=(j.xp||0)+score*10+10; F().persist();
      F().openSheet(`<div style="text-align:center"><div style="font-size:54px">${score===l.quiz.length?'💯':score>=2?'🎉':'👍'}</div><h3 style="justify-content:center">${score} из ${l.quiz.length}</h3>
        <div class="muted">${score===l.quiz.length?'Идеально! Ты отлично разобрался.':score>=2?'Хороший результат!':'Неплохо — можно перечитать урок и попробовать ещё раз.'}${firstDone?' +'+(score*10+10)+' XP':''}</div>
        <div class="sheet-actions" style="margin-top:14px"><button class="btn" id="jqR">Ещё раз</button><button class="btn dark" data-close>Готово</button></div></div>`,sh=>{
        sh.querySelector('#jqR').onclick=()=>quiz(l); sh.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>F().render()));});
      return; }
    const q=l.quiz[i];
    F().openSheet(`<div class="muted" style="margin-bottom:4px">${esc(l.title)} · вопрос ${i+1} из ${l.quiz.length}</div><h3>${esc(q.q)}</h3>
      <div class="jopts">${q.a.map((a,k)=>`<button class="jopt" data-k="${k}">${esc(a)}</button>`).join('')}</div><div id="jqE"></div>`,sh=>{
      sh.dataset.nodismiss='1';
      sh.querySelectorAll('.jopt').forEach(b=>b.onclick=()=>{ const k=+b.dataset.k, ok=k===q.c; if(ok) score++;
        sh.querySelectorAll('.jopt').forEach(x=>{x.disabled=true; if(+x.dataset.k===q.c) x.classList.add('ok'); else if(x===b) x.classList.add('bad');});
        sh.querySelector('#jqE').innerHTML=`<div class="jexp ${ok?'ok':'bad'}"><b>${ok?'Верно!':'Не совсем.'}</b> ${esc(q.e)}</div><div class="sheet-actions"><button class="btn dark" id="jqN" style="width:100%">${i+1<l.quiz.length?'Дальше':'Результат'}</button></div>`;
        sh.querySelector('#jqN').onclick=()=>{i++;step();}; });
    });
  };
  step();
}
function celebrate(g){
  F().openSheet(`<div style="text-align:center"><div style="font-size:60px">🏆</div><h3 style="justify-content:center">Цель достигнута!</h3><div class="muted">Ты накопил ${money(g.target)} на «${esc(g.name)}». Это настоящая финансовая дисциплина!</div>
    <div class="sheet-actions" style="margin-top:14px"><button class="btn dark" data-close style="width:100%">Ура! 🎊</button></div></div>`);
}
window.FinoJunior={JUNIOR_CATS,goalsView,learnView,homeCard,bind,LESSONS};
})();
