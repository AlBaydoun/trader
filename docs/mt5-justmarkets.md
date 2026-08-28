# MT5 and JustMarkets Integration

The repository includes a working read-only MT5 bridge and an execution boundary that deliberately
does not place real MT5 orders yet.

## Intended Deployment

For JustMarkets accounts through MetaTrader 5:

1. Install MT5 on a dedicated Windows 11 VPS or always-on Windows machine.
2. Log into the JustMarkets Pro account in the MT5 terminal.
3. Verify exact broker symbol names, including suffixes such as `.std` or `.m`.
4. Install the Python `MetaTrader5` package in the API runtime on the same Windows host. It is
   included automatically by `requirements.txt` on Windows.
5. Set MT5 environment variables in `.env`.
6. Keep `TRADING_MODE=paper` until account, symbol, volume, and stop behavior have been tested.

Copy `config/mt5-accounts.example.json` to the ignored `data/mt5-accounts.json` file and add each
account profile there. The web interface can switch the active account and persists that choice.
The API reports only masked logins to the browser; full logins remain in the ignored local file.

Passwords are not stored in the account profile. Sign in through the MT5 terminal; the API uses
the terminal's saved session and verifies the selected login and server before exposing account
data. Selecting another account clears verification and never unlocks live execution by itself.

Use each profile's `symbol_map` when the broker adds suffixes. For example, a workstation symbol
such as `XAUUSD` can map to the JustMarkets instrument `XAUUSD.m`.

## Read-only Bridge

With `MT5_READ_ONLY_ENABLED=true`, the bridge may call only terminal/account information, symbol,
tick, candle, and position APIs. The web workstation displays connection state, masked login
comparison, balance, equity, margin, live quotes, and position count after the selected profile
matches MT5.

Verified MT5 candles feed the charts, explainable signal engine, and backtest service. Every chart,
signal, and backtest displays an `MT5 data` or `Demo data` source badge. If the bridge is unavailable,
the account does not match, or fewer than 40 broker candles are returned, the endpoint falls back
to deterministic demo candles and labels them accordingly.

The current bridge does not call `order_send`. Live trading also remains locked while read-only
mode is enabled, even if the other live-trading acknowledgement settings are present.

## Economic Calendar Bridge

The official MT5 Python package does not expose the terminal News tab or the MQL5 economic-calendar
functions. `integrations/mt5/TraderCalendarBridge.mq5` is therefore a separate, read-only Expert
Advisor that exports scheduled USD calendar events to the MT5 common-files directory every minute.
It contains no order placement code.

The repository contains the source file only; it is not automatically installed in every MT5 data
profile. In the active MT5 terminal, use `File -> Open Data Folder`, open `MQL5/Experts`, and copy
`TraderCalendarBridge.mq5` there. You may create an optional `TraderAI` subfolder, but `TraderAI`
is a folder name, not the Expert Advisor name. Open the file in MetaEditor, press `F7` to compile,
return to MT5, right-click `Navigator -> Expert Advisors`, choose `Refresh`, and attach the
Expert Advisor named **TraderCalendarBridge** to one chart. If it does not appear, confirm that
MetaEditor opened the same data folder as the running terminal and refresh the Navigator again.

The API automatically reads:

```text
%APPDATA%\MetaQuotes\Terminal\Common\Files\TraderAI-calendar.csv
```

The workstation then displays `Live calendar`. If the export is older than ten minutes, it displays
`Stale`. This bridge covers scheduled economic events only. Broker News-tab articles and
unscheduled headlines still require a separately licensed news provider.

## Adapter Requirements

A production adapter should:

- Read broker symbol metadata from MT5 before placing orders.
- Normalize volume to broker min/max/step.
- Reject symbols that are not visible or tradeable.
- Confirm spreads, session status, stop level, freeze level, and margin impact.
- Place server-side stop loss and take profit with every order.
- Persist every request, broker response, and rejection reason.
- Never bypass the API risk engine.

## Always-On Setup

Use a VPS close to the broker server for reliability. The MT5-connected API must run directly on
the same Windows host as the terminal because the official Python package uses local interprocess
communication. The web app, database, Redis, and observability services can still use Docker.

The Linux API container intentionally skips the Windows-only `MetaTrader5` package and reports the
bridge as unavailable. Do not expect a Linux container to connect directly to a Windows terminal.

Recommended baseline:

- Windows 11 Pro or Windows Server VPS.
- 4 vCPU, 8 GB RAM minimum.
- UPS-backed local PC only if using home hardware.
- Automatic OS updates scheduled outside trading hours.
- Process supervisor or Docker restart policies.
- Daily backups of config, logs, and trade journal data.
