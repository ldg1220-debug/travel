/**
 * /discover 큐레이션 스팟(discoverData.ts)의 고정 이미지 출처 기록.
 * 작업지시서 2026-11-24 #382 ③ — 이미지는 저장소 public/discover/spots/{id}.webp 에 두고,
 * 여기에는 "이미지가 있는 스팟만" 넣는다. 재사용 허가가 분명한 출처(위키미디어 공용
 * CC BY / CC BY-SA / CC0 / 퍼블릭 도메인, 한국관광공사 공공누리 1유형)만 허용한다.
 * 채우는 방법: npx tsx scripts/fetch-discover-spot-images.mjs  (이 객체 리터럴을 갱신한다)
 */
import type { DiscoverSpot } from "./discoverData";

export interface DiscoverSpotImage {
  /** 사이트 루트 기준 경로 — /discover/spots/{id}.webp */
  src: string;
  /** 저작자 표시 */
  credit: string;
  /** 라이선스명 (예: "CC BY-SA 4.0") */
  license: string;
  /** 원본 페이지 링크 */
  sourceUrl: string;
}

export const DISCOVER_SPOT_IMAGES: Record<string, DiscoverSpotImage> = {
  "d-f1": {
    "src": "/discover/spots/d-f1.webp",
    "credit": "Basile Morin",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Front_view_of_the_Imperial_Throne_Hall_Geunjeongjeon_at_Gyeongbokgung_Palace_with_blue_sky_in_Seoul.jpg"
  },
  "d-f2": {
    "src": "/discover/spots/d-f2.webp",
    "credit": "Basile Morin",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Hydrangea_macrophylla_in_front_of_Seongsan_Ilchulbong_volcano_at_blue_hour_in_Jeju_Island_South_Korea.jpg"
  },
  "d-f4": {
    "src": "/discover/spots/d-f4.webp",
    "credit": "Basile Morin",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Colorful_houses_in_Gamcheon_Culture_Village_at_sunset_in_Busan_South_Korea.jpg"
  },
  "d-f5": {
    "src": "/discover/spots/d-f5.webp",
    "credit": "Basile Morin",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Bulguksa_temple_entrance_gate_stairs_flower_bed_and_blue_sky_in_Gyeongju_South_Korea.jpg"
  },
  "d-f6": {
    "src": "/discover/spots/d-f6.webp",
    "credit": "Basile Morin",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sunset_over_the_Tumuli_Park_in_Gyeongju_Historic_Site_Wolseong_District_South_Korea.jpg"
  },
  "d-t11": {
    "src": "/discover/spots/d-t11.webp",
    "credit": "by Junho Jung at Flickr from South Korea",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Korea-Tongyeong-Dongpirang_Village-10.jpg"
  },
  "d-t12": {
    "src": "/discover/spots/d-t12.webp",
    "credit": "Leeyj0401",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Gwangalli_Beach_in_Busan.jpg"
  },
  "d-t13": {
    "src": "/discover/spots/d-t13.webp",
    "credit": "Ken Eckert",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Songdo_Convensia_and_Central_Park_View.jpg"
  },
  "d-t8": {
    "src": "/discover/spots/d-t8.webp",
    "credit": "Bernard Gagnon",
    "license": "CC0 / Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Jeonju_Hanok_Maeul_02.jpg"
  },
  "o-ca1": {
    "src": "/discover/spots/o-ca1.webp",
    "credit": "Dietmar Rabich",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Vancouver_(BC,_Canada),_Stanley_Park_--_2022_--_1981.jpg"
  },
  "o-es1": {
    "src": "/discover/spots/o-es1.webp",
    "credit": "Alvesgaspar",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sagrada_Familia_March_2015-10a.jpg"
  },
  "o-es2": {
    "src": "/discover/spots/o-es2.webp",
    "credit": "Bernard Gagnon",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Park_G%C3%BCell_02.jpg"
  },
  "o-f1": {
    "src": "/discover/spots/o-f1.webp",
    "credit": "Martin Falbisoner",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Osaka_Castle_Outer_Moat_and_Osaka_Business_Park,_November_2016.jpg"
  },
  "o-f3": {
    "src": "/discover/spots/o-f3.webp",
    "credit": "Vyacheslav Argenberg",
    "license": "CC BY 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Hanoi,_Vietnam,_Hoan_Kiem_Lake.jpg"
  },
  "o-fr1": {
    "src": "/discover/spots/o-fr1.webp",
    "credit": "Jorge Royan",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Paris_-_The_Eiffel_Tower_in_spring_-_2307.jpg"
  },
  "o-fr2": {
    "src": "/discover/spots/o-fr2.webp",
    "credit": "Benh LIEU SONG (Flickr)",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Louvre_Museum_Wikimedia_Commons.jpg"
  },
  "o-fr3": {
    "src": "/discover/spots/o-fr3.webp",
    "credit": "Terragio67",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Basilique_du_Sacr%C3%A9-C%C5%93ur_de_Montmartre_-_Paris_-_GT-01_-_2024.jpg"
  },
  "o-it1": {
    "src": "/discover/spots/o-it1.webp",
    "credit": "Diliff",
    "license": "CC BY-SA 2.5",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Colosseum_in_Rome-April_2007-1-_copie_2B.jpg"
  },
  "o-it2": {
    "src": "/discover/spots/o-it2.webp",
    "credit": "Wilfredor",
    "license": "CC0 / Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Fontaine_Trevi_-_Rome.jpg"
  },
  "o-t1": {
    "src": "/discover/spots/o-t1.webp",
    "credit": "Sakaori (talk)",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Neon_sign_of_Dotonbori_daytime.JPG"
  },
  "o-t12": {
    "src": "/discover/spots/o-t12.webp",
    "credit": "Thomas Hirsch / User:Ravn",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Halong_Bay_in_Vietnam.jpg"
  },
  "o-t5": {
    "src": "/discover/spots/o-t5.webp",
    "credit": "Benh LIEU SONG (Flickr)",
    "license": "CC BY-SA 2.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Tokyo_Shibuya_Scramble_Crossing_2018-10-09.jpg"
  },
  "o-t6": {
    "src": "/discover/spots/o-t6.webp",
    "credit": "Basile Morin",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine,_Kyoto,_Japan.jpg"
  },
  "o-t9": {
    "src": "/discover/spots/o-t9.webp",
    "credit": "Jpatokal",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:My_Khe_Beach_Danang_Highrises.jpg"
  },
  "o-th1": {
    "src": "/discover/spots/o-th1.webp",
    "credit": "Diego Delso",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Templo_Wat_Arun,_Bangkok,_Tailandia,_2013-08-22,_DD_30.jpg"
  },
  "o-tw1": {
    "src": "/discover/spots/o-tw1.webp",
    "credit": "CEphoto, Uwe Aranas",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Taipei_Taiwan_Taipei-101-Tower-01.jpg"
  },
  "o-uk1": {
    "src": "/discover/spots/o-uk1.webp",
    "credit": "Colin",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Big_Ben_at_sunset_-_2014-10-27_17-30.jpg"
  },
  "o-uk2": {
    "src": "/discover/spots/o-uk2.webp",
    "credit": "Diliff",
    "license": "CC BY-SA 3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Buckingham_Palace,_London_-_April_2009.jpg"
  },
  "o-us1": {
    "src": "/discover/spots/o-us1.webp",
    "credit": "Anthony Quintano",
    "license": "CC BY 2.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Times_Square_Ball_from_above.jpg"
  },
  "o-us2": {
    "src": "/discover/spots/o-us2.webp",
    "credit": "Jet Lowe",
    "license": "CC0 / Public domain",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Central_Park_New_York_City_New_York_23_cropped.jpg"
  },
  "o-us4": {
    "src": "/discover/spots/o-us4.webp",
    "credit": "Frank Schulenburg",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_as_seen_from_Marshall%E2%80%99s_Beach,_March_2018.jpg"
  },
  "o-us5": {
    "src": "/discover/spots/o-us5.webp",
    "credit": "Dietmar Rabich",
    "license": "CC BY-SA 4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:San_Francisco_(CA,_USA),_Fisherman%27s_Wharf,_Liebesschl%C3%B6sser_--_2022_--_2873.jpg"
  }
};

/** 큐레이션 스팟의 고정 이미지. 없거나 라이브(live:) 스팟이면 undefined — 호출부는 아이콘 타일을 보인다. */
export function getDiscoverSpotImage(spot: Pick<DiscoverSpot, "id">): DiscoverSpotImage | undefined {
  if (spot.id.startsWith("live:")) return undefined;
  return Object.hasOwn(DISCOVER_SPOT_IMAGES, spot.id) ? DISCOVER_SPOT_IMAGES[spot.id] : undefined;
}

/** 라이브 스팟만 spot-photo 프록시로 조회한다. 큐레이션 스팟은 항상 null(Google 호출 없음). */
export function spotCardPhotoSrc(spot: Pick<DiscoverSpot, "id" | "name" | "region">): string | null {
  if (!spot.id.startsWith("live:")) return getDiscoverSpotImage(spot)?.src ?? null;
  return `/api/discover/spot-photo?q=${encodeURIComponent(`${spot.name} ${spot.region.split(" · ").join(" ")}`)}`;
}
