import type { Job, Point, ResourceNode, Settler } from '../model/WorldState'
import {
  activeWoodTreePoint,
  isWoodGatherJob,
  woodHarvestedTreeCount,
  woodStandTreeCount,
  woodTreePoint,
  woodVisualState,
} from '../systems/economy/Woodcutting'

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
  crownYaw: number
}

const bark = [0x49372a, 0x543d2d, 0x403126, 0x5a4230]
const leaves = [0x365039, 0x405a3f, 0x496244, 0x304a35, 0x52694a]

export class TreeRenderer {
  constructor(private readonly instance: TreeInstanceFn) {}

  private pose(node: ResourceNode, treeIndex: number, regional: boolean): TreePose {
    const p = woodTreePoint(node, treeIndex)
    const seed = node.id * 17.31 + treeIndex * 9.73
    return {
      x: p.x + Math.sin(seed * 0.73) * 0.12,
      z: p.z + Math.cos(seed * 0.61) * 0.12,
      scale: (regional ? 1.02 : 0.94) + ((node.id + treeIndex * 3) % 7) * 0.045,
      fallYaw: (seed * 0.61803398875) % (Math.PI * 2),
      crownYaw: (seed * 0.38196601125) % (Math.PI * 2),
    }
  }

  renderNode(node: ResourceNode, job: Job | undefined, context: TreeRenderContext): void {
    const visual = woodVisualState(node, job)

    if (visual.stage === 'sapling') {
      this.renderSaplingStand(node, context)
      return
    }

    const detailed = !context.far || (isWoodGatherJob(job, node.id) && job.stage === 'work')
    if (!detailed) {
      this.renderFarStand(node, context)
      return
    }

    const treeCount = woodStandTreeCount(node)
    const harvested = woodHarvestedTreeCount(node)
    for (let i = 0; i < Math.min(harvested, treeCount); i++) {
      this.renderStump(this.pose(node, i, context.regional), node.id + i)
    }

    if (node.remaining <= 0) return

    for (let i = harvested; i < treeCount; i++) {
      const pose = this.pose(node, i, context.regional)
      const isActive = i === visual.activeTreeIndex && isWoodGatherJob(job, node.id) && job.stage === 'work'
      if (!isActive) {
        this.renderStanding(node, pose, false, context.night, i)
        continue
      }

      if (visual.stage === 'felling') {
        this.renderFalling(node, pose, visual.fallProgress, false, i)
      } else if (visual.stage === 'debranching') {
        this.renderDebranching(node, pose, visual.debranchProgress, i)
      } else {
        this.renderStanding(node, pose, false, context.night, i)
        this.renderNotchAndChips(pose, node.id + i, visual.workProgress, context.time)
      }
    }

    if (node.remaining > 0 && (node.id + harvested) % 3 === 0) {
      const center = activeWoodTreePoint(node)
      this.instance(
        'underbrush',
        center.x + 0.62,
        0.18,
        center.z - 0.54,
        0.52,
        0.34,
        0.52,
        0x465f43,
        node.id * 0.27,
      )
    }
  }

  renderWoodcutter(settler: Settler, node: ResourceNode, job: Job, time: number): void {
    if (!isWoodGatherJob(job, node.id) || job.stage !== 'work') return

    const visual = woodVisualState(node, job)
    const target = activeWoodTreePoint(node)
    const facing = Math.atan2(target.x - settler.x, target.z - settler.z)

    if (visual.stage === 'felling') {
      this.renderAxe(settler, facing, -0.12, 0.18)
      return
    }

    const speed = visual.stage === 'debranching' ? 1.9 : 2.45
    const cycle = (job.progress * speed + time * 0.12 + settler.id * 0.11) * Math.PI * 2
    const swing = (Math.sin(cycle) + 1) * 0.5
    const tilt = -0.92 + swing * 1.78
    this.renderAxe(settler, facing, tilt, 0)

    if (swing > 0.9) {
      const pose = this.pose(node, visual.activeTreeIndex, false)
      this.renderChips(pose, node.id + visual.activeTreeIndex, time)
    }
  }

