# Slides — 백엔드 API 명세

프론트(`src/web/index.html`, `storage.js`)는 완성돼 있고, 이 문서의 엔드포인트를 그대로
구현하면 붙습니다. **계약(경로/요청/응답 형식)을 바꾸면 프론트도 같이 고쳐야** 하니, 바꾸려면
먼저 상의하세요.

- 모든 경로는 `/api`로 시작. 프론트는 항상 **상대경로**(`api/...`)로 호출.
- 저장 대상은 2종: **문서(index, JSON)** 와 **페이지(slides, HTML)**.
- 인증은 owner/viewer 2단계. **읽기(GET)는 누구나, 쓰기(POST/PUT/DELETE)는 owner만**
  (미들웨어 + 각 쓰기 API의 403이 실제 방어선).

---

## 0. 데이터 모델

| | 문서 (index) | 페이지 (slides) |
|---|---|---|
| 내용 | 구조화된 JSON | 슬라이드 원본 HTML 문자열 통째로 |
| 예시 id | `index.html`, `pg_a1b2c3` | `pg_a1b2c3` |
| 동시수정 보호 | 있음 (rev 낙관적 락) | 없음 (단순 덮어쓰기) |
| 저장 위치(예) | `index/{id}.json` | `slides/{id}.html` |

### 문서(index) 저장 객체
```json
{ "kind": "hub", "rev": 3, "payload": { ... }, "updated_by": "owner", "updated_at": "2026-07-17T14:00:00Z" }
```

### `payload` 내부 구조 — `{id}`에 따라 2종 (백엔드는 검증 없이 통째로 저장/반환)
- **`id = index.html`** (허브 상태):
  ```json
  {
    "pages": [
      { "id": "pg_a1b2c3", "title": "AX STEP 1", "desc": "...", "href": "api/slides/pg_a1b2c3", "category": "slide", "meta": "" }
    ],
    "layout": {
      "folders": [ { "id": "f1", "name": "AX 교육자료", "parentId": null, "order": 0 } ],
      "pages": { "api/slides/pg_a1b2c3": { "folderId": "f1", "pinned": true } },
      "pinOrder": ["api/slides/pg_a1b2c3"]
    }
  }
  ```
- **`id = pg_a1b2c3`** (슬라이드 엔진의 인라인편집 오버레이): `{ "__count": 12, "s0": "...", "s1": "..." }`

> **핵심:** `index`의 `{id}`는 `index.html`만이 아니라 **임의 문자열**이다. 슬라이드 엔진이
> 자기 페이지 id로 `GET/PUT /api/index/{page_id}`를 호출해 인라인편집 상태를 저장한다.
> 그러니 `{id}`를 하드코딩·검증하지 말고 아무 문자열이나 받고, `payload` 내부 구조도 검증하지 마라.

---

## 1. 인증

### 1-1. `POST /api/auth/login`
- **역할**: owner 로그인. 성공 시 세션 쿠키 발급.
- **Path params**: 없음
- **Request body**: `{ "password": "..." }`
- **동작**: 비밀번호가 owner 비번(환경변수 `OWNER_PASSWORD` 권장)과 일치하면 세션 id를 만들어
  `db_sessions[session_id] = "owner"`에 저장하고 `Set-Cookie: session_id=...`(httpOnly) 내려줌.
- **Response**
  - `200` — 성공 (쿠키 세팅)
  - `401` — 비밀번호 불일치
- **프론트 사용처**: 로그인 모달(`submitLogin`) → 성공 시 역할 재조회.

### 1-2. `POST /api/auth/logout`
- **역할**: 로그아웃. 세션 무효화.
- **Path params / Request body**: 없음
- **동작**: 쿠키의 session_id를 `db_sessions`에서 제거하고 쿠키 삭제.
- **Response**: `200`
- **프론트 사용처**: 사이드바 "로그아웃" 버튼.

### 1-3. `GET /api/auth/me`
- **역할**: 현재 요청자가 owner인지 viewer인지 알려줌. 프론트가 owner 전용 UI를 켜고 끄는 기준.
- **Path params / Request body**: 없음
- **동작**: 쿠키의 session_id가 `db_sessions`에 있으면 `owner`, 없으면 `viewer` 반환.
  **로그인 안 해도 항상 200** (viewer도 정상 응답 — 401 내면 안 됨).
- **Response (200)**: `{ "role": "owner" }` 또는 `{ "role": "viewer" }`
- **프론트 사용처**: 페이지 로드 시 1회 + 로그인/로그아웃 후. owner 전용 버튼 노출 판단.
  (⚠️ 클라 role 숨김은 UX일 뿐, 실제 방어는 쓰기 API의 403.)

---

## 2. 문서 (index — 허브/오버레이 JSON)

