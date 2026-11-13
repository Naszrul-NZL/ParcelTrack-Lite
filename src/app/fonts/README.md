# Airway fonts

DM Sans is the body/control typeface; Barlow Condensed Semibold is the status/display typeface. `src/app/fonts.ts` loads these files through `next/font/local`, so application builds and browsers need no font-provider request.

Source: [Google Fonts repository](https://github.com/google/fonts/tree/3cb0866aebe5de40156f418a1750cb329e81ebdb), immutable revision `3cb0866aebe5de40156f418a1750cb329e81ebdb`, downloaded 13 November 2026.

- `ofl/dmsans/DMSans[opsz,wght].ttf` is stored as `DMSans-Variable.ttf`.
- `ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf` keeps its original filename.
- Each family's SIL Open Font License is included alongside the font. The files are unmodified; only the DM Sans filename is simplified.

Only the required upright fonts are included. Change typography through the shared design review rather than loading independent fonts per module.
