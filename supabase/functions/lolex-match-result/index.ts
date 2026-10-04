import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const riotNameKey = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ").split("#")[0];

const editDistance = (left: string, right: string) => {
  const a = [...left];
  const b = [...right];
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
};

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      try {
        // =====================================================
        // 1. 濡쒓렇???뺤씤
        // =====================================================

        const user = ctx.userClaims;

        if (!user) {
          return Response.json(
            { error: "로그인이 필요합니다." },
            { status: 401 }
          );
        }

        // POST留??덉슜
        if (req.method !== "POST") {
          return Response.json(
            { error: "허용되지 않은 요청입니다." },
            { status: 405 }
          );
        }


        // =====================================================
        // 2. 濡쒓렇?명븳 ?뚯썝???꾨줈???뺤씤
        // =====================================================

        const { data: profile, error: profileError } =
          await ctx.supabaseAdmin
            .from("profiles")
            .select("user_id, username, lol_nickname, role, status")
            .eq("user_id", user.id)
            .single();

        if (profileError || !profile) {
          return Response.json(
            { error: "회원 정보를 찾을 수 없습니다." },
            { status: 404 }
          );
        }

        // ?뱀씤???뚯썝?몄? ?뺤씤
        if (profile.status !== "approved") {
          return Response.json(
            { error: "승인된 회원만 이용할 수 있습니다." },
            { status: 403 }
          );
        }

        // =====================================================
        // 3. ?붿껌 ?곗씠???뺤씤
        //
        // {
        //   "match_id": 2,
        //   "winner": "BLUE"
        // }
        // =====================================================

        let body;

        try {
          body = await req.json();
        } catch {
          return Response.json(
            { error: "요청 데이터 형식이 올바르지 않습니다." },
            { status: 400 }
          );
        }

        const matchId = Number(body.match_id);
        const winner = body.winner;
        const captureOutcome = body.capture_outcome;
        const captureUploaderTeam = body.capture_uploader_team;
        const captureGames = body.capture_games;

        if (!Number.isInteger(matchId) || matchId <= 0) {
          return Response.json(
            { error: "올바른 경기 ID가 필요합니다." },
            { status: 400 }
          );
        }

        if (winner !== "BLUE" && winner !== "RED") {
          return Response.json(
            { error: "승리 팀은 BLUE 또는 RED여야 합니다." },
            { status: 400 }
          );
        }

        if (
          !["victory", "defeat"].includes(captureOutcome) ||
          !["BLUE", "RED"].includes(captureUploaderTeam) ||
          !Array.isArray(captureGames) || ![2, 3].includes(captureGames.length) ||
          captureGames.some((game, index) => !game || game.game_number !== index + 1 ||
            !["victory", "defeat"].includes(game.outcome) ||
            !["BLUE", "RED"].includes(game.uploader_team) ||
            !Array.isArray(game.kda) || game.kda.length !== 10 ||
            game.kda.some((row) => !row || typeof row.riotName !== "string" || !row.riotName.trim() ||
              [row.kills, row.deaths, row.assists].some(
                (value) => !Number.isInteger(value) || value < 0 || value > 999)) ||
            new Set(game.kda.map((row) => row.riotName.trim().toLocaleLowerCase())).size !== 10)
        ) {
          return Response.json(
            { error: "각 경기의 승패, 본인 팀, 참가자 10명의 닉네임과 K/D/A를 모두 확인해주세요." },
            { status: 400 }
          );
        }

        const wins = captureGames.filter((game) => game.outcome === "victory").length;
        const losses = captureGames.length - wins;
        const validSeries = captureGames.length === 2
          ? wins === 2 || losses === 2
          : (wins === 2 && losses === 1) || (wins === 1 && losses === 2);
        if (!validSeries || captureOutcome !== (wins === 2 ? "victory" : "defeat")) {
          return Response.json({ error: "3판 2선승 경기 결과가 올바르지 않습니다." }, { status: 400 });
        }
        const blueWins = captureGames.filter((game) =>
          game.outcome === "victory"
            ? game.uploader_team === "BLUE"
            : game.uploader_team === "RED"
        ).length;
        const redWins = captureGames.length - blueWins;
        const expectedWinner = blueWins >= 2 ? "BLUE" : redWins >= 2 ? "RED" : null;

        if (!expectedWinner || winner !== expectedWinner) {
          return Response.json(
            { error: "캡처의 승패와 선택한 팀으로 계산한 최종 경기 결과가 일치하지 않습니다." },
            { status: 400 }
          );
        }
// =====================================================
// ?대떦 寃쎄린 李멸????먮뒗 ?댁쁺吏꾨쭔 寃곌낵 ?뺤젙 媛??// =====================================================

const { data: participant, error: participantError } =
  await ctx.supabaseAdmin
    .from("match_players")
    .select("user_id")
    .eq("match_id", matchId)
    .eq("user_id", profile.user_id)
    .maybeSingle();

if (participantError) {
  console.error(
    "Match participant check error:",
    participantError
  );

  return Response.json(
    { error: "경기 참가 여부를 확인하지 못했습니다." },
    { status: 500 }
  );
}

const isStaff =
  profile.role === "staff" ||
  profile.role === "superadmin";

if (!participant && !isStaff) {
  return Response.json(
    {
      error:
        "해당 경기 참가자 또는 운영진만 경기 결과를 확정할 수 있습니다.",
    },
    { status: 403 }
  );
}

        // =====================================================
        // 4. 寃쎄린 議댁옱 ?щ? ?뺤씤
        // =====================================================

        const { data: match, error: matchError } =
          await ctx.supabaseAdmin
            .from("matches")
            .select("id, status, winner")
            .eq("id", matchId)
            .single();

        if (matchError || !match) {
          return Response.json(
            { error: "경기를 찾을 수 없습니다. 최신 매칭 정보를 다시 불러와주세요.", code: "MATCH_NOT_FOUND" },
            { status: 404 }
          );
        }


        // ?대? 醫낅즺??寃쎄린?쇰㈃ ?ш린??李⑤떒
        if (match.status === "finished") {
          return Response.json(
            {
              success: false,
              already_finished: true,
              match_id: matchId,
              winner: match.winner,
              error: "이미 결과 처리가 완료된 경기입니다.",
            },
            { status: 409 }
          );
        }

        const { data: approvedProfiles, error: rosterError } = await ctx.supabaseAdmin
          .from("profiles")
          .select("user_id,lol_nickname,main_position,profile_aliases(lol_nickname)")
          .eq("status", "approved");
        if (rosterError) return Response.json({ error: "승인된 회원 명단을 확인하지 못했습니다." }, { status: 500 });

        const candidates = (approvedProfiles ?? []).flatMap((item) => [item.lol_nickname, ...(item.profile_aliases ?? []).map((alias) => alias.lol_nickname)]
          .map((riotName) => ({ user_id: item.user_id, riotName, key: riotNameKey(riotName) })));
        const appearances = new Map<string, { user_id: string; team: string; appearances: number }>();
        const mappedGames = [];
        for (const game of captureGames) {
          const uploaderTeam = game.uploader_team;
          const oppositeTeam = uploaderTeam === "BLUE" ? "RED" : "BLUE";
          const seen = new Set<string>();
          const mappedKda = [];
          for (let index = 0; index < game.kda.length; index += 1) {
            const isTruncated = /(?:\.{2,}|…)$/.test(game.kda[index].riotName.trim());
            const rawKey = riotNameKey(game.kda[index].riotName).replace(/(?:\.{2,}|…)+$/, "");
            const found = candidates.filter((candidate) =>
              candidate.key === rawKey || (isTruncated && candidate.key.startsWith(rawKey))
            );
            const uniqueUsers = [...new Set(found.map((candidate) => candidate.user_id))];
            if (uniqueUsers.length !== 1) {
              const suggestions = candidates
                .map((candidate) => ({ ...candidate, distance: editDistance(rawKey, candidate.key) }))
                .filter((candidate) => candidate.distance <= 2)
                .sort((a, b) => a.distance - b.distance)
                .filter((candidate, position, list) =>
                  list.findIndex((item) => item.user_id === candidate.user_id) === position)
                .slice(0, 3)
                .map((candidate) => candidate.riotName);
              const suggestionText = suggestions.length
                ? ` 비슷한 승인 회원: ${suggestions.join(", ")}`
                : "";
              return Response.json({
                error: `${game.game_number}경기 ${index + 1}번째 닉네임 '${game.kda[index].riotName}'과 일치하는 승인 회원을 찾지 못했습니다.${suggestionText} 해당 경기의 닉네임을 다시 확인해주세요.`,
                code: "UNKNOWN_RIOT_NAME",
                game_number: game.game_number,
                row_number: index + 1,
                riot_name: game.kda[index].riotName,
                suggestions,
              }, { status: 400 });
            }
            const userId = uniqueUsers[0];
            if (seen.has(userId)) return Response.json({ error: `${game.game_number}경기에서 같은 회원이 두 번 입력되었습니다. ${index + 1}번째 닉네임을 확인해주세요.` }, { status: 400 });
            seen.add(userId);
            const team = index < 5 ? uploaderTeam : oppositeTeam;
            const previous = appearances.get(userId);
            if (previous && previous.team !== team) return Response.json({ error: `같은 참가자가 경기마다 다른 팀으로 입력되었습니다. ${game.game_number}경기의 본인 팀 선택과 참가자 순서를 확인해주세요.` }, { status: 400 });
            appearances.set(userId, { user_id: userId, team, appearances: (previous?.appearances ?? 0) + 1 });
            mappedKda.push({ ...game.kda[index], user_id: userId, team });
          }
          if (mappedKda[0]?.user_id !== profile.user_id) return Response.json({ error: `${game.game_number}경기의 첫 번째 닉네임이 결과 업로더 본인과 일치하지 않습니다.` }, { status: 400 });
          mappedGames.push({ ...game, kda: mappedKda });
        }
        const seriesPlayers = [...appearances.values()].filter((item) => item.appearances >= 2);
        if (seriesPlayers.length !== 10) return Response.json({ error: `2경기 이상 출전한 최종 참가자가 ${seriesPlayers.length}명입니다. 정확히 10명이 되도록 닉네임을 확인해주세요.` }, { status: 400 });


        // 寃곌낵 ?낅젰 媛?ν븳 ?곹깭?몄? ?뺤씤
        if (
          match.status !== "matched" &&
          match.status !== "in_progress"
        ) {
          return Response.json(
            {
              error: "현재 결과를 입력할 수 없는 경기입니다.",
              status: match.status,
            },
            { status: 409 }
          );
        }


        // =====================================================
        // 5. DB???먯옄??寃쎄린 醫낅즺 ?⑥닔 ?ㅽ뻾
        // =====================================================

        const {
          data: finishResult,
          error: finishError,
        } = await ctx.supabaseAdmin.rpc(
          "finish_match_series_with_players",
          {
            p_match_id: matchId,
            p_winner: winner,
            p_capture_uploader_team: captureUploaderTeam,
            p_capture_games: mappedGames,
            p_series_players: seriesPlayers,
          }
        );

        if (finishError) {
          console.error(
            "Finish match error:",
            finishError
          );

          return Response.json(
            { error: "경기 결과 처리 중 오류가 발생했습니다." },
            { status: 500 }
          );
        }


        // DB ?⑥닔?먯꽌 泥섎━ 嫄곗젅
        if (!finishResult?.success) {
          return Response.json(
            {
              success: false,
              already_finished:
                finishResult?.already_finished ?? false,
              error:
                finishResult?.message ??
                "경기 결과를 처리하지 못했습니다.",
              result: finishResult,
            },
            {
              status:
                finishResult?.already_finished === true
                  ? 409
                  : 400,
            }
          );
        }


        // =====================================================
        // 6. ?뺤긽 ?꾨즺
        // =====================================================

        return Response.json(
          {
            success: true,
            match_id: matchId,
            status: "finished",
            winner,
            message: "경기 결과가 정상적으로 반영되었습니다.",

            rating: {
              blue_team_rating:
                finishResult.blue_team_rating,

              red_team_rating:
                finishResult.red_team_rating,

              blue_rating_change:
                finishResult.blue_rating_change,

              red_rating_change:
                finishResult.red_rating_change,
            },
          },
          { status: 200 }
        );

      } catch (error) {
        console.error(
          "Match result function error:",
          error
        );

        return Response.json(
          { error: "경기 결과 처리 중 오류가 발생했습니다." },
          { status: 500 }
        );
      }
    }
  ),
};
