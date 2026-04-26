#!/usr/bin/env node
// Extract F1 25 track-map textures from the game's ERP files.
//
// Game path:
//   <Steam>/F1 25/2025_asset_groups/ui_package/textures/track_maps/*.erp
//
// Each ERP packs three textures per track at multiple mip-levels:
//   • full_track_maps/<track>_ai_trackspace.tif.image          (hi-res main)
//   • full_track_maps_sector_overlay/<track>_ai_trackspace...  (sector tint)
//   • minimap/<track>_ai_trackspace.tif.image                  (HUD minimap)
//
// Format = BC7_SRGB (block-compressed RGBA). We write each resource as a
// standard .dds file so any image viewer (or a one-line `texconv` call)
// can decode it. Intent is to use the **minimap** texture as the
// TrackMap background once it's been converted to .png.
//
// Format ref: EgoEngineModding/Ego-Engine-Modding src/EgoEngineLibrary/
// Archive/Erp/ErpFile.cs + ErpGfxSurfaceFormat.cs.
//
// Usage: node scripts/extract-f1-track-maps.mjs [erp-folder] [out-folder]

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { inflateSync } from 'node:zlib';
import * as fzstd from 'fzstd';

const DEFAULT_IN =
  'E:/SteamLibrary/steamapps/common/F1 25/2025_asset_groups/ui_package/textures/track_maps';
const DEFAULT_OUT = 'd:/Github/race-engineer/src/renderer/assets/f1-track-maps-dds';

const ERP_MAGIC = 0x4b505245; // "ERPK"

const IS_ZSTD = (c) => c === 0x03 || c === 0x10 || c === 0x11;
const IS_NONE = (c) => c === 0x00 || c === 0x81 || c === 0x90 || c === 0x91;

class Reader {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  seek(p) { this.pos = p; }
  u8()  { const v = this.buf.readUInt8(this.pos);  this.pos += 1; return v; }
  i16() { const v = this.buf.readInt16LE(this.pos); this.pos += 2; return v; }
  i32() { const v = this.buf.readInt32LE(this.pos); this.pos += 4; return v; }
  u32() { const v = this.buf.readUInt32LE(this.pos); this.pos += 4; return v; }
  u64() {
    const lo = this.buf.readUInt32LE(this.pos);
    const hi = this.buf.readUInt32LE(this.pos + 4);
    this.pos += 8;
    return hi * 4294967296 + lo;
  }
  bytes(n) { const v = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return v; }
  str(n) {
    const b = this.bytes(n);
    const end = b.indexOf(0);
    return b.subarray(0, end < 0 ? b.length : end).toString('utf8');
  }
}

function parseErp(buf) {
  const r = new Reader(buf);
  if (r.u32() !== ERP_MAGIC) throw new Error('not an ERP file');
  const version = r.i32();
  if (version < 0 || version > 4) throw new Error(`unsupported version ${version}`);
  r.bytes(8); r.bytes(8); r.bytes(8);
  const resourceOffset = r.u64();
  r.bytes(8);
  const numFiles = r.i32();
  r.i32();

  const resources = [];
  for (let i = 0; i < numFiles; i++) {
    r.bytes(4);
    const idLen = r.i16();
    const identifier = r.str(idLen);
    const resourceType = r.str(16);
    r.i32();
    if (version >= 4) r.i16();
    const numFragments = r.u8();

    const fragments = [];
    for (let k = 0; k < numFragments; k++) {
      const name = r.str(4);
      const offset = r.u64();
      const size = r.u64();
      const flags = r.i32();
      let compression = 0, packedSize = size;
      if (version > 2) {
        compression = r.u8();
        packedSize = r.u64();
      }
      fragments.push({ name, offset, size, flags, compression, packedSize });
    }
    if (version > 2) r.bytes(16);

    resources.push({ identifier, resourceType, fragments });
  }
  return { version, resourceOffset, resources };
}

function decompress(data, compression) {
  if (IS_NONE(compression)) return data;
  if (compression === 0x01) return inflateSync(data);
  if (IS_ZSTD(compression)) return Buffer.from(fzstd.decompress(new Uint8Array(data)));
  throw new Error(`unsupported compression 0x${compression.toString(16)}`);
}

// Surface header (first fragment of a GfxSurfaceRes):
//   u32 mipCount, u32 type, u32 format, u32 width, u32 height, u32×3 misc
function parseSurfaceHeader(buf) {
  const r = new Reader(buf);
  return {
    mipCount: r.u32(),
    type:     r.u32(),
    format:   r.u32(),      // 70 = BC7_SRGB, 69 = BC7, 55 = DXT5, 15 = ABGR8
    width:    r.u32(),
    height:   r.u32(),
  };
}

