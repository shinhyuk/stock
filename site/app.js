(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pct(x) { return (100 * x).toFixed(1) + "%"; }
  function px(x) { return x == null ? "–" : Number(x).toFixed(2); }

  // The time machine's verdict, in Korean, plus a tone for the badge.
  var VERDICTS = [
    ["Close to a coin flip", "거의 동전 던지기", "flat"],
    ["Close to break-even", "본전 근처", "flat"],
    ["Leans toward the target", "목표 쪽으로 기울어짐", "good"],
    ["Leans toward the stop", "손절 쪽으로 기울어짐", "bad"],
    ["Strongly toward the target", "목표 쪽으로 뚜렷함", "good"],
    ["Strongly toward the stop", "손절 쪽으로 뚜렷함", "bad"],
    ["No replay reached", "목표·손절 모두 미도달", "flat"]
  ];
  function verdict(text) {
    for (var i = 0; i < VERDICTS.length; i++) {
      if (String(text).indexOf(VERDICTS[i][0]) === 0) return { ko: VERDICTS[i][1], tone: VERDICTS[i][2] };
    }
    return { ko: text, tone: "flat" };
  }
  var OUTCOME = { target: "목표", stop: "손절", close: "둘 다 아님" };

  // 일별 추천: 1만 번 결과와 지난 날 실제 기록이 둘 다 같은 쪽을 가리킬 때만 '후보'.
  var GRADE = { pick: "오늘의 후보", watch: "애매", pass: "패스", none: "결과 없음" };
  function grade(t) {
    if (!t.tm) return { key: "none", score: -99 };
    var m = t.tm.mc, h = t.tm.history || {}, v = verdict(t.tm.verdict);
    var hn = h.triggered || 0, hR = hn ? h.avg_R : null;
    var key;
    if (v.tone === "good" && m.avg_R > 0 && hn >= 10 && hR > 0) key = "pick";
    else if (v.tone === "bad" || (m.avg_R <= 0 && (hR == null || hR <= 0))) key = "pass";
    else key = "watch";
    return { key: key, score: m.avg_R + (hn >= 10 ? 0.5 * hR : 0) };
  }
  function gradeBadge(g) {
    var tone = { pick: "good", watch: "flat", pass: "bad", none: "flat" }[g.key];
    return '<span class="grade ' + tone + '">' + GRADE[g.key] + "</span>";
  }

  function getJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(url + " → HTTP " + r.status);
      return r.json();
    });
  }

  // Fan chart: 5/25/50/75/95 percentile bands of the replays, with entry / stop / target lines.
  function fanChart(tm) {
    var p = tm.plan, m = tm.mc, bands = m.bands || [], times = m.band_times || [];
    if (!bands.length) return "";
    var W = 560, H = 260, L = 52, R = 88, T = 10, B = 24;
    var lo = Math.min(p.stop, p.target), hi = Math.max(p.stop, p.target);
    bands.forEach(function (b) { lo = Math.min(lo, b[0]); hi = Math.max(hi, b[4]); });
    var pad = (hi - lo) * 0.05 || 0.5; lo -= pad; hi += pad;
    var n = bands.length;
    var x = function (j) { return L + (n === 1 ? 0 : j * (W - L - R) / (n - 1)); };
    var y = function (v) { return T + (hi - v) * (H - T - B) / (hi - lo); };
    function area(a, b) {
      var top = bands.map(function (bd, j) { return x(j).toFixed(1) + "," + y(bd[b]).toFixed(1); });
      var bot = bands.map(function (bd, j) { return x(j).toFixed(1) + "," + y(bd[a]).toFixed(1); }).reverse();
      return "M" + top.join("L") + "L" + bot.join("L") + "Z";
    }
    var med = "M" + bands.map(function (bd, j) { return x(j).toFixed(1) + "," + y(bd[2]).toFixed(1); }).join("L");
    function hline(v, color, label, dash) {
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + color +
        '" stroke-width="1.5"' + (dash ? ' stroke-dasharray="4 3"' : "") + '/>' +
        '<text x="' + (W - R + 4) + '" y="' + (y(v) + 4) + '">' + label + "</text>";
    }
    var ticks = "";
    [0, Math.floor((n - 1) / 2), n - 1].forEach(function (j) {
      ticks += '<text x="' + x(j) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(times[j] || "") + "</text>";
    });
    [hi - pad, (hi + lo) / 2, lo + pad].forEach(function (v) {
      ticks += '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v.toFixed(2) + "</text>";
    });
    var cs = getComputedStyle(document.documentElement);
    var good = cs.getPropertyValue("--good"), bad = cs.getPropertyValue("--bad"), flat = cs.getPropertyValue("--flat");
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="시뮬레이션 가격 범위">' +
      '<path d="' + area(0, 4) + '" fill="var(--band-outer)"/>' +
      '<path d="' + area(1, 3) + '" fill="var(--band-inner)"/>' +
      '<path d="' + med + '" fill="none" stroke="var(--median)" stroke-width="2"/>' +
      hline(p.target, good, "목표 " + px(p.target)) +
      hline(p.entry, flat, "진입 " + px(p.entry), true) +
      hline(p.stop, bad, "손절 " + px(p.stop)) + ticks + "</svg>" +
      '<div class="legend"><span><i style="background:var(--median)"></i>중앙값</span>' +
      '<span><i style="background:var(--band-inner)"></i>가운데 50%</span>' +
      '<span><i style="background:var(--band-outer)"></i>90%</span></div>';
  }

  // Where the 10,000 replays closed, as a small histogram.
  function closeHist(tm) {
    var h = tm.mc.hist, p = tm.plan;
    if (!h || !h.bins || !h.bins.length) return "";
    var W = 360, H = 150, B = 22, n = h.bins.length, max = Math.max.apply(null, h.bins) || 1;
    var bw = W / n, step = (h.hi - h.lo) / n, out = "";
    h.bins.forEach(function (c, i) {
      var mid = h.lo + (i + 0.5) * step;
      var color = mid >= p.target ? "var(--good)" : mid <= p.stop ? "var(--bad)" : "var(--flat)";
      var bh = (H - B - 4) * c / max;
      out += '<rect x="' + (i * bw + 1) + '" y="' + (H - B - bh) + '" width="' + (bw - 2) + '" height="' + bh +
        '" fill="' + color + '" opacity="0.8"/>';
    });
    out += '<text x="0" y="' + (H - 6) + '">' + h.lo.toFixed(2) + "</text>";
    out += '<text x="' + W + '" y="' + (H - 6) + '" text-anchor="end">' + h.hi.toFixed(2) + "</text>";
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="장 마감 가격 분포">' + out + "</svg>";
  }

  function tradeCard(t, news) {
    var g = grade(t);
    var head = '<h2>' + esc(t.symbol) + " " + gradeBadge(g) + ' <span class="px">' + esc(t.hit.at || "") + " 진입가 " + px(t.hit.price) +
      " · 범위 " + px(t.hit.or_low) + " ~ " + px(t.hit.or_high) + " (+" + esc(t.hit.pct_over) + "%)</span></h2>";
    if (!t.tm) {
      return '<article class="card" id="c-' + esc(t.symbol) + '">' + head + '<p class="err">' + esc(t.error || "결과 없음") + "</p></article>";
    }
    var tm = t.tm, p = tm.plan, m = tm.mc, h = tm.history || {}, v = verdict(tm.verdict);
    var levels = '<div class="levels">' +
      '<div><div class="k">진입</div><div class="v">' + px(p.entry) + "</div></div>" +
      '<div class="stop"><div class="k">손절 (범위 가운데)</div><div class="v">' + px(p.stop) + "</div></div>" +
      '<div class="target"><div class="k">목표 (위험의 ' + esc(m.r_at_target) + '배)</div><div class="v">' + px(p.target) + "</div></div>" +
      '<div><div class="k">주당 위험</div><div class="v">' + px(p.risk_per_share) + "</div></div>" +
      '<div><div class="k">평균 R</div><div class="v">' + (m.avg_R > 0 ? "+" : "") + m.avg_R.toFixed(3) + "</div></div>" +
      "</div>";
    var odds = '<div class="odds">' +
      '<span class="t" style="width:' + pct(m.p_target) + '">' + (m.p_target > 0.08 ? "목표 " + pct(m.p_target) : "") + "</span>" +
      '<span class="s" style="width:' + pct(m.p_stop) + '">' + (m.p_stop > 0.08 ? "손절 " + pct(m.p_stop) : "") + "</span>" +
      '<span class="n" style="width:' + pct(m.p_neither) + '">' + (m.p_neither > 0.08 ? "둘 다 아님 " + pct(m.p_neither) : "") + "</span>" +
      "</div>" +
      '<div class="legend"><span><i style="background:var(--good)"></i>목표 먼저 ' + pct(m.p_target) + "</span>" +
      '<span><i style="background:var(--bad)"></i>손절 먼저 ' + pct(m.p_stop) + "</span>" +
      '<span><i style="background:var(--flat)"></i>마감까지 둘 다 아님 ' + pct(m.p_neither) + "</span>" +
      "<span>" + Number(m.replays || 10000).toLocaleString() + "번 · 시드 " + esc(m.seed) + "</span></div>";

    var hist;
    if (h.rule && h.triggered) {
      hist = '<p class="hist-line">지난 <strong>' + h.sessions + "일</strong> 실제 장에 같은 규칙을 돌리면 <strong>" +
        h.triggered + "번</strong> 나왔고, 목표 <span class=\"o-target\">" + h.target + "</span> · 손절 <span class=\"o-stop\">" +
        h.stop + "</span> · 둘 다 아님 <span class=\"o-close\">" + h.close + "</span> (평균 R " +
        (h.avg_R > 0 ? "+" : "") + h.avg_R.toFixed(2) + ")</p>";
      var rows = (h.trades || []).slice().reverse().map(function (x) {
        return "<tr><td>" + esc(x.date) + "</td><td>" + esc(x.time) + "</td><td>" + px(x.entry) + "</td><td class=\"o-" +
          esc(x.outcome) + "\">" + (OUTCOME[x.outcome] || esc(x.outcome)) + "</td><td>" + (x.R > 0 ? "+" : "") + x.R + "</td></tr>";
      }).join("");
      hist += "<details><summary>지난 날 기록 " + (h.trades || []).length + "건 보기</summary><div class=\"table-wrap\"><table>" +
        "<tr><th>날짜</th><th>진입</th><th>진입가</th><th>결과</th><th>R</th></tr>" + rows + "</table></div></details>";
    } else {
      hist = '<p class="hist-line muted">지난 ' + (h.sessions || 0) + "일 동안 같은 규칙이 한 번도 나오지 않았습니다.</p>";
    }

    var newsHtml = "";
    if (news && news.length) {
      newsHtml = '<h3 style="margin-top:12px;font-size:14px;color:var(--muted)">오늘 아침 뉴스</h3><ul class="news">' +
        news.map(function (n) {
          return '<li><a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(n.title) + "</a></li>";
        }).join("") + "</ul>";
    }

    var how = '<p class="how">📋 <strong>매수</strong> ' + px(p.entry) + " 근처 → <strong>매도</strong>: " +
      '<span class="o-target">' + px(p.target) + " 닿으면 익절</span> · " +
      '<span class="o-stop">' + px(p.stop) + " 깨지면 손절</span> · 둘 다 아니면 " + esc(p.flat_by || "3:55 PM") + " 전에 정리</p>";
    return '<article class="card" id="c-' + esc(t.symbol) + '">' + head + how +
      '<div class="verdict ' + v.tone + '">1만 번 판정: ' + esc(v.ko) + "</div>" +
      '<div class="muted">' + esc(tm.verdict) + "</div>" + levels + odds +
      '<div class="grid2"><div class="panel"><h3>남은 장 1만 번 — 가격 범위</h3>' + fanChart(tm) + "</div>" +
      '<div class="panel"><h3>장 마감 가격 분포</h3>' + closeHist(tm) + "</div></div>" + hist + newsHtml +
      (tm.warnings || []).map(function (w) { return '<p class="muted">참고: ' + esc(w) + "</p>"; }).join("") +
      "</article>";
  }

  function render(doc) {
    var s = doc.scan || {};
    var stat = function (k, v) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + "</div></div>"; };
    $("summary").innerHTML =
      stat("기준 시각 (뉴욕)", esc(doc.date) + " " + esc(doc.at)) +
      stat("스캔한 종목" + ({ all: " (미국 전체)", list: " (관심 목록)", tickers: " (직접 고름)" }[doc.scope] || ""),
        s.scanned != null ? Number(s.scanned).toLocaleString() : "–") +
      stat("범위 위로 마감", s.hits != null ? s.hits : "–") +
      stat("1만 번 돌린 종목", doc.trades.length);

    var html = "";
    if (doc.demo) {
      html += '<div class="notice"><span class="tag">데모</span> 원문 예시(테슬라 2026-10-19)를 저장된 실제 데이터로 다시 돌린 결과입니다. ' +
        "평일 장이 열리면 매일 자동으로 새 결과가 추가됩니다.</div>";
    }
    if (doc.status === "no_scan") {
      html += '<div class="notice">이 날은 스캔 결과가 없습니다 (휴장일이거나 데이터를 못 받았습니다).<br><span class="muted">' +
        esc(doc.message) + "</span></div>";
    } else if (doc.status === "no_hits") {
      html += '<div class="notice">10:15까지 개장 범위 위로 마감한 종목이 없었습니다. 오늘은 쉬는 날.</div>';
    }
    var trades = doc.trades.map(function (t) { return { t: t, g: grade(t) }; });
    trades.sort(function (x, y) { return y.g.score - x.g.score; });
    var counts = { pick: 0, watch: 0, pass: 0, none: 0 };
    trades.forEach(function (x) { counts[x.g.key]++; });
    if (trades.length) {
      html += '<section class="card rank"><h2>오늘의 추천 순위</h2>' +
        '<p class="muted">1만 번 시뮬레이션 평균 R과 지난 59일 같은 자리의 실제 평균 R을 합친 점수 순. ' +
        "<strong>후보</strong> = 두 결과가 모두 목표 쪽을 가리키고 지난 기록이 10번 이상. 그 외 대부분은 동전 던지기라 패스가 기본입니다.</p>" +
        '<div class="filters">' + ["all", "pick", "watch", "pass"].map(function (k) {
          var n = k === "all" ? trades.length : counts[k];
          return '<button data-f="' + k + '"' + (state.filter === k ? ' class="on"' : "") + ">" +
            (k === "all" ? "전체" : GRADE[k]) + " " + n + "</button>";
        }).join("") + '<input id="q" type="search" placeholder="종목 검색 (예: NVDA)" value="' + esc(state.q) + '"></div>' +
        '<div class="table-wrap"><table><tr><th>#</th><th>종목</th><th>판정</th><th>매수</th><th>익절</th><th>손절</th>' +
        "<th>목표 먼저</th><th>손절 먼저</th><th>평균 R</th><th>지난 기록</th></tr>" +
        trades.map(function (x, i) {
          var t = x.t, tm = t.tm;
          if (!tm) return '<tr data-g="none" data-s="' + esc(t.symbol) + '"><td>' + (i + 1) + '</td><td><a href="#c-' + esc(t.symbol) + '">' +
            esc(t.symbol) + "</a></td><td>" + gradeBadge(x.g) + '</td><td colspan="7" class="muted">' + esc(t.error || "") + "</td></tr>";
          var m = tm.mc, h = tm.history || {}, p = tm.plan;
          return '<tr data-g="' + x.g.key + '" data-s="' + esc(t.symbol) + '"><td>' + (i + 1) + '</td><td><a href="#c-' + esc(t.symbol) + '">' +
            esc(t.symbol) + "</a></td><td>" + gradeBadge(x.g) + "</td><td>" + px(p.entry) + '</td><td class="o-target">' + px(p.target) +
            '</td><td class="o-stop">' + px(p.stop) + "</td><td>" + pct(m.p_target) + "</td><td>" + pct(m.p_stop) + "</td><td>" +
            (m.avg_R > 0 ? "+" : "") + m.avg_R.toFixed(2) + "</td><td>" +
            (h.triggered ? h.target + "승 " + h.stop + "패 / " + h.triggered : "–") + "</td></tr>";
        }).join("") + "</table></div></section>";
    }
    html += '<div id="cards"></div>';
    $("trades").innerHTML = html;
    state.trades = trades;
    state.news = doc.news || {};
    applyFilter();
    Array.prototype.forEach.call(document.querySelectorAll('.rank a[href^="#c-"]'), function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        var sym = link.getAttribute("href").slice(3);
        if (!document.getElementById("c-" + sym)) {
          var x = state.trades.filter(function (y) { return y.t.symbol === sym; })[0];
          $("cards").insertAdjacentHTML("afterbegin", tradeCard(x.t, state.news[sym]));
        }
        document.getElementById("c-" + sym).scrollIntoView({ behavior: "smooth" });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".filters button"), function (b) {
      b.addEventListener("click", function () {
        state.filter = b.getAttribute("data-f");
        Array.prototype.forEach.call(document.querySelectorAll(".filters button"), function (o) { o.classList.toggle("on", o === b); });
        applyFilter();
      });
    });
    if ($("q")) $("q").addEventListener("input", function () { state.q = this.value; applyFilter(); });

    var list = s.list || [];
    $("scanlist").innerHTML = list.length ? '<details class="card"><summary>스캐너가 찾은 종목 전체 ' + list.length +
      "개</summary><div class=\"table-wrap\"><table><tr><th>종목</th><th>시각</th><th>가격</th><th>범위</th><th>돌파</th></tr>" +
      list.map(function (h) {
        return "<tr><td>" + esc(h.symbol) + "</td><td>" + esc(h.at) + "</td><td>" + px(h.price) + "</td><td>" +
          px(h.or_low) + " ~ " + px(h.or_high) + "</td><td>+" + esc(h.pct_over) + "%</td></tr>";
      }).join("") + "</table></div></details>" : "";
  }

  // The ranking table holds every ticker; the heavy detail cards are drawn for the first few matches only.
  var CARDS = 12;
  var state = { filter: "all", q: "", trades: [], news: {} };
  function applyFilter() {
    var q = state.q.trim().toUpperCase();
    var match = function (g, sym) {
      return (state.filter === "all" || g === state.filter) && (!q || sym.indexOf(q) === 0);
    };
    Array.prototype.forEach.call(document.querySelectorAll(".rank tr[data-g]"), function (el) {
      el.style.display = match(el.getAttribute("data-g"), el.getAttribute("data-s")) ? "" : "none";
    });
    if (!$("cards")) return;
    var shown = state.trades.filter(function (x) { return x.t.tm && match(x.g.key, x.t.symbol); });
    $("cards").innerHTML = shown.slice(0, CARDS).map(function (x) { return tradeCard(x.t, state.news[x.t.symbol]); }).join("") +
      (shown.length > CARDS ? '<p class="muted">상세 카드는 위에서 ' + CARDS + "개만 보여 줍니다. 나머지는 표에서 종목 이름을 누르세요.</p>" : "");
  }

  function load(id) {
    $("trades").innerHTML = '<p class="muted">불러오는 중…</p>';
    getJSON("data/days/" + encodeURIComponent(id) + ".json").then(render).catch(function (e) {
      $("trades").innerHTML = '<p class="err">' + esc(e.message) + "</p>";
    });
  }

  getJSON("data/index.json").then(function (idx) {
    var days = idx.days || [];
    if (!days.length) {
      $("trades").innerHTML = '<div class="notice">아직 결과가 없습니다. GitHub Actions의 “daily” 워크플로가 처음 돌면 채워집니다.</div>';
      return;
    }
    $("day").innerHTML = days.map(function (d) {
      return '<option value="' + esc(d.id) + '">' + esc(d.date) + (d.demo ? " (데모)" : d.scope === "tickers" ? " (직접 고름)" : "") +
        " · 돌파 " + d.hits + "개</option>";
    }).join("");
    $("updated").textContent = "마지막 갱신 " + new Date(idx.updated_at).toLocaleString("ko-KR");
    var want = (location.hash || "").slice(1);
    var first = days.some(function (d) { return d.id === want; }) ? want : days[0].id;
    $("day").value = first;
    $("day").addEventListener("change", function () { location.hash = this.value; load(this.value); });
    load(first);
  }).catch(function () {
    $("trades").innerHTML = '<div class="notice">아직 결과가 없습니다. GitHub Actions의 “daily” 워크플로가 처음 돌면 채워집니다.</div>';
  });
})();
