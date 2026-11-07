# Näkymä 3 — Data Enrichment (Optional)

## Tavoite ja rajaus
Suunnitellaan vapaaehtoinen lisätietovaihe ennen tuloksia: TrackMan-mittaukset ja käyttäjän tuntema osumakohta. Tässä vaiheessa ei rakenneta sivua eikä muuteta nykyistä svingisivua.

Kaksi toimitettua View 3 -speksiä ovat sisällöltään samat. Takomon helmikuun 2025 brändikirja ohjaa niiden visuaalista ilmettä ja tekstejä. Näkymä ei sisällä uusia peruskysymyksiä, varren pituusyhteenvetoa tai mailasuosituksia.

## Brändi ja rakenne
- Midnight Black **#0B0B0B**, Washed White **#F8F8F8**, Tiger Orange **#FF6E01**. Tumma kokonaisuus, harmaat pinnat ja oranssi toimintojen korostuksena; brändikirjan yleinen 60/30/10-värisuhde.
- Otsikot: Barlow Condensed, suuret ja napakat; nykyisen sovelluksen kursivoitu uppercase-linja säilyy. Leipäteksti ja pienet selitteet: Barlow, ei Inter/Roboto.
- Selkeä yksipalstainen sivu, osiot erotetaan väleillä ja hillityillä viivoilla. Ei sisäkkäisiä kortteja, koristeellisia hehkuja tai TrackManin omaa brändiä jäljittelevää ilmettä.
- Puhe on osaavan golfkaverin: rentoa, suoraa ja rehellistä. Ei lupausta täydellisestä tarkkuudesta tai siitä, että mailat korjaavat svingin.
- Mobiilissa kentät ja toiminnot pinoutuvat; leveällä ruudulla mittauskentät voivat olla kahdessa sarakkeessa.

```text
TAKOMO                                      STEP 3 / 5

Grantin kuva · lyhyt viesti

TRACKMAN DATA
Raporttilinkki                         [Fetch data]
Tuonnin tila / tuodut mittaukset
▸ Enter data manually

FACE IMPACT · OPTIONAL                     [toggle]
           Heel       Center       Toe

[ CONTINUE TO FITTING RESULTS → ]
                 Skip this step
```

## 1. Yläpalkki ja Grant
- Kiinteä Takomo-yläpalkki ja **Step 3 / 5**.
- Grantin kompakti kuva (noin 80 × 80) ja viesti: “Got TrackMan numbers? Add them here. If not, no worries—this step is optional.”
- Grantin AI-videota käytetään vasta hyväksytyn materiaalin ja käyttöluvan ollessa saatavilla. Sitä ei esitetä suorana ihmiskontaktina.
- Äänipainike lisätään vain toimivan äänen yhteydessä. Nykyinen kuva ja teksti ovat rehellinen välivaihtoehto; koristeellista mykistyspainiketta ei näytetä.

## 2. TrackMan-tiedot
### Raporttilinkki
- Linkkikenttä ja **Fetch TrackMan data** -toiminto speksin mukaisesti.
- Tilat: tyhjä, tarkistetaan, haetaan, tuotu, osittaiset tiedot, ei pääsyä, virhe. Tuonnin aikana estetään päällekkäiset haut.
- Tavallinen kirjautumista vaativa TrackMan-portaalilinkki ei ole automaattisesti luettavissa. Käyttäjältä ei pyydetä TrackMan-salasanaa eikä kirjautumista kierretä.
- Linkkituonnin toteutusedellytys on luvallinen pääsy ja testattu raporttimuoto. Jos niitä ei ole, näkymä kertoo rajoituksen ja tarjoaa manuaaliset kentät—ei tekaistua onnistumista.
- Onnistumisen jälkeen näytetään oikeasti saadut arvot, yksiköt ja lähde. Vain tuodut parametrit saavat onnistumismerkinnän. “Imported from TrackMan” ei tarkoita, että sovellus olisi varmistanut mittalaitteen tarkkuuden tai pelaajan henkilöllisyyden.

### Manuaalinen vaihtoehto
- Avattava **Enter data manually** -osio: clubhead speed (mph), carry (m/yd), launch angle (°), spin rate (rpm).
- Kaikki kentät vapaaehtoisia. Tyhjä kenttä ei muutu nollaksi eikä estä ohittamista.
- Näkyvä m/yd-valitsin ja hallittu yksikkömuunnos; alkuperäinen syöte ja lähde säilyvät.
- Arvoihin yhdistetään käytetty maila: suositeltu 7-iron, koska alkuperäinen profiili käyttää sitä. Muun mailan nopeutta tai carrya ei verrata suoraan rauta-7:n arvoihin.
- Virheelliset luvut ja epäilyttävät ristiriidat pyydetään tarkistamaan kyseisen arvon kohdalta. Turvalliset numerorajat määritetään ennen toteutusta; niitä ei keksitä fitting-säännöiksi tässä suunnitelmassa.
- Tuotuja arvoja voi korjata tai poistaa; korjattu arvo merkitään käyttäjän antamaksi, ei enää muuttamattomaksi TrackMan-tuonniksi.

