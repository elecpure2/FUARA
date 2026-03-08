# FUARA Agent Quick Guide

## Codex 전용 고정 룰 (항상 최우선 적용)
- FUARA는 **나만의 생산성 향상**을 위한 앱이자, **AI를 통해 비개발자도 더 수월하게 작업**할 수 있도록 돕는 앱이다.
- 최종 목표는 개인용 도구를 넘어서, **다른 사용자들도 같은 상황에서 FUARA로 자기개발 역량을 높일 수 있게 만드는 것**이다.
- 기능/UX/데이터 구조를 결정할 때는 항상 다음을 우선한다:
  1) 실행 가능성(오늘 바로 행동으로 이어지는가)
  2) 동기부여 유지(다시 켜고 싶어지는가)
  3) 장기 확장성(다른 사용자에게도 통하는가)
- 자정 넘김 일정 분할 고정 규칙: 하나의 일정이 00:00을 넘기면 반드시 두 개로 분할 저장한다.
  - 전날 일정: 시작시각 ~ 24:00
  - 다음날 일정: 00:00 ~ 종료시각
  - 예: 3/7 22:00~3/8 01:00 요청 시 -> (3/7 22:00~24:00) + (3/8 00:00~01:00)
- GitHub에 푸시할 때는 **개인정보/개인 운영 데이터 업로드를 절대 금지**한다.
  - 업로드 금지 예시: 개인 프로젝트명, 실제 스케줄, 개인 할일 목록, 개인 메모/작업일지, 로컬 DB 데이터(`*.db`, `*.db-wal`, `*.db-shm`)
  - 푸시 전 원칙: 개인 데이터는 제거/익명화/샘플화 후 반영한다.

이 문서는 Cursor/Antigravity 같은 에이전트가 FUARA 앱을 즉시 연동하기 위한 실전 지침서입니다.

## 앱 기능 요약
- 프로젝트/할일/서브태스크 관리
- 오늘 할 일, 날짜별 목록, 캘린더 완료 이력
- 작업 설명(description), 예상 시간(estimate), 실제 시간(actual) 기록
- 메인 앱 + 스티커 앱 동기화

## 절대 규칙
- FUARA 관련 요청에서는 웹 검색을 하지 않는다.
- 먼저 `GET /ping`으로 서버 상태를 확인한다.
- 서버가 꺼져 있으면 "FUARA 앱 실행 필요"를 먼저 안내한다.
- 사용자가 "정리해서 넣어줘"라고 하면, 대화 내용을 구조화해 바로 FUARA에 등록한다.

## API 기본값
- Base URL: `http://127.0.0.1:7777`
- Content-Type: `application/json; charset=utf-8`

## Unicode 안전 프로토콜 (매우 중요)
- 한글/일본어/중국어처럼 `비ASCII` 문자가 들어가는 등록/수정 요청은 항상 `유니코드 안전 모드`로 처리한다.
- PowerShell의 `Invoke-RestMethod` + 인라인 문자열/`ConvertTo-Json` 조합은 글자가 `???` 또는 깨진 문자로 저장될 수 있으므로 기본 경로로 쓰지 않는다.
- **기본 쓰기 방식**:
  1. UTF-8을 보장할 수 있는 `Python 스크립트` 또는 `UTF-8 파일로 저장된 Node 스크립트`를 사용한다.
  2. JSON 직렬화 시 Python은 `json.dumps(..., ensure_ascii=False)`, Node는 UTF-8 문자열을 그대로 사용한다.
  3. 요청 헤더에 반드시 `Content-Type: application/json; charset=utf-8`를 넣는다.
- **권장 방식 1: Python**
  - `urllib.request` 또는 동등한 HTTP 클라이언트를 사용한다.
  - `data = json.dumps(payload, ensure_ascii=False).encode("utf-8")`
  - 가능하면 저장소에 있는 `python fuara_api.py METHOD /path --json-file payload.json` 경로를 우선 사용한다.
- **권장 방식 2: Node**
  - `node -e` 인라인 실행보다, UTF-8 파일 또는 here-doc/file 기반 스크립트를 우선한다.
- **금지에 가까운 방식**
  - PowerShell에 한글 JSON을 직접 적고 `Invoke-RestMethod`로 바로 보내기
  - 터미널 출력이 정상으로 보인다고 저장도 정상이라고 가정하기
- **쓰기 후 검증**
  - 비ASCII 텍스트를 저장했으면 가능하면 즉시 `GET`으로 다시 읽거나 DB를 확인해 `???`로 저장되지 않았는지 확인한다.
  - 터미널 출력만 깨지고 실제 DB는 정상일 수도 있으므로, 필요하면 `unicode_escape` 확인이나 DB 재조회로 구분한다.
