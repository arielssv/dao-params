import type { VercelRequest, VercelResponse } from '@vercel/node';

async function fetchKlines(symbol: string, limit: number): Promise<number[][]> {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance ${symbol} returned ${response.status}`);
  }
  return response.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const limit = Math.min(Number(req.query.limit) || 365, 1000);

    const [ethKlines, ssvKlines] = await Promise.all([
      fetchKlines('ETHUSDT', limit),
      fetchKlines('SSVUSDT', limit),
    ]);

    // Build a map of SSV prices by date
    const ssvByDate = new Map<string, number>();
    for (const kline of ssvKlines) {
      const date = new Date(kline[0] as number).toISOString().split('T')[0];
      ssvByDate.set(date, parseFloat(kline[4] as unknown as string)); // close price
    }

    const data = ethKlines
      .map((kline) => {
        const date = new Date(kline[0] as number).toISOString().split('T')[0];
        const ethUsdt = parseFloat(kline[4] as unknown as string); // close price
        const ssvUsdt = ssvByDate.get(date);
        if (ssvUsdt === undefined || ssvUsdt === 0) return null;
        return {
          date,
          ssvUsdt,
          ethUsdt,
          ethSsv: ethUsdt / ssvUsdt,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
