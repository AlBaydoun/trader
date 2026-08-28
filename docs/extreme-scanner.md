# 85/15 Extreme Scanner

The `85 / 15 Extreme Scanner` is a separate monitoring function for fast, explainable threshold
alerts. It scans the full tradeable catalog returned by the active JustMarkets MT5 terminal,
including symbols that are not currently open as charts.

## Indicator Settings

The implementation follows the attached reference settings:

- RSI period `1`, applied to close.
- Alert zones at `85.00` and `15.00`.
- MACD fast EMA `5`, slow EMA `6`, signal SMA `1`, applied to close.
- Moving-average context uses the same fast/slow EMA relationship as the MACD calculation.

The scanner produces a composite score from RSI(1), normalized MACD direction, and moving-average
direction. The 85/15 zone is applied to that merged score so an alert reflects the requested
combination rather than a raw RSI tick alone. Every reading also exposes its raw RSI, MACD, moving
average relationship, ATR context, recommendation, and reason list.

Recommendations are deliberately phrased as watch states. For example, an upper-zone reading may
say to watch for a reversal sell only when MACD and the moving average confirm weakness; otherwise
it says to wait for confirmation. No alert places an order.

## Live Operation

The API refreshes the monitor every `EXTREME_SCAN_INTERVAL_SECONDS` (15 seconds by default) and
caches a scan for `EXTREME_SCAN_CACHE_SECONDS` (10 seconds). The browser refreshes the panel on the
same cadence. A symbol alerts when it enters a zone, then is rate-limited by
`EXTREME_ALERT_COOLDOWN_SECONDS` (five minutes by default). Returning to neutral resets the zone
state so a later re-entry can alert again.

Enable the `Sound` and optional `Voice` controls in the signal rail to receive browser notifications.
Browsers may require one user interaction before allowing audio. The panel's `Scan now` control
forces an immediate read.

## Coverage and Latency

"Whole market" means every tradeable symbol currently exposed by the connected MT5 terminal. The
catalog is account- and broker-dependent; it is not literally every instrument in the world. A
global cross-broker universe requires additional licensed market-data feeds and symbol mapping.

The current implementation is polling-based. It provides live-on-refresh recommendations, not an
exchange co-location or tick-by-tick latency guarantee. Candle availability, terminal response time,
network conditions, and the size of the broker catalog determine how long a full refresh takes.

## Configuration

```env
EXTREME_SCAN_ENABLED=true
EXTREME_SCAN_CACHE_SECONDS=10
EXTREME_SCAN_INTERVAL_SECONDS=15
EXTREME_ALERT_COOLDOWN_SECONDS=300
MARKET_SCAN_MAX_SYMBOLS=500
```

Keep the MT5 terminal logged into the selected account and let the read-only bridge provide quotes
and candles. If the terminal is disconnected, the panel reports that verified MT5 data is not
available instead of fabricating live readings.
