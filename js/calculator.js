/**
 * Grade Calculator & Forecaster Engine
 * Handles weighted average calculation, custom grade rounding thresholds (e.g. 4.50, 4.55 Mesh, 4.60 Strict),
 * grade simulations ("what if"), and goal forecasting.
 */

export class GradeCalculator {
    /**
     * Calculate weighted average from an array of grade objects: [{ grade: 5, weight: 2 }, ...]
     * @param {Array<{grade: number, weight: number}>} grades 
     * @returns {number} Weighted average rounded to 2 decimal places (or 0 if no grades)
     */
    static calculateWeightedAverage(grades) {
        if (!grades || grades.length === 0) return 0;

        let totalPoints = 0;
        let totalWeight = 0;

        for (const item of grades) {
            const grade = Number(item.grade);
            const weight = Number(item.weight) || 1;
            
            if (!isNaN(grade) && grade >= 2 && grade <= 5) {
                totalPoints += grade * weight;
                totalWeight += weight;
            }
        }

        if (totalWeight === 0) return 0;

        const avg = totalPoints / totalWeight;
        return Math.round(avg * 100) / 100;
    }

    /**
     * Get rounded official period grade based on weighted average and threshold.
     * @param {number} avg 
     * @param {number} threshold5 Threshold for grade "5" (e.g. 4.50, 4.55 for Mesh, 4.60)
     * @returns {number} 2, 3, 4, or 5
     */
    static getFinalMark(avg, threshold5 = 4.50) {
        if (avg >= threshold5) return 5;
        if (avg >= 3.50) return 4;
        if (avg >= 2.50) return 3;
        if (avg > 0) return 2;
        return 0;
    }

    /**
     * Distance to next grade boundary
     * @param {number} avg 
     * @param {number} threshold5
     * @returns {{ targetGrade: number, threshold: number, remaining: number }}
     */
    static getTargetStatus(avg, threshold5 = 4.50) {
        if (avg >= threshold5) {
            return { targetGrade: 5, threshold: threshold5, remaining: 0, status: 'achieved' };
        } else if (avg >= 3.50) {
            const remaining = Math.round((threshold5 - avg) * 100) / 100;
            return { targetGrade: 5, threshold: threshold5, remaining, status: 'aiming_5' };
        } else if (avg >= 2.50) {
            const remaining = Math.round((3.50 - avg) * 100) / 100;
            return { targetGrade: 4, threshold: 3.50, remaining, status: 'aiming_4' };
        } else if (avg > 0) {
            const remaining = Math.round((2.50 - avg) * 100) / 100;
            return { targetGrade: 3, threshold: 2.50, remaining, status: 'aiming_3' };
        }
        return { targetGrade: 5, threshold: threshold5, remaining: threshold5, status: 'empty' };
    }

    /**
     * Predict how many grades of `desiredNewGrade` with `weight` are needed to reach `targetAvg`
     * @param {Array<{grade: number, weight: number}>} currentGrades 
     * @param {number} targetAvg e.g. 4.55 for MESH "5"
     * @param {number} desiredNewGrade e.g. 5
     * @param {number} weight e.g. 1, 2, 3, 4, or 5
     * @returns {number|Infinity} Number of grades needed, or Infinity if impossible
     */
    static predictNeededGrades(currentGrades, targetAvg, desiredNewGrade = 5, weight = 1) {
        let S = 0;
        let W = 0;

        for (const item of currentGrades) {
            const grade = Number(item.grade);
            const w = Number(item.weight) || 1;
            if (!isNaN(grade) && grade >= 2 && grade <= 5) {
                S += grade * w;
                W += w;
            }
        }

        const currentAvg = W > 0 ? S / W : 0;
        if (currentAvg >= targetAvg) return 0;
        if (desiredNewGrade <= targetAvg) return Infinity;

        const numerator = targetAvg * W - S;
        const denominator = weight * (desiredNewGrade - targetAvg);

        if (denominator <= 0) return Infinity;

        const neededExact = numerator / denominator;
        return Math.max(0, Math.ceil(neededExact));
    }

    /**
     * Simulate adding hypothetical grades to existing grades
     * @param {Array<{grade: number, weight: number}>} currentGrades 
     * @param {Array<{grade: number, weight: number}>} simulatedGrades 
     * @param {number} threshold5 Dynamic threshold for "5" (e.g. 4.55 for Mesh)
     * @returns {{ newAvg: number, diff: number, newFinalMark: number, oldFinalMark: number }}
     */
    static simulateGrades(currentGrades, simulatedGrades, threshold5 = 4.50) {
        const oldAvg = this.calculateWeightedAverage(currentGrades);
        const oldFinalMark = this.getFinalMark(oldAvg, threshold5);

        const combined = [...currentGrades, ...simulatedGrades];
        const newAvg = this.calculateWeightedAverage(combined);
        const newFinalMark = this.getFinalMark(newAvg, threshold5);
        const diff = Math.round((newAvg - oldAvg) * 100) / 100;

        return {
            newAvg,
            diff,
            newFinalMark,
            oldFinalMark
        };
    }
}
