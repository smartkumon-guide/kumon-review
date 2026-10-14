const kinds = ['수정사항', '전달사항', '건의사항'];
export function createMemoStore(config, {fetcher = fetch, storage = localStorage, locks = globalThis.navigator?.locks} = {}) {
  let publicKey = config.publishableKey.startsWith('sb_publishable_');
  if (config.publishableKey.startsWith('eyJ')) {
    try { const payload = config.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); publicKey = JSON.parse(atob(payload)).role === 'anon'; } catch {}
  }
  const configured = /^https:\/\/[^/]+\.supabase\.co$/.test(config.url) && publicKey;
  const key = 'kumon-review-auth-v1:' + config.url;
  let pendingAuth;
  function readSession() {
    try { return JSON.parse(storage.getItem(key) || 'null'); }
    catch { throw new Error('브라우저 저장을 허용해야 작성자를 기억할 수 있습니다.'); }
  }
  function ownId() { return readSession()?.user?.id || null; }
  async function request(path, {method = 'GET', body, token, prefer} = {}) {
    if (!configured) throw new Error('공용 메모 저장소 연결 전입니다.');
    const headers = {apikey: config.publishableKey};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    let response;
    try { response = await fetcher(config.url + path, {method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)}); }
    catch { throw new Error('연결이 불안정합니다. 작성 내용은 유지됩니다. 잠시 뒤 다시 시도해 주세요.'); }
    if (!response.ok) {
      let error = {}; try { error = await response.json(); } catch {}
      if (response.status === 429) throw new Error('요청이 많습니다. 잠시 뒤 다시 시도해 주세요.');
      if (error.code === '23505') { const duplicate = new Error('이미 저장된 메모입니다.'); duplicate.code = 'duplicate'; throw duplicate; }
      if (response.status === 401 || response.status === 403 || error.error_code === 'refresh_token_not_found')
        throw new Error('작성자 연결을 확인할 수 없습니다. 저장소 설정 또는 이 브라우저의 접속 상태를 확인해 주세요.');
      if (error.error_code === 'anonymous_provider_disabled') throw new Error('공용 저장소의 익명 접속 설정이 필요합니다.');
      throw new Error('메모를 불러오거나 저장하지 못했습니다. 작성 내용은 유지됩니다.');
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function authorize() {
    const work = async () => {
      const saved = readSession();
      if (saved?.access_token && saved.expires_at > Date.now() / 1000 + 60) return saved;
      // Never replace a failed refresh with a new identity: old delete rights would be lost.
      const data = saved?.refresh_token
        ? await request('/auth/v1/token?grant_type=refresh_token', {method: 'POST', body: {refresh_token: saved.refresh_token}})
        : await request('/auth/v1/signup', {method: 'POST', body: {data: {}}});
      if (!data?.user?.id || !data.access_token || !data.refresh_token) throw new Error('작성자 정보를 받지 못했습니다.');
      data.expires_at = data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in;
      try { storage.setItem(key, JSON.stringify(data)); if (readSession()?.user?.id !== data.user.id) throw new Error(); }
      catch { throw new Error('작성자를 기억할 수 없어 저장을 중단했습니다. 브라우저 저장을 허용해 주세요.'); }
      return data;
    };
    if (!pendingAuth) pendingAuth = (locks ? locks.request(key, work) : work()).finally(() => { pendingAuth = null; });
    return pendingAuth;
  }
  function pageKey(page) {
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(page)) throw new Error('페이지 ID가 올바르지 않습니다.');
    return page;
  }
  async function list(page, limit = 50) {
    pageKey(page);
    if (!Number.isInteger(limit) || limit < 1) throw new Error('조회 범위가 올바르지 않습니다.');
    const rows = [];
    while (rows.length < limit) {
      const count = Math.min(1000, limit - rows.length);
      const query = new URLSearchParams({page_id: 'eq.' + page, select: 'id,page_id,author_id,author_name,kind,body,created_at', order: 'created_at.desc,id.desc', limit: String(count)});
      if (rows.length) {
        const last = rows[rows.length - 1];
        if (!/^[0-9a-f-]{36}$/i.test(last.id) || !/^\d{4}-\d\d-\d\dT[\d:.+Z-]+$/.test(last.created_at)) throw new Error('메모 순서를 확인할 수 없습니다.');
        query.set('or', `(created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id}))`);
      }
      const batch = await request('/rest/v1/review_memos?' + query);
      if (!Array.isArray(batch)) throw new Error('메모 응답을 확인할 수 없습니다.');
      rows.push(...batch);
      if (batch.length < count) break;
    }
    return rows;
  }
  async function add({id, page, name, kind, body}) {
    pageKey(page); name = name.trim(); body = body.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id) || name.length < 1 || name.length > 40 || body.length < 1 || body.length > 2000 || !kinds.includes(kind))
      throw new Error('이름·내용·분류를 확인해 주세요. 내용은 2,000자까지입니다.');
    const session = await authorize();
    const memo = {id, page_id: page, author_id: session.user.id, author_name: name, kind, body};
    try { return await request('/rest/v1/review_memos', {method: 'POST', token: session.access_token, prefer: 'return=representation', body: memo}); }
    catch (error) {
      if (error.code !== 'duplicate') throw error;
      const rows = await request('/rest/v1/review_memos?' + new URLSearchParams({id: 'eq.' + id, select: 'id,page_id,author_id,author_name,kind,body'}));
      if (rows?.length === 1 && Object.keys(memo).every(key => rows[0][key] === memo[key])) return rows;
      throw error;
    }
  }
  async function remove(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('메모 ID가 올바르지 않습니다.');
    const session = await authorize();
    const query = new URLSearchParams({id: 'eq.' + id, author_id: 'eq.' + session.user.id});
    const rows = await request('/rest/v1/review_memos?' + query, {method: 'DELETE', token: session.access_token, prefer: 'return=representation'});
    if (!rows?.length) throw new Error('본인이 작성한 메모만 삭제할 수 있습니다. 이미 삭제되었을 수도 있습니다.');
  }
  return {configured, ownId, list, add, remove};
}
