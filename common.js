// 바로핏 공통 기능: 기록 통계, 레벨, 배지, 포인트, 출석 체크, 축하 화면, 앱 설치(PWA)
(function () {
  "use strict";
  var LOG_KEY = "barofit-log", BADGE_KEY = "barofit-badges", PT_KEY = "barofit-points", LV_KEY = "barofit-level", UI_KEY = "barofit-ui";
  var DAILY_CAP = 300; // 하루에 받을 수 있는 최대 포인트

  function pad2(n) { return String(n).padStart(2, "0"); }
  function dayStr(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function shift(days) { var d = new Date(); d.setDate(d.getDate() + days); return dayStr(d); }
  function read(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function settings() { return read("barofit", {}); }
  function isCoach() { return true; }
  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ===== 기록 통계 =====
  function load() { return read(LOG_KEY, []); }
  function stats(log) {
    log = log || load();
    var W = log.filter(function (e) { return e.type === "workout"; }), S = log.filter(function (e) { return e.type === "sitting"; });
    var s = { workouts: W.length, sittings: S.length, totalMin: 0, reps: {}, plankBest: 0, perfect: false, routines: 0, parts: {}, goodReps: 0, allReps: 0 };
    W.forEach(function (w) {
      s.totalMin += w.durationSec / 60; if (w.routine) s.routines++;
      w.items.forEach(function (it) {
        s.parts[it.group] = true; var g = 0, t = 0;
        it.sets.forEach(function (st) { var n = st.good + st.bad; s.reps[it.ex] = (s.reps[it.ex] || 0) + n; g += st.good; t += n; if (it.hold) s.plankBest = Math.max(s.plankBest, st.hold); });
        s.goodReps += g; s.allReps += t; if (!it.hold && t >= 10 && g === t) s.perfect = true;
      });
    });
    var days = {}; W.forEach(function (w) { days[w.date] = true; });
    var streak = 0, d = new Date(); if (!days[dayStr(d)]) d.setDate(d.getDate() - 1);
    while (days[dayStr(d)]) { streak++; d.setDate(d.getDate() - 1); }
    var sorted = Object.keys(days).sort(), best = 0, run = 0, prev = null;
    sorted.forEach(function (k) { var dt = new Date(k + "T00:00:00"); if (prev && (dt - prev) / 864e5 === 1) run++; else run = 1; best = Math.max(best, run); prev = dt; });
    s.streak = streak; s.bestStreak = best;
    var sitDay = {}; S.forEach(function (x) { sitDay[x.date] = (sitDay[x.date] || 0) + x.durationSec; });
    s.sit2h = Object.keys(sitDay).some(function (k) { return sitDay[k] >= 7200; });
    s.sitGood = S.some(function (x) { return x.durationSec >= 1800 && x.goodPct >= 90; });
    s.partCount = Object.keys(s.parts).length;
    s.early = W.some(function (w) { return new Date(w.start).getHours() < 9; });
    var since = shift(-6), recentDays = {}; W.forEach(function (w) { if (w.date >= since) recentDays[w.date] = true; });
    s.week4 = Object.keys(recentDays).length >= 4;
    s.xp = Math.round(s.totalMin * 10 + s.goodReps * 2 + S.reduce(function (a, x) { return a + x.durationSec / 60 * x.goodPct / 100; }, 0));
    return s;
  }

  // ===== 레벨 =====
  var LEVELS = [
    { xp: 0, name: "루키" }, { xp: 300, name: "브론즈" }, { xp: 800, name: "실버" }, { xp: 1600, name: "골드" },
    { xp: 3000, name: "플래티넘" }, { xp: 5000, name: "다이아몬드" }, { xp: 8000, name: "마스터" }
  ];
  function level(xp) {
    var i = 0; while (i < LEVELS.length - 1 && xp >= LEVELS[i + 1].xp) i++;
    var cur = LEVELS[i], next = LEVELS[i + 1];
    return { lv: i + 1, name: cur.name, xp: xp, next: next ? next.xp : null, nextName: next ? next.name : null,
      pct: next ? Math.round((xp - cur.xp) / (next.xp - cur.xp) * 100) : 100 };
  }

  // ===== 배지 =====
  var BADGES = [
    { id: "first_workout", icon: "🏁", name: "첫 운동", desc: "운동을 처음 끝냈어요", test: function (s) { return s.workouts >= 1; } },
    { id: "early", icon: "🌅", name: "아침형 인간", desc: "오전 9시 전에 운동했어요", test: function (s) { return s.early; } },
    { id: "streak3", icon: "🔥", name: "작심삼일 돌파", desc: "3일 연속 운동했어요", test: function (s) { return s.bestStreak >= 3; } },
    { id: "streak7", icon: "🗓️", name: "일주일 개근", desc: "7일 연속 운동했어요", test: function (s) { return s.bestStreak >= 7; } },
    { id: "squat100", icon: "🦵", name: "스쿼트 100", desc: "스쿼트 누적 100회", test: function (s) { return (s.reps.squat || 0) >= 100; } },
    { id: "pushup100", icon: "💪", name: "푸시업 100", desc: "푸시업 누적 100회", test: function (s) { return (s.reps.pushup || 0) >= 100; } },
    { id: "plank60", icon: "🧱", name: "1분 버티기", desc: "플랭크 한 세트 60초", test: function (s) { return s.plankBest >= 60; } },
    { id: "perfect", icon: "💯", name: "완벽한 자세", desc: "10회 이상을 모두 바른 자세로", test: function (s) { return s.perfect; } },
    { id: "routine5", icon: "📋", name: "루틴 마스터", desc: "루틴을 5번 끝냈어요", test: function (s) { return s.routines >= 5; } },
    { id: "allparts", icon: "🧍", name: "전신 골고루", desc: "6개 부위를 모두 운동했어요", test: function (s) { return s.partCount >= 6; } },
    { id: "week4", icon: "📆", name: "주 4회 운동러", desc: "최근 7일 중 4일 운동했어요", test: function (s) { return s.week4; } },
    { id: "form95", icon: "🎯", name: "정확한 폼", desc: "누적 200회 이상, 바른 자세 95%", test: function (s) { return s.allReps >= 200 && s.goodReps / s.allReps >= 0.95; } },
    { id: "min300", icon: "⏱️", name: "300분 클럽", desc: "누적 운동 300분", test: function (s) { return s.totalMin >= 300; } }
  ];
  function unlocked() { return read(BADGE_KEY, []); }

  // ===== 포인트 =====
  function wallet() { var w = read(PT_KEY, null); return w || { balance: 0, history: [], lastCheckin: null, checkinStreak: 0, daily: {} }; }
  function addPoints(p, reason) {
    var w = wallet(), today = dayStr(new Date()), used = (w.daily && w.daily[today]) || 0;
    var give = Math.max(0, Math.min(p, DAILY_CAP - used));
    if (!give) return 0;
    w.balance += give; w.daily = {}; w.daily[today] = used + give;
    w.history.unshift({ t: Date.now(), p: give, reason: reason }); w.history = w.history.slice(0, 100);
    write(PT_KEY, w); updatePill(); return give;
  }
  function canCheckin() { return wallet().lastCheckin !== dayStr(new Date()); }
  function checkin() {
    var w = wallet(), today = dayStr(new Date());
    if (w.lastCheckin === today) return [];
    w.checkinStreak = w.lastCheckin === shift(-1) ? (w.checkinStreak || 0) + 1 : 1;
    w.lastCheckin = today; write(PT_KEY, w);
    var out = [], g = addPoints(10, "출석 체크");
    if (g) out.push({ p: g, reason: "출석 체크" });
    if (w.checkinStreak % 7 === 0) { var b = addPoints(50, w.checkinStreak + "일 연속 출석 보너스"); if (b) out.push({ p: b, reason: w.checkinStreak + "일 연속 출석 보너스" }); }
    return out;
  }

  // 운동·앉은 자세가 끝났을 때: 포인트 + 배지 + 레벨업을 한 번에 처리하고 축하 화면
  function afterSession(kind, data) {
    var gains = [];
    function give(p, reason) { var g = addPoints(p, reason); if (g) gains.push({ p: g, reason: reason }); }
    if (kind === "workout" && data) {
      var min = Math.round(data.durationSec / 60), good = 0, all = 0;
      data.items.forEach(function (it) { it.sets.forEach(function (st) { good += st.good; all += st.good + st.bad; }); });
      if (min >= 1) give(Math.min(60, min), "운동 " + min + "분");
      if (data.routine) give(30, "루틴 완료");
      if (all >= 10 && good / all >= 0.9) give(20, "바른 자세 보너스");
    }
    if (kind === "sitting" && data) {
      if (data.durationSec >= 1800) give(10, "앉은 자세 30분 이상");
      if (data.durationSec >= 600 && data.goodPct >= 80) give(10, "바른 자세 80% 이상");
    }
    var s = stats(), got = unlocked(), fresh = BADGES.filter(function (b) { return got.indexOf(b.id) < 0 && b.test(s); });
    if (fresh.length) { write(BADGE_KEY, got.concat(fresh.map(function (b) { return b.id; }))); fresh.forEach(function (b) { give(50, "배지: " + b.name); }); }
    var lv = level(s.xp), prevLv = read(LV_KEY, 1), up = lv.lv > prevLv;
    write(LV_KEY, lv.lv);
    if (gains.length || fresh.length || up) setTimeout(function () { celebrate({ gains: gains, badges: fresh, level: up ? lv : null }); }, 1800);
    return { gains: gains, badges: fresh, level: up ? lv : null };
  }

  // ===== 화면 조각 (CSS) =====
  // 화면 테마 (모든 페이지 공통)
  (function () {
    var st = {}; try { st = JSON.parse(localStorage.getItem("barofit") || "{}"); } catch (e) {}
    var dark = st.theme === "dark" || (st.theme !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  })();
  var css = document.createElement("style");
  css.textContent =
    "html[data-theme=dark]{--paper:#0E1014;--surface:#171A20;--ink:#F2F4F7;--ink-2:#A0A8B4;--hair:#2A2F38;color-scheme:dark}" +
    "html[data-theme=dark] body{background:var(--paper);color:var(--ink)}" +
    "html[data-theme=dark] .top{background:rgba(14,16,20,.86)!important}" +
    "html[data-theme=dark] .tabbar{background:rgba(23,26,32,.94)!important;border-color:#2A2F38!important}" +
    "html[data-theme=dark] .pt-pill,html[data-theme=dark] .gear{background:#171A20;color:#F2F4F7;box-shadow:inset 0 0 0 1px #2A2F38}" +
    "html[data-theme=dark] .sheet{background:#171A20;color:#F2F4F7}" +
    "html[data-theme=dark] .nav{background:#171A20!important;box-shadow:inset 0 0 0 1px #2A2F38!important}" +
    "html[data-theme=dark] .nav a.on{background:#F2F4F7!important;color:#16181D!important}" +
    ".pt-pill{border:0;border-radius:999px;padding:9px 12px;font:inherit;font-size:13px;font-weight:800;background:#fff;color:#16181D;box-shadow:inset 0 0 0 1px #DCE1E7;white-space:nowrap;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:5px}" +
    ".pt-pill i{font-style:normal;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#FFC800;color:#16181D;font-size:11px;font-weight:900}" +
    "@media (max-width:720px){.pt-pill{margin-left:auto}}" +
    ".sheet-bg{position:fixed;inset:0;z-index:58;background:rgba(16,24,40,.38);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}" +
    ".sheet-bg.show{opacity:1}" +
    ".sheet{width:min(100%,520px);background:#fff;border-radius:28px 28px 0 0;padding:22px 22px calc(22px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .32s cubic-bezier(.2,.9,.3,1.1)}" +
    "@media (min-width:721px){.sheet-bg{align-items:center}.sheet{border-radius:28px}}" +
    ".sheet-bg.show .sheet{transform:none}" +
    ".sheet h3{margin:0;font-size:22px;font-weight:900;letter-spacing:-.6px}" +
    ".sheet p{margin:8px 0 0;color:#5B616B;font-size:14.5px;line-height:1.55}" +
    ".stamps{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin:18px 0}" +
    ".stamp{aspect-ratio:1;border-radius:14px;background:#F2F4F7;display:grid;place-items:center;font-size:12px;font-weight:800;color:#8A919B}" +
    ".stamp.on{background:#FFE14D;color:#16181D}" +
    "[data-persona=coach] .stamp.on{background:#3557F5;color:#fff}" + ".gain-list li b{color:#3557F5}" +
    ".stamp.today{box-shadow:inset 0 0 0 2.5px #16181D}" +
    ".sheet .go{display:block;width:100%;border:0;border-radius:16px;padding:16px;font:inherit;font-size:16px;font-weight:800;background:#16181D;color:#fff;cursor:pointer;margin-top:6px}" +
    ".sheet .later{display:block;width:100%;border:0;background:none;font:inherit;font-size:14px;color:#8A919B;padding:12px;cursor:pointer}" +
    ".gain-list{list-style:none;margin:16px 0 8px;padding:0;display:grid;gap:8px}" +
    ".gain-list li{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:14px;background:#F2F4F7;font-weight:700;font-size:15px}" +
    ".gain-list li b{color:#B88600}" +
    ".gain-list li .ic{font-size:22px;margin-right:10px}" +
    ".lvup{margin-top:12px;padding:14px;border-radius:16px;background:#E8F7EF;font-weight:800;color:#0D7A4A}" +
    ".install{position:fixed;left:12px;right:12px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:45;background:#16181D;color:#fff;border-radius:18px;padding:14px 44px 14px 16px;font-size:14px;line-height:1.5;box-shadow:0 12px 30px rgba(16,24,40,.3)}" +
    ".install b{display:block;font-size:15px}" +
    ".install button{position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;border-radius:10px;background:rgba(255,255,255,.12);color:#fff;font-size:18px;cursor:pointer}" +
    "@media (min-width:721px){.install{left:auto;width:360px;bottom:24px}}" +
    "@keyframes ptpop{0%{transform:scale(.6)}60%{transform:scale(1.15)}100%{transform:scale(1)}}" +
    ".pt-pill.pop{animation:ptpop .5s}";
  document.head.appendChild(css);

  // ===== 상단 포인트 표시 =====
  var pill = null;
  function updatePill() {
    if (!pill) return;
    pill.innerHTML = "<i>P</i>" + fmt(wallet().balance);
    pill.classList.remove("pop"); void pill.offsetWidth; pill.classList.add("pop");
  }
  function mountPill() {
    var top = document.querySelector("header.top"); if (!top) return;
    pill = document.createElement("a"); pill.className = "pt-pill"; pill.href = "records.html#points"; pill.setAttribute("aria-label", "내 포인트");
    top.appendChild(pill); pill.innerHTML = "<i>P</i>" + fmt(wallet().balance);
  }

  // ===== 시트(아래에서 올라오는 창) =====
  function sheet(html, onReady) {
    var bg = document.createElement("div"); bg.className = "sheet-bg"; bg.setAttribute("role", "dialog"); bg.setAttribute("aria-modal", "true");
    bg.innerHTML = '<div class="sheet">' + html + "</div>";
    document.body.appendChild(bg);
    function close() { bg.classList.remove("show"); setTimeout(function () { bg.remove(); }, 250); }
    bg.addEventListener("click", function (e) { if (e.target === bg || e.target.closest("[data-close]")) close(); });
    requestAnimationFrame(function () { bg.classList.add("show"); });
    if (onReady) onReady(bg, close);
    return close;
  }

  function celebrate(r) {
    var coach = isCoach(), items = "";
    r.badges.forEach(function (b) { items += '<li><span><span class="ic">' + b.icon + "</span>새 배지: " + esc(b.name) + "</span><b>+50P</b></li>"; });
    r.gains.filter(function (g) { return g.reason.indexOf("배지:") !== 0; }).forEach(function (g) { items += "<li><span>" + esc(g.reason) + "</span><b>+" + g.p + "P</b></li>"; });
    var total = r.gains.reduce(function (a, g) { return a + g.p; }, 0);
    var title = "수고하셨어요!";
    sheet("<h3>" + title + "</h3><p>" + (total ? "포인트 " + fmt(total) + "P를 받았어요. 모은 포인트는 상점 혜택에 쓸 수 있어요." : "오늘의 기록이 저장됐어요.") + "</p>" +
      (items ? '<ul class="gain-list">' + items + "</ul>" : "") +
      (r.level ? '<div class="lvup">레벨 업! Lv.' + r.level.lv + " " + esc(r.level.name) + "이(가) 되었어요.</div>" : "") +
      '<button class="go" data-close>좋아요</button>');
  }

  function checkinSheet() {
    var w = wallet(), coach = isCoach(), d = settings().dialect;
    var streak = w.lastCheckin === shift(-1) ? (w.checkinStreak || 0) : 0, html = "";
    var dayOfCycle = (streak % 7) + 1;
    for (var i = 1; i <= 7; i++) html += '<div class="stamp' + (i < dayOfCycle ? " on" : "") + (i === dayOfCycle ? " today" : "") + '">' + (i === 7 ? "+50" : i + "일") + "</div>";
    var title = "오늘도 오셨네요!";
    sheet("<h3>" + title + "</h3><p>매일 출석하면 10P, 7일 연속이면 보너스 50P를 더 드려요. 운동을 끝낼 때마다 포인트가 더 쌓여요.</p>" +
      '<div class="stamps">' + html + "</div>" +
      '<button class="go" id="ckGo">출석하고 10P 받기</button><button class="later" data-close>나중에</button>', function (bg, close) {
        bg.querySelector("#ckGo").addEventListener("click", function () {
          var got = checkin(); close();
          var total = got.reduce(function (a, g) { return a + g.p; }, 0);
          setTimeout(function () { sheet("<h3>출석 완료!</h3><p>" + (total ? "+" + total + "P를 받았어요." : "오늘 받을 수 있는 포인트를 모두 받았어요.") + "</p>" + '<ul class="gain-list">' + got.map(function (g) { return "<li><span>" + esc(g.reason) + "</span><b>+" + g.p + "P</b></li>"; }).join("") + '</ul><button class="go" data-close>확인</button>'); }, 300);
        });
      });
  }

  // ===== 홈 화면 추가 안내 (아이폰·아이패드 사파리) =====
  function standalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  function maybeInstallHint() {
    if (standalone()) return;
    var ui = read(UI_KEY, {}); ui.visits = (ui.visits || 0) + 1; write(UI_KEY, ui);
    if (ui.visits < 3) return; // 처음 두 번은 보여주지 않음
    if (ui.installHideUntil && Date.now() < ui.installHideUntil) return;
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var el = document.createElement("div"); el.className = "install"; el.setAttribute("role", "note");
    el.innerHTML = "<b>앱처럼 쓰려면 홈 화면에 추가하세요</b>" + (ios ? "사파리 아래쪽(또는 위쪽)의 공유 버튼을 누르고 ‘홈 화면에 추가’를 고르면 돼요." : "브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 고르면 돼요.") + '<button aria-label="닫기">×</button>';
    el.querySelector("button").addEventListener("click", function () { el.remove(); ui.installHideUntil = Date.now() + 3 * 864e5; write(UI_KEY, ui); });
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 9000);
  }

  // ===== 시작 =====
  window.HM = { load: load, stats: stats, level: level, LEVELS: LEVELS, BADGES: BADGES, unlocked: unlocked, wallet: wallet, addPoints: addPoints,
    canCheckin: canCheckin, checkin: checkin, checkinSheet: checkinSheet, afterSession: afterSession, celebrate: celebrate, sheet: sheet, dayStr: dayStr, fmt: fmt, updatePill: updatePill };
  mountPill();
  var chosen = true;
  if (chosen) setTimeout(function () { if (canCheckin()) checkinSheet(); else maybeInstallHint(); }, 900);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
})();
