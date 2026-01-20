export type InquiryZoneId = 'setup' | 'pressure' | 'payoff';

export interface InquiryZoneLayout {
    x: number;
    y: number;
    axisRotationDeg: number;
    numberRadius: number;
    numberStartAngleDeg: number;
    numberDirection: 'ccw' | 'cw';
}

export const ZONE_LAYOUT: Record<InquiryZoneId, InquiryZoneLayout> = {
    setup: {
        x: -300,
        y: -171,
        axisRotationDeg: 3, // bigger rotates CW
        numberRadius: 450,
        numberStartAngleDeg: 250, //bigger moves CW
        numberDirection: 'ccw'
    },
    pressure: {
        x: 291,
        y: -181,
        axisRotationDeg: 123,
        numberRadius: 450,
        numberStartAngleDeg: 290, //bigger moves CW
        numberDirection: 'cw'
    },
    payoff: {
        x: 0,
        y: 346,
        axisRotationDeg: 243,
        numberRadius: 450,
        numberStartAngleDeg: 50, //bigger moves CW
        numberDirection: 'cw'
    }
};
