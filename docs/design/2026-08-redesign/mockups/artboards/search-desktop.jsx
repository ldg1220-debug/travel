// C. 장소 검색 결과 — Desktop + Mobile, two variations

// ---------- Desktop V1: 리스트 + 지도 스플릿 (Pro-tool feel) ----------
function SearchDesktopV1() {
  const pins = [
    { x: 24, y: 34, n: 1 }, { x: 40, y: 44, n: 2 }, { x: 32, y: 60, n: 3 },
    { x: 55, y: 52, n: 4 }, { x: 66, y: 38, n: 5 }, { x: 78, y: 62, n: 6 },
  ];
  return (
    <DesktopFrame width={1440} height={960} chrome="browser">
      {/* topbar */}
      <div style={{ height: 56, borderBottom: `1px solid ${T.hairline}`, background: T.surface, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 20 }}>
        <Logotype size={20}/>
        <div style={{ flex: 1, maxWidth: 640, background: T.surfaceAlt, borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${T.hairline}` }}>
          <Icon name="search" size={16} color={T.ink}/>
          <span style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>부산 카페</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: T.ink3 }}>142개 결과</span>
        </div>
        <Button kind="primary" size="sm" icon="plus">일정에 담기 (3)</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', height: 'calc(100% - 56px)' }}>
        {/* Left: filter + list */}
        <div style={{ borderRight: `1px solid ${T.hairline}`, background: T.bg, display: 'flex', flexDirection: 'column' }}>
          {/* Filter chips */}
          <div style={{ padding: '14px 20px 10px', borderBottom: `1px solid ${T.hairline}`, background: T.surface }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <Chip active>전체 · 142</Chip>
              <Chip>카페 · 87</Chip>
              <Chip>디저트 · 34</Chip>
              <Chip>브런치 · 21</Chip>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Chip icon="filter">필터</Chip>
              <Chip icon="star">평점 4.5+</Chip>
              <Chip icon="clock">지금 오픈</Chip>
              <Chip icon="walk">도보 10분</Chip>
              <Chip>정렬 · 인기순</Chip>
            </div>
          </div>

          {/* Selected route strip */}
          <div style={{ padding: '10px 20px', background: '#FFF6EE', borderBottom: `1px solid #FFDDC2`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="route" size={14} color="#C34E1E"/>
            <div style={{ fontSize: 12, color: '#C34E1E', fontWeight: 700 }}>지금 담긴 3곳</div>
            <div style={{ fontSize: 11.5, color: T.ink3 }}>총 이동 24분 · 순서 자동 정리 완료</div>
            <a style={{ marginLeft: 'auto', fontSize: 12, color: '#C34E1E', fontWeight: 700 }}>확인 →</a>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { n: 1, name: '모모스 커피 부산본점', cat: '카페 · 로컬', rating: '4.8', reviews: '3.2k', distance: '도보 6분', time: '오픈 중', tag: 'AI 픽', added: true },
              { n: 2, name: '베르크로스터스 F1963', cat: '카페 · 브런치', rating: '4.7', reviews: '2.1k', distance: '도보 9분', time: '오픈 중', added: true },
              { n: 3, name: '헛간', cat: '디저트 · 한옥', rating: '4.6', reviews: '890', distance: '도보 12분', time: '~ 21:00', tag: '인기 상승', added: true },
              { n: null, name: '전포 카페거리', cat: '지역 · 카페 밀집', rating: '4.5', reviews: '5.6k', distance: '차 8분', time: '' },
              { n: null, name: '오프너 로스터리', cat: '카페 · 로스팅', rating: '4.7', reviews: '1.4k', distance: '차 12분', time: '오픈 중' },
              { n: null, name: '카페 헤이든', cat: '카페 · 뷰맛집', rating: '4.6', reviews: '2.9k', distance: '차 15분', time: '' },
            ].map((p,i) => <PlaceCard key={i} {...p}/>)}
          </div>
        </div>

        {/* Right: map */}
        <div style={{ position: 'relative', padding: 20, background: T.bg }}>
          <MapStub w="100%" h="100%" pins={pins} routes/>
          {/* Detail card floating on map */}
          <div style={{ position: 'absolute', top: 40, right: 40, width: 300, background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(8px)', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 14, boxShadow: T.shadowRaised }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <ImgPlaceholder w={64} h={64} label="cafe" radius={10}/>
              <div style={{ flex: 1 }}>
                <StatusPill tone="brand" icon="sparkle">AI 픽</StatusPill>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, letterSpacing: '-0.015em' }}>모모스 커피 부산본점</div>
                <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>카페 · 로컬 감성</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600 }}><Icon name="star" size={12} color="#E5A63A"/>4.8 <span style={{ color: T.ink3 }}>(3.2k)</span></span>
              <span style={{ fontSize: 11.5, color: T.ink3 }}>·</span>
              <span style={{ fontSize: 12, color: T.ink3 }}>도보 6분</span>
              <span style={{ marginLeft: 'auto' }}><StatusPill tone="success" icon="clock">오픈 중</StatusPill></span>
            </div>
            <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 10, background: T.surfaceAlt, borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
              "부산에서 커피 처음 마신 사람도 인정하는 로스터리. 아침 일찍 자리 잡는 게 팁."
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Button kind="primary" size="sm" icon="plus" full>일정에 추가</Button>
              <Button kind="outline" size="sm" icon="heart"/>
            </div>
          </div>

          {/* map controls */}
          <div style={{ position: 'absolute', bottom: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['plus','pin','route'].map((i,k) => (
              <button key={k} style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${T.hairline}`, boxShadow: T.shadowCard, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon name={i} size={16} color={T.ink2}/>
              </button>
            ))}
          </div>
        </div>
      </div>
    </DesktopFrame>
  );
}

// ---------- Desktop V2: SNS 갤러리 스타일 ----------
function SearchDesktopV2() {
  const cards = [
    { name: '모모스 커피 부산본점', cat: '카페 · 로컬', rating: '4.8', reviews: '3.2k', tag: 'AI 픽' },
    { name: '베르크로스터스', cat: '브런치 · 뷰맛집', rating: '4.7', reviews: '2.1k' },
    { name: '헛간 디저트', cat: '한옥 · 디저트', rating: '4.6', reviews: '890', tag: '인기 상승' },
    { name: '오프너 로스터리', cat: '카페 · 로스팅', rating: '4.7', reviews: '1.4k' },
    { name: '카페 헤이든', cat: '뷰맛집 · 광안리', rating: '4.6', reviews: '2.9k' },
    { name: '전포 카페거리', cat: '카페 밀집 지역', rating: '4.5', reviews: '5.6k', tag: '가볼 만한 곳' },
    { name: '망미단길 커피', cat: '레트로 · 카페', rating: '4.7', reviews: '1.9k' },
    { name: '해운대 스카이뷰', cat: '전망 카페', rating: '4.5', reviews: '3.1k' },
  ];
  return (
    <DesktopFrame width={1440} height={960} chrome="browser">
      <div style={{ height: 56, borderBottom: `1px solid ${T.hairline}`, background: T.surface, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 20 }}>
        <Logotype size={20}/>
        <div style={{ flex: 1, maxWidth: 720, background: T.surface, borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, border: `1.5px solid ${T.ink}` }}>
          <Icon name="search" size={16} color={T.ink}/>
          <span style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>부산 카페</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: T.ink3 }}>142개 결과</span>
        </div>
        <Button kind="brand" size="sm" icon="sparkle">AI 코스 만들기</Button>
      </div>

      <div style={{ padding: '20px 32px', height: 'calc(100% - 56px)', overflowY: 'auto', background: T.bg }}>
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <Chip active>전체</Chip>
          <Chip>카페</Chip>
          <Chip>디저트</Chip>
          <Chip>브런치</Chip>
          <Chip icon="star">평점 높은순</Chip>
          <Chip icon="camera">사진 많은순</Chip>
          <Chip icon="clock">지금 오픈</Chip>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <Chip icon="grid" active>갤러리</Chip>
            <Chip icon="list">리스트</Chip>
            <Chip icon="map">지도</Chip>
          </div>
        </div>

        {/* Gallery grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {cards.map((c,i) => (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 16, overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ position: 'relative' }}>
                <ImgPlaceholder w="100%" h={170} label={c.cat} radius={0}/>
                {c.tag && <div style={{ position: 'absolute', top: 10, left: 10 }}><StatusPill tone="brand" icon="sparkle">{c.tag}</StatusPill></div>}
                <div style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="heart" size={14} color={T.ink2}/>
                </div>
                <div style={{ position: 'absolute', bottom: 10, right: 10 }}>
                  <Button kind="primary" size="sm" icon="plus" style={{ background: T.ink, border: 'none' }}>담기</Button>
                </div>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.015em' }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{c.cat}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                    <Icon name="star" size={11} color="#E5A63A"/>{c.rating}
                    <span style={{ color: T.ink4, fontWeight: 500 }}>({c.reviews})</span>
                  </span>
                  <span style={{ fontSize: 11.5, color: T.ink3, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                    <Icon name="walk" size={11}/>도보 6분
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DesktopFrame>
  );
}

// ---------- Mobile V1: list + peek map ----------
function SearchMobileV1() {
  return (
    <MobileFrame>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* header */}
        <div style={{ padding: '8px 16px 12px', borderBottom: `1px solid ${T.hairline}`, background: T.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="arrow-l" size={20} color={T.ink}/>
            <div style={{ flex: 1, background: T.surfaceAlt, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="search" size={14} color={T.ink}/>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>부산 카페</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: T.ink3 }}>142</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
            <Chip active>전체</Chip>
            <Chip>카페</Chip>
            <Chip>디저트</Chip>
            <Chip icon="star">평점</Chip>
            <Chip icon="clock">오픈</Chip>
          </div>
        </div>

        {/* Small map peek */}
        <div style={{ margin: '10px 16px 0', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
          <MapStub w="100%" h={120} pins={[{x:25,y:40,n:1},{x:50,y:60,n:2},{x:75,y:35,n:3}]}/>
          <div style={{ position: 'absolute', bottom: 10, right: 10 }}>
            <Button kind="primary" size="sm" icon="map" style={{ background: T.ink }}>지도로 보기</Button>
          </div>
        </div>

        {/* selected strip */}
        <div style={{ margin: '10px 16px 0', padding: '10px 12px', background: '#FFF6EE', border: `1px solid #FFDDC2`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="route" size={14} color="#C34E1E"/>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#C34E1E' }}>3곳 담김 · 24분</div>
          <a style={{ marginLeft: 'auto', fontSize: 12, color: '#C34E1E', fontWeight: 700 }}>확인 →</a>
        </div>

        <div style={{ padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
          {[
            { n: 1, name: '모모스 커피', cat: '카페 · 로컬', rating: '4.8', reviews: '3.2k', distance: '도보 6분', tag: 'AI 픽', added: true },
            { n: 2, name: '베르크로스터스', cat: '브런치 · 뷰', rating: '4.7', reviews: '2.1k', distance: '도보 9분', added: true },
            { n: 3, name: '헛간 디저트', cat: '한옥 · 디저트', rating: '4.6', reviews: '890', distance: '도보 12분', added: true },
            { n: null, name: '전포 카페거리', cat: '카페 밀집', rating: '4.5', reviews: '5.6k', distance: '차 8분' },
            { n: null, name: '오프너', cat: '로스터리', rating: '4.7', reviews: '1.4k', distance: '차 12분' },
          ].map((p,i) => <PlaceCard key={i} {...p} compact/>)}
        </div>
        <MobileTabbar active="search"/>
      </div>
    </MobileFrame>
  );
}

// ---------- Mobile V2: gallery / SNS ----------
function SearchMobileV2() {
  const cards = [
    { name: '모모스 커피', cat: '카페', rating: '4.8', tag: 'AI 픽' },
    { name: '헛간', cat: '디저트', rating: '4.6' },
    { name: '베르크', cat: '브런치', rating: '4.7' },
    { name: '오프너', cat: '카페', rating: '4.7', tag: '핫플' },
  ];
  return (
    <MobileFrame>
      <div style={{ padding: '8px 16px 100px', height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Icon name="arrow-l" size={20} color={T.ink}/>
          <div style={{ flex: 1, background: T.surface, border: `1.5px solid ${T.ink}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="search" size={14} color={T.ink}/>
            <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>부산 카페</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
          <Chip active>전체 · 142</Chip>
          <Chip icon="star">평점</Chip>
          <Chip icon="camera">사진</Chip>
          <Chip icon="clock">오픈</Chip>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {cards.map((c,i) => (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ position: 'relative' }}>
                <ImgPlaceholder w="100%" h={140} label={c.cat} radius={0}/>
                {c.tag && <div style={{ position: 'absolute', top: 8, left: 8 }}><StatusPill tone="brand" icon="sparkle">{c.tag}</StatusPill></div>}
                <div style={{ position: 'absolute', bottom: 8, right: 8, width: 30, height: 30, borderRadius: '50%', background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={14} color="#fff"/>
                </div>
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{c.cat}</div>
                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                  <Icon name="star" size={10} color="#E5A63A"/>{c.rating}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <MobileTabbar active="search"/>
    </MobileFrame>
  );
}

Object.assign(window, { SearchDesktopV1, SearchDesktopV2, SearchMobileV1, SearchMobileV2 });
