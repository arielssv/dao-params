export const BLOCKS_PER_DAY = 7160;
export const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * 365; // 2,613,400
export const GAS_UNITS_LIQUIDATION = 226578;
export const NETWORK_FEE_PERCENT = 0.01; // 1% of ETH APR
export const DIP49_ETHSSV_CAP = 700; // ETH/SSV ratio cap per DIP-49

export const ETH_DEFAULTS = {
  networkFee: 0.000000003550929823, // per block (~0.00928 ETH/year)
  minimumLiquidationCollateral: 0.00094, // ETH
  liquidationThreshold: 50190, // blocks (7 days)
};
