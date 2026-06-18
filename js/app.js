'use strict';

/* ============ Данные ============ */
let DATA = null;
const EXAM_SIZE = 30;
const app = document.getElementById('app');
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];
let S = null; // текущая сессия (режим прохождения)

/* ============ Утилиты ============ */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function prepareQuestion(item) {
  const raw = item.raw;
  const opts = raw.options.map((text, i) => ({ text, isCorrect: i === raw.correct }));
  const mixed = shuffle(opts);
  return {
    id: raw.id, q: raw.q, theme: item.theme, themeId: item.themeId,
    explanation: raw.explanation || '',
    options: mixed.map(o => o.text),
    correct: mixed.findIndex(o => o.isCorrect)
  };
}
function allQuestions() {
  const out = [];
  DATA.themes.forEach(t => t.questions.forEach(q => out.push({ raw: q, theme: t.title, themeId: t.id })));
  return out;
}
function questionsOfTheme(themeId) {
  const t = DATA.themes.find(t => t.id === themeId);
  return t ? t.questions.map(q => ({ raw: q, theme: t.title, themeId: t.id })) : [];
}

/* ============ Прогресс и сессия (localStorage) ============ */
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem('progress'));
    return p && p.solved ? p : { solved: {}, perfect: {} };
  } catch (e) { return { solved: {}, perfect: {} }; }
}
function saveProgress(p) { try { localStorage.setItem('progress', JSON.stringify(p)); } catch (e) {} }
function themeStats(t, prog) {
  const total = t.questions.length;
  const solved = t.questions.filter(q => prog.solved[q.id]).length;
  return { solved, total, done: solved === total, perfect: !!prog.perfect[t.id] };
}
function sessKey(themeId) { return 'sess_t' + themeId; }
function hasSession(themeId) { try { return !!localStorage.getItem(sessKey(themeId)); } catch (e) { return false; } }
function saveSession() {
  if (!S || S.mode !== 'theme') return;
  try { localStorage.setItem(sessKey(S.themeId), JSON.stringify({ questions: S.questions, answers: S.answers, idx: S.idx })); } catch (e) {}
}
function loadSession(themeId) {
  try {
    const s = JSON.parse(localStorage.getItem(sessKey(themeId)));
    return (s && Array.isArray(s.questions) && s.questions.length) ? s : null;
  } catch (e) { return null; }
}
function clearSession(themeId) { try { localStorage.removeItem(sessKey(themeId)); } catch (e) {} }

// ----- статистика ошибок (для «Работы над ошибками») -----
// p.miss[id] = { w: всего ошибок, streak: верных ответов подряд после последней ошибки }
function recordInto(p, id, correct) {
  if (!p.miss) p.miss = {};
  const m = p.miss[id];
  if (correct) {
    if (m) { m.streak = (m.streak || 0) + 1; if (m.streak >= 2) delete p.miss[id]; } // выучен — убираем
  } else {
    if (m) { m.w++; m.streak = 0; } else { p.miss[id] = { w: 1, streak: 0 }; }
  }
}
function mistakeIds(p) {
  const m = p.miss || {};
  return Object.keys(m).sort((a, b) => m[b].w - m[a].w); // самые частые — первыми
}
function findItemById(id) {
  for (const t of DATA.themes) {
    for (const q of t.questions) if (q.id === id) return { raw: q, theme: t.title, themeId: t.id };
  }
  return null;
}

