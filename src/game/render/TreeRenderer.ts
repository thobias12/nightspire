import type { Job, ResourceNode, Settler } from '../model/WorldState'
import { isWoodGatherJob, woodVisualState } from '../systems/economy/Woodcutting'

export type TreeInstanceFn = (
  name: string,
  x: number,
  y: number,
  z: number,
  sx?: number,
  sy?: number,
  sz?: number,
  color?: number,
  yaw?: number,
  pitch?: number,
  roll?: number,
) => void

export interface TreeRenderContext {
  regional: boolean
  far: boolean
  night: number
  time: number
}

interface TreePose {
  x: number
  z: number
  scale: number
  fallYaw: number
}

const bark = [0x4f3929, 0x58402e, 0x463327]
const leaves = [0x3d5638, 0x465f3f, 0x354d36, 0x516744]

export class TreeRenderer {
  constructor(private readonly instance: TreeInstanceFn) {}

  private pose(node: ResourceNode, regional: boolean): TreePose {
    const seed = node.id * 2.399963229728653
    const offset = node.planted ? 0.12 : regional ? 0.26 : 0.3
    return {
      x: node.x + Math.sin(seed) * offset,
      z: node.z + Math.cos(seed * 0.91) * offset,
      scale: (regional ? 1.22 : 0.96) + (node.id % 9) * (regional ? 0.045 : 0.035),
      fallYaw: (node.id * 1.61803398875) % (Math.PI * 2),
    }
  }

  renderNode(node: ResourceNode, job: Job | undefined, context: TreeRenderContext): void {
    const visual = woodVisualState(node, job)
    const pose = this.pose(node, context.regional)

    if (visual.stage === 'sapling') {
      this.renderSapling(node, pose)
      return
    }
    if (visual.stage === 'stump') {
      this.renderStump(pose, node.id)
      return
    }
    if (visual.stage === 'standing') {
      this.renderStanding(node, pose, context.far, context.night)
      if (isWoodGatherJob(job, node.id) && job.stage === 'work') this.renderNotchAndChips(pose, node.id, job.progress, context.time)
      return
    }
    if (visual.stage === 'felling') {
      this.renderFalling(node, pose, visual.fallProgress, context.far)
      this.renderNotchAndChips(pose, node.id, job?.progress ?? 0, context.time)
      return
    }
    if (visual.stage === 'trunk') {
      this.renderFelledTrunk(node, pose, visual.remainingRatio)
      return
    }
    this.renderRounds(node, pose, visual.remainingRatio)
  }

  renderWoodcutter(settler: Settler, node: ResourceNode, job: Job, time: number): void {
    if (!isWoodGatherJob(job, node.id) || job.stage !== 'work') return

    const facing = Math.atan2(node.x - settler.x, node.z - settler.z)
    const frontX = Math.sin(facing)
    const frontZ = Math.cos(facing)
    const sideX = Math.cos(facing)
    const sideZ = -Math.sin(facing)
    const cycle = (job.progress * 2.55 + time * 0.16 + settler.id * 0.13) * Math.PI * 2
    const swing01 = (Math.sin(cycle) + 1) * 0.5
    const tilt = -0.92 + swing01 * 1.72
    const handX = settler.x + frontX * 0.18 + sideX * 0.1
    const handZ = settler.z + frontZ * 0.18 + sideZ * 0.1
    const handY = 0.93
    const length = 0.76
    const forward = Math.sin(tilt)
    const vertical = Math.cos(tilt)
    const centerX = handX + frontX * forward * length * 0.5
    const centerZ = handZ + frontZ * forward * length * 0.5
    const centerY = handY + vertical * length * 0.5
    const headX = handX + frontX * forward * length
    const headZ = handZ + frontZ * forward * length
    const headY = handY + vertical * length

    this.instance(
      'axeHandle', centerX, centerY, centerZ,
      1, length, 1, 0x6a472f, facing,
      -Math.cos(facing) * tilt,
      Math.sin(facing) * tilt,
    )
    this.instance('axeHead', headX, headY, headZ, 1, 1, 1, 0x707980, facing, 0, tilt * 0.18)

    if (swing01 > 0.88) {
      const pose = this.pose(node, false)
      this.renderChips(pose, node.id, time)
    }
  }

