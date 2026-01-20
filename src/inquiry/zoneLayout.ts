export type InquiryZoneId = 'setup' | 'pressure' | 'payoff';

export interface InquiryZoneLayout {
    x: number;
    y: number;
    axisRotationDeg: number;
}

export const ZONE_LAYOUT: Record<InquiryZoneId, InquiryZoneLayout> = {
    setup: { x: -292, y: -170, axisRotationDeg: 2}, //bigger rotates CW
    pressure: { x: 292, y: -186, axisRotationDeg: 124 },
    payoff: { x: 0, y: 322, axisRotationDeg: 243 }
};
