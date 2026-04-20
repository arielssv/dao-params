import { useState, useCallback, useRef } from 'react';

import { fetchGasPrices, fetchEthSsvPrices, fetchEthApr, fetchDaoValues } from '../services/dataFetcher';
import {
  computeGasStats,
  computeEthSsvStats,
  calcNetworkFeeSSV,
  calcMinCollateralSSV,
  calcThresholdSSV,
  calcNetworkFeeETH,
  calcMinCollateralETH,
  calcThresholdETH,
  checkDeviation,
} from '../services/calculations';
import { BLOCKS_PER_YEAR } from '../services/constants';
import type {
  GasPriceEntry,
  EthSsvPriceEntry,
  EthAprResponse,
  DaoValues,
  GasStats,
  EthSsvStats,
  ParameterResult,
} from '../types';

export interface ParametersState {
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  // Liquidation params (always 6m lookback)
  liquidationParams: ParameterResult[];
  gasStats6m: GasStats | null;
  ethSsvStats6m: EthSsvStats | null;
  // Network fee params (month-based)
  networkFeeParams: ParameterResult[];
  networkFeeApr: EthAprResponse | null;
  networkFeeEthSsvAvg: number;
  networkFeeMonth: string; // YYYY-MM label
  networkFeeDateRange: string; // "YYYY-MM-DD to YYYY-MM-DD"
  liquidationDateRange: string; // "YYYY-MM-DD to YYYY-MM-DD"
  // General
  daoValues: DaoValues | null;
  subgraphError: string | null;
  gasData: GasPriceEntry[];
  ethSsvData: EthSsvPriceEntry[];
}

interface CachedData {
  gasData: GasPriceEntry[];
  ethSsvData: EthSsvPriceEntry[];
  daoValues: DaoValues | null;
  subgraphError: string | null;
  // Current on-chain values
  currentSsvNetworkFee: number;
  currentSsvMinCollateral: number;
  currentSsvThreshold: number;
  currentEthNetworkFee: number;
  currentEthMinCollateral: number;
  currentEthThreshold: number;
}

function filterByMonth<T extends { date: string }>(data: T[], yearMonth: string): T[] {
  return data.filter((d) => d.date.startsWith(yearMonth));
}

/** Parse subgraph value that's in wei (divide by 1e18) — networkFee, minimumLiquidationCollateral */
function parseWei(raw: string | null): number {
  if (!raw) return 0;
  return parseFloat(raw) / 1e18;
}

/** Parse subgraph value that's already in human units — liquidationThreshold (blocks) */
function parseRaw(raw: string | null): number {
  if (!raw) return 0;
  return parseFloat(raw);
}

/** Returns last day of a YYYY-MM as YYYY-MM-DD */
function lastDayOfMonth(ym: string): string {
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
}

