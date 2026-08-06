import { LOGICAL_WIDTH, LOGICAL_HEIGHT, COLORS } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { RouteState } from '../track/route.js';
import { drawText } from './text.js';

/**
 * Pyramid overlay: 15 scene nodes bottom-up, the visited path and current
 * scene highlighted. Pure render from RouteState; main.ts owns `flashMs`
 * (counted down per update, set on forks/finish, M-toggled).
 */
export class RouteMap {
  flashMs = 0;

  constructor(private readonly atlas: SpriteAtlas) {}

  render(route: RouteState, backend: RenderBackend): void {
    if (this.flashMs <= 0) return;
    const cx = LOGICAL_WIDTH / 2;
    drawText(backend, this.atlas, 'route map', cx - 36, 40);
    for (let s = 0; s < route.pyramid.length; s++) {
      const row = route.pyramid[s]!;
      const y = LOGICAL_HEIGHT - 60 - s * 18;
      for (let i = 0; i < row.length; i++) {
        const x = cx + (i - (row.length - 1) / 2) * 22;
        const onPath = (s < route.stage && route.visited[s] === i) || (s === route.stage && route.sceneIdx === i);
        const color = onPath ? COLORS.rumbleLight : COLORS.road;
        backend.drawQuad(x, y, 3, x, y + 6, 3, color);
      }
    }
    if (route.finished && route.endingIdx !== null) {
      drawText(backend, this.atlas, `ending ${route.endingIdx + 1} of 5`, cx - 44, 54);
    }
  }
}
