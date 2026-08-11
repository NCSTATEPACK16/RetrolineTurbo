/**
 * PNG sprite-atlas manifest parsing (research §5b).
 *
 * Contract copied deliberately from `parseBackdropManifest` (Backdrop.ts): never
 * throws, silently drops malformed entries, ignores unknown fields. A bad asset
 * must degrade the picture, never kill the render loop.
 */

export interface AtlasFrameMeta {
  id: string;
  x: number; y: number; w: number; h: number;
  car: string; color: string; angle: number; step: number;
  /** Normalised 0..1 overlay attachment points in this frame's local space. */
  anchors: Record<string, readonly [number, number]>;
}

export interface AtlasMeta {
  id: string;
  /** Path relative to `/assets/`, matching the backdrop manifest convention. */
  file: string;
  width: number; height: number;
  frames: AtlasFrameMeta[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function parseAnchors(v: unknown): Record<string, readonly [number, number]> {
  const out: Record<string, readonly [number, number]> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [name, pt] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(pt) && pt.length === 2 && isNum(pt[0]) && isNum(pt[1])) {
      out[name] = [pt[0], pt[1]];
    }
  }
  return out;
}

function parseFrame(v: unknown): AtlasFrameMeta | null {
  if (!v || typeof v !== 'object') return null;
  const f = v as Record<string, unknown>;
  if (!isStr(f.id) || !isNum(f.x) || !isNum(f.y) || !isNum(f.w) || !isNum(f.h)) return null;
  return {
    id: f.id, x: f.x, y: f.y, w: f.w, h: f.h,
    car: isStr(f.car) ? f.car : '',
    color: isStr(f.color) ? f.color : '',
    angle: isNum(f.angle) ? f.angle : 0,
    step: isNum(f.step) ? f.step : 0,
    anchors: parseAnchors(f.anchors),
  };
}

/** Parse one atlas manifest. Returns null when the document is unusable. */
export function parseAtlasManifest(doc: unknown): AtlasMeta | null {
  try {
    if (!doc || typeof doc !== 'object') return null;
    const d = doc as Record<string, unknown>;
    if (!isStr(d.id) || !isStr(d.file) || !isNum(d.width) || !isNum(d.height)) return null;
    if (!Array.isArray(d.frames)) return null;
    const frames: AtlasFrameMeta[] = [];
    for (const raw of d.frames) {
      const f = parseFrame(raw);
      if (f) frames.push(f);
    }
    return { id: d.id, file: d.file, width: d.width, height: d.height, frames };
  } catch {
    return null; // total by contract
  }
}
