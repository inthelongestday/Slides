# Slides — 백엔드 API 명세

프론트(`static/index.html`, `static/storage.js`)는 완성되어 있습니다. 이 문서에 나온
엔드포인트를 FastAPI로 그대로 구현하면 프론트가 즉시 붙습니다. (엔드포인트 이름/요청·응답
형식을 바꾸면 프론트도 같이 고쳐야 하니, 바꾸고 싶으면 먼저 말씀해주세요.)

모든 경로는 `/api`로 시작하고, 프론트는 항상 **상대경로**(`api/...`)로 호출합니다.

---

## 0. 데이터 모델 개념

두 종류의 저장 대상이 있습니다.

| | 문서 (docs) | 페이지 (pages) |
|---|---|---|
| 내용 | 구조화된 JSON (허브의 폴더/핀/카탈로그 상태) | 슬라이드 원본 HTML 그 자체 (문자열 통째로) |
| 예시 id | `index.html` | `pg_a1b2c3` |
| 동시수정 보호 | 있음 (rev 낙관적 락) | 없음 (owner 1인 가정, 단순 덮어쓰기) |
| 프론트 저장 위치 | `hubState.pages` (카탈로그) + `hubState.layout` (폴더/핀 배치) | 각 슬라이드 파일 |

지금 이 프로젝트는 문서가 `index.html` 딱 하나뿐입니다 (허브 상태 전체를 담는 단일 JSON).
페이지는 사용자가 "+새 페이지"로 추가할 때마다 늘어납니다.

> **중요 — `docs`의 `{id}`는 `index.html`만이 아닙니다.** 슬라이드 엔진(`ax-slide-engine.js`)이
> 자체적으로 `WikiStorage.loadDoc()` / `saveDoc(data)`를 **id 없이** 호출합니다 — 이때
> `storage.js`가 현재 문서 URL(`location.pathname`)의 마지막 조각을 문서 id로 자동 사용해서
> `GET/PUT /api/docs/{page_id}`를 부릅니다. 즉 슬라이드 하나(`pg_a1b2c3`)를 열면
> `/api/docs/pg_a1b2c3`에 그 슬라이드의 **인라인 텍스트 수정 + 컴포넌트 순서변경 상태**가
> `{__count, s0: "...", s1: "...", ...}` 형태로 저장됩니다 (허브의 `payload`와는 완전히
> 다른 스키마 — `docs` API는 payload 내부 구조를 몰라도 되고 그냥 JSON 통째로 저장/반환만
> 하면 됩니다). **`{id}` 파라미터를 하드코딩하지 말고 임의의 문자열을 다 받아주세요.**

---

## 1. 인증

### `POST /api/auth/login`
**요청 body**
```json
{ "password": "owner의 비밀번호" }
```
**응답**
- `200` — 성공. 서버가 세션 쿠키(예: `session_id`, httpOnly)를 `Set-Cookie`로 내려줌
- `401` — 비밀번호 불일치

**구현 힌트**: 비밀번호는 환경변수(`OWNER_PASSWORD`)로 관리. 세션은 메모리 dict(`{session_id: "owner"}`)로 충분 (스터디 노트 10번 섹션 세션 인증 패턴 그대로 재사용 가능).

> 이름은 자유지만, 참고로 드린 코드는 환경변수 `OWNER_PASSWORD`(기본값 `changeme`, 배포 전 꼭 바꾸기), 세션 쿠키 이름 `session_id`를 씁니다. 직접 짜실 때 이름을 다르게 해도 계약(요청/응답 형식)만 맞으면 프론트는 전혀 신경 안 씁니다 — 이건 순수 구현 디테일이에요.

**프론트 사용처**: `storage.js: login(password)` → `index.html`의 로그인 모달(`submitLogin()`) → 성공 시 `applyRole()`로 역할 재조회, 사이드바 하단 로그인/로그아웃 버튼과 각 화면의 편집 버튼들이 이 역할에 따라 나타남/사라짐.

---

### `POST /api/auth/logout`
**요청**: body 없음
**응답**: `200` (세션 쿠키 무효화)

**프론트 사용처**: `storage.js: logout()` ← 사이드바 "로그아웃" 버튼.

---

### `GET /api/me`
**응답**
```json
{ "role": "owner" }
```
또는
```json
{ "role": "viewer" }
```
쿠키에 유효한 세션이 없으면 항상 `viewer`. **이 엔드포인트는 로그인 없이도 항상 200이어야 합니다** (viewer도 정상적인 응답).

