/**
 * Фоновые частицы — «пыль музейного архива».
 * Рисуются на каждом <canvas class="particles"> (фон сайта и окно котика),
 * учитывают devicePixelRatio, пересобираются при ресайзе и замирают при prefers-reduced-motion.
 */
(function () {
  'use strict';

  var CONFIG = {
    baseCount: 100,                                                   // частиц на «эталонном» экране
    colors: ['rgba(237,118,14,', 'rgba(174,191,146,', 'rgba(238,231,219,'], // оранжевый / зелёный / кремовый
    maxDpr: 2
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  /** Частицы на одном холсте. Холст может быть скрыт — тогда он пересобирается, когда появится. */
  function createParticles(canvas) {
    var ctx = canvas.getContext('2d');
    var width = 0;
    var height = 0;
    var dots = [];
    var time = 0;

    /** Пересчитать размер холста и заново создать частицы. */
    function build() {
      var dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);

      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // На больших экранах частиц больше, на маленьких — меньше.
      var density = Math.min(1.4, Math.max(0.5, (width * height) / 700000));
      var count = Math.round(CONFIG.baseCount * density);

      dots = [];
      for (var i = 0; i < count; i++) {
        dots.push({
          x: random(0, width),
          y: random(0, height),
          radius: random(0.5, 2.4),
          speedY: -random(0.06, 0.34),      // медленно поднимаются вверх
          speedX: random(-0.08, 0.08),
          alpha: random(0.12, 0.57),
          phase: random(0, Math.PI * 2),    // сдвиг мерцания
          color: CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)]
        });
      }
    }

    function drawDot(dot, alpha) {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
      ctx.fillStyle = dot.color + alpha.toFixed(3) + ')';
      ctx.fill();

      // Крупные частицы получают мягкое свечение.
      if (dot.radius > 1.7) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius * 5, 0, Math.PI * 2);
        ctx.fillStyle = dot.color + (alpha * 0.07).toFixed(3) + ')';
        ctx.fill();
      }
    }

    function frame() {
      requestAnimationFrame(frame);

      // Скрытый холст не рисуем; размер изменился (ресайз, холст стал видимым) — пересобираем.
      if (!canvas.clientWidth) { width = 0; return; }
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) {
        build();
        if (reduceMotion) dots.forEach(function (dot) { drawDot(dot, dot.alpha); });   // один статичный кадр
      }
      if (reduceMotion) return;

      time += 0.016;
      ctx.clearRect(0, 0, width, height);

      for (var i = 0; i < dots.length; i++) {
        var dot = dots[i];

        dot.x += dot.speedX + Math.sin(time * 0.6 + dot.phase) * 0.12;
        dot.y += dot.speedY;

        // Зацикливаем движение по краям холста.
        if (dot.y < -12) { dot.y = height + 8; dot.x = random(0, width); }
        if (dot.x < -12) dot.x = width + 8;
        if (dot.x > width + 12) dot.x = -8;

        drawDot(dot, dot.alpha * (0.6 + 0.4 * Math.sin(time * 1.5 + dot.phase)));
      }
    }

    requestAnimationFrame(frame);
  }

  document.querySelectorAll('canvas.particles').forEach(createParticles);
})();
