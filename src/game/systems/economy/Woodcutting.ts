import { RESOURCES, WOODCUTTING } from '../../data/resources'
import type { Job, Point, ResourceNode } from '../../model/WorldState'

export type WoodVisualStage = 'sapling' | 'standing' | 'felling' | 'debranching' | 'stump'

export interface WoodVisualState {
  stage: WoodVisualStage
  maxYield: number
  treeCount: number
  harvestedTrees: number
  activeTreeIndex: number
  workProgress: number
  fallProgress: number
  debranchProgress: number
}

const TREE_SLOT_OFFSETS: readonly Point[] = [
  { x: -0.08, z: 0.02 },
  { x: 0.42, z: -0.18 },
  { x: 0.18, z: 0.43 },
  { x: -0.44, z: 0.16 },
  { x: -0.2, z: -0.42 },
  { x: 0.44, z: 0.34 },
  { x: -0.42, z: 0.4 },
  { x: 0.36, z: -0.44 },
  { x: -0.4, z: -0.36 },
]

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export function woodNodeMaxYield(node: Pick<ResourceNode, 'planted'>): number {
  return node.planted ? WOODCUTTING.managedTreeYield : WOODCUTTING.wildTreeYield
}

export function woodStandTreeCount(node: Pick<ResourceNode, 'planted'>): number {
  return Math.min(TREE_SLOT_OFFSETS.length, Math.max(1, Math.ceil(woodNodeMaxYield(node) / RESOURCES.wood.batch)))
}

export function woodHarvestedTreeCount(node: ResourceNode): number {
  const harvestedWood = Math.max(0, woodNodeMaxYield(node) - node.remaining)
  return Math.min(woodStandTreeCount(node), Math.ceil(harvestedWood / RESOURCES.wood.batch))
}

export function woodTreePoint(node: ResourceNode, treeIndex: number): Point {
  const offset = TREE_SLOT_OFFSETS[Math.max(0, Math.min(TREE_SLOT_OFFSETS.length - 1, treeIndex))]
  return { x: node.x + offset.x, z: node.z + offset.z }
}

export function activeWoodTreePoint(node: ResourceNode): Point {
  const treeCount = woodStandTreeCount(node)
  const active = Math.min(Math.max(0, woodHarvestedTreeCount(node)), treeCount - 1)
  return woodTreePoint(node, active)
}

export function isWoodGatherJob(job: Job | undefined, nodeId?: number): job is Job {
  return !!job
    && job.kind === 'gather'
    && job.resource === 'wood'
    && (nodeId === undefined || job.sourceId === nodeId)
}

export function woodVisualState(node: ResourceNode, job?: Job): WoodVisualState {
  const maxYield = woodNodeMaxYield(node)
  const treeCount = woodStandTreeCount(node)
  const harvestedTrees = woodHarvestedTreeCount(node)
  const activeTreeIndex = Math.min(harvestedTrees, treeCount - 1)
  const active = isWoodGatherJob(job, node.id) && job.stage === 'work'
  const workProgress = active
    ? clamp01(job.progress / Math.max(RESOURCES.wood.workSeconds, 0.001))
    : 0

  if (node.planted && node.remaining <= 0 && (node.growth ?? 0) < 1) {
    return {
      stage: 'sapling', maxYield, treeCount, harvestedTrees, activeTreeIndex,
      workProgress, fallProgress: 0, debranchProgress: 0,
    }
  }
  if (node.remaining <= 0) {
    return {
      stage: 'stump', maxYield, treeCount, harvestedTrees: treeCount, activeTreeIndex,
      workProgress, fallProgress: 1, debranchProgress: 1,
    }
  }

  if (active && workProgress >= WOODCUTTING.fellEnd) {
    return {
      stage: 'debranching', maxYield, treeCount, harvestedTrees, activeTreeIndex,
      workProgress,
      fallProgress: 1,
      debranchProgress: clamp01((workProgress - WOODCUTTING.fellEnd) / (WOODCUTTING.debranchEnd - WOODCUTTING.fellEnd)),
    }
  }
  if (active && workProgress >= WOODCUTTING.fellStart) {
    return {
      stage: 'felling', maxYield, treeCount, harvestedTrees, activeTreeIndex,
      workProgress,
      fallProgress: clamp01((workProgress - WOODCUTTING.fellStart) / (WOODCUTTING.fellEnd - WOODCUTTING.fellStart)),
      debranchProgress: 0,
    }
  }
  return {
    stage: 'standing', maxYield, treeCount, harvestedTrees, activeTreeIndex,
    workProgress, fallProgress: 0, debranchProgress: 0,
  }
}

export function woodcuttingStatus(node: ResourceNode, job: Job): string {
  const visual = woodVisualState(node, job)
  if (visual.stage === 'felling') return 'Tree falling'
  if (visual.stage === 'debranching') return 'Debranching timber'
  return 'Felling tree'
}
