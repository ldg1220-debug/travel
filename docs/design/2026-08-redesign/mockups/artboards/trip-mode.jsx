// B. 여행 중 뷰 (오늘의 일정) — Mobile focused + Desktop companion

// ---------- Mobile V1 — Today Card / Live Timeline ----------
function TripModeMobileV1() {
  return (
    <MobileFrame statusColor="#fff">
      {/* Gradient header */}
      <div style={{ position: 'relative', height: '100%', background: 'linear-gradient(180deg, #FF8A3D 0%, #FF4D8D 24%, #FAF7F2 26%, #FAF7F2 100%)' }}>
        <div style={{ padding: '10px 20px 12px', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="arrow-l" size={20} color="#fff"/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 600 }}>부산 2박 3일 · Day 2 / 3</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>오늘 · 8월 14일 (금)</div>
            </div>
            <Icon name="share" size={18} color="#fff"/>
          </div>
        </div>

        <div style={{ padding: '0 16px', overflowY: 'auto', height: 'calc(100% - 84px - 78px)' }}>
          {/* Now card */}
          <div style={{ background: T.surface, borderRadius: 18, padding: 16, boxShadow: T.shadowRaised, border: `1px solid ${T.hairline}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF4D8D', boxShadow: '0 0 0 3px rgba(255,77,141,0.2)', display: 'inline-block' }}/>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#C34E1E', letterSpacing: '0.05em', textTransform: 'uppercase' }}>지금 이곳 · 11:24 AM</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <ImgPlaceholder w={64} h={64} label="cafe" radius={12}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>모모스 커피 부산본점</div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 3 }}>카페 · 도착 후 8분</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Button kind="primary" size="sm" icon="check">체크인 완료</Button>
                  <Button kind="outline" size="sm" icon="camera">사진</Button>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '10px 12px', background: T.surfaceAlt, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="walk" size={14} color={T.ink2}/>
              <div style={{ flex: 1, fontSize: 12, color: T.ink2, fontWeight: 500 }}>다음 <b>베르크로스터스</b>까지 <b>도보 9분</b> · 12:15 도착 예정</div>
              <Icon name="arrow-r" size={14} color={T.ink2}/>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 20, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>오늘 일정</div>
            <div style={{ fontSize: 11.5, color: T.ink3 }}>3 / 7 완료</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {Array.from({length:7}).map((_,i) => <div key={i} style={{ width: 16, height: 4, borderRadius: 2, background: i < 3 ? T.brand.gradient : T.surfaceAlt }}/>)}
            </div>
          </div>

          {/* Timeline */}
          <div style={{ background: T.surface, borderRadius: 14, padding: 14, border: `1px solid ${T.hairline}` }}>
            <TimelineItem n={1} time="08:30" name="숙소 → 조식" cat="롯데호텔 부산" dur="45분" transit="도보 3분" mode="walk" done/>
            <TimelineItem n={2} time="09:30" name="용궁사" cat="명소 · 바다뷰 사찰" dur="1시간 15분" transit="지하철 22분" mode="transit" done/>
            <TimelineItem n={3} time="11:20" name="모모스 커피" cat="카페 · 로컬 인기" dur="1시간" transit="도보 9분" mode="walk" current/>
            <TimelineItem n={4} time="12:30" name="점심 · 초량밀면" cat="맛집 · 부산 대표" dur="1시간" transit="지하철 18분" mode="transit"/>
            <TimelineItem n={5} time="14:00" name="감천문화마을" cat="명소 · 컬러풀 마을" dur="1시간 30분" transit="차 25분" mode="car"/>
            <TimelineItem n={6} time="16:30" name="송도해변 케이블카" cat="액티비티 · 뷰" dur="1시간" transit="도보 8분" mode="walk"/>
            <TimelineItem n={7} time="19:00" name="자갈치 회센터" cat="저녁 · 해산물" dur="1시간 30분" last/>
          </div>
        </div>
        <MobileTabbar active="plan"/>
      </div>
    </MobileFrame>
  );
}

// ---------- Mobile V2 — Map first with sheet ----------
function TripModeMobileV2() {
  const pins = [
    { x: 20, y: 30, n: 1 }, { x: 35, y: 45, n: 2 },
    { x: 50, y: 40, n: 3 }, { x: 62, y: 55, n: 4 },
    { x: 78, y: 42, n: 5 },
  ];
  return (
    <MobileFrame>
      <div style={{ height: '100%', position: 'relative' }}>
        {/* Full map */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <MapStub w="100%" h="100%" pins={pins} routes radius={0}/>
        </div>

        {/* Top bar */}
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)', border: `1px solid ${T.hairline}`, borderRadius: 12, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: T.shadowCard, flex: 1 }}>
            <Icon name="arrow-l" size={16} color={T.ink}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>부산 · Day 2</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>8월 14일 · 3 / 7</div>
            </div>
            <Icon name="share" size={16} color={T.ink2}/>
          </div>
        </div>

        {/* Bottom sheet */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '10px 20px 22px', boxShadow: '0 -8px 30px rgba(0,0,0,0.10)', maxHeight: '55%' }}>
          <div style={{ width: 40, height: 4, background: T.hairline, borderRadius: 2, margin: '0 auto 12px' }}/>

          {/* Now */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF4D8D', boxShadow: '0 0 0 3px rgba(255,77,141,0.2)' }}/>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#C34E1E', letterSpacing: '0.05em' }}>지금 · 11:24</div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: T.ink3 }}>다음까지 도보 9분</div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <ImgPlaceholder w={62} h={62} label="cafe" radius={12}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>모모스 커피 부산본점</div>
              <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>카페 · #3 / 7 · 머무는 시간 1시간</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button kind="primary" size="sm" icon="check">체크인</Button>
                <Button kind="outline" size="sm" icon="pin" iconRight="chevron-r">길찾기</Button>
              </div>
            </div>
          </div>

          {/* Next 2 */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.hairlineSoft}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { n: 4, t: '12:30', name: '초량밀면', cat: '맛집 · 부산 대표', mode: 'transit', tr: '지하철 18분' },
              { n: 5, t: '14:00', name: '감천문화마을', cat: '명소 · 마을', mode: 'car', tr: '차 25분' },
            ].map(x => (
              <div key={x.n} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: T.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: T.ink2 }}>{x.n}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'baseline' }}>{x.name}<span style={{ fontSize: 11, color: T.ink3, fontWeight: 500 }}>· {x.t}</span></div>
                  <div style={{ fontSize: 11, color: T.ink3, marginTop: 1, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <Icon name={x.mode} size={11}/>{x.tr}
                  </div>
                </div>
                <Icon name="chevron-r" size={14} color={T.ink4}/>
              </div>
            ))}
          </div>
        </div>

        {/* Map floating controls */}
        <div style={{ position: 'absolute', top: 78, right: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['pin','route','clock'].map((i,k) => (
            <div key={k} style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${T.hairline}`, boxShadow: T.shadowCard, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={i} size={14} color={T.ink2}/>
            </div>
          ))}
        </div>
      </div>
    </MobileFrame>
  );
}

