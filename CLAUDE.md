# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install
npm test                              # compiles, then runs test/dst.js
npx homey app validate --level publish # always validate at publish level, not the default
npx homey app install                 # build + install onto the selected Homey
npx homey app run                     # dev mode with live logs (app is removed on exit)
./artwork/build.sh                    # regenerate all PNGs from artwork/*.svg (needs rsvg-convert)
```

`npm test` has no filtering — `test/dst.js` is a single plain-node file of `check(name, fn)`
blocks that prints a pass/fail line each. To run one case, comment out the others or add a
name filter; there is no test framework.

The tests `require('../.homeybuild/lib/time.js')` — the **compiled** output, so they exercise
what actually ships. `npm test` runs `tsc` first for that reason; running `node test/dst.js`
alone will test a stale build.

## Why this app is device-based

Homey grants apps a fixed scope set that includes `homey.logic.readonly` but **not**
`homey.logic`, so an app cannot write Logic variables no matter what it declares in
`permissions`. Scopes are not derived from the manifest — adding a made-up permission is
accepted and silently ignored. HomeyScript is special-cased in firmware and does have
`homey.logic`; ordinary apps cannot borrow it (`homey-lib` explicitly forbids declaring
`homey:app:com.athom.homeyscript`).

Owning the devices sidesteps all of that: an app may freely write its own device settings and
capabilities. Hence `permissions: []` in the manifest — **keep it that way**. Anything that
would reintroduce `homey:manager:api` also reintroduces the "control everything" install
warning for every user.

## Architecture

**The scheduler is a tick, not a timer.** `app.ts` runs one `setInterval` (20s) and calls
`onTick(now)` on every device. Each tick computes local wall-clock `HH:MM` via
`nowInZone(homey.clock.getTimezone())`. Comparing wall clock each tick — rather than arming
timers — is what makes it survive DST, restarts and clock jumps. Devices guard on a
`YYYY-MM-DDTHH:MM` key so an event fires at most once per minute, and seed that guard in
`onInit` so restarting mid-minute cannot re-fire.

**Decision logic lives in `lib/time.ts` as pure functions** (`shouldFire`, `isRangeActive`,
`isRangeEndDue`, `isDayEnabled`, `normalizeTime`) precisely so `test/dst.js` exercises the real
code rather than a copy. Put new scheduling rules there, not inline in a device.

**`lib/ScheduleDevice.ts` is the shared base.** Subclasses declare `slots` (a settings key
paired with the capability that displays it) and implement `onDue`. All writes funnel through
`setTime` / `setDays` / `setEnabled`, which validate, persist to **device settings**, mirror to
capabilities, and call `publishState()`. Add new write paths through those methods or open
widgets will not update.

**Times live in device settings, not capabilities.** A settable *string* capability has no
text-input UI in Homey, so settings are the source of truth and the read-only `schedule_*`
capabilities mirror them. That mirroring is load-bearing: Homey publishes every capability as a
Flow tag automatically, which is the only reason the times are usable in other Flows.

**Weekdays select the day a range *starts*.** For `22:00–06:00 on Monday`, the end belongs to
Monday's occurrence and fires on Tuesday morning. Checking the weekday independently per event
leaves the range open until the following Monday — `test/dst.js` pins this. An empty day set
means every day.

**Widget → app plumbing:** `public/index.html` calls `Homey.api(...)` → `widgets/*/api.ts`
(thin, typed structurally against `homey.app`) → methods on the app class → `ScheduleDevice`.
Live updates go the other way via `homey.api.realtime('schedule', state)` →
`Homey.on('schedule', ...)`.

## Gotchas

**`app.json` is generated.** Homey compose builds it from `.homeycompose/`,
`drivers/*/driver*.compose.json` and `widgets/*/widget.compose.json`. Edit those; never
`app.json`. Driver Flow cards go in `driver.flow.compose.json`, where the `device` argument is
added automatically — that is why triggers are per-device with no run listener.

**`tsconfig.json` must keep `outDir: "./.homeybuild"`.** The Homey CLI refuses to compile
otherwise, with a message that does not obviously point at tsconfig.

**Device settings use `label`; widget settings use `title`.** Mixing them fails validation.

**Custom capabilities get tags but no Flow cards.** `schedule_*` produce tags only. *System*
capabilities do generate cards — `onoff` gives on/off/toggle actions, an `is turned on`
condition, `onoff_*` triggers and a tile toggle for free. Prefer a system capability when one
fits.

**Widget height: render before `ready()`.** `homey.ready({height})` measures
`document.body.scrollHeight`, so anything rendered later (the day strip arrives with the first
`/state` response) is missing from the measurement and the widget gets clipped. Both widgets
render their strip and power button first, then call `ready()`, and `syncHeight()` re-reports
after any later render.

**Verify on the device, not just in a harness.** A local harness authenticated with the CLI's
owner session has full scopes and will hide permission failures that the app's own session
hits. The widget setting autocomplete listener runs in app context and is reachable from
outside via `dashboards.getAppWidgetAutocomplete(...)`, which makes a useful temporary probe.

## Localisation

Languages are **en, sv, no, da, de, nl**. Finnish is deliberately absent: Homey ships 13 UI
locales and `fi` is not among them, so those strings could never be displayed.

Every i18n object in the manifests carries all six. Widget runtime strings live in
`locales/*.json` and are read with `Homey.__('section.key')`; interpolation uses `__token__`.
Shared strings sit under `common.*`, widget-specific ones under `timePicker.*` / `timeRange.*`.