  private renderSapling(node: ResourceNode, pose: TreePose): void {
    const growth = Math.max(0.15, node.growth ?? 0.15)
    const scale = 0.25 + growth * 0.75
    this.instance('treeBole', pose.x, 0.48 * scale, pose.z, 0.5 * scale, 0.95 * scale, 0.5 * scale, 0x57402e, pose.fallYaw)
    this.instance('treeCrown', pose.x, 1.06 * scale, pose.z, 0.62 * scale, 0.7 * scale, 0.62 * scale, 0x4a6647, pose.fallYaw)
    if (growth > 0.55) {
      this.instance('treeCrown', pose.x + 0.2 * scale, 1.32 * scale, pose.z - 0.08, 0.48 * scale, 0.5 * scale, 0.48 * scale, 0x3f5a40, pose.fallYaw + 0.7)
    }
  }

  private renderStanding(node: ResourceNode, pose: TreePose, far: boolean, night: number): void {
    const height = 3.25 * pose.scale
    const trunkColor = bark[node.id % bark.length]
    this.instance('treeBole', pose.x, 0.22 + height * 0.5, pose.z, 0.9 * pose.scale, height, 0.9 * pose.scale, trunkColor, pose.fallYaw)

    if (!far) {
      for (let i = 0; i < 3; i++) {
        const angle = pose.fallYaw + i * 2.094 + 0.35
        const reach = (0.56 + i * 0.1) * pose.scale
        this.instance(
          'treeBranch',
          pose.x + Math.sin(angle) * reach * 0.28,
          1.75 * pose.scale + i * 0.3,
          pose.z + Math.cos(angle) * reach * 0.28,
          0.72 * pose.scale,
          reach,
          0.72 * pose.scale,
          trunkColor,
          angle,
          0.82,
          0,
        )
      }
    }

    const crownY = 2.55 * pose.scale
    const crownColor = leaves[node.id % leaves.length]
    this.instance('treeCrown', pose.x - 0.38 * pose.scale, crownY, pose.z + 0.08, 0.95 * pose.scale, 0.9 * pose.scale, 0.95 * pose.scale, crownColor, node.id * 0.17)
    this.instance('treeCrown', pose.x + 0.36 * pose.scale, crownY + 0.22 * pose.scale, pose.z - 0.12, 0.88 * pose.scale, 0.86 * pose.scale, 0.88 * pose.scale, leaves[(node.id + 1) % leaves.length], node.id * 0.29)
    if (!far) {
      this.instance('treeCrown', pose.x, crownY + 0.72 * pose.scale, pose.z + 0.05, 0.78 * pose.scale, 0.84 * pose.scale, 0.78 * pose.scale, leaves[(node.id + 2) % leaves.length], node.id * 0.41)
      this.instance('underbrush', pose.x + Math.sin(node.id * 0.9) * 0.72, 0.18, pose.z + Math.cos(node.id * 1.2) * 0.66, 0.58, 0.36, 0.58, 0x4a6347, node.id * 0.29)
    }
    if (night > 0.45 && !far) {
      this.instance('treeMoon', pose.x + 0.1, crownY + 0.45, pose.z - 0.1, 0.72 * pose.scale, 0.56 * pose.scale, 0.72 * pose.scale, 0x60758a, node.id * 0.17)
    }
  }

  private renderFalling(node: ResourceNode, pose: TreePose, progress: number, far: boolean): void {
    const height = 3.25 * pose.scale
    const angle = progress * Math.PI * 0.48
    const horizontal = Math.sin(angle)
    const vertical = Math.cos(angle)
    const dirX = Math.sin(pose.fallYaw)
    const dirZ = Math.cos(pose.fallYaw)
    const centerDistance = height * 0.5 * horizontal
    const centerX = pose.x + dirX * centerDistance
    const centerZ = pose.z + dirZ * centerDistance
    const centerY = 0.22 + height * 0.5 * vertical
    const trunkColor = bark[node.id % bark.length]

    this.renderStump(pose, node.id, 0.52)
    this.instance(
      'treeBole', centerX, centerY, centerZ,
      0.9 * pose.scale, height, 0.9 * pose.scale, trunkColor, pose.fallYaw,
      -Math.cos(pose.fallYaw) * angle,
      Math.sin(pose.fallYaw) * angle,
    )

    const topX = pose.x + dirX * height * horizontal
    const topZ = pose.z + dirZ * height * horizontal
    const topY = 0.24 + height * vertical
    const crownColor = leaves[node.id % leaves.length]
    this.instance('treeCrown', topX, topY, topZ, 0.98 * pose.scale, 0.9 * pose.scale, 0.98 * pose.scale, crownColor, node.id * 0.17)
    if (!far) {
      this.instance('treeCrown', topX + 0.4 * pose.scale, topY - 0.12, topZ - 0.2, 0.78 * pose.scale, 0.74 * pose.scale, 0.78 * pose.scale, leaves[(node.id + 1) % leaves.length], node.id * 0.31)
    }
  }

