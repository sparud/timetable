Schedules that are devices: sun-aware times, and the lights they switch.

In Homey a schedule normally lives inside a Flow, where changing it means opening the Flow editor. Timetable turns a schedule into a device instead: it has a name, a place in your device list, a dashboard tile anyone in the household can adjust — and it can switch your lights itself, without a Flow at all.

TIME
A single moment in the day. Triggers a Flow when the clock reaches it.

TIME RANGE
A start and an end, the devices it switches, and a live "Within range" state you can test in conditions. Ranges may cross midnight — 22:00-06:00 is the night that begins today.

Both devices repeat on the weekdays you choose, can be paused without losing their times, and publish their values as Flow tags so you can use them in notifications or comparisons anywhere.

FOLLOWING THE SUN
Every time can be fixed, or track sunrise or sunset with an offset in minutes — sunset minus 30 for the lamps, sunrise plus 15 for the blinds. Each day's real time is worked out on the Homey itself, so the schedule drifts through the year on its own. Sunset to sunrise is a range that is active exactly while it is dark. A range's start or end can also follow a Time device, so several ranges can share one time: move the Time device and they all move with it.

SWITCHING DEVICES
Tick the devices a range should control and it turns them on when it starts and off when it ends — no Flow required. The range's own tile then switches them too, showing when some are on but not others, so it doubles as a light group you can edit from the dashboard. It acts at the start and the end and never in between, so a lamp you switch by hand is left alone.

WIDGETS
Time Picker and Time Range Picker put the times, the weekdays, the devices and the switch on your dashboard, so a schedule can be changed in a couple of taps. Add the widget to a dashboard, then open the widget's own settings and choose which device it shows — until you do, it just asks you to pick one. One widget shows one schedule.

Timetable asks for two permissions. Reading Homey's location is what sunrise and sunset are computed from, on the Homey itself, with nothing sent anywhere. Full access to Homey is what lets a range switch a device owned by another app — Homey has no narrower permission for that. It is used for two things only: listing devices that can be switched, and switching the ones you picked.

Requires Homey Pro; dashboard widgets are not available on Homey Cloud.
