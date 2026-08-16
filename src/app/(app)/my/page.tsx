import type { Metadata } from "next";
import MyClient from "./MyClient";

export const metadata: Metadata = {
  title: "MY - 트레쥴",
  description: "프로필, 메시지, 내 후기, 보관함, 설정을 한 곳에서 관리하세요.",
};

export default function Page() {
  return <MyClient />;
}
