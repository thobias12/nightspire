import type { ResidentialPlot } from '../simulation/WorldState'

export type ResidentialCompoundTier = 'cottage' | 'homestead' | 'burgage'
export type ResidentialCompoundForm = 'compact' | 'long-burgage' | 'balanced' | 'wide-shallow' | 'wide-deep'
export type ResidentialRoofFront = 'gable' | 'eave'
export type ResidentialFrontageStyle = 'open' | 'posts' | 'hedge' | 'short-fence' | 'gate'
export type ResidentialRearStructure = 'shed' | 'lean-to' | 'coop' | 'workshop' | 'covered-storage'
export type ResidentialCourtyardMode = 'none' | 'l' | 'u'

export interface ResidentialPresentationProfile {
  tier: ResidentialCompoundTier
  form: ResidentialCompoundForm
  label: string
  houseWidth: number
  houseDepth: number
  wallHeight: number
  roofHeight: number
  frontGap: number
  outbuildingScale: number
  lateralOffset: number
  frontageOffset: number
  facadeWindows: 1 | 2 | 3
  sidePassage: -1 | 0 | 1
  roofFront: ResidentialRoofFront
  frontageStyle: ResidentialFrontageStyle
  rearStructure: ResidentialRearStructure
  courtyard: ResidentialCourtyardMode
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export function residentialFrontage(plot: Pick<ResidentialPlot, 'frontageA' | 'frontageB'>): number {
  return Math.hypot(plot.frontageB.x - plot.frontageA.x, plot.frontageB.z - plot.frontageA.z)
}

export function residentialPresentationProfile(plot: ResidentialPlot): ResidentialPresentationProfile {
  const frontage = residentialFrontage(plot)
  const depth = plot.depth
  const area = frontage * depth
  const depthRatio = depth / Math.max(0.1, frontage)
  const frontageRatio = frontage / Math.max(0.1, depth)

  const form: ResidentialCompoundForm =
    frontage <= 5.25 && depth >= 8.5
      ? 'long-burgage'
      : frontage >= 8 && depth >= 9
        ? 'wide-deep'
        : frontage >= 7.5 && depth <= 7.5
          ? 'wide-shallow'
          : depthRatio >= 1.55 && depth >= 8
            ? 'long-burgage'
            : frontageRatio >= 1.08 && frontage >= 7
              ? 'wide-shallow'
              : 'balanced'

  const tier: ResidentialCompoundTier =
    form === 'wide-deep' && area >= 76
      ? 'burgage'
      : frontage >= 5.8 && area >= 44
        ? 'homestead'
        : 'cottage'

  const offsetSign: -1 | 1 = plot.id % 2 === 0 ? 1 : -1
  const frontageOffset = [-0.24, 0.04, 0.28][plot.id % 3]
  const frontageStyle: ResidentialFrontageStyle =
    plot.id % 5 === 0 ? 'open'
      : plot.id % 5 === 1 ? 'hedge'
        : plot.id % 5 === 2 ? 'posts'
          : plot.id % 5 === 3 ? 'short-fence'
            : 'gate'
  const rearStructure: ResidentialRearStructure =
    plot.backyard === 'chickens' ? 'coop'
      : plot.backyard === 'workyard' ? 'workshop'
        : plot.id % 3 === 0 ? 'covered-storage'
          : plot.id % 3 === 1 ? 'lean-to'
            : 'shed'

  if (form === 'long-burgage') {
    return {
      tier: 'cottage',
      form,
      label: 'Long burgage cottage',
      houseWidth: clamp(frontage * 0.62, 2.4, 3.05),
      houseDepth: clamp(depth * 0.34, 2.7, 3.7),
      wallHeight: 1.84 + (plot.id % 3) * 0.06,
      roofHeight: 1.0 + (plot.id % 2) * 0.07,
      frontGap: 0.68,
      outbuildingScale: 0.92,
      lateralOffset: offsetSign * 0.34,
      frontageOffset: Math.max(-0.08, frontageOffset),
      facadeWindows: plot.id % 2 === 0 ? 1 : 2,
      sidePassage: -offsetSign as -1 | 1,
      roofFront: 'gable',
      frontageStyle,
      rearStructure,
      courtyard: 'none',
    }
  }

  if (form === 'wide-deep') {
    return {
      tier: 'burgage',
      form,
      label: 'Burgage courtyard compound',
      houseWidth: clamp(frontage * 0.49, 3.7, 4.25),
      houseDepth: clamp(depth * 0.31, 2.9, 3.55),
      wallHeight: 2.12 + (plot.id % 2) * 0.12,
      roofHeight: 1.2 + (plot.id % 3) * 0.055,
      frontGap: 1.08,
      outbuildingScale: 1.2,
      lateralOffset: offsetSign * 0.58,
      frontageOffset: frontageOffset,
      facadeWindows: 3,
      sidePassage: -offsetSign as -1 | 1,
      roofFront: 'eave',
      frontageStyle,
      rearStructure,
      courtyard: plot.id % 2 === 0 ? 'u' : 'l',
    }
  }

  if (form === 'wide-shallow') {
    return {
      tier: 'homestead',
      form,
      label: 'Broad-front homestead',
      houseWidth: clamp(frontage * 0.58, 3.65, 4.35),
      houseDepth: clamp(depth * 0.32, 2.2, 2.85),
      wallHeight: 1.96 + (plot.id % 3) * 0.07,
      roofHeight: 1.08 + (plot.id % 2) * 0.07,
      frontGap: 0.92,
      outbuildingScale: 0.86,
      lateralOffset: offsetSign * 0.34,
      frontageOffset: frontageOffset,
      facadeWindows: 3,
      sidePassage: 0,
      roofFront: 'eave',
      frontageStyle,
      rearStructure,
      courtyard: 'none',
    }
  }

  if (tier === 'homestead') {
    return {
      tier,
      form,
      label: 'Homestead compound',
      houseWidth: clamp(frontage * 0.66, 3.05, 4.2),
      houseDepth: clamp(depth * 0.31, 2.5, 3.3),
      wallHeight: 1.96 + (plot.id % 3) * 0.07,
      roofHeight: 1.08 + (plot.id % 2) * 0.08,
      frontGap: 0.9,
      outbuildingScale: 1,
      lateralOffset: ((plot.id % 3) - 1) * 0.24,
      frontageOffset,
      facadeWindows: 2,
      sidePassage: depth >= 9 ? offsetSign : 0,
      roofFront: plot.id % 2 === 0 ? 'eave' : 'gable',
      frontageStyle,
      rearStructure,
      courtyard: 'none',
    }
  }

  return {
    tier,
    form: 'compact',
    label: 'Cottage compound',
    houseWidth: clamp(frontage * 0.6, 2.3, 3.05),
    houseDepth: clamp(depth * 0.28, 2.12, 2.65),
    wallHeight: 1.78 + (plot.id % 3) * 0.055,
    roofHeight: 0.96 + (plot.id % 2) * 0.07,
    frontGap: 0.68,
    outbuildingScale: 0.82,
    lateralOffset: ((plot.id % 3) - 1) * 0.18,
    frontageOffset,
    facadeWindows: plot.id % 2 === 0 ? 1 : 2,
    sidePassage: 0,
    roofFront: plot.id % 3 === 0 ? 'eave' : 'gable',
    frontageStyle,
    rearStructure,
    courtyard: 'none',
  }
}
