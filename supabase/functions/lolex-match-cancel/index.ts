import { withSupabase } from 'npm:@supabase/server@^1';

export default { fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
  if (req.method !== 'POST') return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 405 });
  const actorId = ctx.userClaims?.sub ?? ctx.userClaims?.user_id ?? ctx.userClaims?.id;
  if (!actorId) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: '입력 형식이 올바르지 않습니다.' }, { status: 400 }); }
  const matchId = Number(body?.match_id);
  if (!Number.isSafeInteger(matchId) || matchId <= 0) {
    return Response.json({ error: '경기 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  const { data, error } = await ctx.supabaseAdmin.rpc('cancel_active_match', {
    p_match_id: matchId, p_actor_id: actorId,
  });
  if (error) {
    console.error('cancel_active_match failed', error.code);
    return Response.json({ error: '매칭 취소에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
  return Response.json(data, { status: data?.success ? 200 : 409 });
}) };
