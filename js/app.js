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
    feedbackUrl: '',          // ссылка на Яндекс Форму для отзывов ('' — кнопка скрыта)
    // Счётчик прошедших квест — бесплатный сервис Abacus (abacus.jasoncameron.dev), без регистрации.
    // '' — счётчик выключен. Сменить адрес = начать счёт заново.
    counterUrl: 'https://abacus.jasoncameron.dev/{action}/shm-darwin-museum-quest/finished'
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

  /* Особая ачивка за 100% верных ответов — заменяет обычное звание на финале */
  var PERFECT = { title: 'Знаток музея', note: 'Ни одной ошибки! Такое удаётся немногим — вы настоящий эксперт.' };

  var LETTERS = ['А', 'Б', 'В', 'Г'];                     // буквы вариантов ответа по индексу
  var DEFAULT_HINT = 'Подсказка. Осмотритесь в зале.';    // если у вопроса нет поля hint
  var ASIDE_SCREENS = ['authors', 'feedback'];            // открываются «сбоку» и возвращают туда, откуда пришли

  // Вопросы из js/questions.js; заглушка — на случай, если файл не загрузился.
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

  // Все экраны по имени из data-screen: { home: <section>, select: <section>, ... }
  var screens = {};
  document.querySelectorAll('[data-screen]').forEach(function (node) {
    screens[node.dataset.screen] = node;
  });

  // Ссылки на элементы, с которыми работает код (ищем один раз при загрузке).
  var el = {
    footer: $('footer'),
    museumCards: document.querySelectorAll('[data-start-quest]'),
    questPanel: document.querySelector('#screen-quest .panel'),
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
    authorsSlider: $('authors-slider'),
    feedbackBack: $('feedback-back'),
    feedbackLink: $('feedback-link'),
    feedbackMissing: $('feedback-missing'),
    meowOpen: $('meow-open'),
    meow: $('meow'),
    meowCat: $('meow-cat'),
    meowPet: $('meow-pet'),
    meowClose: $('meow-close'),
    meowCount: $('meow-count'),
    meowCountValue: $('meow-count-value'),
    finalResult: $('final-result'),
    rank: $('rank'),
    rankKicker: $('rank-kicker'),
    rankTitle: $('rank-title'),
    rankNote: $('rank-note'),
    statRight: $('stat-right'),
    statAccuracy: $('stat-accuracy'),
    finalInvite: $('final-invite')
  };

  /* --- Вспомогательное ------------------------------------------ */

  function pad(n) { return String(n).padStart(2, '0'); }                                // 3 → «03»
  function percent(right, total) { return Math.round((right / (total || 1)) * 100); }  // защита от деления на 0
  function questions() { return QUESTIONS[state.museum] || []; }                       // вопросы текущего музея
  function current() { return questions()[state.index]; }                             // текущий вопрос
  function isMulti(q) { return q.correct.length > 1; }                                 // можно выбрать несколько

  /** Верно, только если выбраны все правильные варианты и ни одного лишнего. */
  function isCorrect(q, picked) {
    return picked.length === q.correct.length &&
      q.correct.every(function (i) { return picked.indexOf(i) !== -1; });
  }

  /**
   * Создать элемент строки ответа: буква + текст (+ вердикт).
   * tag — 'button' для выбора ответа, 'div' для строки результата.
   */
  function optionNode(tag, index, label, verdict) {
    var node = document.createElement(tag);
    node.className = 'option';
    if (tag === 'button') node.type = 'button';
    // Каркас — через innerHTML, а текст — через textContent, чтобы он не разбирался как HTML.
    node.innerHTML = '<span class="option__letter"></span><span class="option__label"></span>' +
      (verdict ? '<span class="option__verdict"></span>' : '');
    node.querySelector('.option__letter').textContent = LETTERS[index];
    node.querySelector('.option__label').textContent = label;
    if (verdict) node.querySelector('.option__verdict').textContent = verdict;
    return node;
  }

  /* --- Подгонка под экран ------------------------------------- */

  /**
   * Ужимает текст и отступы вопроса (--k от 1 до 0.72), пока всё не поместится без прокрутки.
   * CSS-переменная --k умножается на размеры шрифтов и отступов в .panel (см. styles.css).
   */
  function fitQuest() {
    var screen = screens.quest;
    var panel = el.questPanel;
    if (screen.hidden) return;                 // у скрытого экрана нечего измерять

    var k = 1;
    screen.style.setProperty('--k', k);
    // +1 — допуск на дробные пиксели; шаг 0.02, округляем, чтобы не копились ошибки float.
    while (panel.scrollHeight > panel.clientHeight + 1 && k > 0.72) {
      k = Math.round((k - 0.02) * 100) / 100;
      screen.style.setProperty('--k', k);
    }
    panel.scrollTop = 0;
  }

  // При ресайзе пересчитываем не чаще раза в 80 мс (debounce).
  var fitTimer;
  window.addEventListener('resize', function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitQuest, 80);
  });
  // Веб-шрифты меняют размеры текста — пересчитываем после их загрузки.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitQuest);

  /* --- Навигация ------------------------------------------------ */

  /** Показать экран по имени (значение data-screen) и обновить его содержимое. */
  function showScreen(name) {
    // Запоминаем, куда вернуться из «Авторов»/«Отзыва» (переход между ними точку возврата не меняет).
    if (ASIDE_SCREENS.indexOf(name) !== -1 && ASIDE_SCREENS.indexOf(state.screen) === -1) state.prevScreen = state.screen;
    state.screen = name;

    Object.keys(screens).forEach(function (key) { screens[key].hidden = key !== name; });
    el.footer.hidden = name === 'home' || name === 'quest';

    if (name === 'select') renderMuseumCards();
    if (name === 'final') renderFinal();
    if (name === 'authors') el.authorsSlider.scrollTo({ left: 0, behavior: 'instant' }); // всегда с первого слайда

    window.scrollTo(0, 0);
    fitQuest();
  }

  /* --- Выбор музея ---------------------------------------------- */

  /** Подписи на карточках музеев: номер квеста и количество вопросов (или «появится позже», если квест закрыт). */
  function renderMuseumCards() {
    el.museumCards.forEach(function (card) {
      var key = card.dataset.startQuest;
      card.querySelector('[data-role="kicker"]').textContent = MUSEUMS[key].kicker;
      card.querySelector('[data-role="meta"]').textContent = card.disabled
        ? 'Квест появится позже'
        : (QUESTIONS[key] || []).length + ' вопросов';
    });
  }

  /** Начать квест выбранного музея с первого вопроса. */
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

  /** Перерисовать экран квеста по текущему состоянию (вызывается после каждого действия). */
  function renderQuest() {
    var list = questions();
    var q = current();

    // Шапка и прогресс: вопрос засчитывается в прогресс, как только выбран ответ.
    el.questMuseum.textContent = MUSEUMS[state.museum].name;
    el.questStep.textContent = pad(state.index + 1) + ' / ' + pad(list.length);
    el.questProgress.style.width = percent(state.index + (state.picked.length ? 1 : 0), list.length) + '%';
    el.questQuestion.textContent = q.q;
    el.questMulti.hidden = !isMulti(q);

    // Шаг 1 (выбор) и шаг 2 (результат) — взаимоисключающие блоки.
    el.questAsk.hidden = state.revealed;
    el.questReveal.hidden = !state.revealed;
    el.questHint.hidden = !CONFIG.showHints;
    el.questHintText.textContent = q.hint ? 'Где искать: ' + q.hint : DEFAULT_HINT;

    if (state.revealed) renderReveal(q); else renderOptions(q);

    // «Далее» неактивна, пока ничего не выбрано; на пояснении к последнему вопросу — «Завершить квест».
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

  /** Клик по варианту: в мульти-вопросе — включить/выключить, в обычном — заменить выбор. */
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
      if (!right && !chosen) return;           // невыбранные неверные варианты не показываем

      var verdict = chosen ? (right ? 'Верно' : 'Неверно') : 'Правильный ответ';
      var node = optionNode('div', i, label, verdict);
      node.classList.add('option--result', right ? 'option--right' : 'option--wrong');
      if (!chosen) node.classList.add('option--missed');
      el.questResults.appendChild(node);
    });

    el.questExplain.hidden = !q.explain;       // пустое пояснение — блок скрыт
    el.questExplainText.textContent = q.explain || '';
  }

  /** Кнопка «Далее»: ответ → пояснение → следующий вопрос (или финал). */
  function goNext() {
    var q = current();
    if (!state.picked.length) return;

    if (!state.revealed) {           // ответ → пояснение
      state.revealed = true;
      renderQuest();
      window.scrollTo(0, 0);
      return;
    }

    // Результат фиксируется при уходе с пояснения; повторный ответ на тот же вопрос его перезапишет.
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

  /** Кнопка «Назад» в квесте. */
  function goBack() {
    if (state.revealed) {            // с пояснения — обратно к выбору ответа
      state.revealed = false;
    } else if (state.index > 0) {    // к предыдущему вопросу, выбор сбрасывается
      state.index -= 1;
      state.picked = [];
    } else {                         // с первого вопроса — к выбору музея
      showScreen('select');
      return;
    }
    renderQuest();
  }

  /* --- Финал ---------------------------------------------------- */

  /** Подсчитать верные ответы и перейти на финал. */
  function completeQuest() {
    var total = questions().length;
    var right = Object.keys(state.answers).filter(function (k) { return state.answers[k]; }).length;

    state.score = { right: right, total: total };
    state.revealed = false;
    state.picked = [];
    countFinish();
    showScreen('final');
  }

  /** Заполнить финальный экран: результат, звание, статистика, приглашение. */
  function renderFinal() {
    var score = state.score || { right: 0, total: 0 };
    var pct = percent(score.right, score.total);
    // RANKS отсортированы по убыванию min — берём первое подходящее звание.
    var rank = RANKS.filter(function (r) { return pct >= r.min; })[0];
    // Все ответы верные — вместо звания золотая ачивка.
    var perfect = score.total > 0 && score.right === score.total;
    if (perfect) rank = PERFECT;

    el.finalResult.textContent = 'Верных ответов: ' + score.right + ' из ' + score.total;
    el.rank.classList.toggle('rank--perfect', perfect);
    el.rankKicker.textContent = (perfect ? 'Особая ачивка · ' : 'Ваше звание · ') + pct + '%';
    el.rankTitle.textContent = rank.title;
    el.rankNote.textContent = rank.note;

    el.statRight.textContent = score.right + '/' + score.total;
    el.statAccuracy.textContent = pct + '%';
    el.finalInvite.textContent = inviteText();
  }

  /** Приглашение во второй музей (тот, что не проходили). */
  function inviteText() {
    var other = Object.keys(MUSEUMS).filter(function (k) { return k !== state.museum; })[0];
    return MUSEUMS[other].invite;
  }

  /* --- События -------------------------------------------------- */

  // Любая кнопка с data-goto="имя" открывает соответствующий экран.
  document.querySelectorAll('[data-goto]').forEach(function (button) {
    button.addEventListener('click', function () { showScreen(button.dataset.goto); });
  });

  el.museumCards.forEach(function (card) {
    card.addEventListener('click', function () { startQuest(card.dataset.startQuest); });
  });

  el.questNext.addEventListener('click', goNext);
  el.questBack.addEventListener('click', goBack);
  // «Назад» на боковых экранах возвращает туда, откуда их открыли.
  el.authorsBack.addEventListener('click', function () { showScreen(state.prevScreen); });
  el.feedbackBack.addEventListener('click', function () { showScreen(state.prevScreen); });

  /* --- Счётчик прошедших --------------------------------------- */

  var COUNTED_KEY = 'quest-finish-counted'; // метка в браузере: это устройство уже посчитано

  /** Запрос к счётчику: 'hit' — прибавить 1, 'get' — узнать число. Возвращает Promise с числом. */
  function counter(action) {
    return fetch(CONFIG.counterUrl.replace('{action}', action))
      .then(function (res) {
        if (res.status === 404) return { value: 0 }; // ещё никто не прошёл — счётчик не создан
        if (!res.ok) throw new Error('counter ' + res.status);
        return res.json();
      })
      .then(function (data) { return data.value; });
  }

  /** Прибавить 1 к счётчику — один раз с устройства. Ошибки сети не мешают квесту. */
  function countFinish() {
    if (!CONFIG.counterUrl) return;
    try { if (localStorage.getItem(COUNTED_KEY)) return; } catch (e) { /* хранилище недоступно — считаем */ }
    counter('hit')
      .then(function () { try { localStorage.setItem(COUNTED_KEY, '1'); } catch (e) {} })
      .catch(function () {});
  }

  /** Показать число в пасхалке; если сервис не ответил — строка остаётся скрытой. */
  function renderCount() {
    if (!CONFIG.counterUrl) return;
    counter('get')
      .then(function (value) {
        el.meowCountValue.textContent = value.toLocaleString('ru-RU');
        el.meowCount.hidden = false;
      })
      .catch(function () {});
  }

  /* --- Пасхалка: котик на странице авторов ---------------------- */

  /** Открыть/закрыть окно котика; подвал под ним прячем, чтобы не просвечивал. */
  function toggleMeow(open) {
    el.meow.hidden = !open;
    document.body.classList.toggle('is-meow', open);
    if (open) renderCount();
    // Фокус — на само окно при открытии (без рамки на кнопках) и обратно на кнопку при закрытии.
    (open ? el.meow : el.meowOpen).focus({ preventScroll: true });
  }

  el.meowOpen.addEventListener('click', function () { toggleMeow(true); });

  // Клавиатура в открытом окне: Esc закрывает, Tab ходит по кругу только по кнопкам окна.
  document.addEventListener('keydown', function (event) {
    if (el.meow.hidden) return;

    if (event.key === 'Escape') {
      toggleMeow(false);
      return;
    }

    if (event.key === 'Tab') {
      var focusable = el.meow.querySelectorAll('button');
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      // Фокус вне кнопок окна (на самом окне или снаружи) — тоже заворачиваем внутрь.
      var inside = el.meow.contains(document.activeElement) && document.activeElement !== el.meow;

      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  el.meowPet.addEventListener('click', function () {
    el.meowCat.classList.remove('is-spinning');
    void el.meowCat.offsetWidth;               // перезапуск анимации при повторном нажатии
    el.meowCat.classList.add('is-spinning');
  });
  el.meowCat.addEventListener('animationend', function () { el.meowCat.classList.remove('is-spinning'); });
  el.meowClose.addEventListener('click', function () { toggleMeow(false); });

  /* --- Старт ---------------------------------------------------- */

  // Ссылка на анкету: пока feedbackUrl пуст, вместо кнопки — «Анкета скоро появится».
  el.feedbackLink.hidden = !CONFIG.feedbackUrl;
  el.feedbackMissing.hidden = !!CONFIG.feedbackUrl;
  if (CONFIG.feedbackUrl) el.feedbackLink.href = CONFIG.feedbackUrl;

  showScreen('home');
})();
