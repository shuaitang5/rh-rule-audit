# rh-rule-audit

Static chart UI for eyeballing a rule-based equity backtest on a phone.
Candles + volume + MACD + RSI + a trend-regime pane, with every buy, sell, trim
and *refused* signal marked and annotated with the rule that caused it.

**https://shuaitang5.github.io/rh-rule-audit/**

Data only — the strategy implementation lives elsewhere. Charting by
[TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts)
(Apache-2.0), vendored as `lightweight-charts.js`.
