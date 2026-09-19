import { describe, expect, test } from 'bun:test';
import { stations } from '../data/network';
import { LocalNetworkProvider } from './localNetworkProvider';
import { recommendMeetingStations } from './recommend';
import type { Participant } from './types';

describe('meeting station recommendation', () => {
  test('keeps recommended stations within five minutes of the smallest maximum trip', async () => {
    const participants: Participant[] = [
      { id: 'a', name: 'A', origins: [{ stationId: '강남', accessMinutes: 0 }] },
      { id: 'b', name: 'B', origins: [{ stationId: '홍대입구', accessMinutes: 0 }] },
      { id: 'c', name: 'C', origins: [{ stationId: '왕십리', accessMinutes: 0 }] },
    ];
    const recommendations = await recommendMeetingStations(
      new LocalNetworkProvider(),
      participants,
      stations.map((station) => station.id),
    );

    expect(recommendations).toHaveLength(3);
    const smallestMax = Math.min(...recommendations.map((item) => item.maxMinutes));
    expect(recommendations.every((item) => item.maxMinutes <= smallestMax + 5)).toBe(true);
  });

  test('chooses the better of multiple origins for one person', async () => {
    const participant: Participant = {
      id: 'a',
      name: 'A',
      origins: [
        { stationId: '광교', accessMinutes: 0 },
        { stationId: '강남', accessMinutes: 3 },
      ],
    };
    const matrix = await new LocalNetworkProvider().getJourneys([participant], ['신논현']);
    expect(matrix.get('a')?.get('신논현')?.originStationId).toBe('강남');
  });

  test('connects the Korail lines to the Seoul metro graph', async () => {
    const participant: Participant = {
      id: 'a',
      name: 'A',
      origins: [{ stationId: '인천논현', accessMinutes: 0 }],
    };
    const matrix = await new LocalNetworkProvider().getJourneys([participant], ['문산']);
    const journey = matrix.get('a')?.get('문산');

    expect(journey?.lines).toContain('SB');
    expect(journey?.lines).toContain('GJ');
    expect(journey?.transferCount).toBeGreaterThan(0);
  });

  test('charges only access time when the origin is the destination', async () => {
    const participant: Participant = {
      id: 'a',
      name: 'A',
      origins: [{ stationId: '강남', accessMinutes: 4 }],
    };
    const matrix = await new LocalNetworkProvider().getJourneys([participant], ['강남']);

    expect(matrix.get('a')?.get('강남')?.totalMinutes).toBe(4);
  });

  test('connects Incheon lines 1 and 2 at Incheon City Hall', async () => {
    const participant: Participant = {
      id: 'a',
      name: 'A',
      origins: [{ stationId: '송도달빛축제공원', accessMinutes: 0 }],
    };
    const matrix = await new LocalNetworkProvider().getJourneys([participant], ['검단오류']);
    const journey = matrix.get('a')?.get('검단오류');

    expect(journey?.lines).toEqual(['I1', 'I2']);
    expect(journey?.transferCount).toBe(1);
  });

  test('supports the full Seohae Line timetable', async () => {
    const participant: Participant = {
      id: 'a',
      name: 'A',
      origins: [{ stationId: '원시', accessMinutes: 0 }],
    };
    const matrix = await new LocalNetworkProvider().getJourneys([participant], ['일산']);
    const journey = matrix.get('a')?.get('일산');

    expect(journey?.lines).toEqual(['SH']);
    expect(journey?.transferCount).toBe(0);
  });

  test('supports regular Gyeongchun Line trains', async () => {
    const participant: Participant = {
      id: 'a',
      name: 'A',
      origins: [{ stationId: '춘천', accessMinutes: 0 }],
    };
    const matrix = await new LocalNetworkProvider().getJourneys([participant], ['청량리']);
    const journey = matrix.get('a')?.get('청량리');

    expect(journey?.lines).toEqual(['GC']);
    expect(journey?.transferCount).toBe(0);
  });

  test('supports AREX all-stop trains without using the express service', async () => {
    const participant: Participant = {
      id: 'a',
      name: 'A',
      origins: [{ stationId: '인천공항2터미널', accessMinutes: 0 }],
    };
    const matrix = await new LocalNetworkProvider().getJourneys([participant], ['서울역']);
    const journey = matrix.get('a')?.get('서울역');

    expect(journey?.lines).toEqual(['AR']);
    expect(journey?.transferCount).toBe(0);
    expect(journey?.totalMinutes).toBeGreaterThan(50);
  });
});
