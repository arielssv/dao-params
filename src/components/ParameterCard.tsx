import { useState } from 'react';

import { BLOCKS_PER_DAY } from '../services/constants';
import type { ParameterResult } from '../types';

interface ParameterCardProps {
  param: ParameterResult;
  inputs?: { label: string; value: string }[];
}

function formatValue(value: number, unit: string): string {
  if (unit === 'blocks') return Math.round(value).toLocaleString();
  if (unit === 'SSV' || unit === 'ETH') return value.toPrecision(6);
  if (unit.includes('/year')) return value.toPrecision(6);
  // per-block fees — show as full decimal (ether-style) instead of scientific notation
  return value.toFixed(18).replace(/0+$/, '').replace(/\.$/, '');
}

function blocksToDays(blocks: number): string {
  const days = Math.round(blocks / BLOCKS_PER_DAY);
  return `~${days} days`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center ml-1.5 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
      title="Copy value"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

export function ParameterCard({ param, inputs }: ParameterCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasAnnual = param.calculatedAnnual !== undefined && param.unitAnnual;

  const deviationStr = isFinite(param.deviation) ? `${(param.deviation * 100).toFixed(1)}%` : 'N/A';
  // exceeds15pct = needs a DAO vote to change → green (actionable)
  // within 15% = no action needed → neutral/gray
  const badgeBg = param.exceeds15pct
    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';

  // Primary display values (annual for network fee, base for liquidation)
  const primaryCurrent = hasAnnual ? param.currentAnnual! : param.current;
  const primaryCalculated = hasAnnual ? param.calculatedAnnual! : param.calculated;
  const primaryUnit = hasAnnual ? param.unitAnnual! : param.unit;
  const isBlocks = primaryUnit === 'blocks';

  const primaryCurrentStr = formatValue(primaryCurrent, primaryUnit);
  const primaryCalculatedStr = formatValue(primaryCalculated, primaryUnit);

  return (
    <div className="bg-white rounded-lg shadow dark:bg-gray-800">
      {/* Clickable header row */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="w-full cursor-pointer text-left px-5 py-3.5 flex items-start hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {/* Name */}
        <div className="w-[220px] flex-shrink-0 pt-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{param.name}</h3>
        </div>

        {/* Current */}
        <div className="flex-1 text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Current</div>
          <div className="text-sm font-mono font-semibold dark:text-gray-100 inline-flex items-center">
            {primaryCurrentStr}
            <CopyButton value={primaryCurrentStr} />
          </div>
          <div className="text-[10px] text-gray-400">
            {primaryUnit}
            {isBlocks && primaryCurrent > 0 && (
              <span className="ml-1">({blocksToDays(primaryCurrent)})</span>
            )}
          </div>
        </div>

        {/* Calculated */}
        <div className="flex-1 text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Calculated</div>
          <div className="text-sm font-mono font-semibold dark:text-gray-100 inline-flex items-center">
            {primaryCalculatedStr}
            <CopyButton value={primaryCalculatedStr} />
          </div>
          <div className="text-[10px] text-gray-400">
            {primaryUnit}
            {isBlocks && primaryCalculated > 0 && (
              <span className="ml-1">({blocksToDays(primaryCalculated)})</span>
            )}
          </div>
        </div>

        {/* Deviation — badge, aligned to top */}
        <div className="w-[100px] flex-shrink-0 text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Deviation</div>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-mono font-bold ${badgeBg}`}>
            {deviationStr}
          </span>
        </div>

        {/* Expand/collapse arrow */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-3 mt-3 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100 dark:border-gray-700">
          {/* Per-block values for network fee (shown as secondary when annual is primary) */}
          {hasAnnual && (
            <div className="mt-3 mb-3 flex gap-10">
              <div>
                <div className="text-[10px] text-gray-400 uppercase">Current (per block)</div>
                <div className="text-xs font-mono text-gray-600 dark:text-gray-300 inline-flex items-center">
                  {formatValue(param.current, param.unit)} <span className="text-gray-400 ml-1">{param.unit}</span>
                  <CopyButton value={formatValue(param.current, param.unit)} />
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase">Calculated (per block)</div>
                <div className="text-xs font-mono text-gray-600 dark:text-gray-300 inline-flex items-center">
                  {formatValue(param.calculated, param.unit)} <span className="text-gray-400 ml-1">{param.unit}</span>
                  <CopyButton value={formatValue(param.calculated, param.unit)} />
                </div>
              </div>
            </div>
          )}

          {/* Calculation inputs */}
          {inputs && inputs.length > 0 && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
              {inputs.map((input) => (
                <div key={input.label}>
                  <div className="text-[10px] text-gray-400 uppercase">{input.label}</div>
                  <div className="text-xs font-mono dark:text-gray-300">{input.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
