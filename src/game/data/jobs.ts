export const JOBS = {
  gather: { label: 'Gather', priority: 1 },
  deliver: { label: 'Deliver materials', priority: 3 },
  construct: { label: 'Construct', priority: 2 },
  repair: { label: 'Repair structure', priority: 4 },
} as const
export type JobKind = keyof typeof JOBS
export const CARRY_CAPACITY = 5
export const WALK_SPEED = 3
export const FIXED_STEP = 0.05
export const DECISION_TICKS = 10
export const PATH_BUDGET = 2
export const REPAIR_HP_PER_WOOD = 10
export const REPAIR_WORK_SECONDS = 1.5