- **빠른 판단 규칙**
  - payload에 한글/일본어가 있으면: 무조건 `Python UTF-8 요청`을 기본값으로 사용한다.
  - 영어/숫자만 있으면: 일반 방식 사용 가능.
- **에이전트 실전 권장 경로**
  - PowerShell 명령줄에 한글 JSON을 직접 적지 않는다.
  - UTF-8 JSON 파일을 만든 뒤 `python fuara_api.py POST /tasks --json-file payload.json` 형태로 호출한다.
  - 터미널 출력이 깨질 수 있으면 `--ascii` 옵션으로 응답을 escape해서 검증한다.
- **예시 (Python)**
```python
import json, urllib.request

payload = {
    "title": "JLPT N3공부 (일본어)",
    "description": "일본어 공부 시간",
}
data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(
    "http://127.0.0.1:7777/schedules",
    data=data,
    method="POST",
    headers={"Content-Type": "application/json; charset=utf-8"},
)
with urllib.request.urlopen(req) as res:
    print(res.read().decode("utf-8"))
```

## 자연어 -> API 매핑
- "푸아라 앱에 추가해줘", "FUARA에 추가해줘", "오르빗 앱에 추가해줘", "할일목록에 추가해줘" -> `POST /tasks`
- "노트에 추가해줘", "메모에 정리해줘", "작업일지로 남겨줘" -> `POST /notes`
- "오늘 작업일지 Hub에 업로드해줘", "VDG 작업일지 정리해줘" -> `POST /projects/:id/worklog`
- "내일 할 일로 지정해줘" -> `target_date = 내일(YYYY-MM-DD)`
- "완료 처리해줘" -> `PATCH /tasks/:id` with `{ "status": "done" }`
- "다시 할 일로 복원해줘" -> `PATCH /tasks/:id` with `{ "status": "pending" }`
- "오늘 할 일 보여줘" -> `GET /tasks/today`
- "삭제해줘" -> `DELETE /tasks/:id`

## 태스크 자동 분해 규칙 (중요)
- 요청에 해야 할 일이 2개 이상이면 자동으로 `메인태스크 1개 + 서브태스크 N개`로 나눈다.
- 분해 기준 예시:
  - 문장에 "그리고/다음/우선/마지막" 같은 순서 표현이 있음
  - 구현/테스트/정리처럼 성격이 다른 작업이 섞여 있음
  - 예상 소요 시간이 긴 작업(예: 2시간+)을 단계로 쪼개면 실행이 쉬움
- 각 태스크는 반드시 `title` + `description`을 채운다.
- `description`은 비개발자 친화 한국어로 작성한다.
  - 왜 하는지(목적)
  - 무엇을 하면 끝인지(완료 기준)
  - 가능하면 2~4문장으로 쉽게 설명

## Todo/Note 분리 원칙 (핵심)
- 긴 대화 내용을 정리할 때는 **실행 계획(Todo)**와 **맥락 기록(Note)**을 분리한다.
- `Todo`는 "내일 실제로 할 행동" 중심으로 잘게 쪼갠다.
- `Note`는 "왜 하는지, 장기 방향, 품질 기준, 확장 아이디어"를 포괄적으로 기록한다.
- 사용자가 "정리해서 넣어줘"라고 말하면 기본값은 아래처럼 처리한다:
  1) `POST /tasks`로 실행 가능한 메인/서브태스크 생성
  2) `POST /notes`로 개발자 관점 메모 1개 생성

### Todo 작성 기준
- 제목: 오늘/내일 바로 실행 가능한 형태
- 설명: 비개발자도 이해 가능한 쉬운 문장
- 체크 가능 단위로 분해 (작성/구현/테스트/검수)

### Note 작성 기준
- 카테고리: 기본 `dev` (개발메모)
- 내용: 배경/목표/기대효과/추가 아이디어/주의사항 순으로 4~8문장
- 미래 확장 포인트를 1~3개 포함
- "왜 이 작업이 필요한지"를 반드시 포함

## 작성 양식 (권장)
- 제목: `프로젝트/범위 + 실행 동사 + 목표`
  - 예: `VDG 프로젝트 캐릭터 대사 5개 추가하기`
- 세부내용:
  - 예: `현재 LV1에 나올 수 있는 대사 수가 적어서 플레이 체감 시간이 짧습니다. 컨텐츠 체류 시간을 늘리기 위해 가벼운 성격의 대사 5개를 추가합니다. 그래프 에디터에서 LV1 조건으로 배치하고, 실제 재생 테스트까지 끝나면 완료입니다.`