  renderTimberHaul(settler: Settler, job: Job, time: number, facing: number): void {
    if (!isWoodGatherJob(job) || job.stage !== 'target') return

    const forwardX = Math.sin(facing)
    const forwardZ = Math.cos(facing)
    const sideX = Math.cos(facing)
    const sideZ = -Math.sin(facing)
    const gait = Math.sin(time * 5.1 + settler.id * 0.8)
    const oxX = settler.x - forwardX * 0.78
    const oxZ = settler.z - forwardZ * 0.78
    const oxY = 0.58 + Math.abs(gait) * 0.015

    this.instance('draftOxBody', oxX, oxY, oxZ, 1.08, 1, 0.92, 0x72543b, facing)
    this.instance('draftOxHead', oxX + forwardX * 0.58, oxY + 0.18, oxZ + forwardZ * 0.58, 0.9, 0.92, 0.9, 0x684a34, facing)

    for (const front of [-0.34, 0.34]) {
      for (const side of [-0.23, 0.23]) {
        const phase = gait * (front > 0 ? 1 : -1) * (side > 0 ? 1 : -1)
        const lx = oxX + forwardX * front + sideX * side
        const lz = oxZ + forwardZ * front + sideZ * side
        this.instance('draftOxLeg', lx, 0.24 + phase * 0.025, lz, 1, 0.95, 1, 0x4c382b, facing)
      }
    }

    const headX = oxX + forwardX * 0.72
    const headZ = oxZ + forwardZ * 0.72
    this.instance('draftOxHorn', headX + sideX * 0.16, oxY + 0.37, headZ + sideZ * 0.16, 1, 1, 1, 0xd0c19a, facing + 0.45)
    this.instance('draftOxHorn', headX - sideX * 0.16, oxY + 0.37, headZ - sideZ * 0.16, 1, 1, 1, 0xd0c19a, facing - 0.45)

    const yokeX = oxX - forwardX * 0.12
    const yokeZ = oxZ - forwardZ * 0.12
    this.instance('draftYoke', yokeX, 0.72, yokeZ, 0.72, 0.08, 0.09, 0x5a3e2a, facing)

    const logCenterX = oxX - forwardX * 1.45
    const logCenterZ = oxZ - forwardZ * 1.45
    this.instance('treeLog', logCenterX, 0.27, logCenterZ, 3.0, 0.92, 0.92, 0x58402e, Math.PI / 2 - facing)
    this.instance('treeCut', logCenterX - forwardX * 1.47, 0.27, logCenterZ - forwardZ * 1.47, 0.48, 0.08, 0.48, 0xc49767, facing)
  }

  private renderFarStand(node: ResourceNode, context: TreeRenderContext): void {
    if (node.remaining <= 0) return
    const remainingTrees = Math.max(1, woodStandTreeCount(node) - woodHarvestedTreeCount(node))
    const visible = Math.min(3, remainingTrees)
    for (let i = 0; i < visible; i++) {
      const pose = this.pose(node, woodHarvestedTreeCount(node) + i, context.regional)
      this.renderStanding(node, pose, true, context.night, i)
    }
  }

  private renderSaplingStand(node: ResourceNode, context: TreeRenderContext): void {
    const growth = Math.max(0.15, Math.min(1, node.growth ?? 0.15))
    const visible = context.far ? 1 : Math.min(4, woodStandTreeCount(node))
    for (let i = 0; i < visible; i++) {
      const pose = this.pose(node, i, context.regional)
      const scale = 0.22 + growth * 0.68
      this.instance('treeBole', pose.x, 0.42 * scale, pose.z, 0.34 * scale, 0.84 * scale, 0.34 * scale, 0x59412f, pose.fallYaw)
      this.instance('treeCrown', pose.x, 0.92 * scale, pose.z, 0.48 * scale, 0.56 * scale, 0.48 * scale, 0x486447, pose.crownYaw)
      if (!context.far && growth > 0.55) {
        this.instance('treeCrown', pose.x + 0.16 * scale, 1.14 * scale, pose.z - 0.08, 0.38 * scale, 0.42 * scale, 0.38 * scale, 0x3c583f, pose.crownYaw + 0.7)
      }
    }
  }

