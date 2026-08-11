/**
 * The renderer isolation seam (plan §2.2). All drawing goes through this
 * interface so the Canvas 2D implementation can be swapped for a WebGL/PixiJS
 * one later without touching game code.
 *
 * Every method takes primitive arguments only — no per-call objects — to honour
 * the "no per-frame allocation" rule (plan §2.6). Coordinates are in the fixed
 * logical framebuffer space (LOGICAL_WIDTH x LOGICAL_HEIGHT), not CSS pixels.
 */
export interface RenderBackend {
  /** Fill the entire logical framebuffer with a solid colour. Frame start. */
  clear(color: string): void;

  /**
   * Draw a vertically-oriented trapezoid (the projected road segment). The top
   * edge is centred at (x1, y1) with half-width w1; the bottom edge at
   * (x2, y2) with half-width w2. Used for road, rumble, and grass quads.
   */
  drawQuad(
    x1: number,
    y1: number,
    w1: number,
    x2: number,
    y2: number,
    w2: number,
    color: string,
  ): void;

  /** Fill a full-width horizontal band [y, y+h). Used for sky/ground bands. */
  fillBand(y: number, h: number, color: string): void;

  /**
   * Draw a scaled sprite. Source rect (`sx,sy,sw,sh`) selects a region of the
   * atlas image; destination rect (`dx,dy,dw,dh`) places it in the logical
   * framebuffer. `clipBottom` is the lowest logical scanline the sprite is
   * allowed to occupy (hill occlusion); rows below it are not drawn.
   *
   * `flipX` mirrors horizontally — steering art is authored for three angles and
   * mirrored at runtime for the other three (research §3c), which halves the car
   * atlas against a hard 2048x2048 cap.
   */
  drawSprite(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    clipBottom: number,
    flipX?: boolean,
  ): void;

  /** Blit the completed logical frame to the visible surface. Frame end. */
  present(): void;

  /** React to a change in the display/CSS size of the output surface. */
  resize(cssWidth: number, cssHeight: number): void;
}
