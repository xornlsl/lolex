import { withSupabase } from "jsr:@supabase/server@^1";
import { validateRiotId } from "../_shared/member-sheet-validation.js";

export default { fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
  const id = ctx.userClaims?.sub ?? ctx.userClaims?.user_id ?? ctx.userClaims?.id;
  if (!id) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { data: me, error: meError } = await ctx.supabaseAdmin.from("profiles").select("status").eq("user_id", id).maybeSingle();
    if (meError) throw meError;
    if (me?.status !== "approved") return Response.json({ error: "승인된 회원만 이용할 수 있습니다." }, { status: 403 });
    if (req.method === "POST") {
      let lol_nickname;
      try { lol_nickname = validateRiotId((await req.json()).lol_nickname); }
      catch { return Response.json({ error: "롤 닉네임을 닉네임#해시태그 형식으로 입력해주세요." }, { status: 400 }); }
      const { error } = await ctx.supabaseAdmin.from("profile_aliases").insert({ user_id: id, lol_nickname });
      if (error?.code === "23505" || error?.message === "이미 등록된 롤 계정입니다.") return Response.json({ error: "이미 등록된 롤 계정입니다." }, { status: 409 });
      if (error) throw error;
    } else if (req.method !== "GET") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 405 });
    const { data, error } = await ctx.supabaseAdmin.from("profile_aliases").select("id,lol_nickname").eq("user_id", id).order("created_at").order("id");
    if (error) throw error;
    return Response.json({ success: true, aliases: data }, { status: req.method === "POST" ? 201 : 200 });
  } catch (error) {
    console.error("Aliases request failed", error?.code || "unknown");
    return Response.json({ error: "부계정 정보를 처리하지 못했습니다. 다시 시도해주세요." }, { status: 500 });
  }
}) };
