import {memoConfig} from './config.js';
import {createMemoStore} from './memo-store.js';
import {sceneMemoKey} from './scene-context.js';

const $ = id => document.getElementById(id);
const store = createMemoStore(memoConfig);
const NAME_KEY = 'kumon-review-name-v1';
let pages = [], pageId = 'hub', loadVersion = 0, limit = 50, sending = false, started = false;
let name = '', pendingId = null, pendingBody = '', fetching = false, routeReady = false;
let activePage = null, sceneContext = null, contextReady = false, viewingLegacy = false, routeVersion = 0;
const drafts = new Map();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('kumon-review-updates-v1') : null;

function status(text, error = false) { $('memoStatus').textContent = text; $('memoStatus').hidden = !text; $('memoStatus').classList.toggle('error', error); }
function nameGate(changing = false) {
  $('nameInput').value = name;
  $('cancelName').hidden = !changing;
  $('nameError').textContent = '';
  $('nameDialog').showModal();
  $('nameInput').focus();
}
$('nameDialog').addEventListener('cancel', e => { if (!started) e.preventDefault(); });
$('cancelName').addEventListener('click', () => $('nameDialog').close());
$('changeName').addEventListener('click', () => nameGate(true));
$('nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const value = $('nameInput').value.trim();
  if (!value || value.length > 40) { $('nameError').textContent = '이름을 1~40자로 입력해 주세요.'; return; }
  try { localStorage.setItem(NAME_KEY, value); }
  catch { $('nameError').textContent = '작성자를 기억하려면 브라우저 저장을 허용해 주세요.'; return; }
  name = value; $('authorLabel').textContent = name;
  $('nameDialog').close();
  if (!started) start();
});
function pageHref(id) { const url = new URL('index.html', location.href); url.searchParams.set('page', id); return url.pathname + url.search; }
function tables() {
  const groups = [['guide', '안내 페이지'], ['tutorial', '튜토리얼 페이지'], ['prep', '설치 및 로그인 안내']];
  for (const [key, title] of groups) {
    const section = document.createElement('section'); section.className = 'page-group';
    const heading = document.createElement('h3'); heading.textContent = title;
    if (key === 'prep') {
      const note = document.createElement('span');
      note.className = 'group-note';
      note.textContent = '(안내 페이지 안에 들어가는 부가 페이지입니다.)';
      heading.append(note);
    }
    const box = document.createElement('div'); box.className = 'table-scroll';
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th scope="col">순서</th><th scope="col">페이지</th><th scope="col" aria-label="페이지 열기"></th></tr></thead>';
    const body = document.createElement('tbody');
    pages.filter(p => p.active && p.group === key).forEach((p, i) => {
      const row = document.createElement('tr');
      const number = document.createElement('td'); number.className = 'number'; number.textContent = i + 1;
      const label = document.createElement('td'); label.className = 'page-name';
      label.textContent = p.label;
      if (p.note) { const note = document.createElement('span'); note.className = 'page-note'; note.textContent = p.note; label.append(note); }
      const action = document.createElement('td');
      const link = document.createElement('a'); link.className = 'page-link'; link.href = pageHref(p.id); link.textContent = '열기 →'; link.setAttribute('aria-label', p.label + ' 열기');
      action.append(link); row.append(number, label, action); body.append(row);
    });
    table.append(body); box.append(table); section.append(heading, box); $('pageTables').append(section);
  }
}
function saveDraft() {
  const draft = {body: $('memoText').value, id: pendingId, pendingBody};
  drafts.set(pageId, draft);
  try { localStorage.setItem('kumon-review-draft-v1:' + pageId, JSON.stringify(draft)); }
  catch { status('작성 내용을 임시 보관하지 못했습니다. 창을 닫기 전에 복사해 주세요.', true); }
}
function loadDraft() {
  let draft = drafts.get(pageId);
  if (!draft) { try { draft = JSON.parse(localStorage.getItem('kumon-review-draft-v1:' + pageId) || 'null'); } catch {} }
  $('memoText').value = draft?.body || '';
  pendingId = draft?.id || null; pendingBody = draft?.pendingBody || '';
}
$('memoText').addEventListener('input', () => { pendingId = null; pendingBody = ''; saveDraft(); });
function setView(mode, remember = true) {
  mode = activePage && mode === 'mobile' ? 'mobile' : 'desktop';
  document.querySelector('.preview').classList.toggle('mobile-view', mode === 'mobile');
  $('desktop').setAttribute('aria-pressed', String(mode === 'desktop'));
  $('mobile').setAttribute('aria-pressed', String(mode === 'mobile'));
  if (remember && activePage) { try { localStorage.setItem('kumon-review-view-v1', mode); } catch {} }
}
$('desktop').addEventListener('click', () => setView('desktop'));
$('mobile').addEventListener('click', () => setView('mobile'));
function toggleMemo(open) {
  $('memoPane').classList.toggle('open', open);
  $('memoToggle').setAttribute('aria-expanded', String(open));
  document.querySelector('.preview').inert = open && matchMedia('(max-width:760px)').matches;
  if (open) $('closeMemo').focus(); else $('memoToggle').focus();
}
window.addEventListener('resize', () => { document.querySelector('.preview').inert = $('memoPane').classList.contains('open') && matchMedia('(max-width:760px)').matches; });
$('memoToggle').addEventListener('click', () => toggleMemo(!$('memoPane').classList.contains('open')));
$('closeMemo').addEventListener('click', () => toggleMemo(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('memoPane').classList.contains('open')) toggleMemo(false); });
function route() {
  if (!started) return;
  if (routeReady && contextReady) saveDraft();
  let requested = new URLSearchParams(location.search).get('page');
  const alias = pages.find(p => p.id === requested)?.aliasOf;
  if (alias) { requested = alias; history.replaceState(null, '', pageHref(alias)); }
  const page = pages.find(p => p.id === requested && p.active);
  const token = ++routeVersion;
  activePage = page || null; sceneContext = null; contextReady = false; viewingLegacy = false;
  document.querySelector('.view-toggle').hidden = !page;
  let mode = 'desktop'; try { mode = localStorage.getItem('kumon-review-view-v1') || 'desktop'; } catch {}
  setView(mode, false);
  pageId = requested || 'hub';
  limit = 50; loadVersion++; fetching = false;
  $('hub').hidden = !!requested;
  $('frameWrap').hidden = !page;
  $('missing').hidden = !requested || !!page;
  $('pageTitle').textContent = page?.label || (requested ? '페이지를 찾을 수 없습니다.' : '구몬 안내·튜토리얼 검토');
  document.title = $('pageTitle').textContent;
  $('memoHeading').title = page?.label || '전체 구성에 대한 의견';
  $('legacyMemos').hidden = true; $('currentMemos').hidden = true;
  $('previewFrame').src = page ? page.path + '?review=2&revision=20261015-v9-final' : 'about:blank';
  $('previewFrame').title = page?.label || '선택한 페이지';
  $('memoList').replaceChildren(); $('memoCount').textContent = ''; $('older').hidden = true;
  $('memoText').value = ''; $('send').disabled = true; $('memoText').disabled = true; status('');
  if (requested && !page) { status('목차에서 제외된 페이지입니다. 메모 데이터는 다른 페이지로 이동하지 않습니다.'); return; }
  const legacy = page?.group === 'tutorial' ? [page.id] : page?.legacyMemoPages || [];
  if (store.configured && legacy.length) Promise.all(legacy.map(id => store.list(id, 1))).then(groups => {
    if (token === routeVersion) $('legacyMemos').hidden = !groups.some(rows => rows.length);
  }).catch(() => {});
  if (page?.group !== 'tutorial') setContext(pageId, page?.label || '전체 구성에 대한 의견');
}
function setContext(id, label) {
  if (contextReady && id === pageId) return;
  if (routeReady && contextReady) saveDraft();
  pageId = id; contextReady = true; routeReady = true;
  limit = 50; loadVersion++; fetching = false;
  $('memoHeading').title = label;
  $('memoHeading').dataset.pageId = id;
  $('memoList').replaceChildren(); $('memoCount').textContent = ''; $('older').hidden = true;
  loadDraft(); $('memoText').disabled = false;
  $('send').disabled = !store.configured || sending;
  status(store.configured ? '' : '메모 저장소를 연결해 주세요.', !store.configured);
  refresh();
}
function showCurrentScene() {
  if (!activePage) return;
  viewingLegacy = false; $('currentMemos').hidden = true;
  $('pageTitle').textContent = activePage.label + (sceneContext ? ' · ' + sceneContext.label : '');
  setContext(sceneContext?.key || activePage.id, sceneContext?.label || activePage.label);
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== $('previewFrame').contentWindow || activePage?.group !== 'tutorial') return;
  const data = event.data;
  if (data?.type !== 'kumon-review-scene' || typeof data.id !== 'string' || typeof data.label !== 'string') return;
  let key; try { key = sceneMemoKey(activePage.id, data.id); } catch { return; }
  if (sceneContext?.key === key) return;
  sceneContext = {key, label: data.label}; showCurrentScene();
});
$('legacyMemos').addEventListener('click', () => {
  if (!activePage) return;
  viewingLegacy = true; $('currentMemos').hidden = false;
  $('pageTitle').textContent = activePage.label + ' · 기존 메모';
  setContext(activePage.id + '--legacy', '기존 공통 메모');
  $('send').disabled = true; $('memoText').disabled = true;
});
$('currentMemos').addEventListener('click', showCurrentScene);
document.addEventListener('click', e => {
  const link = e.target.closest('a');
  if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname) return;
  e.preventDefault(); history.pushState(null, '', url.pathname + url.search); route();
});
window.addEventListener('popstate', route);
function render(rows) {
  const list = $('memoList');
  const scroll = list.scrollTop;
  list.replaceChildren();
  const ownId = store.ownId();
  for (const row of rows) {
    const card = document.createElement('article'); card.className = 'memo-card'; card.dataset.memoId = row.id;
    const meta = document.createElement('div'); meta.className = 'memo-meta';
    const author = document.createElement('h3'); author.textContent = row.author_name;
    const time = document.createElement('time'); time.dateTime = row.created_at;
    time.textContent = new Date(row.created_at).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
    meta.append(author, time);
    if (ownId && row.author_id === ownId) {
      const button = document.createElement('button'); button.className = 'memo-delete'; button.type = 'button'; button.textContent = '삭제'; button.setAttribute('aria-label', row.author_name + '의 메모 삭제');
      button.addEventListener('click', async () => {
        if (!confirm('이 메모를 삭제할까요?')) return;
        button.disabled = true;
        try { await store.remove(row.id); channel?.postMessage({page: row.page_id}); if (pageId === row.page_id || viewingLegacy) { fetching = false; await refresh(); } }
        catch (e) { status(e.message, true); button.disabled = false; }
      });
      meta.append(button);
    }
    const body = document.createElement('p'); body.className = 'memo-body'; body.textContent = row.body;
    card.append(meta, body); list.append(card);
  }
  list.scrollTop = scroll;
  $('memoCount').textContent = rows.length ? '(' + rows.length + (rows.length === limit ? '+' : '') + ')' : '';
  $('older').hidden = rows.length < limit;
}
async function refresh() {
  if (!store.configured || !contextReady || fetching || $('missing').hidden === false) return;
  fetching = true;
  const page = pageId, version = ++loadVersion;
  try {
    const legacy = activePage?.group === 'tutorial' ? [activePage.id] : activePage?.legacyMemoPages || [];
    const rows = viewingLegacy
      ? (await Promise.all(legacy.map(id => store.list(id, limit)))).flat().sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, limit)
      : await store.list(page, limit);
    if (version !== loadVersion || page !== pageId) return;
    render(rows); status('');
  } catch (e) { if (version === loadVersion && page === pageId) status(e.message, true); }
  finally { if (version === loadVersion) fetching = false; }
}
$('older').addEventListener('click', () => { limit += 50; refresh(); });
$('memoForm').addEventListener('submit', async e => {
  e.preventDefault(); if (sending || !store.configured || !contextReady || viewingLegacy) return;
  const body = $('memoText').value.trim(), kind = '전달사항', page = pageId;
  if (!body) return;
  const signature = JSON.stringify([body, kind, name]);
  if (!pendingId || pendingBody !== signature) { pendingId = crypto.randomUUID(); pendingBody = signature; }
  const id = pendingId; saveDraft();
  sending = true; $('send').disabled = true; $('send').textContent = '저장 중…'; status('');
  try {
    await store.add({id, page, name, kind, body});
    const draft = drafts.get(page);
    if (draft?.body.trim() === body) { drafts.delete(page); localStorage.removeItem('kumon-review-draft-v1:' + page); }
    if (page === pageId && $('memoText').value.trim() === body) { $('memoText').value = ''; pendingId = null; pendingBody = ''; saveDraft(); }
    channel?.postMessage({page});
    if (page === pageId) { fetching = false; await refresh(); }
  } catch (e) { if (page === pageId) status(e.message, true); }
  finally { sending = false; $('send').textContent = '메모 남기기'; $('send').disabled = !store.configured || !contextReady || viewingLegacy || !$('missing').hidden; }
});
channel?.addEventListener('message', e => { if (e.data?.page === pageId) refresh(); });
window.addEventListener('storage', e => { if (e.key?.startsWith('kumon-review-auth-v1:')) refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (started && !document.hidden) refresh(); }, 10000);
function start() {
  started = true; $('app').hidden = false; $('authorLabel').textContent = name;
  route();
}
try {
  const response = await fetch('pages.json', {cache: 'no-store'});
  if (!response.ok) throw new Error();
  pages = await response.json();
  if (!Array.isArray(pages) || new Set(pages.map(p => p.id)).size !== pages.length || !pages.every(p => /^[a-z][a-z0-9-]{0,79}$/.test(p.id) && !p.path.includes('..') && /^[a-z0-9/-]+\.html$/.test(p.path))) throw new Error();
  tables();
  name = localStorage.getItem(NAME_KEY)?.trim() || '';
  if (name) start(); else nameGate();
} catch { nameGate(); $('nameError').textContent = '페이지 목록을 열지 못했습니다. 인터넷 주소로 접속하거나 새로고침해 주세요.'; $('nameForm').querySelector('[type=submit]').disabled = true; }
