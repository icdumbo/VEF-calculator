# Audit matematic VEF FULL — 10.10.2026

Sursă auditată: `main`, commit `ef751a8` din `icdumbo/VEF-calculator`.
Modificările privesc numai FULL (`index.html`) și testele/documentația sa.
Ramura BASIC `codex/basic-admob-test`, tagul `basic-android16-validated-no-ads`,
proiectul Android și cheile de semnare nu sunt modificate.

## Reguli verificate

- VLR = Ship / B/L, fără rotunjire intermediară la valoarea afișată.
- Voiaj eligibil: cantități pozitive, finite, cu maximum trei zecimale,
  neexclus manual. Validările existente sunt păstrate.
- Average Ratio = suma Ship / suma B/L pentru voiajele eligibile, înainte
  de filtrare. Nu este media aritmetică a VLR-urilor.
- Interval inclusiv Average Ratio ±0.003, într-o singură trecere.
- LOAD V.E.F. = suma Ship / suma B/L numai pentru voiajele finale YES.
- Excluderea manuală produce NO și elimină rândul din ambele seturi de totaluri.
- STS și First voyage after Dry Dock nu declanșează excluderi automate.
- Nu există câmp Voyage No. și nu se cumulează automat rânduri cu același port.
  Indicii de rând existenți în rapoarte identifică rândurile, nu numere de voiaj introduse.

## Buguri confirmate și corectate

1. Limita inclusivă putea fi respinsă din cauza IEEE-754. Exemplu: Ship
   998000 și 1004000, fiecare cu B/L 1000000. Average Ratio = 1.001 și
   ambele rânduri trebuie să fie YES. Comparația folosește o protecție la
   nivelul preciziei mașinii, identică în aplicație și formula Excel;
   nu rotunjește VLR și nu schimbă intervalul comercial ±0.003.
2. Un rând exclus manual cu cantități absente/nevalide afișa `-` în loc de NO.
3. Formulele Excel includeau valori cu peste trei zecimale, deși aplicația
   le elimina. O formulă auxiliară ascunsă și protejată verifică eligibilitatea
   independent de Qualified, evitând dependențele circulare.
4. Valorile calculate salvate în XLSX proveneau din textul rotunjit al
   interfeței. Exportul păstrează acum precizia calculului; formatul vizibil rămâne.
5. XLSX avea rândurile XML 3 și 4 duplicate, iar un calcul fără rânduri
   producea intervale inversate. Rândurile sunt unice și ordonate; exportul gol este valid.
6. Valorile salvate pentru Difference/VLR din rânduri negative puteau
   contrazice formulele Excel, care afișau gol. Am aliniat valorile salvate.
7. PDF renumerota rândurile după eliminarea celor goale. Indicii din tabel,
   lista calificatelor și lista excluderilor păstrează acum pozițiile originale.

## Verificări și rezultate

Comandă fără dependențe externe:

```sh
node --test tests/full-math.test.cjs
```

16 cazuri explicite și 1000 scenarii deterministe generate: toate trec.
Referința matematică folosește produse încrucișate cu BigInt pentru a verifica
exact intervalul, independent de comparația în virgulă mobilă a aplicației.
Cazurile includ medie ponderată, excluderi manuale, outside range,
ambele limite exacte, imediat în afara limitelor, lipsa datelor, zero,
negative, precizie nevalidă, toate excluse, niciun calificat, rânduri goale,
STS/dry dock doar ca text, porturi repetate și 30 rânduri pe două pagini PDF.

Exporturile celor 16 cazuri: valorile salvate XLSX, structura XML și
rezultatele PDF verificate. Toate cele 16 XLSX au fost importate și
recalculate cu un motor independent (`@oai/artifact-tool`), inclusiv
verificări după editarea unei cantități, excluderii manuale și preciziei.
PDF-urile au fost deschise și extrase cu pypdf; un raport cu rând gol
intermediar a fost randat și inspectat vizual.

Pentru repetarea verificării independente, cu motorul disponibil:

```sh
VEF_AUDIT_OUTPUT=/tmp/vef-full-audit node --test tests/full-math.test.cjs
VEF_AUDIT_OUTPUT=/tmp/vef-full-audit node tests/recalculate-exports.mjs
```

Limite: nu a fost pornit Microsoft Excel și nu s-a rulat un browser real;
testele execută funcțiile originale într-un DOM minimal simulat.
Nu s-a construit sau modificat Android BASIC.
