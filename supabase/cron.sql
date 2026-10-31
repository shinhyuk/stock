-- 장중 1분마다 자동매매 함수를 깨웁니다. SQL Editor 에서 아래 두 값을 바꾼 뒤 Run.
--   <PROJECT_REF>     : 프로젝트 주소 https://<PROJECT_REF>.supabase.co 의 그 부분
--   <TRADER_SECRET>   : Edge Function 시크릿에 넣은 TRADER_SECRET 과 같은 값
-- 시각은 UTC. 13~21시면 뉴욕 9:30~16:00 을 서머타임 여부와 상관없이 덮습니다(함수가 장 시간을 다시 확인).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'trader-tick',
  '* 13-21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/trader',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trader-secret', '<TRADER_SECRET>'),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- 멈추기:   select cron.unschedule('trader-tick');
-- 확인:     select * from cron.job_run_details order by start_time desc limit 20;
