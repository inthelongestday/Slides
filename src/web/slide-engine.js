/* ===== AX Slide Engine (shared) =====
   Lifted verbatim from ax-step1.html "AX Slide Viewer Engine" (전역 함수 구조 — IIFE 아님).
   3 deck 엔진 본체 byte-identical (DOC_TITLE + wheel 핸들러만 차이). wheel은 step1의 정교한
   버전(내부 pre 스크롤 보호) 채택 — step2/3 상위호환. DOC_TITLE은 window.AX_SLIDE_CONFIG.docTitle 외부화. */

/* ===== AX Slide Viewer Engine ===== */
const DOC_TITLE = (window.AX_SLIDE_CONFIG && window.AX_SLIDE_CONFIG.docTitle) || document.title;

const stage     = document.querySelector('.stage');
const slides    = Array.from(document.querySelectorAll('.stage > .slide'));
const bar       = document.getElementById('bar');
const prevBtn   = document.getElementById('prev');
const nextBtn   = document.getElementById('next');
const pageInput = document.getElementById('pageInput');
const pageTotal = document.getElementById('pageTotal');
const chapterBtn   = document.getElementById('chapterBtn');
const chapterLabel = document.getElementById('chapterLabel');
const chapterDrawer= document.getElementById('chapterDrawer');
const chapterList  = document.getElementById('chapterList');
const browseBtn    = document.getElementById('browseBtn');
const browseDrawer = document.getElementById('browseDrawer');
const browseStrip  = document.getElementById('browseStrip');

let idx = 0;
const total = slides.length;
const pad2 = (n) => String(n).padStart(2, '0');

/* ---- chapters from divider slides ---- */
const chapters = [];
slides.forEach((s, i) => {
  if (s.classList.contains('divider')) {
    const h = s.querySelector('h1, h2');
    const sub = s.querySelector('.subtitle');
    chapters.push({ index: i, num: chapters.length + 1, title: h ? h.textContent.trim() : ('챕터 ' + (chapters.length + 1)), sub: sub ? sub.textContent.trim() : '' });
  }
});
function chapterOf(i) {
  let c = null;
  for (const ch of chapters) { if (ch.index <= i) c = ch; else break; }
  return c;
}

/* ---- core navigation ---- */
function show(n) {
  idx = Math.max(0, Math.min(total - 1, n));
  slides.forEach((s, i) => s.classList.toggle('active', i === idx));
  bar.style.width = `${((idx + 1) / total) * 100}%`;
  prevBtn.disabled = idx === 0;
  nextBtn.disabled = idx === total - 1;
  if (document.activeElement !== pageInput) pageInput.value = idx + 1;
  const c = chapterOf(idx);
  chapterLabel.textContent = c ? `${DOC_TITLE} - ${pad2(c.num)} ${c.title}` : DOC_TITLE;
  updateChapterCurrent();
  if (browseDrawer.classList.contains('open')) markBrowseCurrent();
}
function next() { show(idx + 1); }
function prev() { show(idx - 1); }

prevBtn.addEventListener('click', prev);
nextBtn.addEventListener('click', next);

/* ---- page input jump ---- */
pageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const v = parseInt(pageInput.value, 10);
    if (!isNaN(v)) show(v - 1);
    pageInput.value = idx + 1;
    pageInput.blur();
  } else if (e.key === 'Escape') {
    pageInput.value = idx + 1; pageInput.blur();
  }
});
pageInput.addEventListener('focus', () => pageInput.select());
pageInput.addEventListener('blur', () => { pageInput.value = idx + 1; });

/* ---- keyboard nav ---- */
document.addEventListener('keydown', (e) => {
  if (document.activeElement === pageInput) return;
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'l') { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'h') { e.preventDefault(); prev(); }
  else if (e.key === 'Home') { e.preventDefault(); show(0); }
  else if (e.key === 'End') { e.preventDefault(); show(total - 1); }
  else if (e.key === 'Escape') { closeChapter(); closeBrowse(); }
});

