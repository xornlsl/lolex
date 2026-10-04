import { withSupabase } from "jsr:@supabase/server@^1";
export default { fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
  const userId = ctx.userClaims?.sub ?? ctx.userClaims?.user_id ?? ctx.userClaims?.id;
  if (!userId) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (req.method !== "GET") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 405 });
  try {
    const { data: me, error: meError } = await ctx.supabaseAdmin.from("profiles").select("status").eq("user_id", userId).maybeSingle();
    if (meError) throw meError;
    if (me?.status !== "approved") return Response.json({ error: "승인된 회원만 이용할 수 있습니다." }, { status: 403 });
    const { data, error } = await ctx.supabaseAdmin.from("matches")
      .select("id,status,winner,created_at,finished_at,replay_games(game_number,winner,replay_participants(user_id,team,position,played_riot_id,champion_name,champion_key,icon_version,kills,deaths,assists)),match_players(id,team,position,user_id,profiles(username,lol_nickname),match_player_stats(played_riot_id,champion_name,champion_key,icon_version,kills,deaths,assists))")
      .eq("status", "finished").order("finished_at", { ascending: false }).limit(5);
    if (error) throw error;
    return Response.json({ success: true, matches: (data || []).map(m => ({
      id: m.id, status: m.status, winner: m.winner, created_at: m.created_at, finished_at: m.finished_at,
      games: (m.replay_games || []).sort((a,b) => a.game_number-b.game_number),
      players: (m.match_players || []).map(p => {
        const stats = p.match_player_stats;
        return { id: p.id, team: p.team, position: p.position, user_id: p.user_id, username: p.profiles?.username,
          champion_key: stats?.champion_key || null, icon_version: stats?.icon_version || null,
          lol_nickname: stats?.played_riot_id || p.profiles?.lol_nickname, champion: stats?.champion_name || null,
          kills: stats?.kills ?? null, deaths: stats?.deaths ?? null, assists: stats?.assists ?? null };
      }).sort((a,b) => a.team.localeCompare(b.team) || a.id-b.id),
    })) });
  } catch (error) {
    console.error("Match history failed", error?.code || "unknown");
    return Response.json({ error: "매칭 기록을 불러오지 못했습니다." }, { status: 500 });
  }
}) };
