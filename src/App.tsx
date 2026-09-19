import { useMemo, useRef, useState } from 'react';
import { displayStationName, stationById, stations } from './data/network';
import { LocalNetworkProvider } from './domain/localNetworkProvider';
import { matchesStationSearch } from './domain/koreanSearch';
import { recommendMeetingStations } from './domain/recommend';
import type { Participant, Recommendation } from './domain/types';

const provider = new LocalNetworkProvider();
const initialParticipants: Participant[] = [
  { id: 'person-1', name: '나', origins: [{ stationId: '강남', accessMinutes: 0 }] },
  { id: 'person-2', name: '친구 1', origins: [{ stationId: '홍대입구', accessMinutes: 0 }] },
  { id: 'person-3', name: '친구 2', origins: [{ stationId: '왕십리', accessMinutes: 0 }] },
];

function PinIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M14 25s8-7.2 8-14A8 8 0 1 0 6 11c0 6.8 8 14 8 14Z" fill="currentColor" />
      <circle cx="14" cy="11" r="3.2" fill="white" />
    </svg>
  );
}

function LineBadges({ stationId, compact = false }: { stationId: string; compact?: boolean }) {
  const station = stationById.get(stationId);
  if (!station) return null;
  return (
    <span className="line-badges" aria-label={`${station.lines.map((line) => line.label).join(', ')} 연결`}>
      {station.lines.map((line) => (
        <span
          key={line.id}
          className={`line-badge ${compact ? 'compact' : ''}`}
          style={{ backgroundColor: line.color }}
          title={line.label}
        >
          {line.id === 'GJ' ? '경의' : line.id === 'SB' ? '수인' : line.id === 'S' ? '신분당' : line.id === 'I1' ? '인천1' : line.id === 'I2' ? '인천2' : line.id === 'SH' ? '서해' : line.id === 'GC' ? '경춘' : line.id === 'AR' ? '공항' : line.id}
        </span>
      ))}
    </span>
  );
}

function StationPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (stationId: string) => void;
  label: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!query.trim()) return stations.slice(0, 8);
    return stations.filter((station) => matchesStationSearch(station.name, query)).slice(0, 8);
  }, [query]);

  return (
    <div className="station-picker">
      <button
        type="button"
        className={`station-field ${open ? 'active' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={`${label} 출발역 ${value || '선택하기'}`}
      >
        <span className="station-pin"><PinIcon /></span>
        <span className={value ? 'station-value' : 'station-placeholder'}>{value ? displayStationName(value) : '출발역을 선택해 주세요'}</span>
        <span className="chevron">⌄</span>
      </button>

      {open && (
        <div className="station-popover">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="역 이름 또는 초성 검색"
              aria-label="역 이름 검색"
            />
          </label>
          <div className="station-options">
            {filtered.length > 0 ? filtered.map((station) => (
              <button
                type="button"
                key={station.id}
                className="station-option"
                onClick={() => {
                  onChange(station.id);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <span>{displayStationName(station.name)}</span>
                <LineBadges stationId={station.id} compact />
              </button>
            )) : <p className="empty-search">검색 결과가 없어요</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ item, rank }: { item: Recommendation; rank: number }) {
  const station = stationById.get(item.stationId)!;
  return (
    <article className={`result-card ${rank === 1 ? 'best' : ''}`}>
      <div className="result-heading">
        <span className="rank">{rank}</span>
        <div>
          <div className="result-title-row">
            <h3>{displayStationName(station.name)}</h3>
            {rank === 1 && <span className="best-label">가장 공평해요</span>}
          </div>
          <LineBadges stationId={station.id} />
        </div>
      </div>

      <div className="result-summary">
        <span>최대 <strong>{Math.round(item.maxMinutes)}분</strong></span>
        <span className="dot" />
        <span>차이 <strong>{Math.round(item.spreadMinutes)}분</strong></span>
        <span className="dot" />
        <span>평균 <strong>{Math.round(item.averageMinutes)}분</strong></span>
      </div>

      <div className="journey-list">
        {item.journeys.map(({ participant, journey }) => (
          <div className="journey-row" key={participant.id}>
            <span className="avatar small">{participant.name.slice(0, 1)}</span>
            <span className="journey-name">{participant.name}</span>
            <span className="journey-origin">{displayStationName(journey.originStationId)}에서</span>
            <strong>{Math.round(journey.totalMinutes)}분</strong>
            <span className="transfer-count">{journey.transferCount ? `환승 ${journey.transferCount}회` : '환승 없음'}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function App() {
  const [participants, setParticipants] = useState(initialParticipants);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const updateParticipant = (id: string, patch: Partial<Participant>) => {
    setParticipants((current) => current.map((person) => person.id === id ? { ...person, ...patch } : person));
    setHasCalculated(false);
  };

  const calculate = async () => {
    if (participants.some((person) => !person.origins[0]?.stationId)) return;
    setLoading(true);
    const result = await recommendMeetingStations(provider, participants, stations.map((station) => station.id));
    setRecommendations(result);
    setHasCalculated(true);
    setLoading(false);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const addParticipant = () => {
    const number = participants.length + 1;
    setParticipants((current) => [
      ...current,
      { id: `person-${Date.now()}`, name: `친구 ${number - 1}`, origins: [{ stationId: '', accessMinutes: 0 }] },
    ]);
    setHasCalculated(false);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><PinIcon /></div>
        <span>어디서 만나</span>
        <button type="button" className="help-button" aria-label="서비스 안내">?</button>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">우리 사이 딱 좋은 곳</p>
          <h1>모두에게 공평한<br /><span>약속역</span>을 찾아드려요</h1>
          <p className="hero-copy">각자 출발할 역을 고르면 이동시간과 환승을 함께 계산해요.</p>
          <div className="mini-map" aria-hidden="true">
            <span className="map-line line-a" />
            <span className="map-line line-b" />
            <span className="map-stop stop-a" />
            <span className="map-stop stop-b" />
            <span className="map-stop stop-c" />
            <span className="meeting-pin"><PinIcon /></span>
          </div>
        </section>

        <section className="input-section" aria-labelledby="people-title">
          <div className="section-heading">
            <div>
              <p className="step-label">STEP 1</p>
              <h2 id="people-title">어디서 출발하나요?</h2>
            </div>
            <span className="people-count">{participants.length}명</span>
          </div>

          <div className="participant-list">
            {participants.map((participant, index) => (
              <article className="participant-card" key={participant.id}>
                <div className="participant-top">
                  <span className={`avatar tone-${(index % 4) + 1}`}>{participant.name.slice(0, 1)}</span>
                  <input
                    className="name-input"
                    value={participant.name}
                    onChange={(event) => updateParticipant(participant.id, { name: event.target.value })}
                    aria-label={`${index + 1}번째 참여자 이름`}
                  />
                  {participants.length > 2 && (
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => {
                        setParticipants((current) => current.filter((person) => person.id !== participant.id));
                        setHasCalculated(false);
                      }}
                      aria-label={`${participant.name} 삭제`}
                    >×</button>
                  )}
                </div>
                <StationPicker
                  value={participant.origins[0]?.stationId ?? ''}
                  label={participant.name}
                  onChange={(stationId) => updateParticipant(participant.id, { origins: [{ stationId, accessMinutes: 0 }] })}
                />
              </article>
            ))}
          </div>

          {participants.length < 6 && (
            <button type="button" className="add-button" onClick={addParticipant}>
              <span>＋</span> 사람 추가하기
            </button>
          )}

          <div className="data-note">
            <span aria-hidden="true">ⓘ</span>
            <p>서울 1~9호선과 인천 1·2호선, 공항철도·경의중앙선·경춘선·수인분당선·서해선의 공식 운행정보를 기준으로 계산해요. 신분당선은 운영사 구간 정보를 바탕으로 추정해요.</p>
          </div>

          <button
            type="button"
            className="calculate-button"
            onClick={calculate}
            disabled={loading || participants.some((person) => !person.origins[0]?.stationId)}
          >
            {loading ? '계산하고 있어요…' : '중간역 찾기'}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </section>

        <section className="results-section" ref={resultRef} aria-live="polite">
          {hasCalculated && (
            <>
              <div className="section-heading result-section-heading">
                <div>
                  <p className="step-label">STEP 2</p>
                  <h2>여기서 만나면 어때요?</h2>
                </div>
                <span className="fair-chip">이동시간 기준</span>
              </div>
              <p className="result-description">가장 오래 걸리는 사람의 부담을 제한하고, 그 안에서 시간 차이가 작은 순서예요.</p>
              <div className="result-list">
                {recommendations.map((item, index) => <RecommendationCard key={item.stationId} item={item} rank={index + 1} />)}
              </div>
            </>
          )}
        </section>
      </main>
      <footer>예상 이동시간은 실제 운행 상황과 다를 수 있어요.</footer>
    </div>
  );
}