  private renderFelledTrunk(node: ResourceNode, pose: TreePose, remainingRatio: number): void {
    const dirX = Math.sin(pose.fallYaw)
    const dirZ = Math.cos(pose.fallYaw)
    const length = (2.7 + remainingRatio * 0.9) * pose.scale
    const centerDistance = length * 0.48
    const logYaw = Math.PI / 2 - pose.fallYaw
    this.renderStump(pose, node.id)
    this.instance('treeLog', pose.x + dirX * centerDistance, 0.32, pose.z + dirZ * centerDistance, length, 1.05 * pose.scale, 1.05 * pose.scale, bark[node.id % bark.length], logYaw)

    if (remainingRatio > 0.72) {
      const tipX = pose.x + dirX * (length + 0.35)
      const tipZ = pose.z + dirZ * (length + 0.35)
      this.instance('treeCrown', tipX, 0.7, tipZ, 0.92 * pose.scale, 0.72 * pose.scale, 0.92 * pose.scale, leaves[node.id % leaves.length], node.id * 0.23)
      this.instance('treeCrown', tipX + 0.35, 0.54, tipZ - 0.2, 0.7 * pose.scale, 0.58 * pose.scale, 0.7 * pose.scale, leaves[(node.id + 1) % leaves.length], node.id * 0.37)
    } else {
      this.renderRounds(node, pose, remainingRatio)
    }
  }

  private renderRounds(node: ResourceNode, pose: TreePose, remainingRatio: number): void {
    this.renderStump(pose, node.id)
    const count = Math.max(1, Math.min(5, Math.ceil(node.remaining / 5)))
    for (let i = 0; i < count; i++) {
      const angle = pose.fallYaw + i * 1.37
      const radius = 0.62 + (i % 3) * 0.32
      const size = (0.7 + Math.min(1, remainingRatio) * 0.35) * pose.scale
      this.instance(
        'treeLog',
        pose.x + Math.sin(angle) * radius,
        0.21 + (i % 2) * 0.08,
        pose.z + Math.cos(angle) * radius,
        size,
        0.82 * pose.scale,
        0.82 * pose.scale,
        bark[(node.id + i) % bark.length],
        angle,
      )
    }
  }

  private renderStump(pose: TreePose, id: number, heightScale = 1): void {
    this.instance('treeStump', pose.x, 0.2 * heightScale, pose.z, 0.95 * pose.scale, 0.82 * heightScale, 0.95 * pose.scale, bark[id % bark.length], pose.fallYaw)
    this.instance('treeCut', pose.x, 0.405 * heightScale, pose.z, 0.75 * pose.scale, 0.08, 0.75 * pose.scale, 0xc59662, pose.fallYaw)
  }

  private renderNotchAndChips(pose: TreePose, id: number, progress: number, time: number): void {
    const sideX = Math.sin(pose.fallYaw + Math.PI / 2)
    const sideZ = Math.cos(pose.fallYaw + Math.PI / 2)
    const depth = Math.min(0.18, 0.05 + progress * 0.045)
    this.instance('treeCut', pose.x + sideX * 0.17, 0.52, pose.z + sideZ * 0.17, depth, 0.18, 0.32, 0xd0a069, pose.fallYaw)
    this.renderChips(pose, id, time)
  }

  private renderChips(pose: TreePose, id: number, time: number): void {
    for (let i = 0; i < 3; i++) {
      const angle = id * 0.73 + i * 2.1 + time * 0.35
      const radius = 0.34 + i * 0.12
      this.instance(
        'treeChip',
        pose.x + Math.sin(angle) * radius,
        0.055 + i * 0.015,
        pose.z + Math.cos(angle) * radius,
        0.55 + i * 0.08,
        0.38,
        0.5,
        i % 2 ? 0xc6935d : 0xad7848,
        angle,
      )
    }
  }
}
