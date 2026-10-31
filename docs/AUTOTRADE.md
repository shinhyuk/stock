# 자동매매 설정 (한국투자증권 + Supabase)

매일 뉴욕 10:15 기준 "오늘의 후보"를 한국투자증권 계좌로 자동으로 사고, 익절가·손절가·15:50 중 먼저 오는 때에 팝니다.
켜 둔 PC 없이 Supabase가 장중 1분마다 깨어나 처리합니다. **처음엔 모의투자로 돌리고, 확인되면 설정 하나로 실전 전환**합니다.

```
GitHub Actions (평일 10:16 뉴욕)            Supabase                             한국투자증권
 run_daily.py: 미국 전체 스캔 → 1만 번  ──▶  trades 테이블에 후보 저장
 send_plans.py: '오늘의 후보' 전송          pg_cron 1분마다 → trader 함수  ──▶  지정가 매수 / 매도 / 취소
                                             (가격: 야후, 체결 확인: KIS)       체결 내역
 사이트  ◀── status (읽기 전용) ─────────────
```

## 1. 한국투자증권

1. 계좌 개설 (해외주식 거래 가능 종합계좌), **해외주식 거래 신청**.
2. [KIS Developers](https://apiportal.koreainvestment.com) 에서 Open API 서비스 신청 → **모의투자** 앱키/시크릿 발급.
   모의투자 계좌도 함께 신청합니다 (해외주식 모의투자 포함).
3. 메모: 모의투자 **계좌번호(8자리-2자리)**, **APP KEY**, **APP SECRET**.
4. 실전 때: 실전용 앱키/시크릿을 따로 발급, 원화로 바로 사려면 **통합증거금** 신청 (아니면 달러로 환전해 두기).

## 2. Supabase

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 (무료 플랜으로 충분).
2. **SQL Editor** → `supabase/migrations/001_trader.sql` 내용 붙여 넣고 Run.
3. **Edge Functions → Deploy a new function → Via Editor**
   - 이름: `trader`
   - `supabase/functions/trader/index.ts` 내용을 통째로 붙여 넣고 Deploy
   - 함수 설정에서 **Verify JWT 끄기** (자체 비밀값 `TRADER_SECRET` 으로 막습니다. 사이트가 현황을 읽으려면 꺼야 함)
4. **Edge Functions → Secrets** 에 추가:

   | 이름 | 값 |
   |---|---|
   | `KIS_APP_KEY` | 모의투자 APP KEY |
   | `KIS_APP_SECRET` | 모의투자 APP SECRET |
   | `KIS_ACCOUNT` | `12345678-01` 형태 |
   | `KIS_MODE` | `paper` (실전 전환 때 `real`) |
   | `TRADER_SECRET` | 아무 긴 무작위 문자열 (예: 비밀번호 생성기로 40자) |

5. **SQL Editor** → `supabase/cron.sql` 의 `<PROJECT_REF>`, `<TRADER_SECRET>` 를 바꿔서 Run.

## 3. GitHub

저장소 **Settings → Secrets and variables → Actions**:

- **Variables** 탭 → `TRADER_URL` = `https://<PROJECT_REF>.supabase.co/functions/v1/trader`
- **Secrets** 탭 → `TRADER_SECRET` = 위와 같은 값

## 4. 켜기

처음엔 새 매수가 **꺼져** 있습니다. Supabase **Table Editor → trader_config** 에서 `enabled` 를 `true` 로.
같은 곳에서 금액·한도를 바꿀 수 있습니다 (기본값: 쓸 돈 $690 ≈ 100만 원, 동시 2종목, 1회 최대 손실 $10,
하루 손실 한도 $25, 11:30까지 매수, 15:50에 전부 정리).

**끄기(긴급)**: `enabled` = `false` → 새로 사지 않음 (이미 산 건 계속 익절/손절/정리).
완전히 멈추기: SQL Editor 에서 `select cron.unschedule('trader-tick');` — 이 경우 들고 있는 건 직접 파셔야 합니다.

## 5. 실전 전환

모의투자로 1~2주 돌려 사이트의 자동매매 표에서 매수·매도·체결이 제대로 찍히는지 확인한 뒤:
Secrets 의 `KIS_APP_KEY` / `KIS_APP_SECRET` / `KIS_ACCOUNT` 를 실전 값으로, `KIS_MODE` 를 `real` 로.

## 알아 둘 것

- 주문은 모두 **지정가**입니다 (한국투자증권 API는 미국 주식 시장가 주문이 안 됨). 매수는 현재가 +0.2%, 매도는 현재가 −0.2~0.5%로 내서 바로 체결되게 하고,
  안 되면 취소 후 더 낮게 다시 냅니다. 급락·갭에서는 손절가보다 훨씬 아래에서 팔릴 수 있습니다.
- 손절·익절은 **1분마다 확인**합니다. 1분 사이에 크게 움직이면 그만큼 미끄러집니다.
- GitHub 예약 실행은 늦어질 수 있어, 후보가 10:30~11:00쯤 도착할 수 있습니다. 그사이 가격이 진입가보다 0.5% 넘게 올라 있으면 쫓아 사지 않고, 11:30까지 기다렸다 건너뜁니다.
- 수수료·환전 비용은 손익에 안 들어가 있습니다. 해외주식 매매 차익은 양도소득세 신고 대상입니다.
- 투자 권유가 아닙니다. 시뮬레이션의 '후보'도 동전 던지기보다 조금 나은 수준입니다.
