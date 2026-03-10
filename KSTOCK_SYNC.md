# K-Stock Arena Real Data Sync

`games/category-29-stock-trader` reads market data from Firestore collection `stock_market_cache`.

## Source

- KRX Information Data System
- Current quote source: `전종목 시세`
- Chart source: `개별종목 시세 추이`
- Display basis: KRX delayed market data

Reference:

- https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd
- https://data.krx.co.kr/contents/MMC/ISIF/isif/MMCISIF009.cmd

## Required secrets

- `FIREBASE_SERVICE_ACCOUNT_PATH`

## Optional env

- `KSTOCK_SYMBOLS`
  - Example: `005930,000660,035420`
- `KSTOCK_CANDLE_COUNT`
  - Default: `132`
- `KRX_BASE_URL`
  - Default: `http://data.krx.co.kr`

## Run

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json \
npm run sync:kstock
```

You can also pass the service account path as the first CLI arg:

```bash
npm run sync:kstock -- /path/to/service-account.json
```

## Output

The script writes one document per symbol to `stock_market_cache/{symbol}` with:

- current price
- previous close
- change / change rate
- open / high / low / volume
- daily candles for the chart
- trade date
- server timestamp

## Notes

- The frontend now requires `stock_market_cache` to exist and does not show fake sample quotes.
- This script is intended for manual runs or scheduler/cron integration.
- KRX pages indicate delayed quotes; display the last synced time clearly in the UI.
