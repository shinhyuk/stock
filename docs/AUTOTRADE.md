# 자동매매 설정 — 휴대폰만으로

'오늘의 후보'를 한국투자증권 계좌로 자동으로 사고(지정가), 익절가·손절가·뉴욕 15:50 중 먼저 오는 때에 팝니다.
켜 둔 PC 없이 Supabase가 장중 1분마다 처리합니다. **처음엔 모의투자.** 현황은 https://shinhyuk.github.io/stock/ 맨 위.

```
GitHub Actions (평일 뉴욕 10:16)          Supabase (1분마다)                   한국투자증권
 미국 전체 스캔 → 1만 번 → 후보 전송  ──▶  trader 함수: 살까? 팔까?  ──────▶  지정가 매수·매도·취소
 사이트 ◀── 현황 (읽기 전용) ───────────
```

휴대폰 브라우저로 하면 됩니다. 화면이 잘리면 브라우저 메뉴의 **"데스크톱 사이트"** 를 켜세요. 모두 15~20분.

## 1. 한국투자증권 — 키 3개 받기

1. **한국투자 앱**: 계좌가 없으면 비대면 개설 → **해외주식 거래 신청**.
2. **모의투자 신청**: 한국투자 앱 또는 홈페이지의 "모의투자" 메뉴에서 신청 → **모의투자 계좌번호** (`12345678-01` 형태) 메모.
3. **KIS Developers** (apiportal.koreainvestment.com) 로그인 → **API 신청** → 모의투자 계좌로 신청 → **APP KEY**, **APP SECRET** 메모.

## 2. Supabase — 값 2개 받기

1. **supabase.com** 가입 → **New project** (이름 아무거나, Region: Northeast Asia (Seoul), 비밀번호는 아무거나 — 다시 쓸 일 없음).
2. 프로젝트 주소창의 `https://supabase.com/dashboard/project/`**`abcdefghijklmnop`** — 이 마지막 부분이 **Project ref**.
3. 오른쪽 위 프로필 → **Account preferences → Access Tokens → Generate new token** → 토큰 복사 (한 번만 보임).

## 3. GitHub — 5개 붙여 넣기

github.com/shinhyuk/stock → **Settings → Secrets and variables → Actions → New repository secret** (GitHub 앱에는 이 메뉴가 없어서 브라우저로):

| Name | 값 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | 2-3의 토큰 |
| `SUPABASE_PROJECT_REF` | 2-2의 Project ref |
| `KIS_APP_KEY` | 1-3의 APP KEY |
| `KIS_APP_SECRET` | 1-3의 APP SECRET |
| `KIS_ACCOUNT` | 1-2의 모의투자 계좌번호 `12345678-01` |

> 키는 여기에만 넣으세요. 채팅·메모 앱 등에 남기지 마세요.

## 4. 버튼 한 번 — 설정 + 켜기

**GitHub 앱 → stock → Actions → trader-setup → Run workflow**
- mode: `paper` (모의투자)
- 새 매수: `켜기`

2~3분 뒤 실행 결과에 **"✅ 완료"** 와 한국투자증권 `ok` 가 나오면 끝입니다. 테이블·함수·비밀값·1분 예약을 알아서 만들고, 주문 없이 키와 계좌만 점검합니다.
❌가 나오면 실행 기록의 빨간 줄을 캡처해서 보여 주세요.

이후 평일 밤 12:16(한국, 서머타임 땐 11:16)쯤 후보가 들어오고, 조건이 맞으면 사고팝니다.

## 켜고 끄기, 실전 전환 — 모두 같은 버튼

| 하고 싶은 것 | trader-setup 에서 고를 것 |
|---|---|
| 새 매수 멈추기 (산 건 계속 익절·손절·정리) | 새 매수: `끄기` |
| 다시 켜기 | 새 매수: `켜기` |
| 실전 전환 | 3번의 `KIS_APP_KEY` / `KIS_APP_SECRET` / `KIS_ACCOUNT` 를 **실전** 값으로 바꾼 뒤, mode: `real` |

금액·한도는 Supabase → Table Editor → `trader_config` (기본: 쓸 돈 $690 ≈ 100만 원, 동시 2종목, 1회 최대 손실 $10, 하루 손실 한도 $25, 11:30까지 매수, 15:50 전부 정리).

## 알아 둘 것

- **지난 60일 가상 매매에선 수수료 0.25% 기준으로 손해였습니다** (https://shinhyuk.github.io/stock/backtest.html). 모의투자로 확인하고, 실전은 수수료 우대를 받은 뒤 작게.
- 주문은 모두 **지정가**입니다 (한국투자증권 API는 미국 주식 장중 시장가 주문 불가). 안 사지면 3분 뒤 취소, 안 팔리면 2분 뒤 더 낮게 다시 냅니다. 급락·갭에서는 손절가보다 아래에서 팔릴 수 있습니다.
- 손절·익절은 1분마다 확인합니다. 모의투자는 일부 미국 종목만 지원해서 주문이 거절될 수 있습니다 (사이트 기록에 남음).
- Supabase 무료 프로젝트는 오래 쓰지 않으면 일시정지될 수 있습니다. 평일마다 1분 예약이 돌아 보통은 괜찮지만, 멈추면 Supabase 대시보드에서 **Restore** 를 누르세요.
- 해외주식 매매 차익은 양도소득세 신고 대상입니다. 투자 권유가 아닙니다.

<details><summary>휴대폰 없이 손으로 설정하려면 (예전 방법)</summary>

Supabase SQL Editor 에 `supabase/migrations/001_trader.sql` 실행 → Edge Function `trader` 에 `supabase/functions/trader/index.ts` 붙여 넣고 배포(Verify JWT 끄기) →
Secrets 에 `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_ACCOUNT`, `KIS_MODE`(paper|real), `TRADER_SECRET`(긴 무작위 문자열) →
`supabase/cron.sql` 의 `<PROJECT_REF>`, `<TRADER_SECRET>` 바꿔 실행 → GitHub Variables `TRADER_URL`, Secrets `TRADER_SECRET` → `trader_config.enabled = true`.
</details>
