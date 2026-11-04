# ChirpKey-8 engineering journal plan

## Honest disclosure

This is an AI-assisted, five-session engineering design plan totaling **8.5 hours** (510 minutes), not a contemporaneous human work log. Durations are proposed allocations. No dates, completed student hours, fabrication, physical measurements or grant approval are asserted. Generated source files exist, but their existence does not establish human effort. Replace this plan with dated observations and actual tracked time before making any hours claim. Do not backfill time or submit these allocations as earned hours.

## Session 1 | Requirements and pin budget | 1.5 hours

Planned work is to define a public acoustic identifier, choose the eight-pin ATtiny412, reserve UPDI, map the touch input, LED, button and differential piezo drive, and establish 3.3 V operation. Review the manufacturer's pinout and current limits. A public identifier is not an authentication credential. The source firmware is a starting point, not measured acoustic evidence.

## Session 2 | Schematic and component selection | 2.0 hours

Planned work is to inspect supply decoupling, series resistors, capacitive sensing, piezo loading and the programming header. Verify every manufacturer part number and footprint against current datasheets. Run KiCad ERC and resolve all unexplained findings. The source-derived web schematic is an inspection aid, not an electrical-rule validator.

## Session 3 | Two-layer PCB layout | 2.0 hours

Planned work is to review the 32 × 24 mm outline, component clearance, touch electrode placement, ground return paths and all routed nets. Run KiCad DRC, check unrouted connections and net-to-pad correspondence, then inspect fabrication plots. The local parser proves the preview can read the source, not that routing is electrically correct or manufacturable.

## Session 4 | Firmware and bring-up procedure | 1.5 hours

Planned work is to compile with an explicitly documented ATtiny412 Arduino core and programmer, check timer and port assumptions, and write a current-limited bring-up checklist. After a real board is assembled, record supply current, touch threshold drift, acoustic spectrum and repeatable identifier decoding. No successful compilation, programming or physical test is claimed here.

## Session 5 | Budget, evidence and independent review | 1.5 hours

Planned work is to refresh supplier checkout quotes, calculate shipping and tax, compare the board lot price, review the journal against actual time records, and obtain an independent engineering review. The existing BOM estimates a `$11.44` parts/PCB subtotal plus `$5.00` shipping and `$0.96` tax, totaling `$17.40`. None of these allowances is a verified checkout quote. Confirm the program's current AI and time policy before submitting anything.

## Total

1.5 + 2.0 + 2.0 + 1.5 + 1.5 = **8.5 planned hours**. Verified human hours are not established by this pack.
