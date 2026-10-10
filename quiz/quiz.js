/* Quiz do sono do bebê (/quiz).
   5 perguntas → carregamento → página de vendas (/) com ?perfil=A|B|C&idade=..&tentou=..
   A LP lê esses parâmetros, mostra o diagnóstico + mini VSL e libera o resto aos 60% do vídeo. */
(function () {
  "use strict";

  var PIXEL_ID = "1078460701310585"; // mesmo pixel da LP
  var LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname);

  /* Sessão: mesma chave da LP (psp_sid), então quiz e venda caem na mesma sessão do painel */
  var sid;
  try { sid = localStorage.getItem("psp_sid"); } catch (e) {}
  if (!sid) {
    sid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    try { localStorage.setItem("psp_sid", sid); } catch (e) {}
  }

  /* Meta Pixel (em localhost só loga no console, pra não sujar o pixel com testes) */
  if (!LOCAL) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", PIXEL_ID, { external_id: sid });
  }
  function px(method, name, params) {
    console.log("[Pixel]" + (LOCAL ? " (simulado)" : ""), method, name, params || "");
    if (!LOCAL && window.fbq) params ? window.fbq(method, name, params) : window.fbq(method, name);
  }

  /* Eventos pro painel /leads (mesma API da LP) */
  var qs = new URLSearchParams(location.search);
  function ev(name, props) {
    var body = JSON.stringify({
      sid: sid,
      events: [{ name: name, props: props || null, url: location.href }],
      ctx: { utm_source: qs.get("utm_source"), utm_campaign: qs.get("utm_campaign"), utm_content: qs.get("utm_content") }
    });
    try { navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain" })); } catch (e) {}
  }

  px("track", "PageView");
  ev("quiz_view", { ref: document.referrer || null });

  var I = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  var QUESTIONS = [
    { id: "p1", title: "Qual frase descreve melhor as noites do seu bebê?", options: [
      { v: "A", t: "Ele demora para dormir: chora, briga com o sono e só apaga no colo, no peito ou balançando." },
      { v: "B", t: "Ele até dorme, mas acorda várias vezes de madrugada e só volta a dormir com colo ou mamada." },
      { v: "C", t: "As sonecas são curtinhas, ele fica irritado no fim do dia e às vezes acorda cedo demais." }
    ]},
    { id: "p2", title: "Quantos meses o seu bebê tem?", options: [
      { v: "0-3", t: "0 a 3 meses" },
      { v: "4-6", t: "4 a 6 meses" },
      { v: "7-9", t: "7 a 9 meses" },
      { v: "10-12", t: "10 a 12 meses" },
      { v: "12+", t: "Mais de 1 ano" }
    ]},
    { id: "p3", title: "Como ele pega no sono hoje, na maioria das noites?", options: [
      { v: "mamando", t: "Mamando, no peito ou na mamadeira" },
      { v: "colo", t: "No colo, balançando" },
      { v: "movimento", t: "No carrinho, no carro ou no sling" },
      { v: "berco", t: "Sozinho no berço" }
    ]},
    { id: "p4", multi: true, title: "O que você já tentou?", hint: "Pode marcar mais de uma.", options: [
      { v: "banho", t: "Banho morno ou massagem antes de dormir" },
      { v: "ruido", t: "Ruído branco, música ou som de útero" },
      { v: "horario", t: "Mudar o horário de dormir" },
      { v: "cansar", t: "Deixar ele cansar mais para dormir melhor" },
      { v: "nada", t: "Nada ainda", exclusive: true }
    ]},
    { id: "p5", title: "E você, como está chegando ao fim do dia?", options: [
      { v: "exausta", t: "Exausta, no piloto automático" },
      { v: "paciencia", t: "Sem paciência, e com culpa por isso" },
      { v: "tempo", t: "Sem tempo para mim e para o casal" },
      { v: "tudo", t: "Tudo isso junto" }
    ]}
  ];

  var answers = { p1: null, p2: null, p3: null, p4: [], p5: null };
  window.QUIZ_ANSWERS = answers;

  var app = document.getElementById("quiz");
  var stage = app.querySelector(".stage");
  var progress = app.querySelector(".progress");
  var fill = app.querySelector(".progress-fill");
  var count = app.querySelector(".progress-count");
  var loadingScreen = stage.querySelector('[data-screen="loading"]');
  var current = null;
  var trail = [];

  function letter(i) { return String.fromCharCode(65 + i); }

  function renderQuestions() {
    QUESTIONS.forEach(function (q, qi) {
      var s = document.createElement("section");
      s.className = "screen q wrap";
      s.dataset.screen = q.id;
      s.innerHTML =
        '<span class="eyebrow">Pergunta ' + (qi + 1) + " de " + QUESTIONS.length + "</span>" +
        "<h2>" + q.title + "</h2>" +
        (q.hint ? '<p class="hint">' + q.hint + "</p>" : "") +
        '<div class="options" role="' + (q.multi ? "group" : "radiogroup") + '">' +
          q.options.map(function (o, oi) {
            return '<button type="button" class="opt" data-v="' + o.v + '"' + (o.exclusive ? " data-exclusive" : "") + ' aria-pressed="false">' +
              '<span class="opt-key">' + (q.multi ? '<span class="opt-check">' + I.check + "</span>" : letter(oi)) + "</span>" +
              "<span>" + o.t + "</span></button>";
          }).join("") +
        "</div>" +
        (q.multi ? '<button type="button" class="btn q-next" disabled>Continuar ' + I.arrow + "</button>" : "");
      stage.insertBefore(s, loadingScreen);

      var opts = s.querySelectorAll(".opt");
      opts.forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (q.multi) {
            var on = !btn.classList.contains("is-selected");
            if (on && btn.hasAttribute("data-exclusive")) opts.forEach(function (o) { o.classList.remove("is-selected"); o.setAttribute("aria-pressed", "false"); });
            if (on && !btn.hasAttribute("data-exclusive")) { var ex = s.querySelector("[data-exclusive]"); ex.classList.remove("is-selected"); ex.setAttribute("aria-pressed", "false"); }
            btn.classList.toggle("is-selected", on);
            btn.setAttribute("aria-pressed", String(on));
            answers[q.id] = Array.prototype.map.call(s.querySelectorAll(".opt.is-selected"), function (o) { return o.dataset.v; });
            s.querySelector(".q-next").disabled = answers[q.id].length === 0;
            return;
          }
          if (s.dataset.locked) return;
          s.dataset.locked = "1";
          opts.forEach(function (o) { o.classList.remove("is-selected"); o.setAttribute("aria-pressed", "false"); });
          btn.classList.add("is-selected");
          btn.setAttribute("aria-pressed", "true");
          answers[q.id] = btn.dataset.v;
          step(qi);
          setTimeout(function () { delete s.dataset.locked; next(qi); }, 260);
        });
      });
      if (q.multi) {
        s.querySelector(".q-next").addEventListener("click", function () {
          if (!answers[q.id].length) return;
          step(qi);
          next(qi);
        });
      }
    });
  }

  function step(qi) {
    var q = QUESTIONS[qi];
    px("trackCustom", "QuizStep", { step: qi + 1 });
    ev("quiz_step", { step: qi + 1, q: q.id, a: answers[q.id] });
  }

  function next(qi) {
    if (qi + 1 < QUESTIONS.length) return go(QUESTIONS[qi + 1].id);
    runLoading();
  }

  function go(id, isBack) {
    var target = stage.querySelector('[data-screen="' + id + '"]');
    if (!target || target === current) return;
    if (current && !isBack) trail.push(current.dataset.screen);
    if (current) current.classList.remove("is-active");
    target.classList.add("is-active");
    current = target;
    window.scrollTo(0, 0);

    var qi = QUESTIONS.findIndex(function (q) { return q.id === id; });
    progress.classList.toggle("is-visible", qi > -1);
    if (qi > -1) {
      fill.style.width = (qi / QUESTIONS.length) * 100 + 4 + "%";
      count.textContent = qi + 1 + "/" + QUESTIONS.length;
    }
  }

  app.querySelector(".progress-back").addEventListener("click", function () {
    var prev = trail.pop();
    if (prev) go(prev, true);
  });

  app.querySelector("[data-start]").addEventListener("click", function () {
    px("trackCustom", "QuizStart");
    ev("quiz_start");
    go("p1");
  });

  /* Carregamento (3,5 s) e ida para a LP com o diagnóstico */
  function runLoading() {
    go("loading");
    var ring = loadingScreen.querySelector(".ring");
    var pct = loadingScreen.querySelector(".ring-pct");
    var lines = loadingScreen.querySelectorAll(".load-line");
    ring.classList.remove("is-running"); void ring.offsetWidth; ring.classList.add("is-running");
    lines.forEach(function (l) { l.classList.remove("is-on", "is-done"); });
    var t0 = performance.now();
    (function tick(t) {
      var p = Math.min(1, (t - t0) / 3300);
      pct.textContent = Math.round(p * 100) + "%";
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
    [0, 1150, 2300].forEach(function (ms, i) {
      setTimeout(function () {
        if (i > 0) lines[i - 1].classList.add("is-done");
        lines[i].classList.add("is-on");
        if (i === 2) setTimeout(function () { lines[2].classList.add("is-done"); }, 700);
      }, ms);
    });

    var perfil = answers.p1 || "A";
    px("trackCustom", "QuizComplete", { perfil: perfil });
    ev("quiz_complete", { perfil: perfil, idade: answers.p2, tentou: answers.p4, como_dorme: answers.p3, mae: answers.p5 });

    setTimeout(function () {
      var dest = new URLSearchParams(location.search); // mantém UTMs, fbclid e o que mais vier do anúncio
      dest.set("perfil", perfil);
      if (answers.p2) dest.set("idade", answers.p2);
      if (answers.p4.length) dest.set("tentou", answers.p4.join(","));
      location.href = "/?" + dest.toString();
    }, 3500);
  }

  renderQuestions();
  go("intro");
})();