**프론트 사용처**: `storage.js: getMe()/getRole()` → `applyRole()`이 페이지 로드 시 최초 1회, 로그인/로그아웃 후 재호출. 이 값으로 "+ 새 페이지", "편집" 버튼, 폴더 CRUD 버튼, 드래그 핸들 등 owner 전용 UI 전체를 켜고 끕니다. **클라이언트에서 role을 숨기는 건 UX일 뿐**이고, 실제 방어는 아래 문서/페이지 쓰기 API의 403이 담당해야 합니다 — 반드시 서버에서도 세션 검사하세요.

---

## 2. 문서 (허브 상태 JSON)

### `GET /api/docs/{id}`
예: `GET /api/docs/index.html`

**응답 (200)**
```json
{
  "id": "index.html",
  "kind": "hub",
  "rev": 3,
  "payload": {
    "pages": [
      { "id": "pg_a1b2c3", "title": "AX STEP 1", "desc": "...", "href": "api/pages/pg_a1b2c3", "category": "slide", "meta": "" }
    ],
    "layout": {
      "folders": [ { "id": "f1", "name": "AX 교육자료", "parentId": null, "order": 0 } ],
      "pages": { "api/pages/pg_a1b2c3": { "folderId": "f1", "pinned": true } },
      "pinOrder": ["api/pages/pg_a1b2c3"]
    }
  },
  "updated_by": "owner"
}
```
문서가 아직 없으면(첫 실행) **빈 payload로 자동 생성해서 200을 돌려주세요** — 프론트는 404를 "시드 누락" 취급하지 않고 그냥 에러로 처리합니다. 즉 서버가 항상 문서를 보장해줘야 편합니다.
```json
{ "id": "index.html", "kind": "hub", "rev": 0, "payload": {}, "updated_by": null }
```

**프론트 사용처**: `storage.js: loadDoc('index.html')` ← 페이지 최초 로드시 `initializePage()`에서 1회 호출. 반환된 `payload.pages`/`payload.layout`이 `hubState`에 그대로 들어가 사이드바/핀그리드/폴더 렌더링의 원본 데이터가 됩니다.

---

### `PUT /api/docs/{id}`
**요청 body**
```json
{ "baseRev": 3, "payload": { "pages": [...], "layout": {...} } }
```

**응답**
- `200` — 저장 성공
  ```json
  { "id": "index.html", "rev": 4 }
  ```
- `409` — `baseRev`가 서버의 현재 rev와 다름 (동시수정 충돌)
  ```json
  { "conflict": true, "rev": 4, "payload": { "...서버에 실제 저장된 최신 payload..." }, "updated_by": "owner" }
  ```
- `403` — 로그인 안 된 상태(viewer)의 쓰기 시도 → **여기가 실질적인 쓰기 보안 경계**
- `413` — `payload`가 너무 큼 (권장: 8MB 제한)

**구현 힌트**: 저장할 때마다 `rev += 1`. 개인 홈페이지라 owner가 탭 여러 개로 동시에 열 일이 거의 없다면 409 처리는 최소 구현(그냥 rev 비교 후 다르면 409 던지기)만 해도 충분합니다.

**프론트 사용처**: `storage.js: saveDoc(payload)` ← `persistHub()` 함수가 호출. 폴더 생성/이름변경/삭제, 페이지 핀 고정/해제, 핀 순서 드래그변경, 페이지 카탈로그 추가/수정/삭제 — **이 모든 편집 동작 끝에 항상 `persistHub()`가 불려서** 결국 이 PUT 하나로 수렴합니다.

---

### `GET /api/docs/{id}/revisions`
**응답**
```json
[
  { "rev": 3, "author": "owner", "created_at": "2026-07-09T10:20:00Z" },
  { "rev": 2, "author": "owner", "created_at": "2026-07-08T22:11:00Z" }
]
```

**프론트 사용처**: 지금 UI에서는 호출하는 곳이 없습니다(향후 "변경 기록 보기" 기능을 붙일 때를 위해 계약만 정의). **우선순위 낮음** — 나중에 만들어도 됩니다.

---

## 3. 페이지 (슬라이드 원본 HTML)

