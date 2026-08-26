/**
 * Music manifest parsing. Contract copied deliberately from
 * `parseAtlasManifest` / `parseBackdropManifest`: never throws, returns an
 * empty list on anything malformed. A missing soundtrack must degrade to
 * silence, never take the game down.
 */
export interface MusicTrack {
  id: string;
  ogg: string;
  mp3: string;
  seconds: number;
}

function isTrack(v: unknown): v is MusicTrack {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.id === 'string' && typeof t.ogg === 'string'
    && typeof t.mp3 === 'string' && typeof t.seconds === 'number';
}

export function parseMusicManifest(json: unknown): MusicTrack[] {
  if (typeof json !== 'object' || json === null) return [];
  const tracks = (json as Record<string, unknown>).tracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.filter(isTrack);
}