/* ============ Главное меню ============ */
function renderHome() {
  S = null;
  const prog = loadProgress();
  const doneCount = DATA.themes.filter(t => themeStats(t, prog).done).length;
  const missCount = mistakeIds(prog).length;
  const total = DATA.themes.reduce((s, t) => s + t.questions.length, 0);
  app.innerHTML = `
    <img class="brand-logo" src="./icons/logo.png" alt="Логотип">
    <h1 class="app-title">Снайперская подготовка</h1>
    <p class="app-sub">${DATA.themes.length} тем · ${total} вопросов</p>
    <button class="btn btn-primary" id="exam">
      <div class="btn-title">🎯 Экзамен</div>
      <div class="btn-desc">${EXAM_SIZE} случайных вопросов · разбор ошибок в конце</div>
    </button>
    <button class="btn btn-primary" id="themes">
      <div class="btn-row"><span class="btn-title">📚 Темы</span><span class="count">${doneCount} / ${DATA.themes.length}</span></div>
      <div class="btn-desc">Прохождение по темам с учётом прогресса</div>
    </button>
    <button class="btn btn-primary" id="repeat">
      <div class="btn-title">🔄 Повторение</div>
      <div class="btn-desc">Бесконечный поток вопросов для зубрёжки</div>
    </button>
    <button class="btn btn-mistakes" id="mistakes" ${missCount ? '' : 'disabled'}>
      <div class="btn-row"><span class="btn-title">❗ Работа над ошибками</span><span class="count">${missCount}</span></div>
      <div class="btn-desc">${missCount ? 'Вопросы, где ты чаще всего ошибаешься' : 'Пока ошибок нет — копятся по мере прохождения'}</div>
    </button>
    <p class="footnote">Прогресс хранится только на этом устройстве.</p>
  `;
  document.getElementById('exam').onclick = startExam;
  document.getElementById('themes').onclick = renderThemeList;
  document.getElementById('repeat').onclick = renderRepeatMenu;
  if (missCount) document.getElementById('mistakes').onclick = startMistakes;
}

/* ============ Меню «Темы» ============ */
function renderThemeList() {
  S = null;
  const prog = loadProgress();
  const doneCount = DATA.themes.filter(t => themeStats(t, prog).done).length;
  const items = DATA.themes.map(t => {
    const s = themeStats(t, prog);
    const pct = Math.round(s.solved / s.total * 100);
    const resume = hasSession(t.id) ? '<span class="badge" title="есть незавершённое прохождение">⏸</span>' : '';
    return `
      <button class="btn theme-item ${s.done ? 'done' : ''}" data-theme="${t.id}">
        <div class="btn-row">
          <span class="btn-title">${t.id}. ${esc(t.title)} ${s.perfect ? '<span class="badge">🏅</span>' : ''} ${resume}</span>
          <span class="count">${s.solved}/${s.total}</span>
        </div>
        <div class="mini-bar"><span style="width:${pct}%"></span></div>
      </button>`;
  }).join('');
  app.innerHTML = `
    <div class="topbar">
      <button class="back-btn" id="back">← Меню</button>
      <span class="progress">Пройдено ${doneCount} / ${DATA.themes.length}</span>
    </div>
    <p class="hint">Зелёная — все вопросы освоены · 🏅 — пройдена без ошибок · ⏸ — можно продолжить.</p>
    ${items}
    <button class="btn reset-btn" id="reset"><div class="btn-title">↺ Сбросить весь прогресс</div></button>
  `;
  document.getElementById('back').onclick = renderHome;
  app.querySelectorAll('[data-theme]').forEach(b => { b.onclick = () => startTheme(Number(b.dataset.theme)); });
  document.getElementById('reset').onclick = () => {
    if (confirm('Сбросить весь прогресс и незавершённые прохождения?')) {
      saveProgress({ solved: {}, perfect: {} });
      DATA.themes.forEach(t => clearSession(t.id));
      renderThemeList();
    }
  };
}

/* ============ Меню «Повторение» ============ */
function renderRepeatMenu() {
  S = null;
  const themesHtml = DATA.themes.map(t => `
    <button class="btn" data-theme="${t.id}">
      <div class="btn-row"><span class="btn-title">${t.id}. ${esc(t.title)}</span><span class="count">${t.questions.length}</span></div>
    </button>`).join('');
  app.innerHTML = `
    <div class="topbar"><button class="back-btn" id="back">← Меню</button><h2>Повторение</h2></div>
    <div class="mode-desc">🔄 Бесконечный поток вопросов для зубрёжки. Вопросы идут по кругу — тренируйся сколько хочешь. Стрелкой «назад» можно вернуться к пройденным. Прогресс здесь не засчитывается.</div>
    <button class="btn btn-primary" data-theme="all">
      <div class="btn-title">🔁 Все темы</div><div class="btn-desc">Случайные вопросы из всех тем</div>
    </button>
    <div class="section-label">Или выбери тему</div>
    ${themesHtml}
  `;
  document.getElementById('back').onclick = renderHome;
  app.querySelectorAll('[data-theme]').forEach(b => {
    b.onclick = () => startPractice(b.dataset.theme === 'all' ? null : Number(b.dataset.theme));
  });
}

