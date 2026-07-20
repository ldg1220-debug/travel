"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

// Plain Unicode emoji characters only — no bundled emoji images/fonts of our
// own. Every glyph below is drawn from the standard Unicode emoji set and
// rendered by whatever emoji font the visitor's own OS/browser ships
// (Apple Color Emoji, Noto Color Emoji, etc.), so there's no licensing/
// copyright exposure on our side, unlike shipping a third-party emoji/
// sticker image pack would be.
interface EmojiCategory {
  key: string;
  label: string;
  icon: string;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: "smileys",
    label: "표정",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
      "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨",
      "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢",
      "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁",
      "☹️", "😮", "😯", "😲", "😳", "🥺", "🥹", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖",
      "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡",
      "👻", "👽", "👾", "🤖", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾",
    ],
  },
  {
    key: "gestures",
    label: "제스처",
    icon: "👋",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆",
      "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🙏", "✍️", "💅",
      "🤳", "💪", "👂", "👃", "👀", "👁️", "👅", "👄", "👶", "🧒", "👦", "👧", "🧑", "👨", "👩", "🧓",
      "👴", "👵", "🤵", "👰", "🤰", "🤱", "🎅", "🤶", "🦸", "🦹", "🧙", "🧚", "🧛", "🧜", "🧝", "💆",
      "💇", "🚶", "🏃", "💃", "🕺", "🧘", "👫", "👬", "👭", "💑", "💏", "👪", "🗣️", "👤", "👥",
    ],
  },
  {
    key: "animals",
    label: "동물",
    icon: "🐶",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵",
      "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗",
      "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦗", "🕷️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕",
      "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓",
      "🦍", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🐃", "🐂", "🐄", "🐎", "🐖", "🐑", "🦙", "🐐", "🦌",
      "🐕", "🐩", "🐈", "🐓", "🦃", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦡", "🦦", "🦥", "🐁",
      "🐀", "🐿️", "🦔",
    ],
  },
  {
    key: "nature",
    label: "자연",
    icon: "🌿",
    emojis: [
      "🌵", "🎄", "🌲", "🌳", "🌴", "🌱", "🌿", "☘️", "🍀", "🍃", "🍂", "🍁", "🍄", "🌾", "💐", "🌷",
      "🌹", "🌺", "🌸", "🌼", "🌻", "🌞", "🌝", "🌛", "🌜", "🌚", "🌕", "🌖", "🌗", "🌘", "🌑", "🌒",
      "🌓", "🌔", "🌙", "🌎", "🌍", "🌏", "⭐", "🌟", "✨", "⚡", "☄️", "🔥", "🌈", "☀️", "⛅", "☁️",
      "⛈️", "❄️", "⛄", "💨", "💧", "💦", "☔", "🌊",
    ],
  },
  {
    key: "food",
    label: "음식",
    icon: "🍔",
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥",
      "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐",
      "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🌭", "🍔",
      "🍟", "🍕", "🥪", "🌮", "🌯", "🥙", "🧆", "🥗", "🥘", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟",
      "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮",
      "🍭", "🍬", "🍫", "🍿", "🧂", "🥜", "🍯", "🥛", "🍼", "☕", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺",
      "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾", "🥄", "🍴", "🍽️",
    ],
  },
  {
    key: "travel",
    label: "여행",
    icon: "✈️",
    emojis: [
      "✈️", "🛫", "🛬", "🚀", "🚁", "🛶", "⛵", "🚤", "🛳️", "⛴️", "🚢", "🚗", "🚕", "🚙", "🚌", "🚎",
      "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚", "🚛", "🚜", "🏍️", "🛵", "🚲", "🛴", "🚂", "🚆", "🚄", "🚅",
      "🚈", "🚝", "🚋", "🚃", "🚠", "🚡", "🛰️", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡", "🎢", "🎠", "⛲",
      "⛱️", "🏖️", "🏝️", "🏔️", "⛰️", "🌋", "🗻", "🏕️", "⛺", "🏠", "🏡", "🏘️", "🏙️", "🌆", "🌇", "🌃",
      "🌉", "🌌", "🗿", "🏛️", "⛪", "🕌", "🛕", "⛩️", "🎪", "🚉", "🗺️", "🧭", "🛄", "🛅", "🧳",
    ],
  },
  {
    key: "objects",
    label: "활동·사물",
    icon: "🎮",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥅", "🏒", "🏑", "🏏", "🎣",
      "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "🏂", "🏋️", "🤸", "🏌️", "🏇", "🏄",
      "🏊", "🚣", "🚴", "🎯", "🎮", "🕹️", "🎲", "🧩", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁",
      "🎷", "🎺", "🎸", "🎻", "📷", "📸", "🎥", "💻", "⌨️", "🖥️", "📱", "☎️", "💡", "🔦", "📚", "📖",
      "💰", "💴", "💵", "💳", "💎", "🔧", "🔨", "⚙️", "🚪", "🛏️", "🛋️", "🚽", "🚿", "🛁", "🧴", "🧹",
      "🧺", "🧻", "🧼", "🛒",
    ],
  },
  {
    key: "symbols",
    label: "기호",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💞", "💓", "💗", "💖", "💘",
      "💝", "💟", "✅", "❌", "❓", "❗", "‼️", "⁉️", "💯", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚪",
      "⚫", "🔺", "🔻", "✔️", "➕", "➖", "➗", "✖️", "♻️", "⚠️", "🚫", "🔞", "📵", "🆗", "🆕", "🆒",
      "🆓", "🔝", "🔥", "💤", "💢", "💥", "💫", "💦", "💨",
    ],
  },
  {
    key: "flags",
    label: "국기",
    icon: "🏳️",
    emojis: [
      "🇰🇷", "🇯🇵", "🇨🇳", "🇺🇸", "🇬🇧", "🇫🇷", "🇩🇪", "🇮🇹", "🇪🇸", "🇵🇹", "🇹🇭", "🇻🇳", "🇸🇬", "🇦🇺", "🇨🇦", "🇧🇷",
      "🇮🇳", "🇷🇺", "🇹🇼", "🇭🇰", "🇵🇭", "🇮🇩", "🇲🇾", "🇳🇿", "🇳🇱", "🇨🇭", "🇸🇪", "🇳🇴", "🇫🇮", "🇩🇰", "🇬🇷", "🇹🇷",
      "🇦🇪", "🇲🇽", "🇦🇷",
    ],
  },
];

