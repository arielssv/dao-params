import type { GasPriceEntry, EthSsvPriceEntry, EthAprResponse, DaoValues } from '../types';

const BASE = import.meta.env.DEV ? '' : '';

export async function fetchGasPrices(): Promise<GasPriceEntry[]> {
  const res = await fetch(`${BASE}/api/gas-prices`);
  if (!res.ok) throw new Error(`Gas prices API error: ${res.status}`);
  return res.json();
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
