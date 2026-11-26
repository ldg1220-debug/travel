import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * 서버 렌더와 하이드레이션 첫 렌더에서는 false, 이후 브라우저에서는 true.
 * 브라우저 값(오늘 날짜·시간대·localStorage)에 따라 글자가 달라지는 화면은
 * 이 값이 true 가 된 뒤에만 그려서 React #418(하이드레이션 불일치)을 피한다.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
