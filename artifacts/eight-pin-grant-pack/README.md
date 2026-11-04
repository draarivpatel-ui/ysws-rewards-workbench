# ChirpKey-8 design explorer

An AI-assisted engineering reference pack for an eight-pin, 3.3 V acoustic identifier with capacitive touch. It is not a security key, an approved grant entry or a fabrication-ready certification.

## Open and regenerate

Serve this directory through any static HTTP host, then open `index.html`. The browser loads the local PCB, schematic and BOM; it makes no external requests unless the optional KiCanvas button is pressed. Opening via `file://` can block ES modules and fetches. No JavaScript dependencies or build step are required.

From the pipeline root, run `node artifacts/eight-pin-grant-pack/tools/generate.mjs` to regenerate the KiCad project, PCB, schematic and BOM. That operation overwrites generated engineering files, so preserve any hand edits first. Open the `.kicad_pro` file in KiCad 8 for authoritative editing and checks.

The explorer provides layer toggles, net highlighting, PCB zoom/pan, keyboard-accessible tabs and component selection, BOM search and supplier links. Selecting a reference in any view highlights the same reference in the other views. The preview parser only supports the source geometry used in this pack; it is not a general KiCad renderer or connectivity checker. KiCanvas requires an internet connection and is an external service.

## Files and estimates

`chirpkey8.kicad_pro`, `.kicad_sch` and `.kicad_pcb` are editable project sources. `bom.json` and `bom.csv` describe one populated assembly and a three-bare-board prototype lot. `firmware/chirpkey8.ino` is unverified firmware requiring a suitable ATtiny412 Arduino toolchain and UPDI programmer. `JOURNAL.md` is a five-session, 8.5-hour plan, never a verified human log.

The 32 × 24 mm board occupies 1.1904 square inches. The recorded OSH Park area-rate estimate is `$5.95` for three bare boards, not three times that amount. Parts/PCB total `$11.44`; shipping `$5.00` and tax `$0.96` are allowances, giving an estimated `$17.40`, below the recorded `$18.40` target and `$35.00` cap. Refresh live quotes, stock and current program limits before relying on them.

## Submission and fabrication gates

- Check the destination program's current AI, originality, eligibility and time-recording policies. This is disclosed AI-generated/assisted work, not evidence of student authorship or earned hours.
- Verify pin assignments, piezo type/drive current, resistor roles and every footprint against manufacturer documentation. Do not infer correctness from a plausible-looking preview.
- Run KiCad ERC and DRC, review all warnings, inspect Gerbers and drill files, and obtain an independent electrical review. These checks have not been established by this pack.
- Compile firmware with a pinned toolchain, then test on a current-limited supply. No measured acoustics, sensing reliability, fabricated board or human testing is claimed.
- Obtain current supplier quotes and approval before purchasing or submitting. No PR, grant application, order or external upload is created by these local artifacts.
