import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";

const POSITIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const PRIMARY_POSITIONS = ["ALL", ...POSITIONS];

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      try {
        // =====================================================
        // 1. 로그인 사용자 확인
        // =====================================================

        const user = ctx.userClaims;

        if (!user) {
          return Response.json(
            { error: "로그인이 필요합니다." },
            { status: 401 }
          );
        }

        // =====================================================
        // 2. 회원 정보 확인
        // =====================================================

        const { data: profile, error: profileError } =
          await ctx.supabaseAdmin
            .from("profiles")
            .select("user_id, username, lol_nickname, status")
            .eq("user_id", user.id)
            .single();

        if (profileError || !profile) {
          return Response.json(
            { error: "회원 정보를 찾을 수 없습니다." },
            { status: 404 }
          );
        }

        // 승인 회원만 대기열 기능 사용 가능
        if (profile.status !== "approved") {
          return Response.json(
            { error: "승인된 회원만 매칭을 신청할 수 있습니다." },
            { status: 403 }
          );
        }

        // =====================================================
        // GET : 내 대기 상태 확인
        // =====================================================

        if (req.method === "GET") {
  const { data: queue, error: queueError } =
    await ctx.supabaseAdmin
      .from("match_queue")
      .select(`
        id,
        primary_position,
        secondary_position,
        joined_at
      `)
      .eq("user_id", user.id)
      .maybeSingle();

  if (queueError) {
    console.error("Queue fetch error:", queueError);

    return Response.json(
      { error: "매칭 대기 상태를 확인하지 못했습니다." },
      { status: 500 }
    );
  }

  const { data: waiting, error: countError } =
    await ctx.supabaseAdmin
      .from("match_queue")
      .select("user_id, primary_position, secondary_position, joined_at")
      .order("joined_at").order("id");


  if (countError) {
    console.error("Queue count error:", countError);

    return Response.json(
      { error: "매칭 대기 인원을 확인하지 못했습니다." },
      { status: 500 }
    );
  }
  const queueMembers = [];
  if (waiting?.length) {
    const ids = waiting.map(row => row.user_id);
    const [names, ratings] = await Promise.all([
      ctx.supabaseAdmin.from("profiles").select("user_id, real_name, lol_nickname").in("user_id", ids),
      ctx.supabaseAdmin.from("player_ratings").select("user_id, overall_rating").in("user_id", ids),
    ]);
    if (names.error || ratings.error) return Response.json({ error: "매칭 신청자 정보를 확인하지 못했습니다." }, { status: 500 });
    const nameMap = new Map((names.data ?? []).map(row => [row.user_id, row]));
    const ratingMap = new Map((ratings.data ?? []).map(row => [row.user_id, row.overall_rating]));
    for (const row of waiting) queueMembers.push({
      ...row,
      real_name: nameMap.get(row.user_id)?.real_name ?? "—",
      lol_nickname: nameMap.get(row.user_id)?.lol_nickname ?? "—",
      overall_rating: ratingMap.get(row.user_id) ?? null,
    });
  }
const { data: activeMatchPlayer, error: activeMatchError } =
  await ctx.supabaseAdmin
    .from("match_players")
    .select(`
      match_id,
      matches!inner (
        id,
        status,
        winner,
        created_at
      )
    `)
    .eq("user_id", user.id)
    .in("matches.status", ["position_discussion", "matched", "in_progress"])
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

if (activeMatchError) {
  console.error("Active match fetch error:", activeMatchError);

  return Response.json(
    { error: "현재 매칭 상태를 확인하지 못했습니다." },
    { status: 500 }
  );
}
let matchPlayers = [];

if (activeMatchPlayer?.match_id) {
  const { data: players, error: playersError } =
    await ctx.supabaseAdmin
      .from("match_players")
      .select(
  "user_id, team, position, position_rating_before, requested_primary_position, requested_secondary_position"
)
      .eq("match_id", activeMatchPlayer.match_id);

  if (playersError) {
    console.error("Match players fetch error:", playersError);

    return Response.json(
      { error: "매칭 참가자 정보를 확인하지 못했습니다." },
      { status: 500 }
    );
  }

  matchPlayers = players ?? [];
}
if (matchPlayers.length > 0) {
  const userIds = matchPlayers.map((player) => player.user_id);

  const { data: profiles, error: profilesError } =
    await ctx.supabaseAdmin
      .from("profiles")
      .select("user_id, lol_nickname")
      .in("user_id", userIds);

  if (profilesError) {
    console.error("Match profiles fetch error:", profilesError);

    return Response.json(
      { error: "매칭 참가자 닉네임을 확인하지 못했습니다." },
      { status: 500 }
    );
  }

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.user_id,
      profile.lol_nickname,
    ])
  );

  matchPlayers = matchPlayers.map((player) => ({
    ...player,
    lol_nickname:
      profileMap.get(player.user_id) ?? "알 수 없음",
  }));
}
  return Response.json(
    {
      success: true,
      queued: Boolean(queue),
      queue: queue ?? null,
      queue_count: waiting?.length ?? 0,
      queue_members: queueMembers,
      active_match: activeMatchPlayer?.matches ?? null,
      match_players: matchPlayers,
    },
    { status: 200 }
  );
}
        if (req.method === "POST") {
          const body = await req.json();

          const primaryPosition = body.primary_position;
          const secondaryPosition = body.secondary_position;

          // 포지션 유효성 확인
          if (
            !PRIMARY_POSITIONS.includes(primaryPosition) ||
            !POSITIONS.includes(secondaryPosition)
          ) {
            return Response.json(
              { error: "올바른 포지션을 선택해주세요." },
              { status: 400 }
            );
          }

          if (primaryPosition === secondaryPosition) {
            return Response.json(
              { error: "주포지션과 부포지션은 서로 달라야 합니다." },
              { status: 400 }
            );
          }

          // 이미 대기 중인지 확인
          const { data: existing, error: existingError } =
            await ctx.supabaseAdmin
              .from("match_queue")
              .select("id")
              .eq("user_id", user.id)
              .maybeSingle();

          if (existingError) {
            console.error(
              "Queue duplicate check error:",
              existingError
            );

            return Response.json(
              { error: "매칭 신청 상태를 확인하지 못했습니다." },
              { status: 500 }
            );
          }

          if (existing) {
            return Response.json(
              { error: "이미 매칭 대기 중입니다." },
              { status: 409 }
            );
          }

          // 대기열 등록
          const { data: queue, error: insertError } =
            await ctx.supabaseAdmin
              .from("match_queue")
              .insert({
                user_id: user.id,
                primary_position: primaryPosition,
                secondary_position: secondaryPosition,
              })
              .select(`
                id,
                primary_position,
                secondary_position,
                joined_at
              `)
              .single();

          if (insertError) {
            console.error("Queue insert error:", insertError);

            return Response.json(
              { error: "매칭 신청에 실패했습니다." },
              { status: 500 }
            );
          }

          // ===================================================
          // 10명 자동매칭 실행
          //
          // 10명 미만이면 아무 매치도 생성되지 않음.
          // 10명 이상이면 DB 함수가 안전하게 10명을 확정함.
          // ===================================================

          const {
            data: matchmakingResult,
            error: matchmakingError,
          } = await ctx.supabaseAdmin.rpc(
            "run_auto_matchmaking"
          );

          if (matchmakingError) {
            console.error(
              "Auto matchmaking error:",
              matchmakingError
            );

            /*
              대기열 등록 자체는 이미 성공했습니다.

              자동매칭 계산 오류 때문에
              회원의 신청까지 실패했다고 표시하지 않습니다.
            */

            return Response.json(
              {
                success: true,
                message: "매칭 대기열에 등록되었습니다.",
                queued: true,
                queue,
                matchmaking: {
                  success: false,
                  error: "자동 매칭 처리 중 오류가 발생했습니다.",
                },
              },
              { status: 201 }
            );
          }

          // ===================================================
          // 자동매칭 결과에 따라 응답
          // ===================================================

          const matchCreated =
            matchmakingResult?.match_created === true;

          const matchStatus =
            matchmakingResult?.status ?? null;

          // 10명이 되어 실제 매치가 만들어진 경우
          if (matchCreated) {
            // 포지션 협의가 필요한 경우
            if (matchStatus === "position_discussion") {
              return Response.json(
                {
                  success: true,
                  queued: false,
                  matched: true,
                  match_id: matchmakingResult.match_id,
                  status: "position_discussion",
                  needs_position_discussion: true,
                  message: "포지션 협의가 필요합니다.",
                  matchmaking: matchmakingResult,
                },
                { status: 201 }
              );
            }

            // 자동 포지션 + 팀 배정까지 성공한 경우
            if (matchStatus === "matched") {
              return Response.json(
                {
                  success: true,
                  queued: false,
                  matched: true,
                  match_id: matchmakingResult.match_id,
                  status: "matched",
                  needs_position_discussion: false,
                  message: "매칭이 완료되었습니다.",
                  matchmaking: matchmakingResult,
                },
                { status: 201 }
              );
            }
          }

          // 아직 10명이 안 된 일반적인 대기 상태
          return Response.json(
            {
              success: true,
              message: "매칭 대기열에 등록되었습니다.",
              queued: true,
              matched: false,
              queue,
              matchmaking: matchmakingResult,
            },
            { status: 201 }
          );
        }

        // =====================================================
        // DELETE : 매칭 신청 취소
        // =====================================================

        if (req.method === "DELETE") {
          const { data: existing, error: existingError } =
            await ctx.supabaseAdmin
              .from("match_queue")
              .select("id")
              .eq("user_id", user.id)
              .maybeSingle();

          if (existingError) {
            console.error("Queue fetch error:", existingError);

            return Response.json(
              { error: "매칭 대기 상태를 확인하지 못했습니다." },
              { status: 500 }
            );
          }

          if (!existing) {
            return Response.json(
              { error: "현재 매칭 대기 중이 아닙니다." },
              { status: 404 }
            );
          }

          const { error: deleteError } =
            await ctx.supabaseAdmin
              .from("match_queue")
              .delete()
              .eq("user_id", user.id);

          if (deleteError) {
            console.error("Queue delete error:", deleteError);

            return Response.json(
              { error: "매칭 신청 취소에 실패했습니다." },
              { status: 500 }
            );
          }

          return Response.json(
            {
              success: true,
              message: "매칭 신청이 취소되었습니다.",
              queued: false,
              queue: null,
            },
            { status: 200 }
          );
        }

        return Response.json(
          { error: "허용되지 않은 요청입니다." },
          { status: 405 }
        );
      } catch (error) {
        console.error("Queue function error:", error);

        return Response.json(
          { error: "매칭 대기열 처리 중 오류가 발생했습니다." },
          { status: 500 }
        );
      }
    }
  ),
};
