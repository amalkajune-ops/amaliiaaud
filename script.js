// Basic interactivity for nav toggle and demo report
const nav = document.querySelector('.nav');
document.querySelector('.nav-toggle').addEventListener('click',()=>{
  nav.classList.toggle('open');
});

document.getElementById('year').textContent = new Date().getFullYear();

function demoReport(e){
  e.preventDefault();
  const handle = document.getElementById('handle').value || '@yourname';
  const platform = document.getElementById('platform').value;
  const goal = document.getElementById('goal').value;

  const sample = {
    profile: { handle, platform },
    goal,
    scores: { bio:72, hooks:81, visual:69, cadence:60, hashtags:55, cta:38, overall:62 },
    findings: {
      bio: ['Нет явного оффера в первой строке', 'Ссылка в био скрыта ниже fold'],
      content: ['Хуки часто без напряжения/вопроса', 'Карусели без 1‑экрана с «болит/решение»'],
      cadence: ['Неритмично: 1–2 поста в неделю с провалами'],
      hashtags: ['Слишком общие, мало нишевых (10–50k)']
    },
    actions_next7days: [
      'Первая строка био = оффер + keyword',
      '3 Reels: «микро‑кейс» с хук‑вопросом ≤ 12 слов',
      'Обложки: единый шрифт, ≤ 3 слова, контраст 7:1',
      'CTA в каждом посте: коммент с выбором (A/B)'
    ],
    ready_to_copy: {
      hooks: [
        '3 luxury‑фишки профиля, которые продают без продаж',
        'Я ошибалась про Reels — вот что реально растит',
        'Если бы я стартовала с нуля в Майами — сделала бы так'
      ],
      hashtags: ['#miamiluxury','#carcontent','#brandstrategy','#ugccreator','#artvault']
    }
  };

  const container = document.getElementById('report');
  container.classList.remove('hidden');
  container.innerHTML = renderReport(sample);
  return false;
}

function renderReport(data){
  const scoreRow = Object.entries(data.scores).map(([k,v])=>{
    return `<div class="chip"><strong>${k}</strong> ${v}%</div>`
  }).join('');

  const findings = Object.entries(data.findings).map(([k,arr])=>{
    return `<div class="block"><h4>${k}</h4><ul>` + arr.map(i=>`<li>${i}</li>`).join('') + `</ul></div>`;
  }).join('');

  const actions = data.actions_next7days.map(a=>`<li>${a}</li>`).join('');
  const hooks = data.ready_to_copy.hooks.map(h=>`<code>${h}</code>`).join('');
  const tags = data.ready_to_copy.hashtags.map(t=>`<span class="pill">${t}</span>`).join('');

  return `
    <div class="report-head">
      <h3>Отчёт для <span class="accent">@${data.profile.handle.replace('@','')}</span> · ${data.profile.platform}</h3>
      <p class="muted">Цель: ${data.goal}</p>
    </div>
    <div class="score-row">${scoreRow}</div>
    <div class="grid-2">
      <section class="panel">
        <h3>Находит</h3>
        ${findings}
      </section>
      <section class="panel">
        <h3>Действия 7 дней</h3>
        <ul class="actions">${actions}</ul>
        <h4>Готовые хуки</h4>
        ${hooks}
        <div class="tags">${tags}</div>
      </section>
    </div>
    <div class="export-row">
      <button class="btn ghost" onclick="window.print()">Экспорт PDF</button>
    </div>
  `;
}
