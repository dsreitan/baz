/**
 * Procedural dino portraits (DESIGN.md §8 "Warcraft 3 Saturday-morning").
 *
 * `dinoSvg(opts)` returns a complete, self-contained `<svg>` string built
 * from layered paths/ellipses per archetype (ARCHITECTURE §2). Pure
 * string-building: no DOM, no `Math.random`/`Date` — all variation comes
 * from `createRng(seed)` (src/core/rng, already pure/deterministic).
 *
 * Style contract (DESIGN §8), enforced by the shape kit below:
 *  - every filled shape gets the same 4px dark outline (`OUTLINE_COLOR`);
 *  - 2-tone cel shading: a `shade`-colored belly/underside patch sits on
 *    top of the `base` fill without its own outline (it reads as shadow,
 *    not as a separate part);
 *  - one white specular dot per eye;
 *  - chunky proportions: head ~1.4x realistic scale, short thick limbs,
 *    big feet (baked into the per-archetype profiles below).
 *
 * Facing: parts are authored canonically facing right (head at higher x
 * than tail); `facing: 'left'` mirrors the whole group with a transform.
 */
import { createRng } from '../core/rng';
import type { Archetype, Rng, SpeciesDef, Stage } from '../core/types';
import {
  aspectPalette,
  OUTLINE_COLOR,
  OUTLINE_WIDTH,
  paintPattern,
  rotateHue,
  type AspectPalette,
  type PatternKind,
} from './palettes';

export interface DinoSvgOptions {
  species: SpeciesDef;
  stage: Stage;
  seed: number;
  facing?: 'left' | 'right';
  size?: number;
}

const VB = 200;

// ---------------------------------------------------------------------------
// Shape kit — every primitive below draws its own outline (DESIGN §8).
// ---------------------------------------------------------------------------

function n(v: number): string {
  return v.toFixed(1);
}

/** Outlined arbitrary path. */
export function outlinedPath(d: string, fill: string, opacity = 1): string {
  const op = opacity < 1 ? ` opacity="${opacity}"` : '';
  return `<path d="${d}" fill="${fill}" stroke="${OUTLINE_COLOR}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"${op}/>`;
}

/** Outlined ellipse — the workhorse for bodies/heads/feet. */
export function outlinedEllipse(cx: number, cy: number, rx: number, ry: number, fill: string): string {
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(Math.abs(rx))}" ry="${n(Math.abs(ry))}" fill="${fill}" stroke="${OUTLINE_COLOR}" stroke-width="${OUTLINE_WIDTH}"/>`;
}

/** Unstroked ellipse — used for the belly/shade cel patch (sits *inside* an outlined shape). */
function shadeEllipse(cx: number, cy: number, rx: number, ry: number, fill: string): string {
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(Math.abs(rx))}" ry="${n(Math.abs(ry))}" fill="${fill}"/>`;
}

/** Tapered stadium/lozenge between two circles — limbs, necks, tails, horns, spikes. */
function capsulePathD(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const p1a = [x1 + nx * r1, y1 + ny * r1];
  const p1b = [x1 - nx * r1, y1 - ny * r1];
  const p2a = [x2 + nx * r2, y2 + ny * r2];
  const p2b = [x2 - nx * r2, y2 - ny * r2];
  return `M ${n(p1a[0]!)} ${n(p1a[1]!)} L ${n(p2a[0]!)} ${n(p2a[1]!)} A ${n(r2)} ${n(r2)} 0 0 1 ${n(p2b[0]!)} ${n(p2b[1]!)} L ${n(p1b[0]!)} ${n(p1b[1]!)} A ${n(r1)} ${n(r1)} 0 0 1 ${n(p1a[0]!)} ${n(p1a[1]!)} Z`;
}

function capsule(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, fill: string): string {
  return outlinedPath(capsulePathD(x1, y1, r1, x2, y2, r2), fill);
}

/** A big cartoon foot: capsule leg + flattened oval foot. `dark` picks base vs shade fill (far leg). */
function leg(hipX: number, hipY: number, footX: number, footY: number, thighR: number, footR: number, fill: string): string {
  const thigh = capsule(hipX, hipY, thighR, footX, footY - footR * 0.4, thighR * 0.62, fill);
  const foot = outlinedEllipse(footX, footY, footR * 1.35, footR * 0.72, fill);
  return thigh + foot;
}

