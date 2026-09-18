Scheman som är enheter: tider som följer solen, och lamporna de styr.

I Homey ligger ett schema normalt inuti ett flöde, och att ändra det betyder att öppna flödesredigeraren. Timetable gör schemat till en enhet i stället: den har ett namn, en plats i enhetslistan, en panelruta som vem som helst i hushållet kan justera — och den kan styra dina lampor själv, helt utan flöde.

TID
Ett enskilt ögonblick på dygnet. Utlöser ett flöde när klockan når det.

TIDSINTERVALL
En start och ett slut, plus ett direkt "Inom intervallet"-tillstånd du kan använda i villkor. Intervall får passera midnatt — 22:00-06:00 är natten som börjar i dag.

Båda enheterna upprepas på de veckodagar du väljer, kan pausas utan att tiderna går förlorade, och publicerar sina värden som flödestaggar så att du kan använda dem i aviseringar eller jämförelser var som helst.

FÖLJER SOLEN
Varje tid kan vara fast eller följa soluppgången eller solnedgången, med en förskjutning i minuter — solnedgång minus 30 för lamporna, soluppgång plus 15 för persiennerna. Dagens verkliga tid räknas ut i Homeyn själv, så schemat följer med genom året av sig självt. Solnedgång till soluppgång är ett intervall som är aktivt precis när det är mörkt. Ett intervalls start eller slut kan också följa en Tid-enhet, så att flera intervall delar samma tid: flytta Tid-enheten så flyttas alla med den.

WIDGETAR
Tidsväljare och Tidsintervall lägger tiderna, veckodagarna och pausknappen på din instrumentpanel, så att ett schema kan ändras med ett par tryck.

SLÅR PÅ OCH AV ENHETER
Kryssa i enheterna ett intervall ska styra, så slås de på när det börjar och av när det slutar — helt utan flöde. Intervallets egen panelruta styr dem också och visar när några är på men inte andra, så den fungerar som en lampgrupp du redigerar från instrumentpanelen. Den agerar vid början och slutet, aldrig däremellan, så en lampa du släcker för hand lämnas i fred.

Timetable begär två behörigheter. Att läsa Homeyns plats är det soluppgång och solnedgång räknas ut från, i Homeyn själv, utan att något skickas vidare. Full åtkomst till Homey är det som låter ett intervall styra en enhet som tillhör en annan app — Homey har ingen smalare behörighet för det. Den används bara till två saker: att lista enheter som kan styras, och att styra dem du valt.

Kräver Homey Pro; widgetar finns inte på Homey Cloud.
