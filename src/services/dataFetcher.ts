import type { GasPriceEntry, EthSsvPriceEntry, EthAprResponse, DaoValues } from '../types';

const BASE = import.meta.env.DEV ? '' : '';

function toISODate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

export async function fetchGasPrices(): Promise<GasPriceEntry[]> {
  // Fetch static CSV from public folder (avoids Etherscan blocking cloud IPs)
  const res = await fetch('/gas-data.csv');
  if (!res.ok) throw new Error(`Gas data fetch error: ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split('\n');
  return lines.slice(1).map((line) => {
    const parts = line.split(',');
    const rawDate = parts[0].replace(/"/g, '');
    const date = toISODate(rawDate);
    const wei = parseFloat(parts[2].replace(/"/g, ''));
    const gwei = wei / 1e9;
    return { date, gwei };
  });
}

export async function fetchEthSsvPrices(limit = 365): Promise<EthSsvPriceEntry[]> {
  const res = await fetch(`${BASE}/api/eth-ssv-prices?limit=${limit}`);
  if (!res.ok) throw new Error(`ETH/SSV prices API error: ${res.status}`);
  return res.json();
}

export async function fetchEthApr(date?: string): Promise<EthAprResponse> {
  const url = date
    ? `${BASE}/api/eth-apr?date=${date}`
    : `${BASE}/api/eth-apr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ETH APR API error: ${res.status}`);
  return res.json();
}

export async function fetchDaoValues(): Promise<DaoValues> {
  const res = await fetch(`${BASE}/api/dao-values`);
  if (!res.ok) throw new Error(`DAO values API error: ${res.status}`);
  return res.json();
}
