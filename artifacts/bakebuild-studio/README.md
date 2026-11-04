# BakeBuild Studio

Zero-dependency local CAD workbench for three custom cookie cutters and one Orpheus FuseRing keyring. Serve this directory on any static HTTP host and open `index.html` to rotate/zoom the shaded 3D mesh, inspect dimensions and rule checks, and download STEP or STL. ES modules require HTTP rather than `file://`. No external network requests, build tools, or third-party packages are needed.

From the repository root, regenerate the checked-in exports:

```sh
node artifacts/bakebuild-studio/cli.js
node --test
```

Exports live directly in `exports/`: four `.step` files, four ASCII `.stl` files, and `manifest.json` with dimensions, rule results, topology counts, file sizes, and SHA-256 hashes. Geometry is deterministic and all coordinates are millimetres. Edit the named design parameters in `cad-engine.js` to adjust a profile, then regenerate and rerun validation.

Cookie cutters use custom circuit-crest, hex-gear, and sigma-badge contours with true parallel line offsets: 0.8 mm lip (z=0–1.5), 2.0 mm wall (z=1.5–10.7), and a 5.0 mm wide × 2.0 mm high top rim (z=10.7–12.7). Each fits a 100 × 100 × 100 mm envelope. FuseRing has an Orpheus-inspired outline, flat z=0 bottom, 4 mm height, and a central carabiner hole circumscribed around a 6 mm circle, within 80 × 80 × 6 mm. The coarse polygon hole never intrudes into the specified clear diameter.

STEP uses AP214-style product metadata, explicit millimetre units, shared edge/vertex topology, planar advanced faces, and one manifold solid B-rep per model. Curved silhouettes are intentionally polygonal, not spline surfaces. Each part has a single connected closed shell, including the hole and cutter ledges. STL triangulates that boundary without internal interfaces. Independently check CAD import, slicing, clearances, and material safety before manufacturing. These files are geometry prototypes, not a food-contact certification or a manufacturing-readiness guarantee.

The ES-module exports `generate(id)`, `validate(model)`, `toSTEP(model)`, and `toSTL(model)` are available in both Node and the browser. The validator checks generated bounds, height, band parameters, flat bottom, clear hole, and positive signed volume. Tests additionally inspect manifold edges, face planarity/orientation, offset distances, STEP references, browser interaction handlers, and exported hashes.
