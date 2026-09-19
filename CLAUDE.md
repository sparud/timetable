# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install
npm test                              # compiles, then runs test/dst.js and test/sun.js
npx homey app validate --level publish # always validate at publish level, not the default
npx homey app install                 # build + install onto the selected Homey
npx homey app run                     # dev mode with live logs (app is removed on exit)
./artwork/build.sh                    # regenerate all PNGs from artwork/*.svg (needs rsvg-convert)
```

`npm test` has no filtering — each test file is a single plain-node file of `check(name, fn)`
blocks that prints a pass/fail line each. To run one case, comment out the others or add a
name filter; there is no test framework. `test/dst.js` covers the scheduler and weekday
semantics; `test/sun.js` covers sunrise/sunset and how a slot resolves to a time.

The tests `require('../.homeybuild/lib/*.js')` — the **compiled** output, so they exercise
what actually ships. `npm test` runs `tsc` first for that reason; running `node test/dst.js`
alone will test a stale build.

`test/sun.js` asserts against **published** sunrise times for real places (Stockholm at the
solstices, Auckland, the Kiruna midnight sun). That is deliberate: a sign error in the
equation of time is self-consistent, so the algorithm has to be checked against something
outside the code.

## Why this app is device-based

Homey grants apps a fixed scope set that includes `homey.logic.readonly` but **not**
`homey.logic`, so an app cannot write Logic variables no matter what it declares in
`permissions`. Scopes are not derived from the manifest — adding a made-up permission is
accepted and silently ignored. HomeyScript is special-cased in firmware and does have
`homey.logic`; ordinary apps cannot borrow it (`homey-lib` explicitly forbids declaring
`homey:app:com.athom.homeyscript`).

Owning the devices sidesteps all of that: an app may freely write its own device settings and
capabilities. That is still why the scheduling core needs no permission at all.

Two permissions are declared, each for one specific thing, and neither should grow:

- `homey:manager:geolocation` — sunrise and sunset.
- `homey:manager:api` — switching devices owned by other apps. Measured 2026-09-18:
  `this.homey.api.get/post/put/delete` all throw `No permission to use ManagerApi` without it,
  even though only `getOwnerApiToken()` and `getLocalUrl()` are documented as requiring it.
  `realtime()` is the exception and works without it, which is why widget live-updates
  predate this permission. There is no narrower "control devices" permission — the manifest
  has 13 to choose from — so the "control everything" install warning is the price of
  switching a lamp, and `homey app validate` warns that it slows store review.

The app uses the Web API for exactly two things: `GET /manager/devices/device` to list
`onoff`-capable devices, and `PUT /manager/devices/device/:id/capability/onoff` to switch
them. Keep it to that; anything more makes the permission harder to justify in review.

## Architecture

**The scheduler is a tick, not a timer.** `app.ts` runs one `setInterval` (20s) and calls
`onTick(now)` on every device. Each tick computes local wall-clock `HH:MM` via
`nowInZone(homey.clock.getTimezone())`. Comparing wall clock each tick — rather than arming
timers — is what makes it survive DST, restarts and clock jumps. Devices guard on a
`YYYY-MM-DDTHH:MM` key so an event fires at most once per minute, and seed that guard in
`onInit` so restarting mid-minute cannot re-fire.

**A slot is a spec, not a time.** Four settings per slot — `<slot>_mode`, `<slot>`,
`<slot>_offset` and `<slot>_ref` — say "this fixed time", "sunrise/sunset, shifted by N minutes",
or "whatever that Time device comes to, shifted by N minutes".
`resolveSpec` turns that into a concrete `HH:MM` *for a given day*, so `getTime(slot, now)`
answers "what does this come to today". `lib/sun.ts` computes the day's events locally with
NOAA's algorithm; no dependency, no network, and null where the sun does not cross the
horizon. The resolved time is what the capability mirrors and what the tick compares, so a
sun-following slot moves through the year on its own. `syncCapabilities` therefore runs on
**every tick**, not only on a write — the date turning is a change nobody notified us about.

**Only a range may follow a device, and only a Time device may be followed.** That is enforced
by `supportedModes`, which `spec()` also uses to coerce an unsupported stored mode back to
`absolute`. The point is structural: a Time device is always a leaf, so no reference can form a
cycle and `resolve` needs no visited-set or depth limit. Do not "just allow" Time-to-Time
references without adding cycle detection — the resolver runs inside a 20s tick.

**Never compare a stored reference by hand** — resolve it through `matchTarget`, or
`findTimeDevice` for a Time device. `refreshDependents` compared `spec.ref` to a bare id and a
bare name, which was correct until references gained their `Name (id)` form, and then silently
stopped matching: ranges kept working, because the tick recomputes them anyway, but stopped
updating the moment the device they follow moved. A duplicated matcher is the bug; there is one
resolver and it handles all three forms.

`<slot>_ref` holds **either an id or a name**: the widget and the Flow card write the id, which
survives a rename, while the device settings page can only offer a text field (Homey's settings
schema has no device picker), so what is typed there is a name. `findTimeDevice` tries id first.

`publishState()` calls `refreshDependents`, so a range following a device updates as soon as
that device moves rather than on the next tick. Dependents refresh through
`refreshFromDependency`, which deliberately does **not** call `publishState` — that would be a
cascade if the leaf rule were ever relaxed.

**Decision logic lives in `lib/time.ts` as pure functions** (`shouldFire`, `isRangeActive`,
`isRangeEndDue`, `isDayEnabled`, `normalizeTime`) precisely so `test/dst.js` exercises the real
code rather than a copy. Put new scheduling rules there, not inline in a device.

**`lib/ScheduleDevice.ts` is the shared base.** Subclasses declare `slots` (a settings key
paired with the capability that displays it) and implement `onDue`. All writes funnel through
`setSpec` / `setDays` / `setEnabled`, which validate, persist to **device settings**, mirror to
capabilities, and call `publishState()`. Add new write paths through those methods or open
widgets will not update. `setSpec` writes only the fields it is given, which is what lets the
widget switch to sunset without discarding the fixed time to come back to.

**Times live in device settings, not capabilities.** A settable *string* capability has no
text-input UI in Homey, so settings are the source of truth and the read-only `schedule_*`
capabilities mirror them. That mirroring is load-bearing: Homey publishes every capability as a
Flow tag automatically, which is the only reason the times are usable in other Flows.

**A range resolves its start against the day the occurrence began.** For `sunset–sunrise`,
the start in play at 03:00 is *yesterday's* sunset, not today's; `RangeDevice.window()` picks
the right one before handing the pair to the pure functions. With fixed times the two are
identical, which is why this only appeared once times could follow the sun.

**Weekdays select the day a range *starts*.** For `22:00–06:00 on Monday`, the end belongs to
Monday's occurrence and fires on Tuesday morning. Checking the weekday independently per event
leaves the range open until the following Monday — `test/dst.js` pins this. An empty day set
means every day.

**Switching targets is edge-triggered, never enforced.** `RangeDevice.onDue` switches at the
start and the end and at no other moment. Do not add a "make reality match the range" pass on
the tick: it would undo a manual override within 20s, which is the single most annoying thing
a schedule can do.

**Two API surfaces, two files, and both need their routes declared.** `api.ts` at the root
serves `/settings/index.html`; each widget has its own `widgets/*/api.ts`. Two ways to get a
silent 404 on every call, both of which cost an afternoon once:

1. The root `api.ts` must be listed in `tsconfig.json`'s `include`, or it never compiles.
2. **App-level routes must be declared in `.homeycompose/app.json` under `api`**, keyed by
   handler name, exactly like `widget.compose.json` does for widgets:
   `"api": { "getRanges": { "method": "GET", "path": "/ranges" } }`. There is **no**
   name-derived fallback — an undeclared handler is simply not routed. The `api` property is
   absent from homey-lib's app schema, so `homey app validate` passes either way and tells you
   nothing.

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
The same split runs through dropdowns: a *device setting* dropdown's `values` carry `label`,
a *Flow argument* dropdown's `values` carry `title`.

**Custom capabilities get tags but no Flow cards.** `schedule_*` produce tags only. *System*
capabilities do generate cards — `onoff` gives on/off/toggle actions, an `is turned on`
condition, `onoff_*` triggers and a tile toggle for free. Prefer a system capability when one
fits.

**A cog owns the top-right corner of both widgets.** It replaced the power button, so pausing
costs one more tap, but the corner scales to more than one action and the two widgets match —
the Time Picker's menu holds only pause/resume, which is a deliberate trade of one tap for
consistency. The range's device picker is an overlay (`position: absolute; inset: 0`) rather
than another row, which keeps it out of the reported height entirely; worth preserving, the
widget is already tall. The cog glyph is copied from the range widget into the Time Picker and
into `artwork/previews.py` by reading the source, so all three cannot drift.

**`onoff` on a range is the devices it switches; `schedule_enabled` is the pause.** It was the
other way round until the range grew targets, at which point the tile of a device that owns
lights had to switch those lights. Consequences to keep in mind:

- Homey's free on/off/toggle cards now switch the lamps, which is why the bespoke `targets_*`
  cards were removed — two ways to do one thing is worse than none.
- `schedule_enabled` is a custom capability, so it generates **no** cards; `pause`, `resume`
  and the `schedule_running` condition are declared at **app level** (`.homeycompose/flow/`)
  rather than per driver, because a driver-scoped card id must be unique app-wide and both
  drivers need them. Their device arg is filtered `driver_id=time|range`.
- A Time device has no targets, so it has no `onoff` at all — `onInit` removes it from devices
  paired before the swap, and `migrateEnabled` copies the old pause value across first. That
  migration reads `onoff` *before* the driver removes it; do not reorder those.
- The tile value is a mirror of devices this app does not own, refreshed on a 60s throttle in
  `onTick` and written directly after any switch. `isAnyOn` collapses the tri-state: mixed
  reads as on, so a tap offers to turn everything off; unknown reads as off, so the tile never
  claims a lamp is lit.

**Fetch one device, not all of them.** `TargetWatcher` takes a `device(id)` rather than a
device list, and `describeReferences` skips the list entirely when every reference already
carries an id — which it does after the first run. A restart therefore fetches no device list
at all. Measured on a house with 85 devices: parsing that payload and keeping the records live
was 3 MB of heap and a much larger transient peak, which is what grows a Node process's RSS.
`switchableDevices` still fetches the lot, because a picker needs it, but keeps only id, name
and zone and passes `$updateCache: false`.

`process.memoryUsage()` throws `ENOENT: uv_resident_set_memory` inside the app sandbox; use
`v8.getHeapStatistics()`. The heap limit for an app is 70 MB, and this one runs at about 13.

**The switched devices are subscribed to, not polled.** `lib/TargetWatcher.ts` holds one
`makeCapabilityInstance('onoff', …)` per target device, shared by every range that targets it
and opened only for devices a user picked — subscribing to all 85 devices in a house to render
one button is the cost this exists to avoid. `targetStateOf` then reads values from memory, so
refreshing the tile is free and runs on every tick as a backstop.

Three things that are load-bearing:

- **Seed on subscribe.** An instance reports *changes*, not the state it starts in, so `sync`
  takes the value from the device item it subscribed through.
- **`resync()` passes `$cache: false`.** Once connected, homey-api serves reads from a cache
  kept live by those same events, so a safety re-read through the normal path would only ever
  confirm itself. It runs every 15 minutes, against a subscription that stopped delivering
  without disconnecting.
- **Destroy on the way out.** `sync` closes instances for devices no longer targeted and
  `onUninit` closes the rest. Leaked subscriptions across app restarts are the exact resource
  problem this replaced.

Anything that changes a range's `targets` must call `syncWatchedTargets`, or the new devices
are stored but never watched.

**`onoff` on a range is the devices it switches; `schedule_enabled` is the pause.** It was the
other way round until the range grew targets, at which point the tile of a device that owns
lights had to switch those lights. Consequences to keep in mind:

- Homey's free on/off/toggle cards now switch the lamps, which is why the bespoke `targets_*`
  cards were removed — two ways to do one thing is worse than none.
- `schedule_enabled` is a custom capability, so it generates **no** cards; `pause`, `resume`
  and the `schedule_running` condition are declared at **app level** (`.homeycompose/flow/`)
  rather than per driver, because a driver-scoped card id must be unique app-wide and both
  drivers need them. Their device arg is filtered `driver_id=time|range`.
- A Time device has no targets, so it has no `onoff` at all — `onInit` removes it from devices
  paired before the swap, and `migrateEnabled` copies the old pause value across first. That
  migration reads `onoff` *before* the driver removes it; do not reorder those.
- The tile value is a mirror of devices this app does not own, refreshed on a 60s throttle in
  `onTick` and written directly after any switch. `isAnyOn` collapses the tri-state: mixed
  reads as on, so a tap offers to turn everything off; unknown reads as off, so the tile never
  claims a lamp is lit.

**The targets button polls, but the app pushes what it knows.** A widget gets realtime events
for devices *this app owns*, and the switched devices belong to other apps, so the state button
refreshes on load, on `visibilitychange`, after its own writes, and on a 30s interval while
visible. The poll alone is not enough: when the schedule itself switches the targets, the app
knows the new state at that instant, so `publishTargetState` emits a `targets` realtime event
rather than letting the widget sit wrong for up to 30s. Anything that switches targets must
publish — that is the whole difference between the button feeling live and feeling broken.
A change made *outside* the app (someone using a wall switch) is still only seen by the poll.
`rawDevices(maxAge)` is the single fetch point behind it, so several widgets asking at once
cost one API call; the picker accepts a 5 minute age, the state button 3 seconds.

`aggregateState` keeps `unknown` distinct from `off` on purpose — all-unreachable must not
render as "everything is off" — and `nextState` says only all-off turns things on, so mixed
and unknown both mean "turn everything off". Both are pure and pinned in `test/sun.js`.

**The widget previews are generated, not drawn.** `artwork/previews.py` builds the four
mock-up SVGs and `artwork/build.sh` runs it before rasterising, so `./artwork/build.sh` is the
only command needed. It reads the mode glyphs and the cog straight out of
`widgets/range-picker/public/index.html`: they were restated by hand once and the preview
silently fell a mode behind when the fourth chip arrived. Adding a mode now means adding it to
`MODES` — the icon follows by itself.

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