/* ============ Запуск режимов ============ */
function startExam() {
  const pool = shuffle(allQuestions()).slice(0, Math.min(EXAM_SIZE, allQuestions().length));
  const questions = pool.map(prepareQuestion);
  S = { mode: 'exam', questions, answers: new Array(questions.length).fill(null), idx: 0 };
  renderQuestion();
}

function makeBag(n) { return shuffle(Array.from({ length: n }, (_, i) => i)); }
function startPractice(themeId) {
  const pool = themeId == null ? allQuestions() : questionsOfTheme(themeId);
  S = { mode: 'practice', pool, bag: makeBag(pool.length), pos: 0, prev: -1, questions: [], answers: [], idx: 0 };
  drawPractice();        // первый вопрос
  S.idx = 0;
  renderQuestion();
}
function drawPractice() {
  // достаём следующий индекс из «перемешанного мешка»
  if (S.pos >= S.bag.length) {
    const nb = makeBag(S.pool.length);
    if (S.pool.length > 1 && nb[0] === S.prev) { [nb[0], nb[1]] = [nb[1], nb[0]]; }
    S.bag = nb; S.pos = 0;
  }
  const idx = S.bag[S.pos++];
  S.prev = idx;
  S.questions.push(prepareQuestion(S.pool[idx]));
  S.answers.push(null);
}

function startTheme(themeId, fresh) {
  const t = DATA.themes.find(t => t.id === themeId);
  if (!fresh) {
    const s = loadSession(themeId);
    if (s) { S = { mode: 'theme', themeId, title: t.title, questions: s.questions, answers: s.answers, idx: s.idx }; renderQuestion(); return; }
  }
  const questions = shuffle(questionsOfTheme(themeId)).map(prepareQuestion);
  S = { mode: 'theme', themeId, title: t.title, questions, answers: new Array(questions.length).fill(null), idx: 0 };
  clearSession(themeId);
  saveSession();
  renderQuestion();
}

/* ============ Рендер вопроса (универсальный) ============ */
function answeredCount() { return S.answers.filter(a => a !== null).length; }
function correctCount() { return S.answers.filter((a, i) => a !== null && a === S.questions[i].correct).length; }

