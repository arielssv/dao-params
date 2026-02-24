# SSV DAO Parameter Monitor

Calculates SSV Network DAO-controlled parameters (network fees, liquidation collateral, liquidation thresholds) for both SSV and ETH denominated clusters, compares against current on-chain values, and flags deviations exceeding 15%. Built for the ssv.network DAO governance team.

## Tech Stack

- **Frontend:** React 18 + Vite, TypeScript, Tailwind CSS, Recharts for charts
- **Serverless Proxy:** Vercel Serverless Functions (TypeScript) — thin proxies for external APIs
- **Deployment:** Vercel (single deploy — frontend + serverless)
- **No database** — all calculations are stateless, derived from live API data
- **Package manager:** npm

## Project Structure

```
├── api/                        # Vercel Serverless Functions (proxy only)
│   ├── gas-prices.ts           # Proxies Etherscan CSV → JSON
│   ├── eth-ssv-prices.ts       # Proxies Binance klines → JSON
│   ├── eth-apr.ts              # Proxies beaconcha.in ETH.STORE → JSON
│   └── dao-values.ts           # Proxies The Graph subgraph → current on-chain params
├── src/
│   ├── App.tsx                 # Root component with tab navigation
│   ├── main.tsx
│   ├── components/
│   │   ├── Dashboard.tsx       # Main dashboard — parameter cards + deviation summary
│   │   ├── ParameterCard.tsx   # Single parameter: current vs calculated, deviation badge
│   │   ├── DataExplorer.tsx    # Raw data tables + charts for each data source
│   │   └── DeviationBadge.tsx  # Green/red indicator for 15% threshold
│   ├── services/
│   │   ├── dataFetcher.ts      # Calls /api/* endpoints, returns typed data
│   │   ├── calculations.ts     # ALL parameter calculation logic lives here
│   │   └── constants.ts        # Protocol constants
│   ├── hooks/
│   │   └── useParameters.ts    # Orchestrates fetch + calculate + deviation check
│   └── types/
│       └── index.ts            # TypeScript interfaces
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── vercel.json
```

## Commands

```bash
npm install                      # Install deps
npm run dev                      # Dev server (port 5173)
npm run build                    # Production build
npx vercel dev                   # Local dev with serverless functions
npx vercel --prod                # Deploy to Vercel
```

## Environment Configuration

- `VITE_BEACONCHAIN_API_KEY` — free API key from beaconcha.in (needed for ETH APR data)
- `THEGRAPH_API_KEY` — API key from The Graph (needed for subgraph queries, server-side only)
- Set in Vercel dashboard for production, `.env` locally
- Binance and Etherscan endpoints require no auth

## Architecture

All calculation logic lives in the **frontend** (`src/services/calculations.ts`). The serverless functions are dumb proxies that exist only to bypass CORS — they fetch from external APIs and forward the response. No transformation, no business logic in `/api`.

Data flow: `Component → useParameters hook → dataFetcher (calls /api/*) → calculations.ts → display`

## Protocol Constants

```typescript
const BLOCKS_PER_DAY = 7160
const BLOCKS_PER_YEAR = 7160 * 365           // 2,613,400
const GAS_UNITS_LIQUIDATION = 252800          // 13-operator cluster worst case
const NETWORK_FEE_PERCENT = 0.01              // 1% of ETH APR
const DIP49_ETHSSV_CAP = 700                  // ETH/SSV ratio cap per DIP-49
```

## Parameters Calculated

### SSV-Denominated (existing clusters)

| Parameter | Formula | Inputs |
|-----------|---------|--------|
| Network Fee | `32 × APR × 1% × min(ETH/SSV_30d_avg, 700) / 2,613,400` | 30-day trailing avg APR + ETH/SSV |
| Min Liquidation Collateral | `252,800 × (μ_gas + σ_gas) × 1e-9 × ETH/SSV_avg × MaxDev_ETH/SSV` | Gas + ETH/SSV over rolling window |
| Liquidation Threshold | `max_consec_high_gas_days × MaxDev_ETH/SSV` → ceil to weeks → blocks | Gas + ETH/SSV over rolling window |

### ETH-Denominated (new clusters per DIP-X)

| Parameter | Formula | Inputs |
|-----------|---------|--------|
| Network Fee | `32 × APR × 1% / 2,613,400` | 30-day trailing avg APR |
| Min Liquidation Collateral | `252,800 × (μ_gas + σ_gas) × 1e-9` | Gas stats over rolling window |
| Liquidation Threshold | `max_consec_high_gas_days` → raw days → blocks (no rounding) | Gas stats over rolling window |

### Key Formulas Detail

**Gas statistics** (from Etherscan daily averages):
- `μ_gas` = arithmetic mean of daily avg gas prices (Gwei) over window
- `σ_gas` = sample standard deviation (ddof=1, equivalent to Excel STDEV)
- `max_consec_high_gas_days` = longest consecutive streak where daily gas > μ + σ
- Lookback windows: 6 months (DIP-X) or 12 months (DIP-44)

