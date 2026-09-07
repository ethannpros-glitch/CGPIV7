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
  fiche: null, level: 1, onb: 0, confetti: false, notif: true,
  orderKey: null, orderCur: null,
  buildDom: ['all'], buildTypes: ['qcm', 'vf'], buildLevel: 'all', buildN: 15,
  coursePoleSel: null, navStack: [], navDir: null
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
var _sub2cat = null;
function sub2cat() {
  if (_sub2cat) return _sub2cat;
  _sub2cat = {};
  D().CATS.forEach(function (c) { (c.sub || []).forEach(function (s) { _sub2cat[s.id] = c.id; }); });
  return _sub2cat;
}
function qIsExpert(q, d) {
  d = d || '';
  if (/(_expert|_appro|_reseau|pointilleux|_v8|holding|150bter|dutreuil|lombard|struct_|lecture_contrat|^mc_|mccorp|lux_|^ing_|^soc_|mat_regimes|scpi_)/.test(d)) return true;
  if (['spot', 'scenario', 'doc', 'open'].indexOf(q.type) >= 0) return true;
  return false;
}
var BUILD_TYPES = [
  ['qcm', 'QCM'], ['vf', 'Vrai / Faux'], ['calc', 'Calcul'], ['spot', 'Repère l’erreur'],
  ['order', 'Priorisation'], ['scenario', 'Scénario'], ['doc', 'Lecture de document'],
  ['open', 'Question ouverte'], ['texte', 'Texte libre'], ['memviz', 'Mémoire visuelle']
];
function buildPass(q, d) {
  if (state.buildTypes.indexOf(q.type) < 0) return false;
  var cat = sub2cat()[d] || d;
  if (state.buildDom.indexOf('all') < 0 && state.buildDom.indexOf(cat) < 0) return false;
  if (state.buildLevel === 'facile' && qIsExpert(q, d)) return false;
  if (state.buildLevel === 'expert' && !qIsExpert(q, d)) return false;
  return true;
}
function buildPool() {
  var pool = [];
  Object.keys(D().BANK).forEach(function (d) {
    (bank(d) || []).forEach(function (q, i) { if (buildPass(q, d)) pool.push(d + '#' + i); });
  });
  return pool;
}
function startBuilder() {
  var pool = buildPool().sort(function () { return Math.random() - 0.5; }).slice(0, state.buildN);
  startList(pool, { kind: 'custom', title: 'Session personnalisée' });
}
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
  var seedPct = { 'Les enveloppes': 82, 'Supports & actifs': 74, 'Fiscalité & transmission': 61, 'Retraite & protection': 47, 'Financement & levier': 39, 'Entreprise & ingénierie': 56, 'Métier & méthode': 68, 'Culture financière': 58 };
  var poleTotals = {};
  cats.forEach(function (c) { poleTotals[c.pole] = (poleTotals[c.pole] || 0) + bank(c.id).length; });
  poleNames().forEach(function (p) {
    var n = Math.max(5, Math.min(20, poleTotals[p] || 5));
    store.poles[p] = { n: n, ok: Math.round(n * (seedPct[p] || 60) / 100) };
  });
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
  state.navStack.push(navSnapshot());
  state.navDir = 'fwd';
  state.quiz = { items: items, meta: meta };
  state.qi = 0; state.ans = null; state.pick = null;
  state.calc = ''; state.texte = ''; state.revealed = false; state.results = [];
  state.orderKey = null; state.orderCur = null;
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
function setScreen(screen, patch) {
  if (state.screen === 'mental' && screen !== 'mental' && mentalState.timer) {
    clearInterval(mentalState.timer); mentalState.timer = null;
  }
  state.screen = screen; if (patch) Object.assign(state, patch);
}
function navSnapshot() {
  return { screen: state.screen, cat: state.cat, fiche: state.fiche, openPole: state.openPole, coursePoleSel: state.coursePoleSel };
}
function go(screen, patch) {
  setScreen(screen, patch);
  state.navStack = [];
  state.navDir = null;
  render();
}
function goChild(screen, patch) {
  state.navStack.push(navSnapshot());
  setScreen(screen, patch);
  state.navDir = 'fwd';
  render();
}
function goBack() {
  var prev = state.navStack.pop();
  if (!prev) { go('home'); return; }
  setScreen(prev.screen, prev);
  state.navDir = 'back';
  render();
}

