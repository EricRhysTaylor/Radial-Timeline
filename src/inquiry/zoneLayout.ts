export type InquiryZoneId = 'setup' | 'pressure' | 'payoff';

export interface InquiryZoneLayout {
    x: number;
    y: number;
    axisRotationDeg: number;
}

export const ZONE_LAYOUT: Record<InquiryZoneId, InquiryZoneLayout> = {
    setup: { x: -290, y: -168, axisRotationDeg: 0}, //bigger rotates CW
    pressure: { x: 290, y: -183, axisRotationDeg: 126 },
    payoff: { x: 0, y: 320, axisRotationDeg: 243 }
};
