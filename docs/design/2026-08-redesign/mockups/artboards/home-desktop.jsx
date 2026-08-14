// A. Home / Onboarding — Desktop, two variations
// A1 Contextual Home — status-driven, single-hero CTA, onboarding stepper for new users
// A2 Map-forward Pro-tool Home — map preview + recent plans strip

// ---- Shared bits ----
function HomeTopbar({ active = 'home' }) {
  const items = [
    { id: 'home', label: '홈' },
    { id: 'plan', label: '내 계획' },
    { id: 'saved', label: '보관함' },
    { id: 'feed', label: '후기 피드' },
    { id: 'community', label: '커뮤니티' },
  ];
  return (
    <div style={{ height: 64, borderBottom: `1px solid ${T.hairline}`, background: T.surface, display: 'flex', alignItems: 'center', padding: '0 32px', gap: 32 }}>
      <Logotype size={22}/>
      <nav style={{ display: 'flex', gap: 4 }}>
        {items.map(it => (
          <a key={it.id} style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
            color: active === it.id ? T.ink : T.ink3,
            background: active === it.id ? T.surfaceAlt : 'transparent',
            textDecoration: 'none',
          }}>{it.label}</a>
        ))}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.hairline}`, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="search" size={16} color={T.ink2}/>
        </button>
        <button style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.hairline}`, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
          <Icon name="bell" size={16} color={T.ink2}/>
          <span style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: '#FF4D8D' }}/>
        </button>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.brand.gradientSoft, border: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#C34E1E' }}>당</div>
      </div>
    </div>
  );
}

