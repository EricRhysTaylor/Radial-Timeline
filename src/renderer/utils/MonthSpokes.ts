type MonthInfo = { name: string; shortName: string; angle: number };

import { renderMonthSpokesAndInnerLabels } from '../components/MonthSpokes';

type CalendarSpokeOptions = {
    months: MonthInfo[];
    lineInnerRadius: number;
    monthTickEnd: number;
    currentMonthIndex: number;
    subplotOuterRadius: number;
    isChronologueMode: boolean;
    numActs: number;
};

export function renderCalendarSpokesLayer({
    months,
    lineInnerRadius,
    monthTickEnd,
    currentMonthIndex,
    subplotOuterRadius,
    isChronologueMode,
    numActs
}: CalendarSpokeOptions): string {
    const includeIntermediateSpokes = !isChronologueMode;
    const outerSpokeInnerRadius = isChronologueMode ? undefined : subplotOuterRadius;

    return renderMonthSpokesAndInnerLabels({
        months,
        lineInnerRadius,
        lineOuterRadius: monthTickEnd,
        currentMonthIndex,
        includeIntermediateSpokes,
        outerSpokeInnerRadius,
        numActs
    });
}
