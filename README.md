# LOLEX

League of Legends 모임용 회원 관리, 매칭, BO3 경기 기록 및 리그 신청 서비스입니다.

## 실행

Node.js 24 LTS를 기준으로 확인했습니다.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# .env.local에 Supabase 프로젝트 URL과 publishable key 설정
npm.cmd run dev
```

이미 .env.local이 있다면 덮어쓰지 마세요. 실제 값과 리플레이 원본은 Git에 올리지 않습니다.

## 확인

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

빌드 전 환경변수 검사가 실행됩니다. 공개 환경변수에 비밀 키가 들어 있거나 설정이 없으면 빌드를 중단합니다.
실제 리플레이 검증은 선택 사항이며 `LOLEX_REPLAY_FIXTURE_DIR`을 설정한 경우에만 실행됩니다.

## 구조

- `src/`: React 화면, 리플레이 분석 및 검수
- `supabase/functions/`: 로컬에 확보된 서버 API 소스
- `supabase/migrations/`: 기존 DB에 적용한 변경분
- `supabase/tests/`: DB 회귀 검증
- `scripts/`: 환경 검증 및 API 점검 도구
- `docs/deployment.md`: GitHub · Vercel · Supabase 배포 절차와 미확인 항목

## 배포

프런트엔드는 Vercel, 서버 API와 데이터는 Supabase에서 운영합니다.
`vercel.json`으로 Vite 빌드 및 SPA 경로를 설정합니다.

[배포 안내](docs/deployment.md)를 먼저 확인하세요. 로컬에 없는 서버 함수와 기존 DB 기본 스키마는 Supabase 관리 연결 후 별도로 확보해야 합니다.
