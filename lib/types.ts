export type Lane = 'top' | 'jungle' | 'mid' | 'adc' | 'sup';

export type MatchRecord = {
  matchId: string;
  puuid: string;
  championId: number;
  win: boolean;
  queueId: number;
  gameEndAt: number;
  role?: string;
  kda?: [number, number, number];
};

export type Account = {
  gameName: string;
  tagLine: string;
  puuid: string;
  region: string;
  summonerLevel: number | null;
  status: string;
};

export type ChampionMeta = {
  id: number;
  alias: string;
  name: string;
  tags: string[];
  lanes: Lane[];
};

export type ChampionStat = {
  championId: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  lastPlayedAt: number;
  matches: MatchRecord[];
};

export type AccountStat = {
  account: Account;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  lastPlayedAt: number;
};

export type Summary = {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  latestMatchAt: number;
};