## POST /tasks 권장 페이로드
```json
{
  "project": "Virtual Desktop Girl",
  "title": "VDG 프로젝트 캐릭터 대사 5개 추가하기",
  "description": "현재 LV1 대사량이 적어 컨텐츠 체감 시간이 짧습니다. 컨텐츠 체류 시간을 늘리기 위해 간단한 대사 5개를 추가합니다. LV1 조건으로 배치하고 재생 테스트가 끝나면 완료입니다.",
  "estimate_minutes": 120,
  "priority": "must",
  "target_date": "2026-02-27",
  "subtasks": [
    {
      "title": "LV1용 대사 5개 초안 작성",
      "description": "짧고 자연스러운 말투로 5개를 먼저 작성합니다. 각 대사는 성격이 겹치지 않게 구분합니다.",
      "estimate_minutes": 35
    },
    {
      "title": "EventDialogueAsset에 대사 등록",
      "description": "작성한 대사를 에셋으로 옮기고 트리거/라우팅을 연결합니다. 저장 후 그래프에서 누락이 없는지 확인합니다.",
      "estimate_minutes": 55
    },
    {
      "title": "인게임 재생 테스트",
      "description": "터치 시 대사가 실제로 잘 나오는지, 반복이 과하지 않은지 점검합니다. 문제 없이 재생되면 완료 처리합니다.",
      "estimate_minutes": 30
    }
  ]
}
```

## POST /notes 권장 페이로드
```json
{
  "title": "VDG 대화 히스토리 + 레벨업 축하대사 작업 메모",
  "category": "dev",
  "content": "내일 작업은 대화 히스토리 UI/UX의 기본 골격을 먼저 만드는 것이 핵심이다. 하루 안에 완성보다, 실제로 기록/조회 흐름이 동작하는 수준까지 구축하는 것을 목표로 한다. 레벨업 축하대사는 유저가 레벨 시스템을 인지하게 만드는 장치이므로 우선순위를 높게 둔다. Lv1->Lv2 구간의 1회성 축하대사를 히스토리에 남길 수 있게 연결하면, 놓친 유저도 나중에 확인할 수 있다. 추가로 캐릭터 옆 Level Up 이펙트/텍스트를 붙이면 시각적 피드백이 강화된다. 장기적으로는 원신 캐릭터 음성 탭처럼 루프 대화/1회성 대화 모두 히스토리에 남기는 구조를 목표로 한다."
}
```

## 실제 변환 예시 (사용자 긴 문장 -> Todo + Note)

### 입력 예시
- "내일부터 대화 히스토리 시스템 + 레벨업 축하대사를 하자. 내일은 히스토리 UIUX를 어느 정도 구축하고 축하대사 1개를 히스토리에 넣는 것까지 하자. 이유는 유저가 못 들을 수 있어서야."

### Todo 생성 예시 (`POST /tasks`)
```json
{
  "project": "Virtual Desktop Girl",
  "title": "VDG 대화 히스토리 시스템 1차 구축",
  "description": "내일은 대화 히스토리의 기본 사용 흐름을 만들고, 레벨업 축하대사 1개가 히스토리에 기록되도록 연결합니다. 하루 안에 완성보다 동작 가능한 기본 골격 구축을 목표로 합니다.",
  "priority": "must",
  "target_date": "YYYY-MM-DD(내일)",
  "estimate_minutes": 240,
  "subtasks": [
    {
      "title": "대화 히스토리 UI/UX 기본 화면 구성",
      "description": "히스토리 목록과 상세 확인 흐름을 먼저 만들고, 실제로 열고 닫히는지 확인합니다.",
      "estimate_minutes": 120
    },
    {
      "title": "레벨업 축하대사 1개 작성 및 연결",
      "description": "Lv1->Lv2 구간에서 1회 재생되는 축하대사 1개를 만들고 트리거를 연결합니다.",
      "estimate_minutes": 60
    },
    {
      "title": "히스토리 반영 테스트",
      "description": "축하대사를 놓친 경우에도 히스토리에서 다시 확인 가능한지 테스트합니다.",
      "estimate_minutes": 60
    }
  ]
}
```

### Note 생성 예시 (`POST /notes`)
```json
{
  "title": "대화 히스토리 작업 방향 메모",
  "category": "dev",
  "content": "추후 대화 시스템 Lv1 대사량 확충과 함께 히스토리 시스템을 병행 구축한다. 레벨업 축하대사는 유저에게 성장 체감을 주는 핵심 장치이며, 1회성으로 놓칠 가능성이 있으므로 히스토리 재청취 기능이 필요하다. 대화 히스토리 구조는 향후 루프 대사/1회성 대사 모두 수용 가능하게 설계한다. 장기적으로는 원신의 음성 탭처럼 캐릭터 기록 보관소 역할을 하게 만든다."
}
```

## Project Custom Sections (프로젝트 커스텀 섹션)

프로젝트별 사용자 정의 섹션을 관리한다. 대사 라이브러리, 참고 문서, 체크리스트 등을 프로젝트에 연결할 수 있다.