  private renderStanding(node: ResourceNode, pose: TreePose, far: boolean, night: number, treeIndex: number): void {
    const trunkColor = bark[(node.id + treeIndex) % bark.length]
    const height = (3.6 + ((node.id + treeIndex) % 4) * 0.18) * pose.scale
    const lower = height * 0.58
    const upper = height * 0.49

    this.instance('treeBole', pose.x, 0.18 + lower * 0.5, pose.z, 1.08 * pose.scale, lower, 1.08 * pose.scale, trunkColor, pose.fallYaw)
    this.instance('treeBole', pose.x + Math.sin(pose.fallYaw) * 0.04, 0.18 + lower + upper * 0.38, pose.z + Math.cos(pose.fallYaw) * 0.04, 0.74 * pose.scale, upper, 0.74 * pose.scale, trunkColor, pose.fallYaw + 0.04)

    if (!far) {
      for (let i = 0; i < 4; i++) {
        const angle = pose.fallYaw + 0.45 + i * 1.48
        const reach = (0.72 + (i % 2) * 0.18) * pose.scale
        const y = 1.78 * pose.scale + i * 0.34
        this.instance(
          'treeBranch',
          pose.x + Math.sin(angle) * reach * 0.24,
          y,
          pose.z + Math.cos(angle) * reach * 0.24,
          0.78 * pose.scale,
          reach,
          0.78 * pose.scale,
          trunkColor,
          angle,
          1.04,
          0,
        )
      }
    }

    const crownY = height * 0.72
    const baseColor = leaves[(node.id + treeIndex) % leaves.length]
    const clusters: Array<[number, number, number, number]> = far
      ? [[0, 0, 0, 1.12], [0.24, 0.42, -0.08, 0.92]]
      : [
          [-0.42, 0.04, 0.12, 0.9],
          [0.38, 0.14, -0.12, 0.94],
          [0.02, 0.55, 0.04, 0.88],
          [-0.08, -0.34, -0.34, 0.78],
          [0.46, -0.28, 0.3, 0.72],
        ]

    for (let i = 0; i < clusters.length; i++) {
      const [ox, oy, oz, scale] = clusters[i]
      this.instance(
        'treeCrown',
        pose.x + ox * pose.scale,
        crownY + oy * pose.scale,
        pose.z + oz * pose.scale,
        scale * pose.scale,
        scale * 0.88 * pose.scale,
        scale * pose.scale,
        i === 0 ? baseColor : leaves[(node.id + treeIndex + i) % leaves.length],
        pose.crownYaw + i * 0.47,
      )
    }

    if (night > 0.5 && !far) {
      this.instance('treeMoon', pose.x, crownY + 0.32, pose.z, 0.62 * pose.scale, 0.5 * pose.scale, 0.62 * pose.scale, 0x60758a, pose.crownYaw)
    }
  }

  private renderFalling(node: ResourceNode, pose: TreePose, progress: number, far: boolean, treeIndex: number): void {
    const height = (3.6 + ((node.id + treeIndex) % 4) * 0.18) * pose.scale
    const angle = progress * Math.PI * 0.49
    const horizontal = Math.sin(angle)
    const vertical = Math.cos(angle)
    const dirX = Math.sin(pose.fallYaw)
    const dirZ = Math.cos(pose.fallYaw)
    const centerDistance = height * 0.5 * horizontal
    const centerX = pose.x + dirX * centerDistance
    const centerZ = pose.z + dirZ * centerDistance
    const centerY = 0.18 + height * 0.5 * vertical
    const trunkColor = bark[(node.id + treeIndex) % bark.length]

    this.renderStump(pose, node.id + treeIndex, 0.58)
    this.instance(
      'treeBole',
      centerX, centerY, centerZ,
      1.02 * pose.scale, height, 1.02 * pose.scale,
      trunkColor,
      pose.fallYaw,
      -Math.cos(pose.fallYaw) * angle,
      Math.sin(pose.fallYaw) * angle,
    )

    const topX = pose.x + dirX * height * horizontal
    const topZ = pose.z + dirZ * height * horizontal
    const topY = 0.2 + height * vertical
    this.instance('treeCrown', topX, topY, topZ, 1.05 * pose.scale, 0.9 * pose.scale, 1.05 * pose.scale, leaves[(node.id + treeIndex) % leaves.length], pose.crownYaw)
    if (!far) {
      this.instance('treeCrown', topX + 0.48 * pose.scale, topY - 0.08, topZ - 0.22, 0.82 * pose.scale, 0.72 * pose.scale, 0.82 * pose.scale, leaves[(node.id + treeIndex + 1) % leaves.length], pose.crownYaw + 0.5)
      this.instance('treeCrown', topX - 0.34 * pose.scale, topY + 0.2, topZ + 0.26, 0.72 * pose.scale, 0.66 * pose.scale, 0.72 * pose.scale, leaves[(node.id + treeIndex + 2) % leaves.length], pose.crownYaw + 1)
    }
  }

