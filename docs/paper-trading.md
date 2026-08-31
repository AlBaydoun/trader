# Virtual Paper Trading

The workstation starts in paper mode. The virtual engine uses current read-only MT5 candles and
quotes, but it never submits an order, changes an MT5 position, or uses real money.

## What It Does

When enabled, the API runs a cycle every `PAPER_CYCLE_INTERVAL_SECONDS` (60 seconds by default):

1. Scans every tradeable symbol exposed by the active MT5 terminal.
2. Updates each open virtual position using the latest candle.
3. Closes positions on stop loss, take profit, opposite signal, or the configured time limit.
4. Opens eligible directional opportunities up to `PAPER_MAX_OPEN_POSITIONS`.
5. Records the decision, simulated costs, equity curve, and detailed trade result.

The default risk budget is `PAPER_RISK_PER_TRADE_PCT=0.1`, with a 50-position cap. These limits
are intentionally conservative defaults for observing behavior, not a performance claim. The
paper ledger is stored at `PAPER_STATE_FILE` and survives API restarts. Relative paths are anchored
to the API service directory, so starting the server from a different folder no longer creates a
second empty ledger. Each save is atomic and keeps a `.bak` recovery copy.

Main `Virtual Trading` starts with automatic timeframe selection. Every cycle compares the
configured `PAPER_TIMEFRAMES` set (1m, 5m, 15m, 1h, 4h, and 1d by default), selects the timeframe
with the strongest active directional setup, and then applies the same minimum score, learning,
position, and risk filters. The selected timeframe is shown in the panel and stored on each new
virtual trade. The RigorGate, Extreme Virtual Trading, Jdub Traders, and Candlestick Pattern Bot
panels use the same Auto/Manual control. Manual mode forces the selected timeframe; automatic
selection does not force a trade when every timeframe is below the entry threshold.

## RigorGate Virtual Bot

`RigorGate` is a separate paper-only adapter based on the linked conversation. It exposes the
conversation's direct action model: an accepted `BUY` opens a long virtual position, `WAIT` does
nothing, and an accepted `SELL` closes a matching long virtual position. A `SELL` without a
matching long is a no-op; this bot does not open short positions from that action alone.

The linked conversation describes demo signals and does not publish a complete, validated market
formula. This implementation therefore uses the workstation's existing read-only MT5 market
scanner and explainable signal reasons as RigorGate's evidence input, then applies its action
semantics and independent score, cost, risk, time-limit, persistence, and learning controls. It is
an adapter for virtual testing, not a claim that the linked demo predicts or guarantees profit.
Its results are stored separately at `RIGORGATE_PAPER_STATE_FILE`. The panel supports the same
open, history, daily, learning, and decision-log views as the other paper ledgers.
RigorGate defaults to automatic selection on a fresh ledger, with 15m as its initial displayed
timeframe. Its Timeframe control supports 1m, 5m, 15m, 1h, 4h, and 1d. Changing the mode or forced
timeframe in the panel persists the choice across API restarts.

## Candlestick Engulfing Bots

The workstation now exposes three independent paper-only ledgers:

- `Candlestick Main BUY + SELL Bot` scans for both confirmed green Bullish Engulfing BUY setups
  and confirmed red Bearish Engulfing SELL setups in one combined portfolio.

- `Bullish Engulfing BUY Bot` scans the selected timeframe for a confirmed green Bullish Engulfing
  candle and opens BUY positions only.
- `Bearish Engulfing SELL Bot` scans the selected timeframe for a confirmed red Bearish Engulfing
  candle and opens SELL positions only.

All three bots default to automatic timeframe selection, with M15 as the initial timeframe, and
scan every tradeable instrument exposed by the active MT5 terminal. Each bot has its own enable
switch, timeframe mode, score threshold, position limit, open positions, closed history, daily
reports, learning lessons, decisions, and equity curve. Their state files are
`CANDLESTICK_PAPER_STATE_FILE`, `CANDLESTICK_BUY_PAPER_STATE_FILE`, and
`CANDLESTICK_SELL_PAPER_STATE_FILE`, so results are never mixed.

A BUY receives a stop below the latest two candle lows and a target above entry; a SELL receives a
stop above the latest two candle highs and a target below entry. Both use an ATR buffer and a 1.35R
target. Active quotes, spread, risk limits, position limits, and the paper-only execution boundary
still apply. These pattern rules are not a guarantee of profit.

The combined bot keeps its existing ledger and history in `CANDLESTICK_PAPER_STATE_FILE`; it is now
the main combined dashboard bot rather than a hidden compatibility service.

## Extreme Virtual Trading

The `Extreme Virtual Trading` panel is a separate paper account for the 85/15 scanner. It is
enabled by default but remains virtual-only. It scans the full tradeable MT5 catalog and opens a
simulated position only when an alert reaches 85.00 or 15.00 and the configured confirmation
checks pass: MACD direction and fast/slow moving-average direction must agree with the reversal.
Its default minimum score is 70, which corresponds to the threshold boundary in the composite
score. This is a selectivity filter, not a guarantee of winning trades.

