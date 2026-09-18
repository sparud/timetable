Schema's als apparaten: tijden die de zon volgen, en de lampen die ze schakelen.

In Homey zit een schema normaal gesproken in een Flow, en het wijzigen betekent de Flow-editor openen. Timetable maakt van het schema juist een apparaat: met een naam, een plek in je apparatenlijst, een dashboardtegel die iedereen in huis kan bijstellen — en het schakelt je lampen zelf, zonder Flow.

TIJD
Eén moment op de dag. Start een Flow zodra de klok dat moment bereikt.

TIJDSBEREIK
Een begin en een einde, plus een actuele status "Binnen bereik" die je in voorwaarden kunt gebruiken. Bereiken mogen over middernacht lopen — 22:00-06:00 is de nacht die vandaag begint.

Beide apparaten herhalen op de weekdagen die je kiest, kunnen worden gepauzeerd zonder hun tijden te verliezen, en publiceren hun waarden als Flow-tags zodat je ze overal in meldingen of vergelijkingen kunt gebruiken.

DE ZON VOLGEN
Elke tijd kan vast zijn of zonsopkomst of zonsondergang volgen, met een verschuiving in minuten — zonsondergang min 30 voor de lampen, zonsopkomst plus 15 voor de zonwering. De echte tijd van de dag rekent de Homey zelf uit, zodat het schema vanzelf met het jaar meebeweegt. Zonsondergang tot zonsopkomst is een bereik dat actief is precies zolang het donker is. Het begin of einde van een bereik kan ook een Tijd-apparaat volgen, zodat meerdere bereiken dezelfde tijd delen: verplaats het Tijd-apparaat en ze verschuiven allemaal mee.

WIDGETS
Tijdkiezer en Tijdsbereik zetten de tijden, de weekdagen en de pauzeknop op je dashboard, zodat een schema met een paar tikken is aangepast.

APPARATEN SCHAKELEN
Vink de apparaten aan die een bereik moet schakelen: ze gaan aan als het begint en uit als het eindigt — zonder Flow. De tegel van het bereik schakelt ze ook en laat zien wanneer sommige aan zijn en andere niet, zodat het meteen een lampgroep is die je vanaf het dashboard bewerkt. Er wordt alleen aan het begin en het einde geschakeld, nooit ertussenin, dus een lamp die je met de hand uitdoet blijft uit.

Timetable vraagt om twee permissies. De locatie van je Homey is waaruit zonsopkomst en zonsondergang worden berekend, op de Homey zelf, zonder dat er iets wordt verstuurd. Volledige toegang tot Homey is nodig om een apparaat van een andere app te kunnen schakelen — een beperktere permissie bestaat daarvoor niet. Die wordt voor precies twee dingen gebruikt: schakelbare apparaten tonen, en de door jou gekozen apparaten schakelen.

Vereist Homey Pro; dashboardwidgets zijn niet beschikbaar op Homey Cloud.
