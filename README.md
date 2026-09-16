# JS Gadgets

A Homey app that turns a schedule into a **device**, so the times live somewhere you
can see and change them — including from a dashboard tile — instead of being buried
inside a Flow.

![Time Range Picker](widgets/range-picker/preview-light.png)

## Why

In Homey a schedule is normally an invisible property of a Flow: `19:25` sits inside a
trigger card, and changing it means opening the Flow editor. That makes "when do the
lamps come on?" a question only the person who edits Flows can answer, let alone change.

These devices give a schedule a name, a place in the device list, Flow cards, Flow tags,
and a widget anyone in the household can adjust.

## Devices

### Time

A single moment in the day.

| | |
|---|---|
| Setting | `Time` (`HH:MM`), repeat weekdays |
| Trigger | **The time is reached** — carries a `Time` tag |
| Action | **Set the time** — accepts a literal time or a tag |
| Tags | `Time` |

### Time Range

A start and an end, plus a live state for "are we inside the window right now?".

Think of it as a sensor whose reading is the window, not a pair of stored values: the
two times are its configuration, the same way a motion sensor has a sensitivity, and the
reading is **Within range**, which the device keeps up to date on its own.

| | |
|---|---|
| Settings | `Start`, `End` (`HH:MM`), repeat weekdays |
| Triggers | **The range starts**, **The range ends** — each carries a `Time` tag |
| Condition | **The time is / is not within the range** |
| Actions | **Set the start time**, **Set the end time** |
| Tags | `Start`, `End`, `Within range` |

A typical pair of Flows:

```
WHEN  The range starts (Evening lamps)  →  THEN  turn on Evening lamps
WHEN  The range ends   (Evening lamps)  →  THEN  turn off Evening lamps
```

## Behaviour worth knowing

**Ranges may cross midnight.** `22:00 – 06:00` starts in the evening and ends the next
morning. A range is active from its start minute up to, but not including, its end
minute. Setting both times the same makes the range *never* active, rather than always.

**Weekdays select the day a range starts.** `22:00 – 06:00` on *Monday* means the night
that begins on Monday, and it closes on Tuesday morning. Judging each end on its own
calendar day would leave the range open until the following Monday. Leave every day
unticked to repeat daily.

**Pausing keeps everything.** The `onoff` toggle stops the device acting on its times
without losing them, so pausing over a holiday does not cost you your weekday selection.
Pausing a range that is currently running forces **Within range** to false but does *not*
fire **The range ends** — disable means *stop scheduling*, not *run the end action now*.

**Times are read in Homey's own timezone**, compared against the wall clock on every
tick. That is what makes the scheduler survive daylight-saving changes, restarts and
clock corrections. At the spring transition a schedule inside the skipped hour does not
fire at all that day; at the autumn transition a schedule inside the repeated hour fires
once, not twice.

## Widgets

**Time Picker** and **Time Range Picker** put the times, the weekday strip and a pause
button on the dashboard. Pick which device a widget edits in its settings.

Changes made anywhere — widget, device settings, or a Flow action — show up in an open
widget immediately.

## Development

```sh
npm install
npm test                 # scheduler behaviour, incl. DST and weekday semantics
npx homey app validate --level publish
npx homey app install
./artwork/build.sh       # regenerate images from SVG (needs rsvg-convert)
```

Written in TypeScript. `tsconfig.json` must keep `outDir: "./.homeybuild"` — the Homey
CLI refuses to build otherwise.

## Requirements

Homey Pro. Dashboard widgets are not available on Homey Cloud.

## Licence

GPL-3.0
