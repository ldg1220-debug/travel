import { redirect } from "next/navigation";

/** 관리자 지정은 이제 /admin 대시보드의 탭으로 합쳐졌다 — 예전 링크만 이어준다. */
export default function AdminUsersRedirectPage() {
  redirect("/admin?tab=users");
}
