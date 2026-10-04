import { withSupabase } from "jsr:@supabase/server@^1";
import { validateSheetEntry, canManageSheet } from "../_shared/member-sheet-validation.js";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.sub ?? ctx.userClaims?.user_id ?? ctx.userClaims?.id;
    if (!userId) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    try {
      const { data: me, error: profileError } = await ctx.supabaseAdmin.from("profiles")
        .select("role,status").eq("user_id", userId).maybeSingle();
      if (profileError) throw profileError;
      if (!canManageSheet(me)) return Response.json({ error: "승인된 STAFF와 SUPERADMIN만 이용할 수 있습니다." }, { status: 403 });

      if (req.method === "GET") {
        const offset = Number(new URL(req.url).searchParams.get("offset") || 0);
        if (!Number.isSafeInteger(offset) || offset < 0) return Response.json({ error: "올바른 페이지를 선택해주세요." }, { status: 400 });
        const { data, count, error } = await ctx.supabaseAdmin.from("member_sheet")
          .select("id,real_name,birth_date,lol_nickname,created_at,updated_at", { count: "exact" })
          .order("real_name").order("birth_date").order("id").range(offset, offset + 49);
        if (error) throw error;
        return Response.json({ success: true, members: data, total: count });
      }
      if (req.method === "DELETE") {
        const body = await req.json().catch(() => ({}));
        if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return Response.json({ error: "삭제할 명단을 선택해주세요." }, { status: 400 });
        const { data, error } = await ctx.supabaseAdmin.from("member_sheet").delete().eq("id", body.id).select("id").maybeSingle();
        if (error) throw error;
        if (!data) return Response.json({ error: "이미 삭제되었거나 존재하지 않는 명단입니다." }, { status: 404 });
        return Response.json({ success: true });
      }
      if (!["POST", "PATCH"].includes(req.method)) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 405 });
      let body, entry;
      try { body = await req.json(); entry = validateSheetEntry(body); }
      catch (error) { return Response.json({ error: error instanceof SyntaxError ? "입력 내용을 확인해주세요." : error.message }, { status: 400 }); }

      if (req.method === "PATCH" && (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))) {
        return Response.json({ error: "수정할 회원을 선택해주세요." }, { status: 400 });
      }
      const table = ctx.supabaseAdmin.from("member_sheet");
      const query = req.method === "POST"
        ? table.insert({ ...entry, created_by: userId })
        : table.update({ ...entry, updated_at: new Date().toISOString() }).eq("id", body.id);
      const { data, error } = await query.select("id,real_name,birth_date,lol_nickname").maybeSingle();
      if (error?.code === "23505") return Response.json({ error: "같은 정보가 이미 명단에 등록되어 있습니다." }, { status: 409 });
      if (error) throw error;
      if (!data) return Response.json({ error: "명단에서 해당 회원을 찾을 수 없습니다." }, { status: 404 });
      return Response.json({ success: true, member: data }, { status: req.method === "POST" ? 201 : 200 });
    } catch (error) {
      console.error("Member sheet request failed", error?.code || "unknown");
      return Response.json({ error: "명단 처리 중 오류가 발생했습니다. 다시 시도해주세요." }, { status: 500 });
    }
  }),
};