function renderQuestion() {
  const q = S.questions[S.idx];
  const ans = S.answers[S.idx];
  const answered = ans !== null;
  const reveal = S.mode !== 'exam' && answered; // показать правильность (темы/повторение)
  const last = S.mode !== 'practice' && S.idx === S.questions.length - 1;

  const topRight = S.mode === 'practice'
    ? `✔ ${correctCount()} / ${answeredCount()}`
    : `Вопрос ${S.idx + 1} / ${S.questions.length}`;
  const bar = S.mode === 'practice' ? '' :
    `<div class="progress-bar"><span style="width:${Math.round((S.idx) / S.questions.length * 100)}%"></span></div>`;
  const backLabel = S.mode === 'exam' ? '← Выход' : '← Меню';

  const opts = q.options.map((o, i) => {
    let cls = '';
    if (S.mode === 'exam') { if (ans === i) cls = 'selected'; }
    else if (reveal) { if (i === q.correct) cls = 'correct'; else if (i === ans) cls = 'wrong'; }
    const dis = (S.mode !== 'exam' && answered) ? 'disabled' : '';
    return `<button class="option ${cls}" data-i="${i}" ${dis}>
      <span class="letter">${LETTERS[i]}</span><span>${esc(o)}</span></button>`;
  }).join('');

  const expl = (reveal && ans !== q.correct && q.explanation)
    ? `<div class="explain"><b>Пояснение.</b> ${esc(q.explanation)}</div>` : '';
  const fb = reveal ? `<div class="feedback ${ans === q.correct ? 'ok' : 'no'}">${ans === q.correct ? '✔ Верно!' : '✗ Неверно'}</div>` : '';

  // правая кнопка навигации
  let rightBtn;
  if (last) {
    rightBtn = `<button class="btn btn-primary nav-btn" id="finish" ${answered ? '' : 'disabled'}>
      <div class="btn-title">${S.mode === 'exam' ? 'Завершить экзамен' : 'Завершить тему'}</div></button>`;
  } else {
    rightBtn = `<button class="btn btn-primary nav-btn" id="next" ${answered ? '' : 'disabled'}>
      <div class="btn-title">Вперёд →</div></button>`;
  }

  app.innerHTML = `
    <div class="topbar">
      <button class="back-btn" id="back">${backLabel}</button>
      <span class="progress">${topRight}</span>
    </div>
    ${bar}
    <span class="theme-tag">${esc(q.theme)}</span>
    <p class="question">${esc(q.q)}</p>
    <div id="options">${opts}</div>
    ${fb}${expl}
    <div class="nav-row">
      <button class="btn nav-btn" id="prev" ${S.idx === 0 ? 'disabled' : ''}><div class="btn-title">← Назад</div></button>
      ${rightBtn}
    </div>
  `;

  document.getElementById('back').onclick = onBack;
  app.querySelectorAll('.option').forEach(b => { b.onclick = () => selectOption(Number(b.dataset.i)); });
  const prev = document.getElementById('prev'); if (prev) prev.onclick = goPrev;
  const next = document.getElementById('next'); if (next) next.onclick = goNext;
  const fin = document.getElementById('finish'); if (fin) fin.onclick = goNext;
}

function onBack() {
  if (S.mode === 'exam') { if (confirm('Выйти из экзамена? Результат не сохранится.')) renderHome(); }
  else if (S.mode === 'theme') { saveSession(); renderThemeList(); }
  else renderHome();
}

function selectOption(i) {
  if (S.mode === 'exam') { S.answers[S.idx] = i; renderQuestion(); return; }
  // темы / повторение / частые ошибки — фиксируем ответ
  if (S.answers[S.idx] !== null) return;
  S.answers[S.idx] = i;
  const q = S.questions[S.idx];
  const ok = i === q.correct;
  const p = loadProgress();
  if (S.mode === 'theme' && ok) p.solved[q.id] = 1;
  recordInto(p, q.id, ok);        // статистика ошибок — во всех режимах с проверкой
  saveProgress(p);
  if (S.mode === 'theme') saveSession();
  renderQuestion();
}

function goPrev() {
  if (S.idx === 0) return;
  S.idx--;
  if (S.mode === 'theme') saveSession();
  renderQuestion();
}

function goNext() {
  if (S.answers[S.idx] === null) return; // вперёд только после ответа
  if (S.mode === 'practice') {
    if (S.idx < S.questions.length - 1) S.idx++;
    else { drawPractice(); S.idx++; }
    renderQuestion();
    return;
  }
  // exam / theme
  if (S.idx < S.questions.length - 1) {
    S.idx++;
    if (S.mode === 'theme') saveSession();
    renderQuestion();
  } else {
    if (S.mode === 'exam') finishExam();
    else if (S.mode === 'theme') finishTheme();
    else finishMistakes();
  }
}

/* ============ Завершение «Темы» ============ */
function finishTheme() {
  const total = S.questions.length;
  const correct = correctCount();
  const pct = Math.round(correct / total * 100);
  const perfect = correct === total;
  if (perfect) { const p = loadProgress(); p.perfect[S.themeId] = 1; saveProgress(p); }
  clearSession(S.themeId);
  const themeId = S.themeId, title = S.title;
  app.innerHTML = `
    <h1 class="app-title">${esc(title)}</h1>
    <div class="result-score">${correct}/${total}</div>
    <div class="result-pct">${pct}% правильных</div>
    <p class="result-line">${perfect ? '🏅 Пройдена без ошибок! Тема засчитана.' : `Ошибок: ${total - correct}. Пройди без ошибок для 🏅`}</p>
    <button class="btn btn-primary" id="again"><div class="btn-title">↻ Пройти тему ещё раз</div></button>
    <button class="btn" id="themes"><div class="btn-title">← К списку тем</div></button>
  `;
  window.scrollTo(0, 0);
  document.getElementById('again').onclick = () => startTheme(themeId, true);
  document.getElementById('themes').onclick = renderThemeList;
}

