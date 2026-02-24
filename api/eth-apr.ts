import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const apiKey = process.env.VITE_BEACONCHAIN_API_KEY || '';

    if (!apiKey) {
      res.status(500).json({ error: 'VITE_BEACONCHAIN_API_KEY not configured' });
      return;
    }

    // Accept optional date param (YYYY-MM-DD). Default: latest.
    const dateParam = req.query.date as string | undefined;

    let endpoint: string;
    if (dateParam) {
      // Fetch latest first to map date → day number
      const latestRes = await fetch('https://beaconcha.in/api/v1/ethstore/latest', {
        headers: { apikey: apiKey },
      });
      if (!latestRes.ok) {
        res.status(502).json({ error: `beaconcha.in returned ${latestRes.status}` });
        return;
      }
      const latestJson = await latestRes.json();
      const latestDay: number = latestJson.data.day;
      const latestDateStr: string = latestJson.data.day_start.split('T')[0];
      const msPerDay = 86400000;
      const daysBack = Math.round(
        (new Date(latestDateStr).getTime() - new Date(dateParam).getTime()) / msPerDay
      );
      const targetDay = latestDay - daysBack;
      // Delay to avoid rate limiting after the latest call
      await new Promise((r) => setTimeout(r, 1500));
      endpoint = `https://beaconcha.in/api/v1/ethstore/${targetDay}`;
    } else {
      endpoint = 'https://beaconcha.in/api/v1/ethstore/latest';
    }

    const response = await fetch(endpoint, {
      headers: { apikey: apiKey },
    });

    if (!response.ok) {
      res.status(502).json({ error: `beaconcha.in returned ${response.status}` });
      return;
    }

    const json = await response.json();
    const data = json.data;

    if (!data || typeof data.apr !== 'number') {
      res.status(404).json({ error: 'No APR data found' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.status(200).json({
      day: data.day as number,
      date: data.day_start?.split('T')[0] ?? '',
      apr: data.apr as number,
      avgApr7d: data.avgapr7d as number,
      avgApr31d: data.avgapr31d as number,
      clApr: data.cl_apr as number,
      elApr: data.el_apr as number,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
