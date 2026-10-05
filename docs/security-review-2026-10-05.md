# 공개 전 보안 점검 — 2026-10-05

## 적용·검증 완료

- public 테이블 14개 RLS 활성화 확인.
- 승인 대기/정지 회원의 경기·레이팅·리그·대기열 직접 조회에 승인 조건 추가.
- 브라우저 역할(anon/authenticated)의 직접 데이터 쓰기 및 TRUNCATE 권한 제거. 서비스 API 쓰기는 유지.
- 내부 트리거 함수 2개 및 회원 조회 SECURITY DEFINER RPC의 브라우저 실행 권한 제거.
- 리그 관리/신청 API에 approved 상태 검사 적용. 정지된 관리자도 차단.
- 실제 DB 역할을 바꾸는 트랜잭션 테스트: 승인 회원 조회 성공, 다른 회원 프로필/명단 비공개, 미승인 조회 및 직접 쓰기 차단. 임시 자료는 rollback.
- 보호된 API 16개: 비로그인 GET 모두 401. Vercel Origin CORS OPTIONS 204.
- 리그 권한 회귀 테스트: pending/suspended × member/staff/superadmin × GET/POST/PATCH/DELETE 거절. 승인 일반회원 관리자 조회/삭제 거절. 테스트는 핸들러와 모의 DB를 사용하며 실제 로그인 HTTP 테스트를 대체하지 않음.
- Node 테스트 30개 통과, 실물 ROFL 선택 테스트 1개 생략.
- 계정 정리는 사용자가 완료했으며 기존 계정 삭제/수정은 수행하지 않음.

## 남은 Auth 설정 및 공개 전 확인

- 공개 Auth settings에서 `disable_signup=false`, `mailer_autoconfirm=true`, 익명 로그인 비활성 확인.
  현재 홈페이지 가입은 lolex-signup이 명단 검증 후 admin.createUser를 사용한다.
  일반 `/auth/v1/signup` 경로는 별도이므로 Dashboard의 Allow new users to sign up 비활성화를 검토·적용하고 홈페이지 가입 회귀 테스트 필요.
- 유출 비밀번호 차단 비활성 경고가 남음. Pro 이상 기능이므로 요금제와 옵션 확인 필요. 자동 유료 전환하지 않음.
- Site URL/Redirect URL, 세션 수명, rate limit/CAPTCHA는 현재 MCP 도구로 전체 설정을 확인·변경하지 못함. Dashboard 확인 필요.
- 프런트엔드는 refresh_token을 저장하지만 자동 갱신은 구현되어 있지 않음. 만료 시 재로그인/검수 내용 보존 흐름을 공개 전에 보완·검증해야 함.
- 실제 일반회원/관리자 로그인 상태에서 가입·승인·리그 생성/신청·매칭/결과 저장을 브라우저로 테스트해야 함.
- 리그 이미지 업로드의 크기/파일 형식 제한, 신청 마감·정원 처리와 요청 빈도 제한도 운영 점검 대상으로 남아 있음.
- RLS 정책 없음 INFO 3개(replay_games, replay_participants, test_match_roster)는 서버 전용 테이블의 의도된 클라이언트 접근 차단이며 공개 SELECT 정책을 추가하지 않음.

## 재실행

- `node scripts/audit-public-endpoints.mjs` — 공개 키만 사용, 비로그인 API·CORS·공개 Auth 설정 읽기 전용 확인.
- `supabase/tests/launch_permissions.sql` — 임시 자료 생성 후 rollback하는 DB 권한 테스트.
- `npm test` — 리그 권한 분기 포함 로컬 테스트.

공식 설정 안내:
- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