**ETH/SSV statistics** (from Binance daily closes):
- `ETH/SSV = ETHUSDT_close / SSVUSDT_close` per day
- `ETH/SSV_avg` = mean over window
- `MaxDev_ETH/SSV = max(ETH/SSV) / avg(ETH/SSV)` over window

**Rounding rules**:
- SSV Liquidation Threshold: `ceil(days / 7) * 7` (round UP to nearest full week), then `× BLOCKS_PER_DAY`
- ETH Liquidation Threshold: raw days × BLOCKS_PER_DAY (no week rounding)

### Deviation Check

A parameter is flagged when `|calculated - current| / current > 0.15` (15%).

## Data Sources

| Data | Source | Endpoint | Auth | CORS |
|------|--------|----------|------|------|
| Daily avg gas price | Etherscan chart CSV | `https://etherscan.io/chart/gasprice?output=csv` | None | Blocked → proxy |
| ETH price | Binance | `GET /api/v3/klines?symbol=ETHUSDT&interval=1d` | None | Allowed |
| SSV price | Binance | `GET /api/v3/klines?symbol=SSVUSDT&interval=1d` | None | Allowed |
| ETH staking APR | beaconcha.in ETH.STORE | `GET /api/v1/ethstore/{day}` | Free API key | Blocked → proxy |
| Current on-chain params | The Graph (SSV subgraph) | GraphQL query (see below) | API key | Blocked → proxy |

Binance may work directly from browser, but proxy it anyway for consistency.

## Current On-Chain Values

Fetched from the SSV Network mainnet subgraph on The Graph:

**Subgraph URL**: `https://gateway.thegraph.com/api/{API_KEY}/subgraphs/id/7V45fKPugp9psQjgrGsfif98gWzCyC6ChN7CW98VyQnr`

**Query**:
```graphql
query daoValues {
  daovalues(id: "0xDD9BC35aE942eF0cFa76930954a156B3fF30a4E1") {
    liquidationThreshold
    minimumLiquidationCollateral
    networkFee
    networkFeeSSV
    liquidationThresholdSSV
    minimumLiquidationCollateralSSV
  }
}
```

### Pre-upgrade vs Post-upgrade Logic

The subgraph fields change meaning depending on whether the ETH payment upgrade has been deployed:

