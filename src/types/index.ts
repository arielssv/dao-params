export interface GasPriceEntry {
  date: string;
  gwei: number;
}

export interface EthSsvPriceEntry {
  date: string;
  ssvUsdt: number;
  ethUsdt: number;
  ethSsv: number;
}

export interface EthAprEntry {
  date: string;
  apr: number;
}

export interface EthAprResponse {
  day: number;
  date: string;
  apr: number;
  avgApr7d: number;
  avgApr31d: number;
  clApr: number;
  elApr: number;
}

export interface DaoValues {
  networkFee: string;
  minimumLiquidationCollateral: string;
  liquidationThreshold: string;
  networkFeeSSV: string;
  minimumLiquidationCollateralSSV: string;
  liquidationThresholdSSV: string;
}

export interface GasStats {
  mean: number;
  stdev: number;
  threshold: number;
  maxConsecHighGasDays: number;
}

export interface EthSsvStats {
  avg: number;
  max: number;
  maxDev: number;
}

export interface ParameterResult {
  name: string;
  calculated: number;
  current: number;
  deviation: number;
  exceeds15pct: boolean;
  unit: string;
  calculatedAnnual?: number;
  currentAnnual?: number;
  unitAnnual?: string;
}
