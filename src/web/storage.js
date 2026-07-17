/* ============================================================
   storage.js — 서버 영속 저장 레이어 (Slides 프로젝트)

   FastAPI 백엔드와 통신하는 유일한 창구. index.html은 이 파일의
   함수만 호출하고, fetch를 직접 쓰지 않는다.

   계약 (백엔드가 구현해야 하는 것 — 자세한 스펙은 API_SPEC.md 참고):

     [문서 — 허브의 구조화된 상태(JSON)]
     GET  api/auth/me                    → {role: "owner" | "viewer"}
     GET  api/index/{id}             → {id, kind, rev, payload, updated_by}
     PUT  api/index/{id}  body {baseRev, payload}
                                     → 200 {id, rev}
                                     | 409 {conflict, rev, payload, updated_by}
                                     | 413 (payload too large) | 403 (viewer)
     GET  api/index/{id}/revisions   → [{rev, author, created_at}]

     [페이지 — 슬라이드 원본 HTML 그 자체]
     POST   api/slides          body {html}         → {id, href}
     GET    api/slides/{id}                          → text/html (원본 그대로)
     PUT    api/slides/{id}     body {html}          → {id}
     DELETE api/slides/{id}                          → 204

     [인증]
     POST api/auth/login   body {password} → 200 | 401
     POST api/auth/logout                  → 200

   설계 불변식:
   - fetch URL은 **상대경로(api/...)만** 쓴다. 절대경로('/api/...') 금지.
   - baseRev는 문서별로 추적한다. saveDoc 성공 시 서버가 준 새 rev로 갱신.
   - 저장 충돌(409)은 onConflict 콜백으로 위임(없으면 2지선다 기본 UX).
   - 자동저장 coalescing: 같은 문서에 저장이 진행 중이면 최신 payload만
     예약 후 1회 재전송.
   - fail-loud: 네트워크/HTTP 오류는 삼키지 않고 콘솔 에러 + 사용자 알림.
   ============================================================ */
