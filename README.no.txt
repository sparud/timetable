Tidsplaner som er enheter: tider som følger solen, og lampene de styrer.

I Homey ligger en tidsplan vanligvis inne i en flyt, og å endre den betyr å åpne flytredigereren. Timetable gjør tidsplanen til en enhet i stedet: den har et navn, en plass i enhetslisten, et dashbordkort som hvem som helst i husstanden kan justere — og den styrer lampene dine selv, helt uten flyt.

TID
Et enkelt tidspunkt på døgnet. Utløser en flyt når klokken når det.

TIDSINTERVALL
En start og en slutt, pluss en direkte "Innenfor intervallet"-tilstand du kan bruke i betingelser. Intervaller kan krysse midnatt — 22:00-06:00 er natten som begynner i dag.

Begge enhetene gjentas på ukedagene du velger, kan settes på pause uten å miste tidene, og publiserer verdiene sine som flyt-tagger slik at du kan bruke dem i varsler eller sammenligninger overalt.

FØLGER SOLEN
Hvert tidspunkt kan være fast eller følge soloppgang eller solnedgang, med en forskyvning i minutter — solnedgang minus 30 for lampene, soloppgang pluss 15 for persiennene. Dagens faktiske tidspunkt regnes ut på Homey selv, så tidsplanen følger med gjennom året av seg selv. Solnedgang til soloppgang er et intervall som er aktivt nøyaktig mens det er mørkt. Starten eller slutten på et intervall kan også følge en Tid-enhet, slik at flere intervaller deler samme tidspunkt: flytt Tid-enheten, så flytter alle seg med den.

WIDGETS
Tidsvelger og Tidsintervall legger tidene, ukedagene, enhetene og bryteren på dashbordet, så en tidsplan kan endres med et par trykk. Legg widgeten til på dashbordet, og velg deretter i widgetens egne innstillinger hvilken enhet den skal vise — inntil da ber den deg bare velge en. Én widget viser én tidsplan.

SLÅR PÅ OG AV ENHETER
Huk av enhetene et intervall skal styre, så slås de på når det starter og av når det slutter — helt uten flyt. Intervallets egen flis styrer dem også og viser når noen er på men ikke andre, så den fungerer som en lampegruppe du redigerer fra dashbordet. Den handler ved start og slutt, aldri imellom, så en lampe du slår av for hånd får være i fred.

Timetable ber om to tillatelser. Å lese Homeys posisjon er det soloppgang og solnedgang regnes ut fra, på Homey selv, uten at noe sendes videre. Full tilgang til Homey er det som lar et intervall styre en enhet som tilhører en annen app — Homey har ingen smalere tillatelse for det. Den brukes bare til to ting: å liste enheter som kan styres, og å styre dem du har valgt.

Krever Homey Pro; widgets er ikke tilgjengelig på Homey Cloud.
