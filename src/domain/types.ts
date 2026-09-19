export type OriginOption = {
  stationId: string;
  accessMinutes: number;
};

export type Participant = {
  id: string;
  name: string;
  origins: OriginOption[];
};

export type Journey = {
  originStationId: string;
  destinationStationId: string;
  totalMinutes: number;
  transferCount: number;
  lines: string[];
};

export type JourneyMatrix = Map<string, Map<string, Journey>>;

export interface TravelTimeProvider {
  getJourneys(
    participants: Participant[],
    destinationStationIds: string[],
  ): Promise<JourneyMatrix>;
}

export type Recommendation = {
  stationId: string;
  journeys: Array<{ participant: Participant; journey: Journey }>;
  maxMinutes: number;
  minMinutes: number;
  spreadMinutes: number;
  averageMinutes: number;
  totalTransfers: number;
};