/** One dark iris + one white specular dot — DESIGN §8 "single white specular dot in eyes". */
function eye(cx: number, cy: number, r: number): string {
  const iris = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="#1c1420" stroke="${OUTLINE_COLOR}" stroke-width="${n(OUTLINE_WIDTH * 0.6)}"/>`;
  const specular = `<circle cx="${n(cx - r * 0.32)}" cy="${n(cy - r * 0.32)}" r="${n(r * 0.34)}" fill="#ffffff"/>`;
  return iris + specular;
}

/** Mouth line — every head gets one, even without a distinct jaw wedge. */
function mouthLine(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): string {
  return `<path d="M ${n(x1)} ${n(y1)} Q ${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}" fill="none" stroke="${OUTLINE_COLOR}" stroke-width="${n(OUTLINE_WIDTH * 0.7)}" stroke-linecap="round"/>`;
}

function tooth(cx: number, cy: number, size: number): string {
  const d = `M ${n(cx - size)} ${n(cy)} L ${n(cx)} ${n(cy + size * 1.4)} L ${n(cx + size)} ${n(cy)} Z`;
  return `<path d="${d}" fill="#f4ead6" stroke="${OUTLINE_COLOR}" stroke-width="${n(OUTLINE_WIDTH * 0.5)}" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------
// Point helpers
// ---------------------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function jitterFactor(rng: Rng, spread = 0.08): number {
  return 1 - spread + rng.next() * spread * 2;
}

// ---------------------------------------------------------------------------
// Archetype profiles — silhouette-defining multipliers on the shared rig.
// ---------------------------------------------------------------------------

interface ArchetypeProfile {
  bodyRxMul: number;
  bodyRyMul: number;
  headMul: number;
  headAspect: number; // headRx / headRy — >1 = elongated snout
  legLenMul: number;
  neckLenMul: number;
  tailLenMul: number;
  jaw: 'small' | 'big' | 'beak';
}

const PROFILES: Record<Archetype, ArchetypeProfile> = {
  raptor: { bodyRxMul: 0.88, bodyRyMul: 0.82, headMul: 0.95, headAspect: 1.25, legLenMul: 1.3, neckLenMul: 0.85, tailLenMul: 1.45, jaw: 'small' },
  theropod: { bodyRxMul: 1.05, bodyRyMul: 1.0, headMul: 1.3, headAspect: 1.4, legLenMul: 1.0, neckLenMul: 0.7, tailLenMul: 1.15, jaw: 'big' },
  sauropod: { bodyRxMul: 1.15, bodyRyMul: 0.95, headMul: 0.6, headAspect: 1.1, legLenMul: 0.95, neckLenMul: 2.4, tailLenMul: 1.7, jaw: 'small' },
  ceratopsian: { bodyRxMul: 1.15, bodyRyMul: 1.05, headMul: 1.05, headAspect: 1.05, legLenMul: 0.82, neckLenMul: 0.55, tailLenMul: 0.75, jaw: 'small' },
  stegosaur: { bodyRxMul: 1.12, bodyRyMul: 1.0, headMul: 0.8, headAspect: 1.15, legLenMul: 0.82, neckLenMul: 0.55, tailLenMul: 1.0, jaw: 'small' },
  ankylosaur: { bodyRxMul: 1.22, bodyRyMul: 1.02, headMul: 0.85, headAspect: 1.1, legLenMul: 0.62, neckLenMul: 0.4, tailLenMul: 0.9, jaw: 'small' },
  pterosaur: { bodyRxMul: 0.78, bodyRyMul: 0.85, headMul: 0.95, headAspect: 1.2, legLenMul: 0.88, neckLenMul: 0.95, tailLenMul: 0.65, jaw: 'beak' },
  spinosaur: { bodyRxMul: 1.02, bodyRyMul: 0.95, headMul: 1.15, headAspect: 1.55, legLenMul: 1.0, neckLenMul: 0.95, tailLenMul: 1.25, jaw: 'big' },
};

// ---------------------------------------------------------------------------
// Rig: shared anchor computation every archetype builds from
// ---------------------------------------------------------------------------

interface Rig {
  bodyCx: number;
  bodyCy: number;
  bodyRx: number;
  bodyRy: number;
  headCx: number;
  headCy: number;
  headRx: number;
  headRy: number;
  neckRoot: Pt;
  farHip: Pt;
  nearHip: Pt;
  farFoot: Pt;
  nearFoot: Pt;
  thighR: number;
  footR: number;
  tailRoot: Pt;
  tailMid: Pt;
  tailTip: Pt;
  spineTop: Pt; // point above body center, used to anchor back decorations
  faceTip: Pt; // front-most point of the head, for jaw/beak/mouth
}

