"use client";

import { motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface PhotoLightboxProps {
  images: string[];
  index: number;
  alt?: string;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/**
 * Full-screen photo viewer for a plain list of image URLs — uploaded
 * review/trip-post photos, tapped from a thumbnail gallery. Same
 * interaction pattern as PlaceDetailOverlay's Google-Places-photo lightbox,
 * generalized to take direct URLs instead of a Places `photoName`.
 */
export function PhotoLightbox({ images, index, alt = "", onClose, onNavigate }: PhotoLightboxProps) {
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  return (
    <motion.div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={18} />
      </button>

      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
          aria-label="이전 사진"
          className="absolute left-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
      <img
        src={images[index]}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain"
      />

      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
          aria-label="다음 사진"
          className="absolute right-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
        >
          <ChevronRight size={20} />
        </button>
      )}

      {images.length > 1 && (
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white">
          {index + 1} / {images.length}
        </span>
      )}
    </motion.div>
  );
}
