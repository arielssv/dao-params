import {
  BLOCKS_PER_YEAR,
  BLOCKS_PER_DAY,
  GAS_UNITS_LIQUIDATION,
  NETWORK_FEE_PERCENT,
  DIP49_ETHSSV_CAP,
} from './constants';

import type { GasPriceEntry, EthSsvPriceEntry, GasStats, EthSsvStats } from '../types';

// ── Gas Statistics ──────────────────────────────────────────────────────────

export function computeGasStats(data: GasPriceEntry[]): GasStats {
  if (data.length === 0) return { mean: 0, stdev: 0, threshold: 0, maxConsecHighGasDays: 0 };

  const values = data.map((d) => d.gwei);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  // Sample standard deviation (ddof=1, equivalent to Excel STDEV)
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  const stdev = Math.sqrt(variance);
  const threshold = mean + stdev;

  // Longest consecutive streak where daily gas > μ + σ
  let maxConsec = 0;
  let curConsec = 0;
  for (const v of values) {
    if (v > threshold) {
      curConsec++;
      maxConsec = Math.max(maxConsec, curConsec);
    } else {
      curConsec = 0;
    }
  }

  return { mean, stdev, threshold, maxConsecHighGasDays: maxConsec };
}

// ── ETH/SSV Statistics ──────────────────────────────────────────────────────

export function computeEthSsvStats(data: EthSsvPriceEntry[]): EthSsvStats {
  if (data.length === 0) return { avg: 0, max: 0, maxDev: 0 };

  const ratios = data.map((d) => d.ethSsv);
  const avg = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  const max = Math.max(...ratios);
  const maxDev = max / avg;

  return { avg, max, maxDev };
}

// ── SSV-Denominated Parameters (existing clusters) ─────────────────────────

/** Network Fee (SSV) = 32 × APR × 1% × min(ETH/SSV_30d_avg, 700) / BLOCKS_PER_YEAR */
export function calcNetworkFeeSSV(apr30d: number, ethSsvAvg: number): number {
  const cappedRatio = Math.min(ethSsvAvg, DIP49_ETHSSV_CAP);
  return (32 * apr30d * NETWORK_FEE_PERCENT * cappedRatio) / BLOCKS_PER_YEAR;
}

/** Min Liquidation Collateral (SSV) = 252,800 × (μ + σ) × 1e-9 × ETH/SSV_avg × MaxDev */
export function calcMinCollateralSSV(gasStats: GasStats, ethSsvStats: EthSsvStats): number {
  return (
    GAS_UNITS_LIQUIDATION *
    (gasStats.mean + gasStats.stdev) *
    1e-9 *
    ethSsvStats.avg *
    ethSsvStats.maxDev
  );
}

/** Liquidation Threshold (SSV) = (maxConsecDays + 1) × MaxDev → ceil to weeks → blocks */
export function calcThresholdSSV(gasStats: GasStats, ethSsvStats: EthSsvStats): number {
  const rawDays = (gasStats.maxConsecHighGasDays + 1) * ethSsvStats.maxDev;
  const ceiledWeeks = Math.ceil(rawDays / 7) * 7;
  return ceiledWeeks * BLOCKS_PER_DAY;
}

// ── ETH-Denominated Parameters (new clusters per DIP-X) ────────────────────

/** Network Fee (ETH) = 32 × APR × 1% / BLOCKS_PER_YEAR */
export function calcNetworkFeeETH(apr30d: number): number {
  return (32 * apr30d * NETWORK_FEE_PERCENT) / BLOCKS_PER_YEAR;
}

/** Min Liquidation Collateral (ETH) = 252,800 × (μ + σ) × 1e-9 */
export function calcMinCollateralETH(gasStats: GasStats): number {
  return GAS_UNITS_LIQUIDATION * (gasStats.mean + gasStats.stdev) * 1e-9;
}

/** Liquidation Threshold (ETH) = (maxConsecDays + 1) → raw days → blocks (no week rounding) */
export function calcThresholdETH(gasStats: GasStats): number {
  return (gasStats.maxConsecHighGasDays + 1) * BLOCKS_PER_DAY;
}

// ── Deviation Check ─────────────────────────────────────────────────────────

export interface DeviationResult {
  deviation: number;
  exceeds15pct: boolean;
}

/** Returns deviation info: |calculated - current| / current */
export function checkDeviation(calculated: number, current: number): DeviationResult {
  if (current === 0) {
    return { deviation: calculated === 0 ? 0 : Infinity, exceeds15pct: calculated !== 0 };
  }
  const deviation = Math.abs(calculated - current) / current;
  return { deviation, exceeds15pct: deviation > 0.15 };
}
