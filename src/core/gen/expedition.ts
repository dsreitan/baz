/**
 * Expedition node-map generation (DESIGN §7, ARCHITECTURE gen/expedition.ts).
 *
 * Builds a 5-layer DAG (layer 0: 2-3 nodes, layers 1-3: 2-4 nodes, layer 4:
 * the lone Apex). Edges are generated (1-2 `next` targets per node into the
 * following layer) then repaired so every node is reachable from some
 * layer-0 node AND every node has a path to the Apex — repair may push a
 * node's out-degree past 2 in rare cases; connectivity wins over the
 * "1-2 edges" guideline when they'd conflict.
 */
import { EVENT_LIST } from '../../data/index';
import { createRng } from '../rng';
import type { BiomeId, EventId, ExpeditionState, MapNode, NodeKind, Rng, WorldTier } from '../types';

const LAYER_COUNT = 5;
const APEX_LAYER = LAYER_COUNT - 1;

export interface GenerateExpeditionOpts {
  biome: BiomeId;
  tier: WorldTier;
  seed: number;
}

function layerWidth(layer: number, rng: Rng): number {
  if (layer === APEX_LAYER) return 1;
  if (layer === 0) return rng.int(2, 3);
  return rng.int(2, 4);
}

/** Ensure every node in `targets` has >= 1 incoming edge from `sources`, preferring a source under the 2-edge guideline. */
function repairIncoming(sources: MapNode[], targets: MapNode[], rng: Rng): void {
  for (const target of targets) {
    if (sources.some((s) => s.next.includes(target.id))) continue;
    const underLimit = sources.filter((s) => s.next.length < 2);
    const source = rng.pick(underLimit.length > 0 ? underLimit : sources);
    source.next.push(target.id);
  }
}

/** Assign node kinds for the middle layers (1-3): quotas per DESIGN §7, rest battles. */
function assignNodeKinds(middleNodes: MapNode[], rng: Rng): void {
  const shuffled = rng.shuffle(middleNodes);
  let i = 0;
  (shuffled[i++] as MapNode).kind = 'grove';
  (shuffled[i++] as MapNode).kind = 'cache';
  (shuffled[i++] as MapNode).kind = 'alpha';

  const eventCount = Math.min(rng.int(1, 2), shuffled.length - i);
  for (let e = 0; e < eventCount; e++) {
    const node = shuffled[i++] as MapNode;
    node.kind = 'event';
    node.eventId = rng.pick(EVENT_LIST).id as EventId;
  }

  for (; i < shuffled.length; i++) (shuffled[i] as MapNode).kind = 'battle';
}

/** Generate a fresh expedition DAG. Builds and owns its own Rng from `seed` (ARCHITECTURE §3 determinism). */
export function generateExpedition(opts: GenerateExpeditionOpts): ExpeditionState {
  const rng = createRng(opts.seed);

  const layers: MapNode[][] = [];
  let nextId = 0;
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const width = layerWidth(layer, rng);
    const nodesInLayer: MapNode[] = [];
    for (let i = 0; i < width; i++) {
      const kind: NodeKind = layer === APEX_LAYER ? 'apex' : 'battle';
      nodesInLayer.push({ id: nextId++, layer, kind, next: [], visited: false });
    }
    layers.push(nodesInLayer);
  }

  for (let layer = 0; layer < APEX_LAYER; layer++) {
    const sources = layers[layer] as MapNode[];
    const targets = layers[layer + 1] as MapNode[];
    for (const source of sources) {
      const count = Math.min(rng.int(1, 2), targets.length);
      source.next = rng.shuffle(targets).slice(0, count).map((t) => t.id);
    }
    repairIncoming(sources, targets, rng);
  }

  const middleNodes: MapNode[] = ([] as MapNode[]).concat(
    layers[1] as MapNode[],
    layers[2] as MapNode[],
    layers[3] as MapNode[],
  );
  assignNodeKinds(middleNodes, rng);

  const nodes: MapNode[] = ([] as MapNode[]).concat(...layers);

  return {
    biome: opts.biome,
    tier: opts.tier,
    seed: opts.seed,
    nodes,
    at: -1,
    lootFound: [],
    essenceFound: 0,
    tamedThisRun: [],
  };
}

/** Node ids reachable right now: layer-0 nodes before the first pick, else the current node's `next`. */
export function availableNodes(exp: ExpeditionState): number[] {
  if (exp.at === -1) {
    return exp.nodes.filter((n) => n.layer === 0).map((n) => n.id);
  }
  const current = exp.nodes.find((n) => n.id === exp.at);
  return current ? [...current.next] : [];
}

/** Move to `nodeId` if it's currently reachable, marking it visited. Mutates `exp` in place. */
export function visitNode(exp: ExpeditionState, nodeId: number): void {
  if (!availableNodes(exp).includes(nodeId)) {
    throw new Error(`visitNode: node ${nodeId} is not reachable from the current position`);
  }
  const node = exp.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`visitNode: unknown node ${nodeId}`);
  node.visited = true;
  exp.at = nodeId;
}
