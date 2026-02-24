import type { VercelRequest, VercelResponse } from '@vercel/node';

const QUERY = `query daoValues {
  daovalues(id: "0xDD9BC35aE942eF0cFa76930954a156B3fF30a4E1") {
    liquidationThreshold
    minimumLiquidationCollateral
    networkFee
    networkFeeSSV
    liquidationThresholdSSV
    minimumLiquidationCollateralSSV
  }
}`;

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const apiKey = process.env.THEGRAPH_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'THEGRAPH_API_KEY not configured' });
      return;
    }

    const url = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/7V45fKPugp9psQjgrGsfif98gWzCyC6ChN7CW98VyQnr`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY }),
    });

    if (!response.ok) {
      res.status(502).json({ error: `The Graph returned ${response.status}` });
      return;
    }

    const json = await response.json();
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