### `POST /api/pages`
**요청 body**
```json
{ "html": "<!DOCTYPE html>...전체 슬라이드 HTML..." }
```
**응답 (200)**
```json
{ "id": "pg_a1b2c3", "href": "api/pages/pg_a1b2c3" }
```
- `id`는 서버가 생성(랜덤/타임스탬프 기반, 예: `secrets.token_urlsafe(6)`)
- `href`는 **반드시 `api/pages/{id}` 형태**로 돌려주세요 — 프론트가 이 값을 iframe의 `src`로 그대로 씁니다.
- `403` — viewer의 쓰기 시도

> **필수 처리 — `<base href="/">` 자동 주입.** 슬라이드는 `api/pages/{id}`처럼 중첩된
> 경로로 서빙되기 때문에, 슬라이드 HTML 안의 상대경로(`href="ax-slide-engine.css"`,
> `src="storage.js"`, `src="ax-slide-engine.js"`, 그리고 `storage.js` 내부의
> `fetch('api/docs/...')`)가 전부 **문서 URL 기준으로 잘못 풀립니다**
> (예: `/api/pages/storage.js`처럼 깨져서 404). **저장하기 전에 `<head>` 바로 다음에
> `<base href="/">`가 없으면 삽입해주세요** (이미 있으면 중복 삽입 금지 — 멱등성 유지).
> 이렇게 하면 모든 상대경로가 사이트 루트 기준으로 정확히 풀립니다.
> ```python
> import re
> def ensure_base_href(html: str) -> str:
>     if re.search(r"<base\s+href=", html, re.IGNORECASE):
>         return html
>     return re.sub(r"(<head[^>]*>)", r'\1<base href="/">', html, count=1, flags=re.IGNORECASE)
> ```
> `POST`(신규 생성)와 `PUT`(수정 저장) 양쪽 모두에 이 처리를 적용하세요. 그리고
> `ax-slide-engine.css`/`ax-slide-engine.js`/`storage.js`는 반드시 `static/` 폴더에 두어
> §5의 static mount로 **사이트 루트**(`/ax-slide-engine.css` 등)에서 서빙되게 하세요 —
> `<base href="/">`와 짝이 맞아야 상대경로가 실제로 맞아떨어집니다.

**프론트 사용처**: `storage.js: createPage(html)` ← "+ 새 페이지" 모달에서 `submitPage()`가 신규 생성일 때 호출. 반환된 `href`로 카탈로그(`hubState.pages`)에 항목을 추가하고 곧바로 `PUT /api/docs/index.html`을 호출해 등록을 완료합니다.

---

### `GET /api/pages/{id}`
**응답 (200)**: `Content-Type: text/html`, body는 저장된 HTML 원본 그대로.
`404` — 없는 id.

**중요**: 이 엔드포인트는 두 가지 방식으로 쓰입니다.
1. **iframe이 직접 GET** — 사용자가 사이드바/카드를 클릭하면 `<iframe src="api/pages/pg_a1b2c3">`로 브라우저가 이 URL을 그대로 로드합니다. **응답은 완전한 HTML 문서(`<!DOCTYPE html>`부터)여야** iframe에 정상 렌더링됩니다.
2. **`storage.js`가 fetch로 GET** — 편집 모달을 열 때 원본을 텍스트로 가져와 textarea에 채웁니다 (`loadPageHtml(id)`).

**프론트 사용처**: `openDoc(href, ...)`(뷰어) 및 `openEditPageModal(id)` → `WikiStorage.loadPageHtml(id)`(편집 모달 프리필).

---

### `PUT /api/pages/{id}`
**요청 body**
```json
{ "html": "<!DOCTYPE html>...수정된 전체 HTML..." }
```
**응답**
- `200` — `{ "id": "pg_a1b2c3" }`
- `403` — viewer
- `404` — 없는 id

**프론트 사용처**: `storage.js: savePageHtml(id, html)` ← 편집 모달에서 기존 페이지를 저장할 때 `submitPage()`가 호출. 이후 카탈로그의 title/desc/category 변경분은 별도로 `PUT /api/docs/index.html`로 저장됩니다 (HTML 본문과 메타데이터는 항상 분리 저장).

