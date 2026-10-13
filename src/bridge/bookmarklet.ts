// The bookmarklet runs on boardgamearena.com, where the user is logged in. It opens this app
// and answers requests from it (fetch a game's log, list recent games) using the user's BGA
// session. BGA's endpoints need the page's request token, so this can't be done from our origin.
//
// Kept as plain ES2020 in a string: it's injected verbatim, so no comments or TS inside it.

const BRIDGE_SOURCE = String.raw`(() => {
  const APP = '__APP__';
  const APP_ORIGIN = new URL(APP).origin;
  const ARK_NOVA_GAME_ID = 1741;
  const H = { headers: { 'X-Request-Token': (window.bgaConfig || {}).requestToken || '' }, credentials: 'include' };
  const getJson = async (u) => (await fetch(u, H)).json();
  const me = window.current_player_id ? String(window.current_player_id) : null;
  const tableFromUrl = new URLSearchParams(location.search).get('table');

  async function fetchGame(id) {
    id = String(id).replace(/\D/g, '');
    try { await getJson('/gamereview/gamereview/requestTableArchive.html?table=' + id); } catch (e) {}
    let info = null;
    try {
      const ti = await getJson('/table/table/tableinfos.html?id=' + id);
      const d = ti.data || {};
      info = { game_name: d.game_name, result: d.result ? { time_start: d.result.time_start, time_end: d.result.time_end, player: d.result.player } : null };
    } catch (e) {}
    if (info && info.game_name && info.game_name !== 'arknova') throw new Error('Table ' + id + ' is ' + info.game_name + ', not Ark Nova.');
    const lr = await getJson('/archive/archive/logs.html?table=' + id + '&translated=true');
    if (String(lr.status) !== '1') throw new Error(lr.error || 'BGA did not return a log for table ' + id + '.');
    return { table: Number(id), tableinfos: info, gamelogs: lr.data.logs };
  }

  async function listGames(page) {
    if (!me) throw new Error('Not logged in to BGA.');
    const r = await getJson('/gamestats/gamestats/getGames.html?player=' + me + '&opponent_id=0&game_id=' + ARK_NOVA_GAME_ID + '&finished=0&page=' + (page || 1) + '&updateStats=0');
    return ((r.data && r.data.tables) || []).map((t) => ({
      table: String(t.table_id), start: Number(t.start), end: Number(t.end),
      players: t.player_names, scores: t.scores, ranks: t.ranks, playerIds: t.players,
    }));
  }

  const w = window.open(APP + '#bridge', 'arknova-analytics');
  if (window.__arkBridge) { window.__arkBridge.w = w; return; }
  window.__arkBridge = { w };

  window.addEventListener('message', async (e) => {
    if (e.origin !== APP_ORIGIN) return;
    const m = e.data || {};
    if (typeof m.type !== 'string' || !m.type.startsWith('ark:')) return;
    const reply = (d) => e.source.postMessage(Object.assign({}, d, { id: m.id }), e.origin);
    try {
      if (m.type === 'ark:hello') reply({ type: 'ark:result', data: { me, tableFromUrl } });
      else if (m.type === 'ark:fetchGame') reply({ type: 'ark:result', data: await fetchGame(m.table) });
      else if (m.type === 'ark:listGames') reply({ type: 'ark:result', data: await listGames(m.page) });
    } catch (err) {
      reply({ type: 'ark:error', error: String((err && err.message) || err) });
    }
  });
})();`;

export function bookmarkletHref(appUrl: string): string {
  const code = BRIDGE_SOURCE.replace('__APP__', appUrl)
    .split('\n')
    .map((l) => l.trim())
    .join(' ');
  return `javascript:${encodeURIComponent(code)}`;
}
