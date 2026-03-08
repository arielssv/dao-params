import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend,
} from 'recharts';

import { fetchGasPrices, fetchEthSsvPrices, fetchEthApr } from '../services/dataFetcher';
import type { GasPriceEntry, EthSsvPriceEntry, EthAprResponse } from '../types';

type DataTab = 'gas' | 'ethssv' | 'apr';

function computeGasStats(data: GasPriceEntry[]) {
  if (data.length === 0) return { mean: 0, stdev: 0, threshold: 0, maxConsecHighDays: 0 };
  const values = data.map((d) => d.gwei);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  const stdev = Math.sqrt(variance);
  const threshold = mean + stdev;

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

  return { mean, stdev, threshold, maxConsecHighDays: maxConsec };
}

function computeEthSsvStats(data: EthSsvPriceEntry[]) {
  if (data.length === 0) return { avg: 0, max: 0, maxDev: 0 };
  const ratios = data.map((d) => d.ethSsv);
  const avg = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  const max = Math.max(...ratios);
  const maxDev = max / avg;
  return { avg, max, maxDev };
}

function exportData(data: unknown[], filename: string, format: 'csv' | 'json') {
  let content: string;
  let mime: string;

  if (format === 'json') {
    content = JSON.stringify(data, null, 2);
    mime = 'application/json';
  } else {
    if (data.length === 0) return;
    const headers = Object.keys(data[0] as Record<string, unknown>);
    const rows = data.map((row) =>
      headers.map((h) => (row as Record<string, unknown>)[h]).join(',')
    );
    content = [headers.join(','), ...rows].join('\n');
    mime = 'text/csv';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(date: string): string {
  return date.length > 10 ? date.slice(0, 10) : date;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function filterByDateRange<T extends { date: string }>(data: T[], from: string, to: string): T[] {
  return data.filter((d) => {
    const date = formatDate(d.date);
    return date >= from && date <= to;
  });
}

export function DataExplorer() {
  const [tab, setTab] = useState<DataTab>('gas');
  const [gasData, setGasData] = useState<GasPriceEntry[]>([]);
  const [ethSsvData, setEthSsvData] = useState<EthSsvPriceEntry[]>([]);
  const [aprResponse, setAprResponse] = useState<EthAprResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [aprLoading, setAprLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Date range state (for gas + ETH/SSV)
  const [dateFrom, setDateFrom] = useState(daysAgo(365));
  const [dateTo, setDateTo] = useState(daysAgo(0));

  // APR date picker
  const [aprDate, setAprDate] = useState('');

  const fetchGasAndPrices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const errors: string[] = [];

    await Promise.all([
      fetchGasPrices()
        .then(setGasData)
        .catch((err) => errors.push(`Gas: ${err.message}`)),
      fetchEthSsvPrices(365)
        .then(setEthSsvData)
        .catch((err) => errors.push(`ETH/SSV: ${err.message}`)),
    ]);

    setLastUpdated(new Date());
    if (errors.length > 0) setError(errors.join('; '));
    setLoading(false);
  }, []);

  const fetchAprData = useCallback(async (date?: string) => {
    setAprLoading(true);
    setError(null);
    try {
      const result = await fetchEthApr(date);
      setAprResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch APR');
    } finally {
      setAprLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGasAndPrices();
    fetchAprData(); // fetch latest on mount
  }, [fetchGasAndPrices, fetchAprData]);

  // Filtered data based on date range
  const filteredGas = useMemo(() => filterByDateRange(gasData, dateFrom, dateTo), [gasData, dateFrom, dateTo]);
  const filteredEthSsv = useMemo(() => filterByDateRange(ethSsvData, dateFrom, dateTo), [ethSsvData, dateFrom, dateTo]);

  const gasStats = computeGasStats(filteredGas);
  const ethSsvStats = computeEthSsvStats(filteredEthSsv);

  const tabs: { key: DataTab; label: string }[] = [
    { key: 'gas', label: 'Gas Prices' },
    { key: 'ethssv', label: 'ETH/SSV Prices' },
    { key: 'apr', label: 'ETH APR' },
  ];

  const presets: { label: string; days: number }[] = [
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
    { label: '6m', days: 183 },
    { label: '1y', days: 365 },
    { label: 'All', days: 0 },
  ];

  function applyPreset(days: number) {
    if (days === 0) {
      const allDates = [
        ...gasData.map((d) => d.date),
        ...ethSsvData.map((d) => d.date),
      ].map(formatDate).filter(Boolean);
      setDateFrom(allDates.length > 0 ? allDates.sort()[0] : daysAgo(365));
    } else {
      setDateFrom(daysAgo(days));
    }
    setDateTo(daysAgo(0));
  }

  // CL/EL breakdown data for bar chart
  const aprBreakdown = aprResponse ? [
    { name: 'Consensus Layer (CL)', value: aprResponse.clApr * 100, color: '#3b82f6' },
    { name: 'Execution Layer (EL)', value: aprResponse.elApr * 100, color: '#f59e0b' },
  ] : [];

  const clPct = aprResponse && aprResponse.apr > 0
    ? ((aprResponse.clApr / aprResponse.apr) * 100).toFixed(1)
    : '0';
  const elPct = aprResponse && aprResponse.apr > 0
    ? ((aprResponse.elApr / aprResponse.apr) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-4">
      {/* Header with tabs + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchGasAndPrices}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Date range picker (for gas + ETH/SSV) */}
      {tab !== 'apr' && (
        <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap items-center gap-3 dark:bg-gray-800">
          <span className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Date Range</span>
          <div className="flex items-center gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-100 text-gray-600 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm dark:bg-red-900/30 dark:border-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Gas Prices Tab */}
      {tab === 'gas' && (
        <div className="space-y-4">
          <StatsPanel
            title={`Gas Price Statistics (${dateFrom} to ${dateTo})`}
            stats={[
              { label: 'Data Points', value: filteredGas.length.toString() },
              { label: 'μ Avg Gas (Gwei)', value: gasStats.mean.toFixed(4) },
              { label: 'σ Std Dev (Gwei)', value: gasStats.stdev.toFixed(4) },
              { label: 'μ+σ High Gas Threshold', value: gasStats.threshold.toFixed(4) },
              { label: 'Max Consec High Gas Days', value: gasStats.maxConsecHighDays.toString() },
            ]}
          />
          <ChartCard title="Daily Average Gas Price (Gwei)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredGas}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} interval="preserveStartEnd" />
                <YAxis fontSize={11} />
                <Tooltip labelFormatter={(label) => formatDate(String(label ?? ''))} />
                <Line type="monotone" dataKey="gwei" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ExportButtons data={filteredGas} filename={`gas-prices_${dateFrom}_${dateTo}`} />
          <DataTable
            columns={['Date', 'Gwei']}
            rows={filteredGas.slice().reverse().map((d) => [formatDate(d.date), d.gwei.toFixed(4)])}
          />
        </div>
      )}

      {/* ETH/SSV Prices Tab */}
      {tab === 'ethssv' && (
        <div className="space-y-4">
          <StatsPanel
            title={`ETH/SSV Price Statistics (${dateFrom} to ${dateTo})`}
            stats={[
              { label: 'Data Points', value: filteredEthSsv.length.toString() },
              { label: 'ETH/SSV Avg', value: ethSsvStats.avg.toFixed(2) },
              { label: 'ETH/SSV Max', value: ethSsvStats.max.toFixed(2) },
              { label: 'Max Deviation', value: ethSsvStats.maxDev.toFixed(4) },
            ]}
          />
          <ChartCard title="ETH/SSV Daily Close Ratio">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredEthSsv}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} interval="preserveStartEnd" />
                <YAxis fontSize={11} />
                <Tooltip labelFormatter={(label) => formatDate(String(label ?? ''))} />
                <Line type="monotone" dataKey="ethSsv" stroke="#8b5cf6" dot={false} strokeWidth={1.5} name="ETH/SSV" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="ETH Price (USD)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredEthSsv}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} interval="preserveStartEnd" />
                <YAxis fontSize={11} tickFormatter={(v: number) => `$${v.toLocaleString()}`} />
                <Tooltip labelFormatter={(label) => formatDate(String(label ?? ''))} formatter={(value) => [`$${Number(value).toFixed(2)}`, 'ETH/USD']} />
                <Line type="monotone" dataKey="ethUsdt" stroke="#3b82f6" dot={false} strokeWidth={1.5} name="ETH/USD" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="SSV Price (USD)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredEthSsv}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} interval="preserveStartEnd" />
                <YAxis fontSize={11} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip labelFormatter={(label) => formatDate(String(label ?? ''))} formatter={(value) => [`$${Number(value).toFixed(4)}`, 'SSV/USD']} />
                <Line type="monotone" dataKey="ssvUsdt" stroke="#10b981" dot={false} strokeWidth={1.5} name="SSV/USD" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ExportButtons data={filteredEthSsv} filename={`eth-ssv-prices_${dateFrom}_${dateTo}`} />
          <DataTable
            columns={['Date', 'ETH/USDT', 'SSV/USDT', 'ETH/SSV']}
            rows={filteredEthSsv.slice().reverse().map((d) => [
              formatDate(d.date),
              d.ethUsdt.toFixed(2),
              d.ssvUsdt.toFixed(4),
              d.ethSsv.toFixed(2),
            ])}
          />
        </div>
      )}

      {/* ETH APR Tab */}
      {tab === 'apr' && (
        <div className="space-y-4">
          {/* Date picker */}
          <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap items-center gap-3 dark:bg-gray-800">
            <span className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">APR as of date</span>
            <input
              type="date"
              value={aprDate}
              onChange={(e) => setAprDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
            />
            <button
              onClick={() => fetchAprData(aprDate || undefined)}
              disabled={aprLoading}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {aprLoading ? 'Fetching...' : 'Fetch'}
            </button>
            <button
              onClick={() => { setAprDate(''); fetchAprData(); }}
              disabled={aprLoading}
              className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
            >
              Latest
            </button>
          </div>

          {aprResponse && (() => {
            const endD = new Date(aprResponse.date);
            const startD = new Date(endD);
            startD.setDate(startD.getDate() - 30);
            const aprDateRange = `${startD.toISOString().split('T')[0]} to ${aprResponse.date}`;
            return (
            <>
              <StatsPanel
                title={`ETH Staking APR — ${aprDateRange}`}
                stats={[
                  { label: 'Day APR', value: `${(aprResponse.apr * 100).toFixed(4)}%` },
                  { label: '31d Avg APR', value: `${(aprResponse.avgApr31d * 100).toFixed(4)}%` },
                  { label: 'CL APR', value: `${(aprResponse.clApr * 100).toFixed(4)}% (${clPct}%)` },
                  { label: 'EL APR', value: `${(aprResponse.elApr * 100).toFixed(4)}% (${elPct}%)` },
                ]}
              />

              {/* CL / EL Breakdown Bar Chart */}
              <ChartCard title="APR Breakdown — Consensus vs Execution Layer">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={aprBreakdown}
                    layout="vertical"
                    margin={{ left: 160, right: 40, top: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      fontSize={11}
                      tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                    />
                    <YAxis type="category" dataKey="name" fontSize={11} width={150} />
                    <Tooltip formatter={(value) => [`${Number(value ?? 0).toFixed(4)}%`, 'APR']} />
                    <Legend />
                    <Bar dataKey="value" name="APR %">
                      {aprBreakdown.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ExportButtons
                data={[aprResponse]}
                filename={`eth-apr-${aprResponse.date}`}
              />
            </>
            );
          })()}

          {!aprResponse && !aprLoading && (
            <div className="bg-gray-50 border border-gray-200 text-gray-500 px-4 py-6 rounded text-sm text-center dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
              Loading latest APR data...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatsPanel({ title, stats }: { title: string; stats: { label: string; value: string }[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 dark:bg-gray-800">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 dark:text-gray-200">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3 pt-3">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
            <div className="text-sm font-mono font-medium dark:text-gray-200">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 dark:bg-gray-800">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 dark:text-gray-200">{title}</h3>
      {children}
    </div>
  );
}

function ExportButtons({ data, filename }: { data: unknown[]; filename: string }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => exportData(data, filename, 'csv')}
        className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        Export CSV
      </button>
      <button
        onClick={() => exportData(data, filename, 'json')}
        className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        Export JSON
      </button>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">No data available.</p>;
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-gray-800">
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 dark:bg-gray-700">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-1.5 font-mono text-xs dark:text-gray-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length >= 100 && (
        <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t dark:bg-gray-700 dark:border-gray-600">
          Showing last 100 entries. Export for full dataset.
        </div>
      )}
    </div>
  );
}
