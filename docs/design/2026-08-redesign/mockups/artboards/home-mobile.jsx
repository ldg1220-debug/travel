// A. Home / Onboarding — Mobile, two variations + Before

function MobileTabbar({ active = 'home' }) {
  const items = [
    { id: 'home', label: '홈', icon: 'grid' },
    { id: 'search', label: '탐색', icon: 'search' },
    { id: 'plan', label: '내 계획', icon: 'suitcase' },
    { id: 'saved', label: '저장', icon: 'heart' },
    { id: 'me', label: 'MY', icon: 'users' },
  ];
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 78, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)', borderTop: `1px solid ${T.hairline}`, display: 'flex', paddingBottom: 20 }}>
      {items.map(it => (
        <div key={it.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 8, color: active === it.id ? T.ink : T.ink4 }}>
          <Icon name={it.icon} size={20}/>
          <div style={{ fontSize: 10, fontWeight: active === it.id ? 700 : 500 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Mobile V1 — Contextual, single-hero ----------
function HomeMobileV1() {
  return (
    <MobileFrame>
      <div style={{ padding: '4px 20px 100px', overflowY: 'auto', height: '100%' }}>
        {/* top row */}
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: 8, marginBottom: 20 }}>
          <Logotype size={20}/>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, color: T.ink3 }}>
            <Icon name="bell" size={20}/>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.brand.gradientSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#C34E1E' }}>당</div>
          </div>
        </div>

        {/* greeting */}
        <div style={{ fontSize: 13, color: T.ink3, fontWeight: 600 }}>안녕하세요, 당근당근님</div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, marginTop: 2, marginBottom: 16 }}>
          부산 여행 <span style={{ background: T.brand.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>13일</span> 남았어요
        </div>

        {/* search */}
        <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, boxShadow: T.shadowCard }}>
          <Icon name="search" size={18} color={T.ink3}/>
          <span style={{ fontSize: 14, color: T.ink3, flex: 1 }}>어디로 떠나볼까요?</span>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
          <Chip icon="sparkle" tone="brand" active>AI 코스</Chip>
          <Chip icon="pin">내 주변</Chip>
          <Chip icon="camera">인스타</Chip>
          <Chip icon="star">현지인</Chip>
        </div>

        {/* Continue card (biggest) */}
        <div style={{ borderRadius: 20, background: T.brand.gradient, color: '#fff', padding: 20, marginBottom: 16, position: 'relative', overflow: 'hidden', boxShadow: '0 10px 30px rgba(255,138,61,0.25)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(400px 200px at 100% 0%, rgba(255,255,255,0.25), transparent 60%)' }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.85 }}>이어서 계획하기</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25, marginTop: 6 }}>부산 2박 3일<br/>Day 2를 마저 짜볼까요?</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
              {[0,1,2].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < 2 ? '#fff' : 'rgba(255,255,255,0.4)' }}/>)}
            </div>
            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9 }}>9곳 담김 · 총 이동 1시간 42분</div>
            <button style={{ marginTop: 14, background: '#fff', color: T.ink, border: 'none', borderRadius: 12, padding: '11px 14px', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: T.fontSans }}>
              플래너 열기 <Icon name="arrow-r" size={14}/>
            </button>
          </div>
        </div>

        {/* Onboarding checklist (collapsible feel) */}
        <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="sparkle" size={16} color="#C34E1E"/>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>첫 여행 완성까지 3단계</div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: T.ink3, fontWeight: 600 }}>1 / 4</div>
          </div>
          {[
            { n:1, t: '검색하기', d: '가고 싶은 도시나 장소', done: true },
            { n:2, t: '일정에 담기', d: '지도에서 순서대로', done: false, active: true },
            { n:3, t: '동선 자동 정리', d: 'Tradule이 순서를 짜줌', done: false },
            { n:4, t: '저장하고 떠나기', d: '기기 간 이어보기', done: false },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: s.n === 1 ? 'none' : `1px solid ${T.hairlineSoft}` }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.done ? '#276848' : s.active ? T.brand.gradient : T.surfaceAlt, color: (s.done || s.active) ? '#fff' : T.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>
                {s.done ? <Icon name="check" size={12}/> : s.n}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: s.done ? T.ink3 : T.ink, textDecoration: s.done ? 'line-through' : 'none' }}>{s.t}</div>
                <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{s.d}</div>
              </div>
              {s.active && <Icon name="arrow-r" size={14} color="#C34E1E"/>}
            </div>
          ))}
        </div>

        {/* my trips */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>내 여행</div>
          <a style={{ marginLeft: 'auto', fontSize: 11.5, color: T.ink3, fontWeight: 600 }}>전체 →</a>
        </div>
        {[
          { name: '부산 2박 3일', date: '08.26 – 08.28', places: 9, tone: 'brand', status: '진행 중' },
          { name: '후쿠오카 4박 5일', date: '05.22 – 05.26', places: 18, tone: 'success', status: '완료' },
        ].map((t,i) => (
          <div key={i} style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 12, padding: 10, display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <ImgPlaceholder w={48} h={48} label="cover" radius={10}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
              </div>
              <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{t.date} · {t.places}곳 <StatusPill tone={t.tone}>{t.status}</StatusPill></div>
            </div>
            <Icon name="chevron-r" size={16} color={T.ink3}/>
          </div>
        ))}
      </div>
      <MobileTabbar active="home"/>
    </MobileFrame>
  );
}

