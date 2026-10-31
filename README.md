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
