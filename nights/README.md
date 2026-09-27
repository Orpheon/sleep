# Nights

A one-tap morning check-in. Three yes/no questions about last night:

1. **Tried to sleep well?** This is the one the streak counts.
2. **Slept well?**
3. **Feel rested?**

Below the check-in:

- the streak
- best streak, skips left and your 30-day rate
- a month calendar and a per-week chart, each switchable between the three questions
- a collapsed list of all nights, with CSV export and JSON backup/restore

Tap any calendar day or list row to edit that night. Single static page, installable as a PWA. Data stays on the device.

## Streak rules

- Each morning counts for the night that just ended. Before 04:00 still counts as the previous day.
- A **tried** night adds one to the streak.
- A **missed** night ("didn't", or not logged) uses a **skip** if one is banked. The streak holds but does not grow.
  - Two misses in a row always reset the streak, whether or not skips are banked.
  - You start with one skip and get another every Monday, up to two.
  - A skip night is shown with a green outline on the calendar.
- Until this morning is answered, the streak counts up to yesterday.
- After a reset, the big number shows how many of the last 30 nights you tried, not a zero.

Why these rules:

- **Skips:** in Sharif & Shu (2017, 2019), a goal that allows a small reserve of skips kept more people going after a miss than either an easy goal or a hard one. Duolingo found two streak freezes worked better than one.
- **Reset on two misses in a row:** "never miss twice".
- **Showing the rate after a reset:** a broken streak tends to make people give up entirely (the what-the-hell effect).

## Install on Android

1. Open https://orpheon.github.io/sleep/nights/ in Chrome.
2. Menu (⋮) → **Install app**.
3. It then behaves like a normal app, which MacroDroid can launch.

## Open it automatically in the morning (MacroDroid)

Two macros open it on the first unlock of the day:

**Macro A: "Nights check-in"**
- Trigger: screen unlocked
- Constraint: time of day 04:00–13:00
- Actions: Launch application → *Nights*, then Disable macro → *Nights check-in*

**Macro B: "Nights re-arm"**
- Trigger: Day/Time, every day at 04:00
- Action: Enable macro → *Nights check-in*

## Files

- `index.html` is the whole app.
- `manifest.webmanifest`, `sw.js` and `icon-*.png` are PWA plumbing.
- Bump `CACHE` in `sw.js` whenever `index.html` changes. Otherwise installed phones keep the old version for one more launch.

## Tests

`node test/run.mjs [outdir]` needs `google-chrome` on PATH, or set `CHROME`. It pins the clock and covers:

- tapping through the check-in
- the streak and skip rules
- the 04:00 boundary
- calendar editing
- the CSV export

Screenshots go to the output directory.
