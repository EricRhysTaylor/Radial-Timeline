export type InquiryZoneId = 'setup' | 'pressure' | 'payoff';

export interface InquiryZoneLayout {
    x: number;
    y: number;
    axisRotationDeg: number;
}

export const ZONE_LAYOUT: Record<InquiryZoneId, InquiryZoneLayout> = {
    setup: { x: -400, y: -270, axisRotationDeg: 70 },
    pressure: { x: 400, y: -270, axisRotationDeg: 70 },
    payoff: { x: 0, y: 500, axisRotationDeg: 70 }
};