// ---------- Mobile V2 — Feed-first (SNS 감성) ----------
function HomeMobileV2() {
  return (
    <MobileFrame>
      <div style={{ padding: '4px 0 100px', overflowY: 'auto', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px 12px' }}>
          <Logotype size={20}/>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, color: T.ink3 }}>
            <Icon name="bell" size={20}/>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.brand.gradientSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#C34E1E' }}>당</div>
          </div>
        </div>

        {/* Continue banner slim */}
        <div style={{ margin: '0 20px 16px', padding: '12px 14px', borderRadius: 14, background: T.brand.gradientSoft, border: `1px solid #FFC9A6`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.brand.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="suitcase" size={20} color="#fff"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#C34E1E', fontWeight: 700 }}>진행 중 · 부산</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>13일 남음 · Day 2 이어 짜기</div>
          </div>
          <Icon name="arrow-r" size={16} color="#C34E1E"/>
        </div>

        <div style={{ padding: '0 20px', marginBottom: 14 }}>
          <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: T.shadowCard }}>
            <Icon name="search" size={18} color={T.ink3}/>
            <span style={{ fontSize: 14, color: T.ink3, flex: 1 }}>어디로 떠나볼까요?</span>
            <Icon name="camera" size={16} color={T.ink3}/>
          </div>
        </div>

        {/* Categories (grid pictorial) */}
        <div style={{ padding: '0 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {[
              { t: 'AI 코스', i: 'sparkle', bg: T.brand.gradient, fg: '#fff' },
              { t: '내 주변', i: 'pin', bg: '#E9F1EA', fg: '#2E6B47' },
              { t: '핫플', i: 'camera', bg: '#F1EBFA', fg: '#5A3D8C' },
              { t: '맛집', i: 'star', bg: '#FEF3E4', fg: '#8A5B1D' },
              { t: '숙소', i: 'suitcase', bg: '#EAF0F7', fg: '#2B4C77' },
            ].map((c,i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={c.i} size={22}/>
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: T.ink2 }}>{c.t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stories row (SNS) */}
        <div style={{ padding: '0 0 0 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, paddingRight: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>지금 뜨는 장소</div>
            <a style={{ marginLeft: 'auto', fontSize: 11.5, color: T.ink3, fontWeight: 600 }}>전체 →</a>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingRight: 20 }}>
            {[
              { name: '전포 카페거리', tag: 'AI 픽', t: 'warm' },
              { name: '광안리 야경', tag: '핫플', t: 'warm' },
              { name: '해운대 스카이', tag: '', t: 'warm' },
              { name: '감천마을', tag: '', t: 'warm' },
            ].map((s,i) => (
              <div key={i} style={{ width: 130, flex: 'none' }}>
                <div style={{ position: 'relative' }}>
                  <ImgPlaceholder w={130} h={170} label={s.name} radius={14} tone={s.t}/>
                  {s.tag && <div style={{ position: 'absolute', top: 8, left: 8 }}><StatusPill tone="brand" icon="sparkle">{s.tag}</StatusPill></div>}
                  <div style={{ position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="plus" size={14} color={T.ink}/>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 6 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: T.ink3, marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="star" size={11} color="#E5A63A"/>4.6 · 부산
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feed post */}
        <div style={{ padding: '0 20px 8px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>여행자들의 후기</div>
          <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.brand.gradientSoft }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>당근당근 · 7월 18일</div>
                <div style={{ fontSize: 11, color: T.ink3 }}>동래에서 커피 제일 맛있게 먹은 날</div>
              </div>
              <Icon name="bookmark" size={16} color={T.ink3}/>
            </div>
            <ImgPlaceholder w="100%" h={180} label="cafe · 성수" radius={12}/>
          </div>
        </div>
      </div>
      <MobileTabbar active="home"/>
    </MobileFrame>
  );
}

// ---------- Mobile Before ----------
function HomeMobileBefore() {
  return (
    <MobileFrame>
      <div style={{ padding: '4px 0', height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 12px', borderBottom: `1px solid ${T.hairline}` }}>
          <Icon name="menu" size={20} color={T.ink2}/>
          <div style={{ flex: 1, textAlign: 'center' }}><Logotype size={20}/></div>
          <div style={{ display: 'flex', gap: 12, color: T.ink3 }}>
            <Icon name="chat" size={18}/>
            <Icon name="bell" size={18}/>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ height: 160, borderRadius: 12, background: 'linear-gradient(135deg, #1E3AA8, #4A6BE0)', color: '#fff', padding: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>안녕하세요, 당근당근님</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>오늘은 어디로 떠나볼까요?</div>
          </div>
          <div style={{ marginTop: 12, background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="search" size={14} color={T.ink4}/>
            <span style={{ fontSize: 12, color: T.ink4 }}>여행지, 맛집, 숙소를 검색해보세요</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            {['여행 계획짜기','계획','여행 보관함','후기 피드','커뮤니티'].map((n,i) => (
              <div key={i} style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: T.surfaceAlt }}/>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>{n}</div>
                <div style={{ fontSize: 10, color: T.ink4, marginTop: 2, lineHeight: 1.4 }}>설명 텍스트</div>
                <div style={{ fontSize: 10, color: '#6A5AE0', marginTop: 6, fontWeight: 700 }}>시작하기 ›</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 20 }}>내 여행 현황</div>
          <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 12, marginTop: 8 }}>
            <div style={{ fontSize: 10, color: T.ink3 }}>진행 중인 계획</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 3 }}>부산</div>
            <div style={{ fontSize: 10, color: T.ink3, marginTop: 3 }}>2박 3일 · 이어서 계획하기</div>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}

Object.assign(window, { HomeMobileV1, HomeMobileV2, HomeMobileBefore });