/* ===== Chapter drawer ===== */
function buildChapterList() {
  chapterList.innerHTML = '';
  chapters.forEach((ch) => {
    const item = document.createElement('div');
    item.className = 'chapter-item';
    item.dataset.target = ch.index;
    item.innerHTML = `<span class="cnum">${pad2(ch.num)}</span><span class="ctitle">${ch.title}</span>${ch.sub ? `<span class="csub">${ch.sub}</span>` : ''}`;
    item.addEventListener('click', () => { show(ch.index); closeChapter(); });
    chapterList.appendChild(item);
  });
}
function updateChapterCurrent() {
  const c = chapterOf(idx);
  chapterList.querySelectorAll('.chapter-item').forEach((el) => {
    el.classList.toggle('current', c && Number(el.dataset.target) === c.index);
  });
}
function openChapter() {
  closeBrowse();
  chapterDrawer.classList.add('open');
  chapterBtn.classList.add('open');
  chapterDrawer.setAttribute('aria-hidden', 'false');
  updateChapterCurrent();
}
function closeChapter() {
  chapterDrawer.classList.remove('open');
  chapterBtn.classList.remove('open');
  chapterDrawer.setAttribute('aria-hidden', 'true');
}
chapterBtn.addEventListener('click', () => {
  chapterDrawer.classList.contains('open') ? closeChapter() : openChapter();
});

/* ===== Browse Pages drawer ===== */
const GAP = 16;
let thumbs = [];
let thumbStep = 0;     // thumb width + gap
let browseFocus = 0;
let thumbsBuilt = false;

function buildThumbs() {
  browseStrip.innerHTML = '';
  thumbs = [];
  const stageW = stage.clientWidth;
  const stageH = stage.clientHeight;
  const innerW = browseStrip.parentElement.clientWidth;
  // Target: show ~7 thumbs at once (current + 3 prev + 3 next), bounded by 20vh height.
  const VISIBLE = 7;
  let thumbW = (innerW - (VISIBLE - 1) * GAP) / VISIBLE;
  let scale = thumbW / stageW;
  let thumbH = stageH * scale;
  const maxH = browseDrawer.clientHeight - 24; // 20vh minus vertical padding
  if (thumbH > maxH) { scale = maxH / stageH; thumbW = stageW * scale; thumbH = maxH; }
  thumbW = Math.round(thumbW); thumbH = Math.round(thumbH);
  thumbStep = thumbW + GAP;

  slides.forEach((s, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.style.width = thumbW + 'px';
    thumb.style.height = thumbH + 'px';
    thumb.dataset.target = i;

    const clone = document.createElement('div');
    clone.className = 'thumb-clone';
    clone.style.width = stageW + 'px';
    clone.style.height = stageH + 'px';
    clone.style.transform = `scale(${scale})`;
    const sclone = s.cloneNode(true);
    sclone.classList.add('active');
    sclone.style.position = 'absolute';
    clone.appendChild(sclone);

    const numTag = document.createElement('div');
    numTag.className = 'thumb-num';
    numTag.textContent = i + 1;

    thumb.appendChild(clone);
    thumb.appendChild(numTag);
    thumb.addEventListener('click', () => { show(i); setFocus(i); });
    browseStrip.appendChild(thumb);
    thumbs.push(thumb);
  });
  thumbsBuilt = true;
}
function centerOnFocus() {
  const innerW = browseStrip.parentElement.clientWidth;
  const thumbW = thumbStep - GAP;
  const focusCenter = browseFocus * thumbStep + thumbW / 2;
  const tx = innerW / 2 - focusCenter;
  browseStrip.style.transform = `translateX(${tx}px)`;
  thumbs.forEach((t, i) => t.classList.toggle('focused', i === browseFocus));
}
function setFocus(i) {
  browseFocus = Math.max(0, Math.min(total - 1, i));
  centerOnFocus();
}
function markBrowseCurrent() {
  thumbs.forEach((t, i) => t.classList.toggle('current', i === idx));
}
function openBrowse() {
  closeChapter();
  browseDrawer.classList.add('open');
  browseBtn.classList.add('open');
  browseDrawer.setAttribute('aria-hidden', 'false');
  // build after drawer has height
  requestAnimationFrame(() => {
    if (!thumbsBuilt) buildThumbs();
    markBrowseCurrent();
    setFocus(idx);
  });
}
function closeBrowse() {
  browseDrawer.classList.remove('open');
  browseBtn.classList.remove('open');
  browseDrawer.setAttribute('aria-hidden', 'true');
}
browseBtn.addEventListener('click', () => {
  browseDrawer.classList.contains('open') ? closeBrowse() : openBrowse();
});
// wheel: up -> previous (strip moves left->right), down -> next
browseDrawer.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY < 0) setFocus(browseFocus - 1);
  else if (e.deltaY > 0) setFocus(browseFocus + 1);
}, { passive: false });

/* ===== Wheel navigation over the slide area (up=prev, down=next) =====
   The browse/chapter drawers live OUTSIDE .stage and handle their own wheel,
   so a wheel here is genuinely over the slide. If the active slide has its own
   overflow (compact/long), let it scroll internally first and only flip pages
   once it hits the top/bottom edge. */
