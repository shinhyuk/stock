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
    if (t.grade) return { key: t.grade, score: t.score };  // run_daily.py's grade(), the same rule
    if (!t.tm) return { key: "none", score: -99 };
    var m = t.tm.mc, h = t.tm.history || {}, v = verdict(t.tm.verdict);
    var hn = h.triggered || 0, hR = hn ? h.avg_R : null;
    var key;
    if (v.tone === "good" && m.avg_R > 0 && hn >= 10 && hR > 0) key = "pick";
    else if (v.tone === "bad" || (m.avg_R <= 0 && (hR == null || hR <= 0))) key = "pass";
    else key = "watch";
    return { key: key, score: m.avg_R + (hn >= 10 ? 0.5 * hR : 0) };
  }
  // 100만 원 계좌 기준, 자동매매와 같은 규칙으로 몇 주 사고 얼마 벌거나 잃는지 (supabase trader_config 기본값)
  var ACCOUNT_KRW = 1000000, MAX_LOSS_USD = 10, POSITION_PCT = 0.45, FX = 1400;
  function won(x, sign) {
    var r = Math.round(x / 100) * 100;
    var a = Math.abs(r) >= 10000 ? (Math.abs(r) / 10000).toFixed(Math.abs(r) >= 100000 ? 0 : 1).replace(/\.0$/, "") + "만" :
      Math.abs(r).toLocaleString("ko-KR");
    return (sign && r > 0 ? "+" : r < 0 ? "−" : "") + a + "원";
  }
  function plain(t, fx) {
    if (!t.tm) return null;
    var p = t.tm.plan, m = t.tm.mc, h = t.tm.history || {};
    var risk = p.entry - p.stop, acct = ACCOUNT_KRW / fx;
    var qty = Math.max(0, Math.min(Math.floor(MAX_LOSS_USD / risk), Math.floor(acct * POSITION_PCT / p.entry)));
    return {
      qty: qty, invest: p.entry * qty * fx, priceKrw: p.entry * fx,
      win: (p.target - p.entry) * qty * fx, lose: (p.entry - p.stop) * qty * fx,
      expect: m.avg_R * risk * qty * fx,
      pWin: m.p_green != null ? m.p_green : m.p_target, pT: m.p_target, pS: m.p_stop, pN: m.p_neither,
      hist: h.triggered ? { n: h.triggered, t: h.target, s: h.stop, sessions: h.sessions } : null,
    };
  }
  function nameOf(t) { return t.hit && t.hit.name ? t.hit.name : t.symbol; }

  // 오늘 뭘 살까: 후보를 쉬운 말과 원화로
  function pickCard(t, rank, fx) {
    var x = plain(t, fx), p = t.tm.plan, g = grade(t);
    if (!x.qty) return "";
    return '<article class="pick">' +
      '<div class="pick-head"><span class="rank">' + rank + '</span><div><div class="pick-name">' + esc(nameOf(t)) +
      (t.hit.inverse ? ' <span class="tag">인버스 · 지수 하락에 베팅</span>' : "") + "</div>" +
      '<div class="muted">' + esc(t.symbol) + " · 1주 $" + px(p.entry) + " (" + won(x.priceKrw) + ") · <strong>" + x.qty + "주 = " +
      won(x.invest) + "어치</strong></div></div>" + gradeBadge(g) + "</div>" +
      '<div class="pick-body"><div class="big"><div class="k">돈 벌고 끝날 확률</div><div class="v">' + Math.round(x.pWin * 100) + "%</div>" +
      '<div class="k">· 1만 번 해 보면 평균 <strong class="' + (x.expect >= 0 ? "o-target" : "o-stop") + '">' + won(x.expect, true) + "</strong></div></div>" +
      '<div class="outcomes">' +
      '<div class="oc win"><span>익절</span><b>' + won(x.win, true) + "</b><i>" + pct(x.pT) + "</i></div>" +
      '<div class="oc lose"><span>손절</span><b>' + won(-x.lose, true) + "</b><i>" + pct(x.pS) + "</i></div>" +
      '<div class="oc flat"><span>둘 다 아님</span><b>마감 전 정리</b><i>' + pct(x.pN) + "</i></div></div></div>" +
      '<p class="muted pick-foot">📋 $' + px(p.entry) + " 근처에서 사기 → <span class=\"o-target\">$" + px(p.target) + " 닿으면 팔기(익절)</span> · " +
      '<span class="o-stop">$' + px(p.stop) + " 밑으로 떨어지면 팔기(손절)</span> · 둘 다 아니면 장 마감 10분 전에 팔기" +
      (x.hist ? "<br>지난 " + x.hist.sessions + "일 중 같은 상황 " + x.hist.n + "번: 익절 " + x.hist.t + "번 · 손절 " + x.hist.s + "번" : "") +
      ' · <a href="#c-' + esc(t.symbol) + '" data-open="' + esc(t.symbol) + '">자세히</a></p></article>';
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
    var head = '<h2>' + esc(nameOf(t)) + ' <span class="px">' + esc(t.symbol) + "</span> " + gradeBadge(g) + "</h2>" +
      '<p class="muted">' + esc(t.hit.at || "") + "에 개장 15분 최고가(" + px(t.hit.or_high) + ")를 " + esc(t.hit.pct_over) +
      "% 넘어서 마감 → 이 가격 " + px(t.hit.price) + "에 사는 계획</p>";
    if (!t.tm) {
      return '<article class="card" id="c-' + esc(t.symbol) + '">' + head + '<p class="err">' + esc(t.error || "결과 없음") + "</p></article>";
    }
    var tm = t.tm, p = tm.plan, m = tm.mc, h = tm.history || {}, v = verdict(tm.verdict);
    var levels = '<div class="levels">' +
      '<div><div class="k">진입</div><div class="v">' + px(p.entry) + "</div></div>" +
      '<div class="stop"><div class="k">손절 (범위 가운데)</div><div class="v">' + px(p.stop) + "</div></div>" +
      '<div class="target"><div class="k">목표 (위험의 ' + esc(m.r_at_target) + '배)</div><div class="v">' + px(p.target) + "</div></div>" +
      (function () {
        var y = plain(t, state.fx || FX);
        return y.qty ? '<div><div class="k">100만 원이면</div><div class="v">' + y.qty + "주 · " + won(y.invest) + "</div></div>" +
          '<div><div class="k">돈 벌 확률 · 평균 기대</div><div class="v">' + Math.round(y.pWin * 100) + "% · " + won(y.expect, true) + "</div></div>"
          : '<div><div class="k">100만 원이면</div><div class="v">1주도 안 됨</div></div>';
      })() +
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
    var fx = doc.fx_krw || FX;
    if (trades.length) {
      var picks = trades.filter(function (x) { return x.g.key === "pick"; }).slice(0, 5);
      var cards = picks.map(function (x, i) { return pickCard(x.t, i + 1, fx); }).join("");
      var isToday = doc.date === new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
      html += '<section class="picks"><h2>' + (isToday ? "오늘 뭘 살까" : esc(doc.date) + " 후보 (이날 샀다면)") +
        " <span class=\"muted\">100만 원 기준 · 1번에 최대 " + won(MAX_LOSS_USD * fx) + "까지만 잃게</span></h2>" +
        (cards ? '<div class="pick-grid">' + cards + "</div>" :
          '<div class="notice">오늘은 확률이 좋은 종목이 없어요. <strong>쉬는 게 답</strong>입니다. (아래 표에서 전체 결과를 볼 수 있어요)</div>') +
        '<p class="muted">달러 1 = ' + Math.round(fx).toLocaleString() + "원. 수수료·환전 비용 제외. 확률은 1만 번 가상 시뮬레이션이라 예측이 아닙니다.</p></section>";
      html += '<section class="card rank"><h2>전체 순위</h2>' +
        '<p class="muted">1만 번 시뮬레이션과 지난 59일 같은 상황의 실제 결과를 합친 점수 순. ' +
        "<strong>오늘의 후보</strong> = 두 결과가 모두 익절 쪽. 대부분은 동전 던지기 수준이라 패스가 기본입니다.</p>" +
        '<div class="filters">' + ["all", "pick", "watch", "pass"].map(function (k) {
          var n = k === "all" ? trades.length : counts[k];
          return '<button data-f="' + k + '"' + (state.filter === k ? ' class="on"' : "") + ">" +
            (k === "all" ? "전체" : GRADE[k]) + " " + n + "</button>";
        }).join("") + '<input id="q" type="search" placeholder="회사·종목 검색 (예: Tesla, NVDA)" value="' + esc(state.q) + '"></div>' +
        '<div class="table-wrap"><table><tr><th>#</th><th>회사</th><th>판정</th><th>돈 벌 확률</th><th>평균 기대</th>' +
        "<th>익절 시</th><th>손절 시</th><th>1주 가격</th><th>몇 주</th><th>지난 기록</th></tr>" +
        trades.map(function (x, i) {
          var t = x.t, tm = t.tm;
          var who = '<a href="#c-' + esc(t.symbol) + '" title="' + esc(t.symbol) + '">' + esc(nameOf(t)) + '</a> <span class="muted">' +
            esc(t.symbol) + "</span>" + (t.hit.inverse ? ' <span class="tag">인버스</span>' : "");
          if (!tm) return '<tr data-g="none" data-s="' + esc(t.symbol) + '" data-n="' + esc(nameOf(t).toUpperCase()) + '"><td>' + (i + 1) +
            "</td><td>" + who + "</td><td>" + gradeBadge(x.g) + '</td><td colspan="7" class="muted">데이터 부족</td></tr>';
          var m = tm.mc, h = tm.history || {}, p = tm.plan, y = plain(t, fx);
          return '<tr data-g="' + x.g.key + '" data-s="' + esc(t.symbol) + '" data-n="' + esc(nameOf(t).toUpperCase()) + '"><td>' + (i + 1) +
            "</td><td>" + who + "</td><td>" + gradeBadge(x.g) + "</td><td><strong>" + Math.round(y.pWin * 100) + "%</strong></td>" +
            '<td class="' + (y.expect >= 0 ? "o-target" : "o-stop") + '">' + (y.qty ? won(y.expect, true) : "–") + "</td>" +
            '<td class="o-target">' + (y.qty ? won(y.win, true) + " <i>" + pct(m.p_target) + "</i>" : "–") + "</td>" +
            '<td class="o-stop">' + (y.qty ? won(-y.lose, true) + " <i>" + pct(m.p_stop) + "</i>" : "–") + "</td>" +
            "<td>$" + px(p.entry) + "</td><td>" + (y.qty ? y.qty + "주" : "1주도 안 됨") + "</td><td>" +
            (h.triggered ? h.triggered + "번 중 익절 " + h.target : "–") + "</td></tr>";
        }).join("") + "</table></div></section>";
    }
    html += '<div id="cards"></div>';
    $("trades").innerHTML = html;
    state.trades = trades;
    state.fx = fx;
    state.news = doc.news || {};
    applyFilter();
    Array.prototype.forEach.call(document.querySelectorAll('.rank a[href^="#c-"], .picks a[href^="#c-"]'), function (link) {
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
    var match = function (g, sym, name) {
      return (state.filter === "all" || g === state.filter) && (!q || sym.indexOf(q) === 0 || (name || "").indexOf(q) >= 0);
    };
    Array.prototype.forEach.call(document.querySelectorAll(".rank tr[data-g]"), function (el) {
      el.style.display = match(el.getAttribute("data-g"), el.getAttribute("data-s"), el.getAttribute("data-n")) ? "" : "none";
    });
    if (!$("cards")) return;
    var shown = state.trades.filter(function (x) { return x.t.tm && match(x.g.key, x.t.symbol, nameOf(x.t).toUpperCase()); });
    $("cards").innerHTML = shown.slice(0, CARDS).map(function (x) { return tradeCard(x.t, state.news[x.t.symbol]); }).join("") +
      (shown.length > CARDS ? '<p class="muted">상세 카드는 위에서 ' + CARDS + "개만 보여 줍니다. 나머지는 표에서 종목 이름을 누르세요.</p>" : "");
  }

  function load(id) {
    $("trades").innerHTML = '<p class="muted">불러오는 중…</p>';
    getJSON("data/days/" + encodeURIComponent(id) + ".json").then(render).catch(function (e) {
      $("trades").innerHTML = '<p class="err">' + esc(e.message) + "</p>";
    });
  }

  // 자동매매 현황: Supabase 함수의 읽기 전용 status (site/trader.json 이 있을 때만)
  var STATUS = { planned: "대기", buying: "매수 중", open: "보유", selling: "매도 중", closed: "청산", skipped: "건너뜀", error: "오류" };
  var REASON = { target: "익절", stop: "손절", close: "장 마감 정리", manual: "수동" };
  function money(x) { return x == null ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + "$" + Math.abs(x).toFixed(2); }
  function renderTrader(st) {
    var tr = st.trades || [], closed = tr.filter(function (t) { return t.status === "closed"; });
    var total = closed.reduce(function (a, t) { return a + (Number(t.pnl_usd) || 0); }, 0);
    var wins = closed.filter(function (t) { return t.pnl_usd > 0; }).length;
    var head = '<h2>자동매매 <span class="grade ' + (st.mode === "real" ? "bad" : "flat") + '">' +
      (st.mode === "real" ? "실전" : "모의투자") + '</span> <span class="grade ' + (st.enabled ? "good" : "flat") + '">' +
      (st.enabled ? "새 매수 켜짐" : "새 매수 꺼짐") + "</span></h2>" +
      '<p class="muted">한국투자증권 · 동시 ' + esc(st.config.max_positions) + "종목 · 1회 최대 손실 $" + esc(st.config.max_loss_usd) +
      " · 하루 손실 한도 $" + esc(st.config.daily_loss_usd) + " · " + esc(st.config.entry_deadline) + "까지 매수, " +
      esc(st.config.flat_by) + "에 전부 정리 (뉴욕 시각)</p>";
    var stats = '<div class="levels"><div><div class="k">누적 손익 (청산 ' + closed.length + '건)</div><div class="v ' +
      (total >= 0 ? "o-target" : "o-stop") + '">' + money(total) + "</div></div>" +
      '<div><div class="k">이긴 거래</div><div class="v">' + wins + " / " + closed.length + "</div></div>" +
      '<div><div class="k">갱신</div><div class="v">' + new Date(st.now).toLocaleTimeString("ko-KR") + "</div></div></div>";
    var rows = tr.map(function (t) {
      return "<tr><td>" + esc(t.day) + "</td><td><strong>" + esc(t.symbol) + "</strong>" + (t.inverse ? ' <span class="tag">인버스</span>' : "") +
        "</td><td>" + (STATUS[t.status] || esc(t.status)) + "</td><td>" + (t.qty || "–") + "</td><td>" + px(t.buy_price || t.entry) +
        '</td><td class="o-target">' + px(t.target) + '</td><td class="o-stop">' + px(t.stop) + "</td><td>" + px(t.sell_price) +
        "</td><td>" + (REASON[t.sell_reason] || "") + '</td><td class="' + (t.pnl_usd > 0 ? "o-target" : t.pnl_usd < 0 ? "o-stop" : "") + '">' +
        (t.pnl_usd == null ? "" : money(Number(t.pnl_usd))) + '</td><td class="muted">' + esc(t.note || "") + "</td></tr>";
    }).join("");
    var table = tr.length ? '<div class="table-wrap"><table class="nowrap"><tr><th>날짜</th><th>종목</th><th>상태</th><th>수량</th><th>매수가</th>' +
      "<th>익절</th><th>손절</th><th>매도가</th><th>사유</th><th>손익</th><th>메모</th></tr>" + rows + "</table></div>" :
      '<p class="muted">아직 주문이 없습니다. 평일 뉴욕 10:15 이후 후보가 나오면 여기 표시됩니다.</p>';
    var logs = (st.log || []).map(function (l) {
      return '<li class="' + (l.level === "error" ? "err" : l.level === "warn" ? "o-stop" : "") + '">' +
        new Date(l.at).toLocaleString("ko-KR") + " — " + esc(l.msg) + "</li>";
    }).join("");
    $("trader").innerHTML = '<div class="card">' + head + stats + table +
      (logs ? "<details><summary>최근 기록 " + st.log.length + "건</summary><ul class=\"news\">" + logs + "</ul></details>" : "") + "</div>";
  }
  getJSON("trader.json").then(function (cfg) {
    if (!cfg.status_url) return;
    var poll = function () {
      getJSON(cfg.status_url + "?action=status").then(renderTrader).catch(function (e) {
        $("trader").innerHTML = '<div class="notice">자동매매 현황을 못 불러왔습니다: ' + esc(e.message) + "</div>";
      });
    };
    poll();
    setInterval(poll, 60000);
  }).catch(function () {});

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
