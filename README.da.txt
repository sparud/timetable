Tidsplaner som er enheder: tider der følger solen, og lamperne de styrer.

I Homey ligger en tidsplan normalt inde i et flow, og at ændre den betyder at åbne flow-editoren. Timetable gør tidsplanen til en enhed i stedet: den har et navn, en plads på enhedslisten, et dashboard-felt som alle i husstanden kan justere — og den styrer dine lamper selv, helt uden flow.

TID
Et enkelt tidspunkt på dagen. Udløser et flow, når uret når det.

TIDSINTERVAL
En start og en slutning plus en direkte "Inden for intervallet"-tilstand, du kan bruge i betingelser. Intervaller må krydse midnat — 22:00-06:00 er natten, der begynder i dag.

Begge enheder gentages på de ugedage, du vælger, kan sættes på pause uden at miste tiderne, og udgiver deres værdier som flow-tags, så du kan bruge dem i notifikationer eller sammenligninger overalt.

FØLGER SOLEN
Hvert tidspunkt kan være fast eller følge solopgang eller solnedgang, med en forskydning i minutter — solnedgang minus 30 til lamperne, solopgang plus 15 til gardinerne. Dagens faktiske tidspunkt beregnes på Homey selv, så tidsplanen følger med året af sig selv. Solnedgang til solopgang er et interval, der er aktivt præcis mens det er mørkt. Et intervals start eller slut kan også følge en Tid-enhed, så flere intervaller deler samme tidspunkt: flyt Tid-enheden, og de flytter sig alle med den.

WIDGETS
Tidsvælger og Tidsinterval placerer tiderne, ugedagene, enhederne og kontakten på dit dashboard, så en tidsplan kan ændres med et par tryk. Tilføj widgetten til dashboardet, og vælg derefter i widgettens egne indstillinger, hvilken enhed den skal vise — indtil da beder den dig bare vælge en. Én widget viser én tidsplan.

TÆNDER OG SLUKKER ENHEDER
Sæt flueben ved de enheder et interval skal styre, så tændes de når det starter og slukkes når det slutter — helt uden flow. Intervallets egen flise styrer dem også og viser, når nogle er tændt men ikke andre, så den fungerer som en lampegruppe du redigerer fra dashboardet. Det handler ved start og slut, aldrig imellem, så en lampe du slukker manuelt får lov at være slukket.

Timetable beder om to tilladelser. At læse Homeys placering er det, solopgang og solnedgang beregnes ud fra, på Homey selv, uden at noget sendes videre. Fuld adgang til Homey er det, der lader et interval styre en enhed, som tilhører en anden app — Homey har ingen smallere tilladelse til det. Den bruges kun til to ting: at vise enheder, der kan styres, og at styre dem, du har valgt.

Kræver Homey Pro; widgets findes ikke på Homey Cloud.
