// Tradule Redesign — shared UI components
// Card, Chip, Button, PlaceCard, MapStub, TimelineItem, StatusPill,
// DesktopFrame, MobileFrame. All rely on window.T + window.Icon.

function DesktopFrame({ children, width = 1440, height = 900, chrome = 'browser' }) {
  return (
    <div style={{ width, height, background: T.bg, borderRadius: 14, overflow: 'hidden', boxShadow: T.shadowCard, border: `1px solid ${T.hairline}`, position: 'relative', fontFamily: T.fontSans, color: T.ink }}>
      {chrome === 'browser' && (
        <div style={{ height: 34, background: '#EFEAE1', borderBottom: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E4795D' }}/>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E7C05B' }}/>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7EB871' }}/>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 6, padding: '3px 12px', fontSize: 11, color: T.ink3, minWidth: 240, textAlign: 'center' }}>
              tradule.co.kr
            </div>
          </div>
        </div>
      )}
      <div style={{ height: chrome === 'browser' ? height - 34 : height, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

function MobileFrame({ children, width = 390, height = 844, statusColor = T.ink }) {
  return (
    <div style={{ width, height, background: T.bg, borderRadius: 40, overflow: 'hidden', boxShadow: T.shadowCard, border: `1px solid ${T.hairline}`, position: 'relative', fontFamily: T.fontSans, color: T.ink }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', fontSize: 14, fontWeight: 600, color: statusColor }}>
        <span>9:41</span>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <svg width="16" height="10" viewBox="0 0 16 10" fill={statusColor}><rect x="0" y="6" width="3" height="4"/><rect x="4" y="4" width="3" height="6"/><rect x="8" y="2" width="3" height="8"/><rect x="12" y="0" width="3" height="10"/></svg>
          <svg width="24" height="10" viewBox="0 0 24 10" fill="none" stroke={statusColor} strokeWidth="1.2"><rect x="1" y="1" width="20" height="8" rx="2"/><rect x="3" y="3" width="14" height="4" fill={statusColor}/><rect x="22" y="4" width="1.5" height="2" fill={statusColor}/></svg>
        </div>
      </div>
      <div style={{ height: height - 44, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

function Chip({ children, active = false, tone = 'default', icon }) {
  const styles = {
    default: { bg: active ? T.ink : T.surface, fg: active ? '#fff' : T.ink2, border: active ? T.ink : T.hairline },
    brand:   { bg: active ? '#FFF1E8' : T.surface, fg: active ? '#C34E1E' : T.ink2, border: active ? '#FFC9A6' : T.hairline },
    ghost:   { bg: 'transparent', fg: T.ink2, border: T.hairline },
  }[tone] || { bg: T.surface, fg: T.ink2, border: T.hairline };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, background: styles.bg, color: styles.fg, border: `1px solid ${styles.border}`, fontSize: 12, fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap' }}>
      {icon && <Icon name={icon} size={12}/>}
      {children}
    </span>
  );
}

function Button({ children, kind = 'primary', size = 'md', icon, iconRight, full = false, style = {} }) {
  const sizes = {
    sm: { pad: '6px 12px', fs: 12, r: 8, ih: 12 },
    md: { pad: '10px 16px', fs: 13.5, r: 10, ih: 14 },
    lg: { pad: '14px 20px', fs: 15, r: 12, ih: 16 },
  }[size];
  const kinds = {
    primary: { bg: T.ink, fg: '#fff', border: T.ink },
    brand:   { bg: T.brand.gradient, fg: '#fff', border: 'transparent' },
    secondary:{ bg: T.surface, fg: T.ink, border: T.hairline },
    ghost:   { bg: 'transparent', fg: T.ink, border: 'transparent' },
    outline: { bg: 'transparent', fg: T.ink, border: T.hairline },
  }[kind];
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: sizes.pad, borderRadius: sizes.r, background: kinds.bg, color: kinds.fg,
      border: `1px solid ${kinds.border}`, fontSize: sizes.fs, fontWeight: 600,
      fontFamily: T.fontSans, cursor: 'pointer', width: full ? '100%' : 'auto',
      letterSpacing: '-0.01em',
      ...style,
    }}>
      {icon && <Icon name={icon} size={sizes.ih}/>}
      {children}
      {iconRight && <Icon name={iconRight} size={sizes.ih}/>}
    </button>
  );
}

function Card({ children, pad = 16, style = {}, hover = false }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, padding: pad, boxShadow: hover ? T.shadowRaised : 'none', ...style }}>
      {children}
    </div>
  );
}

// Map stub — schematic map with pins + soft roads. Purely decorative.
function MapStub({ w = '100%', h = 300, pins = [], routes = true, radius = 14 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: radius, position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(180deg, #EDF3EE 0%, #E4EBEC 100%)',
      border: `1px solid ${T.hairline}`,
    }}>
      {/* schematic streets */}
      <svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="grid-map" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="rgba(90,110,100,0.10)" strokeWidth="0.6"/>
          </pattern>
        </defs>
        <rect width="400" height="300" fill="url(#grid-map)"/>
        {/* rivers/parks */}
        <path d="M-10 210 Q 100 180 200 200 T 420 190" stroke="#BFD6DB" strokeWidth="14" fill="none" opacity="0.7"/>
        <ellipse cx="80" cy="90" rx="46" ry="30" fill="#D9E7CD" opacity="0.85"/>
        <ellipse cx="320" cy="60" rx="40" ry="26" fill="#D9E7CD" opacity="0.8"/>
        {/* main road */}
        <path d="M0 130 L400 150" stroke="rgba(200,190,170,0.9)" strokeWidth="4" fill="none"/>
        <path d="M180 0 L200 300" stroke="rgba(200,190,170,0.9)" strokeWidth="4" fill="none"/>
        {/* route through pins */}
        {routes && pins.length > 1 && (
          <polyline
            points={pins.map(p => `${p.x * 4},${p.y * 3}`).join(' ')}
            fill="none" stroke="#FF4D8D" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round"
          />
        )}
      </svg>
      {/* pins */}
      {pins.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-100%)' }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50% 50% 50% 0', background: T.brand.gradient,
            transform: 'rotate(-45deg)', boxShadow: '0 4px 10px rgba(255,77,141,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ transform: 'rotate(45deg)', color: '#fff', fontSize: 12, fontWeight: 700 }}>{p.n ?? i + 1}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ children, tone = 'brand', icon }) {
  const tones = {
    brand:   { bg: '#FFF1E8', fg: '#C34E1E' },
    success: { bg: '#E6F1EA', fg: '#276848' },
    info:    { bg: '#E6EEF7', fg: '#2A5A88' },
    neutral: { bg: '#F1EDE4', fg: T.ink2 },
  }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: tones.bg, color: tones.fg, fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em' }}>
      {icon && <Icon name={icon} size={11}/>}
      {children}
    </span>
  );
}

function PlaceCard({ n, name, cat, rating, reviews, distance, time, tag, tone = 'warm', compact = false, added = false }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: compact ? 10 : 12, background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 12, alignItems: 'stretch' }}>
      <div style={{ position: 'relative', flex: 'none' }}>
        <ImgPlaceholder w={compact ? 68 : 82} h={compact ? 68 : 82} label={cat} radius={10} tone={tone}/>
        {n != null && (
          <div style={{ position: 'absolute', top: -6, left: -6, width: 22, height: 22, borderRadius: '50%', background: T.ink, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
            {n}
          </div>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, letterSpacing: '-0.015em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            {tag && <StatusPill tone="brand">{tag}</StatusPill>}
          </div>
          <div style={{ fontSize: 12, color: T.ink3, marginTop: 3 }}>{cat}{distance && ` · ${distance}`}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {rating && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: T.ink2, fontWeight: 600 }}>
              <Icon name="star" size={12} color="#E5A63A"/>{rating}<span style={{ color: T.ink4, fontWeight: 500 }}>({reviews})</span>
            </span>
          )}
          {time && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: T.ink3 }}>
              <Icon name="clock" size={12}/>{time}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>
            {added ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#276848', fontWeight: 600 }}>
                <Icon name="check" size={13}/>추가됨
              </span>
            ) : (
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: T.surface, color: T.ink, border: `1px solid ${T.hairline}`, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                <Icon name="plus" size={12}/>일정에 추가
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// Timeline item — a "N. 09:30 → Place" row with transit-to-next segment
function TimelineItem({ n, time, name, cat, dur, transit, mode = 'walk', last = false, current = false, done = false }) {
  const dot = done ? T.ink3 : current ? '#FF4D8D' : T.ink;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '48px 20px 1fr', columnGap: 10 }}>
      <div style={{ textAlign: 'right', fontSize: 12, color: T.ink3, paddingTop: 4, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {time}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: current ? '#fff' : dot, border: current ? `3px solid ${dot}` : 'none', boxShadow: current ? '0 0 0 3px rgba(255,77,141,0.15)' : 'none', flex: 'none' }}/>
        {!last && <div style={{ flex: 1, width: 2, background: T.hairline, marginTop: 2, minHeight: 40 }}/>}
      </div>
      <div style={{ paddingBottom: last ? 0 : 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.ink3, fontVariantNumeric: 'tabular-nums' }}>#{String(n).padStart(2,'0')}</span>
          {current && <StatusPill tone="brand" icon="pin">지금 이곳</StatusPill>}
          {done && <StatusPill tone="neutral" icon="check">완료</StatusPill>}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: done ? T.ink3 : T.ink, letterSpacing: '-0.015em', textDecoration: done ? 'line-through' : 'none' }}>{name}</div>
        <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{cat}{dur && ` · 머무는 시간 ${dur}`}</div>
        {transit && !last && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '4px 8px', background: T.surfaceAlt, borderRadius: 6, fontSize: 11.5, color: T.ink3, fontWeight: 500 }}>
            <Icon name={mode} size={12}/>{transit}
          </div>
        )}
      </div>
    </div>
  );
}

// Small note pin on the canvas — a labelled callout
function Callout({ n, title, children, tone = 'good' }) {
  const tones = {
    good: { bg: '#EDF6EF', border: '#BFDCC5', fg: '#2E6B47', pill: '#2E6B47' },
    bad:  { bg: '#FBEDE9', border: '#EFC8BC', fg: '#8A3925', pill: '#C64A3B' },
    info: { bg: '#EEF2F8', border: '#C9D5E6', fg: '#2B4C77', pill: '#2B4C77' },
  }[tone];
  return (
    <div style={{ background: tones.bg, border: `1px solid ${tones.border}`, borderRadius: 10, padding: '10px 12px', maxWidth: 260, color: tones.fg, fontFamily: T.fontSans }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: tones.pill, color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: tones.fg }}>{children}</div>
    </div>
  );
}

Object.assign(window, { DesktopFrame, MobileFrame, Chip, Button, Card, MapStub, StatusPill, PlaceCard, TimelineItem, Callout });
