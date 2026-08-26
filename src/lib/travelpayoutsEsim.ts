/**
 * 트래블페이아웃(Travelpayouts) eSIM 제휴 링크 — 작업지시서(2026-08-26,
 * "검색 카테고리 분류 개선 + 트래블페이아웃 제휴 링크 형식") A장. 대시보드
 * 링크 생성기로 직접 만들어 확보한 값만 쓴다(추측 금지 — 트립닷컴 keyword
 * 파라미터 때의 실수를 반복하지 않는다).
 *
 * 링크 템플릿: https://tp.media/r?campaign_id={C}&marker=765548&p={P}&
 * sub_id={PLACEMENT}&trs=563085&u={ENCODED_URL}
 *   - marker(계정)·trs(프로젝트 트래픽 소스)는 전 프로그램 공통.
 *   - campaign_id/p는 프로그램별 고유값.
 *   - sub_id는 자유 지정 — 이 앱에서는 배치 식별자로 쓴다(호출부에서 전달).
 *   - u는 실제로 임의 목적지 URL을 받는다(실측 확인, 오사카 Klook 도시
 *     페이지로 직접 생성해 검증됨). 여기서는 각 서비스의 공식 홈페이지만
 *     쓴다 — 국가별 eSIM 상세 페이지 슬러그는 트립닷컴 cityId·Klook 도시
 *     슬러그와 같은 종류의 "검증 없인 조합 불가" 값이라, 실제로 확인하지
 *     않은 슬러그를 지어 붙이지 않는다(작업지시서 8번 항목으로 별도 분리).
 */
const TP_MARKER = "765548";
const TP_TRS = "563085";

interface EsimProviderDef {
  key: "airalo" | "yesim";
  label: string;
  brand: string;
  /** 참고용 요율 표기 — 링크 자체에는 안 들어간다. */
  rateLabel: string;
  campaignId: string;
  p: string;
  /** 목적지 홈페이지. */
  homepage: string;
}

const ESIM_PROVIDERS: EsimProviderDef[] = [
  // airalo.com 그대로 두면 됨 — 작업지시서(2026-08-26, "지역 페이지 본체
  // 설계") 1항이 end-to-end로 확인: 방문 시 /ko로 자동 전환됨.
  { key: "airalo", label: "Airalo", brand: "#182233", rateLabel: "eSIM 12%", campaignId: "541", p: "8310", homepage: "https://www.airalo.com/" },
  // ⚠️ yesim.app이 아니라 yesim.tech/ko/ — 이전 버전은 WebSearch로 찾은
  // yesim.app을 썼는데, 작업지시서가 실제로 클릭까지 해서(end-to-end)
  // yesim.app은 영어/USD로 열리고, 트래블페이아웃에 제휴 등록된 도메인은
  // yesim.tech라는 걸 확인했다 — 등록 도메인이 아닌 곳으로 보내면
  // 어트리뷰션이 깨질 수 있다는 지적. yesim.tech의 hreflang="ko"가
  // yesim.app을 가리키는 것도 확인했지만(다른 도메인이라 그것도 안 씀)
  // 그 이유로 yesim.tech/ko/(같은 도메인의 한국어 경로, 한국어·추적
  // 파라미터 정상 부착 확인됨)를 쓴다.
  { key: "yesim", label: "Yesim", brand: "#00b894", rateLabel: "eSIM 최대 18%", campaignId: "224", p: "5998", homepage: "https://yesim.tech/ko/" },
];

export interface EsimLink {
  key: "airalo" | "yesim";
  label: string;
  brand: string;
  rateLabel: string;
  url: string;
}

/** `subId`는 클릭 배치 식별자(예: "course_esim") — 트래블페이아웃 리포트와 자체 계측(logLodgingCtaEvent)을 대조할 때 쓴다. */
export function esimAffiliateLinks(subId: string): EsimLink[] {
  return ESIM_PROVIDERS.map(({ campaignId, p, homepage, ...rest }) => ({
    ...rest,
    url: `https://tp.media/r?campaign_id=${campaignId}&marker=${TP_MARKER}&p=${p}&sub_id=${encodeURIComponent(subId)}&trs=${TP_TRS}&u=${encodeURIComponent(homepage)}`,
  }));
}