// ---- computed view values (mirrors the design's renderVals) --------------
function computeVals() {
  var st = state, S = store || { srs: {}, poles: {}, best: {} };
  var Dd = D();
  var scr = st.screen;
  var levels = [
    { title: 'Débutant', sub: 'Je découvre les enveloppes' },
    { title: 'Intermédiaire', sub: 'Je connais les bases, je consolide' },
    { title: 'Confirmé', sub: 'Je vise le sans-faute technique' }
  ];
  var pNames = st.ready ? poleNames() : [];
  var pctOf = function (p) { return polePct(p); };

  var v = {
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
    isLabo: scr === 'labo', isMental: scr === 'mental', isBuilder: scr === 'builder',
    showTabs: ['home', 'browse', 'cat', 'srs', 'courses', 'fiche', 'coursePole', 'progress', 'profile', 'examPick', 'labo', 'mental', 'builder'].indexOf(scr) >= 0,
    mentalBest: S.mentalBest || 0,

    onb0: st.onb === 0, onb1: st.onb === 1, onb2: st.onb === 2,
    onbStepLabel: 'ÉTAPE ' + (st.onb + 1) + ' / 3',
    levels: levels.map(function (l, i) { return { n: i + 1, title: l.title, sub: l.sub, on: st.level === i }; }),
    poleChips: pNames.map(function (p) { return { label: p }; }),

    tabs: [
      { label: 'Jouer', k: 'home' }, { label: 'Réviser', k: 'srs' }, { label: 'Cours', k: 'courses' },
      { label: 'Stats', k: 'progress' }, { label: 'Profil', k: 'profile' }
    ].map(function (t) {
      var on = scr === t.k || (t.k === 'home' && (scr === 'browse' || scr === 'cat' || scr === 'examPick' || scr === 'labo' || scr === 'mental' || scr === 'builder')) || (t.k === 'courses' && (scr === 'fiche' || scr === 'coursePole'));
      return { label: t.label, k: t.k, on: on, off: !on };
    })
  };

  v.poles = pNames.map(function (p) {
    var cats = Dd.CATS.filter(function (c) { return c.pole === p; });
    var pe = S.poles && S.poles[p];
    return {
      label: p, pct: pctOf(p), open: st.openPole === p,
      ratio: pe && pe.n ? pe.ok + '/' + pe.n : '—',
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
  var theoryPole = {};
  allCats().forEach(function (c) { if (c.theory) theoryPole[c.theory] = c.pole; });
  v.fiches = tKeys.map(function (k) {
    var t = Dd.THEORY[k];
    return {
      key: k, title: t.title, icon: t.icon || '📘', pole: theoryPole[k] || '',
      meta: ((t.sections || []).length) + ' SECTIONS · ' + Math.max(2, Math.round((t.sections || []).length * 1.2)) + ' MIN'
    };
  });
  v.fichesByPole = pNames.map(function (p) {
    return { label: p, fiches: v.fiches.filter(function (f) { return f.pole === p; }) };
  }).filter(function (g) { return g.fiches.length; });
  var poleAccents = ['var(--acc)', 'var(--gold)', 'var(--acc2)', 'var(--warn)'];
  v.coursePoles = v.fichesByPole.map(function (g, i) {
    var avgPct = g.fiches.length ? pctOf(g.label) : 0;
    return { label: g.label, count: g.fiches.length, accent: poleAccents[i % poleAccents.length], pct: avgPct };
  });
  v.isCoursePole = scr === 'coursePole';
  v.coursePoleLabel = st.coursePoleSel || '';
  var selGroup = v.fichesByPole.find(function (g) { return g.label === st.coursePoleSel; });
  v.coursePoleFichesList = selGroup ? selGroup.fiches : [];
  var fi = Dd.THEORY ? Dd.THEORY[st.fiche] : null;
  v.ficheTitle = fi ? fi.title : '';
  v.ficheIcon = fi ? (fi.icon || '📘') : '📘';
  v.ficheSource = fi ? (fi.source || '') : '';
  v.ficheIdx = fi ? 'FICHE ' + (tKeys.indexOf(st.fiche) + 1) + ' / ' + tKeys.length : '';
  v.ficheMin = fi ? Math.max(2, Math.round((fi.sections || []).length * 1.2)) : 0;
  var calloutRe = /^(EXEMPLE|À RETENIR|ATTENTION|NUANCE DE CONSEIL|BON À SAVOIR|POINT DE VIGILANCE|À NE PAS DIRE AU CLIENT)\s*:?\s*/i;
  v.ficheSections = fi ? (fi.sections || []).map(function (s) {
    var paras = (s.body || '').split(/\n\n+/).map(function (p) {
      var m = p.match(calloutRe);
      return m ? { callout: true, label: m[1].toUpperCase(), text: p.slice(m[0].length) } : { callout: false, text: p };
    });
    return { h: (s.h || '').toUpperCase(), paras: paras, svg: s.svg || '' };
  }) : [];

  var exLabels = [
    { k: 'facile', label: 'Niveau 1 · Fondamentaux', sub: 'Les réflexes de base' },
    { k: 'avance', label: 'Niveau 2 · Avancé', sub: 'Cas concrets et calculs' },
    { k: 'technique', label: 'Niveau 3 · Technique', sub: "Le niveau de l'examen réel" }
  ];
  v.examLevels = exLabels.map(function (e, i) {
    return { n: i + 1, key: e.k, label: e.label, sub: e.sub, best: (S.best && S.best[e.k]) ? 'RECORD ' + S.best[e.k] + '%' : '—' };
  });

  if (st.ready) {
    var typeCounts = {};
    BUILD_TYPES.forEach(function (t) { typeCounts[t[0]] = 0; });
    Object.values(Dd.BANK).forEach(function (arr) { (arr || []).forEach(function (q) { if (typeCounts[q.type] !== undefined) typeCounts[q.type]++; }); });
    v.buildLevels = [['all', 'Tous'], ['facile', 'Facile'], ['expert', 'Expert ultime']].map(function (l) {
      return { key: l[0], label: l[1], on: st.buildLevel === l[0] };
    });
    v.buildDoms = [{ id: 'all', label: 'Tous les domaines', on: st.buildDom.indexOf('all') >= 0 }].concat(
      Dd.CATS.map(function (c) { return { id: c.id, label: c.label, on: st.buildDom.indexOf(c.id) >= 0 }; })
    );
    v.buildTypeOpts = BUILD_TYPES.map(function (t) {
      return { id: t[0], label: t[1], count: typeCounts[t[0]] || 0, on: st.buildTypes.indexOf(t[0]) >= 0 };
    });
    var avail = buildPool().length;
    v.buildMaxN = Math.max(1, Math.min(40, avail || 1));
    if (st.buildN > v.buildMaxN) st.buildN = v.buildMaxN;
    v.buildN = st.buildN;
    v.buildAvail = avail;
  }

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
    v.qExplain = q.explain || q.modele || '';
    v.qModele = q.modele || '';
    var examMode0 = st.quiz.meta.kind === 'exam';
    var graded = done && !((q.type === 'texte' || q.type === 'open') && ans === 'reveal');
    v.answered = graded && !examMode0; v.wasOk = ans === 'ok'; v.wasKo = ans === 'ko';
    v.examAnswered = graded && examMode0;
    v.koNote = st.quiz.meta.kind === 'exam' ? 'NOTÉ' : 'REVOIR DEMAIN';
    var e = S.srs[it.key];
    v.nextIn = e ? IV[e.b] : 1;
    var tl = {
      qcm: 'QCM', vf: 'VRAI / FAUX', calc: 'CALCUL', texte: 'RÉDACTION', memviz: 'MÉMORISATION',
      scenario: 'SCÉNARIO', spot: 'REPÈRE L’ERREUR', doc: 'DOCUMENT', order: 'PRIORISATION', open: 'QUESTION OUVERTE'
    };
    v.qTypeLabel = tl[q.type] || 'QUESTION';
    v.isQcm = q.type === 'qcm'; v.isVf = q.type === 'vf'; v.isCalc = q.type === 'calc';
    v.isTexte = q.type === 'texte'; v.isMemviz = q.type === 'memviz';
    v.isScenario = q.type === 'scenario'; v.isSpot = q.type === 'spot'; v.isDoc = q.type === 'doc'; v.isOrder = q.type === 'order';
    v.isOpen = q.type === 'open';
    v.hasOptions = v.isQcm || v.isScenario || v.isSpot || v.isDoc;
    v.qContexte = q.contexte || ''; v.qDoc = q.doc || '';
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

    var isTexteLike = q.type === 'texte' || q.type === 'open';
    v.texteOpen = isTexteLike && !done; v.texteDone = isTexteLike && done; v.texteVal = st.texte;
    v.openWide = q.type === 'open';
    if (q.type === 'open' && v.texteDone) {
      var normTxt = normalize(st.texte || '');
      v.openPoints = (q.points || []).map(function (p) {
        var got = (p.syn || []).some(function (w) { return normTxt.indexOf(normalize(w)) >= 0; });
        return { k: p.k, got: got };
      });
    }

    if (q.type === 'order') {
      if (state.orderKey !== st.qi) {
        var oi = q.items.map(function (_x, i) { return i; });
        for (var oz = oi.length - 1; oz > 0; oz--) { var ow = Math.floor(Math.random() * (oz + 1)); var otmp = oi[oz]; oi[oz] = oi[ow]; oi[ow] = otmp; }
        if (oi.length > 1 && oi.every(function (vv, i) { return vv === i; })) { var ot0 = oi[0]; oi[0] = oi[1]; oi[1] = ot0; }
        state.orderCur = oi; state.orderKey = st.qi;
      }
      v.orderConsigne = q.consigne || 'Remets les éléments dans le bon ordre (du premier au dernier).';
      v.orderItems = state.orderCur.map(function (oidx, pos) { return { idx: oidx, pos: pos, text: q.items[oidx], isFirst: pos === 0, isLast: pos === state.orderCur.length - 1 }; });
      v.orderCorrectList = done ? q.items : [];
    }

    var holes = (q.svg || '').replace(/(<[^>]*data-hole="[^"]*"[^>]*)>/g, function (m, g) { return g + ' opacity="0">'; });
    v.memvizSvg = q.type === 'memviz' ? (st.revealed ? q.svg : holes) : '';

    v.showValidate = !done && (q.type === 'calc' || q.type === 'texte' || q.type === 'memviz' || q.type === 'open' || q.type === 'order');
    v.validateLabel = q.type === 'memviz' ? (st.revealed ? "Je l'ai mémorisé" : 'Révéler') : (q.type === 'order' ? 'Valider l’ordre' : 'Valider');
    v.showSelfGrade = isTexteLike && ans === 'reveal';
    v.showNext = done && !isTexteLike;
    v.nextLabel = st.qi + 1 >= st.quiz.items.length ? (examMode ? 'Voir le résultat' : 'Terminer') : 'Suivante';
    v.showHint = !done && (v.hasOptions || q.type === 'vf');
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
function normalize(s) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function tplOption(o) {
  var out = '', delay = (o.i * 0.05).toFixed(2) + 's';
  if (o.pending) out += '<button data-action="answerQcm" data-i="' + o.i + '" class="hv-b stagger" style="animation-delay:' + delay + ';display:flex;gap:13px;align-items:flex-start;text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--ink);cursor:pointer;"><span style="font:400 15px Newsreader,serif;color:var(--acc);">' + o.letter + '</span><span>' + esc(o.text) + '</span></button>';
  if (o.good) out += '<div class="stagger" style="animation-delay:' + delay + ';display:flex;gap:13px;align-items:flex-start;border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--on);background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 12s linear infinite,kfPop .3s ease both,kfPulseRing 1s ease-out .3s both;"><span style="font:400 15px Newsreader,serif;opacity:.75;">' + o.letter + '</span><span>' + esc(o.text) + '</span></div>';
  if (o.bad) out += '<div class="shake" style="display:flex;gap:13px;align-items:flex-start;border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--warn);border:1px solid var(--warn);"><span style="font:400 15px Newsreader,serif;">' + o.letter + '</span><span>' + esc(o.text) + '</span></div>';
  if (o.mute) out += '<div class="stagger" style="animation-delay:' + delay + ';display:flex;gap:13px;align-items:flex-start;border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--ink3);border:1px solid var(--line);"><span style="font:400 15px Newsreader,serif;">' + o.letter + '</span><span>' + esc(o.text) + '</span></div>';
  if (o.sel) out += '<div class="shake" style="display:flex;gap:13px;align-items:flex-start;border-radius:16px;padding:15px;font:400 13px/1.55 \'Space Grotesk\',sans-serif;color:var(--ink);border:1px solid var(--ink3);background:var(--panel2);"><span style="font:400 15px Newsreader,serif;color:var(--ink3);">' + o.letter + '</span><span>' + esc(o.text) + '</span></div>';
  return out;
}
function tplVf(b) {
  var out = '', delay = (b.i * 0.06).toFixed(2) + 's';
  if (b.pending) out += '<button data-action="answerVf" data-i="' + b.i + '" class="hv-b stagger" style="animation-delay:' + delay + ';flex:1;background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:26px 0;font:400 25px Newsreader,serif;color:var(--ink);cursor:pointer;">' + esc(b.label) + '</button>';
  if (b.good) out += '<div style="flex:1;border-radius:22px;padding:26px 0;text-align:center;font:400 25px Newsreader,serif;color:var(--on);background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 12s linear infinite,kfPop .3s ease both;">' + esc(b.label) + '</div>';
  if (b.bad) out += '<div class="shake" style="flex:1;border-radius:22px;padding:26px 0;text-align:center;font:400 25px Newsreader,serif;color:var(--warn);border:1px solid var(--warn);">' + esc(b.label) + '</div>';
  if (b.mute) out += '<div style="flex:1;border-radius:22px;padding:26px 0;text-align:center;font:400 25px Newsreader,serif;color:var(--dim);border:1px solid var(--line);">' + esc(b.label) + '</div>';
  if (b.sel) out += '<div class="shake" style="flex:1;border-radius:22px;padding:26px 0;text-align:center;font:400 25px Newsreader,serif;color:var(--ink);border:1px solid var(--ink3);background:var(--panel2);">' + esc(b.label) + '</div>';
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
  var placeholder = v.isOpen ? 'Réponds comme si tu étais face à un client…' : 'Structurez votre réponse en 4-5 phrases…';
  if (v.texteOpen) out += '<textarea data-texte-input placeholder="' + placeholder + '" style="width:100%;box-sizing:border-box;min-height:150px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px;font:400 13px/1.65 \'Space Grotesk\',sans-serif;color:var(--ink);resize:none;">' + esc(v.texteVal) + '</textarea>';
  if (v.texteDone) {
    out += '<div style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px;font:400 12.5px/1.7 \'Space Grotesk\',sans-serif;color:var(--ink2);">' + (v.texteVal ? esc(v.texteVal) : '<i>(réponse vide)</i>') + '</div>' +
      '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--acc);margin:18px 0 8px;">RÉPONSE MODÈLE</div>' +
      '<div style="font:400 13px/1.75 \'Space Grotesk\',sans-serif;color:var(--ink);">' + esc(v.qModele) + '</div>';
    if (v.isOpen && v.openPoints) {
      out += '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin:18px 0 8px;">POINTS CLÉS ATTENDUS</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' + v.openPoints.map(function (p) {
          return '<div style="display:flex;gap:9px;align-items:flex-start;font:400 12.5px/1.5 \'Space Grotesk\',sans-serif;color:' + (p.got ? 'var(--ink)' : 'var(--ink3)') + ';"><span style="color:' + (p.got ? 'var(--acc)' : 'var(--dim)') + ';flex-shrink:0;">' + (p.got ? '✓' : '○') + '</span><span>' + esc(p.k) + '</span></div>';
        }).join('') + '</div>';
    }
  }
  out += '</div>';
  return out;
}

function tplOrder(v) {
  var items = v.orderItems.map(function (it) {
    return '<div style="display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 13px;">' +
      '<span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--panel2);display:flex;align-items:center;justify-content:center;font:500 11px \'JetBrains Mono\',monospace;color:var(--ink3);">' + (it.pos + 1) + '</span>' +
      '<span style="flex:1;font:400 12.5px/1.4 \'Space Grotesk\',sans-serif;">' + esc(it.text) + '</span>' +
      (v.showValidate ? '<span style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">' +
        '<button data-action="orderUp" data-pos="' + it.pos + '"' + (it.isFirst ? ' disabled' : '') + ' style="background:none;border:none;color:var(--ink2);cursor:pointer;padding:2px 6px;font-size:11px;' + (it.isFirst ? 'opacity:.3;' : '') + '">▲</button>' +
        '<button data-action="orderDown" data-pos="' + it.pos + '"' + (it.isLast ? ' disabled' : '') + ' style="background:none;border:none;color:var(--ink2);cursor:pointer;padding:2px 6px;font-size:11px;' + (it.isLast ? 'opacity:.3;' : '') + '">▼</button></span>' : '') +
      '</div>';
  }).join('');
  var out = '<div style="margin-top:14px;font:400 12px/1.5 \'Space Grotesk\',sans-serif;color:var(--ink2);">' + esc(v.orderConsigne) + '</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">' + items + '</div>';
  if (!v.showValidate && v.orderCorrectList && v.orderCorrectList.length) {
    out += '<div style="margin-top:18px;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">ORDRE ATTENDU</div>' +
      '<ol style="margin:8px 0 0;padding-left:20px;font:400 12.5px/1.7 \'Space Grotesk\',sans-serif;color:var(--ink2);">' + v.orderCorrectList.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div>';
  }
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
    '<div style="display:flex;align-items:center;gap:7px;font:500 10.5px \'JetBrains Mono\',monospace;color:var(--acc);"><span style="width:7px;height:7px;border-radius:50%;background:var(--acc);animation:kfBreathe 2.6s ease-in-out infinite;"></span>JOUR ' + v.streak + '</div></div></div>' +
    '<div style="padding:24px 24px 0;"><div style="font:300 42px/1.02 Newsreader,serif;letter-spacing:-.025em;">' + esc(v.greeting) + '<br><span style="font-style:italic;background:linear-gradient(100deg,var(--acc),var(--gold),var(--acc2),var(--acc));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:kfSweep 9s linear infinite;">' + esc(v.userName) + '</span></div></div>' +
    '<div style="margin:30px 24px 0;border-radius:24px;padding:22px;background:var(--panel);border:1px solid var(--line);display:flex;flex-direction:column;gap:18px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div>' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.16em;color:var(--ink3);">DÉFI DU JOUR</div>' +
    '<div style="font:300 40px/1 Newsreader,serif;margin-top:10px;">5 <span style="font-size:16px;font-family:\'Space Grotesk\',sans-serif;font-weight:500;color:var(--ink2);">questions</span></div></div>' +
    '<div style="width:58px;height:58px;border-radius:50%;background:conic-gradient(var(--acc) 0turn ' + v.dailyTurn + ',var(--line) ' + v.dailyTurn + ' 1turn);display:flex;align-items:center;justify-content:center;"><div style="width:46px;height:46px;border-radius:50%;background:var(--panel);display:flex;align-items:center;justify-content:center;font:500 12px \'JetBrains Mono\',monospace;">' + v.dailyPct + '%</div></div></div>' +
    '<div style="height:3px;border-radius:3px;background:var(--line);overflow:hidden;"><div style="width:62%;height:3px;background:linear-gradient(90deg,var(--acc2),var(--acc));transform-origin:left;animation:kfFill 1.1s cubic-bezier(.16,1,.3,1) both;"></div></div>' +
    '<button data-action="startDaily" style="border:none;background:var(--acc);color:var(--on);border-radius:999px;padding:14px;text-align:center;font:600 13.5px \'Space Grotesk\',sans-serif;cursor:pointer;animation:kfGlow 3.2s ease-in-out infinite;">Commencer · 3 min</button></div>' +
    '<div style="margin:26px 24px 0;display:flex;align-items:flex-end;gap:22px;">' +
    '<div><div style="font:300 52px/0.9 Newsreader,serif;letter-spacing:-.03em;"><span data-countup="' + v.mastery + '" data-countup-suffix="%">0%</span></div><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:6px;">MAÎTRISE</div></div>' +
    '<button data-action="goSrs" style="background:none;border:none;border-left:1px solid var(--line);padding:0 0 0 22px;text-align:left;cursor:pointer;"><div style="font:300 52px/0.9 Newsreader,serif;letter-spacing:-.03em;color:var(--warn);"><span data-countup="' + v.dueCount + '">0</span></div><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:6px;">À REVOIR</div></button></div>' +
    '<div style="margin:26px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">POINTS FAIBLES</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">' + weak + '</div></div>' +
    '<div style="margin:26px 24px 0;display:flex;gap:10px;">' +
    '<button data-action="goBrowse" class="hv-a" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;text-align:left;cursor:pointer;color:var(--ink);"><div style="font:300 26px/1 Newsreader,serif;">19</div><div style="font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:7px;">Catégories</div></button>' +
    '<button data-action="goExamPick" class="hv-a" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;text-align:left;cursor:pointer;color:var(--ink);"><div style="font:300 26px/1 Newsreader,serif;">40</div><div style="font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:7px;">Examen blanc</div></button></div>' +
    '<div style="margin:26px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">OUTILS</div>' +
    '<button data-action="goBuilder" class="hv-a" style="width:100%;margin-top:12px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;display:flex;align-items:center;gap:14px;text-align:left;cursor:pointer;color:var(--ink);box-sizing:border-box;">' +
    '<span style="font:400 24px Newsreader,serif;color:var(--acc);">◎</span><span style="flex:1;"><span style="display:block;font:500 13.5px \'Space Grotesk\',sans-serif;">Créer ma session</span><span style="display:block;font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:3px;">Domaines, formats et niveau au choix</span></span>' +
    '<span style="font:400 15px Newsreader,serif;color:var(--acc);">&#8250;</span></button>' +
    '<div style="margin-top:10px;display:flex;gap:10px;">' +
    '<button data-action="goLabo" class="hv-a" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;text-align:left;cursor:pointer;color:var(--ink);"><div style="font:400 22px Newsreader,serif;color:var(--acc);">∑</div><div style="font:500 13px \'Space Grotesk\',sans-serif;margin-top:9px;">Labo</div><div style="font:400 11px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:2px;">5 simulateurs</div></button>' +
    '<button data-action="goMental" class="hv-a" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;text-align:left;cursor:pointer;color:var(--ink);"><div style="font:400 22px Newsreader,serif;color:var(--gold);">⏱</div><div style="font:500 13px \'Space Grotesk\',sans-serif;margin-top:9px;">Calcul mental</div><div style="font:400 11px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:2px;">10 questions chrono</div></button></div></div>' +
    '<div style="height:26px;"></div></div>';
}

function tplBrowse(v) {
  var poles = v.poles.map(function (p, i) {
    var cats = p.cats.map(function (c) {
      return '<button data-action="catGo" data-cat="' + esc(c.id) + '" class="hv-c" style="width:100%;background:none;border:none;padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:400 12.5px/1.4 \'Space Grotesk\',sans-serif;">' + esc(c.label) + '</span><span style="font:500 10px \'JetBrains Mono\',monospace;color:var(--dim);">' + esc(c.badge) + '</span></button>';
    }).join('');
    return '<div class="stagger" style="animation-delay:' + (i * 0.05).toFixed(2) + 's;background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden;">' +
      '<button data-action="poleToggle" data-pole="' + esc(p.label) + '" class="hv-c" style="width:100%;background:none;border:none;padding:16px;display:flex;align-items:center;gap:12px;cursor:pointer;color:var(--ink);text-align:left;">' +
      '<span style="flex:1;min-width:0;"><span style="display:block;font:500 13.5px \'Space Grotesk\',sans-serif;">' + esc(p.label) + '</span><span style="display:block;font:500 9px \'JetBrains Mono\',monospace;color:var(--dim);margin-top:3px;">' + esc(p.ratio) + '</span></span>' +
      '<span style="width:52px;height:4px;border-radius:3px;background:var(--line);overflow:hidden;flex-shrink:0;"><span style="display:block;width:' + p.pct + '%;height:4px;background:linear-gradient(90deg,var(--acc2),var(--acc));transition:width .5s cubic-bezier(.16,1,.3,1);"></span></span>' +
      '<span style="font:500 10.5px \'JetBrains Mono\',monospace;color:var(--ink3);width:26px;text-align:right;flex-shrink:0;">' + p.pct + '%</span>' +
      '<span style="font:400 13px Newsreader,serif;color:var(--ink3);transition:transform .25s;transform:rotate(' + (p.open ? '90deg' : '0deg') + ');">&rsaquo;</span></button>' +
      (p.open ? '<div class="stagger" style="border-top:1px solid var(--line);padding:6px 0;">' + cats + '</div>' : '') + '</div>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">BANQUE</div>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;">' + v.poles.length + ' <span style="font-style:italic;">pôles</span></div></div>' +
    '<div style="margin:22px 24px 0;display:flex;flex-direction:column;gap:10px;">' + poles + '</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplCat(v) {
  var subs = v.subs.map(function (s) {
    return '<button data-action="subGo" data-sub="' + esc(s.id) + '"' + (s.theory ? ' data-theory="' + esc(s.theory) + '"' : '') + ' class="hv-a" style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:500 13px/1.4 \'Space Grotesk\',sans-serif;">' + esc(s.label) + '</span><span style="font:500 10px \'JetBrains Mono\',monospace;color:var(--dim);letter-spacing:.08em;">' + esc(s.badge) + '</span></button>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><button data-action="goBack" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; ' + esc(v.catPole) + '</button>' +
    '<div style="font:300 32px/1.14 Newsreader,serif;letter-spacing:-.025em;margin-top:16px;">' + esc(v.catLabel) + '</div></div>' +
    '<div style="margin:20px 24px 0;display:flex;flex-direction:column;gap:9px;">' + subs + '</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplQuiz(v) {
  var mid = '<div style="display:flex;justify-content:space-between;margin-top:16px;font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);"><div>' + esc(v.qCat) + '</div><div style="color:var(--acc);">' + esc(v.qTypeLabel) + '</div></div>' +
    '<div style="font:300 25px/1.3 Newsreader,serif;letter-spacing:-.01em;margin-top:16px;text-wrap:pretty;">' + esc(v.qText) + '</div>';
  if (v.qHasSvg) mid += '<div style="margin-top:16px;border-radius:16px;overflow:hidden;background:#faf8f3;">' + v.qSvg + '</div>';
  if (v.isScenario) mid += '<div style="margin-top:16px;background:var(--panel2);border-left:3px solid var(--acc);border-radius:10px;padding:13px 15px;font:400 12.5px/1.6 \'Space Grotesk\',sans-serif;color:var(--ink2);"><b style="color:var(--ink);">Scénario —</b> ' + esc(v.qContexte) + '</div>';
  if (v.isSpot) mid += '<div style="margin-top:14px;font:400 12px/1.5 \'Space Grotesk\',sans-serif;color:var(--warn);">Une seule affirmation est fausse. Repère-la.</div>';
  if (v.isDoc) mid += '<div style="margin-top:16px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px;font:400 12px/1.7 \'JetBrains Mono\',monospace;color:var(--ink2);white-space:pre-line;">' + esc(v.qDoc) + '</div>';
  if (v.hasOptions) mid += '<div style="display:flex;flex-direction:column;gap:9px;margin-top:22px;">' + v.options.map(tplOption).join('') + '</div>';
  if (v.isVf) mid += '<div style="display:flex;gap:12px;margin-top:26px;">' + v.vfBtns.map(tplVf).join('') + '</div>';
  if (v.isCalc) mid += tplCalc(v);
  if (v.isTexte || v.isOpen) mid += tplTexte(v);
  if (v.isMemviz) mid += '<div style="margin-top:18px;border-radius:16px;overflow:hidden;background:#faf8f3;">' + v.memvizSvg + '</div>';
  if (v.isOrder) mid += tplOrder(v);
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
  if (v.showSelfGrade) footer += '<div style="display:flex;gap:10px;"><button data-action="selfKo" style="flex:1;background:none;border:1px solid var(--warn);border-radius:999px;padding:15px;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--warn);cursor:pointer;">À revoir</button>' +
    (v.openWide ? '<button data-action="selfMid" style="flex:1;background:none;border:1px solid var(--gold);border-radius:999px;padding:15px;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--gold);cursor:pointer;">En partie</button>' : '') +
    '<button data-action="selfOk" style="flex:1;background:none;border:1px solid var(--acc);border-radius:999px;padding:15px;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">Maîtrisé</button></div>';
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

function tplBuilder(v) {
  var levels = v.buildLevels.map(function (l) {
    return '<button data-action="buildLevel" data-lv="' + l.key + '" class="lab-seg' + (l.on ? ' on' : '') + '" style="flex:1;">' + l.label + '</button>';
  }).join('');
  var doms = v.buildDoms.map(function (d) {
    return '<button data-action="buildDom" data-dom="' + esc(d.id) + '" class="hv-c" style="background:' + (d.on ? 'var(--ink)' : 'var(--panel)') + ';color:' + (d.on ? 'var(--bg)' : 'var(--ink)') + ';border:1px solid var(--line);border-radius:12px;padding:10px 12px;font:500 12px \'Space Grotesk\',sans-serif;cursor:pointer;text-align:left;">' + (d.on ? '✓ ' : '') + esc(d.label) + '</button>';
  }).join('');
  var types = v.buildTypeOpts.map(function (t) {
    return '<button data-action="buildType" data-t="' + t.id + '" class="hv-c" style="background:' + (t.on ? 'var(--ink)' : 'var(--panel)') + ';color:' + (t.on ? 'var(--bg)' : 'var(--ink)') + ';border:1px solid var(--line);border-radius:12px;padding:10px 12px;font:500 12px \'Space Grotesk\',sans-serif;cursor:pointer;text-align:left;">' + (t.on ? '✓ ' : '') + esc(t.label) + ' <span style="opacity:.6;font-family:\'JetBrains Mono\',monospace;font-size:10px;">(' + t.count + ')</span></button>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><button data-action="goBack" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; Retour</button>' +
    '<div style="font:300 32px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:16px;">Créer <span style="font-style:italic;">ma session</span></div>' +
    '<div style="font:400 12.5px/1.6 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:10px;">Choisis tes domaines, tes formats, ton niveau et le nombre de questions. On pioche au hasard dans toute la banque.</div></div>' +
    '<div style="margin:22px 24px 0;">' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">NIVEAU</div>' +
    '<div style="display:flex;gap:8px;margin-top:10px;">' + levels + '</div>' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:22px;">DOMAINES</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">' + doms + '</div>' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);margin-top:22px;">FORMATS</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">' + types + '</div>' +
    '<div style="margin-top:24px;"><div style="display:flex;justify-content:space-between;font:500 12px \'Space Grotesk\',sans-serif;color:var(--ink2);"><span>Nombre de questions</span><b id="bldNV" style="color:var(--ink);font-family:\'JetBrains Mono\',monospace;">' + v.buildN + '</b></div>' +
    '<input type="range" id="bldN" min="1" max="' + v.buildMaxN + '" step="1" value="' + v.buildN + '"></div>' +
    '<div style="font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink3);margin-top:10px;">' + v.buildAvail + ' question' + (v.buildAvail > 1 ? 's' : '') + ' disponible' + (v.buildAvail > 1 ? 's' : '') + ' avec cette sélection' + (v.buildAvail === 0 ? ' — élargis tes critères.' : '.') + '</div>' +
    '<button data-action="startBuilder"' + (v.buildAvail < 1 ? ' disabled style="opacity:.4;"' : '') + ' style="width:100%;margin-top:16px;border:none;border-radius:999px;padding:16px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Lancer ma session →</button>' +
    '</div><div style="height:32px;"></div></div>';
}

function tplExamPick(v) {
  var lvs = v.examLevels.map(function (e, ei) {
    return '<button data-action="examGo" data-key="' + esc(e.key) + '" data-label="' + esc(e.label) + '" class="hv-a stagger" style="animation-delay:' + (ei * 0.06).toFixed(2) + 's;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;align-items:center;gap:14px;cursor:pointer;color:var(--ink);text-align:left;">' +
      '<span style="font:300 30px/1 Newsreader,serif;color:var(--acc);">' + e.n + '</span>' +
      '<span style="flex:1;"><span style="display:block;font:500 14px \'Space Grotesk\',sans-serif;">' + esc(e.label) + '</span><span style="display:block;font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:3px;">' + esc(e.sub) + '</span></span>' +
      '<span style="font:500 10px \'JetBrains Mono\',monospace;color:var(--ink3);">' + esc(e.best) + '</span></button>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;padding:58px 24px 0;">' +
    '<button data-action="goBack" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; Retour</button>' +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);margin-top:16px;">EXAMEN BLANC</div>' +
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

function tplFicheCard(f) {
  return '<button data-action="ficheGo" data-fiche="' + esc(f.key) + '" class="hv-a" style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:14px;display:flex;align-items:center;gap:14px;cursor:pointer;color:var(--ink);text-align:left;box-sizing:border-box;">' +
    '<span style="flex-shrink:0;width:44px;height:44px;border-radius:14px;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:19px;">' + esc(f.icon) + '</span>' +
    '<span style="flex:1;min-width:0;"><span style="display:block;font:500 13.5px/1.35 \'Space Grotesk\',sans-serif;">' + esc(f.title) + '</span><span style="display:block;font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.1em;color:var(--dim);margin-top:5px;">' + esc(f.meta) + '</span></span>' +
    '<span style="flex-shrink:0;font:400 15px Newsreader,serif;color:var(--acc);">&#8250;</span></button>';
}

function tplCourses(v) {
  var cards = v.coursePoles.map(function (p, i) {
    return '<button data-action="coursePoleGo" data-pole="' + esc(p.label) + '" class="hv-a stagger" style="animation-delay:' + (i * 0.04).toFixed(2) + 's;background:var(--panel);border:1px solid var(--line);border-left:3px solid ' + p.accent + ';border-radius:16px;padding:17px;text-align:left;cursor:pointer;color:var(--ink);display:flex;flex-direction:column;gap:14px;box-sizing:border-box;">' +
      '<div style="font:300 15px/1.3 Newsreader,serif;">' + esc(p.label) + '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
      '<span style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.06em;color:var(--ink3);">' + p.count + ' FICHE' + (p.count > 1 ? 'S' : '') + '</span>' +
      '<span style="font:400 18px Newsreader,serif;color:' + p.accent + ';">&#8250;</span></div></button>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">FICHES</div>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;">' + v.ficheCount + ' <span style="font-style:italic;">cours</span>, ' + v.coursePoles.length + ' pôles</div></div>' +
    '<div style="margin:22px 24px 0;display:grid;grid-template-columns:1fr 1fr;gap:12px;">' + cards + '</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplCoursePole(v) {
  var cards = v.coursePoleFichesList.map(function (f, i) {
    return '<div class="stagger" style="animation-delay:' + (i * 0.04).toFixed(2) + 's;">' + tplFicheCard(f) + '</div>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><button data-action="goBack" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; Fiches</button>' +
    '<div style="font:300 32px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:16px;">' + esc(v.coursePoleLabel) + '</div></div>' +
    '<div style="margin:20px 24px 0;display:flex;flex-direction:column;gap:9px;">' + cards + '</div>' +
    '<div style="height:26px;"></div></div>';
}

function tplPara(p, i) {
  var delay = ((i || 0) * 0.06).toFixed(2) + 's';
  if (p.callout) {
    return '<div class="stagger" style="animation-delay:' + delay + ';margin:10px 0;background:var(--panel2);border-left:3px solid var(--gold);border-radius:10px;padding:11px 13px;">' +
      '<div style="font:600 9.5px \'JetBrains Mono\',monospace;letter-spacing:.1em;color:var(--gold);display:flex;align-items:center;gap:6px;"><span style="width:5px;height:5px;border-radius:50%;background:var(--gold);animation:kfBreathe 2s ease-in-out infinite;"></span>' + esc(p.label) + '</div>' +
      '<div style="font:400 12.5px/1.65 \'Space Grotesk\',sans-serif;color:var(--ink);margin-top:5px;text-wrap:pretty;">' + esc(p.text.trim()) + '</div></div>';
  }
  if (!p.text.trim()) return '';
  return '<div class="stagger" style="animation-delay:' + delay + ';font:400 13px/1.8 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:10px;text-wrap:pretty;">' + esc(p.text.trim()) + '</div>';
}

function tplFiche(v) {
  var sections = v.ficheSections.map(function (s, i) {
    var body = s.paras.map(tplPara).join('') + (s.svg ? '<div class="stagger" style="animation-delay:' + (s.paras.length * 0.06).toFixed(2) + 's;margin-top:14px;border-radius:14px;overflow:hidden;background:#faf8f3;padding:8px;">' + s.svg + '</div>' : '');
    return '<div class="thsec' + (i === 0 ? ' open' : '') + '" style="margin-top:12px;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel);animation:kfIn .4s cubic-bezier(.16,1,.3,1) both;animation-delay:' + (i * 0.05).toFixed(2) + 's;">' +
      '<button data-fold-head style="width:100%;background:none;border:none;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;color:var(--acc);font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.12em;text-align:left;"><span>' + esc(s.h) + '</span><span class="fold-arr" style="flex-shrink:0;transition:transform .25s;transform:rotate(' + (i === 0 ? '90deg' : '0deg') + ');">&rsaquo;</span></button>' +
      '<div class="fold-body' + (i === 0 ? '' : ' fold-closed') + '"><div style="padding:0 16px 16px;">' + body + '</div></div></div>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:56px 26px 0;"><button data-action="goBack" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; Retour</button>' +
    '<div style="display:flex;align-items:center;gap:14px;margin-top:18px;">' +
    '<span style="flex-shrink:0;width:52px;height:52px;border-radius:16px;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:23px;">' + esc(v.ficheIcon) + '</span>' +
    '<div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:center;font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);"><div>' + esc(v.ficheIdx) + '</div><div style="color:var(--acc);">' + v.ficheMin + ' MIN</div></div>' +
    '<div style="font:300 26px/1.15 Newsreader,serif;letter-spacing:-.02em;margin-top:6px;">' + esc(v.ficheTitle) + '</div></div></div>' +
    '<div style="margin-top:16px;height:1px;background:linear-gradient(90deg,var(--acc),var(--acc2),transparent);"></div>' +
    '<div style="font:400 10px/1.6 \'JetBrains Mono\',monospace;color:var(--dim);margin-top:14px;">' + esc(v.ficheSource) + '</div></div>' +
    '<div style="padding:6px 26px 0;">' + sections + '</div>' +
    '<div style="padding:26px 26px 30px;"><button data-action="startFicheQuiz" style="width:100%;border:none;border-radius:999px;padding:17px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Tester la fiche</button></div></div>';
}

function tplProgress(v) {
  var dots = v.radarDots.map(function (d, i) {
    return '<circle cx="' + d.x + '" cy="' + d.y + '" r="3.5" fill="var(--acc)" style="animation:kfPop .3s ease ' + (0.9 + i * 0.06).toFixed(2) + 's both;"></circle>';
  }).join('');
  var poles = v.poles.map(function (p, i) {
    return '<div class="stagger" style="animation-delay:' + (i * 0.05).toFixed(2) + 's;display:flex;flex-direction:column;gap:7px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;"><span style="font:400 12.5px \'Space Grotesk\',sans-serif;">' + esc(p.label) + '</span><span style="font:500 9.5px \'JetBrains Mono\',monospace;color:var(--ink3);flex-shrink:0;">' + esc(p.ratio) + ' bonnes réponses</span></div>' +
      '<div style="display:flex;align-items:center;gap:10px;"><div style="flex:1;height:5px;border-radius:3px;background:var(--line);overflow:hidden;"><div style="width:' + p.pct + '%;height:5px;background:linear-gradient(90deg,var(--acc2),var(--acc));transform-origin:left;animation:kfFill 1.1s cubic-bezier(.16,1,.3,1) both;"></div></div>' +
      '<div style="width:32px;text-align:right;font:500 10.5px \'JetBrains Mono\',monospace;color:var(--ink3);">' + p.pct + '%</div></div></div>';
  }).join('');
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.2em;color:var(--ink3);">PROGRESSION</div>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:14px;"><span data-countup="' + v.mastery + '">0</span> <span style="font-size:18px;">%</span> de <span style="font-style:italic;">maîtrise</span></div></div>' +
    '<div style="padding:14px 20px 0;"><svg viewBox="0 0 300 300" style="width:100%;height:auto;">' +
    '<polygon points="150,20 262,85 262,215 150,280 38,215 38,85" fill="none" stroke="var(--line)" stroke-width="1"></polygon>' +
    '<polygon points="150,63 225,106 225,193 150,237 75,193 75,106" fill="none" stroke="var(--line)" stroke-width="1"></polygon>' +
    '<polygon points="150,107 187,128 187,171 150,193 113,171 113,128" fill="none" stroke="var(--line)" stroke-width="1"></polygon>' +
    '<polygon class="v16draw" points="' + v.radarPts + '" fill="rgba(195,226,129,.2)" stroke="var(--acc)" stroke-width="2" style="stroke-dasharray:900;stroke-dashoffset:900;animation:v16draw 1.1s cubic-bezier(.16,1,.3,1) .15s forwards,kfIn .5s ease .15s forwards;"></polygon>' + dots + '</svg></div>' +
    '<div style="margin:6px 24px 0;display:flex;flex-direction:column;gap:16px;">' + poles + '</div>' +
    '<div style="margin:26px 24px 0;padding-top:18px;border-top:1px solid var(--line);display:flex;justify-content:space-between;">' +
    '<div><div style="font:300 28px/1 Newsreader,serif;"><span data-countup="' + v.xp + '">0</span></div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">XP TOTAL</div></div>' +
    '<div><div style="font:300 28px/1 Newsreader,serif;"><span data-countup="' + v.answeredCount + '">0</span></div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">QUESTIONS VUES</div></div>' +
    '<div><div style="font:300 28px/1 Newsreader,serif;"><span data-countup="' + v.streak + '">0</span></div><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.12em;color:var(--ink3);margin-top:5px;">JOURS DE SUITE</div></div></div>' +
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
    '<button data-action="toggleNotif" style="width:100%;background:none;border:none;border-bottom:1px solid var(--line);padding:16px;display:flex;align-items:center;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;"><span style="display:block;font:500 13px \'Space Grotesk\',sans-serif;">Rappel quotidien</span><span style="display:block;font:400 11px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:3px;">' + esc(v.notifSub) + '</span></span>' + notifSwitch + '</button>' +
    '<button data-action="goExamPick" style="width:100%;background:none;border:none;border-bottom:1px solid var(--line);padding:16px;display:flex;align-items:center;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:500 13px \'Space Grotesk\',sans-serif;">Examens blancs</span><span style="font:400 15px Newsreader,serif;color:var(--acc);">&#8250;</span></button>' +
    '<button data-action="restartOnb" style="width:100%;background:none;border:none;border-bottom:1px solid var(--line);padding:16px;display:flex;align-items:center;cursor:pointer;color:var(--ink);text-align:left;"><span style="flex:1;font:500 13px \'Space Grotesk\',sans-serif;">Refaire le diagnostic</span><span style="font:400 15px Newsreader,serif;color:var(--acc);">&#8250;</span></button>' +
    '<button data-action="resetProgress" style="width:100%;background:none;border:none;padding:16px;display:flex;align-items:center;cursor:pointer;color:var(--warn);text-align:left;"><span style="flex:1;font:500 13px \'Space Grotesk\',sans-serif;">Réinitialiser ma progression</span></button></div>' +
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

// ---- Labo : simulateurs financiers -----------------------------------------
function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function euro(n) { return fmtNum(Math.round(n)) + ' €'; }
function pctv(x) { return (Math.round(x * 100) / 100).toString().replace('.', ',') + ' %'; }
function irTax(rev, parts) {
  if (rev <= 0 || parts <= 0) return 0;
  var br = [[11294, 0], [28797, 0.11], [82341, 0.30], [177106, 0.41], [Infinity, 0.45]];
  var q = rev / parts, tax = 0, prev = 0;
  for (var i = 0; i < br.length; i++) {
    var cap = br[i][0], rate = br[i][1];
    if (q > prev) { tax += (Math.min(q, cap) - prev) * rate; prev = cap; } else break;
  }
  return tax * parts;
}
function partsOf(couple, enf) {
  var p = couple ? 2 : 1;
  p += Math.min(enf, 2) * 0.5;
  if (enf > 2) p += (enf - 2) * 1;
  return p;
}

var laboState = { ciFreq: 'mois', perCouple: false, perMode: 'libre', pxMode: 'ech' };

function laboField(label, id, min, max, step, value, labelId) {
  return '<div style="margin-top:14px;"><div style="display:flex;justify-content:space-between;gap:10px;font:500 12px \'Space Grotesk\',sans-serif;color:var(--ink2);"><span' + (labelId ? ' id="' + labelId + '"' : '') + '>' + label + '</span><b id="' + id + 'V" style="color:var(--ink);font-family:\'JetBrains Mono\',monospace;font-weight:500;font-size:11.5px;white-space:nowrap;">—</b></div>' +
    '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"></div>';
}
function laboSeg(idA, labelA, idB, labelB, prefixLabel) {
  return '<div style="margin-top:14px;">' + (prefixLabel ? '<div style="font:500 12px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-bottom:6px;">' + prefixLabel + '</div>' : '') +
    '<div style="display:flex;gap:8px;"><button type="button" id="' + idA + '" class="lab-seg on" style="flex:1;">' + labelA + '</button><button type="button" id="' + idB + '" class="lab-seg" style="flex:1;">' + labelB + '</button></div></div>';
}
function laboSeg3(a, la, b, lb, c, lc) {
  return '<div style="display:flex;gap:8px;margin-top:10px;"><button type="button" id="' + a + '" class="lab-seg" style="flex:1;">' + la + '</button><button type="button" id="' + b + '" class="lab-seg on" style="flex:1;">' + lb + '</button><button type="button" id="' + c + '" class="lab-seg" style="flex:1;">' + lc + '</button></div>';
}
function laboKpiRow(items) {
  var cells = items.map(function (it) {
    return '<div style="flex:1;min-width:0;"><div style="font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.08em;color:var(--ink3);">' + it.label + '</div><div id="' + it.id + '" style="font:500 15.5px \'JetBrains Mono\',monospace;margin-top:5px;color:' + (it.color || 'var(--ink)') + ';word-break:break-word;">—</div></div>';
  }).join('');
  return '<div style="display:flex;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);">' + cells + '</div>';
}
function laboBar(idA, idB) {
  return '<div style="height:8px;border-radius:4px;overflow:hidden;display:flex;margin-top:14px;background:var(--line);">' +
    '<span id="' + idA + '" style="display:block;height:8px;background:var(--acc2);"></span>' +
    '<span id="' + idB + '" style="display:block;height:8px;background:var(--warn);"></span></div>';
}
function laboNote(id) {
  return '<div id="' + id + '" style="font:400 11.5px/1.6 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:12px;"></div>';
}
function laboCard(tag, tagColor, icon, title, purpose, inner) {
  return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:18px;margin-top:14px;">' +
    '<div style="display:inline-block;font:500 9.5px \'JetBrains Mono\',monospace;letter-spacing:.06em;color:' + tagColor + ';background:var(--panel2);padding:5px 10px;border-radius:999px;">' + tag + '</div>' +
    '<div style="font:500 15px \'Space Grotesk\',sans-serif;margin-top:11px;display:flex;align-items:center;gap:9px;"><span style="font-size:17px;">' + icon + '</span>' + title + '</div>' +
    '<div style="font:400 11.5px/1.5 \'Space Grotesk\',sans-serif;color:var(--ink3);margin-top:5px;">' + purpose + '</div>' +
    inner + '</div>';
}
function laboLine(label, value, tot) {
  return '<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;font:400 12px \'Space Grotesk\',sans-serif;color:' + (tot ? 'var(--ink)' : 'var(--ink2)') + ';' + (tot ? 'font-weight:600;border-top:1px solid var(--line);margin-top:4px;padding-top:10px;' : '') + '"><span>' + label + '</span><b style="font-family:\'JetBrains Mono\',monospace;font-weight:500;">' + value + '</b></div>';
}

function tplLabo() {
  var card1 =
    laboField('Capital de départ', 'ciCap', 0, 1000000, 5000, 50000) +
    laboField('Versement mensuel', 'ciPmt', 0, 5000, 50, 300, 'ciPmtLbl') +
    laboSeg('ciFreqMois', 'Mensuel', 'ciFreqAn', 'Annuel', 'Fréquence des versements') +
    laboField('Frais sur versements', 'ciFeeIn', 0, 5, 0.25, 0) +
    laboField('Rendement annuel brut', 'ciRate', 0, 15, 0.5, 6) +
    laboField('Frais de gestion annuels', 'ciFeeMgmt', 0, 4, 0.1, 0) +
    laboField('Durée', 'ciYr', 1, 40, 1, 20) +
    laboKpiRow([{ id: 'ciFinal', label: 'CAPITAL FINAL' }, { id: 'ciInt', label: 'PLUS-VALUE NETTE', color: 'var(--acc)' }]) +
    laboBar('ciBarCap', 'ciBarInt') + laboNote('ciNote');
  var card2 =
    laboSeg('perSolo', 'Célibataire', 'perCouple', 'Couple', 'Foyer') +
    laboField('Revenu net imposable — déclarant 1', 'perR1', 0, 250000, 1000, 45000) +
    '<div id="perR2Row" style="display:none;">' + laboField('Revenu net imposable — déclarant 2', 'perR2', 0, 250000, 1000, 35000) + '</div>' +
    laboField('Nombre d’enfants à charge', 'perEnf', 0, 6, 1, 0) +
    laboSeg('perLibre', 'Libre', 'perObj', 'Objectif en N mois', 'Versement') +
    '<div id="perLibreRow">' + laboField('Versement PER (sur l’année)', 'perVers', 0, 60000, 500, 8000) + '</div>' +
    '<div id="perObjRow" style="display:none;">' + laboField('Montant à atteindre', 'perTgt', 1000, 60000, 500, 10000) + laboField('En combien de mois', 'perMo', 1, 24, 1, 6) + '</div>' +
    laboKpiRow([{ id: 'perGain', label: 'GAIN FISCAL RÉEL', color: 'var(--acc)' }, { id: 'perNet', label: 'EFFORT NET' }, { id: 'perTx', label: 'TAUX DU GAIN' }]) +
    '<div id="perBreak" style="margin-top:6px;"></div>' + laboNote('perNote');
  var card3 =
    laboField('Montant emprunté', 'crCap', 20000, 1500000, 10000, 300000) +
    laboField('Taux annuel', 'crRate', 0.5, 7, 0.1, 3.5) +
    laboField('Durée', 'crYr', 5, 30, 1, 20) +
    laboKpiRow([{ id: 'crMens', label: 'MENSUALITÉ' }, { id: 'crInt', label: 'COÛT DES INTÉRÊTS', color: 'var(--warn)' }]) +
    laboBar('crBarCap', 'crBarInt') + laboNote('crNote');
  var card4 =
    laboField('Capital investi', 'frCap', 1000, 1000000, 5000, 100000) +
    laboField('Rendement brut annuel', 'frBrut', 0, 12, 0.5, 6) +
    laboField('Frais annuels', 'frFrais', 0, 5, 0.1, 1.5) +
    laboField('Durée', 'frYr', 1, 40, 1, 25) +
    laboKpiRow([{ id: 'frNet', label: 'CE QUE TU AS (NET)', color: 'var(--acc)' }, { id: 'frCost', label: 'COÛT TOTAL DES FRAIS', color: 'var(--warn)' }]) +
    laboBar('frBarCap', 'frBarInt') + laboNote('frNote');
  var guide = '<button type="button" id="pxGuideBtn" style="width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:11px 13px;font:500 12px \'Space Grotesk\',sans-serif;color:var(--ink);cursor:pointer;margin-top:14px;">📄 Comment remplir depuis un DIC ? (exemples)</button>' +
    '<div id="pxGuide" style="display:none;margin-top:10px;background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:14px;font:400 11.5px/1.6 \'Space Grotesk\',sans-serif;color:var(--ink2);">' +
    '<div>Reporte chaque valeur du DIC dans les bonnes cases :</div>' +
    '<div style="margin-top:8px;"><b style="color:var(--ink);">Montant investi</b> — « Scénarios de performance » → « Exemple d’investissement » <i>(ex. 10 000 €)</i></div>' +
    '<div style="margin-top:6px;"><b style="color:var(--ink);">Coupon /an (brut)</b> — Section 1 → « Intérêts » <i>(ex. 8 %)</i></div>' +
    '<div style="margin-top:6px;"><b style="color:var(--ink);">Décrément (pts/an)</b> — Section 1 → indice « Decrement », 0 si absent <i>(ex. 4,7)</i></div>' +
    '<div style="margin-top:6px;"><b style="color:var(--ink);">Barrière capital</b> — Section 1 → « Niveau de barrière », 100 % si capital garanti <i>(ex. 40 %)</i></div>' +
    '<div style="margin-top:6px;"><b style="color:var(--ink);">Coûts d’entrée (produit)</b> — Section 4 → « Composition des coûts » <i>(ex. 8,91 %)</i></div>' +
    '<div style="margin-top:6px;"><b style="color:var(--ink);">Frais de gestion /an</b> — Section 4 → « Coûts récurrents » <i>(ex. 0,80 %)</i></div>' +
    '<div style="margin-top:6px;"><b style="color:var(--ink);">Coûts de sortie</b> — Section 4 → « Coûts de sortie », dus seulement si vente avant terme <i>(ex. 1,00 %)</i></div>' +
    '<div style="margin-top:10px;color:var(--gold);">💡 Les frais du DIC sont ceux du PRODUIT. Ajoute à part les frais d’entrée du CGP / de l’enveloppe, absents du DIC.</div>' +
    '<div style="margin-top:8px;">✅ Contrôle : « l’incidence des coûts annuels » du DIC (à l’échéance) doit être proche de ce qu’affiche le simulateur.</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;"><button type="button" id="pxFillCiti" style="flex:1;background:var(--acc);color:var(--on);border:none;border-radius:999px;padding:9px 12px;font:600 11px \'Space Grotesk\',sans-serif;cursor:pointer;">Exemple Citi (décrément)</button><button type="button" id="pxFillMS" style="flex:1;background:none;border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:9px 12px;font:500 11px \'Space Grotesk\',sans-serif;cursor:pointer;">Exemple Morgan Stanley</button></div>' +
    '</div>';
  var card5 = guide +
    laboField('Montant investi', 'pxCap', 5000, 500000, 1000, 10000) +
    laboField('Coupon conditionnel /an (brut)', 'pxCoup', 0, 12, 0.25, 8) +
    laboField('Décrément de l’indice (pts/an)', 'pxDec', 0, 6, 0.1, 4.7) +
    laboField('Barrière de protection du capital (%)', 'pxBar', 0, 100, 5, 40) +
    laboField('Durée totale', 'pxN', 1, 12, 1, 12) +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.1em;color:var(--ink3);margin-top:18px;">FRAIS DU PRODUIT (DIC)</div>' +
    laboField('Coûts d’entrée produit', 'pxEnt', 0, 12, 0.1, 8.9) +
    laboField('Frais de gestion /an produit', 'pxGes', 0, 3, 0.1, 0.8) +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.1em;color:var(--ink3);margin-top:18px;">FRAIS CÔTÉ CGP / ENVELOPPE (HORS DIC)</div>' +
    laboField('Frais d’entrée CGP / enveloppe', 'pxCgp', 0, 5, 0.1, 0) +
    '<div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.1em;color:var(--ink3);margin-top:18px;">👇 SCÉNARIO DE SORTIE</div>' +
    laboSeg3('scAuto', 'Remb. anticipé', 'scEch', 'À l’échéance', 'scVol', 'Sortie volontaire') +
    '<div id="pxScenHint" style="font:400 11px/1.5 \'Space Grotesk\',sans-serif;color:var(--ink3);margin-top:8px;"></div>' +
    '<div id="pxYrRow" style="display:none;">' + laboField('Année de sortie / de rappel', 'pxYr', 1, 12, 1, 3) + '</div>' +
    '<div id="pxPerfRow" style="display:none;">' + laboField('Performance du sous-jacent (avant décrément)', 'pxPerf', -70, 40, 1, -30) + '</div>' +
    '<div id="pxSorRow" style="display:none;">' + laboField('Coûts de sortie (si tu retires)', 'pxSor', 0, 5, 0.1, 1) + '</div>' +
    laboKpiRow([{ id: 'pxCost', label: 'FRAIS DÉDUITS', color: 'var(--warn)' }, { id: 'pxRes', label: 'TU RÉCUPÈRES' }, { id: 'pxNet', label: 'RÉSULTAT /AN', color: 'var(--acc)' }]) +
    '<div id="pxBreak" style="margin-top:6px;"></div>' + laboNote('pxNote');

  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><button data-action="goBack" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; Retour</button>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:16px;">Labo <span style="font-style:italic;">interactif</span></div>' +
    '<div style="font:400 13px/1.6 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:10px;">5 simulateurs, 5 usages distincts. Chiffres élevés supportés — adapte-les à tes clients.</div></div>' +
    '<div style="margin:0 24px;">' +
    laboCard('UTILITÉ', 'var(--gold)', '🌱', 'Intérêts composés + versements', 'La puissance du temps + de l’épargne régulière.', card1) +
    laboCard('UTILITÉ', 'var(--acc)', '💸', 'Levier fiscal du PER', 'Ton vrai gain fiscal PER selon tes revenus (gère les effets de tranche).', card2) +
    laboCard('UTILITÉ', 'var(--ink2)', '🏦', 'Crédit : mensualité & coût total', 'Le vrai coût d’un emprunt.', card3) +
    laboCard('UTILITÉ', 'var(--warn)', '🔍', 'Frais : combien ça coûte vraiment', 'Combien les frais rognent la performance.', card4) +
    laboCard('UTILITÉ', 'var(--gold)', '🧾', 'Produit structuré : coûts, coupon & scénarios', 'Décortiquer un structuré depuis son DIC.', card5) +
    '</div><div style="height:32px;"></div></div>';
}

function wireLabo() {
  function $(id) { return document.getElementById(id); }
  function ci() {
    var cap = +$('ciCap').value, pmt = +$('ciPmt').value, r = +$('ciRate').value, y = +$('ciYr').value, feeIn = +$('ciFeeIn').value, feeM = +$('ciFeeMgmt').value, freq = laboState.ciFreq;
    $('ciCapV').textContent = euro(cap); $('ciPmtV').textContent = euro(pmt); $('ciRateV').textContent = pctv(r);
    $('ciYrV').textContent = y + ' ans'; $('ciFeeInV').textContent = pctv(feeIn); $('ciFeeMgmtV').textContent = pctv(feeM);
    var m = y * 12, pmtMois = (freq === 'an') ? pmt / 12 : pmt;
    var netAnnual = (1 + r / 100) * (1 - feeM / 100), rm = Math.pow(netAnnual, 1 / 12) - 1, rmBrut = Math.pow(1 + r / 100, 1 / 12) - 1;
    var k = 1 - feeIn / 100, capNet = cap * k, pmtNet = pmtMois * k;
    function fv(rate, c, pm) { return rate > 0 ? c * Math.pow(1 + rate, m) + pm * ((Math.pow(1 + rate, m) - 1) / rate) : c + pm * m; }
    var fin = fv(rm, capNet, pmtNet), finBrut = fv(rmBrut, cap, pmtMois), verse = cap + pmtMois * m, gain = fin - verse, fraisTot = finBrut - fin;
    $('ciFinal').textContent = euro(fin); $('ciInt').textContent = euro(gain);
    var p = fin > 0 ? Math.round(Math.max(0, gain) / fin * 100) : 0;
    $('ciBarCap').style.width = (100 - p) + '%'; $('ciBarInt').style.width = p + '%';
    var note = 'Tu verses ' + euro(verse) + ' de ta poche ; capital final ' + euro(fin) + ' (plus-value nette ' + euro(gain) + ').';
    if (feeIn > 0 || feeM > 0) note += ' Frais prélevés ≈ ' + euro(fraisTot) + ' sur la période (sans frais : ' + euro(finBrut) + ').';
    $('ciNote').textContent = note;
  }
  function per() {
    var couple = laboState.perCouple, mode = laboState.perMode;
    var r1 = +$('perR1').value, r2 = couple ? +$('perR2').value : 0, enf = +$('perEnf').value;
    $('perR1V').textContent = euro(r1); $('perR2V').textContent = euro(r2); $('perEnfV').textContent = enf;
    var vers, moTxt = '';
    if (mode === 'obj') {
      var tgt = +$('perTgt').value, mo = +$('perMo').value;
      vers = tgt; $('perTgtV').textContent = euro(tgt); $('perMoV').textContent = mo + ' mois';
      moTxt = 'Pour atteindre ' + euro(tgt) + ' en ' + mo + ' mois : verse ' + euro(Math.round(tgt / mo)) + ' /mois. ';
    } else { vers = +$('perVers').value; $('perVersV').textContent = euro(vers); }
    var parts = partsOf(couple, enf), rev = r1 + r2;
    var irA = irTax(rev, parts), irB = irTax(Math.max(0, rev - vers), parts);
    var gain = irA - irB, net = vers - gain, tx = vers > 0 ? gain / vers * 100 : 0;
    $('perGain').textContent = euro(gain); $('perNet').textContent = euro(net); $('perTx').textContent = pctv(tx);
    $('perBreak').innerHTML = laboLine('Parts fiscales', parts, false) + laboLine('Impôt avant versement PER', euro(irA), false) + laboLine('Impôt après versement PER', euro(irB), false) + laboLine('Économie d’impôt', euro(gain), true);
    $('perNote').textContent = moTxt + 'Verser ' + euro(vers) + ' te fait économiser ' + euro(gain) + ' d’impôt : ça ne coûte réellement que ' + euro(net) + ' (taux du gain ' + pctv(tx) + '). Le gain suit ta tranche : plus tu es haut, plus il est fort, et il baisse si le versement te fait changer de tranche.';
  }
  function cr() {
    var P = +$('crCap').value, ra = +$('crRate').value, y = +$('crYr').value;
    $('crCapV').textContent = euro(P); $('crRateV').textContent = pctv(ra); $('crYrV').textContent = y + ' ans';
    var n = y * 12, r = ra / 100 / 12, M = r > 0 ? P * r / (1 - Math.pow(1 + r, -n)) : P / n, tot = M * n, intr = tot - P;
    $('crMens').textContent = euro(M); $('crInt').textContent = euro(intr);
    var p = tot > 0 ? Math.round(intr / tot * 100) : 0;
    $('crBarCap').style.width = (100 - p) + '%'; $('crBarInt').style.width = p + '%';
    $('crNote').textContent = 'Sur ' + y + ' ans tu rembourses ' + euro(tot) + ', dont ' + euro(intr) + ' d’intérêts (' + p + '% du total).';
  }
  function fr() {
    var P = +$('frCap').value, brut = +$('frBrut').value, fee = +$('frFrais').value, y = +$('frYr').value;
    $('frCapV').textContent = euro(P); $('frBrutV').textContent = pctv(brut); $('frFraisV').textContent = pctv(fee); $('frYrV').textContent = y + ' ans';
    var net = P * Math.pow((1 + brut / 100) * (1 - fee / 100), y), gross = P * Math.pow(1 + brut / 100, y), cost = gross - net;
    $('frNet').textContent = euro(net); $('frCost').textContent = euro(cost);
    var p = gross > 0 ? Math.round(cost / gross * 100) : 0;
    $('frBarCap').style.width = (100 - p) + '%'; $('frBarInt').style.width = p + '%';
    $('frNote').textContent = 'Sans frais tu aurais ' + euro(gross) + ' ; avec ' + pctv(fee) + ' de frais, il te reste ' + euro(net) + '. Coût : ' + euro(cost) + ' sur ' + y + ' ans.';
  }
  function st() {
    var M = +$('pxCap').value, coup = +$('pxCoup').value, dec = +$('pxDec').value, N = +$('pxN').value, bar = +$('pxBar').value, ent = +$('pxEnt').value, ges = +$('pxGes').value, cgp = +$('pxCgp').value, sor = +$('pxSor').value;
    var mode = laboState.pxMode;
    if (+$('pxYr').max !== N) { $('pxYr').max = N; if (+$('pxYr').value > N) $('pxYr').value = N; }
    var yr = Math.min(+$('pxYr').value, N), perf = +$('pxPerf').value;
    $('pxCapV').textContent = euro(M); $('pxCoupV').textContent = pctv(coup); $('pxDecV').textContent = (Math.round(dec * 10) / 10).toString().replace('.', ',') + ' pts';
    $('pxNV').textContent = N + ' ans'; $('pxBarV').textContent = bar + ' %'; $('pxEntV').textContent = pctv(ent); $('pxGesV').textContent = pctv(ges);
    $('pxCgpV').textContent = pctv(cgp); $('pxSorV').textContent = pctv(sor); $('pxYrV').textContent = yr + ' ans'; $('pxPerfV').textContent = (perf > 0 ? '+' : '') + perf + ' %';
    var y = (mode === 'ech') ? N : yr;
    var gest = M * ges / 100 * y, exit = (mode === 'vol') ? M * sor / 100 : 0, entryProduit = M * ent / 100, entryCGP = M * cgp / 100;
    var netFees = entryCGP + gest + exit, cost = netFees, coupons = 0, capital = 0, valeur = 0, gain = 0, statut = '', extra = '';
    if (mode === 'auto') {
      coupons = M * coup / 100 * y; capital = M; valeur = Math.max(0, capital + coupons - netFees); gain = valeur - M;
      statut = 'Remboursement anticipé à ' + yr + ' ans : tu récupères le nominal (' + euro(M) + ') + les coupons versés. Pas de perte en capital, pas de coûts de sortie.';
    } else if (mode === 'ech') {
      var adj = perf - dec * N, lvl = 100 + adj;
      if (lvl >= bar) { capital = M; coupons = M * coup / 100 * N; statut = 'À l’échéance : sous-jacent net de décrément à ' + Math.round(adj) + ' % → au-dessus de la barrière (' + bar + ' %). Capital protégé + coupons.'; }
      else { capital = M * Math.max(0, lvl / 100); coupons = 0; statut = 'À l’échéance : sous-jacent net de décrément à ' + Math.round(adj) + ' % → sous la barrière (' + bar + ' %). Perte en capital : tu ne touches que ' + euro(capital) + '.'; }
      valeur = Math.max(0, capital + coupons - netFees); gain = valeur - M;
      extra = 'Le décrément retire ' + pctv(dec) + '/an à l’indice, soit ~' + Math.round(dec * N) + ' pts sur ' + N + ' ans : la performance brute de ' + (perf > 0 ? '+' : '') + perf + ' % devient ' + Math.round(adj) + ' % nette.';
    } else {
      var adj2 = perf - dec * yr, mkt = M * Math.max(0, (100 + adj2) / 100);
      coupons = 0; capital = mkt; valeur = Math.max(0, mkt - netFees); gain = valeur - M;
      statut = 'Sortie volontaire à ' + yr + ' ans (produit non rappelé) : tu vends au prix de marché ≈ ' + euro(mkt) + ', puis tu paies ' + euro(exit) + ' de coûts de sortie et la gestion. La protection du capital ne s’applique pas avant l’échéance.';
    }
    var rendNet = (M > 0 && y > 0) ? (Math.pow(Math.max(0, valeur) / M, 1 / y) - 1) * 100 : 0;
    $('pxCost').textContent = euro(cost); $('pxRes').textContent = euro(valeur); $('pxNet').textContent = pctv(rendNet);
    var lines = laboLine('Marge de structuration (déjà comprise dans le prix)', euro(entryProduit), false);
    if (entryCGP > 0) lines += laboLine('Frais d’entrée CGP / enveloppe', euro(entryCGP), false);
    lines += laboLine('Frais de gestion cumulés (' + y + ' an' + (y > 1 ? 's' : '') + ')', euro(gest), false);
    if (mode === 'vol') lines += laboLine('Coûts de sortie', euro(exit), false);
    if (coupons > 0) lines += laboLine('Coupons perçus', '+' + euro(coupons), false);
    lines += laboLine('Capital récupéré', euro(capital), false);
    lines += laboLine(gain >= 0 ? 'Gain net estimé' : 'Perte nette estimée', euro(gain), true);
    $('pxBreak').innerHTML = lines;
    var incid = (M > 0 && y > 0) ? ((entryProduit + entryCGP + gest + exit) / M / y * 100) : 0;
    $('pxNote').textContent = statut + (extra ? ' ' + extra : '') + ' · Incidence des coûts ≈ ' + pctv(incid) + '/an (toutes couches, comparable au DIC).';
  }
  function pxMode(m) {
    laboState.pxMode = m;
    $('scAuto').classList.toggle('on', m === 'auto'); $('scEch').classList.toggle('on', m === 'ech'); $('scVol').classList.toggle('on', m === 'vol');
    $('pxYrRow').style.display = (m === 'auto' || m === 'vol') ? '' : 'none';
    $('pxPerfRow').style.display = (m === 'ech' || m === 'vol') ? '' : 'none';
    $('pxSorRow').style.display = (m === 'vol') ? '' : 'none';
    $('pxScenHint').textContent = (m === 'auto') ? 'Le sous-jacent a rempli la condition de rappel : tu es remboursé par anticipation au nominal + coupons.' : (m === 'ech') ? 'Le produit va au terme : le remboursement dépend de la performance du sous-jacent (après décrément) face à la barrière.' : 'Tu revends avant le terme sur le marché secondaire : pas de protection, plus des coûts de sortie.';
    st();
  }
  function ciFreq(f) {
    laboState.ciFreq = f;
    $('ciFreqMois').classList.toggle('on', f === 'mois'); $('ciFreqAn').classList.toggle('on', f === 'an');
    $('ciPmtLbl').textContent = (f === 'an') ? 'Versement annuel' : 'Versement mensuel';
    ci();
  }
  function perFoyer(c) {
    laboState.perCouple = c;
    $('perSolo').classList.toggle('on', !c); $('perCouple').classList.toggle('on', c);
    $('perR2Row').style.display = c ? '' : 'none';
    per();
  }
  function perMode(m) {
    laboState.perMode = m;
    $('perLibre').classList.toggle('on', m === 'libre'); $('perObj').classList.toggle('on', m === 'obj');
    $('perLibreRow').style.display = (m === 'libre') ? '' : 'none'; $('perObjRow').style.display = (m === 'obj') ? '' : 'none';
    per();
  }
  ['ciCap', 'ciPmt', 'ciRate', 'ciYr', 'ciFeeIn', 'ciFeeMgmt'].forEach(function (id) { $(id).addEventListener('input', ci); });
  $('ciFreqMois').addEventListener('click', function () { ciFreq('mois'); });
  $('ciFreqAn').addEventListener('click', function () { ciFreq('an'); });
  ['perR1', 'perR2', 'perEnf', 'perVers', 'perTgt', 'perMo'].forEach(function (id) { $(id).addEventListener('input', per); });
  $('perSolo').addEventListener('click', function () { perFoyer(false); });
  $('perCouple').addEventListener('click', function () { perFoyer(true); });
  $('perLibre').addEventListener('click', function () { perMode('libre'); });
  $('perObj').addEventListener('click', function () { perMode('obj'); });
  ['crCap', 'crRate', 'crYr'].forEach(function (id) { $(id).addEventListener('input', cr); });
  ['frCap', 'frBrut', 'frFrais', 'frYr'].forEach(function (id) { $(id).addEventListener('input', fr); });
  ['pxCap', 'pxCoup', 'pxDec', 'pxBar', 'pxN', 'pxEnt', 'pxGes', 'pxCgp', 'pxSor', 'pxYr', 'pxPerf'].forEach(function (id) { $(id).addEventListener('input', st); });
  $('scAuto').addEventListener('click', function () { pxMode('auto'); });
  $('scEch').addEventListener('click', function () { pxMode('ech'); });
  $('scVol').addEventListener('click', function () { pxMode('vol'); });
  $('pxGuideBtn').addEventListener('click', function () {
    var hid = $('pxGuide').style.display === 'none';
    $('pxGuide').style.display = hid ? '' : 'none';
    $('pxGuideBtn').textContent = hid ? '✕ Masquer le guide' : '📄 Comment remplir depuis un DIC ? (exemples)';
  });
  $('pxFillCiti').addEventListener('click', function () {
    $('pxCap').value = 10000; $('pxCoup').value = 8; $('pxDec').value = 4.7; $('pxBar').value = 40; $('pxN').value = 12;
    $('pxEnt').value = 8.9; $('pxGes').value = 0.8; $('pxCgp').value = 0; $('pxSor').value = 1; pxMode('ech');
  });
  $('pxFillMS').addEventListener('click', function () {
    $('pxCap').value = 10000; $('pxCoup').value = 5.5; $('pxDec').value = 0; $('pxBar').value = 100; $('pxN').value = 12;
    $('pxEnt').value = 11.2; $('pxGes').value = 0.8; $('pxCgp').value = 0; $('pxSor').value = 0.5; pxMode('ech');
  });
  ciFreq(laboState.ciFreq); perFoyer(laboState.perCouple); perMode(laboState.perMode); cr(); fr(); pxMode(laboState.pxMode);
}

// ---- Calcul mental chronométré ----------------------------------------------
var MEN_TIME = 25;
var mentalState = { timer: null, left: 0, score: 0, idx: 0, total: 10, cur: null, log: [], answered: false };
function _ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
var MEN_GENS = [
  function () { var b = _ri(2, 40) * 10; return { q: '10 % de ' + fmtNum(b) + ' = ?', a: b * 0.10, method: '10 % = on décale la virgule d’un cran : ' + fmtNum(b) + ' ÷ 10.' }; },
  function () { var b = _ri(2, 40) * 10; return { q: '5 % de ' + fmtNum(b) + ' = ?', a: b * 0.05, method: '5 % = la moitié de 10 %. Prends 10 % puis ÷ 2.' }; },
  function () { var b = _ri(2, 30) * 10; return { q: '20 % de ' + fmtNum(b) + ' = ?', a: b * 0.20, method: '20 % = 10 % × 2.' }; },
  function () { var b = _ri(2, 20) * 20; return { q: '25 % de ' + fmtNum(b) + ' = ?', a: b * 0.25, method: '25 % = ÷ 4 (la moitié de la moitié).' }; },
  function () { var b = _ri(2, 40) * 10; return { q: '50 % de ' + fmtNum(b) + ' = ?', a: b * 0.50, method: '50 % = ÷ 2.' }; },
  function () { var b = _ri(3, 30) * 100; return { q: '1 % de ' + fmtNum(b) + ' = ?', a: b * 0.01, method: '1 % = ÷ 100.' }; },
  function () { var b = _ri(2, 20) * 20; return { q: '15 % de ' + fmtNum(b) + ' = ?', a: b * 0.15, method: '15 % = 10 % + sa moitié (5 %).' }; },
  function () { var n = _ri(4, 40) * 10; return { q: fmtNum(n) + ' × 5 = ?', a: n * 5, method: '×5 = ×10 puis ÷ 2.' }; },
  function () { var n = _ri(3, 30) * 4; return { q: fmtNum(n) + ' × 25 = ?', a: n * 25, method: '×25 = ×100 puis ÷ 4.' }; },
  function () { var n = _ri(4, 40) * 2; return { q: fmtNum(n) + ' × 50 = ?', a: n * 50, method: '×50 = ×100 puis ÷ 2.' }; },
  function () { var n = _ri(3, 20); return { q: fmtNum(n) + ' × 9 = ?', a: n * 9, method: '×9 = ×10 moins une fois le nombre.' }; },
  function () { var n = _ri(3, 20); return { q: fmtNum(n) + ' × 11 = ?', a: n * 11, method: '×11 = ×10 plus une fois le nombre.' }; },
  function () { var a = _ri(15, 90) * 10, b = _ri(15, 90) * 10; return { q: fmtNum(a) + ' + ' + fmtNum(b) + ' = ?', a: a + b, method: 'Arrondis à la centaine, additionne, puis rajuste.' }; },
  function () { var base = _ri(5, 40) * 100, p = _pick([10, 20, 25, 50]); return { q: 'Augmenter ' + fmtNum(base) + ' de ' + p + ' % = ?', a: base * (1 + p / 100), method: 'Augmenter de ' + p + ' % = ×(1 + ' + p + '/100). Ici ×' + (1 + p / 100).toString().replace('.', ',') + '.' }; },
  function () { var cap = _pick([5000, 10000, 20000, 50000]), r = _pick([2, 3, 4, 5]); return { q: 'Intérêts d’un an : ' + r + ' % de ' + fmtNum(cap) + ' = ?', a: cap * r / 100, method: 'Intérêts = capital × taux %. Ex : ' + r + ' % de ' + fmtNum(cap) + '.' }; },
  function () { var r = _pick([2, 3, 4, 6, 8, 9, 12]); return { q: 'À ' + r + ' %/an, en combien d’années un capital double (règle de 72) ?', a: Math.round(72 / r * 10) / 10, method: 'Temps pour doubler ≈ 72 ÷ taux. Ici 72 ÷ ' + r + '.' }; }
];
function mentalGen() { return _pick(MEN_GENS)(); }

function tplMental(v) {
  return '<div style="flex:1;overflow:auto;min-height:0;">' +
    '<div style="padding:58px 24px 0;"><button data-action="goBack" style="background:none;border:none;padding:0;font:500 12.5px \'Space Grotesk\',sans-serif;color:var(--acc);cursor:pointer;">&#8249; Retour</button>' +
    '<div style="font:300 34px/1.1 Newsreader,serif;letter-spacing:-.025em;margin-top:16px;text-align:center;">Calcul <span style="font-style:italic;">mental</span></div>' +
    '<div style="font:400 13px/1.6 \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:10px;text-align:center;">' + mentalState.total + ' questions, ' + MEN_TIME + ' s chacune. À chaque réponse, une astuce de calcul — et un récapitulatif complet à la fin.</div></div>' +
    '<div id="menStage" style="margin:22px 24px 0;"></div><div style="height:32px;"></div></div>';
}
function mentalIntroHtml(v) {
  return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:22px;text-align:center;">' +
    '<div style="font:300 22px Newsreader,serif;">Prêt ?</div>' +
    '<div style="font:400 12px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:10px;">Meilleur score : <b style="color:var(--ink);font-family:\'JetBrains Mono\',monospace;">' + v.mentalBest + '</b> / ' + mentalState.total + '</div>' +
    '<button data-action="mentalStart" style="margin-top:16px;border:none;border-radius:999px;padding:14px 22px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Commencer →</button></div>';
}
function wireMentalIntro() {
  var btn = document.querySelector('#menStage [data-action="mentalStart"]');
  if (btn) btn.addEventListener('click', mentalStart);
}
function mentalStart() { mentalState.score = 0; mentalState.idx = 0; mentalState.log = []; mentalNext(); }
function mentalNext() {
  if (mentalState.timer) { clearInterval(mentalState.timer); mentalState.timer = null; }
  if (mentalState.idx >= mentalState.total) { mentalEnd(); return; }
  mentalState.cur = mentalGen(); mentalState.left = MEN_TIME; mentalState.answered = false;
  var stage = document.getElementById('menStage');
  if (!stage) return;
  stage.innerHTML = '<div style="text-align:center;font:500 11px \'Space Grotesk\',sans-serif;color:var(--ink2);">Question ' + (mentalState.idx + 1) + ' / ' + mentalState.total + ' · Score ' + mentalState.score + '</div>' +
    '<div style="height:4px;border-radius:2px;background:var(--line);overflow:hidden;margin-top:10px;"><div id="menBar" style="height:4px;background:var(--acc);width:100%;"></div></div>' +
    '<div id="menTimer" style="text-align:center;font:500 26px \'JetBrains Mono\',monospace;margin-top:10px;color:var(--ink);">' + MEN_TIME + '</div>' +
    '<div id="menCard" style="background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:20px;margin-top:12px;">' +
    '<div id="menQ" style="font:300 22px/1.35 Newsreader,serif;text-align:center;"></div>' +
    '<input id="menInp" type="number" inputmode="decimal" autocomplete="off" placeholder="?" style="margin-top:16px;">' +
    '<div id="menTip" style="display:none;margin-top:12px;font:400 12.5px/1.6 \'Space Grotesk\',sans-serif;color:var(--acc);"></div>' +
    '<div style="margin-top:14px;"><button id="menValid" style="width:100%;border:none;border-radius:999px;padding:14px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Valider →</button></div></div>';
  var qEl = document.getElementById('menQ'), inp = document.getElementById('menInp');
  qEl.textContent = mentalState.cur.q;
  try { inp.focus(); } catch (e) {}
  function trySubmit() {
    if (String(inp.value).trim() === '') {
      inp.style.borderColor = 'var(--warn)';
      inp.placeholder = 'Réponse obligatoire';
      setTimeout(function () { inp.style.borderColor = ''; }, 900);
      return;
    }
    mentalAnswer(false);
  }
  document.getElementById('menValid').addEventListener('click', trySubmit);
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); trySubmit(); } });
  mentalState.timer = setInterval(function () {
    if (state.screen !== 'mental') { clearInterval(mentalState.timer); mentalState.timer = null; return; }
    mentalState.left--;
    var tEl = document.getElementById('menTimer');
    if (tEl) { tEl.textContent = mentalState.left; tEl.style.color = mentalState.left <= 5 ? 'var(--warn)' : 'var(--ink)'; }
    var bar = document.getElementById('menBar');
    if (bar) bar.style.width = Math.max(0, mentalState.left / MEN_TIME * 100) + '%';
    if (mentalState.left <= 0) { clearInterval(mentalState.timer); mentalState.timer = null; mentalAnswer(true); }
  }, 1000);
}
function mentalAnswer(timeout) {
  if (mentalState.answered) return;
  if (mentalState.timer) { clearInterval(mentalState.timer); mentalState.timer = null; }
  mentalState.answered = true;
  var inp = document.getElementById('menInp');
  var raw = inp ? inp.value : '';
  var val = parseFloat(String(raw).replace(',', '.'));
  var ok = (timeout !== true) && !isNaN(val) && Math.abs(val - mentalState.cur.a) < 0.01;
  if (ok) mentalState.score++;
  mentalState.log.push({ q: mentalState.cur.q, your: (timeout === true || raw === '') ? '—' : raw, a: mentalState.cur.a, ok: ok, method: mentalState.cur.method });
  var card = document.getElementById('menCard');
  if (inp) inp.disabled = true;
  var vb = document.getElementById('menValid'); if (vb) vb.style.display = 'none';
  var qEl = document.getElementById('menQ');
  if (qEl && !ok) qEl.innerHTML = esc(mentalState.cur.q) + '<div style="font:500 13px \'JetBrains Mono\',monospace;color:var(--warn);margin-top:8px;">Réponse : ' + fmtNum(mentalState.cur.a) + '</div>';
  var tip = document.getElementById('menTip');
  if (tip) { tip.innerHTML = '💡 ' + esc(mentalState.cur.method); tip.style.display = 'block'; }
  mentalState.idx++;
  if (card) {
    var nb = document.createElement('button');
    nb.style.cssText = 'width:100%;border:none;border-radius:999px;padding:14px;margin-top:14px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;';
    nb.textContent = (mentalState.idx >= mentalState.total ? 'Voir le récapitulatif →' : 'Question suivante →');
    nb.addEventListener('click', function () { if (state.screen === 'mental') mentalNext(); });
    card.appendChild(nb);
    try { nb.focus(); } catch (e) {}
  }
}
function mentalEnd() {
  var wasBest = mentalState.score > (store.mentalBest || 0);
  if (wasBest) { store.mentalBest = mentalState.score; save(); }
  var stage = document.getElementById('menStage');
  if (!stage) return;
  var pct = Math.round(mentalState.score / mentalState.total * 100);
  var h = '<div style="background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:22px;text-align:center;">' +
    '<div style="font:400 12px \'Space Grotesk\',sans-serif;color:var(--ink2);">Terminé !</div>' +
    '<div style="font:300 46px Newsreader,serif;margin-top:8px;">' + mentalState.score + ' / ' + mentalState.total + '</div>' +
    '<div style="font:400 12.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:6px;">' + (pct >= 80 ? 'Excellent' : pct >= 50 ? 'Bien' : 'À retravailler') + (wasBest ? ' — 🏆 nouveau record !' : '') + '</div>' +
    '<div style="font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink3);margin-top:4px;">Meilleur : <b style="color:var(--ink);font-family:\'JetBrains Mono\',monospace;">' + (store.mentalBest || 0) + '</b> / ' + mentalState.total + '</div>' +
    '<button id="menAgain" style="margin-top:14px;border:none;border-radius:999px;padding:14px 22px;font:600 13.5px \'Space Grotesk\',sans-serif;color:var(--on);cursor:pointer;background:linear-gradient(110deg,var(--acc2),var(--acc),var(--gold),var(--acc2));background-size:220% 100%;animation:kfSweep 10s linear infinite;">Rejouer →</button></div>';
  h += '<div style="margin-top:18px;"><div style="font:500 10px \'JetBrains Mono\',monospace;letter-spacing:.14em;color:var(--ink3);">RÉCAPITULATIF</div><div style="display:flex;flex-direction:column;gap:9px;margin-top:12px;">';
  mentalState.log.forEach(function (r) {
    h += '<div style="background:var(--panel);border:1px solid ' + (r.ok ? 'var(--line)' : 'var(--warn)') + ';border-radius:14px;padding:13px;">' +
      '<div style="display:flex;gap:9px;align-items:flex-start;font:400 12.5px/1.4 \'Space Grotesk\',sans-serif;"><span style="color:' + (r.ok ? 'var(--acc)' : 'var(--warn)') + ';font-weight:600;">' + (r.ok ? '✓' : '✗') + '</span><span>' + esc(r.q) + '</span></div>' +
      '<div style="font:400 11.5px \'Space Grotesk\',sans-serif;color:var(--ink2);margin-top:6px;">Ta réponse : <b style="color:var(--ink);">' + esc(r.your) + '</b> · Bonne réponse : <b style="color:var(--ink);">' + fmtNum(r.a) + '</b></div>' +
      '<div style="font:400 11px/1.5 \'Space Grotesk\',sans-serif;color:var(--acc);margin-top:6px;">💡 ' + esc(r.method) + '</div></div>';
  });
  h += '</div></div>';
  stage.innerHTML = h;
  document.getElementById('menAgain').addEventListener('click', mentalStart);
}

// ---- render loop -----------------------------------------------------------
var appEl, confettiEl, screenEl, tabsEl;
var lastScreenKey = null;
var lastReadyFlag = false;

function reviveSvgReveal(root) {
  root.querySelectorAll('svg').forEach(function (svg) {
    if (svg.querySelector('.v16bar-anim, .v16draw, [data-hole]')) return;
    Array.prototype.forEach.call(svg.children, function (c, i) {
      c.style.transformBox = 'fill-box';
      c.style.transformOrigin = 'center';
      c.style.animation = 'kfRise .4s cubic-bezier(.16,1,.3,1) both';
      c.style.animationDelay = (i * 0.06).toFixed(2) + 's';
    });
  });
}

function animateCountUp(root) {
  root.querySelectorAll('[data-countup]').forEach(function (el) {
    var target = parseFloat(el.getAttribute('data-countup'));
    if (!isFinite(target)) return;
    var suffix = el.getAttribute('data-countup-suffix') || '';
    var start = performance.now(), dur = 700;
    function tick(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

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
  appEl.setAttribute('data-theme', 'dark');
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
  else if (v.isCoursePole) html = tplCoursePole(v);
  else if (v.isFiche) html = tplFiche(v);
  else if (v.isProgress) html = tplProgress(v);
  else if (v.isProfile) html = tplProfile(v);
  else if (v.isLabo) html = tplLabo(v);
  else if (v.isMental) html = tplMental(v);
  else if (v.isBuilder) html = tplBuilder(v);
  screenEl.innerHTML = html;

  if (v.isLabo) wireLabo();
  if (v.isMental) {
    var menStage = document.getElementById('menStage');
    if (menStage) menStage.innerHTML = mentalIntroHtml(v);
    wireMentalIntro();
  }
  if (v.isBuilder) {
    var bldN = document.getElementById('bldN');
    if (bldN) bldN.addEventListener('input', function () {
      state.buildN = +bldN.value;
      document.getElementById('bldNV').textContent = state.buildN;
    });
  }
  if (v.isFiche) {
    screenEl.querySelectorAll('[data-fold-head]').forEach(function (hd) {
      hd.addEventListener('click', function () {
        var sec = hd.parentElement, body = sec.querySelector('.fold-body'), arr = hd.querySelector('.fold-arr');
        var open = sec.classList.toggle('open');
        body.classList.toggle('fold-closed', !open);
        arr.style.transform = 'rotate(' + (open ? '90deg' : '0deg') + ')';
        if (open) {
          var inner = body.firstElementChild;
          if (inner) {
            var html = inner.innerHTML;
            inner.innerHTML = '';
            void inner.offsetWidth;
            inner.innerHTML = html;
          }
        }
      });
    });
  }

  reviveSvgReveal(screenEl);

  var justBecameReady = state.ready && !lastReadyFlag;
  lastReadyFlag = state.ready;

  if (v.screenKey !== lastScreenKey) {
    lastScreenKey = v.screenKey;
    var animClass = state.navDir === 'fwd' ? 'kfin-fwd' : state.navDir === 'back' ? 'kfin-back' : 'kfin';
    state.navDir = null;
    screenEl.classList.remove('kfin', 'kfin-fwd', 'kfin-back');
    void screenEl.offsetWidth;
    screenEl.classList.add(animClass);
    animateCountUp(screenEl);
  } else if (justBecameReady) {
    animateCountUp(screenEl);
  }
}

// ---- event dispatch ---------------------------------------------------------
function onAppClick(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var d = btn.dataset;
  switch (d.action) {
    case 'resetProgress':
      if (confirm('Réinitialiser toute ta progression ? Cette action est irréversible.')) {
        try { localStorage.removeItem(KEY); } catch (e) {}
        location.reload();
      }
      break;
    case 'toggleNotif': state.notif = !state.notif; render(); break;
    case 'goTab': go(d.k); break;
    case 'restartOnb': state.screen = 'onb'; state.onb = 0; render(); break;
    case 'onbNext': state.onb = Math.min(2, state.onb + 1); render(); break;
    case 'pickLevel': state.level = +d.idx; render(); break;
    case 'startDiag': startDiagQuiz(); break;
    case 'startDaily': startDailyQuiz(); break;
    case 'startSrs': startSrsQuiz(); break;
    case 'goHome': go('home'); break;
    case 'goBack': goBack(); break;
    case 'goBrowse': goChild('browse'); break;
    case 'goSrs': go('srs'); break;
    case 'goCourses': go('courses'); break;
    case 'goExamPick': goChild('examPick'); break;
    case 'goLabo': goChild('labo'); break;
    case 'goMental': goChild('mental'); break;
    case 'goBuilder': goChild('builder'); break;
    case 'coursePoleGo': goChild('coursePole', { coursePoleSel: d.pole }); break;
    case 'buildLevel': state.buildLevel = d.lv; render(); break;
    case 'buildDom': {
      var domV = d.dom;
      if (domV === 'all') { state.buildDom = ['all']; }
      else {
        state.buildDom = state.buildDom.filter(function (x) { return x !== 'all'; });
        var di = state.buildDom.indexOf(domV);
        if (di >= 0) state.buildDom.splice(di, 1); else state.buildDom.push(domV);
        if (!state.buildDom.length) state.buildDom = ['all'];
      }
      render();
      break;
    }
    case 'buildType': {
      var typV = d.t, ti = state.buildTypes.indexOf(typV);
      if (ti >= 0) { if (state.buildTypes.length > 1) state.buildTypes.splice(ti, 1); }
      else state.buildTypes.push(typV);
      render();
      break;
    }
    case 'startBuilder': if (buildPool().length) startBuilder(); break;
    case 'poleToggle':
      state.openPole = state.openPole === d.pole ? null : d.pole;
      state.screen = 'browse';
      render();
      break;
    case 'catGo': goChild('cat', { cat: d.cat }); break;
    case 'subGo':
      if (d.theory) { goChild('fiche', { fiche: d.theory }); }
      else startCat(d.sub, 12);
      break;
    case 'ficheGo': goChild('fiche', { fiche: d.fiche }); break;
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
      else if (it.q.type === 'texte' || it.q.type === 'open') { state.ans = 'reveal'; render(); }
      else if (it.q.type === 'memviz') { if (state.revealed) grade(true); else { state.revealed = true; render(); } }
      else if (it.q.type === 'order') {
        var ok = !!(state.orderCur && state.orderCur.every(function (v, i) { return v === i; }));
        grade(ok);
      }
      break;
    }
    case 'orderUp': {
      var pos = +d.pos;
      if (state.orderCur && pos > 0) { var tmp = state.orderCur[pos]; state.orderCur[pos] = state.orderCur[pos - 1]; state.orderCur[pos - 1] = tmp; render(); }
      break;
    }
    case 'orderDown': {
      var pos2 = +d.pos;
      if (state.orderCur && pos2 < state.orderCur.length - 1) { var tmp2 = state.orderCur[pos2]; state.orderCur[pos2] = state.orderCur[pos2 + 1]; state.orderCur[pos2 + 1] = tmp2; render(); }
      break;
    }
    case 'selfOk': grade(true, nextQ); break;
    case 'selfMid': grade(true, nextQ); break;
    case 'selfKo': grade(false, nextQ); break;
    case 'next': nextQ(); break;
    case 'quitQuiz': goBack(); break;
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
    case 'weakGo': goChild('browse', { openPole: d.pole }); break;
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
