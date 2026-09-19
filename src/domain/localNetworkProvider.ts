import { getLine, rideEdges, stationById, transferEdges } from '../data/network';
import type { Journey, JourneyMatrix, Participant, TravelTimeProvider } from './types';

type Edge = { to: string; minutes: number; isTransfer: boolean };
type Visit = { node: string; minutes: number; transfers: number };

const graph = new Map<string, Edge[]>();
const stateId = (lineId: string, stationId: string) => `${lineId}::${stationId}`;

function addEdge(from: string, edge: Edge) {
  graph.set(from, [...(graph.get(from) ?? []), edge]);
}

for (const edge of rideEdges) {
  const from = stateId(edge.lineId, edge.from);
  const to = stateId(edge.lineId, edge.to);
  addEdge(from, { to, minutes: edge.minutes, isTransfer: false });
  addEdge(to, { to: from, minutes: edge.minutes, isTransfer: false });
}

const transferWalkMinutes = new Map(
  transferEdges.map((edge) => [
    `${edge.stationId}::${edge.fromLineId}::${edge.toLineId}`,
    edge.walkMinutes,
  ]),
);

for (const station of stationById.values()) {
  for (const from of station.lines) {
    for (const to of station.lines) {
      if (from.id === to.id) continue;
      const directKey = `${station.id}::${from.id}::${to.id}`;
      const reverseKey = `${station.id}::${to.id}::${from.id}`;
      const walkMinutes = transferWalkMinutes.get(directKey) ?? transferWalkMinutes.get(reverseKey);
      addEdge(stateId(from.id, station.id), {
        to: stateId(to.id, station.id),
        minutes: walkMinutes === undefined ? 5 : walkMinutes + to.waitMinutes,
        isTransfer: true,
      });
    }
  }
}

function shortestJourneys(originStationId: string) {
  const distances = new Map<string, number>();
  const transfers = new Map<string, number>();
  const previous = new Map<string, string>();
  const queue: Visit[] = [];
  const origin = stationById.get(originStationId);

  if (!origin) return { distances, transfers, previous };

  for (const line of origin.lines) {
    const node = stateId(line.id, origin.id);
    distances.set(node, line.waitMinutes);
    transfers.set(node, 0);
    queue.push({ node, minutes: line.waitMinutes, transfers: 0 });
  }

  while (queue.length > 0) {
    queue.sort((a, b) => a.minutes - b.minutes || a.transfers - b.transfers);
    const current = queue.shift()!;
    if (current.minutes !== distances.get(current.node)) continue;

    for (const edge of graph.get(current.node) ?? []) {
      const nextMinutes = current.minutes + edge.minutes;
      const nextTransfers = current.transfers + (edge.isTransfer ? 1 : 0);
      const knownMinutes = distances.get(edge.to) ?? Number.POSITIVE_INFINITY;
      const knownTransfers = transfers.get(edge.to) ?? Number.POSITIVE_INFINITY;

      if (nextMinutes < knownMinutes || (nextMinutes === knownMinutes && nextTransfers < knownTransfers)) {
        distances.set(edge.to, nextMinutes);
        transfers.set(edge.to, nextTransfers);
        previous.set(edge.to, current.node);
        queue.push({ node: edge.to, minutes: nextMinutes, transfers: nextTransfers });
      }
    }
  }

  return { distances, transfers, previous };
}

function bestJourney(
  originStationId: string,
  destinationStationId: string,
  search = shortestJourneys(originStationId),
): Journey | undefined {
  const destination = stationById.get(destinationStationId);
  if (!destination) return undefined;
  if (originStationId === destinationStationId) {
    return {
      originStationId,
      destinationStationId,
      totalMinutes: 0,
      transferCount: 0,
      lines: [],
    };
  }
  const candidates = destination.lines
    .map((line) => stateId(line.id, destinationStationId))
    .filter((node) => search.distances.has(node))
    .sort((a, b) => (search.distances.get(a)! - search.distances.get(b)!) || (search.transfers.get(a)! - search.transfers.get(b)!));
  const end = candidates[0];
  if (!end) return undefined;

  const states: string[] = [];
  let cursor: string | undefined = end;
  while (cursor) {
    states.unshift(cursor);
    cursor = search.previous.get(cursor);
  }
  const routeLines = [...new Set(states.map((node) => node.split('::')[0]))];

  return {
    originStationId,
    destinationStationId,
    totalMinutes: search.distances.get(end)!,
    transferCount: search.transfers.get(end)!,
    lines: routeLines,
  };
}

export class LocalNetworkProvider implements TravelTimeProvider {
  async getJourneys(participants: Participant[], destinationStationIds: string[]): Promise<JourneyMatrix> {
    const matrix: JourneyMatrix = new Map();

    for (const participant of participants) {
      const participantJourneys = new Map<string, Journey>();
      const originSearches = participant.origins.map((origin) => ({
        origin,
        search: shortestJourneys(origin.stationId),
      }));
      for (const destinationId of destinationStationIds) {
        const choices = originSearches
          .map(({ origin, search }) => {
            const journey = bestJourney(origin.stationId, destinationId, search);
            return journey && { ...journey, totalMinutes: journey.totalMinutes + origin.accessMinutes };
          })
          .filter((journey): journey is Journey => Boolean(journey))
          .sort((a, b) => a.totalMinutes - b.totalMinutes || a.transferCount - b.transferCount);
        if (choices[0]) participantJourneys.set(destinationId, choices[0]);
      }
      matrix.set(participant.id, participantJourneys);
    }

    return matrix;
  }
}