/* ============ Завершение «Экзамена» ============ */
function finishExam() {
  const pr = loadProgress();
  S.questions.forEach((q, i) => recordInto(pr, q.id, S.answers[i] === q.correct));
  saveProgress(pr);
  let correct = 0;
  S.questions.forEach((q, i) => { if (S.answers[i] === q.correct) correct++; });
  const total = S.questions.length;
  const pct = Math.round(correct / total * 100);
  const wrong = total - correct;
  const reviewHtml = S.questions.map((q, i) => {
    const your = S.answers[i];
    const ok = your === q.correct;
    return `
      <div class="review-item ${ok ? 'ok' : ''}">
        <div class="review-q">${i + 1}. ${esc(q.q)}</div>
        ${ok
          ? `<div class="review-a correct-ans">✔ ${esc(q.options[q.correct])}</div>`
          : `<div class="review-a your-wrong">✗ Ты выбрал: ${your === null ? '—' : esc(q.options[your])}</div>
             <div class="review-a correct-ans">✔ Правильно: ${esc(q.options[q.correct])}</div>
             ${q.explanation ? `<div class="review-expl">${esc(q.explanation)}</div>` : ''}`}
      </div>`;
  }).join('');
  app.innerHTML = `
    <h1 class="app-title">Результат</h1>
    <div class="result-score">${correct}/${total}</div>
    <div class="result-pct">${pct}% правильных</div>
    <p class="result-line">${wrong === 0 ? '🎯 Без ошибок! Отлично!' : `Ошибок: ${wrong}`}</p>
    <button class="btn btn-primary" id="again"><div class="btn-title">🎯 Пройти ещё раз</div></button>
    <button class="btn" id="home"><div class="btn-title">← В меню</div></button>
    <div class="section-label">Разбор (✔ верно · ✗ ошибка)</div>
    ${reviewHtml}
  `;
  window.scrollTo(0, 0);
  document.getElementById('again').onclick = startExam;
  document.getElementById('home').onclick = renderHome;
}

/* ============ Режим «Работа над ошибками» ============ */
function startMistakes() {
  const prog = loadProgress();
  const items = mistakeIds(prog).map(findItemById).filter(Boolean);
  if (!items.length) { renderHome(); return; }
  const questions = items.map(prepareQuestion); // порядок сохранён: самые частые сверху
  S = { mode: 'mistakes', questions, answers: new Array(questions.length).fill(null), idx: 0 };
  renderQuestion();
}

function finishMistakes() {
  const total = S.questions.length;
  const correct = correctCount();
  const pct = Math.round(correct / total * 100);
  const left = mistakeIds(loadProgress()).length;
  app.innerHTML = `
    <h1 class="app-title">Работа над ошибками</h1>
    <div class="result-score">${correct}/${total}</div>
    <div class="result-pct">${pct}% правильных</div>
    <p class="result-line">Осталось в списке: ${left}. Вопрос выходит из работы над ошибками после 2 верных ответов подряд.</p>
    <button class="btn btn-primary" id="again" ${left ? '' : 'disabled'}><div class="btn-title">↻ Ещё раз</div></button>
    <button class="btn" id="home"><div class="btn-title">← В меню</div></button>
  `;
  window.scrollTo(0, 0);
  if (left) document.getElementById('again').onclick = startMistakes;
  document.getElementById('home').onclick = renderHome;
}

/* ============ Загрузка ============ */
fetch('./data/questions.json')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(d => { DATA = d; renderHome(); })
  .catch(err => { app.innerHTML = `<div class="loading">Ошибка загрузки вопросов:<br>${esc(err.message)}</div>`; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