## 3. Osumakohta — vapaaehtoinen
- Kytkin oletuksena pois päältä. Viesti: “No need to overdo it. If you know your usual strike location, add it here.”
- Päällä: **Heel / Center / Toe** -valinnat ja mahdollisuus jättää vastaamatta tai poistaa valinta. Kytkimen sulkeminen poistaa tiedon aktiivisesta suositusaineistosta.
- Osumakohta tallennetaan käyttäjän havaintona. Se ei yksin todista dynaamista lie-kulmaa.
- **Poikkeama speksiin:** automaattista +1° upright / flat -muutosta ei tehdä pelkän heel/toe-vastauksen perusteella. Suunta ja suuruus vaativat validoidun fitting-säännön ja lisänäyttöä. Teksti selittää tämän lyhyesti.
- “Standard specs are 100% recommended” korvataan maltillisella viestillä: turha hienosäätö ei ole tarpeen, mutta standardisopivuutta ei luvata kaikille.

## 4. Tallennus ja eteneminen
- Lisätiedot tallentuvat Lovable Cloudiin samaan fittingiin ilman alkuperäisten vastausten, vahvistetun profiilin tai svingivideon ylikirjoittamista.
- **Continue to fitting results** odottaa onnistunutta tallennusta. Virheessä pysytään sivulla ja tarjotaan uusi yritys.
- **Skip this step** merkitsee lisätietovaiheen ohitetuksi, säilyttää aiemmat vastaukset ja videon sekä jättää tämän vaiheen lisätiedot pois aktiivisesta tulosaineistosta.
- Svingisivulle lisätään myöhemmässä toteutuksessa selkeä siirtymä tähän vapaaehtoiseen vaiheeseen. Siirtyminen ei väitä svingianalyysin valmistuneen.
- Näkymä 4 ei vielä ole rakennettu. Sen varsinainen suositus suunnitellaan erikseen; jos View 3 rakennetaan ensin, tarvitaan rehellinen tulossivun välitila. Painiketta ei kytketä olemattomaan sivuun tai keksittyihin tuloksiin.

## Tekniset toteutusperiaatteet
- Uusi `/enrichment`-sivu, oma sivukohtainen metadata ja nykyiset yhteiset UI-elementit sekä semanttiset bränditokenit.
- Jaettu fitting-lukupolku; lisätietojen erillinen tallennus, jotta chatin vanha autosave ei voi pyyhkiä niitä. Lähde, maila, yksiköt, tuontiaika, korjaukset, osumakohta ja ohitustila säilyvät.
- Sama selaimen 256-bittinen capability ja palvelimella tiivisteeseen rajattu käyttöoikeus; ei suoraa vierailijoiden pääsyä toistensa tietoihin.
- Mahdollinen linkkihaku palvelinpuolella: sallittujen TrackMan-osoitteiden rajaus, uudelleenohjausten tarkistus, aikakatkaisu ja kokoraja; ei yksityisverkko-osoitteiden hakua. Raporttilinkkejä ei julkaista tai kirjata tarpeettomasti lokiin.
- TrackManin virallinen TPS-ohje tukee CSV-vientiä. CSV-tuonti on mahdollinen myöhempi vaihtoehto, ei lisätty vaatimus tähän näkymään ilman päätöstä.

## Tarkistus ennen valmistumista
- Testit yksikkömuunnoksille, puuttuville arvoille, lähteen vaihtumiselle korjauksessa, vapaaehtoisuudelle ja sille, ettei osumakohta muuta lie-kulmaa automaattisesti.
- Oikealla raporttiesimerkillä varmennettu tuonti tai selkeä saatavuusrajoitus; osittaiset raportit ja epäonnistumiset testataan.
- Koko polku: vahvistettu profiili → lisätiedot → tallennus → seuraava sivu → uudelleenlataus; myös ohitus ja tietojen poistaminen.
- Mobiili- ja työpöytätarkistus sekä fittingien välisen yksityisyyden testi.

## Riippuvuudet ja lähteet
- Linkkituonti odottaa luvallista TrackMan-raporttiesimerkkiä ja vahvistettua pääsyä. Julkista Golf-session API-sopimusta ei ole tässä työssä vahvistettu.
- Grantin AI-video/ääni odottaa hyväksyttyä materiaalia ja käyttöoikeutta. Todellinen svingianalyysi on edelleen erillinen, validoimaton vaihe.
- Brändikirja: *2025-02 Takomo Brand Book, public version*, erityisesti sivut 7–8, 12–14 ja 18–23. Fontti- ja värisivut tarkistettu myös kuvina.
- TrackMan: [TPS CSV export](https://support.trackmangolf.com/hc/en-us/articles/12985883274139-Shot-Analysis-How-To-Export-A-CSV-File-From-TPS), [portal report sharing](https://support.trackmangolf.com/hc/en-us/articles/41434874801819-Shot-Analysis-Automatic-Report-Sharing), [Impact Offset](https://support.trackmangolf.com/hc/en-us/articles/39724554752155-Parameters-Impact-Offset-Tee-to-Green).