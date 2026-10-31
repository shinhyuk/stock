# 사기 전에 1만 번

[day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill)(MIT)의 클로드 스킬 11개를 설치하고,
매일 미국 장의 개장 범위 돌파 종목을 1만 번 시뮬레이션한 결과를 GitHub Pages로 보여 줍니다.

**대시보드: https://shinhyuk.github.io/stock/**

- 평일 뉴욕 10:15 기준으로 자동 실행 (`.github/workflows/daily.yml`, 15:40 UTC)
- 미국 전체 상장 종목(~5,900, Nasdaq Trader 목록)을 스캔 → 개장 범위를 뚫은 종목 최대 60개를 1만 번 돌림
- **오늘의 추천 순위**: 1만 번 평균 R + 지난 59일 실제 평균 R 점수 순. 두 결과가 모두 목표 쪽이고 지난 기록이 10번 이상이면 '오늘의 후보', 손절 쪽이면 '패스', 나머지는 '애매'
- **직접 고르기**: Actions → daily → Run workflow → `tickers`에 `NVDA,PLTR,SOFI`처럼 입력 (장중에만 의미 있음). 범위를 `list`로 고르면 `pipeline/universe.txt`만 스캔
- 순서: `/trader-scanner` → `/trader-exit` (손절 = 범위 가운데, 목표 = 1R) → `/trader-timemachine` (10,000번 + 지난 59일) → `/trader-news`
- 스캔 종목: `pipeline/universe.txt` · 실행 스크립트: `pipeline/run_daily.py` · 화면: `site/`
- 스킬 원본: `.claude/skills/trader-*` — 이 저장소에서 클로드 코드를 열면 `/trader-scanner` 등을 바로 쓸 수 있습니다.

투자 권유가 아닙니다. 시뮬레이션은 예측이 아니며, 이 저장소는 주문을 내지 않습니다.

## 자동매매 (한국투자증권 · Supabase)

'오늘의 후보'를 한국투자증권 계좌로 자동으로 사고(지정가), 익절가·손절가·뉴욕 15:50 중 먼저 오는 때에 팝니다.
인버스 ETF(`pipeline/inverse.txt`)도 함께 스캔합니다. 켜 둔 PC 없이 Supabase가 장중 1분마다 처리하고, 현황은 사이트 맨 위에 나옵니다.
기본은 **모의투자**. 설정 방법: [docs/AUTOTRADE.md](docs/AUTOTRADE.md)

- 함수: `supabase/functions/trader/index.ts` · 테스트(가짜 증권사로 하루치 매매): `deno test --allow-env --allow-net supabase/functions/trader/test.ts`
- DB: `supabase/migrations/001_trader.sql` · 1분 예약: `supabase/cron.sql`
