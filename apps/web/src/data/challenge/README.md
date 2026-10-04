# Official challenge master data

Retrieved 4 October 2026 using Google Drive, following the dataset link embedded in the Challenge Booklet. These are complete readable CSV copies normalized to LF, not the repository's existing seed files.

Source folder: https://drive.google.com/drive/folders/1d-272bTFyx4QBpWSFe4_kE8-p5S_Zx8q

| File | Drive file ID | Records | SHA-256 of checked-in LF copy |
| --- | --- | ---: | --- |
| outlets.csv | 16n7e_pbrt5Ga7y9PAyt5J6YgCSonowpD | 120 | 206a915f16c9b522473d4ad314d1c7c435345911427d9e0878d6e66241c32c42 |
| vehicles.csv | 1ouKhVu2RVUDIIfiSLeMLXkwjFAuXOW8q | 60 | f70175f786574f4c4d07480df263b5ba59918bcecd7a91e5c59d3f7a75b52b1f |
| calendar.csv | 1vuaVjk8t22J_DixeES6m-JSE92tax5lT | 910 | 2201b18787287dc9621cde516c22ac7ce656da76ff0ccc956e1325a7b2fc3113 |

Calendar coverage: 2024-01-01 through 2026-06-28. Dates outside that range must not be assumed operating days. The driver demo deliberately uses 2026-06-22, an operating day in the supplied calendar.

All three differ from `db/seed/data`. Existing seeds have 120 outlets, 60 vehicles and only 31 calendar dates. Matching row counts do not establish provenance. Example: official OUT001 is van-only, 05:00–07:30; official VEH014 is an ambient truck. Figma and existing role mock data must not override these attributes.

The driver demo reads these master records. Trips, stop IDs, SKUs, quantities, planned arrival times and receipt code in `shells/driver/demo.ts` are explicit demonstration fixtures, not official operational data. The CSVs do not include exact addresses, coordinates, phone numbers, gate codes or live telemetry; the driver UI does not invent them.

Backend integration should import these files as master data, preserve source identifiers, validate foreign keys and expose them through shared APIs. Remove frontend CSV imports from production operational screens when the API adapter is ready. Keep fixtures only behind an explicit demo/test entry; never silently fall back to fixtures when a real API request fails.