### 2-1. `GET /api/index/{id}`
- **역할**: 문서(허브 상태 또는 슬라이드 오버레이) JSON을 읽어옴.
- **Path params**: `id` — 문서 id (예: `index.html`, `pg_a1b2c3`). **임의 문자열 허용.**
- **Request body**: 없음
- **동작**: 저장소에서 `index/{id}.json`을 읽어 반환. **없으면 404가 아니라 빈 문서를 만들어
  200으로 반환** (프론트가 첫 실행 때 이걸로 시작함).
- **Response**
  - `200` (존재): `{ "id", "kind", "rev", "payload", "updated_by" }`
  - `200` (없음 → 빈 문서): `{ "id": "...", "kind": "hub", "rev": 0, "payload": {}, "updated_by": null }`
- **프론트 사용처**: 최초 로드 `loadDoc('index.html')` → `payload.pages`/`payload.layout`이
  사이드바·핀그리드·폴더 렌더링의 원본 데이터가 됨.

### 2-2. `PUT /api/index/{id}`
- **역할**: 문서 JSON 저장 (owner 전용). 낙관적 락으로 동시수정 충돌 방지.
- **Path params**: `id`
- **Request body**: `{ "baseRev": 3, "payload": { ... } }`
- **동작**:
  1. viewer면 `403`.
  2. `payload`가 너무 크면(권장 8MB 초과) `413`.
  3. `baseRev`가 저장소의 현재 `rev`와 **다르면** `409`(그 사이 다른 곳에서 저장됨).
  4. 같으면 `rev += 1`, `payload`·`updated_by`·`updated_at` 갱신해서 저장.
- **Response**
  - `200`: `{ "id", "rev": 4 }` (새 rev)
  - `409`: `{ "conflict": true, "rev": 4, "payload": {서버 최신}, "updated_by": "owner" }`
  - `403` — viewer / `413` — payload 초과
- **프론트 사용처**: `saveDoc(payload)` ← 폴더/핀/카탈로그 편집이 전부 `persistHub()` → 이 PUT으로 수렴.

### 2-3. `GET /api/index/{id}/revisions`
- **역할**: 문서 변경 이력 조회. (향후 "변경 기록 보기" 기능용, **우선순위 낮음 — 나중에**)
- **Path params**: `id`
- **Request body**: 없음
- **동작**: 해당 문서의 리비전 목록 반환 (최소 구현은 빈 배열/현재 1개만 반환해도 됨).
- **Response (200)**: `[ { "rev", "author", "created_at" }, ... ]`
- **프론트 사용처**: 현재 없음 (계약만 정의).

---

## 3. 페이지 (slides — 슬라이드 원본 HTML)

### 3-1. `POST /api/slides`
- **역할**: 새 슬라이드 HTML을 등록. "+ 새 페이지"로 붙여넣은 HTML을 저장하고 접근용 href 반환.
- **Path params**: 없음
- **Request body**: `{ "html": "<!DOCTYPE html>...전체 슬라이드 HTML..." }`
- **동작**:
  1. viewer면 `403`.
  2. 새 id 생성 (예: `secrets.token_urlsafe(6)`, 필요하면 `pg_` 접두사).
  3. **`<base href="/">` 자동 주입** (§3 하단 규칙 참고) 후 `slides/{id}.html`로 저장.
  4. href = `api/slides/{id}` (앞에 `/` 없는 상대경로)로 반환.
- **Response (200)**: `{ "id": "pg_a1b2c3", "href": "api/slides/pg_a1b2c3" }` / `403` — viewer
- **프론트 사용처**: `createPage(html)` → 반환 href로 카탈로그에 항목 추가 후 `PUT /api/index/index.html`로 등록 완료.

### 3-2. `GET /api/slides/{id}`
- **역할**: 저장된 슬라이드 원본 HTML을 그대로 돌려줌. **iframe이 이걸 직접 로드해서 화면에 슬라이드를 렌더링**하고, 편집 모달은 fetch로 받아 textarea에 채움.
- **Path params**: `id` — 페이지 id
- **Request body**: 없음
- **동작**: `slides/{id}.html`을 읽어 **`Content-Type: text/html`** 로 원본 그대로 반환. 없으면 404.
  (완전한 `<!DOCTYPE html>`부터여야 iframe에 정상 렌더됨.)
- **Response**: `200` (text/html) / `404` — 없는 id
- **프론트 사용처**: 뷰어 `<iframe src="api/slides/{id}">`, 편집 모달 프리필 `loadPageHtml(id)`.

