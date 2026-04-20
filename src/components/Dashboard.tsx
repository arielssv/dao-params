import { useEffect, useState } from 'react';

import { useParameters } from '../hooks/useParameters';
import { ParameterCard } from './ParameterCard';
import {
  BLOCKS_PER_DAY,
  BLOCKS_PER_YEAR,
  GAS_UNITS_LIQUIDATION,
  GAS_UNITS_LIQUIDATION_SSV,
  NETWORK_FEE_PERCENT,
  DIP49_ETHSSV_CAP,
} from '../services/constants';

type DenomFilter = 'ssv' | 'eth';

const ETH_LOGO = 'https://assets.coingecko.com/coins/images/279/small/ethereum.png';
const SSV_LOGO = 'https://coin-images.coingecko.com/coins/images/19155/small/ssv.png';

function monthLabel(ym: string): string {
  if (ym === 'today') return 'Today';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (ym.length === 10) {
    const [year, month, day] = ym.split('-').map(Number);
    return `${names[month - 1]} ${day}, ${year}`;
  }
  const [year, month] = ym.split('-').map(Number);
  return `${names[month - 1]} ${year}`;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function blocksToDays(blocks: number): string {
  return `~${Math.round(blocks / BLOCKS_PER_DAY)} days`;
}

function weiToAnnual(wei: string): string {
  const perBlock = parseFloat(wei) / 1e18;
  const annual = perBlock * BLOCKS_PER_YEAR;
  return annual.toPrecision(6);
}

function weiToHuman(wei: string): string {
  const val = parseFloat(wei) / 1e18;
  return val.toPrecision(6);
}

function CollapsibleSection({ title, defaultExpanded = true, children }: {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="bg-white rounded-lg shadow dark:bg-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors rounded-lg"
      >
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const {
    loading,
    error,
    liquidationParams,
    gasStats6m,
    ethSsvStats6m,
    networkFeeParams,
    networkFeeApr,
    networkFeeEthSsvAvg,
    networkFeeMonth,
    daoValues,
    subgraphError,
    networkFeeDateRange,
    liquidationDateRange,
    calculate,
  } = useParameters();

  const [denomFilter, setDenomFilter] = useState<DenomFilter>('eth');
  const [selectedMonth, setSelectedMonth] = useState('today');
  const [customDate, setCustomDate] = useState('');

  const isCustomDateActive = selectedMonth.length === 10;

  useEffect(() => {
    calculate();
  }, [calculate]);

  function handleMonthFetch(month: string) {
    setSelectedMonth(month);
    if (month.length !== 10) setCustomDate('');
    calculate(month);
  }

  function handleCustomDate(date: string) {
    if (!date) return;
    setCustomDate(date);
    setSelectedMonth(date);
    calculate(date);
  }

  // Generate month options: "Today" + last 6 months
  const monthOptions: string[] = ['today'];
  for (let i = 1; i <= 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // Filter params by denomination
  function filterByDenom<T extends { name: string }>(params: T[]): T[] {
    if (denomFilter === 'ssv') return params.filter((p) => p.name.startsWith('SSV'));
    return params.filter((p) => p.name.startsWith('ETH'));
  }

  const filteredLiquidation = filterByDenom(liquidationParams);
  const filteredNetworkFee = filterByDenom(networkFeeParams);
  const allFiltered = [...filteredNetworkFee, ...filteredLiquidation];

  // Input details for expandable sections
  function getInputs(name: string): { label: string; value: string }[] {
    if (name.includes('Network Fee')) {
      const inputs = [
        { label: 'APR Date Range', value: networkFeeDateRange || 'N/A' },
      ];
      if (networkFeeApr) {
        inputs.push({ label: '31d Trailing Avg APR', value: `${(networkFeeApr.avgApr31d * 100).toFixed(4)}%` });
      }
      if (name.startsWith('SSV')) {
        inputs.push({ label: `ETH/SSV Avg (${networkFeeMonth ? monthLabel(networkFeeMonth) : ''})`, value: networkFeeEthSsvAvg.toFixed(2) });
        inputs.push({ label: 'ETH/SSV (capped 700)', value: Math.min(networkFeeEthSsvAvg, DIP49_ETHSSV_CAP).toFixed(2) });
      }
      return inputs;
    }

    // Liquidation params
    const gas = gasStats6m;
    const inputs = [
      { label: 'Lookback', value: liquidationDateRange || '6 months' },
    ];
    if (gas) {
      inputs.push({ label: 'Gas μ (Gwei)', value: gas.mean.toFixed(4) });
      inputs.push({ label: 'Gas σ (Gwei)', value: gas.stdev.toFixed(4) });
      inputs.push({ label: 'Max Consec High Gas Days', value: gas.maxConsecHighGasDays.toString() });
    }
    if (name.startsWith('SSV') && ethSsvStats6m) {
      inputs.push({ label: 'ETH/SSV Avg (6m)', value: ethSsvStats6m.avg.toFixed(2) });
      inputs.push({ label: 'ETH/SSV Max Dev', value: ethSsvStats6m.maxDev.toFixed(4) });
    }
    return inputs;
  }

  // Contract values for the selected denomination
  function getContractValues(): { label: string; value: string }[] {
    if (!daoValues) return [];

    if (denomFilter === 'ssv') {
      return [
        { label: 'Network Fee', value: `${weiToAnnual(daoValues.networkFeeSSV)} SSV/year (${daoValues.networkFeeSSV} wei/block)` },
        { label: 'Min Liquidation Collateral', value: `${weiToHuman(daoValues.minimumLiquidationCollateralSSV)} SSV (${daoValues.minimumLiquidationCollateralSSV} wei)` },
        { label: 'Liquidation Threshold', value: `${parseInt(daoValues.liquidationThresholdSSV).toLocaleString()} blocks (${blocksToDays(parseInt(daoValues.liquidationThresholdSSV))})` },
      ];
    }

    return [
      { label: 'Network Fee', value: `${weiToAnnual(daoValues.networkFee)} ETH/year (${daoValues.networkFee} wei/block)` },
      { label: 'Min Liquidation Collateral', value: `${weiToHuman(daoValues.minimumLiquidationCollateral)} ETH (${daoValues.minimumLiquidationCollateral} wei)` },
      { label: 'Liquidation Threshold', value: `${parseInt(daoValues.liquidationThreshold).toLocaleString()} blocks (${blocksToDays(parseInt(daoValues.liquidationThreshold))})` },
    ];
  }

  const contractValues = getContractValues();

  return (
    <div className="space-y-4">
      {/* Header */}
      <h2 className="text-lg font-semibold dark:text-white">SSV Network Governance Params Calculations</h2>

      {/* Subgraph error notification */}
      {subgraphError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm flex items-start gap-2 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300">
          <span className="mt-0.5 flex-shrink-0">&#9888;</span>
          <div>
            <span className="font-medium">Unable to fetch on-chain values.</span>
            {' '}Current values unavailable — deviation checks will show 0.
            <div className="text-xs mt-1 opacity-75">{subgraphError}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm dark:bg-red-900/30 dark:border-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Controls row: denomination filter (left) + period selector (right) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Denomination filter — token icons */}
        <div className="flex items-center gap-2">
          {([
            { key: 'eth' as const, logo: ETH_LOGO, alt: 'ETH' },
            { key: 'ssv' as const, logo: SSV_LOGO, alt: 'SSV' },
          ]).map(({ key, logo, alt }) => (
            <button
              key={key}
              onClick={() => setDenomFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
                denomFilter === key
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700'
              }`}
            >
              <img src={logo} alt={alt} className="w-5 h-5 rounded-full" />
              <span className={`text-xs font-medium ${denomFilter === key ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {alt}
              </span>
            </button>
          ))}
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Period</span>
          <div className="flex items-center gap-1">
            {monthOptions.map((ym) => (
              <button
                key={ym}
                onClick={() => handleMonthFetch(ym)}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  selectedMonth === ym
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 hover:bg-gray-100 text-gray-600 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {monthLabel(ym)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 pl-2 ml-1 border-l border-gray-200 dark:border-gray-600">
            <span className="text-xs text-gray-400 dark:text-gray-500">or pick</span>
            <input
              type="date"
              value={customDate}
              max={todayIso()}
              onChange={(e) => handleCustomDate(e.target.value)}
              className={`px-2 py-1 text-xs rounded border transition-colors bg-white dark:bg-gray-800 dark:text-gray-200 ${
                isCustomDateActive
                  ? 'border-blue-600 ring-1 ring-blue-600 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Active date range indicator */}
      {(networkFeeDateRange || liquidationDateRange) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 -mt-1">
          <span className="font-medium text-gray-600 dark:text-gray-300">
            Showing: {monthLabel(selectedMonth)}
          </span>
          {networkFeeDateRange && (
            <span>
              <span className="font-medium">Network Fee window:</span> {networkFeeDateRange}
            </span>
          )}
          {liquidationDateRange && (
            <span>
              <span className="font-medium">Liquidation window:</span> {liquidationDateRange}
            </span>
          )}
        </div>
      )}

      {/* All parameter cards — consecutive, no section headers */}
      <div className={`space-y-2 relative transition-opacity ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">Calculating...</div>
          </div>
        )}
        {allFiltered.map((p) => (
          <ParameterCard key={p.name} param={p} inputs={getInputs(p.name)} />
        ))}
      </div>

      {/* Protocol Constants — collapsible card */}
      <CollapsibleSection title="Protocol Constants" defaultExpanded={true}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-3 pt-3">
          {[
            { label: 'Blocks/Day', value: BLOCKS_PER_DAY.toLocaleString() },
            { label: 'Blocks/Year', value: BLOCKS_PER_YEAR.toLocaleString() },
            { label: 'Gas Units (Liquidation)', value: denomFilter === 'ssv' ? GAS_UNITS_LIQUIDATION_SSV.toLocaleString() : GAS_UNITS_LIQUIDATION.toLocaleString() },
            { label: 'Network Fee %', value: `${NETWORK_FEE_PERCENT * 100}%` },
            ...(denomFilter === 'ssv' ? [{ label: 'DIP-49 ETH/SSV Cap', value: DIP49_ETHSSV_CAP.toString() }] : []),
          ].map((c) => (
            <div key={c.label}>
              <div className="text-xs text-gray-500 dark:text-gray-400">{c.label}</div>
              <div className="text-sm font-mono font-medium dark:text-gray-200">{c.value}</div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Contract Values — collapsible card, filtered by denomination */}
      <CollapsibleSection title="Contract Values" defaultExpanded={true}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 pt-3">
          {daoValues ? (
            contractValues.map((cv) => (
              <div key={cv.label}>
                <div className="text-xs text-gray-500 dark:text-gray-400">{cv.label}</div>
                <div className="text-sm font-mono font-medium dark:text-gray-200">
                  {cv.value}
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-400 col-span-3">
              {subgraphError ? 'Contract unavailable' : 'Loading...'}
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
