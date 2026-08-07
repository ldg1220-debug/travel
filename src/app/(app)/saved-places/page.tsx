import type { Metadata } from "next";
import { SavedPlacesPage } from "./SavedPlacesClient";

export const metadata: Metadata = {
  title: "관심 장소 - 트레쥴",
  description: "저장해둔 관심 장소를 폴더별로 모아보고 바로 일정에 추가하세요.",
};

export default function Page() {
  return <SavedPlacesPage />;
}
