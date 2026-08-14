// Tradule Redesign — Design Tokens
// Palette anchored on the logo gradient (orange -> pink), with a warm ink
// system for text/backgrounds. Meant to feel "warm & travel" while still
// pro-tool clean.

const T = {
  // brand
  brand: {
    orange: '#FF8A3D',
    pink: '#FF4D8D',
    gradient: 'linear-gradient(90deg, #FF8A3D 0%, #FF4D8D 100%)',
    gradientSoft: 'linear-gradient(135deg, #FFE9D6 0%, #FFDCE7 100%)',
  },
  // surfaces (warm)
  bg: '#FAF7F2',        // page background
  surface: '#FFFFFF',   // card
  surfaceAlt: '#F3EEE6',// muted card / input
  hairline: '#EAE3D6',  // border
  hairlineSoft: '#F1EBDF',
  // ink
  ink: '#1A1512',
  ink2: '#4A423B',
  ink3: '#8A7F72',
  ink4: '#B8AD9F',
  // functional
  success: '#2E8B57',
  info: '#3A6EA5',
  warn: '#D8853A',
  danger: '#C64A3B',
  // shadow
  shadowCard: '0 1px 2px rgba(26,21,18,0.04), 0 8px 24px rgba(26,21,18,0.06)',
  shadowRaised: '0 2px 6px rgba(26,21,18,0.08), 0 20px 48px rgba(26,21,18,0.10)',
  // typography
  fontSans: '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif',
  fontSerif: '"Instrument Serif", "Iowan Old Style", "Palatino", serif',
  fontMono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
};

// tiny sparkline / hairline SVG placeholder for imagery
function ImgPlaceholder({ w = '100%', h = 160, label = 'photo', radius = 12, tone = 'warm' }) {
  const bg = tone === 'warm' ? '#F3EEE6' : '#EEF2F5';
  const stripe = tone === 'warm' ? '#EAE3D6' : '#DCE3E8';
  const ink = tone === 'warm' ? '#8A7F72' : '#697782';
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      background: `repeating-linear-gradient(135deg, ${bg}, ${bg} 8px, ${stripe} 8px, ${stripe} 9px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.fontMono, fontSize: 11, color: ink, letterSpacing: '0.02em',
      border: `1px solid ${T.hairlineSoft}`,
      flex: 'none',
    }}>
      {label}
    </div>
  );
}

// Simple stroke icons (inline SVG so nothing external)
function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.6 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'search': return (<svg {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    case 'map':    return (<svg {...p}><path d="M9 3 3 5.5v15L9 18l6 2.5 6-2.5v-15L15 5.5z"/><path d="M9 3v15M15 5.5v15"/></svg>);
    case 'pin':   return (<svg {...p}><path d="M12 22s-7-7.5-7-13a7 7 0 0 1 14 0c0 5.5-7 13-7 13Z"/><circle cx="12" cy="9" r="2.5"/></svg>);
    case 'clock':  return (<svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
    case 'plus':   return (<svg {...p}><path d="M12 5v14M5 12h14"/></svg>);
    case 'heart':  return (<svg {...p}><path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9Z"/></svg>);
    case 'star':   return (<svg {...p}><path d="m12 3 2.7 5.6 6.3.9-4.5 4.3 1 6.2L12 17l-5.5 3 1-6.2L3 9.5l6.3-.9z"/></svg>);
    case 'users':  return (<svg {...p}><circle cx="9" cy="9" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="8" r="2.5"/><path d="M15 20a6 6 0 0 1 7-5.5"/></svg>);
    case 'sparkle':return (<svg {...p}><path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/></svg>);
    case 'arrow-r':return (<svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>);
    case 'arrow-l':return (<svg {...p}><path d="M19 12H5M11 6l-6 6 6 6"/></svg>);
    case 'menu':   return (<svg {...p}><path d="M4 6h16M4 12h16M4 18h16"/></svg>);
    case 'bell':   return (<svg {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>);
    case 'chat':   return (<svg {...p}><path d="M4 5h16v11H8l-4 3z"/></svg>);
    case 'grid':   return (<svg {...p}><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>);
    case 'list':   return (<svg {...p}><path d="M4 6h16M4 12h16M4 18h16"/></svg>);
    case 'walk':   return (<svg {...p}><circle cx="13" cy="4" r="1.6"/><path d="M9 21l2-6-3-3 1-5 4 2 3 4M14 21l-1-5"/></svg>);
    case 'car':    return (<svg {...p}><path d="M5 16v-4l2-4h10l2 4v4M5 16h14M5 16v2M19 16v2"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/></svg>);
    case 'transit':return (<svg {...p}><rect x="6" y="4" width="12" height="14" rx="3"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/><path d="M6 10h12M9 20l-2 2M15 20l2 2"/></svg>);
    case 'camera': return (<svg {...p}><path d="M4 8h4l1.5-2h5L16 8h4v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>);
    case 'check':  return (<svg {...p}><path d="m5 12 5 5L20 7"/></svg>);
    case 'x':      return (<svg {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>);
    case 'filter': return (<svg {...p}><path d="M4 6h16M7 12h10M10 18h4"/></svg>);
    case 'share':  return (<svg {...p}><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8 11 8-4M8 13l8 4"/></svg>);
    case 'bookmark':return(<svg {...p}><path d="M6 4h12v17l-6-4-6 4z"/></svg>);
    case 'suitcase':return(<svg {...p}><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 14h16"/></svg>);
    case 'sun':    return (<svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>);
    case 'moon':   return (<svg {...p}><path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10Z"/></svg>);
    case 'route':  return (<svg {...p}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v6a4 4 0 0 0 4 4h6"/></svg>);
    case 'chevron-r': return (<svg {...p}><path d="m9 6 6 6-6 6"/></svg>);
    case 'chevron-d': return (<svg {...p}><path d="m6 9 6 6 6-6"/></svg>);
    case 'settings': return (<svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>);
    default:       return (<svg {...p}><rect x="4" y="4" width="16" height="16" rx="3"/></svg>);
  }
}

// Tradule logotype in-page — plain text with the brand gradient
function Logotype({ size = 22, tagline = false }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{
        fontFamily: T.fontSans, fontWeight: 800, fontSize: size, letterSpacing: '-0.02em',
        background: T.brand.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>Tradule</span>
      {tagline && <span style={{ fontFamily: T.fontSans, fontSize: size * 0.5, color: T.ink3, fontWeight: 500 }}>당신의 여행 파트너</span>}
    </div>
  );
}

Object.assign(window, { T, ImgPlaceholder, Icon, Logotype });