The extreme ledger uses the same execution lifecycle as the regular paper engine: risk-sized
quantity, configured commission and slippage, stop loss, take profit, time limit, operator close,
mark-to-market updates, equity curve, decision log, and paper-only learning. It is stored at
`EXTREME_PAPER_STATE_FILE`, so restarting the API does not erase its open trades, closed results,
or learning history. The panel records both the exact signal timestamp/price and the modeled fill,
then shows current virtual P/L until the trade exits.

Controls are independent. Pause the extreme engine without pausing broad-market paper trading,
change its timeframe or score threshold, run a cycle immediately, close individual virtual
positions, or reset only the extreme ledger. Use the extreme panel's `Profit since signals`,
`Win rate`, `Profit factor`, history, and learning tabs to evaluate the filter over a meaningful
sample instead of optimizing for a single trade.

## Jdub Traders Virtual Strategy

`Jdub Traders` is a separate paper-only ledger based on the explicit framework in the linked Jdub
Trades video. On M1 it scans the full tradeable MT5 catalog, marks the high and low of the first
15-minute New York session range (09:30-09:45 ET), waits for a completed M5 close, and evaluates
the M1 breakout, break-and-retest, and reversal entry models. Auto mode compares the configured
timeframes. A forced higher timeframe uses a timeframe-aware version of the same opening-range
framework and records that choice on each trade; M1 remains the faithful original mode. It permits
at most one setup per symbol per New York session and persists that session guard so an API restart
does not duplicate a setup.

The video leaves stop placement and model selection partly discretionary. The implementation uses
an explicit structural stop assumption and a 1.5R virtual target so results are reproducible; each
paper signal displays those assumptions in its reasons. This is a mechanical interpretation, not a
claim that it reproduces the creator's discretionary execution or guarantees performance. Its
ledger is stored at `JDUB_PAPER_STATE_FILE`, with session guards at
`JDUB_PAPER_SESSION_STATE_FILE`.

## Workstation Controls

Use the `Paper` button in the header to open the virtual results section. It shows:

- Virtual equity, balance, realized and unrealized result, fees, drawdown, win rate, profit factor,
  average R, and open risk.
- An equity curve and the current position list with entry, current price, stop, target, quantity,
  risk, result, R-multiple, confidence, and strategy reasons.
- Closed-trade history including exit reason, duration, return, MFE, MAE, and costs.
- A Daily tab with the latest 14 UTC close days. Each row reports opening and closing virtual
  balance, winning and losing amounts, their percentages of opening balance, win rate, net result,
  fees, and profit factor. Open positions are excluded until they close.
- A Learning tab that records wins, losses, latest faults, factor-level reliability, and recent
  fault lessons. Each lesson explains the exit failure and the conservative paper-only action that
  can follow. After `PAPER_LEARNING_MIN_SAMPLES` outcomes, a small reliability overlay can adjust
  future paper-entry scores; it never changes the live strategy or enables MT5 orders.
- A decision log showing cycles, opens, closes, controls, and errors.

`Run now` starts a cycle immediately. `Reset` requires the exact confirmation shown in the dialog
and clears the virtual ledger only. The auto toggle pauses or resumes future virtual cycles without
changing historical results.

## Safety Boundary

The paper service is separate from the live broker adapter. The API's live trading lock still
requires explicit live configuration, acknowledgement, a non-read-only MT5 bridge, and a risk
approval. The paper engine does not bypass or weaken those controls.

Virtual fills are modeled from observed candle prices, so they are not a substitute for broker
execution quality, spread behavior, slippage, latency, or a validated backtest.

## Manual Trading Bot

`Manual Trading Bot` is a separate paper-only ledger for operator-controlled entries. It does not
open positions from the automatic strategy and does not share the main `Virtual Trading` history.
The bot is paused by default. Turn on `Monitoring` when you want its open positions to be marked
from live MT5 candles and automatically closed when their configured stop-loss, take-profit, or
time limit is reached. Turning monitoring off pauses those automatic marks and exits; it does not
delete trades or prevent you from opening or closing paper positions from the panel.

Its chart searches the full tradeable symbol catalog exposed by the connected MT5 terminal. Search
by symbol or description, select a result, and the chart refreshes every 10 seconds. The chart
shows whether its candles came from MT5 or the demo fallback. A typed symbol can also be submitted
directly when the catalog is unavailable, but live monitoring requires a verified MT5 connection.
The selected timeframe is independent of the main chart grid and is stored in the manual ledger.

The manual ledger is stored at `MANUAL_PAPER_STATE_FILE` (default
`../../data/manual-paper-trading.json`). Its portfolio, notes, results, and monitoring state
survive API restarts. The API routes are `GET /paper/manual/portfolio`, `POST /paper/manual/open`,
`POST /paper/manual/control`, `POST /paper/manual/cycle`, and the matching manual position close,
note, and reset routes.
