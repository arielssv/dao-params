import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUBGRAPH_BASE = 'https://gateway.thegraph.com/api/subgraphs/id/7V45fKPugp9psQjgrGsfif98gWzCyC6ChN7CW98VyQnr';

// First try with SSV-suffixed fields (post-upgrade), fallback to basic fields (pre-upgrade)
const QUERY_POST_UPGRADE = `{
  daovalues(id: "0xDD9BC35aE942eF0cFa76930954a156B3fF30a4E1") {
    liquidationThreshold
    minimumLiquidationCollateral
    networkFee
    networkFeeSSV
    liquidationThresholdSSV
    minimumLiquidationCollateralSSV
  }
}`;

const QUERY_PRE_UPGRADE = `{
  daovalues(id: "0xDD9BC35aE942eF0cFa76930954a156B3fF30a4E1") {
    liquidationThreshold
    minimumLiquidationCollateral
    networkFee
  }
}`;

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const apiKey = process.env.THEGRAPH_API_KEY || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Try post-upgrade query first
    let response = await fetch(SUBGRAPH_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: QUERY_POST_UPGRADE }),
    });

    let json = await response.json();

    // If post-upgrade fields don't exist, the query may return errors — fall back
    if (json.errors || !json.data?.daovalues) {
      response = await fetch(SUBGRAPH_BASE, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: QUERY_PRE_UPGRADE }),
      });

      if (!response.ok) {
        res.status(502).json({ error: `The Graph returned ${response.status}` });
        return;
      }

      json = await response.json();
    }

    const data = json.data?.daovalues;

    if (!data) {
      res.status(404).json({ error: 'No DAO values found in subgraph' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
