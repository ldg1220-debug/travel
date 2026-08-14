// D. 온보딩 시작 흐름 — Mobile focus (3 steps + AI course option)

// D1: 3-step guided overlay on the planner
function OnboardingMobileV1() {
  const pins = [{x:22,y:35,n:1},{x:52,y:45,n:2},{x:70,y:60,n:3}];
  return (
    <MobileFrame>
      <div style={{ position: 'relative', height: '100%' }}>
        {/* Faded planner behind */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.55, pointerEvents: 'none' }}>
          <div style={{ padding: '8px 16px 12px', background: T.surface, borderBottom: `1px solid ${T.hairline}` }}>
            <div style={{ background: T.surfaceAlt, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="search" size={14} color={T.ink3}/>
              <span style={{ fontSize: 12, color: T.ink3 }}>여행지, 맛집, 숙소를 검색해보세요</span>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <MapStub w="100%" h={200} pins={pins}/>
          </div>
        </div>

        {/* Dark scrim */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,15,10,0.55)' }}/>

        {/* Spotlight on search bar */}
        <div style={{ position: 'absolute', top: 40, left: 12, right: 12, height: 42, borderRadius: 12, border: '2px dashed rgba(255,255,255,0.6)', boxShadow: '0 0 0 9999px rgba(20,15,10,0.55)', background: 'transparent' }}/>

        {/* Bottom coach card */}
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 40, background: T.surface, borderRadius: 20, padding: 20, boxShadow: T.shadowRaised }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 22, height: 4, borderRadius: 2, background: i === 0 ? T.brand.gradient : T.surfaceAlt }}/>)}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: T.ink3, fontWeight: 600 }}>1 / 3</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#C34E1E', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Step 1 — 검색</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25 }}>먼저, 가고 싶은<br/>곳을 검색해보세요</div>
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 8, lineHeight: 1.55 }}>도시, 맛집, 명소 무엇이든 좋아요. <b style={{ color: T.ink }}>"부산 카페"</b> 처럼 자연스럽게 검색하면 돼요.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button kind="ghost" size="md" style={{ color: T.ink3 }}>건너뛰기</Button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Button kind="primary" size="md" iconRight="arrow-r">다음</Button>
            </div>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}

// D2: Preference quiz → auto-course
function OnboardingMobileV2() {
  return (
    <MobileFrame>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 20px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="arrow-l" size={20} color={T.ink}/>
          <div style={{ flex: 1, display: 'flex', gap: 4 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= 1 ? T.brand.gradient : T.surfaceAlt }}/>)}
          </div>
          <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>2 / 4</div>
        </div>

        <div style={{ padding: '18px 20px 100px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: T.brand.gradientSoft, color: '#C34E1E', fontSize: 11.5, fontWeight: 700 }}>
            <Icon name="sparkle" size={12}/>AI 코스 만들기
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.25, marginTop: 14 }}>
            어떤 여행을<br/>기대하세요?
          </div>
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 8 }}>가장 가까운 걸 골라주세요. (최대 3개)</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
            {[
              { t: '카페 투어', i: 'sparkle', sel: true },
              { t: '맛집 위주', i: 'star', sel: true },
              { t: '자연/뷰맛집', i: 'sun' },
              { t: '사진 찍기 좋은 곳', i: 'camera', sel: true },
              { t: '전통·문화', i: 'pin' },
              { t: '가족·아이 동반', i: 'users' },
              { t: '야경·밤', i: 'moon' },
              { t: '쇼핑', i: 'bookmark' },
            ].map((o,i) => (
              <div key={i} style={{
                padding: '16px 14px', borderRadius: 14,
                background: o.sel ? '#FFF6EE' : T.surface,
                border: `1.5px solid ${o.sel ? '#FF8A3D' : T.hairline}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Icon name={o.i} size={18} color={o.sel ? '#C34E1E' : T.ink3}/>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: o.sel ? T.ink : T.ink2 }}>{o.t}</div>
                {o.sel && <Icon name="check" size={14} color="#C34E1E" style={{ marginLeft: 'auto' }}/>}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, padding: '14px 16px', background: T.surfaceAlt, borderRadius: 12, display: 'flex', gap: 10 }}>
            <Icon name="sparkle" size={16} color="#C34E1E"/>
            <div style={{ flex: 1, fontSize: 12.5, color: T.ink2, lineHeight: 1.5 }}>
              선택하신 취향에 맞춰 부산의 <b>카페·맛집·포토스팟 12곳</b>을 뽑았어요. 다음에서 확인!
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 20px 24px', borderTop: `1px solid ${T.hairline}`, background: T.surface }}>
          <Button kind="brand" size="lg" iconRight="arrow-r" full>3개 선택 · 다음</Button>
        </div>
      </div>
    </MobileFrame>
  );
}

// D3: New-user welcome / role picker (extra variation)
function OnboardingMobileV3() {
  return (
    <MobileFrame>
      <div style={{ height: '100%', background: T.brand.gradientSoft, padding: '24px 24px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginTop: 20 }}>
          <Logotype size={26}/>
          <div style={{ fontSize: 12, color: T.ink3, marginTop: 6, fontWeight: 500 }}>당신의 여행 파트너</div>
        </div>

        <div style={{ marginTop: 40 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, color: T.ink }}>
            첫 여행을<br/>
            <span style={{ background: T.brand.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>3분만에 완성</span>해요
          </div>
          <div style={{ fontSize: 14, color: T.ink2, marginTop: 12, lineHeight: 1.55 }}>
            어디로 갈지 검색하고, 지도에 담고, 저장까지. Tradule이 순서를 자동으로 정리해줘요.
          </div>
        </div>

        <div style={{ flex: 1 }}/>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 16,
            background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 16,
            textAlign: 'left', cursor: 'pointer', fontFamily: T.fontSans,
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: T.brand.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sparkle" size={22} color="#fff"/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, display: 'flex', alignItems: 'center', gap: 6 }}>AI 코스 추천 <StatusPill tone="brand">추천</StatusPill></div>
              <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>취향만 알려주면 3분 완성</div>
            </div>
            <Icon name="arrow-r" size={18} color={T.ink3}/>
          </button>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 16,
            background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 16,
            textAlign: 'left', cursor: 'pointer', fontFamily: T.fontSans,
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: T.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="map" size={22} color={T.ink}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>직접 계획하기</div>
              <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>검색 → 담기 → 저장</div>
            </div>
            <Icon name="arrow-r" size={18} color={T.ink3}/>
          </button>

          <div style={{ textAlign: 'center', fontSize: 12, color: T.ink3, marginTop: 12 }}>
            이미 계정이 있나요? <b style={{ color: T.ink }}>로그인</b>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}

Object.assign(window, { OnboardingMobileV1, OnboardingMobileV2, OnboardingMobileV3 });
