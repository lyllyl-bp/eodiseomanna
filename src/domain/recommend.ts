import type { Participant, Recommendation, TravelTimeProvider } from './types';

export async function recommendMeetingStations(
  provider: TravelTimeProvider,
  participants: Participant[],
  candidateStationIds: string[],
  limit = 3,
): Promise<Recommendation[]> {
  if (participants.length < 2) return [];
  const matrix = await provider.getJourneys(participants, candidateStationIds);

  const recommendations = candidateStationIds.flatMap((stationId): Recommendation[] => {
    const journeys = participants.flatMap((participant) => {
      const journey = matrix.get(participant.id)?.get(stationId);
      return journey ? [{ participant, journey }] : [];
    });
    if (journeys.length !== participants.length) return [];

    const times = journeys.map(({ journey }) => journey.totalMinutes);
    const maxMinutes = Math.max(...times);
    const minMinutes = Math.min(...times);
    return [{
      stationId,
      journeys,
      maxMinutes,
      minMinutes,
      spreadMinutes: maxMinutes - minMinutes,
      averageMinutes: times.reduce((sum, time) => sum + time, 0) / times.length,
      totalTransfers: journeys.reduce((sum, { journey }) => sum + journey.transferCount, 0),
    }];
  });

  const bestMaxMinutes = Math.min(...recommendations.map((item) => item.maxMinutes));
  return recommendations
    .filter((item) => item.maxMinutes <= bestMaxMinutes + 5)
    .sort((a, b) =>
      a.spreadMinutes - b.spreadMinutes
      || a.averageMinutes - b.averageMinutes
      || a.maxMinutes - b.maxMinutes
      || a.totalTransfers - b.totalTransfers,
    )
    .slice(0, limit);
}