### 3-3. `PUT /api/slides/{id}`
- **역할**: 기존 슬라이드 원본 HTML을 통째로 교체 (owner 전용).
- **Path params**: `id`
- **Request body**: `{ "html": "<!DOCTYPE html>...수정된 전체 HTML..." }`
- **동작**: viewer면 403. **`<base href="/">` 주입** 후 `slides/{id}.html` 덮어쓰기. 없는 id면 404.
- **Response**: `200` `{ "id": "pg_a1b2c3" }` / `403` — viewer / `404` — 없는 id
- **프론트 사용처**: 편집 모달의 기존 페이지 저장 `savePageHtml(id, html)`. (title/desc 등 메타는 별도로 `PUT /api/index/index.html`에 저장 — HTML 본문과 메타는 항상 분리)

### 3-4. `DELETE /api/slides/{id}`
- **역할**: 슬라이드 삭제 (owner 전용).
- **Path params**: `id`
- **Request body**: 없음
- **동작**: viewer면 403. `slides/{id}.html` 실제 삭제. 없는 id면 404.
  (권장: 같은 id의 `index/{id}.json` 인라인편집 오버레이도 같이 삭제 — 안 지우면 죽은 데이터로 남음.)
- **Response**: `204` — 성공 / `403` — viewer / `404` — 없는 id
- **프론트 사용처**: 편집 모달 "삭제" 버튼 `deletePage(id)` → 이후 카탈로그/레이아웃에서 제거하고 `PUT /api/index/index.html`.

---

### ★ 필수 처리 — `<base href="/">` 자동 주입 (`POST`/`PUT /api/slides` 양쪽)
슬라이드는 `api/slides/{id}`라는 **중첩 경로**로 서빙되므로, HTML 안의 상대경로
(`href="slide-engine.css"`, `src="storage.js"`, `fetch('api/index/...')` 등)가 문서 URL 기준으로
잘못 풀린다(`/api/slides/storage.js`처럼 404). 저장 전에 `<head>` 바로 뒤에 `<base href="/">`가
없으면 삽입하면(있으면 중복 삽입 금지 — 멱등) 모든 상대경로가 사이트 루트 기준으로 정확히 풀린다.
```python
import re
def ensure_base_href(html: str) -> str:
    if re.search(r"<base\s+href=", html, re.IGNORECASE):
        return html
    return re.sub(r"(<head[^>]*>)", r'\1<base href="/">', html, count=1, flags=re.IGNORECASE)
```
짝을 맞추려면 `slide-engine.css`/`slide-engine.js`/`storage.js`가 static mount로 **사이트 루트**에서
서빙돼야 한다(§5).

---

## 4. 저장소 추상화 (구현 팁)

라우터는 아래 인터페이스만 알고 구현체(로컬파일/S3)를 몰라야, 저장소를 바꿔도 라우터를 안 건드린다.
```python
class StorageBackend(ABC):
    def get_doc(self, doc_id: str) -> dict | None: ...
    def put_doc(self, doc_id: str, kind: str, payload: dict, base_rev: int, author: str) -> dict: ...
    def get_page(self, page_id: str) -> str | None: ...
    def put_page(self, page_id: str, html: str) -> None: ...
    def delete_page(self, page_id: str) -> bool: ...

# 이 프로젝트는 S3Backend로 구현 (index/{id}.json, slides/{id}.html)
```

---

## 5. 정적 파일 서빙

`main.py`에서 `src/web/`을 `/`에 마운트. `<base href="/">` 덕에 슬라이드가 아래 파일들을
사이트 루트에서 찾는다.
```python
from pathlib import Path
from fastapi.staticfiles import StaticFiles
WEB_DIR = Path(__file__).parent / "web"
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")   # /api 라우터 등록 뒤에!
```
```
src/web/  ├── index.html  ├── storage.js  ├── slide-engine.js  └── slide-engine.css
```

---

## 6. 엔드포인트 요약표

| Method | Path | 인증 | 역할 |
|---|---|---|---|
| POST | `/api/auth/login` | - | 로그인 |
| POST | `/api/auth/logout` | - | 로그아웃 |
| GET | `/api/auth/me` | - | 현재 role 조회 |
| GET | `/api/index/{id}` | - | 문서(허브/오버레이) 조회 (없으면 빈문서 200) |
| PUT | `/api/index/{id}` | owner | 문서 저장 (rev 낙관적 락) |
| GET | `/api/index/{id}/revisions` | - | 변경 이력 (나중) |
| POST | `/api/slides` | owner | 새 슬라이드 등록 (+base href 주입) |
| GET | `/api/slides/{id}` | - | 슬라이드 원본 HTML 조회 (iframe 렌더용) |
| PUT | `/api/slides/{id}` | owner | 슬라이드 원본 수정 (+base href 주입) |
| DELETE | `/api/slides/{id}` | owner | 슬라이드 삭제 |