// ---------- A1: Contextual Home (온보딩 스텝 인라인) ----------
function HomeDesktopV1() {
  const stepsData = [
    { n: 1, title: '어디로 갈지 검색', desc: '도시·맛집·명소 무엇이든', icon: 'search', done: true },
    { n: 2, title: '일정에 추가', desc: '지도에 하나씩 담기', icon: 'pin', done: false, active: true },
    { n: 3, title: '동선 자동 정리', desc: 'Tradule이 순서를 짜줌', icon: 'route', done: false },
    { n: 4, title: '저장하고 떠나기', desc: '여행 중에도 이어보기', icon: 'suitcase', done: false },
  ];

  return (
    <DesktopFrame width={1440} height={960} chrome="browser">
      <HomeTopbar active="home"/>
      <div style={{ padding: '28px 40px 40px', overflow: 'auto', height: 'calc(100% - 64px)' }}>

        {/* Hero — status band */}
        <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: T.brand.gradient, padding: '32px 40px', color: '#fff', minHeight: 220, marginBottom: 24 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1000px 300px at 100% 0%, rgba(255,255,255,0.25), transparent 60%)' }}/>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 10 }}>
                이어서 계획하기
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8 }}>
                당근당근님, 부산 여행<br/>둘째 날 코스를 마저 짜볼까요?
              </div>
              <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 22 }}>7월 26일 출발까지 <b>13일</b> · 지금까지 <b>5곳</b> 담김</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button kind="secondary" icon="arrow-r" style={{ background: '#fff', color: T.ink, border: '1px solid transparent' }}>플래너 이어서 열기</Button>
                <Button kind="ghost" style={{ color: '#fff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.4)' }}>새 여행 시작</Button>
              </div>
            </div>
            {/* mini stat card */}
            <div style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 16, padding: 16, minWidth: 240 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.9, marginBottom: 8 }}>진행 중 · 부산 2박 3일</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < 2 ? '#fff' : 'rgba(255,255,255,0.35)' }}/>
                ))}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.85 }}>Day 1</span><span style={{ fontWeight: 600 }}>6곳 · 완성</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.85 }}>Day 2</span><span style={{ fontWeight: 700 }}>3곳 · 이어 짜기</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.7 }}><span>Day 3</span><span>미정</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Onboarding stepper — first-time or as guide */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon name="sparkle" size={16} color="#C34E1E"/>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink2 }}>Tradule 처음이신가요?</div>
          <div style={{ fontSize: 12, color: T.ink3 }}>4단계로 첫 여행 계획을 완성해요</div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: T.ink3 }}>진행률 <b style={{ color: T.ink }}>25%</b></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          {stepsData.map(s => (
            <div key={s.n} style={{
              background: s.active ? '#FFF6EE' : T.surface,
              border: `1px solid ${s.active ? '#FFC9A6' : T.hairline}`,
              borderRadius: 14, padding: 16, position: 'relative',
              boxShadow: s.active ? '0 8px 24px rgba(255,138,61,0.15)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: s.done ? '#276848' : s.active ? T.brand.gradient : T.surfaceAlt,
                  color: (s.done || s.active) ? '#fff' : T.ink3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                }}>
                  {s.done ? <Icon name="check" size={13}/> : s.n}
                </div>
                <Icon name={s.icon} size={14} color={T.ink3}/>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: '-0.015em', marginBottom: 3 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.5 }}>{s.desc}</div>
              {s.active && <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#C34E1E', fontWeight: 700 }}>지금 할 차례 <Icon name="arrow-r" size={12}/></div>}
            </div>
          ))}
        </div>

        {/* Two-column: quick actions + my trips */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20 }}>
          {/* Quick actions with unified search */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: '-0.015em', marginBottom: 10 }}>지금 시작하기</div>
            {/* Big unified search */}
            <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 16, padding: 16, boxShadow: T.shadowCard, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1.5px solid ${T.ink}`, borderRadius: 12 }}>
                <Icon name="search" size={18} color={T.ink}/>
                <span style={{ flex: 1, fontSize: 15, color: T.ink, fontWeight: 500 }}>서울 성수동 카페</span>
                <span style={{ fontSize: 11, color: T.ink3, background: T.surfaceAlt, padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>⌘K</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <Chip icon="sparkle">AI 추천 코스</Chip>
                <Chip icon="pin">내 주변</Chip>
                <Chip icon="camera">인스타 핫플</Chip>
                <Chip icon="star">현지인 픽</Chip>
                <Chip icon="clock">지금 문 연 곳</Chip>
              </div>
            </div>
            {/* Two entry cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16 }}>
                <Icon name="plus" size={20} color={T.ink}/>
                <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 8, letterSpacing: '-0.015em' }}>새 여행 만들기</div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 3, lineHeight: 1.5 }}>목적지·기간부터 시작</div>
              </div>
              <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16 }}>
                <Icon name="sparkle" size={20} color="#C34E1E"/>
                <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 8, letterSpacing: '-0.015em' }}>AI에게 맡기기 <StatusPill tone="brand">NEW</StatusPill></div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 3, lineHeight: 1.5 }}>취향만 알려주면 코스 완성</div>
              </div>
            </div>
          </div>

          {/* My trips */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: '-0.015em' }}>내 여행</div>
              <a style={{ marginLeft: 'auto', fontSize: 12, color: T.ink3, fontWeight: 600 }}>전체 보기 →</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { name: '부산 2박 3일', date: '2026.08.26 – 08.28', places: 9, status: '진행 중', tone: 'brand' },
                { name: '후쿠오카 4박 5일', date: '2026.05.22 – 05.26', places: 18, status: '완료', tone: 'success' },
                { name: '제주 3박 4일', date: '2025.09 (초안)', places: 4, status: '초안', tone: 'neutral' },
              ].map((t, i) => (
                <div key={i} style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <ImgPlaceholder w={54} h={54} label="cover" radius={10}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.015em' }}>{t.name}</span>
                      <StatusPill tone={t.tone}>{t.status}</StatusPill>
                    </div>
                    <div style={{ fontSize: 12, color: T.ink3, marginTop: 3 }}>{t.date} · {t.places}곳</div>
                  </div>
                  <Icon name="chevron-r" size={16} color={T.ink3}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DesktopFrame>
  );
}

// ---------- A2: Map-forward Pro-tool Home ----------
function HomeDesktopV2() {
  const pins = [
    { x: 22, y: 30, n: 1 }, { x: 38, y: 55, n: 2 },
    { x: 58, y: 42, n: 3 }, { x: 74, y: 62, n: 4 },
  ];
  return (
    <DesktopFrame width={1440} height={960} chrome="browser">
      <HomeTopbar active="home"/>
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: 'calc(100% - 64px)' }}>
        {/* Left rail */}
        <div style={{ borderRight: `1px solid ${T.hairline}`, background: T.bg, padding: '24px 20px', overflow: 'auto' }}>
          <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600, marginBottom: 6 }}>안녕하세요, 당근당근님</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', color: T.ink, marginBottom: 20, lineHeight: 1.2 }}>
            오늘도 어디로<br/>떠나볼까요?
          </div>

          {/* search */}
          <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Icon name="search" size={16} color={T.ink3}/>
            <span style={{ fontSize: 13.5, color: T.ink3, flex: 1 }}>여행지, 맛집, 숙소를 검색해보세요</span>
            <span style={{ fontSize: 11, color: T.ink3, background: T.surfaceAlt, padding: '2px 6px', borderRadius: 5, fontWeight: 600 }}>⌘K</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
            <Chip icon="sparkle" tone="brand" active>AI 코스</Chip>
            <Chip icon="map">내 주변</Chip>
            <Chip icon="star">현지인 픽</Chip>
          </div>

          {/* progress card */}
          <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: T.brand.gradientSoft, opacity: 0.6 }}/>
            <div style={{ position: 'relative' }}>
              <StatusPill tone="brand" icon="pin">진행 중</StatusPill>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8, letterSpacing: '-0.02em' }}>부산 2박 3일</div>
              <div style={{ fontSize: 12, color: T.ink3, marginTop: 3 }}>7월 26일 출발 · Day 2/3 편집 중</div>
              <div style={{ height: 6, background: T.surfaceAlt, borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
                <div style={{ width: '66%', height: '100%', background: T.brand.gradient }}/>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <Button kind="primary" size="sm" iconRight="arrow-r">이어 짜기</Button>
                <Button kind="outline" size="sm" icon="share">공유</Button>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink2, marginBottom: 8 }}>최근 계획</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { icon: 'pin', name: '후쿠오카 4박 5일', sub: '18곳 · 05.22 – 05.26' },
              { icon: 'pin', name: '제주 3박 4일 (초안)', sub: '4곳 · 저장됨' },
              { icon: 'pin', name: '서울 성수 하루', sub: '6곳 · 07.18' },
            ].map((r,i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: T.surface, border: `1px solid ${T.hairline}` }}>
                <Icon name={r.icon} size={14} color={T.ink3}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.015em' }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>{r.sub}</div>
                </div>
                <Icon name="chevron-r" size={14} color={T.ink4}/>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink2, marginTop: 20, marginBottom: 8 }}>관심 장소 · 0곳</div>
          <div style={{ background: T.surfaceAlt, border: `1px dashed ${T.hairline}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center', fontSize: 12, color: T.ink3 }}>
            마음에 드는 곳을 <span style={{ color: T.ink, fontWeight: 700 }}>♡</span> 로 담아두세요
          </div>
        </div>

        {/* Right: map + curated */}
        <div style={{ position: 'relative', background: T.bg }}>
          <div style={{ position: 'absolute', inset: 20, borderRadius: 20, overflow: 'hidden', boxShadow: T.shadowCard }}>
            <MapStub w="100%" h="100%" pins={pins} routes/>
            {/* floating title on map */}
            <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(6px)', border: `1px solid ${T.hairline}`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="map" size={16} color={T.ink}/>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.015em' }}>부산 · Day 2 미리보기</div>
                <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>4곳 담김 · 총 이동 34분</div>
              </div>
              <Button kind="primary" size="sm" style={{ marginLeft: 8 }} iconRight="arrow-r">편집</Button>
            </div>

            {/* bottom curated strip */}
            <div style={{ position: 'absolute', left: 20, right: 20, bottom: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { n: 1, name: '해운대 블루라인파크', cat: '명소 · 스카이캡슐', rating: '4.6', reviews: '2.1k', tag: '지금 인기' },
                { n: 2, name: '전포 카페거리', cat: '카페 · 로컬 감성', rating: '4.5', reviews: '980', tag: 'AI 픽' },
                { n: 3, name: '광안리 해변', cat: '야경 · 산책', rating: '4.8', reviews: '5.6k' },
              ].map(p => (
                <div key={p.n} style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(6px)', border: `1px solid ${T.hairline}`, borderRadius: 12, padding: 10 }}>
                  <PlaceCard {...p} compact/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DesktopFrame>
  );
}

// ---------- BEFORE reference (compact rebuild of current home) ----------
function HomeDesktopBefore() {
  return (
    <DesktopFrame width={1440} height={960} chrome="browser">
      {/* Slim topbar */}
      <div style={{ height: 56, borderBottom: `1px solid ${T.hairline}`, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '0 20px' }}>
        <Icon name="menu" size={18} color={T.ink2} style={{ position: 'absolute', left: 20 }}/>
        <Logotype size={22} tagline/>
        <div style={{ position: 'absolute', right: 20, display: 'flex', gap: 14, color: T.ink3 }}>
          <Icon name="chat" size={18}/>
          <Icon name="bell" size={18}/>
        </div>
      </div>
      <div style={{ padding: '20px 40px', height: 'calc(100% - 56px)', overflow: 'auto' }}>
        {/* huge blue hero */}
        <div style={{ height: 220, borderRadius: 14, background: 'linear-gradient(135deg, #1E3AA8 0%, #3556D4 60%, #4A6BE0 100%)', color: '#fff', padding: '28px 32px', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>안녕하세요, 당근당근님</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>오늘은 어디로 떠나볼까요?</div>
          {/* silhouettes */}
          <div style={{ position: 'absolute', right: 40, bottom: 0, height: 180, width: 500, opacity: 0.6, background: 'radial-gradient(ellipse at 60% 100%, #7A93E8 0%, transparent 60%)' }}/>
        </div>
        {/* search */}
        <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Icon name="search" size={16} color={T.ink4}/>
          <span style={{ fontSize: 13, color: T.ink4 }}>여행지, 맛집, 숙소를 검색해보세요</span>
        </div>
        {/* 5 identical cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { icon: 'map', name: '여행 계획짜기' },
            { icon: 'suitcase', name: '계획' },
            { icon: 'bookmark', name: '여행 보관함' },
            { icon: 'chat', name: '후기 피드' },
            { icon: 'users', name: '커뮤니티' },
          ].map((c,i) => (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 12, padding: 16, textAlign: 'left' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: T.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={c.icon} size={16} color={T.ink3}/>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>{c.name}</div>
              <div style={{ fontSize: 10.5, color: T.ink4, marginTop: 3, lineHeight: 1.4 }}>설명 텍스트가 여기에 들어갑니다.</div>
              <div style={{ fontSize: 11, color: '#6A5AE0', fontWeight: 700, marginTop: 8 }}>시작하기 ›</div>
            </div>
          ))}
        </div>
        {/* status row */}
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>내 여행 현황</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { title: '진행 중인 계획', val: '부산', sub: '2박 3일 · 이어서 계획하기' },
            { title: '저장된 계획', val: '4개', sub: '2025.09 도쿄 · 7월 18일 등재' },
            { title: '관심 장소', val: '0곳', sub: '마음에 드는 곳을 담아보세요' },
          ].map((s,i) => (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>{s.title}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 3 }}>{s.sub}</div>
              <div style={{ fontSize: 11, color: '#6A5AE0', fontWeight: 700, marginTop: 8 }}>플래너 열기 ›</div>
            </div>
          ))}
        </div>
      </div>
    </DesktopFrame>
  );
}

Object.assign(window, { HomeDesktopV1, HomeDesktopV2, HomeDesktopBefore });
