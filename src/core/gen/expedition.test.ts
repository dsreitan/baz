import { describe, expect, it } from 'vitest';
import { EVENTS } from '../../data/index';
import { availableNodes, generateExpedition, visitNode } from './expedition';
import type { ExpeditionState, MapNode } from '../types';

const SEEDS = Array.from({ length: 250 }, (_, i) => i * 31 + 11);

function apexNode(exp: ExpeditionState): MapNode {
  const apexes = exp.nodes.filter((n) => n.kind === 'apex');
  expect(apexes).toHaveLength(1);
  return apexes[0] as MapNode;
}

function forwardReachesApex(exp: ExpeditionState, apexId: number): boolean {
  const byId = new Map(exp.nodes.map((n) => [n.id, n]));
  for (const start of exp.nodes) {
    const seen = new Set<number>([start.id]);
    const queue = [start.id];
    let reached = start.id === apexId;
    while (queue.length > 0 && !reached) {
      const id = queue.shift() as number;
      const node = byId.get(id)!;
      for (const next of node.next) {
        if (next === apexId) reached = true;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    if (!reached) return false;
  }
  return true;
}

function reachableFromLayerZero(exp: ExpeditionState): boolean {
  const layerZeroIds = exp.nodes.filter((n) => n.layer === 0).map((n) => n.id);
  const seen = new Set<number>(layerZeroIds);
  const queue = [...layerZeroIds];
  while (queue.length > 0) {
    const id = queue.shift() as number;
    const node = exp.nodes.find((n) => n.id === id)!;
    for (const next of node.next) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return exp.nodes.every((n) => seen.has(n.id));
}

describe('generateExpedition — structure', () => {
  it('has 5 layers with widths 2-3 / 2-4 / 2-4 / 2-4 / 1(apex), over many seeds', () => {
    for (const seed of SEEDS) {
      const exp = generateExpedition({ biome: 'cinder_peaks', tier: 1, seed });
      const byLayer = (layer: number) => exp.nodes.filter((n) => n.layer === layer);
      expect(byLayer(0).length).toBeGreaterThanOrEqual(2);
      expect(byLayer(0).length).toBeLessThanOrEqual(3);
      for (const layer of [1, 2, 3]) {
        expect(byLayer(layer).length).toBeGreaterThanOrEqual(2);
        expect(byLayer(layer).length).toBeLessThanOrEqual(4);
      }
      expect(byLayer(4).length).toBe(1);
    }
  });

  it('apex is single, final-layer, and the only apex-kind node', () => {
    for (const seed of SEEDS) {
      const exp = generateExpedition({ biome: 'frostfen', tier: 2, seed });
      const apex = apexNode(exp);
      expect(apex.layer).toBe(4);
      expect(apex.next).toEqual([]);
      expect(exp.nodes.filter((n) => n.kind === 'apex')).toHaveLength(1);
    }
  });

  it('layer-0 nodes are always battles; every non-apex node has >= 1 outgoing edge', () => {
    for (const seed of SEEDS) {
      const exp = generateExpedition({ biome: 'verdant_maw', tier: 1, seed });
      for (const node of exp.nodes.filter((n) => n.layer === 0)) expect(node.kind).toBe('battle');
      for (const node of exp.nodes) {
        if (node.layer === 4) continue;
        expect(node.next.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('meets node-kind quotas in layers 1-3: >=1 grove, >=1 cache, >=1 alpha, 1-2 events with valid eventIds', () => {
    for (const seed of SEEDS) {
      const exp = generateExpedition({ biome: 'miregloom', tier: 3, seed });
      const middle = exp.nodes.filter((n) => n.layer >= 1 && n.layer <= 3);
      const count = (kind: string) => middle.filter((n) => n.kind === kind).length;
      expect(count('grove')).toBeGreaterThanOrEqual(1);
      expect(count('cache')).toBeGreaterThanOrEqual(1);
      expect(count('alpha')).toBeGreaterThanOrEqual(1);
      const events = middle.filter((n) => n.kind === 'event');
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.length).toBeLessThanOrEqual(2);
      for (const e of events) {
        expect(e.eventId).toBeDefined();
        expect(EVENTS[e.eventId as string]).toBeDefined();
      }
    }
  });
});

describe('generateExpedition — connectivity', () => {
  it('every node is reachable from some layer-0 node, over many seeds', () => {
    for (const seed of SEEDS) {
      const exp = generateExpedition({ biome: 'stormreach_cliffs', tier: 4, seed });
      expect(reachableFromLayerZero(exp)).toBe(true);
    }
  });

  it('every node has a path to the apex, over many seeds', () => {
    for (const seed of SEEDS) {
      const exp = generateExpedition({ biome: 'sunken_coast', tier: 4, seed });
      const apex = apexNode(exp);
      expect(forwardReachesApex(exp, apex.id)).toBe(true);
    }
  });
});

describe('generateExpedition — determinism', () => {
  it('the same seed/biome/tier produces a deep-equal expedition', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const a = generateExpedition({ biome: 'cinder_peaks', tier: 2, seed });
      const b = generateExpedition({ biome: 'cinder_peaks', tier: 2, seed });
      expect(a).toEqual(b);
    }
  });

  it('different seeds usually produce different maps', () => {
    const a = generateExpedition({ biome: 'cinder_peaks', tier: 2, seed: 1 });
    const b = generateExpedition({ biome: 'cinder_peaks', tier: 2, seed: 2 });
    expect(a).not.toEqual(b);
  });
});

describe('availableNodes / visitNode', () => {
  it('before any move, available nodes are exactly the layer-0 node ids', () => {
    const exp = generateExpedition({ biome: 'cinder_peaks', tier: 1, seed: 100 });
    const layerZeroIds = exp.nodes.filter((n) => n.layer === 0).map((n) => n.id).sort();
    expect([...availableNodes(exp)].sort()).toEqual(layerZeroIds);
  });

  it('visiting an unreachable node throws; visiting a reachable one moves `at` and marks visited', () => {
    const exp = generateExpedition({ biome: 'cinder_peaks', tier: 1, seed: 101 });
    const [first] = availableNodes(exp);
    const illegal = exp.nodes.find((n) => n.layer !== 0)!.id;
    expect(() => visitNode(exp, illegal)).toThrow();

    visitNode(exp, first as number);
    expect(exp.at).toBe(first);
    expect(exp.nodes.find((n) => n.id === first)!.visited).toBe(true);
  });

  it('a full walk from layer 0 to the apex only ever uses currently-available nodes', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const exp = generateExpedition({ biome: 'cinder_peaks', tier: 1, seed });
      let guard = 0;
      while (exp.nodes.find((n) => n.id === exp.at)?.kind !== 'apex' && guard < 10) {
        const options = availableNodes(exp);
        expect(options.length).toBeGreaterThan(0);
        visitNode(exp, options[0] as number);
        guard += 1;
      }
      expect(exp.nodes.find((n) => n.id === exp.at)?.kind).toBe('apex');
    }
  });
});
