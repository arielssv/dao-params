import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/71118/ssv-network-ethereum/version/latest';

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
    // Try post-upgrade query first
    let response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY_POST_UPGRADE }),
    });

    let json = await response.json();

    // If post-upgrade fields don't exist, the query may return errors — fall back
    if (json.errors || !json.data?.daovalues) {
      response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
