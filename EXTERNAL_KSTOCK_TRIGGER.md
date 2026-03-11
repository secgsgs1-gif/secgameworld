## External K-Stock Trigger

If GitHub `schedule` is unreliable, trigger the stock sync workflow from an external cron service by calling the GitHub Actions dispatch API.

Target workflow:

- `.github/workflows/kstock-sync.yml`

Supported trigger APIs:

1. `workflow_dispatch`
2. `repository_dispatch` with event type `kstock-sync`

### Recommended request

Use `workflow_dispatch`.

Request:

```http
POST https://api.github.com/repos/secgsgs1-gif/secgameworld/actions/workflows/kstock-sync.yml/dispatches
Authorization: Bearer <GITHUB_ACTIONS_TOKEN>
Accept: application/vnd.github+json
Content-Type: application/json

{"ref":"main"}
```

### Alternative request

Use this if your cron service is better suited to generic repository events.

```http
POST https://api.github.com/repos/secgsgs1-gif/secgameworld/dispatches
Authorization: Bearer <GITHUB_ACTIONS_TOKEN>
Accept: application/vnd.github+json
Content-Type: application/json

{"event_type":"kstock-sync"}
```

### Recommended schedule

KST market hours:

- `09:03, 09:13, 09:23, 09:33, 09:43, 09:53`
- repeat every hour through `14:53`
- `15:03, 15:13, 15:23`
- final close snapshot at `15:43`

UTC equivalent:

- `3,13,23,33,43,53 0-5 * * 1-5`
- `3,13,23 6 * * 1-5`
- `43 6 * * 1-5`

### Notes

- The external service must support custom HTTP headers and POST body.
- The token must have permission to dispatch workflows in `secgsgs1-gif/secgameworld`.
- The workflow itself updates `stock_market_cache` and then recomputes all `stock_game_profiles` totals for leaderboard accuracy.