const RECENT_KEY = "tradule:recent-emoji";
const MAX_RECENT = 24;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(emojis: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(emojis));
  } catch {
    // localStorage unavailable (private mode, quota) — recent tab just stays empty next time.
  }
}

/** Bottom-sheet emoji grid, same visual pattern as ReportModal/PlaceReviewEditSheet (backdrop + rounded-t-3xl panel) for consistency with the rest of the app's popups. */
function EmojiPickerSheet({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [activeKey, setActiveKey] = useState(EMOJI_CATEGORIES[0].key);

  const categories = useMemo(
    () => (recent.length > 0 ? [{ key: "recent", label: "최근", icon: "🕓", emojis: recent }, ...EMOJI_CATEGORIES] : EMOJI_CATEGORIES),
    [recent],
  );
  const active = categories.find((c) => c.key === activeKey) ?? categories[0];

  const handlePick = (emoji: string) => {
    onSelect(emoji);
    const next = [emoji, ...loadRecent().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    saveRecent(next);
    setRecent(next);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[62vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">이모지</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto px-3 pb-2">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveKey(c.key)}
              aria-pressed={active.key === c.key}
              aria-label={c.label}
              title={c.label}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base transition-colors ${
                active.key === c.key ? "bg-indigo-100 dark:bg-indigo-500/20" : "hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {c.icon}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-0.5 overflow-y-auto px-3 pb-4">
          {active.emojis.map((emoji, i) => (
            <button
              key={`${active.key}-${emoji}-${i}`}
              type="button"
              onClick={() => handlePick(emoji)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Drop-in trigger button — opens the emoji sheet, calls `onSelect(emoji)` on tap, closes only via backdrop/X (so a user can add several emoji in a row). */
export function EmojiPickerButton({ onSelect, className }: { onSelect: (emoji: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="이모지 추가"
        className={className ?? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}
      >
        🙂
      </button>
      {open && <EmojiPickerSheet onSelect={onSelect} onClose={() => setOpen(false)} />}
    </>
  );
}
