# LOLEX 배포 안내

프런트엔드는 Vercel에, 회원·매칭·리그 API와 DB는 기존 Supabase 프로젝트에 배포합니다.
Vercel 배포만으로 Supabase 함수나 DB가 생성되거나 변경되지는 않습니다.

## 배포 전 확인 상태

- `.env*`는 Git에서 제외하고 값 없는 `.env.example`만 포함합니다.
- 현재 로컬 환경변수는 프로젝트 URL과 브라우저용 publishable key입니다.
- `npm run build`는 먼저 환경변수 누락과 service_role/secret key의 브라우저 노출을 검사합니다.
- `vercel.json`에 Vite 빌드, dist 출력, SPA 경로 처리, 기본 응답 헤더를 지정했습니다.
- RLS·API 권한은 2026-10-05 점검 및 보완 완료. Auth Dashboard 설정과 브라우저 기능 테스트는 남아 있습니다. [점검 기록](security-review-2026-10-05.md)을 확인합니다.
- 현재 로컬 마이그레이션은 기존 DB에 추가된 변경분입니다. 빈 DB를 처음부터 구축하는 완전한 스키마가 아닙니다.
- 로그인·대기열·포지션·리그 함수 일부는 로컬에 없으므로, 관리 연결 후 배포된 코드를 확보해야 합니다.
- 계정 정리는 사용자가 완료했습니다. 추가 계정 삭제는 진행하지 않습니다.

## GitHub

대상 저장소: https://github.com/xornlsl/lolex

비공개 저장소를 사용합니다. `node_modules`, `dist`, `.env.local`, 리플레이 원본과 DB 내보내기 파일은 올리지 않습니다.
첫 push 전에 `git diff --cached --stat`과 `git status --short`로 대상 파일을 확인합니다.

## Vercel

GitHub 계정으로 가입한 뒤 Add New → Project에서 `xornlsl/lolex`를 가져옵니다.
GitHub 접근 권한은 해당 저장소로 제한할 수 있습니다.

| 설정 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | 저장소 루트 (`./`) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Environment Variables에는 다음 두 개를 등록합니다. 값은 로컬 `.env.local` 또는 Supabase 프로젝트 설정에서 확인하고 채팅이나 저장소에 복사하지 않습니다.

| 변수 | 내용 |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://프로젝트주소.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 기존 변수 이름 유지. 값은 publishable key 또는 legacy anon key |

Preview와 Production 환경 모두에 설정합니다. 환경변수를 변경하면 새로 배포해야 합니다.
`service_role`, `sb_secret_…`, DB 비밀번호는 Vercel 프런트엔드에 등록하지 않습니다.

## Supabase 운영 확인

- public 테이블과 Storage의 RLS 및 정책 확인.
- 비로그인·일반회원이 회원 명단, 관리자 작업, 레이팅 변경 함수에 접근할 수 없는지 확인.
- SECURITY DEFINER 함수의 anon/authenticated 실행 권한 확인.
- 공개 가입 API의 명단 대조·중복 검사·승인 전 접근 차단 확인.
- 로그인 장시간 유지와 토큰 만료 후 갱신/재로그인 동작 확인. 현재 코드에서 자동 갱신 구현은 추가 점검 대상입니다.
- 브라우저에서 새로운 배포 Origin에 대한 API CORS 사전 요청 확인.
- DB 삭제 전에 보존 계정을 ID·성명·생년월일로 대조. 관리자 권한과 로그인 계정 보존.

## 테스트 배포 → 도메인

먼저 발급된 Vercel 주소에서 로그인, 가입·승인, 일반회원/관리자 권한, 매칭, BO3 리플레이 검수·확정, 레이팅·모스트 챔피언, 리그 신청·어필 표시를 확인합니다.
현재 인증은 사용자 아이디/비밀번호를 서버 로그인 API로 보내는 방식입니다. Site URL 변경만으로 토큰 만료나 API 오류가 해결되지는 않습니다.

테스트를 통과하면 사용자가 선택한 도메인을 구매하고 Vercel Project → Settings → Domains에 추가합니다.
DNS 값은 Vercel이 해당 도메인에 표시하는 값을 사용합니다. HTTPS 인증서 적용을 확인한 뒤 Supabase Authentication → URL Configuration에서 Site URL과 허용 Redirect URL을 실제 주소로 설정합니다.
운영 Redirect URL은 필요한 정확한 주소만 등록합니다. 새 도메인에서는 브라우저 저장소가 별도이므로 다시 로그인해야 합니다.
도메인 구매·결제와 최종 공개는 사용자가 선택한 계정과 도메인으로 진행합니다.

## 공식 문서

- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/environment-variables
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/deployment/going-into-prod
- https://supabase.com/docs/guides/auth/redirect-urls