function buildRig(profile: ArchetypeProfile, rng: Rng, scale: number, headBoost: number): Rig {
  const bodyRx = 40 * profile.bodyRxMul * jitterFactor(rng) * scale;
  const bodyRy = 25 * profile.bodyRyMul * jitterFactor(rng) * scale;
  const bodyCx = 88 * scale + (200 - 200 * scale) / 2;
  const bodyCy = 122 * scale + (200 - 200 * scale) * 0.3;

  const headR = 19 * profile.headMul * headBoost * jitterFactor(rng) * scale;
  const headRx = headR * Math.sqrt(profile.headAspect);
  const headRy = headR / Math.sqrt(profile.headAspect);

  // Short neck reach so heads overlap the body silhouette (chunky, not balloon-on-a-stick).
  const neckLen = 18 * profile.neckLenMul * jitterFactor(rng) * scale;
  const neckRoot: Pt = { x: bodyCx + bodyRx * 0.55, y: bodyCy - bodyRy * 0.55 };
  const neckDir = { x: 0.72, y: -0.55 };
  const headCx = neckRoot.x + neckDir.x * neckLen + headRx * 0.5;
  const headCy = neckRoot.y + neckDir.y * neckLen - headRy * 0.1;

  // "Short thick limbs, big feet" (DESIGN §8): stubby length, fat thighs.
  const legLen = 27 * profile.legLenMul * jitterFactor(rng) * scale;
  const thighR = 12.5 * jitterFactor(rng) * scale;
  const footR = 11.5 * jitterFactor(rng) * scale;
  const farHip: Pt = { x: bodyCx - bodyRx * 0.32, y: bodyCy + bodyRy * 0.5 };
  const nearHip: Pt = { x: bodyCx + bodyRx * 0.08, y: bodyCy + bodyRy * 0.55 };
  const farFoot: Pt = { x: farHip.x - 3, y: farHip.y + legLen };
  const nearFoot: Pt = { x: nearHip.x + 4, y: nearHip.y + legLen };

  const tailLen = 52 * profile.tailLenMul * jitterFactor(rng) * scale;
  const tailRoot: Pt = { x: bodyCx - bodyRx * 0.78, y: bodyCy + bodyRy * 0.1 };
  const tailMid: Pt = { x: tailRoot.x - tailLen * 0.55, y: tailRoot.y + tailLen * 0.18 };
  const tailTip: Pt = { x: tailRoot.x - tailLen, y: tailRoot.y - tailLen * 0.12 };

  const spineTop: Pt = { x: bodyCx, y: bodyCy - bodyRy };
  const faceTip: Pt = { x: headCx + headRx * 0.85, y: headCy + headRy * 0.15 };

  return {
    bodyCx,
    bodyCy,
    bodyRx,
    bodyRy,
    headCx,
    headCy,
    headRx,
    headRy,
    neckRoot,
    farHip,
    nearHip,
    farFoot,
    nearFoot,
    thighR,
    footR,
    tailRoot,
    tailMid,
    tailTip,
    spineTop,
    faceTip,
  };
}

// ---------------------------------------------------------------------------
// Head + jaw + eye (shared, jaw style varies)
// ---------------------------------------------------------------------------

