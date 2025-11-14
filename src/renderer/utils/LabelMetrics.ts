import { CHAR_WIDTH_EM, LETTER_SPACING_EM } from '../layout/LayoutConstants';

export function estimatePixelsFromTitle(title: string, fontPx: number, fudge: number, paddingPx: number): number {
    const approxPerChar = fontPx * (CHAR_WIDTH_EM + LETTER_SPACING_EM) * fudge;
    return Math.max(0, title.length * approxPerChar + paddingPx);
}
