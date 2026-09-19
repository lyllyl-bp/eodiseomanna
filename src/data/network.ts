import { generatedLines, generatedRideEdges, generatedTransferEdges } from './network.generated';

export type LineDefinition = {
  id: string;
  label: string;
  color: string;
  stations: readonly string[];
  waitMinutes: number;
};

export const lines: LineDefinition[] = generatedLines.map((line) => ({ ...line }));

export const rideEdges = generatedRideEdges;
export const transferEdges = generatedTransferEdges;

const stationLineMap = new Map<string, LineDefinition[]>();

for (const line of lines) {
  for (const station of line.stations) {
    stationLineMap.set(station, [...(stationLineMap.get(station) ?? []), line]);
  }
}

export const stations = [...stationLineMap.entries()]
  .map(([id, stationLines]) => ({ id, name: id, lines: stationLines }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

export const stationById = new Map(stations.map((station) => [station.id, station]));

export const displayStationName = (name: string) => name.endsWith('역') ? name : `${name}역`;

export function getLine(id: string) {
  return lines.find((line) => line.id === id);
}
