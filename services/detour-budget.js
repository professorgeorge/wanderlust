/**
 * Detour Budget Service
 * Calculates the realistic detour time penalty (driving diversion + exploration dwell)
 * against the traveler's available "wandering slack".
 * Supports dynamic budget depletion as stops are visited.
 */
export class DetourBudgetService {
  constructor(initialBudgetMinutes = 20) {
    this.initialBudgetMinutes = initialBudgetMinutes;
    this.budgetMinutes = initialBudgetMinutes;
    this.spentMinutes = 0;
    this.filterOnlyWithinBudget = false;
  }

  setBudget(minutes) {
    this.initialBudgetMinutes = Math.max(0, Number(minutes));
    this.budgetMinutes = Math.max(0, this.initialBudgetMinutes - this.spentMinutes);
  }

  /**
   * Deduct time spent at a visited stop from the slack budget
   */
  deductTime(minutes) {
    this.spentMinutes += Math.max(0, Number(minutes));
    this.budgetMinutes = Math.max(0, this.initialBudgetMinutes - this.spentMinutes);
    return this.budgetMinutes;
  }

  resetSpent() {
    this.spentMinutes = 0;
    this.budgetMinutes = this.initialBudgetMinutes;
  }

  /**
   * Estimate total time cost for a detour in minutes
   * @param {number} straightLineDistMeters - Distance from main route to POI
   * @returns {Object} { totalMinutes, driveMinutes, dwellMinutes, fitsBudget }
   */
  estimateDetourCost(straightLineDistMeters) {
    // Country / mountain roads typically have a curvature factor of ~1.35x
    const oneWayKm = (straightLineDistMeters * 1.35) / 1000;
    const roundTripKm = oneWayKm * 2;

    // Average side-road driving speed ~35 km/h
    const driveMinutes = Math.round((roundTripKm / 35) * 60);

    // Dwell time: brief stop to look, photograph, or absorb (minimum 5 mins)
    const dwellMinutes = straightLineDistMeters > 2000 ? 10 : 5;

    const totalMinutes = driveMinutes + dwellMinutes;
    const fitsBudget = totalMinutes <= this.budgetMinutes;

    return {
      totalMinutes,
      driveMinutes,
      dwellMinutes,
      fitsBudget,
      remainingSlack: this.budgetMinutes - totalMinutes
    };
  }

  /**
   * Format a badge or label for the UI
   */
  formatDetourBadge(straightLineDistMeters) {
    const cost = this.estimateDetourCost(straightLineDistMeters);
    if (cost.fitsBudget) {
      return {
        label: `⏱️ +${cost.totalMinutes}m Detour`,
        fits: true,
        desc: `Fits your ${this.budgetMinutes}m remaining budget (+${cost.driveMinutes}m drive, ${cost.dwellMinutes}m stop)`
      };
    } else {
      return {
        label: `⏳ +${cost.totalMinutes}m Detour`,
        fits: false,
        desc: `Exceeds remaining ${this.budgetMinutes}m budget by ${cost.totalMinutes - this.budgetMinutes}m`
      };
    }
  }
}
