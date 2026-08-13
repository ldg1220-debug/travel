import { pool } from "./db";

export interface FeatureEventInput {
  userId: number | null;
  sessionId: string;
  event: string;
  surface?: string | null;
  props?: Record<string, unknown>;
}

/**
 * 기능 사용 이벤트 1건 적재. 계측 실패가 실제 기능(코스 생성 등)을 막으면
 * 안 되므로 호출부는 전부 fire-and-forget으로 쓰고, 여기서 에러를 삼킨다
 * (courseRecommend.ts의 캐시 read/write와 같은 태도 — 계측/캐시는
 * 최적화·부가기능이지 핵심 경로가 아니다).
 */
export async function logFeatureEvent(input: FeatureEventInput): Promise<void> {
  try {
    await pool.query(
      `insert into feature_events ("userId", session_id, event, surface, props)
       values ($1, $2, $3, $4, $5)`,
      [input.userId, input.sessionId, input.event, input.surface ?? null, JSON.stringify(input.props ?? {})],
    );
    // place_candidate_cache와 같은 패턴 — 별도 크론 없이 쓰기 경로에서
    // 가끔(5%) 오래된 행을 청소한다. 90일 — #168 이슈에 적은 보관
    // 정책(지난 분기 퍼널·품질 지표 계산엔 충분, 그 이상은 admin
    // 대시보드가 굳이 개별 조회하지 않음 — 필요해지면 별도 일별 롤업
    // 테이블을 그때 추가).
    if (Math.random() < 0.05) {
      pool.query(`delete from feature_events where created_at < now() - interval '90 days'`).catch((err) => {
        console.error("[featureEvents] cleanup failed:", err);
      });
    }
  } catch (err) {
    console.error("[featureEvents] insert failed:", err);
  }
}
