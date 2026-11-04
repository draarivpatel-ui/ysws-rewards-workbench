#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import CAD from './cad-engine.js';
const directoryName = path.dirname(fileURLToPath(import.meta.url));
export function exportAll(directory = path.join(directoryName, 'exports')) {
  fs.mkdirSync(directory, { recursive:true });
  const models = CAD.DESIGNS.map(design => {
    const model = CAD.generate(design.id);
    if (!model.validation.pass) throw new Error('Invalid model: '+model.id);
    const files = {};
    for (const [extension, serialize] of [['step', CAD.toSTEP], ['stl', CAD.toSTL]]) {
      const name = model.id+'.'+extension, contents = serialize(model);
      fs.writeFileSync(path.join(directory,name),contents);
      files[extension] = { name, bytes:Buffer.byteLength(contents), sha256:crypto.createHash('sha256').update(contents).digest('hex') };
    }
    return { id:model.id, name:model.name, type:model.type, units:model.units, dimensions:model.dimensions, bounds:model.bounds, sections:model.sections, holeDiameter:model.holeDiameter, volume:model.volume, solidCount:model.solids.length, triangleCount:model.triangles.length, validation:model.validation, files };
  });
  const manifest = { schemaVersion:1, generator:'BakeBuild Studio zero-dependency CAD', units:'mm', topology:'One connected closed manifold solid per model; no internal faces.', rules:CAD.RULES, models };
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const result=exportAll(); console.log('Exported '+result.models.length+' validated models (4 STEP + 4 STL) to '+path.join(directoryName,'exports')); }