// Build a DX10-extended DDS header. Works for BC7_UNORM_SRGB (the format
// F1 25 uses for all track-map textures).
function buildDds(width, height, blockData, isBc7Srgb = true) {
  const DDS_MAGIC = Buffer.from('DDS ', 'ascii');          // 4
  const header = Buffer.alloc(124);
  header.writeUInt32LE(124, 0);                            // dwSize
  header.writeUInt32LE(0x0000100F, 4);                     // flags (caps|h|w|pf|mipmap|linsize)
  header.writeUInt32LE(height, 8);
  header.writeUInt32LE(width, 12);
  header.writeUInt32LE(blockData.length, 16);              // pitchOrLinearSize
  header.writeUInt32LE(0, 20);                             // depth
  header.writeUInt32LE(1, 24);                             // mipMapCount
  // 11 reserved uint32s (44 bytes) at offset 28
  // PixelFormat (32 bytes) at offset 72
  header.writeUInt32LE(32, 72);                            // pf.dwSize
  header.writeUInt32LE(0x00000004, 76);                    // pf.flags = DDPF_FOURCC
  header.write('DX10', 80, 'ascii');                       // pf.fourCC
  header.writeUInt32LE(0x1000, 108);                       // caps = texture
  // DX10 extended header (20 bytes)
  const dx10 = Buffer.alloc(20);
  dx10.writeUInt32LE(isBc7Srgb ? 99 : 98, 0);              // dxgiFormat (BC7_UNORM_SRGB or _UNORM)
  dx10.writeUInt32LE(3, 4);                                // resourceDimension = TEXTURE2D
  dx10.writeUInt32LE(0, 8);                                // miscFlag
  dx10.writeUInt32LE(1, 12);                               // arraySize
  dx10.writeUInt32LE(0, 16);                               // miscFlag2
  return Buffer.concat([DDS_MAGIC, header, dx10, blockData]);
}

function sanitizePath(identifier) {
  // eaid://ui_package/art/osd/textures/<subfolder>/<file> → <subfolder>/<file>
  const noScheme = identifier.replace(/^eaid:\/\//, '');
  // Strip the common prefix, keep just subfolder/filename
  const m = noScheme.match(/textures\/([^/]+)\/(.+)$/);
  if (m) return `${m[1]}/${m[2]}`;
  return noScheme;
}

async function processFile(erpPath, outRoot) {
  const trackName = basename(erpPath, extname(erpPath));
  const buf = await readFile(erpPath);
  const { version, resourceOffset, resources } = parseErp(buf);
  console.log(`\n=== ${trackName}  v${version}  ${resources.length} resources ===`);

  const outDir = join(outRoot, trackName);
  await mkdir(outDir, { recursive: true });

  let minimapWritten = false;

  for (const res of resources) {
    const pathHint = sanitizePath(res.identifier);
    // We only care about .tif.image resources (the actual textures)
    if (!pathHint.endsWith('.tif.image')) continue;

    // Fragment 0 = surface header, fragment 1 = texture data
    if (res.fragments.length < 2) continue;
    const headerRaw = decompress(
      buf.subarray(resourceOffset + res.fragments[0].offset,
                   resourceOffset + res.fragments[0].offset + res.fragments[0].packedSize),
      res.fragments[0].compression,
    );
    const dataRaw = decompress(
      buf.subarray(resourceOffset + res.fragments[1].offset,
                   resourceOffset + res.fragments[1].offset + res.fragments[1].packedSize),
      res.fragments[1].compression,
    );

    const hdr = parseSurfaceHeader(headerRaw);
    if (hdr.format !== 70 && hdr.format !== 69) {
      console.warn(`  ${pathHint.padEnd(60)} unsupported format ${hdr.format}, skipping`);
      continue;
    }

    const dds = buildDds(hdr.width, hdr.height, dataRaw, hdr.format === 70);
    // Output filename: <subfolder>__<trackName>.dds so every resource is unique
    const subFolder = pathHint.split('/')[0];
    const outFile = join(outDir, `${subFolder}__${trackName}_${hdr.width}x${hdr.height}.dds`);
    await writeFile(outFile, dds);
    console.log(
      `  ${pathHint.padEnd(60)} ${hdr.width}x${hdr.height} BC7_${hdr.format === 70 ? 'SRGB' : 'UNORM'}  → ${basename(outFile)}`,
    );

    // Pick the 512x512 minimap as our canonical per-track map
    if (subFolder === 'minimap' && hdr.width === 512 && !minimapWritten) {
      const pickFile = join(outRoot, `${trackName}.dds`);
      await writeFile(pickFile, dds);
      minimapWritten = true;
    }
  }
}

async function main() {
  const [,, inArg, outArg] = process.argv;
  const inDir  = inArg  ?? DEFAULT_IN;
  const outDir = outArg ?? DEFAULT_OUT;
  if (!existsSync(inDir)) { console.error(`input folder not found: ${inDir}`); process.exit(1); }
  const erps = readdirSync(inDir).filter((f) => f.toLowerCase().endsWith('.erp'));
  if (erps.length === 0) { console.error(`no .erp files in ${inDir}`); process.exit(1); }
  await mkdir(outDir, { recursive: true });
  for (const f of erps) {
    try { await processFile(join(inDir, f), outDir); }
    catch (e) { console.error(`FAIL ${f}: ${e.message}`); }
  }
  console.log(`\nDone. Wrote DDS files to ${outDir}`);
  console.log(`Per-track minimap copies at ${outDir}/<trackName>.dds`);
  console.log(`\nTo convert to PNG (for browser use):`);
  console.log(`  Install DirectXTex's texconv.exe from Microsoft (free), then:`);
  console.log(`  texconv -y -ft PNG -o ${outDir}/png ${outDir}/*.dds`);
}

main().catch((e) => { console.error(e); process.exit(1); });
