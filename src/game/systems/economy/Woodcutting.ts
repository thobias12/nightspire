import { RESOURCES, WOODCUTTING } from '../../data/resources'
import type { Job, ResourceNode } from '../../model/WorldState'

export type WoodVisualStage = 'sapling' | 'standing' | 'felling' | 'trunk' | 'rounds' | 'stump'

export interface WoodVisualState {
  stage: WoodVisualStage
  maxYield: number
  remainingRatio: number
  workProgress: number
  fallProgress: number
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export function woodNodeMaxYield(node: Pick<ResourceNode, 'planted'>): number {
  return node.planted ? WOODCUTTING.managedTreeYield : WOODCUTTING.wildTreeYield
}

export function isWoodGatherJob(job: Job | undefined, nodeId?: number): job is Job {
  return !!job
    && job.kind === 'gather'
    && job.resource === 'wood'
    && (nodeId === undefined || job.sourceId === nodeId)
}

export function woodVisualState(node: ResourceNode, job?: Job): WoodVisualState {
  const maxYield = woodNodeMaxYield(node)
  const remainingRatio = clamp01(node.remaining / Math.max(1, maxYield))
  const active = isWoodGatherJob(job, node.id) && job.stage === 'work'
  const workProgress = active
    ? clamp01(job.progress / Math.max(RESOURCES.wood.workSeconds, 0.001))
    : 0

  if (node.planted && node.remaining <= 0 && (node.growth ?? 0) < 1) {
    return { stage: 'sapling', maxYield, remainingRatio: 0, workProgress, fallProgress: 0 }
  }
  if (node.remaining <= 0) {
    return { stage: 'stump', maxYield, remainingRatio: 0, workProgress, fallProgress: 0 }
  }

  if (node.remaining >= maxYield) {
    if (active && workProgress >= WOODCUTTING.fellStart) {
      const fallProgress = clamp01(
        (workProgress - WOODCUTTING.fellStart) / (WOODCUTTING.fellEnd - WOODCUTTING.fellStart),
      )
      return { stage: 'felling', maxYield, remainingRatio, workProgress, fallProgress }
    }
    return { stage: 'standing', maxYield, remainingRatio, workProgress, fallProgress: 0 }
  }

  return {
    stage: remainingRatio > WOODCUTTING.trunkStageMinRatio ? 'trunk' : 'rounds',
    maxYield,
    remainingRatio,
    workProgress,
    fallProgress: 1,
  }
}

export function woodcuttingStatus(node: ResourceNode): string {
  const ratio = clamp01(node.remaining / Math.max(1, woodNodeMaxYield(node)))
  if (ratio >= 0.999) return 'Felling tree'
  if (ratio > WOODCUTTING.trunkStageMinRatio) return 'Bucking fallen trunk'
  return 'Splitting timber rounds'
}
