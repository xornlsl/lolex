import { withSupabase } from 'jsr:@supabase/server@^1';
import { validateSeries, normalizeSeriesSides } from '../../../src/lib/replay.js';
import { RiotMatchError, normalizeRiotMatchIds, fetchRiotMatch, riotMatchToGame, applyRiotReview } from '../_shared/riot-match.js';

let catalog: { id: string; key: string; name: string; version: string }[] = [];
let catalogAt = 0;
async function getChampions() {
  if (catalog.length && Date.now() - catalogAt < 3600000) return catalog;
  const versionsResponse = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  if (!versionsResponse.ok) throw new Error('catalog');
  const [version] = await versionsResponse.json();
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`);
  if (!response.ok) throw new Error('catalog');
  const { data } = await response.json();
  catalog = Object.values(data).map((c: any) => ({ id: c.id, key: c.key, name: c.name, version })).sort((a,b) => a.name.localeCompare(b.name, 'ko'));
  catalogAt = Date.now();
  return catalog;
}

export default { fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  try {
    const id = ctx.userClaims?.sub ?? ctx.userClaims?.user_id ?? ctx.userClaims?.id;
    if (!id) return fail('로그인이 필요합니다.', 401);
    const db = ctx.supabaseAdmin;
    const { data: me, error: meError } = await db.from('profiles').select('role,status').eq('user_id', id).maybeSingle();
    if (meError) throw meError;
    if (me?.status !== 'approved') return fail('승인된 회원만 이용할 수 있습니다.', 403);
    if (!['GET','POST'].includes(req.method)) return fail('허용되지 않은 요청입니다.',405);
    const champions = await getChampions();
    const members = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('profiles').select('user_id,lol_nickname,profile_aliases(lol_nickname)').eq('status','approved').order('user_id').range(offset,offset+499);
      if (error) throw error;
      members.push(...data.map(m => ({ user_id: m.user_id, lol_nickname: m.lol_nickname, aliases: (m.profile_aliases || []).map(a => a.lol_nickname) })));
      if (data.length < 500) break;
    }
    if (req.method === 'GET') return Response.json({ success: true, champions, members });
    if (Number(req.headers.get('content-length')) > 150000) return fail('요청 크기가 너무 큽니다.');
    const text = await req.text();
    if (text.length > 150000) return fail('요청 크기가 너무 큽니다.');
    let body;
    try { body = JSON.parse(text); } catch { return fail('입력 형식이 올바르지 않습니다.'); }
    const matchId = Number(body.match_id);
    const fromRiot = body.source === 'RIOT_API';
    const lookup = body.action === 'lookup';
    if (!Number.isSafeInteger(matchId) || matchId <= 0 || (lookup && !fromRiot) || (!lookup && !Array.isArray(body.games))) return fail('경기 정보가 올바르지 않습니다.');
    const { data: match, error: matchError } = await db.from('matches').select('status').eq('id',matchId).maybeSingle();
    if (matchError) throw matchError;
    if (!match) return fail('삭제된 경기입니다. 매칭 화면을 다시 열어주세요.',404);
    if (!['matched','in_progress'].includes(match.status)) return fail('이미 종료되었거나 결과를 등록할 수 없는 경기입니다.',409);
    const { data: participants, error: participantError } = await db.from('match_players').select('user_id,team,position').eq('match_id',matchId);
    if (participantError) throw participantError;
    if (!['staff','superadmin'].includes(me.role) && !participants.some(p => p.user_id === id)) return fail('참가자 또는 관리자만 확정할 수 있습니다.',403);
    let games = body.games;
    if (fromRiot) {
      const ids = normalizeRiotMatchIds(lookup ? body.game_ids : games.map(g => g?.riot_match_id));
      const { data: duplicates, error: duplicateError } = await db.from('replay_games').select('riot_match_id').in('riot_match_id', ids);
      if (duplicateError) throw duplicateError;
      if (duplicates.length) return fail('이미 경기 기록에 등록된 게임 ID가 포함되어 있습니다.',409);
      const fetched = [];
      for (const [index, riotId] of ids.entries()) {
        const raw = await fetchRiotMatch(riotId, { apiKey: Deno.env.get('RIOT_API_KEY'), region: Deno.env.get('RIOT_MATCH_REGION') || 'asia' });
        const game = await riotMatchToGame(raw, riotId, { members, participants, champions });
        fetched.push(lookup ? game : applyRiotReview(game, games[index], members, participants));
      }
      if (fetched.some((g, i) => i > 0 && g.started_at && fetched[i-1].started_at && g.started_at <= fetched[i-1].started_at)) return fail('게임 ID를 실제 경기 순서대로 입력해주세요.');
      if (lookup) return Response.json({ success: true, games: fetched });
      games = fetched;
    } else if (games.some(g => g?.source === 'RIOT_API' || g?.riot_match_id)) {
      return fail('게임 ID로 조회한 경기는 API 확정 방식으로 저장해주세요.');
    }
    if (![2,3].includes(games.length) || games.some(g => !g || !Array.isArray(g.rows) || g.rows.some(r => !r))) return fail('세트 데이터가 올바르지 않습니다.');
    const invalid = validateSeries(games);
    if (invalid) return fail(invalid);
    games = normalizeSeriesSides(games);
    if (games.some(g => g.reviewed !== true || !/^[a-f0-9]{64}$/.test(g.hash))) return fail('모든 리플레이의 검수를 완료해주세요.');
    if (new Set(games.map(g => g.hash)).size !== games.length) return fail('같은 리플레이를 중복 등록할 수 없습니다.');
    const appearances = new Map();
    const mapped = games.map((g, index) => ({
      game_number: index+1, hash: g.hash, riot_match_id: g.riot_match_id, winner: g.winner, original_winner: g.original_winner,
      patch: String(g.patch || '').slice(0,80),
      outcome: g.winner === 'BLUE' ? 'victory' : 'defeat', uploader_team: 'BLUE',
      kda: g.rows.map(r => {
        if (!members.some(m => m.user_id === r.user_id)) throw new Error('INVALID_MEMBER');
        const champion = champions.find(c => c.id === r.champion);
        if (!champion || typeof r.riotName !== 'string' || r.riotName.length > 100) throw new Error('INVALID_ROW');
        const count = appearances.get(r.user_id)?.appearances || 0;
        appearances.set(r.user_id, { user_id:r.user_id,team:r.team,position:r.position,appearances:count+1 });
        return { user_id:r.user_id,team:r.team,original_team:r.original_team,position:r.position,riotName:r.riotName,
          champion_key:champion.id,champion_name:champion.name,icon_version:champion.version,
          kills:r.kills,deaths:r.deaths,assists:r.assists };
      }),
    }));
    const rated = [...appearances.values()].filter(p => p.appearances >= 2);
    if (rated.length !== 10) return fail('각 팀·포지션에서 2세트 이상 출전한 선수가 정확히 10명이어야 합니다.');
    if (new Set(rated.map(p => p.team+'/'+p.position)).size !== 10) return fail('시리즈 대표 선수의 포지션이 중복되었습니다.');
    // Existing matched participants must retain their agreed position.
    if (rated.some(p => participants.some(original => original.user_id === p.user_id && original.position !== p.position))) return fail('매칭 때 확정한 포지션과 다릅니다. 세트별 포지션 선택을 확인해주세요.');
    const winner = games.filter(g => g.winner === 'BLUE').length === 2 ? 'BLUE' : 'RED';
    const { data, error } = await db.rpc(fromRiot ? 'finish_riot_series' : 'finish_replay_series', { p_match_id:matchId,p_winner:winner,p_games:mapped,p_players:rated });
    if (error) { console.error('Match result save',error.code); return fail(error.code === '23505' ? '이미 등록된 경기입니다.' : '저장에 실패했습니다. 결과는 반영되지 않았습니다.',409); }
    return Response.json({ success:true, match_id:matchId, result:data });
  } catch (error) {
    if (error instanceof RiotMatchError) return fail(error.message, error.status);
    console.error('Replay request', error?.message);
    return fail(['INVALID_MEMBER','INVALID_ROW'].includes(error?.message) ? '회원 또는 챔피언 선택을 확인해주세요.' : '리플레이 등록 정보를 처리하지 못했습니다. 다시 시도해주세요.',400);
  }
}) };
