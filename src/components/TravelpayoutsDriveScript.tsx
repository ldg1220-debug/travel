import { travelpayoutsDriveInlineScript } from "@/lib/travelpayoutsDrive";

/**
 * 제휴 링크가 항상 있는 페이지(예: /discover, /course)에 넣는 서버
 * 컴포넌트 — 자세한 배경은 travelpayoutsDrive.ts 참고. 서버 컴포넌트라
 * SSR된 초기 HTML에 그대로 실려 하이드레이션을 기다리지 않고 실행된다.
 * `<head>`에 넣을 필요는 없다 — async라 문서 어디에 있든 실행 시점은
 * 같다.
 */
export function TravelpayoutsDriveScript() {
  return <script dangerouslySetInnerHTML={{ __html: travelpayoutsDriveInlineScript() }} />;
}
