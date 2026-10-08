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
    score: null        // { right, total } — результат последнего квеста
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
    meowOpen: $('meow-open'),
    meow: $('meow'),
    meowCat: $('meow-cat'),
    meowPet: $('meow-pet'),
    meowClose: $('meow-close'),
    finalResult: $('final-result'),
    rankKicker: $('rank-kicker'),
    rankTitle: $('rank-title'),
    rankNote: $('rank-note'),
    statRight: $('stat-right'),
    statAccuracy: $('stat-accuracy'),
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

  /* --- Подгонка под экран ------------------------------------- */

  /** Ужимает текст и отступы вопроса (--k от 1 до 0.72), пока всё не поместится без прокрутки. */
  var panel = document.querySelector('#screen-quest .panel');
  function fitQuest() {
    var screen = screens.quest;
    if (screen.hidden) return;
    var k = 1;
    screen.style.setProperty('--k', k);
    while (panel.scrollHeight > panel.clientHeight + 1 && k > 0.72) {
      k = Math.round((k - 0.02) * 100) / 100;
      screen.style.setProperty('--k', k);
    }
    panel.scrollTop = 0;
  }

  var fitTimer;
  window.addEventListener('resize', function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitQuest, 80);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitQuest);

  /* --- Навигация ------------------------------------------------ */

  var ASIDE_SCREENS = ['authors', 'feedback']; // открываются поверх и возвращают туда, откуда пришли

  function showScreen(name) {
    if (ASIDE_SCREENS.indexOf(name) !== -1 && ASIDE_SCREENS.indexOf(state.screen) === -1) state.prevScreen = state.screen;
    state.screen = name;
    Object.keys(screens).forEach(function (key) { screens[key].hidden = key !== name; });
    el.footer.hidden = name === 'home' || name === 'quest';
    if (name === 'select') renderMuseumCards();
    if (name === 'final') renderFinal();
    if (name === 'authors') $('authors-slider').scrollTo({ left: 0, behavior: 'instant' });
    window.scrollTo(0, 0);
    fitQuest();
  }

  /* --- Выбор музея ---------------------------------------------- */

  function renderMuseumCards() {
    el.museumCards.forEach(function (card) {
      var key = card.dataset.startQuest;
      card.querySelector('[data-role="kicker"]').textContent = MUSEUMS[key].kicker;
      card.querySelector('[data-role="meta"]').textContent = (QUESTIONS[key] || []).length + ' вопросов';
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
    fitQuest();
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

    state.score = { right: right, total: total };
    state.revealed = false;
    state.picked = [];
    showScreen('final');
  }

  function renderFinal() {
    var score = state.score || { right: 0, total: 0 };
    var pct = percent(score.right, score.total);
    var rank = RANKS.filter(function (r) { return pct >= r.min; })[0];

    el.finalResult.textContent = 'Верных ответов: ' + score.right + ' из ' + score.total;
    el.rankKicker.textContent = 'Ваше звание · ' + pct + '%';
    el.rankTitle.textContent = rank.title;
    el.rankNote.textContent = rank.note;

    el.statRight.textContent = score.right + '/' + score.total;
    el.statAccuracy.textContent = pct + '%';
    el.finalInvite.textContent = inviteText();
  }

  /** Приглашение во второй музей. */
  function inviteText() {
    var other = Object.keys(MUSEUMS).filter(function (k) { return k !== state.museum; })[0];
    return MUSEUMS[other].invite;
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

  /* Пасхалка: котик на странице авторов */
  /** Открыть/закрыть окно котика; подвал под ним прячем, чтобы не просвечивал. */
  function toggleMeow(open) {
    el.meow.hidden = !open;
    document.body.classList.toggle('is-meow', open);
  }

  el.meowOpen.addEventListener('click', function () { toggleMeow(true); });

  el.meowPet.addEventListener('click', function () {
    el.meowCat.classList.remove('is-spinning');
    void el.meowCat.offsetWidth;               // перезапуск анимации при повторном нажатии
    el.meowCat.classList.add('is-spinning');
  });
  el.meowCat.addEventListener('animationend', function () { el.meowCat.classList.remove('is-spinning'); });
  el.meowClose.addEventListener('click', function () { toggleMeow(false); });

  el.feedbackLink.hidden = !CONFIG.feedbackUrl;
  el.feedbackMissing.hidden = !!CONFIG.feedbackUrl;
  if (CONFIG.feedbackUrl) el.feedbackLink.href = CONFIG.feedbackUrl;

  showScreen('home');
})();
