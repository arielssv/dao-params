import type { VercelRequest, VercelResponse } from '@vercel/node';

function toISODate(dateStr: string): string {
  // Convert "M/D/YYYY" to "YYYY-MM-DD"
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const response = await fetch('https://etherscan.io/chart/gasprice?output=csv');
    if (!response.ok) {
      res.status(502).json({ error: `Etherscan returned ${response.status}` });
      return;
    }

    const csv = await response.text();
    const lines = csv.trim().split('\n');
    // Skip header row; CSV format: "Date(UTC)","UnixTimeStamp","Value (Wei)"
    const data = lines.slice(1).map((line) => {
      const parts = line.split(',');
      const rawDate = parts[0].replace(/"/g, '');
      const date = toISODate(rawDate);
      // Value is in Wei — convert to Gwei (1 Gwei = 1e9 Wei)
      const wei = parseFloat(parts[2].replace(/"/g, ''));
      const gwei = wei / 1e9;
      return { date, gwei };
    });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
