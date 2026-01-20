export type InquiryZoneId = 'setup' | 'pressure' | 'payoff';

export interface InquiryZoneLayout {
    x: number;
    y: number;
    axisRotationDeg: number;
}

export const ZONE_LAYOUT: Record<InquiryZoneId, InquiryZoneLayout> = {
    setup: { x: -280, y: -200, axisRotationDeg: 10 }, //bigger rotates CCW
    pressure: { x: 280, y: -200, axisRotationDeg: 120 },
    payoff: { x: 0, y: 290, axisRotationDeg: 240 }
};
