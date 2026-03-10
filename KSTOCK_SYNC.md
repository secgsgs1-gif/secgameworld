# K-Stock Arena Real Data Sync

`games/category-29-stock-trader` reads live market data from Firestore collection `stock_market_cache`.

## Source

- Official KIS Open API
- Current quote endpoint: `/uapi/domestic-stock/v1/quotations/inquire-price`
- Daily price endpoint: `/uapi/domestic-stock/v1/quotations/inquire-daily-price`

## Required secrets

- `KIS_APP_KEY`
- `KIS_APP_SECRET`
- `FIREBASE_SERVICE_ACCOUNT_PATH`

## Optional env

- `KSTOCK_SYMBOLS`
  - Example: `005930,000660,035420`
- `KSTOCK_CANDLE_COUNT`
  - Default: `132`
- `KIS_BASE_URL`
  - Default: `https://openapi.koreainvestment.com:9443`

## Run

```bash
KIS_APP_KEY=your_key \
KIS_APP_SECRET=your_secret \
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json \
npm run sync:kstock
```

You can also pass the service account path as the first CLI arg:

```bash
KIS_APP_KEY=your_key \
KIS_APP_SECRET=your_secret \
npm run sync:kstock -- /path/to/service-account.json
```

## Output

The script writes one document per symbol to `stock_market_cache/{symbol}` with:

- current price
- previous close
- change / change rate
- open / high / low / volume
- daily candles for the chart
- server timestamp

## Notes

- Frontend falls back to built-in sample data when `stock_market_cache` is empty.
- This script is intended for manual runs or scheduler/cron integration.
- KIS market data usage may require separate exchange/data licensing depending on deployment and distribution model.
