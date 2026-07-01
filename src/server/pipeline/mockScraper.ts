import type { RawSnsPost } from "./types";

/**
 * Step 1 — Data collection.
 *
 * In production this is a Node.js crawler (Cheerio/Puppeteer) polling
 * Instagram/TikTok hashtags on a schedule. Standing that up needs live
 * credentials this environment doesn't have, so this module returns a fixed
 * batch of posts shaped exactly like what the crawler would hand off, which
 * keeps the rest of the pipeline (filters → LLM check → Places mapping → DB)
 * fully runnable and testable end to end.
 */
export async function scrapeMockSnsPosts(): Promise<RawSnsPost[]> {
  return [
    {
      id: "sns-1",
      platform: "instagram",
      caption: "교토 니시키 티하우스 내돈내산 후기! 말차라떼 진짜 진하고 좋았어요 영수증 리뷰 남깁니다",
      hashtags: ["교토맛집", "니시키티하우스", "내돈내산"],
      placeNameGuess: "Nishiki Teahouse",
      category: "Cafe",
    },
    {
      id: "sns-2",
      platform: "instagram",
      caption: "폰토초 야키토리 골목 협찬으로 초대받아 다녀왔습니다! 소정의 원고료를 지원받아 작성된 리뷰예요",
      hashtags: ["폰토초", "야키토리", "협찬"],
      placeNameGuess: "Pontocho Yakitori Alley",
      category: "Restaurant",
    },
    {
      id: "sns-3",
      platform: "tiktok",
      caption: "아라시야마 대나무숲 산책 내돈내산 인생샷 스팟, 아침 일찍 가야 사람이 없어요",
      hashtags: ["아라시야마", "대나무숲", "내돈내산"],
      placeNameGuess: "Arashiyama Bamboo Walk",
      category: "Park",
    },
    {
      id: "sns-4",
      platform: "instagram",
      caption: "디너의여왕 픽 맛집이라길래 가봤어요, 제공받아 촬영한 콘텐츠입니다",
      hashtags: ["교토맛집", "디너의여왕"],
      placeNameGuess: "Gion Kaiseki House",
      category: "Restaurant",
    },
    {
      id: "sns-5",
      platform: "tiktok",
      caption: "기요미즈데라 야경 전망대 내돈내산으로 다녀왔어요, 영수증 리뷰까지 남겨요 티켓값 실화냐",
      hashtags: ["기요미즈데라", "야경", "내돈내산"],
      placeNameGuess: "Kiyomizu Night Overlook",
      category: "Viewpoint",
    },
    {
      id: "sns-6",
      platform: "instagram",
      caption: "좋아요 눌러주세요 팔로우 환영",
      hashtags: ["교토여행"],
      placeNameGuess: "Unknown Spot",
      category: "Cafe",
    },
    {
      id: "sns-7",
      platform: "instagram",
      caption: "비와코 호수 보트하우스 내돈내산 다녀왔어요, 영수증 리뷰 첨부합니다. 노을이 예술이에요",
      hashtags: ["비와코", "보트투어", "내돈내산"],
      placeNameGuess: "Biwako Boathouse",
      category: "Harbor",
    },
    {
      id: "sns-8",
      platform: "tiktok",
      caption: "이 가게는 소정의 원고료를 받고 작성되었습니다, 광고 문구 포함",
      hashtags: ["교토카페"],
      placeNameGuess: "Sponsored Cafe",
      category: "Cafe",
    },
  ];
}