let wheelLock = false;
stage.addEventListener('wheel', (e) => {
  // 휠이 일어난 지점에서 가장 가까운 '스크롤 가능한' 요소(내부 pre 등 → 슬라이드 순)를 찾아
  // 그 영역에 아직 스크롤 여지가 있으면 페이지를 넘기지 않고 내부 스크롤에 맡긴다.
  let sc = e.target;
  while (sc && sc !== stage && sc.nodeType === 1) {
    if (sc.scrollHeight > sc.clientHeight + 1) {
      const oy = getComputedStyle(sc).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        if (!sc.classList.contains('slide')) return; // 내부 텍스트 박스(pre 등): 끝에 닿아도 페이지를 넘기지 않음 (영역 밖에서만 전환)
        const atTop = sc.scrollTop <= 0;
        const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
        if (e.deltaY > 0 && !atBottom) return; // 아래로 더 스크롤 가능
        if (e.deltaY < 0 && !atTop) return;    // 위로 더 스크롤 가능
        break; // 슬라이드 자체 스크롤의 끝 → 페이지 전환 진행
      }
    }
    sc = sc.parentElement;
  }
  e.preventDefault();
  if (wheelLock || Math.abs(e.deltaY) < 4) return;
  wheelLock = true;
  setTimeout(() => { wheelLock = false; }, 450);
  if (e.deltaY > 0) next();
  else if (e.deltaY < 0) prev();
}, { passive: false });

// rebuild thumbs on resize (dimensions change)
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    thumbsBuilt = false;
    if (browseDrawer.classList.contains('open')) { buildThumbs(); markBrowseCurrent(); setFocus(idx); }
  }, 200);
});

/* ============================================================
   ===== EDIT MODULE (new — NOT part of the lifted engine) =====
   제한적 edit: 콘텐츠 텍스트 contentEditable + 슬라이드 직계 컴포넌트 reorder
   + pathname-keyed localStorage 영속 + 네비 키/wheel 가드.
   엔진 본체는 건드리지 않고 capture-phase 가드 + IIFE 캡슐화로 통합한다.
   ============================================================ */
