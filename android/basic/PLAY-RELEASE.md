# Pregătirea semnării Google Play

Stare: configurație pregătită; nicio cheie de producție creată, nicio înscriere în Play App Signing efectuată, nicio publicare.

## Varianta recomandată

La prima încărcare în Play Console, proprietarul alege Play App Signing cu cheia de semnare a aplicației generată și păstrată de Google. Pe laptop se creează separat o cheie de încărcare (upload key), folosită pentru semnarea AAB-urilor trimise către Google. Google semnează APK-urile distribuite utilizatorilor cu cheia de semnare a aplicației.

Cheia locală de upload se păstrează pentru toate actualizările viitoare. Dacă este pierdută sau compromisă, Play permite solicitarea resetării ei fără schimbarea identității aplicației instalate. Nu se recreează la fiecare versiune.

Cheia APK-urilor de test rămâne exclusiv pentru debug. Versiunea Play va avea altă semnătură și nu va înlocui printr-un update obișnuit instalarea test2.

## Ce trebuie să facă proprietarul înainte de crearea cheii

1. Confirmă varianta recomandată: Google păstrează cheia de semnare a aplicației, proprietarul păstrează cheia locală de upload. Cheia generată de Google nu poate fi descărcată ulterior. Dacă dorești distribuție în alte magazine cu aceeași semnătură, decidem înainte dacă furnizezi tu cheia de semnare a aplicației.
2. Alege un director privat în afara proiectului și oricărui repository/sync public pentru keystore. Nu trimite cheia sau parolele în conversație și nu le încărca pe GitHub.
3. Alege o parolă puternică și salveaz-o în managerul de parole. Alias recomandat: `vef-basic-upload`; cheie RSA 3072 biți, certificat valabil minimum 30 de ani. Datele publice ale certificatului trebuie să folosească numai identitatea publică aprobată a aplicației, fără numele contului Windows sau denumiri private. Parolele se introduc local prin dialog/prompt protejat, fără argumente în istoricul comenzilor. Nu folosi cheia, aliasul sau parola de debug.
4. Pregătește două copii de siguranță criptate în locații separate. După crearea autorizată, păstrează fișierul keystore, aliasul și parolele și verifică recuperarea unei copii. Păstrează separat amprentele certificatului și application ID-ul.
5. Protejează contul Play Console cu autentificare în doi pași și metode de recuperare. Păstrează evidența certificatului de upload și a certificatului de semnare a aplicației din Play.

Crearea cheii și înscrierea în Play App Signing se fac numai după confirmarea proprietarului. Pregătirea actuală nu execută aceste acțiuni.

## Configurația pentru actualizări

`release-signing.gradle` primește local cele patru variabile `VEF_UPLOAD_*` documentate în README. Nu conține secrete sau o locație personală fixă. `.gitignore` exclude keystore-uri, chei, fișiere de parole, medii locale și rezultatele compilării. Excluderea Git este suplimentară; materialele private trebuie păstrate efectiv în afara repository-ului.

Pentru fiecare update: păstrează `app.vessel.vef.basic`, folosește aceeași cheie de upload, crește versionCode, rulează testele, generează și verifică AAB release și obține autorizarea publicării. Nu crea o cheie nouă la fiecare versiune.

## Referințe oficiale

- [Semnarea și Play App Signing](https://developer.android.com/studio/publish/app-signing)
- [Cerința target API Google Play](https://developer.android.com/google/play/requirements/target-sdk)
- [AGP 8.10.1 stabil, suport API 36](https://developer.android.com/build/releases/agp-8-10-0-release-notes)

Din 31 august 2026, cerința standard pentru aplicații noi este API 36. Proiectul folosește această versiune; funcțiile și formulele calculatorului sunt păstrate.
