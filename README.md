# loljjang

리그 오브 레전드 **챔피언 연습 기록** 대시보드.
최대 10개 계정의 전적을 합산해 연습 챔피언의 판수·승률을 한 화면에서 확인합니다.

> 현재 상태: **UI 단계**. 화면은 PoC로 실제 수집한 전적(`data/seed-records.json`)을 사용합니다.
> Riot API 실시간 갱신은 다음 단계에서 연결합니다.

---

## 시작하기

```powershell
npm install
npm run dev          # http://localhost:3000
```

```powershell
npm run build        # 프로덕션 빌드 (타입체크 포함)
npm start
```

## 전적 수집 (PoC)

`.env`에 Riot API 키를 넣은 뒤 실행합니다. (키는 24시간마다 만료)

```powershell
node poc/collect.mjs --accounts "이름#태그,이름2#태그" --count 20
```

- 결과: `poc/out/records.json`, `poc/out/accounts.json`
- 대시보드 반영: `Copy-Item poc\out\records.json data\seed-records.json -Force`

자세한 검증 결과는 [`poc/REPORT.md`](./poc/REPORT.md), 기획은 [`PRD.md`](./PRD.md) 참고.

## 구조

```
app/                 Next.js App Router
  page.tsx           시드 데이터 → Dashboard
  globals.css        디자인 토큰 · 레이아웃 · 반응형
  api/
    account/resolve  Riot ID → puuid (서버 프록시)
    matches/ids      계정·큐별 최근 matchId 목록
    matches/detail   matchId 배치 → 압축 레코드 (최대 5건/요청)
components/
  Dashboard.tsx      상태(기간/검색/포지션/정렬) · 새로고침
  SummaryCards.tsx   합산 요약 4종
  ChampionCard.tsx   챔피언 카드 (승률 게이지)
  ChampionModal.tsx  챔피언 상세 (최근 경기 20건)
  ChampionPicker.tsx 연습 챔피언 선택 (검색·포지션·10개 제한)
  AccountManager.tsx 계정 추가/삭제
  AccountTable.tsx   계정별 비교 표
  SyncPanel.tsx      수집 진행률 · 오류 알림
lib/
  aggregate.ts       집계 (큐 필터 · 중복 제거 · 승률)
  champions.ts       Data Dragon 챔피언 메타 (한글명·포지션)
  meta.ts            큐/포지션 라벨 · 시즌 시작일
  types.ts           도메인 타입
  sync.ts            증분 수집 오케스트레이션 (클라이언트)
  store.ts           localStorage 저장소
  useCollection.ts   수집 상태 훅
  server/riot.ts     Riot 클라이언트 · 레이트 리미터 (서버 전용)
data/
  champions.json     173종 (패치 16.23.1)
  seed-records.json  PoC 수집 결과 39경기
  seed-accounts.json
poc/
  collect.mjs        수집 CLI
  riot.mjs           Riot 클라이언트 · 레이트 리미터
scripts/
  build-champions.mjs  챔피언 메타 재생성
```

## API 설계 (키는 서버에만 존재)

| Route | 요청 | 동작 |
| --- | --- | --- |
| `POST /api/account/resolve` | `{gameName, tagLine}` | Riot ID → puuid·레벨 |
| `POST /api/matches/ids` | `{puuid, count, queues[]}` | 큐별 최근 matchId |
| `POST /api/matches/detail` | `{puuid, matchIds[]}` (≤5) | 압축 레코드 + 리메이크/큐 필터 |

- 레이트 리미터는 `globalThis` 공유 (1.2초 간격, 95req/2분)
- 401/403/404/429 를 `{ok:false, code, message}` 로 정규화
- 서버리스 타임아웃(10초) 회피를 위해 상세 조회는 5건 배치

## 구현된 기능

- **계정 관리**: Riot ID 등록(서버 검증)·삭제(전적 동반 삭제)·중복 차단·최대 10개·등록 즉시 10경기 백필
- **연습 챔피언 선택**: 검색 + 포지션 필터, 최대 10개, 제거해도 수집 기록은 보존
- 전체 계정 합산 챔피언 카드 (판수·승·패·승률·게이지) — **연습 챔피언 기준 집계**
- 챔피언 검색 + 포지션 필터(탑/정글/미드/원딜/서폿) + 정렬
- 기간 토글: **전체 / 이번 시즌**
- 계정별 비교 표
- 챔피언 상세 모달 (최근 경기·KDA·큐·계정)
- **새로고침: 증분 수집 + 진행률 + 취소 + 오류 알림**
- **localStorage 저장** (계정·전적·챔피언·갱신 시각)
- 다크/라이트 테마 (localStorage 유지)
- 반응형 (360px ~)

## 다음 단계

1. 프로덕션 API 키 신청 (개발용 키 24시간 만료 대응)
2. "더 불러오기" 페이지네이션으로 100경기 이상 백필 — FR-3.6
3. 목표 설정(예: 아리 30판 승률 55%) — v2
