-- 자동매매 테이블. Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run.
-- 모든 테이블에 RLS를 켜고 정책을 두지 않으므로, 브라우저(anon 키)로는 읽고 쓸 수 없습니다.
-- 읽기·쓰기는 Edge Function(service role)만 합니다.

create table if not exists trader_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,        -- 새 매수 허용(킬 스위치). false여도 이미 산 건 정리합니다.
  account_usd numeric not null default 690,      -- 쓸 돈(달러). 100만 원 ≈ 690달러(환율 1,450원 가정)
  max_positions int not null default 2,          -- 동시에 들고 있을 종목 수
  max_loss_usd numeric not null default 10,      -- 한 번에 잃을 수 있는 최대 금액(손절가 기준)
  position_pct numeric not null default 0.45,    -- 한 종목에 쓸 최대 비중
  daily_loss_usd numeric not null default 25,    -- 하루 실현 손실이 이만큼이면 그날은 더 안 삼
  entry_slip_pct numeric not null default 0.5,   -- 계획 진입가보다 이만큼(%) 넘게 올랐으면 쫓아 사지 않음
  entry_deadline text not null default '11:30',  -- 뉴욕 시각. 이때까지 못 샀으면 그날은 건너뜀
  flat_by text not null default '15:50',         -- 뉴욕 시각. 이때 남은 건 전부 매도
  updated_at timestamptz not null default now()
);
insert into trader_config (id) values (1) on conflict do nothing;

create table if not exists kis_token (
  id int primary key default 1 check (id = 1),
  mode text not null,
  token text not null,
  expires_at timestamptz not null
);

create table if not exists trades (
  id bigserial primary key,
  day date not null,                 -- 뉴욕 날짜
  symbol text not null,
  mode text not null,                -- paper | real
  exch text,                         -- NASD | NYSE | AMEX (한국투자증권 거래소 코드)
  rank int,
  score numeric,
  inverse boolean not null default false,
  p_target numeric,
  p_stop numeric,
  entry numeric not null,
  stop numeric not null,
  target numeric not null,
  qty int,
  status text not null default 'planned',
    -- planned → buying → open → selling → closed   (또는 skipped / error)
  buy_odno text,
  buy_at timestamptz,
  buy_price numeric,
  sell_odno text,
  sell_at timestamptz,
  sell_reason text,                  -- target | stop | close | manual
  sell_price numeric,
  pnl_usd numeric,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day, symbol, mode)
);

create table if not exists trade_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  trade_id bigint references trades(id) on delete cascade,
  level text not null default 'info',  -- info | warn | error
  msg text not null
);
create index if not exists trade_log_at on trade_log (at desc);

alter table trader_config enable row level security;
alter table kis_token enable row level security;
alter table trades enable row level security;
alter table trade_log enable row level security;