### 자연어 매핑
- "VDG 대사 전체 보여줘", "대사 라이브러리 불러와줘" → `GET /projects/:id/items/export`
- "대사 추가해줘", "라이브러리에 넣어줘" → `POST /sections/:id/items`
- "대사 수정해줘" → `PATCH /items/:id`
- "섹션 추가해줘" → `POST /projects/:id/sections`

### 핵심 API

| 메서드 | 경로 | 역할 |
|--------|------|------|
| GET | `/projects/:id/sections` | 프로젝트 섹션 목록 |
| POST | `/projects/:id/sections` | 섹션 생성 |
| PATCH | `/sections/:id` | 섹션 수정 |
| DELETE | `/sections/:id` | 섹션 삭제 |
| GET | `/sections/:id/items` | 섹션 아이템 목록 |
| POST | `/sections/:id/items` | 아이템 추가 |
| PATCH | `/items/:id` | 아이템 수정 |
| DELETE | `/items/:id` | 아이템 삭제 |
| GET | `/projects/:id/items/export` | **전체 내보내기** (마크다운 기본, `?format=json`으로 JSON) |

### POST /projects/:id/sections 페이로드
```json
{
  "section_type": "dialogue_library",
  "title": "대사 라이브러리"
}
```
- `section_type`: `dialogue_library` / `reference_doc` / `checklist`

### POST /sections/:id/items 페이로드
```json
{
  "title": "비밀인데 말이야~",
  "content": "비밀인데 말이야\n지금 한 말은 대본에 없는 거야.",
  "tags": "[\"Lv1\", \"BodyTouch\", \"완성\"]",
  "metadata": "{\"trigger\": \"BodyTouch\", \"level\": 1, \"hasVoice\": true}"
}
```
- `tags`: JSON 배열 문자열 (필터링용)
- `metadata`: JSON 객체 문자열 (섹션 타입별 추가 데이터)

### LLM 대사 작업 워크플로우
1. `GET /projects/1/items/export` → 캐릭터 프로필 + 기존 대사 전체를 마크다운으로 수신
2. 이 컨텍스트를 기반으로 새 대사 제안
3. 승인되면 `POST /sections/2/items`로 바로 등록
4. `?format=json`으로 호출하면 프로그래밍적으로 파싱 가능한 JSON 반환

## Worklog Hub 업로드

하루 작업이 끝난 뒤 에이전트가 `프로젝트 Hub > 작업일지(worklog)` 섹션에 일일 요약을 남길 수 있다.

### 핵심 API
- `GET /projects/:id/worklog` → 작업일지 섹션/아이템 조회
- `GET /projects/:id/worklog?date=YYYY-MM-DD` → 특정 날짜 작업일지 조회
- `POST /projects/:id/worklog` → 같은 날짜 항목이 있으면 업데이트, 없으면 생성

### 업로드 규칙
- `work_date`는 로컬 기준 `YYYY-MM-DD`
- `content`는 사람이 읽는 3~6문장 요약
- `time_summary_minutes`는 총 작업 시간(분), 비우면 자동 계산
- 자동 계산 우선순위:
  1. 해당 프로젝트 완료 태스크의 `actual_minutes` 합
  2. 값이 없으면 전역 `work_sessions` 참고
  3. `manual_adjust_minutes`가 있으면 보정
- 같은 날짜에 다시 업로드하면 새로 만들지 말고 업데이트한다
- `related_task_ids`, `related_note_ids`가 있으면 같이 저장한다

### POST /projects/:id/worklog 권장 페이로드
```json
{
  "work_date": "2026-03-07",
  "title": "2026-03-07 VDG 작업일지",
  "content": "오늘은 EventDialogueGraphWindow의 얼굴 미리보기 흐름을 정리하고, 관련 대화 자산 동기화 로직도 점검했다. 편집기 사용감이 헷갈리던 부분을 줄이는 쪽으로 손봤다. 마지막으로 실제 데이터가 깨지지 않도록 저장 경로도 다시 확인했다.",
  "time_summary_minutes": 270,
  "time_note": "오늘 대략 4시간 30분 작업. 자동 집계값이 부족해서 체감 기준으로 보정했다.",
  "related_task_ids": [12, 19],
  "related_note_ids": [7],
  "summary_source": "agent_daily_summary"
}
```

## PATCH /tasks/:id 가능 필드
- `title`, `description`, `estimate_minutes`, `actual_minutes`
- `priority` (`must|normal|low`)
- `status` (`pending|done|cancelled`)
- `target_date`
- `stopwatch_elapsed`, `stopwatch_started_at`

## 에이전트 응답 권장 포맷
- "등록 완료: #ID / 제목 / 날짜 / 우선순위"
- "서브태스크: N개 자동 분해 완료"
- 수정/완료/삭제도 같은 형식으로 핵심 결과를 짧게 보고한다.