  private renderDebranching(node: ResourceNode, pose: TreePose, progress: number, treeIndex: number): void {
    const dirX = Math.sin(pose.fallYaw)
    const dirZ = Math.cos(pose.fallYaw)
    const length = 3.45 * pose.scale
    const centerX = pose.x + dirX * length * 0.48
    const centerZ = pose.z + dirZ * length * 0.48
    const logYaw = Math.PI / 2 - pose.fallYaw
    const trunkColor = bark[(node.id + treeIndex) % bark.length]

    this.renderStump(pose, node.id + treeIndex)
    this.instance('treeLog', centerX, 0.3, centerZ, length, 1.02 * pose.scale, 1.02 * pose.scale, trunkColor, logYaw)

    const branchCount = progress < 0.35 ? 4 : progress < 0.7 ? 2 : 0
    for (let i = 0; i < branchCount; i++) {
      const along = 0.7 + i * 0.58
      const bx = pose.x + dirX * along
      const bz = pose.z + dirZ * along
      this.instance('treeBranch', bx, 0.3, bz, 0.82 * pose.scale, 0.92 * pose.scale, 0.82 * pose.scale, trunkColor, pose.fallYaw + (i % 2 ? 1.1 : -1.1), 1.18)
    }

    if (progress < 0.55) {
      const tipX = pose.x + dirX * (length + 0.22)
      const tipZ = pose.z + dirZ * (length + 0.22)
      this.instance('treeCrown', tipX, 0.58, tipZ, 0.92 * pose.scale, 0.68 * pose.scale, 0.92 * pose.scale, leaves[(node.id + treeIndex) % leaves.length], pose.crownYaw)
      if (progress < 0.25) {
        this.instance('treeCrown', tipX + 0.38, 0.5, tipZ - 0.24, 0.7 * pose.scale, 0.58 * pose.scale, 0.7 * pose.scale, leaves[(node.id + treeIndex + 1) % leaves.length], pose.crownYaw + 0.5)
      }
    }
  }

  private renderAxe(settler: Settler, facing: number, tilt: number, sideOffset: number): void {
    const frontX = Math.sin(facing)
    const frontZ = Math.cos(facing)
    const sideX = Math.cos(facing)
    const sideZ = -Math.sin(facing)
    const handX = settler.x + frontX * 0.18 + sideX * (0.1 + sideOffset)
    const handZ = settler.z + frontZ * 0.18 + sideZ * (0.1 + sideOffset)
    const handY = 0.93
    const length = 0.8
    const forward = Math.sin(tilt)
    const vertical = Math.cos(tilt)
    const centerX = handX + frontX * forward * length * 0.5
    const centerZ = handZ + frontZ * forward * length * 0.5
    const centerY = handY + vertical * length * 0.5
    const headX = handX + frontX * forward * length
    const headZ = handZ + frontZ * forward * length
    const headY = handY + vertical * length

    this.instance(
      'axeHandle',
      centerX, centerY, centerZ,
      1, length, 1,
      0x6b4932,
      facing,
      -Math.cos(facing) * tilt,
      Math.sin(facing) * tilt,
    )
    this.instance('axeHead', headX, headY, headZ, 1, 1, 1, 0x737b80, facing, 0, tilt * 0.18)
  }

  private renderStump(pose: TreePose, id: number, heightScale = 1): void {
    this.instance('treeStump', pose.x, 0.19 * heightScale, pose.z, 0.95 * pose.scale, 0.8 * heightScale, 0.95 * pose.scale, bark[id % bark.length], pose.fallYaw)
    this.instance('treeCut', pose.x, 0.39 * heightScale, pose.z, 0.72 * pose.scale, 0.07, 0.72 * pose.scale, 0xc49968, pose.fallYaw)
  }

  private renderNotchAndChips(pose: TreePose, id: number, progress: number, time: number): void {
    const sideX = Math.sin(pose.fallYaw + Math.PI / 2)
    const sideZ = Math.cos(pose.fallYaw + Math.PI / 2)
    const depth = Math.min(0.2, 0.04 + progress * 0.12)
    this.instance('treeCut', pose.x + sideX * 0.18, 0.5, pose.z + sideZ * 0.18, depth, 0.16, 0.3, 0xd1a16d, pose.fallYaw)
    this.renderChips(pose, id, time)
  }

  private renderChips(pose: TreePose, id: number, time: number): void {
    for (let i = 0; i < 4; i++) {
      const angle = id * 0.73 + i * 1.63 + time * 0.24
      const radius = 0.3 + i * 0.11
      this.instance(
        'treeChip',
        pose.x + Math.sin(angle) * radius,
        0.045 + i * 0.012,
        pose.z + Math.cos(angle) * radius,
        0.52 + i * 0.06,
        0.32,
        0.46,
        i % 2 ? 0xc8915b : 0xae7849,
        angle,
      )
    }
  }
}