function buildHead(rig: Rig, profile: ArchetypeProfile, palette: AspectPalette): string {
  const parts: string[] = [];
  const { headCx, headCy, headRx, headRy, faceTip } = rig;

  if (profile.jaw === 'big') {
    // Lower jaw wedge drawn first so the head ellipse overlaps its hinge.
    const jawTip = { x: faceTip.x + headRx * 0.25, y: faceTip.y + headRy * 0.85 };
    const jawD = `M ${n(headCx - headRx * 0.3)} ${n(headCy + headRy * 0.35)} Q ${n(headCx + headRx * 0.5)} ${n(headCy + headRy * 0.9)} ${n(jawTip.x)} ${n(jawTip.y)} L ${n(faceTip.x - headRx * 0.15)} ${n(faceTip.y + headRy * 0.2)} Z`;
    parts.push(outlinedPath(jawD, palette.shade));
    parts.push(tooth(headCx + headRx * 0.25, headCy + headRy * 0.55, headRx * 0.09));
    parts.push(tooth(headCx + headRx * 0.55, headCy + headRy * 0.6, headRx * 0.09));
  }

  parts.push(outlinedEllipse(headCx, headCy, headRx, headRy, palette.base));
  // Cel-shade patch on the underside of the head.
  parts.push(shadeEllipse(headCx - headRx * 0.05, headCy + headRy * 0.45, headRx * 0.7, headRy * 0.45, palette.shade));

  if (profile.jaw === 'beak') {
    const beakTip = { x: faceTip.x + headRx * 0.35, y: faceTip.y + headRy * 0.05 };
    const beakD = `M ${n(headCx + headRx * 0.5)} ${n(headCy - headRy * 0.1)} Q ${n(faceTip.x + headRx * 0.1)} ${n(faceTip.y - headRy * 0.05)} ${n(beakTip.x)} ${n(beakTip.y)} Q ${n(faceTip.x + headRx * 0.1)} ${n(faceTip.y + headRy * 0.4)} ${n(headCx + headRx * 0.4)} ${n(headCy + headRy * 0.3)} Z`;
    parts.push(outlinedPath(beakD, palette.accent));
  } else {
    parts.push(mouthLine(headCx + headRx * 0.15, headCy + headRy * 0.25, faceTip.x - headRx * 0.05, faceTip.y + headRy * 0.35, faceTip.x + headRx * 0.15, faceTip.y + headRy * 0.15));
    if (profile.jaw === 'small') {
      parts.push(tooth(faceTip.x - headRx * 0.1, faceTip.y + headRy * 0.25, headRx * 0.06));
    }
  }

  const eyeR = headRy * 0.28;
  parts.push(eye(headCx + headRx * 0.15, headCy - headRy * 0.25, eyeR));
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Archetype-specific structural extras (built AFTER the shared rig+head)
// ---------------------------------------------------------------------------

function structuralExtras(archetype: Archetype, rig: Rig, palette: AspectPalette): { behind: string; front: string } {
  const behind: string[] = [];
  const front: string[] = [];

  switch (archetype) {
    case 'raptor': {
      // Sickle claw on the near foot.
      const base = rig.nearFoot;
      const tip = { x: base.x + rig.footR * 1.6, y: base.y - rig.footR * 1.1 };
      const mid = { x: base.x + rig.footR * 1.9, y: base.y - rig.footR * 0.2 };
      const d = `M ${n(base.x)} ${n(base.y - rig.footR * 0.3)} Q ${n(mid.x)} ${n(mid.y)} ${n(tip.x)} ${n(tip.y)}`;
      front.push(`<path d="${d}" fill="none" stroke="${OUTLINE_COLOR}" stroke-width="${n(OUTLINE_WIDTH * 1.1)}" stroke-linecap="round"/>`);
      front.push(`<path d="${d}" fill="none" stroke="${palette.accent}" stroke-width="${n(OUTLINE_WIDTH * 0.5)}" stroke-linecap="round"/>`);
      break;
    }
    case 'theropod': {
      // Tiny arms, DESIGN's signature theropod gag.
      const shoulderX = rig.bodyCx + rig.bodyRx * 0.3;
      const shoulderY = rig.bodyCy - rig.bodyRy * 0.1;
      front.push(capsule(shoulderX, shoulderY, rig.thighR * 0.32, shoulderX + rig.thighR * 0.9, shoulderY + rig.thighR * 1.3, rig.thighR * 0.2, palette.base));
      break;
    }
    case 'sauropod': {
      // Nothing extra — the long neck profile already sells it.
      break;
    }
    case 'ceratopsian': {
      const { headCx, headCy, headRx, headRy } = rig;
      // Big scalloped frill fanning up-and-back from the skull — the
      // signature shape, so it's large, base-colored (not shadow-toned),
      // and rimmed with an inner shade ellipse for depth.
      const frillCx = headCx - headRx * 0.55;
      const frillCy = headCy - headRy * 0.35;
      const fr = headRx * 1.55;
      const lobe = (a1: number, a2: number): string => {
        const p1 = { x: frillCx + Math.cos(a1) * fr, y: frillCy - Math.sin(a1) * fr };
        const p2 = { x: frillCx + Math.cos(a2) * fr, y: frillCy - Math.sin(a2) * fr };
        const bulge = 1.28;
        const mid = { x: frillCx + Math.cos((a1 + a2) / 2) * fr * bulge, y: frillCy - Math.sin((a1 + a2) / 2) * fr * bulge };
        return `L ${n(p1.x)} ${n(p1.y)} Q ${n(mid.x)} ${n(mid.y)} ${n(p2.x)} ${n(p2.y)}`;
      };
      let frillD = `M ${n(frillCx)} ${n(frillCy + fr * 0.5)}`;
      const start = -0.5;
      const end = 2.4;
      const lobes = 4;
      for (let i = 0; i < lobes; i++) {
        const a1 = start + ((end - start) * i) / lobes;
        const a2 = start + ((end - start) * (i + 1)) / lobes;
        frillD += ` ${lobe(a1, a2)}`;
      }
      frillD += ' Z';
      behind.push(outlinedPath(frillD, palette.base));
      behind.push(shadeEllipse(frillCx, frillCy, fr * 0.62, fr * 0.62, palette.shade));
      // Long forward brow horn + shorter nose horn, thick at the root.
      const brow = { x: headCx + headRx * 0.15, y: headCy - headRy * 0.55 };
      front.push(capsule(brow.x, brow.y, headRx * 0.22, brow.x + headRx * 0.75, brow.y - headRy * 1.35, 2, palette.accent));
      front.push(capsule(rig.faceTip.x - headRx * 0.2, rig.faceTip.y - headRy * 0.25, headRx * 0.17, rig.faceTip.x + headRx * 0.3, rig.faceTip.y - headRy * 0.95, 1.6, palette.accent));
      break;
    }
    case 'stegosaur': {
      const plateCount = 5;
      const spineStart = lerp(rig.tailRoot, rig.neckRoot, 0.05);
      const spineEnd = { x: rig.neckRoot.x + 8, y: rig.neckRoot.y - 10 };
      for (let i = 0; i < plateCount; i++) {
        const t = i / (plateCount - 1);
        const p = lerp(spineStart, spineEnd, t);
        const h = rig.bodyRy * (0.85 - Math.abs(t - 0.5) * 0.5);
        const w = h * 0.55;
        const d = `M ${n(p.x - w)} ${n(p.y)} L ${n(p.x)} ${n(p.y - h)} L ${n(p.x + w)} ${n(p.y)} Z`;
        behind.push(outlinedPath(d, i % 2 === 0 ? palette.accent : palette.base));
      }
      break;
    }
    case 'ankylosaur': {
      // Armored dome shell over the whole back.
      const domeD = `M ${n(rig.bodyCx - rig.bodyRx * 0.85)} ${n(rig.bodyCy - rig.bodyRy * 0.1)} Q ${n(rig.bodyCx)} ${n(rig.bodyCy - rig.bodyRy * 1.55)} ${n(rig.bodyCx + rig.bodyRx * 0.85)} ${n(rig.bodyCy - rig.bodyRy * 0.1)} Z`;
      behind.push(outlinedPath(domeD, palette.shade));
      // Rock studs riding the dome arc.
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4;
        const x = rig.bodyCx - rig.bodyRx * 0.85 + rig.bodyRx * 1.7 * t;
        const arcY = rig.bodyCy - rig.bodyRy * 0.1 - Math.sin(Math.PI * t) * rig.bodyRy * 0.72;
        behind.push(outlinedEllipse(x, arcY, rig.bodyRy * 0.17, rig.bodyRy * 0.15, palette.accent));
      }
      // Club tail: fat spiked knob fused onto the tail tip.
      const club = rig.tailTip;
      const cr = rig.bodyRy * 0.5;
      front.push(outlinedEllipse(club.x, club.y, cr, cr * 0.88, palette.shade));
      front.push(outlinedPath(`M ${n(club.x - cr * 0.4)} ${n(club.y - cr * 0.6)} L ${n(club.x - cr * 0.15)} ${n(club.y - cr * 1.35)} L ${n(club.x + cr * 0.25)} ${n(club.y - cr * 0.65)} Z`, palette.accent));
      break;
    }
    case 'pterosaur': {
      const shoulder = { x: rig.bodyCx + rig.bodyRx * 0.1, y: rig.bodyCy - rig.bodyRy * 0.6 };
      const farTip = { x: shoulder.x - rig.bodyRx * 1.5, y: shoulder.y - rig.bodyRy * 1.9 };
      const farD = `M ${n(shoulder.x)} ${n(shoulder.y)} Q ${n(shoulder.x - rig.bodyRx * 0.6)} ${n(shoulder.y - rig.bodyRy * 2.1)} ${n(farTip.x)} ${n(farTip.y)} Q ${n(shoulder.x - rig.bodyRx * 0.3)} ${n(shoulder.y - rig.bodyRy * 0.4)} ${n(shoulder.x - rig.bodyRx * 0.1)} ${n(shoulder.y + rig.bodyRy * 0.3)} Z`;
      behind.push(outlinedPath(farD, palette.shade));
      const nearShoulder = { x: rig.bodyCx + rig.bodyRx * 0.35, y: rig.bodyCy - rig.bodyRy * 0.5 };
      const nearTip = { x: nearShoulder.x + rig.bodyRx * 1.7, y: nearShoulder.y - rig.bodyRy * 2.0 };
      const nearD = `M ${n(nearShoulder.x)} ${n(nearShoulder.y)} Q ${n(nearShoulder.x + rig.bodyRx * 0.8)} ${n(nearShoulder.y - rig.bodyRy * 2.2)} ${n(nearTip.x)} ${n(nearTip.y)} Q ${n(nearShoulder.x + rig.bodyRx * 0.4)} ${n(nearShoulder.y - rig.bodyRy * 0.2)} ${n(nearShoulder.x + rig.bodyRx * 0.1)} ${n(nearShoulder.y + rig.bodyRy * 0.4)} Z`;
      front.push(outlinedPath(nearD, palette.base));
      // Wing strut lines for membrane texture.
      front.push(`<path d="M ${n(nearShoulder.x)} ${n(nearShoulder.y)} L ${n(nearTip.x)} ${n(nearTip.y)}" fill="none" stroke="${OUTLINE_COLOR}" stroke-width="2" opacity="0.6"/>`);
      break;
    }
    case 'spinosaur': {
      const sailCount = 6;
      const spineStart = lerp(rig.tailRoot, rig.neckRoot, 0.1);
      const spineEnd = lerp(rig.tailRoot, rig.neckRoot, 0.95);
      const pts: Pt[] = [];
      for (let i = 0; i <= sailCount; i++) pts.push(lerp(spineStart, spineEnd, i / sailCount));
      let d = `M ${n(pts[0]!.x)} ${n(pts[0]!.y)}`;
      const heightAt = (t: number): number => rig.bodyRy * (1.6 * Math.sin(Math.PI * t) + 0.3);
      for (let i = 0; i <= sailCount; i++) {
        const t = i / sailCount;
        const p = pts[i]!;
        d += ` L ${n(p.x)} ${n(p.y - heightAt(t))}`;
      }
      for (let i = sailCount; i >= 0; i--) {
        d += ` L ${n(pts[i]!.x)} ${n(pts[i]!.y)}`;
      }
      d += ' Z';
      behind.push(outlinedPath(d, palette.accent));
      break;
    }
  }

  return { behind: behind.join(''), front: front.join('') };
}

