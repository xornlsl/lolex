import { withSupabase } from "jsr:@supabase/server@^1";
export default { fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
  const userId = ctx.userClaims?.sub ?? ctx.userClaims?.user_id ?? ctx.userClaims?.id;
  if (!userId) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { data: me, error: meError } = await ctx.supabaseAdmin.from("profiles").select("role,status").eq("user_id", userId).maybeSingle();
    if (meError) throw meError;
    if (!me || me.status !== "approved" || !["staff","superadmin"].includes(me.role)) return Response.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
    if (req.method === "GET") {
      const { data, error } = await ctx.supabaseAdmin.from("profiles").select("user_id,username,real_name,birth_date,lol_nickname,role,status,created_at,initial_internal_score").order("created_at", { ascending: false });
      if (error) throw error;
      return Response.json({ success: true, members: data });
    }
    if (req.method !== "PATCH") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    if (typeof body.user_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.user_id) || !["approve","promote","kick"].includes(body.action)) return Response.json({ error: "대상 회원과 작업을 확인해주세요." }, { status: 400 });
    const { data: target, error: targetError } = await ctx.supabaseAdmin.from("profiles").select("role,status").eq("user_id", body.user_id).maybeSingle();
    if (targetError) throw targetError;
    if (!target) return Response.json({ error: "회원을 찾을 수 없습니다." }, { status: 404 });
    if (body.action === "kick") {
      if (body.user_id === userId) return Response.json({ error: "자기 자신은 강퇴할 수 없습니다." }, { status: 403 });
      if (me.role === "staff" && target.role !== "member") return Response.json({ error: "STAFF는 MEMBER만 강퇴할 수 있습니다." }, { status: 403 });
      const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(body.user_id);
      if (error) return Response.json({ error: "회원 삭제에 실패했습니다. 연결된 경기 기록을 확인해주세요." }, { status: 409 });
      return Response.json({ success: true });
    }
    if (body.action === "promote" && (me.role !== "superadmin" || target.role !== "member" || target.status !== "approved")) {
      return Response.json({ error: "SUPERADMIN만 승인된 MEMBER를 STAFF로 승격할 수 있습니다." }, { status: 403 });
    }
    if (body.action === "approve" && (target.status !== "pending" || (me.role === "staff" && target.role !== "member"))) {
      return Response.json({ error: "해당 회원은 승인할 수 없습니다." }, { status: 409 });
    }
    const changes = body.action === "promote" ? { role: "staff" } : { status: "approved" };
    const { error } = await ctx.supabaseAdmin.from("profiles").update(changes).eq("user_id", body.user_id);
    if (error?.message === "이미 가입된 정보가 있습니다.") return Response.json({ error: error.message }, { status: 409 });
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    console.error("Admin management failed", error?.code || "unknown");
    return Response.json({ error: "회원 관리 요청에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
  }
}) };