**Pre-upgrade** (SSV-suffixed fields don't exist yet):
| Subgraph Field | Maps To |
|---|---|
| `networkFee` | SSV Network Fee |
| `minimumLiquidationCollateral` | SSV Min Liquidation Collateral |
| `liquidationThreshold` | SSV Liquidation Threshold |
| ETH params → hardcoded from DIP-X proposal values |

**Post-upgrade** (SSV-suffixed fields exist):
| Subgraph Field | Maps To |
|---|---|
| `networkFeeSSV` | SSV Network Fee |
| `minimumLiquidationCollateralSSV` | SSV Min Liquidation Collateral |
| `liquidationThresholdSSV` | SSV Liquidation Threshold |
| `networkFee` | ETH Network Fee |
| `minimumLiquidationCollateral` | ETH Min Liquidation Collateral |
| `liquidationThreshold` | ETH Liquidation Threshold |

**Detection**: If `networkFeeSSV` is null/missing in the response → pre-upgrade. If present → post-upgrade.

### Hardcoded ETH Defaults (pre-upgrade fallback)

From DIP-X proposal (used until contract upgrade deploys):
```typescript
const ETH_DEFAULTS = {
  networkFee: 0.000000003550929823,           // per block (~0.00928 ETH/year)
  minimumLiquidationCollateral: 0.00094,      // ETH
  liquidationThreshold: 50190,                // blocks (7 days)
}
```

## UI Requirements

- Dashboard must display all **protocol constants** (blocks/day, blocks/year, gas units, network fee %, DIP-49 cap) in a visible panel so users can verify the inputs driving calculations.
- **Refresh button** in the UI that re-fetches all data from the serverless proxies and recalculates parameters. Serverless functions are stateless so this is a clean re-fetch every time.
- Show a "last updated" timestamp so the user knows how fresh the data is.

## Governance References

- **DIP-11**: Original mainnet parameter configuration
- **DIP-33**: Network fee calculation amendments
- **DIP-44**: Liquidation parameter re-evaluation (12-month lookback)
- **DIP-49**: ETH/SSV ratio cap at 700
- **DIP-X**: ETH payments, effective balance accounting, SSV staking (proposes 6-month lookback)

## Repository

- **Repo:** `https://github.com/arielssv/dao-params`
- After each milestone is confirmed working by the user, commit and push to `main`
- Commit message format: `milestone-N: short description` (e.g., `milestone-0: project setup with Vite + Tailwind + Vercel`)
- Do NOT commit until the user explicitly confirms the milestone is done

## Code Style

- **TypeScript:** strict mode, explicit types, no `any`
- **CSS:** Tailwind utility classes only — no custom CSS files
- **Components:** functional components + hooks, named exports
- **Naming:** camelCase (variables/functions), PascalCase (components/types)
- **Imports:** group by: third-party → local, blank line between groups
- **Serverless functions:** keep minimal — fetch, forward, no business logic

---

## Milestones

### Milestone 0: Project Setup

**Goal**: Scaffold the Vercel project with React + Vite + Tailwind + serverless functions, verify everything runs locally.

**Tasks**:
- [ ] Init Vite React-TS project at root
- [ ] Install & configure Tailwind CSS
- [ ] Create `/api` folder with a health check serverless function
- [ ] Configure `vercel.json` for local dev (`vercel dev`)
- [ ] Basic App shell with placeholder layout
- [ ] Verify: `npm run dev` serves frontend, `vercel dev` serves frontend + `/api` functions

**Done when**: `vercel dev` runs, frontend renders, hitting `/api/health` returns `{ status: "ok" }`.

---

### Milestone 1: Fetch & Display All Raw Data

**Goal**: Fetch data from all sources via serverless proxies, display in webapp with charts so user can verify correctness against their reference Excel.

**Serverless proxies** (`/api`):
- [ ] `gas-prices.ts` — fetch Etherscan CSV, parse CSV, return JSON array of `{ date, gwei }`
- [ ] `eth-ssv-prices.ts` — fetch Binance SSVUSDT + ETHUSDT klines, return `{ date, ssvUsdt, ethUsdt, ethSsv }`
- [ ] `eth-apr.ts` — fetch beaconcha.in ETH.STORE for last 30 days, return `{ date, apr }`
- [ ] `dao-values.ts` — query The Graph SSV subgraph, return current on-chain params with pre/post-upgrade detection

**Frontend**:
- [ ] `services/dataFetcher.ts` — typed functions calling each `/api/*` endpoint
- [ ] `services/constants.ts` — protocol constants
- [ ] **Gas Prices view**: table + line chart, computed avg / stdev / threshold shown
- [ ] **ETH/SSV Prices view**: table + line chart, avg / max deviation shown
- [ ] **ETH APR view**: table + line chart, 30-day trailing average shown
- [ ] Statistics summary panel for each dataset
- [ ] Refresh button that re-fetches all data, with "last updated" timestamp
- [ ] CSV/JSON export button per dataset

**Done when**: All data sources displayed with charts and stats. User confirms data matches their reference Excel.

---

### Milestone 2: Parameter Calculation & Deviation Check

**Goal**: Calculate all 6 parameters in the frontend, compare against current values, show deviation dashboard.

**Calculation engine** (`services/calculations.ts`):
- [ ] `calcNetworkFeeSSV(apr30d, ethSsv30d)` — `32 × APR × 1% × min(ETH/SSV, 700) / 2,613,400`
- [ ] `calcMinCollateralSSV(gasStats, ethSsvStats)` — `252,800 × (μ + σ) × 1e-9 × avg × maxDev`
- [ ] `calcThresholdSSV(gasStats, ethSsvStats)` — `maxConsecDays × maxDev → ceil to weeks → blocks`
- [ ] `calcNetworkFeeETH(apr30d)` — `32 × APR × 1% / 2,613,400`
- [ ] `calcMinCollateralETH(gasStats)` — `252,800 × (μ + σ) × 1e-9`
- [ ] `calcThresholdETH(gasStats)` — `maxConsecDays → raw days → blocks`
- [ ] `checkDeviation(calculated, current)` — returns `{ pctChange, exceeds15pct }`

**Dashboard UI**:
- [ ] Parameter cards for each of 6 params: current value, calculated value, deviation %, green/red badge
- [ ] Expandable section per card showing calculation inputs and intermediate values
- [ ] Lookback window toggle: 6M vs 12M for liquidation params
- [ ] Summary banner: "X of 6 parameters exceed 15% deviation"

**Current values from subgraph**:
- [ ] Fetch via `/api/dao-values` → The Graph SSV subgraph
- [ ] Pre/post-upgrade detection: if `networkFeeSSV` exists → post-upgrade field mapping, else → pre-upgrade
- [ ] Pre-upgrade: `networkFee`/`minimumLiquidationCollateral`/`liquidationThreshold` → SSV params; ETH params → hardcoded DIP-X defaults
- [ ] Post-upgrade: SSV-suffixed fields → SSV params; non-suffixed fields → ETH params

**Protocol constants panel**:
- [ ] Display all constants (blocks/day, blocks/year, gas units, network fee %, DIP-49 cap) in a visible UI section

**Done when**: Dashboard shows all 6 parameters with deviation checks matching the reference Excel. Protocol constants visible. Subgraph values load correctly with pre/post-upgrade detection.

---

### Future Enhancements (post-MVP)

- Read current params from SSV Network contract once ETH params are deployed
- Vercel cron for automatic periodic refresh
- Notifications (email/Slack) when deviation exceeds 15%
- Historical parameter tracking over time