(function () {
  'use strict';

  function resolveDocId() {
    var p = location.pathname.replace(/\/+$/, '');
    var last = p.substring(p.lastIndexOf('/') + 1);
    return last || 'index.html';
  }

  var DOC_ID = resolveDocId();
  var _revs = {};
  var _saving = {};
  var _pending = {};
  var _me = null;

  function _url(path) {
    if (path.charAt(0) === '/') {
      throw new Error('[ERROR] storage: 절대경로 fetch 금지 (path: ' + path + ')');
    }
    return path;
  }

  async function _getJSON(path) {
    var res = await fetch(_url(path), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      var detail = await res.text().catch(function () { return ''; });
      throw new Error('[ERROR] storage: GET ' + path + ' 실패 — HTTP ' + res.status + ' (' + detail + ')');
    }
    return res.json();
  }

  // ---- 역할/사용자 ----
  async function getMe() {
    if (_me) return _me;
    _me = await _getJSON('api/auth/me');
    return _me;
  }
  async function getRole() {
    return (await getMe()).role;
  }
  function invalidateMe() { _me = null; }

  // ---- 인증 ----
  async function login(password) {
    var res = await fetch(_url('api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    });
    invalidateMe();
    if (res.status === 200) return true;
    if (res.status === 401) return false;
    throw new Error('[ERROR] storage: 로그인 실패 — HTTP ' + res.status);
  }
  async function logout() {
    await fetch(_url('api/auth/logout'), { method: 'POST' });
    invalidateMe();
  }

  // ---- 문서(JSON 상태) 로드 ----
  async function loadDoc(id) {
    id = id || DOC_ID;
    var data = await _getJSON('api/index/' + encodeURIComponent(id));
    _revs[id] = data.rev;
    return data.payload || {};
  }

  // ---- 문서 저장 (낙관적 락 + coalescing) ----
  async function saveDoc(payload, id) {
    id = id || DOC_ID;
    if (_saving[id]) {
      _pending[id] = payload;
      return;
    }
    _saving[id] = true;
    try {
      await _put(id, payload);
    } finally {
      _saving[id] = false;
      if (Object.prototype.hasOwnProperty.call(_pending, id)) {
        var next = _pending[id];
        delete _pending[id];
        saveDoc(next, id);
      }
    }
  }

  async function _put(id, payload) {
    var baseRev = _revs[id];
    var res = await fetch(_url('api/index/' + encodeURIComponent(id)), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRev: baseRev, payload: payload })
    });

    if (res.status === 200) {
      var ok = await res.json();
      _revs[id] = ok.rev;
      return ok;
    }
    if (res.status === 409) {
      var conflict = await res.json();
      return _handleConflict(id, payload, conflict);
    }

    var detail = await res.text().catch(function () { return ''; });
    var msg = '[ERROR] storage: 저장 실패 — HTTP ' + res.status + ' (doc: ' + id + ', ' + detail + ')';
    console.error(msg);
    if (res.status === 403) _notify('권한이 없어 저장하지 못했습니다. (로그인이 필요합니다)');
    else if (res.status === 413) _notify('내용이 너무 큽니다. 용량을 줄여주세요.');
    else _notify('저장에 실패했습니다. (HTTP ' + res.status + ')');
    throw new Error(msg);
  }

  function _handleConflict(id, myPayload, conflict) {
    if (typeof Storage.onConflict === 'function') {
      return Storage.onConflict(id, myPayload, conflict);
    }
    var overwrite = confirm(
      '다른 곳에서 먼저 저장했습니다 (서버 rev ' + conflict.rev + ').\n\n' +
      '[확인] 내 편집으로 덮어쓰기 / [취소] 저장 포기(새로고침해 최신본 확인)'
    );
    if (overwrite) {
      _revs[id] = conflict.rev;
      return _put(id, myPayload);
    }
    _notify('저장을 취소했습니다. 새로고침하면 최신본을 볼 수 있습니다.');
    return null;
  }

  async function listRevisions(id) {
    id = id || DOC_ID;
    return _getJSON('api/index/' + encodeURIComponent(id) + '/revisions');
  }

  // ---- 페이지(슬라이드 원본 HTML) ----
  async function createPage(html) {
    var res = await fetch(_url('api/slides'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: html })
    });
    if (!res.ok) {
      var detail = await res.text().catch(function () { return ''; });
      throw new Error('[ERROR] storage: 페이지 생성 실패 — HTTP ' + res.status + ' (' + detail + ')');
    }
    return res.json(); // {id, href}
  }
  async function loadPageHtml(id) {
    var res = await fetch(_url('api/slides/' + encodeURIComponent(id)));
    if (!res.ok) throw new Error('[ERROR] storage: 페이지 로드 실패 — HTTP ' + res.status);
    return res.text();
  }
  async function savePageHtml(id, html) {
    var res = await fetch(_url('api/slides/' + encodeURIComponent(id)), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: html })
    });
    if (!res.ok) {
      var detail = await res.text().catch(function () { return ''; });
      throw new Error('[ERROR] storage: 페이지 저장 실패 — HTTP ' + res.status + ' (' + detail + ')');
    }
    return res.json(); // {id}
  }
  async function deletePage(id) {
    var res = await fetch(_url('api/slides/' + encodeURIComponent(id)), { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      throw new Error('[ERROR] storage: 페이지 삭제 실패 — HTTP ' + res.status);
    }
    return true;
  }

  function _notify(text) {
    try { alert(text); } catch (e) { /* headless */ }
  }

  var Storage = {
    docId: function () { return DOC_ID; },
    currentRev: function (id) { return _revs[id || DOC_ID]; },
    getMe: getMe,
    getRole: getRole,
    login: login,
    logout: logout,
    loadDoc: loadDoc,
    saveDoc: saveDoc,
    listRevisions: listRevisions,
    createPage: createPage,
    loadPageHtml: loadPageHtml,
    savePageHtml: savePageHtml,
    deletePage: deletePage,
    onConflict: null
  };

  window.WikiStorage = Storage;
})();