// ---------------------------------------------------------------------------
// Aspect decorations (layered on top of the finished body, DESIGN §4.1/§8)
// ---------------------------------------------------------------------------

function aspectDecorations(species: SpeciesDef, rig: Rig, palette: AspectPalette, rng: Rng, count: number): string {
  if (count <= 0) return '';
  const parts: string[] = [];
  const spine = rig.spineTop;

  switch (species.aspect) {
    case 'ember': {
      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        const p = lerp(rig.tailRoot, rig.neckRoot, t);
        const crack = `M ${n(p.x)} ${n(p.y - rig.bodyRy * 0.5)} l ${n(rig.bodyRy * 0.2)} ${n(rig.bodyRy * 0.3)} l ${n(-rig.bodyRy * 0.12)} ${n(rig.bodyRy * 0.2)} l ${n(rig.bodyRy * 0.18)} ${n(rig.bodyRy * 0.25)}`;
        parts.push(`<path d="${crack}" fill="none" stroke="${palette.accent}" stroke-width="3" stroke-linecap="round" opacity="0.9"/>`);
      }
      parts.push(`<path d="M ${n(rig.headCx)} ${n(rig.headCy - rig.headRy * 1.1)} l ${n(rig.headRy * 0.3)} ${n(-rig.headRy * 0.8)} l ${n(rig.headRy * 0.25)} ${n(rig.headRy * 0.5)} l ${n(rig.headRy * 0.3)} ${n(-rig.headRy * 0.7)}" fill="none" stroke="${palette.accent}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`);
      break;
    }
    case 'frost': {
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        const p = lerp({ x: rig.bodyCx - rig.bodyRx * 0.6, y: rig.bodyCy + rig.bodyRy * 0.9 }, { x: rig.bodyCx + rig.bodyRx * 0.6, y: rig.bodyCy + rig.bodyRy * 0.95 }, t);
        const h = rig.bodyRy * 0.5;
        parts.push(outlinedPath(`M ${n(p.x - 5)} ${n(p.y)} L ${n(p.x)} ${n(p.y + h)} L ${n(p.x + 5)} ${n(p.y)} Z`, palette.accent));
      }
      break;
    }
    case 'verdant': {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const p = lerp(rig.tailRoot, rig.neckRoot, t);
        const leafD = `M ${n(p.x)} ${n(p.y - rig.bodyRy * 0.7)} Q ${n(p.x + 9)} ${n(p.y - rig.bodyRy * 1.15)} ${n(p.x)} ${n(p.y - rig.bodyRy * 1.5)} Q ${n(p.x - 9)} ${n(p.y - rig.bodyRy * 1.15)} ${n(p.x)} ${n(p.y - rig.bodyRy * 0.7)} Z`;
        parts.push(outlinedPath(leafD, palette.accent));
      }
      break;
    }
    case 'stone': {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const p = lerp({ x: rig.bodyCx - rig.bodyRx * 0.5, y: rig.bodyCy - rig.bodyRy * 0.2 }, { x: rig.bodyCx + rig.bodyRx * 0.5, y: rig.bodyCy - rig.bodyRy * 0.4 }, t);
        parts.push(outlinedPath(`M ${n(p.x - 5)} ${n(p.y + 4)} L ${n(p.x)} ${n(p.y - 5)} L ${n(p.x + 5)} ${n(p.y + 4)} Z`, palette.pattern));
      }
      break;
    }
    case 'storm': {
      const zig = [spine];
      for (let i = 0; i < count + 1; i++) {
        const prev = zig[zig.length - 1]!;
        zig.push({ x: prev.x - 8, y: prev.y - (i % 2 === 0 ? 10 : -4) });
      }
      let d = `M ${n(zig[0]!.x)} ${n(zig[0]!.y)}`;
      for (const p of zig.slice(1)) d += ` L ${n(p.x)} ${n(p.y)}`;
      parts.push(`<path d="${d}" fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
      break;
    }
    case 'tide': {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const p = lerp(rig.tailRoot, rig.neckRoot, t);
        const finD = `M ${n(p.x - 6)} ${n(p.y - rig.bodyRy * 0.4)} L ${n(p.x)} ${n(p.y - rig.bodyRy * 1.05)} L ${n(p.x + 6)} ${n(p.y - rig.bodyRy * 0.4)} Z`;
        parts.push(outlinedPath(finD, palette.accent));
      }
      break;
    }
    case 'venom': {
      for (let i = 0; i < count; i++) {
        const p = { x: rig.faceTip.x - i * 10, y: rig.faceTip.y + rig.headRy * 0.6 + (i % 2) * 6 };
        parts.push(outlinedPath(`M ${n(p.x - 3)} ${n(p.y)} Q ${n(p.x)} ${n(p.y + 10)} ${n(p.x)} ${n(p.y + 13)} Q ${n(p.x)} ${n(p.y + 10)} ${n(p.x + 3)} ${n(p.y)} Z`, palette.pattern));
      }
      break;
    }
    case 'rune': {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rng.next();
        const dist = rig.bodyRx * 1.4;
        const p = { x: rig.bodyCx + Math.cos(angle) * dist, y: rig.bodyCy - rig.bodyRy * 0.3 + Math.sin(angle) * dist * 0.5 };
        const s = 6 + rng.next() * 3;
        parts.push(outlinedPath(`M ${n(p.x)} ${n(p.y - s)} L ${n(p.x + s)} ${n(p.y)} L ${n(p.x)} ${n(p.y + s)} L ${n(p.x - s)} ${n(p.y)} Z`, palette.accent, 0.85));
        parts.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(s * 1.6)}" fill="${palette.accent}" opacity="0.18"/>`);
      }
      break;
    }
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const STAGE_SCALE: Record<Stage, number> = { juvenile: 0.8, adult: 1.0, alpha: 1.12 };
const STAGE_DECORATION_COUNT: Record<Stage, number> = { juvenile: 0, adult: 2, alpha: 4 };
const PATTERN_KINDS: PatternKind[] = ['stripes', 'spots', 'none'];

