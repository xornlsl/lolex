import { withSupabase } from "jsr:@supabase/server@^1";
export default { fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
  const userId = ctx.userClaims?.sub ?? ctx.userClaims?.user_id ?? ctx.userClaims?.id;
  if (!userId) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (req.method !== "GET") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 405 });
  try {
    const { data: me, error: meError } = await ctx.supabaseAdmin.from("profiles").select("status").eq("user_id", userId).maybeSingle();
    if (meError) throw meError;
    if (me?.status !== "approved") return Response.json({ error: "승인된 회원만 이용할 수 있습니다." }, { status: 403 });
    const search = (new URL(req.url).searchParams.get("search") || "").trim().toLowerCase();
    let profiles = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await ctx.supabaseAdmin.from("profiles")
        .select("user_id,lol_nickname,main_position,sub_position,profile_aliases(id,lol_nickname,created_at),player_ratings!inner(overall_rating,top_rating,jungle_rating,mid_rating,adc_rating,support_rating,games_played,wins,losses)")
        .eq("status", "approved").order("user_id").range(offset, offset + 499);
      if (error) throw error;
      profiles.push(...data);
      if (data.length < 500) break;
    }
    const selected = profiles.filter(p => !search || [p.lol_nickname, ...p.profile_aliases.map(a => a.lol_nickname)].some(n => n.toLowerCase().includes(search)));
    const champions = [];
    for (let i = 0; i < selected.length; i += 100) {
      const { data, error } = await ctx.supabaseAdmin.rpc("get_most_champions", { p_user_ids: selected.slice(i, i + 100).map(p => p.user_id) });
      if (error) throw error;
      champions.push(...data);
    }
    const members = selected.map(p => ({
      user_id: p.user_id, lol_nickname: p.lol_nickname, main_position: p.main_position, sub_position: p.sub_position,
      aliases: p.profile_aliases.sort((a, b) => a.created_at.localeCompare(b.created_at)).map(a => ({ id: a.id, lol_nickname: a.lol_nickname })),
      ...p.player_ratings,
      win_rate: p.player_ratings.games_played ? Math.round(p.player_ratings.wins / p.player_ratings.games_played * 1000) / 10 : 0,
      most_champions: champions.filter(c => c.user_id === p.user_id),
    })).sort((a,b) => b.overall_rating - a.overall_rating || b.games_played - a.games_played || a.lol_nickname.localeCompare(b.lol_nickname));
    return Response.json({ success: true, search: search || null, count: members.length, members: members.map((m,i) => ({ ...m, rank: i + 1 })) });
  } catch (error) {
    console.error("Members request failed", error?.code || "unknown");
    return Response.json({ error: "회원 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}) };
