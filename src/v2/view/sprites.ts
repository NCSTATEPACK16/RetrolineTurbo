import type { SceneryKind } from '../track/scenery.js';

/**
 * Scenery sprites: which frame of the baked 1.x props atlas (public/assets/sprites/props.png,
 * 1024x512) each uses, and how big it stands in the world.
 */
export interface SceneryArt extends SceneryKind {
  readonly frame: { x: number; y: number; w: number; h: number };
}

export const PROPS_ATLAS = { url: '/assets/sprites/props.png', width: 1024, height: 512 } as const;

const art = (x: number, y: number, w: number, h: number, heightM: number): SceneryArt =>
  ({ frame: { x, y, w, h }, heightM, aspect: w / h });

export const SCENERY_ART: Readonly<Record<string, SceneryArt>> = {
  palm: art(330, 255, 120, 196, 11),
  grandstand: art(330, 1, 120, 168, 8),
  billboard: art(1, 1, 120, 120, 6),
  lamp: art(659, 1, 120, 250, 9),
  marker: art(1, 255, 120, 134, 1.8),
};

export const SCENERY_KINDS: Readonly<Record<string, SceneryKind>> = SCENERY_ART;

/** Horizon plates (public/assets/backgrounds): panorama strip plus the flat sky colour above it. */
export const HORIZONS = {
  sunset: { url: '/assets/backgrounds/coastal_sunset.png', aspect: 960 / 112, sky: '#bb0389', haze: '#fea263' },
  night: { url: '/assets/backgrounds/city_night.png', aspect: 960 / 119, sky: '#211958', haze: '#441d7f' },
  canyon: { url: '/assets/backgrounds/desert_canyon.png', aspect: 960 / 99, sky: '#6228a2', haze: '#fea74c' },
} as const;
