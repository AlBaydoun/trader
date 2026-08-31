# MT5 Mobile Alerts for iPhone and Android

## Important platform limitation

The custom `TraderAI_CandlestickPatterns.mq5` indicator is a desktop MetaTrader 5
indicator. MetaTrader 5 for iPhone and Android can display charts, receive notifications,
and let you manage trades, but they do not provide the desktop MetaEditor/Navigator workflow
needed to load a custom `.mq5` or `.ex5` indicator.

There is therefore one indicator build, not separate iPhone and Android `.mq5` files:

```text
Desktop MT5 or Windows VPS
  TraderAI_CandlestickPatterns
          |
          | MetaQuotes ID push notification
          v
 iPhone MT5       Android MT5
```

This is the supported way to use the indicator from either phone. The indicator never places
orders. It only marks confirmed, closed-candle patterns and can send a signal notification.

## One-time setup

### 1. Get the phone's MetaQuotes ID

Do this on each phone that should receive alerts:

- Open the JustMarkets MetaTrader 5 app.
- Open the **Messages** section. The app shows the device's **MetaQuotes ID** there.
- Copy the ID without spaces.
- Allow notifications for MetaTrader 5 in the phone's operating-system settings.

The iPhone and Android apps each have their own MetaQuotes ID. Add both IDs in the desktop
terminal if both devices should receive the same alerts. MetaQuotes documents push delivery for
[MT5 on iPhone](https://www.metatrader5.com/en/mobile-trading/iphone/help/push) and
[MT5 on Android](https://www.metatrader5.com/en/mobile-trading/android/help/push).

### 2. Configure desktop MT5

On the Windows computer or Windows VPS that is logged into the JustMarkets account:

1. Open **Tools -> Options -> Notifications**.
2. Enable push notifications.
3. Paste the MetaQuotes ID and click **Test**.
4. Confirm that the test arrives on the phone before attaching the indicator.

The desktop terminal stores this notification setting. The official desktop instructions are in
[MetaTrader 5 Platform Settings](https://www.metatrader5.com/en/terminal/help/startworking/settings).

### 3. Install and attach the indicator on desktop MT5

Use the data folder for the exact JustMarkets terminal that stays connected:

1. In MT5, open **File -> Open Data Folder**.
2. Open `MQL5/Indicators` and create a `TraderAI` folder if it does not exist.
3. Copy `integrations/mt5/TraderAI_CandlestickPatterns.mq5` into that folder.
4. Open the file in MetaEditor and press `F7` to compile it.
5. Return to MT5, refresh **Navigator -> Indicators**, and attach **TraderAI Candlestick
   Patterns** to the chart.
6. Choose the chart timeframe. The indicator follows the chart timeframe, so use M15 for
   15-minute patterns or M1 for one-minute patterns.
7. In the indicator's **Inputs** tab, use:

   - `EnableAlerts = true`
   - `EnablePushAlert = true`
   - `EnableSoundAlert = true` if you also want a sound on the Windows host
   - `EnableEmailAlert = false` unless email has been configured separately

Push alerts are intentionally disabled by default. They are generated only after a candle closes,
so an unfinished candle cannot produce a pattern alert.

## iPhone activation

1. Install or open MetaTrader 5 for iPhone and sign into the JustMarkets account.
2. Find the iPhone's MetaQuotes ID under **Messages**.
3. Enable iPhone notifications and sound for MetaTrader 5.
4. Enter that ID in desktop MT5 **Tools -> Options -> Notifications** and press **Test**.
5. Leave the desktop MT5 terminal and indicator running. The phone receives the notification even
   when the MT5 app is not currently open, provided the phone has an internet connection.

The phone is the alert and review device; the desktop/VPS terminal is the indicator host.

## Android activation

1. Install or open MetaTrader 5 for Android and sign into the JustMarkets account.
2. Find the Android device's MetaQuotes ID under **Messages**.
3. Enable Android notifications, sound, and battery/background permission for MetaTrader 5.
4. Enter that ID in desktop MT5 **Tools -> Options -> Notifications** and press **Test**.
5. Leave the desktop MT5 terminal and indicator running. The phone receives the notification even
   when the MT5 app is not currently open, provided the phone has mobile data or Wi-Fi.

## Keeping alerts available all day

For continuous monitoring, run the JustMarkets MT5 desktop terminal and the indicator on a
Windows VPS near the broker. The workstation API can run beside it on that same Windows host.
The terminal must remain connected, the chart must remain open, and the VPS must have network
access. A phone alone cannot run this custom MQL5 indicator in the background.

Keep `TRADING_MODE=paper` in the workstation and do not enable live execution just to receive
alerts. These notifications are decision support, not a profit guarantee.

## Viewing the workstation on a phone

The TraderAI web workstation is one responsive web app for both iPhone and Android; a second
mobile codebase is unnecessary. `http://127.0.0.1:5173` is reachable only from the Windows PC
itself. To open it on a phone, host the web/API services on a secured VPS or expose them through
an authenticated HTTPS reverse proxy. Do not expose the API or MT5 credentials directly to the
public internet.

The web app's browser sound and voice controls are separate from MT5 push notifications. Use MT5
push for dependable phone delivery when the browser is closed, and use the web controls for the
interactive workstation view.