(function axEditModule(){
  var editMode = false;
  var dragged = null;

  // 슬라이드별 안정 식별자(인덱스 기반) — 저장/복원 정합용
  slides.forEach(function(s, i){ if (!s.dataset.sid) s.dataset.sid = 's' + i; });

  // 편집 대상 = 슬라이드 내 "텍스트를 직접 담은 블록 리프" 전체.
  // 제목(h1~h3)·라벨(.label/.part-num)·부제(.subtitle)·캡션(.caption/.meta)·표 셀(th/td)·
  // 코드블록(pre)·파일별 컴포넌트(cot/linemap/tree/precedence/corr/example/data-table 텍스트) 모두 포함.
  // 인라인 서식(strong/em/a/code 등)은 부모 텍스트의 일부로 함께 편집되고, 엔진 UI(드래그 핸)·미디어·폼은 제외.
  var INLINE_TAGS = {STRONG:1,EM:1,B:1,I:1,U:1,S:1,A:1,SPAN:1,CODE:1,SUP:1,SUB:1,SMALL:1,MARK:1,BR:1,ABBR:1,TIME:1,KBD:1,DEL:1,INS:1,WBR:1,Q:1,CITE:1};
  var SKIP_TAGS = {SCRIPT:1,STYLE:1,IMG:1,SVG:1,VIDEO:1,IFRAME:1,INPUT:1,BUTTON:1,SELECT:1,TEXTAREA:1,HR:1,CANVAS:1};
  var REORDER_CLASSES = ['two-col','three-grid','four-grid','block','highlight','numbered','quote','mapping'];
  function isReorderable(el){
    return REORDER_CLASSES.some(function(c){ return el.classList.contains(c); });
  }
  function isHandle(el){ return el.classList && el.classList.contains('ax-drag-handle'); }
  // el이 "텍스트를 가진 블록 자식"을 보유하면, 그 자식이 편집 대상이므로 el 자신은 건너뛴다 (중첩 contentEditable 방지)
  function hasBlockTextChild(el){
    return Array.prototype.some.call(el.children, function(c){
      if (isHandle(c) || INLINE_TAGS[c.tagName] || SKIP_TAGS[c.tagName]) return false;
      return (c.textContent || '').trim().length > 0;
    });
  }

  // ---- edit 전용 스타일 (모듈 자체 주입 — engine.css는 lifted CSS만) ----
  function injectStyle(){
    if (document.getElementById('axEditStyle')) return;
    var st = document.createElement('style');
    st.id = 'axEditStyle';
    st.textContent =
      'body.ax-editing [contenteditable="true"]{ border-radius:4px; transition:outline .1s,background .1s; }' +
      'body.ax-editing [contenteditable="true"]:hover{ outline:1px dashed var(--accent); }' +
      'body.ax-editing [contenteditable="true"]:focus{ outline:2px solid var(--accent); background:rgba(44,94,79,0.06); }' +
      '.ax-reorderable{ position:relative; }' +
      'body.ax-editing .ax-reorderable{ outline:1px dotted var(--rule); }' +
      '.ax-drag-handle{ position:absolute; top:2px; right:2px; z-index:6; cursor:grab; user-select:none;' +
        ' color:var(--accent); background:var(--accent-soft); border-radius:5px; padding:0 7px; font-size:14px; line-height:1.4; opacity:.85; }' +
      '.ax-drag-handle:active{ cursor:grabbing; }' +
      '.ax-dragging{ opacity:.4; }' +
      '#axEditToggle.open{ background:var(--accent); color:#fff; border-color:var(--accent); }';
    document.head.appendChild(st);
  }

  // ---- footer "편집" 토글 주입 (멱등) ----
  function injectToggle(){
    if (document.getElementById('axEditToggle')) return;
    var footer = document.querySelector('.footer');
    if (!footer) return;
    var btn = document.createElement('button');
    btn.id = 'axEditToggle';
    btn.type = 'button';
    btn.className = 'bar-btn';
    btn.textContent = '편집';
    btn.title = '편집 모드 — 텍스트 수정 · 컴포넌트 순서 변경 (이 브라우저에만 저장)';
    btn.style.flex = '0 0 auto';
    btn.addEventListener('click', toggleEdit);
    footer.insertBefore(btn, footer.firstChild);
  }

  function toggleEdit(){ editMode ? exitEdit() : enterEdit(); }

  function eachEditable(fn){
    slides.forEach(function(slide){
      slide.querySelectorAll('*').forEach(function(el){
        if (SKIP_TAGS[el.tagName] || INLINE_TAGS[el.tagName] || isHandle(el)) return;
        if (!(el.textContent || '').trim()) return;   // 텍스트 없음 → 컨테이너/장식, 건너뜀
        if (hasBlockTextChild(el)) return;             // 텍스트 가진 블록 자식 보유 → 리프 자식이 대상
        fn(el);
      });
    });
  }

  function enterEdit(){
    editMode = true;
    document.body.classList.add('ax-editing');
    var t = document.getElementById('axEditToggle');
    if (t){ t.classList.add('open'); t.textContent = '완료'; }
    eachEditable(function(el){ el.contentEditable = 'true'; });
    slides.forEach(function(slide){
      Array.prototype.forEach.call(slide.children, function(child){
        if (!isReorderable(child)) return;
        addReorderHandle(child);
      });
    });
  }

  function exitEdit(){
    editMode = false;
    document.body.classList.remove('ax-editing');
    var t = document.getElementById('axEditToggle');
    if (t){ t.classList.remove('open'); t.textContent = '편집'; }
    eachEditable(function(el){ el.removeAttribute('contenteditable'); });
    removeReorderHandles();
    saveEdits();
  }

  // ---- reorder (drag handle만 draggable → 부모 블록 이동) ----
  function addReorderHandle(child){
    if (child.querySelector(':scope > .ax-drag-handle')) return;
    child.classList.add('ax-reorderable');
    var h = document.createElement('span');
    h.className = 'ax-drag-handle';
    h.textContent = '⠇'; // ⠇ grip
    h.setAttribute('contenteditable', 'false');
    h.draggable = true;
    h.addEventListener('dragstart', function(e){
      dragged = child;
      child.classList.add('ax-dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', child.dataset.sid || ''); } catch(_){}
    });
    h.addEventListener('dragend', function(){
      if (dragged) dragged.classList.remove('ax-dragging');
      dragged = null;
    });
    child.addEventListener('dragover', onDragOver);
    child.addEventListener('drop', onDrop);
    child.appendChild(h);
  }
  function onDragOver(e){
    if (!dragged || dragged === this) return;
    if (this.parentElement !== dragged.parentElement) return; // 같은 슬라이드 내에서만
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch(_){}
  }
  function onDrop(e){
    if (!dragged || dragged === this) return;
    if (this.parentElement !== dragged.parentElement) return;
    e.preventDefault();
    var r = this.getBoundingClientRect();
    if (e.clientY > r.top + r.height / 2) this.after(dragged);
    else this.before(dragged);
    saveEdits();
  }
  function removeReorderHandles(){
    slides.forEach(function(slide){
      slide.querySelectorAll('.ax-drag-handle').forEach(function(h){ h.remove(); });
      slide.querySelectorAll('.ax-reorderable').forEach(function(el){
        el.classList.remove('ax-reorderable');
        el.removeEventListener('dragover', onDragOver);
        el.removeEventListener('drop', onDrop);
      });
    });
  }

  // ---- 영속 (슬라이드별 sanitized innerHTML) ----
  function sanitizedInner(slide){
    var clone = slide.cloneNode(true);
    clone.querySelectorAll('.ax-drag-handle').forEach(function(h){ h.remove(); });
    clone.querySelectorAll('[contenteditable]').forEach(function(el){ el.removeAttribute('contenteditable'); });
    clone.querySelectorAll('[draggable]').forEach(function(el){ el.removeAttribute('draggable'); });
    clone.querySelectorAll('.ax-reorderable').forEach(function(el){ el.classList.remove('ax-reorderable'); });
    clone.querySelectorAll('.ax-dragging').forEach(function(el){ el.classList.remove('ax-dragging'); });
    return clone.innerHTML;
  }
  function saveEdits(){
    var data = { __count: slides.length };
    slides.forEach(function(slide){ data[slide.dataset.sid] = sanitizedInner(slide); });
    WikiStorage.saveDoc(data);   // 서버 영속(낙관적 락). 실패는 storage.js가 fail-loud 처리
  }
  async function loadEdits(){
    var data;
    try { data = await WikiStorage.loadDoc(); }
    catch(e){ console.error('[ax-edit] 문서 로드 실패:', e); return; }
    if (!data || Object.keys(data).length === 0) return;
    // staleness 가드: 소스 슬라이드 수가 바뀌면(내용 추가) 저장본 무시 (오버레이가 신규 콘텐츠를 가리지 않게)
    if (data.__count != null && data.__count !== slides.length) {
      // silent 금지: 슬라이드 수 변경으로 복원을 건너뜀을 콘솔에 가시화 (소스 변경 후 흔히 발생)
      console.warn('[ax-edit] 저장 슬라이드 수(' + data.__count + ') != 현재(' + slides.length + ') — 소스 변경 감지, 복원 건너뜀');
      return;
    }
    slides.forEach(function(slide){
      var html = data[slide.dataset.sid];
      if (html != null) slide.innerHTML = html;
    });
  }

  // ---- 네비 키 가드 (capture-phase: 엔진 bubble 리스너보다 먼저) ----
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){
      if (!editMode) return; // 엔진이 drawer 닫기 처리
      var drawerOpen = chapterDrawer.classList.contains('open') || browseDrawer.classList.contains('open');
      if (drawerOpen) return; // drawer 우선 닫기 (editMode 유지) — 엔진 Escape에 위임
      exitEdit();             // drawer 없으면 edit 종료
      e.stopImmediatePropagation();
      return;
    }
    if (!editMode) return;
    var navKeys = ['ArrowRight','ArrowLeft','PageUp','PageDown','Home','End',' ','l','h'];
    if (navKeys.indexOf(e.key) !== -1) {
      // 엔진의 슬라이드 전환만 차단 (preventDefault 안 함 → contentEditable 커서/입력 보존)
      e.stopImmediatePropagation();
    }
  }, true);

  // ---- wheel 가드 (edit 중 휠은 콘텐츠 스크롤만, 슬라이드 전환 차단) ----
  stage.addEventListener('wheel', function(e){
    if (editMode) e.stopImmediatePropagation();
  }, true);

  injectStyle();
  injectToggle();
  window.__axLoadEdits = loadEdits;   // 엔진 init이 서버 로드 완료 후 챕터/슬라이드를 빌드하도록 노출
})();

/* ---- init ---- (편집 오버레이를 서버에서 로드한 뒤 챕터/슬라이드 빌드 — 복원 전 빌드 방지) */
window.__axLoadEdits().then(function(){
  pageTotal.textContent = total;
  buildChapterList();
  show(0);
});
// 역할 게이트(P4-T1): viewer는 슬라이드 편집 토글 숨김. editor 이상만 노출(서버 PUT 403가 실제 방어).
window.WikiStorage.getRole().then(function(role){
  if (role === 'viewer') {
    var t = document.getElementById('axEditToggle');
    if (t) t.style.display = 'none';
  }
}).catch(function(e){ console.warn('[ax-edit] 역할 조회 실패 — 편집 토글 유지(서버가 403로 방어):', e); });
