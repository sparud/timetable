Zeitpläne als Geräte: Zeiten, die der Sonne folgen, und die Lampen, die sie schalten.

In Homey steckt ein Zeitplan normalerweise in einem Flow, und ihn zu ändern heißt, den Flow-Editor zu öffnen. Timetable macht aus dem Zeitplan stattdessen ein Gerät: mit Namen, einem Platz in der Geräteliste, einer Dashboard-Kachel, die jeder im Haushalt anpassen kann — und es schaltet deine Lampen selbst, ganz ohne Flow.

ZEIT
Ein einzelner Zeitpunkt am Tag. Löst einen Flow aus, sobald die Uhr ihn erreicht.

ZEITRAUM
Ein Start und ein Ende sowie ein aktueller Zustand „Im Zeitraum“, den du in Bedingungen prüfen kannst. Zeiträume dürfen über Mitternacht gehen — 22:00-06:00 ist die Nacht, die heute beginnt.

Beide Geräte wiederholen sich an den von dir gewählten Wochentagen, lassen sich pausieren, ohne ihre Zeiten zu verlieren, und veröffentlichen ihre Werte als Flow-Tags, sodass du sie überall in Benachrichtigungen oder Vergleichen verwenden kannst.

DER SONNE FOLGEN
Jede Zeit kann fest sein oder dem Sonnenauf- oder -untergang folgen, mit einer Verschiebung in Minuten — Sonnenuntergang minus 30 für die Lampen, Sonnenaufgang plus 15 für die Jalousien. Die tatsächliche Zeit des Tages berechnet der Homey selbst, sodass der Zeitplan dem Jahreslauf von allein folgt. Sonnenuntergang bis Sonnenaufgang ist ein Zeitraum, der genau dann aktiv ist, wenn es dunkel ist. Start oder Ende eines Zeitraums kann auch einem Zeit-Gerät folgen, sodass mehrere Zeiträume dieselbe Zeit teilen: Verschiebe das Zeit-Gerät, und alle verschieben sich mit.

WIDGETS
Zeitauswahl und Zeitraum-Auswahl bringen die Zeiten, die Wochentage, die Geräte und den Schalter auf dein Dashboard, sodass ein Zeitplan mit wenigen Tipps geändert ist. Füge das Widget dem Dashboard hinzu und wähle dann in den Einstellungen des Widgets, welches Gerät es anzeigt — bis dahin bittet es dich nur, eines auszuwählen. Ein Widget zeigt einen Zeitplan.

GERÄTE SCHALTEN
Hake die Geräte an, die ein Zeitraum schalten soll: Sie gehen zu Beginn an und am Ende aus — ganz ohne Flow. Die Kachel des Zeitraums schaltet sie ebenfalls und zeigt, wenn einige an sind und andere nicht, sodass sie zugleich eine vom Dashboard aus bearbeitbare Lampengruppe ist. Geschaltet wird nur am Anfang und am Ende, nie dazwischen — eine von Hand ausgeschaltete Lampe bleibt aus.

Timetable verlangt zwei Berechtigungen. Der Standort des Homey ist die Grundlage für Sonnenauf- und -untergang, berechnet auf dem Homey selbst, ohne dass etwas übertragen wird. Voller Zugriff auf Homey ist nötig, damit ein Zeitraum ein Gerät einer anderen App schalten kann — eine engere Berechtigung dafür gibt es bei Homey nicht. Sie wird für genau zwei Dinge genutzt: schaltbare Geräte auflisten und die von dir gewählten schalten.

Erfordert Homey Pro; Dashboard-Widgets gibt es auf Homey Cloud nicht.
