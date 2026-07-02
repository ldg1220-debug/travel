export interface RawSnsPost {
  id: string;
  platform: "instagram" | "tiktok";
  caption: string;
  hashtags: string[];
  /** Best-effort place name extracted from the caption, still needs Places lookup. */
  placeNameGuess: string;
  category: string;
}

export interface ResolvedPlace {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
}

export interface PipelineSummary {
  scraped: number;
  passedRegexFilter: number;
  passedLlmVerification: number;
  saved: number;
}
