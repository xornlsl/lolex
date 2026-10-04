import { withSupabase } from "jsr:@supabase/server@^1";
import { validateSheetEntry, parseInitialScore } from "../_shared/member-sheet-validation.js";

const POSITIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const publicErrors = [
  "이미 가입된 정보가 있습니다.",
  "이미 가입 신청 중인 정보입니다. 승인 결과를 기다려주세요.",
  "시트 명단의 정보와 일치하지 않습니다. 관리자에게 확인해주세요.",
  "이미 등록된 롤 계정입니다.",
];
export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 405 });
    let body, entry, score;
    try {
      body = await req.json();
      entry = validateSheetEntry(body);
      score = parseInitialScore(body.initial_internal_score);
    } catch (error) {
      return Response.json({ error: error instanceof SyntaxError ? "입력 내용을 확인해주세요." : error.message }, { status: 400 });
    }
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = body.password;
    const mainPosition = typeof body.main_position === "string" ? body.main_position.toUpperCase() : "";
    const subPosition = typeof body.sub_position === "string" && body.sub_position ? body.sub_position.toUpperCase() : null;
    if (!/^[a-z0-9_]{4,20}$/.test(username)) return Response.json({ error: "아이디는 영문 소문자, 숫자, 밑줄(_)을 사용하여 4~20자로 입력해주세요." }, { status: 400 });
    if (typeof password !== "string" || password.length < 8) return Response.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
    if (!POSITIONS.includes(mainPosition) || (subPosition && (!POSITIONS.includes(subPosition) || subPosition === mainPosition))) {
      return Response.json({ error: "주 포지션과 부 포지션을 올바르게 선택해주세요. 두 포지션은 달라야 합니다." }, { status: 400 });
    }
    try {
      const admin = ctx.supabaseAdmin;
      const { data: approved, error: approvedError } = await admin.from("profiles").select("user_id")
        .eq("real_name", entry.real_name).eq("status", "approved").limit(1);
      if (approvedError) throw approvedError;
      if (approved?.length) return Response.json({ error: publicErrors[0] }, { status: 409 });
      const { data: sheet, error: sheetError } = await admin.from("member_sheet").select("id")
        .eq("real_name", entry.real_name).eq("birth_date", entry.birth_date).eq("lol_nickname", entry.lol_nickname).maybeSingle();
      if (sheetError) throw sheetError;
      if (!sheet) return Response.json({ error: publicErrors[2] }, { status: 403 });
      const { data: claimed, error: claimError } = await admin.from("profiles").select("user_id").eq("member_sheet_id", sheet.id).maybeSingle();
      if (claimError) throw claimError;
      if (claimed) return Response.json({ error: publicErrors[1] }, { status: 409 });
      const { data: existing, error: existingError } = await admin.from("profiles").select("user_id").eq("username", username).maybeSingle();
      if (existingError) throw existingError;
      if (existing) return Response.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });

      const { data: auth, error: authError } = await admin.auth.admin.createUser({
        email: username + "@auth.lolex.invalid", password, email_confirm: true, user_metadata: { username },
      });
      if (authError || !auth.user) return Response.json({ error: "회원 계정 생성에 실패했습니다. 아이디를 확인해주세요." }, { status: 400 });
      const { error: insertError } = await admin.from("profiles").insert({
        ...entry, user_id: auth.user.id, username, main_position: mainPosition, sub_position: subPosition,
        role: "member", status: "pending", initial_internal_score: score,
      });
      // The DB trigger rechecks the roster and duplicate identity under transaction
      // locks, then creates all six ratings atomically with the profile.
      if (insertError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(auth.user.id);
        if (cleanupError) console.error("Signup auth cleanup failed", cleanupError.code);
        const message = publicErrors.includes(insertError.message) ? insertError.message
          : insertError.code === "23505" ? "이미 가입 신청된 정보 또는 사용 중인 아이디입니다." : "회원정보 저장에 실패했습니다.";
        return Response.json({ error: message }, { status: insertError.code === "P0001" || insertError.code === "23505" ? 409 : 500 });
      }
      return Response.json({ success: true, status: "pending", initial_rating: 1000 + score * 10 }, { status: 201 });
    } catch (error) {
      console.error("Signup failed", error?.code || "unknown");
      return Response.json({ error: "회원가입 처리 중 오류가 발생했습니다." }, { status: 500 });
    }
  }),
};
