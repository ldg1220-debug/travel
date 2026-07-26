import { Pool } from "pg";

// Reuse one pool across dev HMR reloads instead of opening a new one per
// module re-evaluation (same pattern commonly used for Prisma singletons).
declare global {
  var __pgPool: Pool | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // 서버리스 환경에선 동시에 뜨는 함수 인스턴스마다 이 풀이 하나씩 생긴다 —
    // 기본값(max 10, 무제한 idle)으로 두면 인스턴스가 여러 개 뜰 때 관리형
    // Postgres의 커넥션 한도를 쉽게 넘길 수 있다. 인스턴스당 상한을 낮추고,
    // 안 쓰는 연결은 빨리 반납하고, 풀이 꽉 찼을 때 무한 대기 대신 빠르게
    // 실패해 요청이 조용히 멈추는 대신 에러로 드러나게 한다.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}