> **참고 — 두 가지 편집 경로가 공존합니다.** ① 허브의 "편집" 모달(이 엔드포인트)은 슬라이드
> **원본 HTML 전체를 교체**합니다. ② 엔진 자체의 "편집" 토글(`ax-slide-engine.js`)은 원본은
> 그대로 두고 텍스트/순서 변경분만 `/api/docs/{page_id}`에 **오버레이**로 저장합니다.
> 슬라이드 개수(`__count`)가 바뀌면 엔진이 오버레이 복원을 자동으로 건너뛰지만, 개수가
> 같으면서 내용만 다른 새 원본으로 교체하면 옛 오버레이 텍스트가 새 슬라이드 위에 덮어써질
> 수 있습니다. 지금은 API 스펙에서 강제할 부분은 아니라 그냥 알고 계시라고 남겨둡니다 —
> 필요하면 ①로 교체할 때 해당 페이지의 `/api/docs/{page_id}` 오버레이를 같이 삭제하는
> 로직을 추가하는 게 안전합니다.

---

### `DELETE /api/pages/{id}`
**응답**
- `204` — 삭제 성공 (파일도 실제로 지워주세요)
- `403` — viewer
- `404` — 없는 id

> 페이지 파일 삭제 시 `/api/docs/{id}`에 쌓여있을 수 있는 그 슬라이드의 인라인편집
> 오버레이(§0 참고)도 같이 지워주는 걸 추천합니다 — 안 지워도 동작은 하지만(새 페이지가
> 같은 id를 재사용할 일은 없으니) 그냥 죽은 데이터로 남아요.

**프론트 사용처**: `storage.js: deletePage(id)` ← 편집 모달의 "삭제" 버튼(`deleteCurrentPage()`). 삭제 후 카탈로그/레이아웃에서도 해당 항목을 제거하고 `PUT /api/docs/index.html`을 호출합니다.

---

## 4. 저장소 추상화 (구현 팁)

나중에 S3로 옮길 걸 감안하면, 아래처럼 인터페이스 하나만 만들어두고 지금은 로컬 파일로 구현하는 걸 추천합니다.

```python
class StorageBackend(ABC):
    def get_doc(self, doc_id: str) -> dict | None: ...
    def put_doc(self, doc_id: str, kind: str, payload: dict, base_rev: int, author: str) -> dict: ...
    def get_page(self, page_id: str) -> str | None: ...
    def put_page(self, page_id: str, html: str) -> None: ...
    def delete_page(self, page_id: str) -> bool: ...

class LocalFileBackend(StorageBackend):
    # data/docs/{id}.json  = {"kind":..., "rev":..., "payload":..., "updated_by":..., "updated_at":...}
    # data/pages/{id}.html = 원본 그대로
    ...

# 나중: class S3Backend(StorageBackend): ...  ← 교체만 하면 라우터 코드는 그대로 재사용
```

라우터(`routers/docs.py`, `routers/pages.py`)는 `StorageBackend` 인터페이스만 알고 구현체를 몰라야, 나중에 S3로 바꿀 때 라우터 코드를 안 건드리게 됩니다.

---

## 5. 정적 파일 서빙

`main.py`에서 `static/index.html`, `static/storage.js`를 서빙해야 합니다. 여기에
**`static/ax-slide-engine.css`, `static/ax-slide-engine.js`도 같이 넣어주세요** — 슬라이드
템플릿이 `<base href="/">`(§3 참고) 덕분에 이 파일들을 사이트 루트 경로로 찾습니다.
FastAPI `StaticFiles`로 `/`에 마운트하면 한 번에 다 해결됩니다 (스터디 노트에는 없던
부분이라 참고로 추가):

```python
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="static", html=True), name="static")
```
단, `/api/*` 라우터는 이 마운트보다 **먼저 등록**해야 합니다 (FastAPI는 등록 순서대로 매칭 시도).

```
static/
├── index.html
├── storage.js
├── ax-slide-engine.js
└── ax-slide-engine.css
```

---

## 6. 엔드포인트 요약표

| Method | Path | 인증 필요 | 용도 |
|---|---|---|---|
| POST | `/api/auth/login` | - | 로그인 |
| POST | `/api/auth/logout` | - | 로그아웃 |
| GET | `/api/me` | - | 현재 role 조회 |
| GET | `/api/docs/{id}` | - | 허브 상태 조회 |
| PUT | `/api/docs/{id}` | owner | 허브 상태 저장 |
| GET | `/api/docs/{id}/revisions` | - | 변경 이력 (나중) |
| POST | `/api/pages` | owner | 새 슬라이드 등록 |
| GET | `/api/pages/{id}` | - | 슬라이드 원본 조회 |
| PUT | `/api/pages/{id}` | owner | 슬라이드 원본 수정 |
| DELETE | `/api/pages/{id}` | owner | 슬라이드 삭제 |