/**
 * Музейный квест — логика приложения.
 * Экраны: главная → выбор музея → квест (вопрос → пояснение) → финал со званием;
 * «Авторы» и «Обратная связь» — из главной и футера.
 * Вопросы лежат в js/questions.js (window.QUEST_QUESTIONS).
 */
(function () {
  'use strict';

  /* --- Настройки ------------------------------------------------ */

  var CONFIG = {
    showHints: true,          // показывать подсказку под вариантами ответа
    feedbackUrl: ''           // ссылка на Яндекс Форму для отзывов ('' — кнопка скрыта)
  };

  var MUSEUMS = {
    darwin: { name: 'Дарвиновский музей', kicker: 'Квест 01', invite: 'Ждём вас в Дарвиновском музее' },
    shm:    { name: 'Исторический музей', kicker: 'Квест 02', invite: 'Ждём вас в Историческом музее' }
  };

  /* Звания: минимальный процент верных ответов → название и описание (по убыванию min) */
  var RANKS = [
    { min: 80, title: 'Главный учёный',     note: 'Почти безупречно — музеям стоит взять вас в штат.' },
    { min: 60, title: 'Научный сотрудник',  note: 'Отличный результат: вы внимательно смотрите и много знаете.' },
    { min: 40, title: 'Лаборант',           note: 'Хорошее начало — ещё один визит, и звание выше.' },
    { min: 0,  title: 'Юный исследователь', note: 'Каждый учёный с чего-то начинал. Возвращайтесь за новыми открытиями!' }
  ];

  /* Доп. звание после двух маршрутов — по музею с большей долей верных ответов */
  var BONUS = {
    shm:    { title: 'Историк',    cls: 'rank__bonus--history' },
    darwin: { title: 'Натуралист', cls: 'rank__bonus--nature' },
    tie:    { title: 'Эрудит',     cls: '' }
  };

  var LETTERS = ['А', 'Б', 'В', 'Г'];
  var QUESTIONS = window.QUEST_QUESTIONS || { darwin: [], shm: [] };

  /* --- Состояние ------------------------------------------------ */

  var state = {
    screen: 'home',
    prevScreen: 'home', // откуда открыли «Авторов» или «Обратную связь»
    museum: null,
    index: 0,          // номер текущего вопроса
    picked: [],        // выбранные варианты
    revealed: false,   // показано ли пояснение
    answers: {},       // { номер вопроса: верно ли }
    done: [],          // пройденные маршруты
    scores: {}         // { darwin: { right, total }, shm: { ... } }
  };

  /* --- Элементы ------------------------------------------------- */

  var $ = function (id) { return document.getElementById(id); };

  var screens = {};
  document.querySelectorAll('[data-screen]').forEach(function (node) {
    screens[node.dataset.screen] = node;
  });

  var el = {
    footer: $('footer'),
    museumCards: document.querySelectorAll('[data-start-quest]'),
    questMuseum: $('quest-museum'),
    questStep: $('quest-step'),
    questProgress: $('quest-progress'),
    questQuestion: $('quest-question'),
    questMulti: $('quest-multi'),
    questAsk: $('quest-ask'),
    questOptions: $('quest-options'),
    questHint: $('quest-hint'),
    questHintText: $('quest-hint-text'),
    questReveal: $('quest-reveal'),
    questResults: $('quest-results'),
    questExplain: $('quest-explain'),
    questExplainText: $('quest-explain-text'),
    questNext: $('quest-next'),
    questBack: $('quest-back'),
    authorsBack: $('authors-back'),
    feedbackBack: $('feedback-back'),
    feedbackLink: $('feedback-link'),
    feedbackMissing: $('feedback-missing'),
    finalResult: $('final-result'),
    rankKicker: $('rank-kicker'),
    rankTitle: $('rank-title'),
    rankNote: $('rank-note'),
    rankBonus: $('rank-bonus'),
    rankBonusTitle: $('rank-bonus-title'),
    statRight: $('stat-right'),
    statAccuracy: $('stat-accuracy'),
    statRoutes: $('stat-routes'),
    finalInvite: $('final-invite')
  };

  /* --- Вспомогательное ------------------------------------------ */

  function pad(n) { return String(n).padStart(2, '0'); }
  function percent(right, total) { return Math.round((right / (total || 1)) * 100); }
  function questions() { return QUESTIONS[state.museum] || []; }
  function current() { return questions()[state.index]; }
  function isMulti(q) { return q.correct.length > 1; }

  /** Верно, только если выбраны все правильные варианты и ни одного лишнего. */
  function isCorrect(q, picked) {
    return picked.length === q.correct.length &&
      q.correct.every(function (i) { return picked.indexOf(i) !== -1; });
  }

  /** Создать элемент строки ответа: буква + текст (+ вердикт). */
  function optionNode(tag, index, label, verdict) {
    var node = document.createElement(tag);
    node.className = 'option';
    if (tag === 'button') node.type = 'button';
    node.innerHTML = '<span class="option__letter"></span><span class="option__label"></span>' +
      (verdict ? '<span class="option__verdict"></span>' : '');
    node.querySelector('.option__letter').textContent = LETTERS[index];
    node.querySelector('.option__label').textContent = label;
    if (verdict) node.querySelector('.option__verdict').textContent = verdict;
    return node;
  }

  /* --- Навигация ------------------------------------------------ */

  var ASIDE_SCREENS = ['authors', 'feedback']; // открываются поверх и возвращают туда, откуда пришли

  function showScreen(name) {
    if (ASIDE_SCREENS.indexOf(name) !== -1 && ASIDE_SCREENS.indexOf(state.screen) === -1) state.prevScreen = state.screen;
    state.screen = name;
    Object.keys(screens).forEach(function (key) { screens[key].hidden = key !== name; });
    el.footer.hidden = name === 'home';
    if (name === 'select') renderMuseumCards();
    if (name === 'final') renderFinal();
    window.scrollTo(0, 0);
  }

  /* --- Выбор музея ---------------------------------------------- */

  function renderMuseumCards() {
    el.museumCards.forEach(function (card) {
      var key = card.dataset.startQuest;
      var isDone = state.done.indexOf(key) !== -1;
      card.classList.toggle('is-done', isDone);
      card.querySelector('[data-role="kicker"]').textContent = isDone ? 'Пройден' : MUSEUMS[key].kicker;
      card.querySelector('[data-role="meta"]').textContent = isDone
        ? 'Пройти заново'
        : (QUESTIONS[key] || []).length + ' вопросов';
    });
  }

  function startQuest(museum) {
    state.museum = museum;
    state.index = 0;
    state.picked = [];
    state.revealed = false;
    state.answers = {};
    document.body.dataset.museum = museum;     // переключает акцентный цвет
    renderQuest();
    showScreen('quest');
  }

  /* --- Квест ---------------------------------------------------- */

  var DEFAULT_HINT = 'Подсказка. Осмотритесь в зале.';

  function renderQuest() {
    var list = questions();
    var q = current();

    el.questMuseum.textContent = MUSEUMS[state.museum].name;
    el.questStep.textContent = pad(state.index + 1) + ' / ' + pad(list.length);
    el.questProgress.style.width = percent(state.index + (state.picked.length ? 1 : 0), list.length) + '%';
    el.questQuestion.textContent = q.q;
    el.questMulti.hidden = !isMulti(q);

    el.questAsk.hidden = state.revealed;
    el.questReveal.hidden = !state.revealed;
    el.questHint.hidden = !CONFIG.showHints;
    el.questHintText.textContent = q.hint ? 'Где искать: ' + q.hint : DEFAULT_HINT;

    if (state.revealed) renderReveal(q); else renderOptions(q);

    el.questNext.disabled = state.picked.length === 0;
    el.questNext.textContent = state.index + 1 >= list.length && state.revealed ? 'Завершить квест' : 'Далее';
  }

  /** Шаг 1: варианты ответа. */
  function renderOptions(q) {
    el.questOptions.innerHTML = '';
    q.a.forEach(function (label, i) {
      var node = optionNode('button', i, label);
      node.classList.toggle('is-selected', state.picked.indexOf(i) !== -1);
      node.addEventListener('click', function () { toggleOption(q, i); });
      el.questOptions.appendChild(node);
    });
  }

  function toggleOption(q, i) {
    if (isMulti(q)) {
      var at = state.picked.indexOf(i);
      if (at === -1) state.picked.push(i); else state.picked.splice(at, 1);
    } else {
      state.picked = [i];
    }
    renderQuest();
  }

  /** Шаг 2: выбранные ответы (зелёный/красный), пропущенные правильные и пояснение. */
  function renderReveal(q) {
    el.questResults.innerHTML = '';
    q.a.forEach(function (label, i) {
      var right = q.correct.indexOf(i) !== -1;
      var chosen = state.picked.indexOf(i) !== -1;
      if (!right && !chosen) return;

      var verdict = chosen ? (right ? 'Верно' : 'Неверно') : 'Правильный ответ';
      var node = optionNode('div', i, label, verdict);
      node.classList.add('option--result', right ? 'option--right' : 'option--wrong');
      if (!chosen) node.classList.add('option--missed');
      el.questResults.appendChild(node);
    });

    el.questExplain.hidden = !q.explain;
    el.questExplainText.textContent = q.explain || '';
  }

  function goNext() {
    var q = current();
    if (!state.picked.length) return;

    if (!state.revealed) {           // ответ → пояснение
      state.revealed = true;
      renderQuest();
      window.scrollTo(0, 0);
      return;
    }

    state.answers[state.index] = isCorrect(q, state.picked);

    if (state.index + 1 >= questions().length) {
      completeQuest();
    } else {                         // пояснение → следующий вопрос
      state.index += 1;
      state.picked = [];
      state.revealed = false;
      renderQuest();
      window.scrollTo(0, 0);
    }
  }

  function goBack() {
    if (state.revealed) {            // с пояснения — обратно к выбору ответа
      state.revealed = false;
    } else if (state.index > 0) {
      state.index -= 1;
      state.picked = [];
    } else {
      showScreen('select');
      return;
    }
    renderQuest();
  }

  /* --- Финал ---------------------------------------------------- */

  function completeQuest() {
    var total = questions().length;
    var right = Object.keys(state.answers).filter(function (k) { return state.answers[k]; }).length;

    state.scores[state.museum] = { right: right, total: total };
    if (state.done.indexOf(state.museum) === -1) state.done.push(state.museum);
    state.revealed = false;
    state.picked = [];
    showScreen('final');
  }

  function share(key) {
    var s = state.scores[key];
    return s ? s.right / (s.total || 1) : 0;
  }

  function renderFinal() {
    var score = state.scores[state.museum] || { right: 0, total: 0 };
    var keys = Object.keys(state.scores);
    var sumRight = keys.reduce(function (n, k) { return n + state.scores[k].right; }, 0);
    var sumTotal = keys.reduce(function (n, k) { return n + state.scores[k].total; }, 0);
    var pct = percent(sumRight, sumTotal);
    var rank = RANKS.filter(function (r) { return pct >= r.min; })[0];
    var bothDone = Object.keys(MUSEUMS).every(function (k) { return state.scores[k]; });

    el.finalResult.textContent = 'Верных ответов: ' + score.right + ' из ' + score.total;
    el.rankKicker.textContent = (bothDone ? 'Ваше звание · ' : 'Промежуточное звание · ') + pct + '%';
    el.rankTitle.textContent = rank.title;
    el.rankNote.textContent = bothDone ? rank.note : 'Пройдите второй маршрут, чтобы получить итоговое звание.';

    el.rankBonus.hidden = !bothDone;
    if (bothDone) {
      var bonus = share('shm') > share('darwin') ? BONUS.shm
        : share('darwin') > share('shm') ? BONUS.darwin
        : BONUS.tie;
      el.rankBonus.className = 'rank__bonus ' + bonus.cls;
      el.rankBonusTitle.textContent = bonus.title;
    }

    el.statRight.textContent = score.right + '/' + score.total;
    el.statAccuracy.textContent = percent(score.right, score.total) + '%';
    el.statRoutes.textContent = state.done.length + '/' + Object.keys(MUSEUMS).length;
    el.finalInvite.textContent = inviteText();
  }

  /** Приглашение в непройденный музей или благодарность. */
  function inviteText() {
    var left = Object.keys(MUSEUMS).filter(function (k) { return state.done.indexOf(k) === -1; });
    return left.length ? MUSEUMS[left[0]].invite : 'Оба маршрута пройдены — спасибо!';
  }

  /* --- События -------------------------------------------------- */

  document.querySelectorAll('[data-goto]').forEach(function (button) {
    button.addEventListener('click', function () { showScreen(button.dataset.goto); });
  });

  el.museumCards.forEach(function (card) {
    card.addEventListener('click', function () { startQuest(card.dataset.startQuest); });
  });

  el.questNext.addEventListener('click', goNext);
  el.questBack.addEventListener('click', goBack);
  el.authorsBack.addEventListener('click', function () { showScreen(state.prevScreen); });
  el.feedbackBack.addEventListener('click', function () { showScreen(state.prevScreen); });

  el.feedbackLink.hidden = !CONFIG.feedbackUrl;
  el.feedbackMissing.hidden = !!CONFIG.feedbackUrl;
  if (CONFIG.feedbackUrl) el.feedbackLink.href = CONFIG.feedbackUrl;

  showScreen('home');
})();
