import { withSupabase } from "jsr:@supabase/server@^1";

Deno.serve(
  withSupabase(
    {
      auth: "user",
    },
    async (req, ctx) => {
      try {
        if (req.method !== "GET") {
          return Response.json(
            {
              success: false,
              message: "GET 요청만 사용할 수 있습니다.",
            },
            { status: 405 },
          );
        }

        const userClaims = ctx.userClaims;



        const userId =
          userClaims?.sub ??
          userClaims?.user_id ??
          userClaims?.id;

        if (!userId) {
          return Response.json(
            {
              success: false,
              message: "로그인 사용자 정보를 확인할 수 없습니다.",
            },
            { status: 401 },
          );
        }

        const { data: profile, error: profileError } =
          await ctx.supabaseAdmin
            .from("profiles")
            .select(`
              username,
              lol_nickname,
              real_name,
              birth_date,
              main_position,
              sub_position,
              role,
              status,
              created_at
            `)
            .eq("user_id", userId)
            .single();

        if (profileError || !profile) {
          console.error("profile error:", profileError);

          return Response.json(
            {
              success: false,
              message: "회원 정보를 찾을 수 없습니다.",
            },
            { status: 404 },
          );
        }

        if (profile.status !== "approved") return Response.json({ error: "승인된 회원만 이용할 수 있습니다." }, { status: 403 });

        const { data: aliases, error: aliasError } = await ctx.supabaseAdmin.from("profile_aliases").select("id,lol_nickname").eq("user_id", userId).order("created_at").order("id");
        const { data: champions, error: championError } = await ctx.supabaseAdmin.rpc("get_most_champions", { p_user_ids: [userId] });
        if (aliasError || championError) throw aliasError || championError;

        const { data: rating, error: ratingError } =
          await ctx.supabaseAdmin
            .from("player_ratings")
            .select(`
              overall_rating,
              top_rating,
              jungle_rating,
              mid_rating,
              adc_rating,
              support_rating,
              games_played,
              wins,
              losses,
              updated_at
            `)
            .eq("user_id", userId)
            .single();

        if (ratingError || !rating) {
          console.error("rating error:", ratingError);

          return Response.json(
            {
              success: false,
              message: "레이팅 정보를 찾을 수 없습니다.",
            },
            { status: 404 },
          );
        }

        const winRate =
          rating.games_played > 0
            ? Math.round(
                (rating.wins / rating.games_played) * 1000,
              ) / 10
            : 0;

        return Response.json({
          success: true,

          profile: {
            aliases: aliases || [],
            username: profile.username,
            lol_nickname: profile.lol_nickname,
            real_name: profile.real_name,
            birth_date: profile.birth_date,
            main_position: profile.main_position,
            sub_position: profile.sub_position,
            role: profile.role,
            status: profile.status,
            created_at: profile.created_at,
          },

          most_champions: champions || [],
          rating: {
            overall_rating: rating.overall_rating,
            top_rating: rating.top_rating,
            jungle_rating: rating.jungle_rating,
            mid_rating: rating.mid_rating,
            adc_rating: rating.adc_rating,
            support_rating: rating.support_rating,
            games_played: rating.games_played,
            wins: rating.wins,
            losses: rating.losses,
            win_rate: winRate,
            updated_at: rating.updated_at,
          },
        });
      } catch (error) {
        console.error("lolex-my-profile error:", error);

        return Response.json(
          {
            success: false,
            message: "내 정보를 불러오는 중 오류가 발생했습니다.",
          },
          { status: 500 },
        );
      }
    },
  ),
);