// ---------- Desktop companion — Overview + timeline ----------
function TripModeDesktop() {
  const pins = [
    { x: 20, y: 30, n: 1 }, { x: 34, y: 45, n: 2 },
    { x: 48, y: 40, n: 3 }, { x: 60, y: 55, n: 4 },
    { x: 74, y: 42, n: 5 }, { x: 82, y: 60, n: 6 },
  ];
  return (
    <DesktopFrame width={1440} height={920} chrome="browser">
      <div style={{ height: 56, borderBottom: `1px solid ${T.hairline}`, background: T.surface, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 20 }}>
        <Logotype size={20}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 20 }}>
          <StatusPill tone="brand" icon="pin">여행 중</StatusPill>
          <div style={{ fontSize: 14, fontWeight: 700 }}>부산 2박 3일 · Day 2 / 3</div>
          <div style={{ fontSize: 12, color: T.ink3 }}>· 8월 14일 (금)</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button kind="outline" size="sm" icon="share">공유</Button>
          <Button kind="outline" size="sm" icon="settings">편집</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr 320px', height: 'calc(100% - 56px)' }}>
        {/* Left: timeline */}
        <div style={{ borderRight: `1px solid ${T.hairline}`, background: T.bg, padding: '20px', overflowY: 'auto' }}>
          <div style={{ background: T.surface, borderRadius: 14, padding: 14, border: `1px solid ${T.hairline}`, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>오늘의 진행</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>3</span>
              <span style={{ fontSize: 14, color: T.ink3, fontWeight: 600 }}>/ 7</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#276848', fontWeight: 700 }}>순조로움</span>
            </div>
            <div style={{ height: 6, background: T.surfaceAlt, borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: '43%', height: '100%', background: T.brand.gradient }}/>
            </div>
          </div>
          <div style={{ background: T.surface, borderRadius: 14, padding: 16, border: `1px solid ${T.hairline}` }}>
            <TimelineItem n={1} time="08:30" name="숙소 조식" cat="롯데호텔 부산" dur="45분" transit="도보 3분" mode="walk" done/>
            <TimelineItem n={2} time="09:30" name="용궁사" cat="명소 · 바다뷰" dur="1시간 15분" transit="지하철 22분" mode="transit" done/>
            <TimelineItem n={3} time="11:20" name="모모스 커피" cat="카페 · 로컬" dur="1시간" transit="도보 9분" mode="walk" current/>
            <TimelineItem n={4} time="12:30" name="초량밀면" cat="맛집 · 부산 대표" dur="1시간" transit="지하철 18분" mode="transit"/>
            <TimelineItem n={5} time="14:00" name="감천문화마을" cat="명소" dur="1시간 30분" transit="차 25분" mode="car"/>
            <TimelineItem n={6} time="16:30" name="송도 케이블카" cat="액티비티" dur="1시간" transit="도보 8분" mode="walk"/>
            <TimelineItem n={7} time="19:00" name="자갈치 회센터" cat="저녁 · 해산물" last/>
          </div>
        </div>

        {/* Center: map */}
        <div style={{ position: 'relative', padding: 20, background: T.bg }}>
          <MapStub w="100%" h="100%" pins={pins} routes/>
          <div style={{ position: 'absolute', top: 34, left: 34, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)', border: `1px solid ${T.hairline}`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="route" size={16} color={T.ink}/>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>오늘 총 이동 시간</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>1시간 42분 <span style={{ fontSize: 11, color: T.ink3, fontWeight: 500 }}>(도보 22분 · 대중교통 40분 · 차 40분)</span></div>
            </div>
          </div>
        </div>

        {/* Right: Now details */}
        <div style={{ borderLeft: `1px solid ${T.hairline}`, background: T.bg, padding: 20, overflowY: 'auto' }}>
          <div style={{ background: T.surface, borderRadius: 14, padding: 16, border: `1px solid ${T.hairline}`, marginBottom: 14 }}>
            <StatusPill tone="brand" icon="pin">지금 이곳</StatusPill>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6, letterSpacing: '-0.02em' }}>모모스 커피 부산본점</div>
            <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>#3 / 7 · 카페 · 도착 후 8분</div>
            <ImgPlaceholder w="100%" h={130} label="cafe" radius={10} tone="warm"/>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <Button kind="primary" size="sm" icon="check" full>체크인</Button>
              <Button kind="outline" size="sm" icon="camera"/>
              <Button kind="outline" size="sm" icon="heart"/>
            </div>
            <div style={{ marginTop: 12, padding: '10px 12px', background: T.surfaceAlt, borderRadius: 10, fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
              💡 후기 팁: <b>2층 창가 자리</b>가 가장 인기예요. 아침 10시 전이 여유롭습니다.
            </div>
          </div>
          <div style={{ background: T.surface, borderRadius: 14, padding: 14, border: `1px solid ${T.hairline}` }}>
            <div style={{ fontSize: 12, color: T.ink3, fontWeight: 700, marginBottom: 8 }}>다음 목적지까지</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: T.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="walk" size={18} color={T.ink}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>도보 9분 · 780m</div>
                <div style={{ fontSize: 11.5, color: T.ink3 }}>12:15 도착 예정 · 여유 있어요</div>
              </div>
              <Icon name="arrow-r" size={16} color={T.ink3}/>
            </div>
          </div>
        </div>
      </div>
    </DesktopFrame>
  );
}

Object.assign(window, { TripModeMobileV1, TripModeMobileV2, TripModeDesktop });
