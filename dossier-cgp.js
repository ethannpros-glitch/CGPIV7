(function () {
'use strict';

var IV = [1, 3, 7, 16, 35, 90];
var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
var KEY = 'cgp_proto_v2';
var userName = 'Camille';
var today = function () { return Math.floor(Date.now() / 86400000); };

var state = {
  ready: false, theme: 'dark', screen: 'home', openPole: null, cat: null,
  quiz: null, qi: 0, ans: null, pick: null, calc: '', texte: '', revealed: false, results: [],
  fiche: null, level: 1, onb: 0, confetti: false, notif: true
};
var store = null;
var confettiTimer = null;

function load() {
  var s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  store = s || { srs: {}, xp: 1240, streak: 12, seen: 0, poles: {}, best: {}, seeded: false };
  if (!store.poles) store.poles = {};
  if (!store.best) store.best = {};
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

// ---- data helpers -------------------------------------------------------
function D() { return window.CGP_DATA || { BANK: {}, THEORY: {}, CATS: [], EXAM_LEVELS: {} }; }
function bank(id) { var b = D().BANK[id]; return Array.isArray(b) ? b : []; }
function allCats() {
  var out = [];
  D().CATS.forEach(function (c) {
    (c.sub || []).forEach(function (s) {
      out.push(Object.assign({}, s, { pole: c.pole, parent: c.label, parentId: c.id }));
    });
  });
  return out;
}
function quizCats() { return allCats().filter(function (s) { return !s.theory && bank(s.id).length; }); }
function poleNames() {
  var seen = {}, out = [];
  D().CATS.forEach(function (c) { if (c.pole && !seen[c.pole]) { seen[c.pole] = true; out.push(c.pole); } });
  return out;
}

function seed() {
  if (store.seeded) return;
  var cats = quizCats(), t = today();
  var due = 0, learn = 0, mast = 0, i = 0;
  cats.forEach(function (c) {
    var qs = bank(c.id);
    qs.forEach(function (q, qi) {
      i++;
      if (i % 61 === 0 && due < 14) { store.srs[c.id + '#' + qi] = { b: 0, d: t, ok: 0, ko: 2 }; due++; }
      else if (i % 23 === 0 && learn < 38) { store.srs[c.id + '#' + qi] = { b: 1, d: t + 2 + (qi % 4), ok: 1, ko: 1 }; learn++; }
      else if (i % 4 === 0 && mast < 211) { store.srs[c.id + '#' + qi] = { b: 4, d: t + 12 + (qi % 20), ok: 3, ko: 0 }; mast++; }
    });
  });
  var seedPct = { 'Les enveloppes': 82, 'Supports & actifs': 74, 'Fiscalité & transmission': 61, 'Retraite & protection': 47, 'Financement & levier': 39, 'Entreprise & ingénierie': 56, 'Métier & méthode': 68 };
  poleNames().forEach(function (p) { store.poles[p] = { n: 20, ok: Math.round(20 * (seedPct[p] || 60) / 100) }; });
  store.seen = 263;
  store.seeded = true;
  save();
}

function polePct(p) { var e = store.poles[p]; return e && e.n ? Math.round(100 * e.ok / e.n) : 50; }
function masteryPct() {
  var ps = poleNames(); if (!ps.length) return 0;
  return Math.round(ps.reduce(function (a, p) { return a + polePct(p); }, 0) / ps.length);
}
function dueKeys() { var t = today(); return Object.keys(store.srs).filter(function (k) { return store.srs[k].d <= t; }); }
function boxCount(fn) { return Object.keys(store.srs).filter(function (k) { return fn(store.srs[k]); }).length; }
function totalQ() { return quizCats().reduce(function (a, c) { return a + bank(c.id).length; }, 0); }

function qFromKey(k) {
  var i = k.lastIndexOf('#'), id = k.slice(0, i), idx = +k.slice(i + 1);
  var q = bank(id)[idx];
  if (!q) return null;
  var cat = quizCats().find(function (c) { return c.id === id; });
  return { q: q, key: k, catId: id, catLabel: cat ? cat.label : id, pole: cat ? cat.pole : '' };
}

// ---- quiz flow ------------------------------------------------------------
function startList(keys, meta) {
  var items = keys.map(qFromKey).filter(Boolean);
  if (!items.length) return;
  state.quiz = { items: items, meta: meta };
  state.qi = 0; state.ans = null; state.pick = null;
  state.calc = ''; state.texte = ''; state.revealed = false; state.results = [];
  state.screen = 'quiz'; state.confetti = false;
  render();
}
function startCat(id, n) {
  var qs = bank(id);
  var keys = qs.map(function (q, i) { return id + '#' + i; }).sort(function () { return Math.random() - 0.5; }).slice(0, n || 12);
  var cat = quizCats().find(function (c) { return c.id === id; });
  startList(keys, { kind: 'cat', title: cat ? cat.label : 'Série' });
}
function startDailyQuiz() {
  var cats = quizCats(), keys = [];
  for (var i = 0; i < 5; i++) {
    var c = cats[Math.floor(Math.random() * cats.length)];
    var qs = bank(c.id);
    keys.push(c.id + '#' + Math.floor(Math.random() * qs.length));
  }
  startList(keys, { kind: 'daily', title: 'Défi du jour' });
}
function startSrsQuiz() {
  var keys = dueKeys().slice(0, 20);
  if (!keys.length) { startDailyQuiz(); return; }
  startList(keys, { kind: 'srs', title: 'Révision du jour' });
}
function startDiagQuiz() {
  var poles = poleNames(), keys = [];
  poles.slice(0, 5).forEach(function (p) {
    var cs = quizCats().filter(function (c) { return c.pole === p; });
    if (!cs.length) return;
    var c = cs[Math.floor(Math.random() * cs.length)];
    keys.push(c.id + '#' + Math.floor(Math.random() * bank(c.id).length));
  });
  startList(keys, { kind: 'diag', title: 'Diagnostic' });
}
function startExam(levelKey, label) {
  var src = D().EXAM_LEVELS[levelKey] || [];
  var picked = src.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 40);
  var keys = picked.map(function (e) { return e.d + '#' + e.i; });
  startList(keys, { kind: 'exam', title: 'Examen · ' + label, levelKey: levelKey, label: label });
}
function startFicheQ(theoryId) {
  var cat = allCats().find(function (c) { return c.theory === theoryId; });
  var sib = cat ? quizCats().filter(function (c) { return c.parentId === cat.parentId; }) : [];
  var keys = [];
  sib.forEach(function (c) { bank(c.id).forEach(function (q, i) { keys.push(c.id + '#' + i); }); });
  if (!keys.length) { startDailyQuiz(); return; }
  startList(keys.sort(function () { return Math.random() - 0.5; }).slice(0, 8), { kind: 'cat', title: 'Test de la fiche' });
}

function cur() { return state.quiz ? state.quiz.items[state.qi] : null; }

function grade(ok, after) {
  var it = cur(); if (!it) return;
  var s = store;
  var e = s.srs[it.key] || { b: 0, d: 0, ok: 0, ko: 0 };
  if (ok) { e.ok++; e.b = Math.min(e.b + 1, IV.length - 1); } else { e.ko++; e.b = 0; }
  e.d = today() + IV[e.b];
  s.srs[it.key] = e;
  s.seen = (s.seen || 0) + 1;
  if (ok) s.xp = (s.xp || 0) + 10;
  if (it.pole) {
    var p = s.poles[it.pole] || { n: 0, ok: 0 };
    p.n++; if (ok) p.ok++;
    s.poles[it.pole] = p;
  }
  save();
  state.results = state.results.concat([{ ok: ok, key: it.key, pole: it.pole }]);
  state.ans = ok ? 'ok' : 'ko';
  render();
  if (after) after();
}

function answerQcm(i) { var it = cur(); if (!it) return; state.pick = i; grade(i === it.q.correct); }
function answerVf(i) { var it = cur(); if (!it) return; state.pick = i; grade(i === it.q.correct); }
function validateCalc() {
  var it = cur(); if (!it) return;
  var v = parseFloat((state.calc || '').replace(',', '.'));
  var tol = it.q.tol != null ? it.q.tol : Math.max(0.01, Math.abs(it.q.correct) * 0.02);
  grade(isFinite(v) && Math.abs(v - it.q.correct) <= tol);
}
function nextQ() {
  var q = state.quiz;
  if (!q) return;
  if (state.qi + 1 >= q.items.length) {
    var ok = state.results.filter(function (r) { return r.ok; }).length;
    var pct = Math.round(100 * ok / q.items.length);
    if (q.meta.kind === 'exam') {
      store.best[q.meta.levelKey] = Math.max(store.best[q.meta.levelKey] || 0, pct);
      save();
      state.screen = 'examResult'; state.confetti = pct >= 60;
    } else {
      state.screen = 'done'; state.confetti = pct >= 70;
    }
    if (confettiTimer) clearTimeout(confettiTimer);
    confettiTimer = setTimeout(function () { state.confetti = false; render(); }, 3400);
    render();
    return;
  }
  state.qi++; state.ans = null; state.pick = null; state.calc = ''; state.texte = ''; state.revealed = false;
  render();
}
function go(screen, patch) { state.screen = screen; if (patch) Object.assign(state, patch); render(); }

// ---- computed view values (mirrors the design's renderVals) --------------
function computeVals() {
  var st = state, S = store || { srs: {}, poles: {}, best: {} };
  var Dd = D();
  var scr = st.screen;
  var dark = st.theme === 'dark';
  var levels = [
    { title: 'Débutant', sub: 'Je découvre les enveloppes' },
    { title: 'Intermédiaire', sub: 'Je connais les bases, je consolide' },
    { title: 'Confirmé', sub: 'Je vise le sans-faute technique' }
  ];
  var pNames = st.ready ? poleNames() : [];
  var pctOf = function (p) { return polePct(p); };

  var v = {
    theme: st.theme, themeIcon: dark ? '☀' : '☾',
    themeLabel: dark ? 'Encre' : 'Papier',
    screenKey: scr + ':' + st.qi + ':' + (st.cat || '') + ':' + (st.fiche || ''),
    userName: userName,
    greeting: 'Bonsoir',
    isConfetti: !!st.confetti,
    streak: S.streak || 12, xp: S.xp || 0, mastery: st.ready ? masteryPct() : 0,
    answeredCount: S.seen || 0, totalQ: st.ready ? totalQ() : 0,
    dueCount: st.ready ? dueKeys().length : 0,
    learnCount: st.ready ? boxCount(function (e) { return e.b >= 1 && e.b <= 3; }) : 0,
    masteredCount: st.ready ? boxCount(function (e) { return e.b >= 4; }) : 0,
    unseenCount: st.ready ? Math.max(0, totalQ() - Object.keys(S.srs).length) : 0,
    dailyPct: 62, dailyTurn: '0.62turn',
    levelLabel: levels[st.level].title,
    notifOn: !!st.notif, notifOff: !st.notif,
    notifSub: st.notif ? 'Tous les jours à 19:30' : 'Désactivé',

    isOnb: scr === 'onb', isHome: scr === 'home', isBrowse: scr === 'browse', isCat: scr === 'cat',
    isQuiz: scr === 'quiz', isDone: scr === 'done', isExamPick: scr === 'examPick',
    isExamResult: scr === 'examResult', isSrs: scr === 'srs', isCourses: scr === 'courses',
    isFiche: scr === 'fiche', isProgress: scr === 'progress', isProfile: scr === 'profile',
    showTabs: ['home', 'browse', 'cat', 'srs', 'courses', 'fiche', 'progress', 'profile', 'examPick'].indexOf(scr) >= 0,

    onb0: st.onb === 0, onb1: st.onb === 1, onb2: st.onb === 2,
    onbStepLabel: 'ÉTAPE ' + (st.onb + 1) + ' / 3',
    levels: levels.map(function (l, i) { return { n: i + 1, title: l.title, sub: l.sub, on: st.level === i }; }),
    poleChips: pNames.map(function (p) { return { label: p }; }),

    tabs: [
      { label: 'Jouer', k: 'home' }, { label: 'Réviser', k: 'srs' }, { label: 'Cours', k: 'courses' },
      { label: 'Stats', k: 'progress' }, { label: 'Profil', k: 'profile' }
    ].map(function (t) {
      var on = scr === t.k || (t.k === 'home' && (scr === 'browse' || scr === 'cat' || scr === 'examPick')) || (t.k === 'courses' && scr === 'fiche');
      return { label: t.label, k: t.k, on: on, off: !on };
    })
  };

  v.poles = pNames.map(function (p) {
    var cats = Dd.CATS.filter(function (c) { return c.pole === p; });
    return {
      label: p, pct: pctOf(p), open: st.openPole === p,
      cats: cats.map(function (c) {
        return { label: c.label, id: c.id, badge: ((c.sub || []).filter(function (s) { return !s.theory; }).length) + ' séries' };
      })
    };
  });

  var catObj = Dd.CATS.find(function (c) { return c.id === st.cat; });
  v.catLabel = catObj ? catObj.label : '';
  v.catPole = catObj ? catObj.pole : '';
  v.subs = catObj ? (catObj.sub || []).map(function (s) {
    var n = bank(s.id).length;
    return { label: s.label, badge: s.theory ? 'FICHE' : n + ' Q.', theory: s.theory || null, id: s.id };
  }) : [];

  var tKeys = Object.keys(Dd.THEORY || {});
  v.ficheCount = tKeys.length;
  v.fiches = tKeys.map(function (k) {
    var t = Dd.THEORY[k];
    return { key: k, title: t.title, meta: ((t.sections || []).length) + ' SECTIONS · ' + Math.max(2, Math.round((t.sections || []).length * 1.2)) + ' MIN' };
  });
  var fi = Dd.THEORY ? Dd.THEORY[st.fiche] : null;
  v.ficheTitle = fi ? fi.title : '';
  v.ficheSource = fi ? (fi.source || '') : '';
  v.ficheIdx = fi ? 'FICHE ' + (tKeys.indexOf(st.fiche) + 1) + ' / ' + tKeys.length : '';
  v.ficheMin = fi ? Math.max(2, Math.round((fi.sections || []).length * 1.2)) : 0;
  v.ficheSections = fi ? (fi.sections || []).map(function (s) { return { h: (s.h || '').toUpperCase(), body: s.body }; }) : [];

  var exLabels = [
    { k: 'facile', label: 'Niveau 1 · Fondamentaux', sub: 'Les réflexes de base' },
    { k: 'avance', label: 'Niveau 2 · Avancé', sub: 'Cas concrets et calculs' },
    { k: 'technique', label: 'Niveau 3 · Technique', sub: "Le niveau de l'examen réel" }
  ];
  v.examLevels = exLabels.map(function (e, i) {
    return { n: i + 1, key: e.k, label: e.label, sub: e.sub, best: (S.best && S.best[e.k]) ? 'RECORD ' + S.best[e.k] + '%' : '—' };
  });

  var it = cur();
  if (it) {
    var q = it.q, ans = st.ans;
    var done = !!ans;
    v.quizTitle = st.quiz.meta.title;
    v.quizPos = (st.qi + 1) + ' / ' + st.quiz.items.length;
    v.quizPct = Math.round(100 * (st.qi + (done ? 1 : 0)) / st.quiz.items.length);
    v.qCat = (it.catLabel || '').toUpperCase();
    v.qText = q.q || q.titre || '';
    v.qUnit = q.unit || '';
    v.qExplain = q.explain || '';
    v.qModele = q.modele || '';
    var examMode0 = st.quiz.meta.kind === 'exam';
    var graded = done && !(q.type === 'texte' && ans === 'reveal');
    v.answered = graded && !examMode0; v.wasOk = ans === 'ok'; v.wasKo = ans === 'ko';
    v.examAnswered = graded && examMode0;
    v.koNote = st.quiz.meta.kind === 'exam' ? 'NOTÉ' : 'REVOIR DEMAIN';
    var e = S.srs[it.key];
    v.nextIn = e ? IV[e.b] : 1;
    var tl = { qcm: 'QCM', vf: 'VRAI / FAUX', calc: 'CALCUL', texte: 'RÉDACTION', memviz: 'MÉMORISATION' };
    v.qTypeLabel = tl[q.type] || 'QUESTION';
    v.isQcm = q.type === 'qcm'; v.isVf = q.type === 'vf'; v.isCalc = q.type === 'calc';
    v.isTexte = q.type === 'texte'; v.isMemviz = q.type === 'memviz';
    var examMode = st.quiz.meta.kind === 'exam';

    v.qHasSvg = !!q.svg && q.type !== 'memviz' && done && !examMode0;
    v.qSvg = q.svg || '';

    var st8 = function (i) {
      return {
        pending: !done,
        sel: done && examMode0 && i === st.pick,
        good: done && !examMode0 && i === q.correct,
        bad: done && !examMode0 && i === st.pick && i !== q.correct,
        mute: done && (examMode0 ? i !== st.pick : (i !== q.correct && i !== st.pick))
      };
    };
    v.options = (q.options || []).map(function (txt, i) { return Object.assign({ letter: LETTERS[i], text: txt, i: i }, st8(i)); });
    v.vfBtns = ['Vrai', 'Faux'].map(function (label, i) { return Object.assign({ label: label, i: i }, st8(i)); });

    v.calcDisplay = st.calc || '—';
    v.calcOpen = !done;
    v.keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '⌫'];

    v.texteOpen = !done; v.texteDone = done; v.texteVal = st.texte;

    var holes = (q.svg || '').replace(/(<[^>]*data-hole="[^"]*"[^>]*)>/g, function (m, g) { return g + ' opacity="0">'; });
    v.memvizSvg = q.type === 'memviz' ? (st.revealed ? q.svg : holes) : '';

    v.showValidate = !done && (q.type === 'calc' || q.type === 'texte' || q.type === 'memviz');
    v.validateLabel = q.type === 'memviz' ? (st.revealed ? "Je l'ai mémorisé" : 'Révéler') : 'Valider';
    v.showSelfGrade = q.type === 'texte' && ans === 'reveal';
    v.showNext = done && q.type !== 'texte';
    v.nextLabel = st.qi + 1 >= st.quiz.items.length ? (examMode ? 'Voir le résultat' : 'Terminer') : 'Suivante';
    v.showHint = !done && (q.type === 'qcm' || q.type === 'vf');
  }

  var res = st.results, n = res.length || 1, okN = res.filter(function (r) { return r.ok; }).length;
  var pct = Math.round(100 * okN / n);
  v.donePct = pct; v.doneRatio = okN + ' / ' + res.length; v.doneKo = res.length - okN;
  v.doneXp = okN * 10;
  var meta = st.quiz ? st.quiz.meta : { kind: 'daily', title: '' };
  v.doneKicker = (meta.title || '').toUpperCase();
  v.doneTitle = meta.kind === 'diag' ? 'Diagnostic terminé.' : (pct >= 70 ? 'Belle série.' : 'Série terminée.');
  v.doneNote = meta.kind === 'diag'
    ? 'Vos révisions démarrent sur vos deux pôles les plus fragiles. Vous pourrez ajuster à tout moment.'
    : (v.doneKo > 0 ? v.doneKo + ' question(s) reviennent demain, puis de plus en plus tard à chaque réussite.'
      : 'Aucune erreur : ces questions reviendront beaucoup plus tard.');
  v.doneCta = meta.kind === 'diag' ? 'Voir mon plan' : 'Enchaîner 5 questions';
  v.doneIsDiag = meta.kind === 'diag';

  v.examLabel = (meta.label || '').toUpperCase();
  v.examVerdict = pct >= 60 ? 'Admis.' : 'Sous le seuil de 60 %.';
  var byPole = {};
  res.forEach(function (r) {
    var p = r.pole || '—'; byPole[p] = byPole[p] || { n: 0, ok: 0 }; byPole[p].n++; if (r.ok) byPole[p].ok++;
  });
  v.examByPole = Object.keys(byPole).map(function (p) {
    return { label: p, pct: Math.round(100 * byPole[p].ok / byPole[p].n), ratio: byPole[p].ok + '/' + byPole[p].n };
  });

  var weak = pNames.map(function (p) { return { p: p, pct: pctOf(p) }; }).sort(function (a, b) { return a.pct - b.pct; }).slice(0, 3);
  v.weakChips = weak.map(function (w) { return { label: w.p, pct: w.pct }; });

  var R = 130, cx = 150, cy = 150;
  var pts = pNames.map(function (p, i) {
    var a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, pNames.length);
    var r = R * Math.max(0.12, pctOf(p) / 100);
    return { x: +(cx + r * Math.cos(a)).toFixed(1), y: +(cy + r * Math.sin(a)).toFixed(1) };
  });
  v.radarPts = pts.map(function (p) { return p.x + ',' + p.y; }).join(' ');
  v.radarDots = pts;

  return v;
}

// ---- markup helpers --------------------------------------------------------
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function tplOption(o) {
  var out = '';
  if (o.pending) out += '<button data-action="answerQcm" data-i="' + o.i + '" class="hv-b" style="display:flex;gap:13px;align-items:flex-start;text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--ink);cursor:pointer;"><span style="font:400 15px Newsreader,serif;color:var(--acc);">' + o.letter + '</span><span>' + esc(o.text) + '</span></button>';
  if (o.good) out += '<div style="display:flex;gap:13px;align-items:flex-start;border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--on);background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 12s linear infinite,kfPop .3s ease both;"><span style="font:400 15px Newsreader,serif;opacity:.75;">' + o.letter + '</span><span>' + esc(o.text) + '</span></div>';
  if (o.bad) out += '<div style="display:flex;gap:13px;align-items:flex-start;border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--warn);border:1px solid var(--warn);"><span style="font:400 15px Newsreader,serif;">' + o.letter + '</span><span>' + esc(o.text) + '</span></div>';
  if (o.mute) out += '<div style="display:flex;gap:13px;align-items:flex-start;border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--ink3);border:1px solid var(--line);"><span style="font:400 15px Newsreader,serif;">' + o.letter + '</span><span>' + esc(o.text) + '</span></div>';
  if (o.sel) out += '<div style="display:flex;gap:13px;align-items:flex-start;border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--ink);border:1px solid var(--ink3);background:var(--panel2);"><span style="font:400 15px Newsreader,serif;color:var(--ink3);">' + o.letter + '</span><span>' + esc(o.text) + '</span></div>';
  return out;
}
function tplVf(b) {
  var out = '';
  if (b.pending) out += '<button data-action="answerVf" data-i="' + b.i + '" class="hv-b" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:26px 0;font:400 25px Newsreader,serif;color:var(--ink);cursor:pointer;">' + esc(b.label) + '</button>';
  if (b.good) out += '<div style="flex:1;border-radius:22px;padding:26px 0;text-align:center;font:400 25px Newsreader,serif;color:var(--on);background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 12s linear infinite;">' + esc(b.label) + '</div>';
  if (b.bad) out += '<div style="flex:1;border-radius:22px;padding:26px 0;text-align:center;font:400 25px Newsreader,serif;color:var(--warn);border:1px solid var(--warn);">' + esc(b.label) + '</div>';
  if (b.mute) out += '<div style="flex:1;border-radius:22px;padding:26px 0;text-align:center;font:400 25px Newsreader,serif;color:var(--dim);border:1px solid var(--line);">' + esc(b.label) + '</div>';
  if (b.sel) out += '<div style="flex:1;border-radius:22px;padding:26px 0;text-align:center;font:400 25px Newsreader,serif;color:var(--ink);border:1px solid var(--ink3);background:var(--panel2);">' + esc(b.label) + '</div>';
  return out;
}
function tplCalc(v) {
  var keys = v.keys.map(function (k) {
    return '<button data-action="calcKey" data-k="' + esc(k) + '" class="hv-a" style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px 0;font:500 17px \'JetBrains Mono\',monospace;color:var(--ink);cursor:pointer;">' + esc(k) + '</button>';
  }).join('');
  return '<div style="margin-top:22px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;">' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">VOTRE RÉPONSE</div>' +
    '<div style="display:flex;align-items:baseline;gap:10px;margin-top:10px;border-bottom:2px solid var(--acc);padding-bottom:8px;">' +
    '<div style="flex:1;font:500 30px \'JetBrains Mono\',monospace;letter-spacing:-.02em;">' + esc(v.calcDisplay) + '</div>' +
    '<div style="font:500 15px \'JetBrains Mono\',monospace;color:var(--ink3);">' + esc(v.qUnit) + '</div></div>' +
    (v.calcOpen ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:16px;">' + keys + '</div>' : '') +
    '</div>';
}
function tplTexte(v) {
  var out = '<div style="margin-top:20px;">';
  if (v.texteOpen) out += '<textarea data-texte-input placeholder="Structurez votre réponse en 4-5 phrases…" style="width:100%;box-sizing:border-box;min-height:150px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px;font:400 13px/1.65 \'Space Grotesk\',sans-serif;color:var(--ink);resize:none;">' + esc(v.texteVal) + '</textarea>';
  if (v.texteDone) out += '<div style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px;font:400 12.5px/1.7 \'Space Grotesk\',sans-serif;color:var(--ink2);">' + esc(v.texteVal) + '</div>' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--acc);margin:18px 0 8px;">RÉPONSE MODÈLE</div>' +
    '<div style="font:400 13px/1.75 \'Space Grotesk\',sans-serif;color:var(--ink);">' + esc(v.qModele) + '</div>';
  out += '</div>';
  return out;
}

function confettiHtml() {
  var pieces = [
    ['8%', '0', '7px', '12px', '2px', '#b9dd7a', '2.4s', '.05s'],
    ['18%', '0', '6px', '10px', '2px', '#e6c76a', '2.8s', '.3s'],
    ['28%', '0', '8px', '8px', '50%', '#8fd0b0', '2.2s', '.18s'],
    ['37%', '0', '6px', '13px', '2px', '#e6a06a', '3s', '.5s'],
    ['46%', '0', '7px', '11px', '2px', '#b9dd7a', '2.6s', '.1s'],
    ['55%', '0', '9px', '9px', '50%', '#e6c76a', '2.9s', '.42s'],
    ['64%', '0', '6px', '12px', '2px', '#8fd0b0', '2.3s', '.24s'],
    ['73%', '0', '7px', '10px', '2px', '#b9dd7a', '3.1s', '.6s'],
    ['82%', '0', '8px', '8px', '50%', '#e6a06a', '2.5s', '.34s'],
    ['91%', '0', '6px', '12px', '2px', '#e6c76a', '2.7s', '.14s']
  ];
  return pieces.map(function (p) {
    return '<span style="position:absolute;left:' + p[0] + ';top:' + p[1] + ';width:' + p[2] + ';height:' + p[3] + ';border-radius:' + p[4] + ';background:' + p[5] + ';animation:kfFall ' + p[6] + ' linear ' + p[7] + ' both;"></span>';
  }).join('');
}

function tplOnb(v) {
  var out = '<div style="flex:1;display:flex;flex-direction:column;padding:64px 26px 40px;overflow:auto;">' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">DOSSIER CGP · ' + esc(v.onbStepLabel) + '</div>';
  if (v.onb0) {
    out += '<div style="font:300 42px/1.06 Newsreader,serif;letter-spacing:-.03em;margin-top:20px;">Préparez la<br><span style="font-style:italic;background:linear-gradient(100deg,var(--acc),var(--gold),var(--acc2),var(--acc));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:kfSweep 9s linear infinite;">certification</span><br>en dix minutes par jour.</div>' +
      '<div style="font:400 13.5px/1.7 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:18px;">905 questions, 44 fiches, 7 pôles. L\'application choisit à votre place ce qu\'il faut revoir.</div>' +
      '<div style="margin-top:auto;display:flex;flex-direction:column;gap:10px;">' +
      '<button data-action="onbNext" style="border:none;border-radius:999px;padding:17px;font:600 14px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Commencer</button>' +
      '<button data-action="goHome" style="background:none;border:none;padding:12px;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--ink3);cursor:pointer;">Passer</button></div>';
  }
  if (v.onb1) {
    var lvs = v.levels.map(function (lv, i) {
      return '<button data-action="pickLevel" data-idx="' + i + '" class="hv-a" style="display:flex;align-items:center;gap:14px;text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:17px;cursor:pointer;color:var(--ink);">' +
        '<span style="font:400 22px Newsreader,serif;color:var(--acc);">' + lv.n + '</span>' +
        '<span style="flex:1;"><span style="display:block;font:500 14px \'Space Grotesk\',sans-serif;">' + esc(lv.title) + '</span><span style="display:block;font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:3px;">' + esc(lv.sub) + '</span></span>' +
        (lv.on ? '<span style="width:9px;height:9px;border-radius:50%;background:var(--acc);"></span>' : '') + '</button>';
    }).join('');
    out += '<div style="font:300 34px/1.12 Newsreader,serif;letter-spacing:-.025em;margin-top:20px;">Où en êtes-vous ?</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-top:24px;">' + lvs + '</div>' +
      '<div style="margin-top:auto;"><button data-action="onbNext" style="width:100%;border:none;border-radius:999px;padding:17px;font:600 14px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Continuer</button></div>';
  }
  if (v.onb2) {
    var chips = v.poleChips.map(function (p) {
      return '<span style="border:1px solid var(--line);border-radius:999px;padding:7px 12px;font:500 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);">' + esc(p.label) + '</span>';
    }).join('');
    out += '<div style="font:300 34px/1.12 Newsreader,serif;letter-spacing:-.025em;margin-top:20px;">Cinq questions pour situer votre niveau.</div>' +
      '<div style="font:400 13.5px/1.7 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:16px;">Tirées de pôles différents. Aucune conséquence sur votre score : elles servent à calibrer vos révisions.</div>' +
      '<div style="margin:26px 0 0;display:flex;flex-wrap:wrap;gap:8px;">' + chips + '</div>' +
      '<div style="margin-top:auto;"><button data-action="startDiag" style="width:100%;border:none;border-radius:999px;padding:17px;font:600 14px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Lancer le diagnostic</button></div>';
  }
  out += '</div>';
  return out;
}

function tplHome(v) {
  var weak = v.weakChips.map(function (w) {
    return '<button data-action="weakGo" data-pole="' + esc(w.label) + '" class="hv-a" style="background:none;border:1px solid var(--line);border-radius:999px;padding:8px 13px;font:500 12px \'Space Grotesk\',sans-serif;color:var(--ink);cursor:pointer;">' + esc(w.label) + ' <span style="font-family:\'JetBrains Mono\',monospace;font-size:10.5px;color:var(--warn);">' + w.pct + '</span></button>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">CGP</div>' +
    '<div style="display:flex;align-items:center;gap:14px;">' +
    '<div style="display:flex;align-items:center;gap:7px;font:500 10.5px \'JetBrains Mono\',monospace;color:var(--acc);"><span style="width:7px;height:7px;border-radius:50%;background:var(--acc);animation:kfBreathe 2.6s ease-in-out infinite;"></span>JOUR ' + v.streak + '</div>' +
    '<button data-action="toggleTheme" style="background:none;border:1px solid var(--line);border-radius:999px;width:28px;height:28px;color:var(--ink3);font-size:12px;cursor:pointer;">' + v.themeIcon + '</button></div></div>' +
    '<div style="padding:24px 24px 0;"><div style="font:300 42px/1.02 Newsreader,serif;letter-spacing:-.025em;">' + esc(v.greeting) + '<br><span style="font-style:italic;background:linear-gradient(100deg,var(--acc),var(--gold),var(--acc2),var(--acc));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:kfSweep 9s linear infinite;">' + esc(v.userName) + '</span></div></div>' +
    '<div style="margin:30px 24px 0;border-radius:24px;padding:22px;background:var(--panel);border:1px solid var(--line);display:flex;flex-direction:column;gap:18px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div>' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.16em;color:var(--ink3);">DÉFI DU JOUR</div>' +
    '<div style="font:300 40px/1 Newsreader,serif;margin-top:10px;">5 <span style="font-size:16px;font-family:\'Space Grotesk\',sans-serif;font-weight:500;color:var(--ink2);">questions</span></div></div>' +
    '<div style="width:58px;height:58px;border-radius:50%;background:conic-gradient(var(--acc) 0turn ' + v.dailyTurn + ',var(--line) ' + v.dailyTurn + ' 1turn);display:flex;align-items:center;justify-content:center;"><div style="width:46px;height:46px;border-radius:50%;background:var(--panel);display:flex;align-items:center;justify-content:center;font:500 12px \'JetBrains Mono\',monospace;">' + v.dailyPct + '%</div></div></div>' +
    '<div style="height:3px;border-radius:3px;background:var(--line);overflow:hidden;"><div style="width:62%;height:3px;background:linear-gradient(90deg,var(--acc2),var(--acc));transform-origin:left;animation:kfFill 1.1s cubic-bezier(.16,1,.3,1) both;"></div></div>' +
    '<button data-action="startDaily" style="border:none;background:var(--acc);color:var(--on);border-radius:999px;padding:14px;text-align:center;font:600 13.5px \'Space Grotesk\',sans-serif;cursor:pointer;animation:kfGlow 3.2s ease-in-out infinite;">Commencer · 3 min</button></div>' +
    '<div style="margin:26px 24px 0;display:flex;align-items:flex-end;gap:22px;">' +
    '<div><div style="font:300 52px/0.9 Newsreader,serif;letter-spacing:-.03em;">' + v.mastery + '<span style="font-size:19px;">%</span></div><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:6px;">MAÎTRISE</div></div>' +
    '<button data-action="goSrs" style="background:none;border:none;border-left:1px solid var(--line);padding:0 0 0 22px;text-align:left;cursor:pointer;"><div style="font:300 52px/0.9 Newsreader,serif;letter-spacing:-.03em;color:var(--warn);">' + v.dueCount + '</div><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:6px;">À REVOIR</div></button></div>' +
    '<div style="margin:26px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">POINTS FAIBLES</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">' + weak + '</div></div>' +
    '<div style="margin:26px 24px 0;display:flex;gap:10px;">' +
    '<button data-action="goBrowse" class="hv-a" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;text-align:left;cursor:pointer;color:var(--ink);"><div style="font:300 26px/1 Newsreader,serif;">19</div><div style="font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:7px;">Catégories</div></button>' +
    '<button data-action="goExamPick" class="hv-a" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;text-align:left;cursor:pointer;color:var(--ink);"><div style="font:300 26px/1 Newsreader,serif;">40</div><div style="font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:7px;">Examen blanc</div></button></div>' +
    '<div style="height:26px;"></div></div>';
}

function tplBrowse(v) {
  var poles = v.poles.map(function (p) {
    var cats = p.cats.map(function (c) {
      return '<button data-action="catGo" data-cat="' + esc(c.id) + '" class="hv-c" style="width:100%;background:none;border:none;padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:400 12.5px/1.4 \'Space Grotesk\',sans-serif;">' + esc(c.label) + '</span><span style="font:500 10px \'JetBrains Mono\',monospace;color:var(--dim);">' + esc(c.badge) + '</span></button>';
    }).join('');
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden;">' +
      '<button data-action="poleToggle" data-pole="' + esc(p.label) + '" style="width:100%;background:none;border:none;padding:16px;display:flex;align-items:center;gap:12px;cursor:pointer;color:var(--ink);text-align:left;">' +
      '<span style="flex:1;font:500 13.5px \'Space Grotesk\',sans-serif;">' + esc(p.label) + '</span>' +
      '<span style="width:52px;height:4px;border-radius:3px;background:var(--line);overflow:hidden;"><span style="display:block;width:' + p.pct + '%;height:4px;background:linear-gradient(90deg,var(--acc2),var(--acc));"></span></span>' +
      '<span style="font:500 10.5px \'JetBrains Mono\',monospace;color:var(--ink3);width:22px;text-align:right;">' + p.pct + '</span></button>' +
      (p.open ? '<div style="border-top:1px solid var(--line);padding:6px 0;">' + cats + '</div>' : '') + '</div>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">BANQUE</div>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;">Sept <span style="font-style:italic;">pôles</span></div></div>' +
    '<div style="margin:22px 24px 0;display:flex;flex-direction:column;gap:10px;">' + poles + '</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplCat(v) {
  var subs = v.subs.map(function (s) {
    return '<button data-action="subGo" data-sub="' + esc(s.id) + '"' + (s.theory ? ' data-theory="' + esc(s.theory) + '"' : '') + ' class="hv-a" style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:500 13px/1.4 \'Space Grotesk\',sans-serif;">' + esc(s.label) + '</span><span style="font:500 10px \'JetBrains Mono\',monospace;color:var(--dim);letter-spacing:.08em;">' + esc(s.badge) + '</span></button>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><button data-action="goBrowse" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; ' + esc(v.catPole) + '</button>' +
    '<div style="font:300 32px/1.14 Newsreader,serif;letter-spacing:-.025em;margin-top:16px;">' + esc(v.catLabel) + '</div></div>' +
    '<div style="margin:20px 24px 0;display:flex;flex-direction:column;gap:9px;">' + subs + '</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplQuiz(v) {
  var mid = '<div style="display:flex;justify-content:space-between;margin-top:16px;font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);"><div>' + esc(v.qCat) + '</div><div style="color:var(--acc);">' + esc(v.qTypeLabel) + '</div></div>' +
    '<div style="font:300 25px/1.3 Newsreader,serif;letter-spacing:-.01em;margin-top:16px;text-wrap:pretty;">' + esc(v.qText) + '</div>';
  if (v.qHasSvg) mid += '<div style="margin-top:16px;border-radius:16px;overflow:hidden;background:#faf8f3;">' + v.qSvg + '</div>';
  if (v.isQcm) mid += '<div style="display:flex;flex-direction:column;gap:9px;margin-top:22px;">' + v.options.map(tplOption).join('') + '</div>';
  if (v.isVf) mid += '<div style="display:flex;gap:12px;margin-top:26px;">' + v.vfBtns.map(tplVf).join('') + '</div>';
  if (v.isCalc) mid += tplCalc(v);
  if (v.isTexte) mid += tplTexte(v);
  if (v.isMemviz) mid += '<div style="margin-top:18px;border-radius:16px;overflow:hidden;background:#faf8f3;">' + v.memvizSvg + '</div>';
  if (v.examAnswered) mid += '<div style="margin-top:24px;padding-top:18px;border-top:1px solid var(--line);animation:kfIn .3s ease both;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">RÉPONSE ENREGISTRÉE · CORRECTION À LA FIN DE L\'ÉPREUVE</div></div>';
  if (v.answered) {
    mid += '<div style="margin-top:24px;padding-top:18px;border-top:1px solid var(--line);animation:kfIn .3s ease both;">';
    if (v.wasOk) mid += '<div style="font:300 30px/1 Newsreader,serif;color:var(--acc);">Exact. <span style="font:500 12px \'JetBrains Mono\',monospace;">+10 XP</span></div>';
    if (v.wasKo) mid += '<div style="font:300 30px/1 Newsreader,serif;color:var(--warn);">Raté. <span style="font:500 12px \'JetBrains Mono\',monospace;">' + esc(v.koNote) + '</span></div>';
    mid += '<div style="font:400 13px/1.75 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:12px;text-wrap:pretty;">' + esc(v.qExplain) + '</div>' +
      '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:14px;">REVOIR DANS ' + v.nextIn + ' J</div></div>';
  }
  mid += '<div style="height:20px;"></div>';

  var footer = '<div style="padding:12px 24px 40px;border-top:1px solid var(--line);background:var(--bg);">';
  if (v.showValidate) footer += '<button data-action="validate" style="width:100%;border:none;border-radius:999px;padding:16px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">' + esc(v.validateLabel) + '</button>';
  if (v.showSelfGrade) footer += '<div style="display:flex;gap:10px;"><button data-action="selfKo" style="flex:1;background:none;border:1px solid var(--warn);border-radius:999px;padding:15px;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--warn);cursor:pointer;">À revoir</button><button data-action="selfOk" style="flex:1;background:none;border:1px solid var(--acc);border-radius:999px;padding:15px;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">Maîtrisé</button></div>';
  if (v.showNext) footer += '<button data-action="next" style="width:100%;border:none;border-radius:999px;padding:16px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">' + esc(v.nextLabel) + '</button>';
  if (v.showHint) footer += '<div style="text-align:center;font:400 11px \'Space Grotesk\',sans-serif;color:var(--ink3);padding:4px 0;">Touchez une réponse.</div>';
  footer += '</div>';

  return '<div style="flex:1;display:flex;flex-direction:column;min-height:0;">' +
    '<div style="padding:56px 24px 0;"><div style="display:flex;align-items:center;gap:12px;">' +
    '<button data-action="quitQuiz" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--ink3);cursor:pointer;">Fermer</button>' +
    '<div style="flex:1;text-align:center;font:500 11px \'Space Grotesk\',sans-serif;color:var(--ink2);">' + esc(v.quizTitle) + '</div>' +
    '<div style="font:500 10.5px \'JetBrains Mono\',monospace;color:var(--ink3);">' + esc(v.quizPos) + '</div></div>' +
    '<div style="margin-top:14px;height:3px;border-radius:3px;background:var(--line);overflow:hidden;"><div style="width:' + v.quizPct + '%;height:3px;background:linear-gradient(90deg,var(--acc2),var(--acc),var(--gold));transition:width .35s cubic-bezier(.16,1,.3,1);"></div></div></div>' +
    '<div style="flex:1;overflow:auto;min-height:0;padding:0 24px;">' + mid + '</div>' +
    footer + '</div>';
}

function tplDone(v) {
  return '<div style="flex:1;display:flex;flex-direction:column;padding:64px 26px 40px;overflow:auto;">' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">' + esc(v.doneKicker) + '</div>' +
    '<div style="font:300 38px/1.08 Newsreader,serif;letter-spacing:-.03em;margin-top:16px;">' + esc(v.doneTitle) + '</div>' +
    '<div style="margin:30px auto 0;position:relative;width:196px;height:196px;">' +
    '<div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(var(--acc2),var(--acc),var(--gold),var(--warn),var(--acc2));animation:kfSpin 22s linear infinite;"></div>' +
    '<div style="position:absolute;inset:11px;border-radius:50%;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
    '<div style="font:300 60px/1 Newsreader,serif;letter-spacing:-.03em;">' + v.donePct + '<span style="font-size:20px;">%</span></div>' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:6px;">' + esc(v.doneRatio) + '</div></div></div>' +
    '<div style="margin-top:26px;display:flex;justify-content:space-between;">' +
    '<div><div style="font:300 28px/1 Newsreader,serif;color:var(--acc);">+' + v.doneXp + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">XP GAGNÉS</div></div>' +
    '<div><div style="font:300 28px/1 Newsreader,serif;">' + v.doneKo + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">À REVOIR</div></div>' +
    '<div><div style="font:300 28px/1 Newsreader,serif;">' + v.streak + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">JOURS</div></div></div>' +
    '<div style="font:400 13px/1.7 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:22px;">' + esc(v.doneNote) + '</div>' +
    '<div style="margin-top:auto;display:flex;flex-direction:column;gap:10px;">' +
    '<button data-action="doneAgain" style="border:none;border-radius:999px;padding:17px;font:600 14px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">' + esc(v.doneCta) + '</button>' +
    '<button data-action="goHome" style="background:none;border:1px solid var(--line);border-radius:999px;padding:15px;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--ink2);cursor:pointer;">Retour à l\'accueil</button></div></div>';
}

function tplExamPick(v) {
  var lvs = v.examLevels.map(function (e) {
    return '<button data-action="examGo" data-key="' + esc(e.key) + '" data-label="' + esc(e.label) + '" class="hv-a" style="background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;align-items:center;gap:14px;cursor:pointer;color:var(--ink);text-align:left;">' +
      '<span style="font:300 30px/1 Newsreader,serif;color:var(--acc);">' + e.n + '</span>' +
      '<span style="flex:1;"><span style="display:block;font:500 14px \'Space Grotesk\',sans-serif;">' + esc(e.label) + '</span><span style="display:block;font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:3px;">' + esc(e.sub) + '</span></span>' +
      '<span style="font:500 10px \'JetBrains Mono\',monospace;color:var(--ink3);">' + esc(e.best) + '</span></button>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;padding:58px 24px 0;">' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">EXAMEN BLANC</div>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;">Trois <span style="font-style:italic;">niveaux</span></div>' +
    '<div style="font:400 13px/1.7 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:12px;">40 questions tirées au sort, sans correction avant la fin. Seuil de réussite : 60 %.</div>' +
    '<div style="margin-top:24px;display:flex;flex-direction:column;gap:10px;">' + lvs + '</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplExamResult(v) {
  var poles = v.examByPole.map(function (p) {
    return '<div style="display:flex;align-items:center;gap:12px;"><div style="flex:1;font:400 12.5px \'Space Grotesk\',sans-serif;">' + esc(p.label) + '</div>' +
      '<div style="width:80px;height:5px;border-radius:3px;background:var(--line);overflow:hidden;"><div style="width:' + p.pct + '%;height:5px;background:linear-gradient(90deg,var(--acc2),var(--acc));transform-origin:left;animation:kfFill 1s cubic-bezier(.16,1,.3,1) both;"></div></div>' +
      '<div style="width:44px;text-align:right;font:500 10.5px \'JetBrains Mono\',monospace;color:var(--ink3);">' + esc(p.ratio) + '</div></div>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;padding:58px 24px 0;">' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">RÉSULTAT · ' + esc(v.examLabel) + '</div>' +
    '<div style="font:300 38px/1.08 Newsreader,serif;letter-spacing:-.03em;margin-top:14px;">' + esc(v.examVerdict) + '</div>' +
    '<div style="margin-top:22px;display:flex;align-items:flex-end;gap:20px;">' +
    '<div><div style="font:300 62px/0.9 Newsreader,serif;letter-spacing:-.03em;color:var(--acc);">' + v.donePct + '<span style="font-size:22px;">%</span></div><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:6px;">SCORE</div></div>' +
    '<div style="border-left:1px solid var(--line);padding-left:20px;"><div style="font:300 34px/1 Newsreader,serif;">' + esc(v.doneRatio) + '</div><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:8px;">BONNES RÉPONSES</div></div></div>' +
    '<div style="margin-top:26px;font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">PAR PÔLE</div>' +
    '<div style="margin-top:14px;display:flex;flex-direction:column;gap:12px;">' + poles + '</div>' +
    '<div style="margin:26px 0 0;display:flex;flex-direction:column;gap:10px;">' +
    '<button data-action="reviewExam" style="border:none;border-radius:999px;padding:16px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Revoir mes ' + v.doneKo + ' erreurs</button>' +
    '<button data-action="goHome" style="background:none;border:1px solid var(--line);border-radius:999px;padding:15px;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--ink2);cursor:pointer;">Retour à l\'accueil</button></div>' +
    '<div style="height:26px;"></div></div>';
}

function tplSrs(v) {
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">MÉMOIRE</div>' +
    '<div style="font:300 38px/1.08 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;"><span style="font-style:italic;">' + v.dueCount + '</span> questions<br>arrivent à échéance.</div></div>' +
    '<div style="margin:28px auto 0;position:relative;width:200px;height:200px;">' +
    '<div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(var(--acc2),var(--acc),var(--gold),var(--warn),var(--acc2));animation:kfSpin 22s linear infinite;"></div>' +
    '<div style="position:absolute;inset:11px;border-radius:50%;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
    '<div style="font:300 58px/1 Newsreader,serif;letter-spacing:-.03em;">' + v.dueCount + '</div>' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.16em;color:var(--ink3);margin-top:8px;">DUES AUJOURD\'HUI</div></div></div>' +
    '<button data-action="startSrs" style="margin:30px 24px 0;width:calc(100% - 48px);border:none;border-radius:999px;padding:18px;font:600 14px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Commencer</button>' +
    '<div style="margin:30px 24px 0;display:flex;justify-content:space-between;">' +
    '<div><div style="font:300 30px/1 Newsreader,serif;">' + v.learnCount + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:6px;">EN COURS</div></div>' +
    '<div><div style="font:300 30px/1 Newsreader,serif;color:var(--acc);">' + v.masteredCount + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:6px;">MAÎTRISÉES</div></div>' +
    '<div><div style="font:300 30px/1 Newsreader,serif;color:var(--dim);">' + v.unseenCount + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:6px;">JAMAIS VUES</div></div></div>' +
    '<div style="margin:26px 24px 0;padding-top:18px;border-top:1px solid var(--line);font:500 10.5px \'JetBrains Mono\',monospace;letter-spacing:.1em;color:var(--ink3);">1 · 3 · 7 · 16 · 35 · 90 JOURS</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplCourses(v) {
  var fiches = v.fiches.map(function (f) {
    return '<button data-action="ficheGo" data-fiche="' + esc(f.key) + '" class="hv-a" style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;color:var(--ink);text-align:left;">' +
      '<span style="flex:1;"><span style="display:block;font:500 13px/1.35 \'Space Grotesk\',sans-serif;">' + esc(f.title) + '</span><span style="display:block;font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.1em;color:var(--dim);margin-top:5px;">' + esc(f.meta) + '</span></span>' +
      '<span style="font:400 15px Newsreader,serif;color:var(--acc);">&#8250;</span></button>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">FICHES</div>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;">' + v.ficheCount + ' <span style="font-style:italic;">cours</span></div></div>' +
    '<div style="margin:22px 24px 0;display:flex;flex-direction:column;gap:9px;">' + fiches + '</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplFiche(v) {
  var sections = v.ficheSections.map(function (s) {
    return '<div style="margin-top:24px;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--acc);">' + esc(s.h) + '</div>' +
      '<div style="font:400 13px/1.8 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:9px;white-space:pre-line;text-wrap:pretty;">' + esc(s.body) + '</div></div>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:56px 26px 0;"><button data-action="goCourses" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; Fiches</button>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);"><div>' + esc(v.ficheIdx) + '</div><div style="color:var(--acc);">' + v.ficheMin + ' MIN</div></div>' +
    '<div style="font:300 32px/1.12 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;">' + esc(v.ficheTitle) + '</div>' +
    '<div style="margin-top:16px;height:1px;background:linear-gradient(90deg,var(--acc),var(--acc2),transparent);"></div>' +
    '<div style="font:400 10px/1.6 \'JetBrains Mono\',monospace;color:var(--dim);margin-top:14px;">' + esc(v.ficheSource) + '</div></div>' +
    '<div style="padding:6px 26px 0;">' + sections + '</div>' +
    '<div style="padding:26px 26px 30px;"><button data-action="startFicheQuiz" style="width:100%;border:none;border-radius:999px;padding:17px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Tester la fiche</button></div></div>';
}

function tplProgress(v) {
  var dots = v.radarDots.map(function (d) { return '<circle cx="' + d.x + '" cy="' + d.y + '" r="3.5" fill="var(--acc)"></circle>'; }).join('');
  var poles = v.poles.map(function (p) {
    return '<div style="display:flex;align-items:center;gap:12px;"><div style="flex:1;font:400 12.5px \'Space Grotesk\',sans-serif;">' + esc(p.label) + '</div>' +
      '<div style="width:92px;height:5px;border-radius:3px;background:var(--line);overflow:hidden;"><div style="width:' + p.pct + '%;height:5px;background:linear-gradient(90deg,var(--acc2),var(--acc));transform-origin:left;animation:kfFill 1.1s cubic-bezier(.16,1,.3,1) both;"></div></div>' +
      '<div style="width:26px;text-align:right;font:500 10.5px \'JetBrains Mono\',monospace;color:var(--ink3);">' + p.pct + '</div></div>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">PROGRESSION</div>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;">' + v.mastery + ' <span style="font-size:18px;">%</span> de <span style="font-style:italic;">maîtrise</span></div></div>' +
    '<div style="padding:14px 20px 0;"><svg viewBox="0 0 300 300" style="width:100%;height:auto;">' +
    '<polygon points="150,20 262,85 262,215 150,280 38,215 38,85" fill="none" stroke="var(--line)" stroke-width="1"></polygon>' +
    '<polygon points="150,63 225,106 225,193 150,237 75,193 75,106" fill="none" stroke="var(--line)" stroke-width="1"></polygon>' +
    '<polygon points="150,107 187,128 187,171 150,193 113,171 113,128" fill="none" stroke="var(--line)" stroke-width="1"></polygon>' +
    '<polygon points="' + v.radarPts + '" fill="rgba(185,221,122,.2)" stroke="var(--acc)" stroke-width="2"></polygon>' + dots + '</svg></div>' +
    '<div style="margin:6px 24px 0;display:flex;flex-direction:column;gap:12px;">' + poles + '</div>' +
    '<div style="margin:26px 24px 0;padding-top:18px;border-top:1px solid var(--line);display:flex;justify-content:space-between;">' +
    '<div><div style="font:300 28px/1 Newsreader,serif;">' + v.xp + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">XP TOTAL</div></div>' +
    '<div><div style="font:300 28px/1 Newsreader,serif;">' + v.answeredCount + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">QUESTIONS VUES</div></div>' +
    '<div><div style="font:300 28px/1 Newsreader,serif;">' + v.streak + '</div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">JOURS DE SUITE</div></div></div>' +
    '<div style="height:26px;"></div></div>';
}

function tplProfile(v) {
  var notifSwitch = v.notifOn
    ? '<span style="width:42px;height:24px;border-radius:999px;background:var(--acc);display:flex;align-items:center;justify-content:flex-end;padding:2px;box-sizing:border-box;"><span style="width:20px;height:20px;border-radius:50%;background:var(--on);"></span></span>'
    : '<span style="width:42px;height:24px;border-radius:999px;background:var(--line);display:flex;align-items:center;padding:2px;box-sizing:border-box;"><span style="width:20px;height:20px;border-radius:50%;background:var(--dim);"></span></span>';
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">PROFIL</div>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;">' + esc(v.userName) + '</div>' +
    '<div style="font:400 12.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:8px;">Niveau ' + esc(v.levelLabel) + ' · ' + v.xp + ' XP · série de ' + v.streak + ' jours</div></div>' +
    '<div style="margin:24px 24px 0;background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden;">' +
    '<button data-action="toggleTheme" style="width:100%;background:none;border:none;border-bottom:1px solid var(--line);padding:16px;display:flex;align-items:center;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:500 13px \'Space Grotesk\',sans-serif;">Apparence</span><span style="font:500 11px \'JetBrains Mono\',monospace;color:var(--acc);">' + esc(v.themeLabel) + '</span></button>' +
    '<button data-action="toggleNotif" style="width:100%;background:none;border:none;border-bottom:1px solid var(--line);padding:16px;display:flex;align-items:center;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;"><span style="display:block;font:500 13px \'Space Grotesk\',sans-serif;">Rappel quotidien</span><span style="display:block;font:400 11px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:3px;">' + esc(v.notifSub) + '</span></span>' + notifSwitch + '</button>' +
    '<button data-action="goExamPick" style="width:100%;background:none;border:none;border-bottom:1px solid var(--line);padding:16px;display:flex;align-items:center;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:500 13px \'Space Grotesk\',sans-serif;">Examens blancs</span><span style="font:400 15px Newsreader,serif;color:var(--acc);">&#8250;</span></button>' +
    '<button data-action="restartOnb" style="width:100%;background:none;border:none;padding:16px;display:flex;align-items:center;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:500 13px \'Space Grotesk\',sans-serif;">Refaire le diagnostic</span><span style="font:400 15px Newsreader,serif;color:var(--acc);">&#8250;</span></button></div>' +
    (v.notifOn ? '<div style="margin:16px 24px 0;background:var(--panel2);border:1px solid var(--line);border-radius:18px;padding:16px;display:flex;gap:12px;align-items:flex-start;">' +
      '<div style="width:9px;height:9px;border-radius:50%;background:var(--acc);margin-top:5px;animation:kfBreathe 2.6s ease-in-out infinite;"></div>' +
      '<div><div style="font:500 12.5px \'Space Grotesk\',sans-serif;">Dossier CGP · 19:30</div><div style="font:400 12px/1.6 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:4px;">' + v.dueCount + ' questions arrivent à échéance. Trois minutes suffisent.</div></div></div>' : '') +
    '<div style="margin:20px 24px 0;padding-top:16px;border-top:1px solid var(--line);font:400 11px/1.7 \'Space Grotesk\',sans-serif;color:var(--dim);">Prototype · banque de ' + v.totalQ + ' questions et ' + v.ficheCount + ' fiches reprises de votre fichier source. La progression est enregistrée sur cet appareil.</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplTabs(v) {
  var tabs = v.tabs.map(function (t) {
    return t.on
      ? '<button data-action="goTab" data-k="' + esc(t.k) + '" style="background:var(--ink);color:var(--bg);border:none;border-radius:999px;padding:9px 14px;font:600 11px \'Space Grotesk\',sans-serif;cursor:pointer;">' + esc(t.label) + '</button>'
      : '<button data-action="goTab" data-k="' + esc(t.k) + '" style="background:none;color:var(--ink3);border:none;border-radius:999px;padding:9px 14px;font:500 11px \'Space Grotesk\',sans-serif;cursor:pointer;">' + esc(t.label) + '</button>';
  }).join('');
  return '<div style="padding:0 20px 34px;display:flex;justify-content:center;background:var(--bg);">' +
    '<div style="background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:7px;display:flex;gap:2px;">' + tabs + '</div></div>';
}

// ---- render loop -----------------------------------------------------------
var appEl, confettiEl, screenEl, tabsEl;
var lastScreenKey = null;

function ensureSkeleton() {
  appEl = document.getElementById('app');
  appEl.innerHTML = '<div id="confetti-slot"></div><div id="screen" class="scr"></div><div id="tabs-slot"></div>';
  confettiEl = document.getElementById('confetti-slot');
  screenEl = document.getElementById('screen');
  tabsEl = document.getElementById('tabs-slot');
}

function render() {
  if (!appEl) ensureSkeleton();
  var v = computeVals();
  appEl.setAttribute('data-theme', v.theme);
  confettiEl.innerHTML = v.isConfetti ? confettiHtml() : '';
  tabsEl.innerHTML = v.showTabs ? tplTabs(v) : '';

  var html = '';
  if (v.isOnb) html = tplOnb(v);
  else if (v.isHome) html = tplHome(v);
  else if (v.isBrowse) html = tplBrowse(v);
  else if (v.isCat) html = tplCat(v);
  else if (v.isQuiz) html = tplQuiz(v);
  else if (v.isDone) html = tplDone(v);
  else if (v.isExamPick) html = tplExamPick(v);
  else if (v.isExamResult) html = tplExamResult(v);
  else if (v.isSrs) html = tplSrs(v);
  else if (v.isCourses) html = tplCourses(v);
  else if (v.isFiche) html = tplFiche(v);
  else if (v.isProgress) html = tplProgress(v);
  else if (v.isProfile) html = tplProfile(v);
  screenEl.innerHTML = html;

  if (v.screenKey !== lastScreenKey) {
    lastScreenKey = v.screenKey;
    screenEl.classList.remove('kfin');
    void screenEl.offsetWidth;
    screenEl.classList.add('kfin');
  }
}

// ---- event dispatch ---------------------------------------------------------
function onAppClick(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var d = btn.dataset;
  switch (d.action) {
    case 'toggleTheme': state.theme = state.theme === 'dark' ? 'light' : 'dark'; render(); break;
    case 'toggleNotif': state.notif = !state.notif; render(); break;
    case 'goTab': go(d.k); break;
    case 'restartOnb': state.screen = 'onb'; state.onb = 0; render(); break;
    case 'onbNext': state.onb = Math.min(2, state.onb + 1); render(); break;
    case 'pickLevel': state.level = +d.idx; render(); break;
    case 'startDiag': startDiagQuiz(); break;
    case 'startDaily': startDailyQuiz(); break;
    case 'startSrs': startSrsQuiz(); break;
    case 'goHome': go('home'); break;
    case 'goBrowse': go('browse'); break;
    case 'goSrs': go('srs'); break;
    case 'goCourses': go('courses'); break;
    case 'goExamPick': go('examPick'); break;
    case 'poleToggle':
      state.openPole = state.openPole === d.pole ? null : d.pole;
      state.screen = 'browse';
      render();
      break;
    case 'catGo': state.screen = 'cat'; state.cat = d.cat; render(); break;
    case 'subGo':
      if (d.theory) { state.screen = 'fiche'; state.fiche = d.theory; render(); }
      else startCat(d.sub, 12);
      break;
    case 'ficheGo': state.screen = 'fiche'; state.fiche = d.fiche; render(); break;
    case 'startFicheQuiz': startFicheQ(state.fiche); break;
    case 'answerQcm': answerQcm(+d.i); break;
    case 'answerVf': answerVf(+d.i); break;
    case 'calcKey':
      if (d.k === '⌫') state.calc = state.calc.slice(0, -1);
      else if (d.k === '−') state.calc = state.calc.charAt(0) === '-' ? state.calc.slice(1) : '-' + state.calc;
      else state.calc = (state.calc + d.k).slice(0, 12);
      render();
      break;
    case 'validate': {
      var it = cur(); if (!it) break;
      if (it.q.type === 'calc') validateCalc();
      else if (it.q.type === 'texte') { state.ans = 'reveal'; render(); }
      else if (it.q.type === 'memviz') { if (state.revealed) grade(true); else { state.revealed = true; render(); } }
      break;
    }
    case 'selfOk': grade(true, nextQ); break;
    case 'selfKo': grade(false, nextQ); break;
    case 'next': nextQ(); break;
    case 'quitQuiz': go(state.quiz && state.quiz.meta.kind === 'exam' ? 'examPick' : 'home'); break;
    case 'doneAgain': {
      var meta = state.quiz ? state.quiz.meta : {};
      if (meta.kind === 'diag') go('progress'); else startDailyQuiz();
      break;
    }
    case 'reviewExam': {
      var keys = state.results.filter(function (r) { return !r.ok; }).map(function (r) { return r.key; });
      if (!keys.length) { go('home'); break; }
      startList(keys, { kind: 'cat', title: "Revue de l'examen" });
      break;
    }
    case 'examGo': startExam(d.key, d.label); break;
    case 'weakGo': state.screen = 'browse'; state.openPole = d.pole; render(); break;
  }
}

function waitData() {
  if (window.CGP_DATA) { seed(); state.ready = true; render(); return; }
  setTimeout(waitData, 120);
}

document.addEventListener('DOMContentLoaded', function () {
  ensureSkeleton();
  appEl.addEventListener('click', onAppClick);
  appEl.addEventListener('input', function (e) {
    if (e.target.matches('[data-texte-input]')) state.texte = e.target.value;
  });
  load();
  render();
  waitData();
});

})();
