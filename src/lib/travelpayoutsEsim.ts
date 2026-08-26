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
  /** 공식 홈페이지. WebSearch로 교차 확인(Wikipedia·공식 앱스토어 리스팅
   * 등 복수 출처)한 값 — 이 샌드박스의 네트워크 정책상 직접 fetch로
   * 재확인은 못 했다(egress 차단). Trip.com cityId 같은 내부 전용 값이
   * 아니라 공개적으로 잘 알려진 회사 최상위 도메인이라 위험도가 낮다고
   * 판단했다. */
  homepage: string;
}

const ESIM_PROVIDERS: EsimProviderDef[] = [
  { key: "airalo", label: "Airalo", brand: "#182233", rateLabel: "eSIM 12%", campaignId: "541", p: "8310", homepage: "https://www.airalo.com/" },
  { key: "yesim", label: "Yesim", brand: "#00b894", rateLabel: "eSIM 최대 18%", campaignId: "224", p: "5998", homepage: "https://yesim.app/" },
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