export function dinoSvg(opts: DinoSvgOptions): string {
  const { species, stage, seed, facing = 'right', size = 200 } = opts;
  const rng = createRng(seed >>> 0);
  const profile = PROFILES[species.archetype];
  const scale = STAGE_SCALE[stage];

  const basePalette = aspectPalette(species.aspect);
  const hueShift = rng.int(-10, 10);
  const palette: AspectPalette = { ...basePalette, accent: rotateHue(basePalette.accent, hueShift) };

  // Juvenile: "bigger head ratio" beyond the overall 0.8x scale (DESIGN §4.4 maturation read).
  const headBoost = stage === 'juvenile' ? 1.3 : 1.0;
  const rig = buildRig(profile, rng, scale, headBoost);
  const patternKind = rng.pick(PATTERN_KINDS);
  const patternRng = rng; // continue the same stream — deterministic given seed

  const parts: string[] = [];
  const defs: string[] = [];
  const clipId = `dc-${species.id}-${stage}-${seed}`;

  defs.push(`<clipPath id="${clipId}"><ellipse cx="${n(rig.bodyCx)}" cy="${n(rig.bodyCy)}" rx="${n(rig.bodyRx * 1.02)}" ry="${n(rig.bodyRy * 1.02)}"/></clipPath>`);

  if (stage === 'alpha') {
    // Soft radial glow (fading to transparent) instead of a flat oval blob.
    const auraId = `aura-${species.id}-${seed}`;
    defs.push(
      `<radialGradient id="${auraId}"><stop offset="35%" stop-color="${palette.accent}" stop-opacity="0.45"/><stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/></radialGradient>`,
    );
    parts.push(
      `<ellipse cx="${n(rig.bodyCx)}" cy="${n(rig.bodyCy - rig.bodyRy * 0.3)}" rx="${n(rig.bodyRx * 1.9)}" ry="${n(rig.bodyRy * 2.6)}" fill="url(#${auraId})"/>`,
    );
  }

  const { behind: structBehind, front: structFront } = structuralExtras(species.archetype, rig, palette);

  // Draw order: far leg, tail, structural-behind (frills/plates/wings-far/sail),
  // body + cel shade + pattern, structural-front (horns/club/near-wing/claw),
  // near leg, head+jaw+eye, aspect decorations.
  parts.push(leg(rig.farHip.x, rig.farHip.y, rig.farFoot.x, rig.farFoot.y, rig.thighR, rig.footR, palette.shade));
  parts.push(capsule(rig.tailRoot.x, rig.tailRoot.y, rig.bodyRy * 0.62, rig.tailMid.x, rig.tailMid.y, rig.bodyRy * 0.36, palette.base));
  parts.push(capsule(rig.tailMid.x, rig.tailMid.y, rig.bodyRy * 0.36, rig.tailTip.x, rig.tailTip.y, 5, palette.base));
  parts.push(structBehind);

  parts.push(capsule(rig.neckRoot.x, rig.neckRoot.y, rig.bodyRy * 0.52, rig.headCx - rig.headRx * 0.3, rig.headCy + rig.headRy * 0.2, rig.headRy * 0.75, palette.base));
  parts.push(outlinedEllipse(rig.bodyCx, rig.bodyCy, rig.bodyRx, rig.bodyRy, palette.base));
  parts.push(shadeEllipse(rig.bodyCx - rig.bodyRx * 0.05, rig.bodyCy + rig.bodyRy * 0.42, rig.bodyRx * 0.78, rig.bodyRy * 0.48, palette.shade));
  if (patternKind !== 'none') {
    const patternSvg = paintPattern(patternKind, patternRng, palette.pattern, {
      x: rig.bodyCx - rig.bodyRx,
      y: rig.bodyCy - rig.bodyRy,
      width: rig.bodyRx * 2,
      height: rig.bodyRy * 2,
    });
    parts.push(`<g clip-path="url(#${clipId})">${patternSvg}</g>`);
  }

  parts.push(structFront);
  parts.push(leg(rig.nearHip.x, rig.nearHip.y, rig.nearFoot.x, rig.nearFoot.y, rig.thighR, rig.footR, palette.base));
  parts.push(buildHead(rig, profile, palette));

  const decoCount = STAGE_DECORATION_COUNT[stage];
  parts.push(aspectDecorations(species, rig, palette, rng, decoCount));

  const inner = defs.length ? `<defs>${defs.join('')}</defs>${parts.join('')}` : parts.join('');
  const content = facing === 'left' ? `<g transform="translate(${VB},0) scale(-1,1)">${inner}</g>` : inner;

  return `<svg viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${species.name}">${content}</svg>`;
}
