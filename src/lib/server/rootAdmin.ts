/**
 * "루트 관리자" — 다른 계정에 관리자 권한을 부여/회수할 수 있는 유일한
 * 계정. 일반 관리자(isAdmin)는 신고 처리·정지·대시보드 열람은 할 수
 * 있지만, 누구를 관리자로 만들지는 못한다 — 그렇지 않으면 부관리자 한
 * 명이 뚫려도 전체 권한 구조가 연쇄적으로 뚫릴 수 있기 때문.
 *
 * schema.sql이 이 계정에 isAdmin=true를 부여하는 것과 같은 이메일이다 —
 * 두 곳이 어긋나면 "최초 관리자 계정 자체가 관리자를 못 만드는" 상황이
 * 생기므로 절대 따로 관리하지 않는다.
 */
const ROOT_ADMIN_EMAIL = "ldg1220@naver.com";

export function isRootAdmin(email: string | null | undefined): boolean {
  return email === ROOT_ADMIN_EMAIL;
}