export function useParameters() {
  const [state, setState] = useState<ParametersState>({
    loading: false,
    error: null,
    lastUpdated: null,
    liquidationParams: [],
    gasStats6m: null,
    ethSsvStats6m: null,
    networkFeeParams: [],
    networkFeeApr: null,
    networkFeeEthSsvAvg: 0,
    networkFeeMonth: '',
    networkFeeDateRange: '',
    liquidationDateRange: '',
    daoValues: null,
    subgraphError: null,
    gasData: [],
    ethSsvData: [],
  });

  // Cache heavy data that doesn't change with period selection
  const cacheRef = useRef<CachedData | null>(null);

  /** Build results from cached data + APR for a specific period */
  function buildResults(cache: CachedData, aprData: EthAprResponse, targetMonth: string, isToday: boolean) {
    const apr31d = aprData.avgApr31d;

    const isSpecificDate = !isToday && targetMonth.length === 10;

    // End date for lookback windows
    const today = new Date().toISOString().split('T')[0];
    let endDate: string;
    if (isToday) endDate = today;
    else if (isSpecificDate) endDate = targetMonth;
    else endDate = lastDayOfMonth(targetMonth);

    // ETH/SSV: average over the target month (for "today" or specific date, the month
    // containing that date — but capped at endDate so future days within the month are excluded)
    let ethSsvFilterMonth: string;
    if (isToday) {
      ethSsvFilterMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    } else if (isSpecificDate) {
      ethSsvFilterMonth = targetMonth.slice(0, 7);
    } else {
      ethSsvFilterMonth = targetMonth;
    }
    const ethSsvMonthData = filterByMonth(cache.ethSsvData, ethSsvFilterMonth)
      .filter((d) => d.date <= endDate);

    // Liquidation params: 6-month lookback ending at the selected period
    // For specific months: 6 full calendar months (e.g. Jan 31 → Aug 1)
    // For "today" or specific date: 6 months back from that date
    let liq6mStartStr: string;
    if (isToday || isSpecificDate) {
      const cutoff = new Date(endDate);
      cutoff.setMonth(cutoff.getMonth() - 6);
      liq6mStartStr = cutoff.toISOString().split('T')[0];
    } else {
      const [ey, em] = endDate.split('-').map(Number);
      const sm = em - 5 <= 0 ? em - 5 + 12 : em - 5;
      const sy = em - 5 <= 0 ? ey - 1 : ey;
      liq6mStartStr = `${sy}-${String(sm).padStart(2, '0')}-01`;
    }
    const gas6m = computeGasStats(cache.gasData.filter((d) => d.date >= liq6mStartStr && d.date <= endDate));
    const ethSsv6m = computeEthSsvStats(cache.ethSsvData.filter((d) => d.date >= liq6mStartStr && d.date <= endDate));

    const ethSsvMonthAvg = ethSsvMonthData.length > 0
      ? ethSsvMonthData.reduce((s, d) => s + d.ethSsv, 0) / ethSsvMonthData.length
      : ethSsv6m.avg;

    const ssvNetworkFee = calcNetworkFeeSSV(apr31d, ethSsvMonthAvg);
    const ethNetworkFee = calcNetworkFeeETH(apr31d);

    const ssvMinCollateral = calcMinCollateralSSV(gas6m, ethSsv6m);
    const ssvThreshold = calcThresholdSSV(gas6m, ethSsv6m);
    const ethMinCollateral = calcMinCollateralETH(gas6m);
    const ethThreshold = calcThresholdETH(gas6m);

    // Date ranges
    const nfStart = new Date(endDate);
    nfStart.setDate(nfStart.getDate() - 30);
    const networkFeeDateRange = `${nfStart.toISOString().split('T')[0]} to ${endDate}`;

    const liquidationDateRange = `${liq6mStartStr} to ${endDate}`;

    const liquidationParams: ParameterResult[] = [
      {
        name: 'SSV Min Liquidation Collateral',
        calculated: ssvMinCollateral,
        current: cache.currentSsvMinCollateral,
        ...checkDeviation(ssvMinCollateral, cache.currentSsvMinCollateral),
        unit: 'SSV',
      },
      {
        name: 'SSV Liquidation Threshold',
        calculated: ssvThreshold,
        current: cache.currentSsvThreshold,
        ...checkDeviation(ssvThreshold, cache.currentSsvThreshold),
        unit: 'blocks',
      },
      {
        name: 'ETH Min Liquidation Collateral',
        calculated: ethMinCollateral,
        current: cache.currentEthMinCollateral,
        ...checkDeviation(ethMinCollateral, cache.currentEthMinCollateral),
        unit: 'ETH',
      },
      {
        name: 'ETH Liquidation Threshold',
        calculated: ethThreshold,
        current: cache.currentEthThreshold,
        ...checkDeviation(ethThreshold, cache.currentEthThreshold),
        unit: 'blocks',
      },
    ];

    const networkFeeParams: ParameterResult[] = [
      {
        name: 'SSV Network Fee',
        calculated: ssvNetworkFee,
        current: cache.currentSsvNetworkFee,
        ...checkDeviation(ssvNetworkFee, cache.currentSsvNetworkFee),
        unit: 'SSV/block',
        calculatedAnnual: ssvNetworkFee * BLOCKS_PER_YEAR,
        currentAnnual: cache.currentSsvNetworkFee * BLOCKS_PER_YEAR,
        unitAnnual: 'SSV/year',
      },
      {
        name: 'ETH Network Fee',
        calculated: ethNetworkFee,
        current: cache.currentEthNetworkFee,
        ...checkDeviation(ethNetworkFee, cache.currentEthNetworkFee),
        unit: 'ETH/block',
        calculatedAnnual: ethNetworkFee * BLOCKS_PER_YEAR,
        currentAnnual: cache.currentEthNetworkFee * BLOCKS_PER_YEAR,
        unitAnnual: 'ETH/year',
      },
    ];

    return {
      liquidationParams,
      networkFeeParams,
      networkFeeApr: aprData,
      networkFeeEthSsvAvg: ethSsvMonthAvg,
      networkFeeMonth: targetMonth,
      networkFeeDateRange,
      liquidationDateRange,
      gasStats6m: gas6m,
      ethSsvStats6m: ethSsv6m,
    };
  }

  /** Full fetch: all data sources. Called on initial load and Refresh. */
  const calculate = useCallback(async (month?: string, forceRefresh = false) => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const targetMonth = month || 'today';
      const isToday = targetMonth === 'today';
      const isSpecificDate = !isToday && targetMonth.length === 10;
      const targetDate = isToday
        ? undefined
        : (isSpecificDate ? targetMonth : lastDayOfMonth(targetMonth));

      // If we have cached data and this isn't a force refresh, only re-fetch APR
      if (cacheRef.current && !forceRefresh) {
        const aprData = await fetchEthApr(targetDate);
        const results = buildResults(cacheRef.current, aprData, targetMonth, isToday);

        setState((s) => ({
          ...s,
          loading: false,
          error: null,
          lastUpdated: new Date(),
          ...results,
          daoValues: cacheRef.current!.daoValues,
          subgraphError: cacheRef.current!.subgraphError,
          gasData: cacheRef.current!.gasData,
          ethSsvData: cacheRef.current!.ethSsvData,
        }));
        return;
      }

      // Full fetch
      let subgraphError: string | null = null;
      const [gasData, ethSsvData, aprData, daoValues] = await Promise.all([
        fetchGasPrices(),
        fetchEthSsvPrices(365),
        fetchEthApr(targetDate),
        fetchDaoValues().catch((err: unknown) => {
          subgraphError = err instanceof Error ? err.message : 'Failed to fetch on-chain values';
          return null;
        }),
      ]);

      // Current on-chain values
      const currentSsvNetworkFee = daoValues ? parseWei(daoValues.networkFeeSSV) : 0;
      const currentSsvMinCollateral = daoValues ? parseWei(daoValues.minimumLiquidationCollateralSSV) : 0;
      const currentSsvThreshold = daoValues ? parseRaw(daoValues.liquidationThresholdSSV) : 0;
      const currentEthNetworkFee = daoValues ? parseWei(daoValues.networkFee) : 0;
      const currentEthMinCollateral = daoValues ? parseWei(daoValues.minimumLiquidationCollateral) : 0;
      const currentEthThreshold = daoValues ? parseRaw(daoValues.liquidationThreshold) : 0;

      // Cache raw data and on-chain values (don't change with period)
      cacheRef.current = {
        gasData, ethSsvData, daoValues, subgraphError,
        currentSsvNetworkFee, currentSsvMinCollateral, currentSsvThreshold,
        currentEthNetworkFee, currentEthMinCollateral, currentEthThreshold,
      };

      const results = buildResults(cacheRef.current, aprData, targetMonth, isToday);

      setState({
        loading: false,
        error: null,
        lastUpdated: new Date(),
        ...results,
        daoValues,
        subgraphError,
        gasData,
        ethSsvData,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to calculate parameters',
      }));
    }
  }, []);

  /** Force refresh: clears cache and re-fetches everything */
  const refresh = useCallback(async (month?: string) => {
    cacheRef.current = null;
    return calculate(month, true);
  }, [calculate]);

  return { ...state, calculate, refresh };
}
