import { describe, expect, it } from 'vitest';
import { buildInquirySourcesViewModel } from './inquirySources';
import type { EvidenceDocumentMeta, InquiryCitation } from '../state';

describe('buildInquirySourcesViewModel', () => {
    it('keeps direct manuscript citation rendering intact for evidence documents', () => {
        const citations: InquiryCitation[] = [
            { citedText: 'Longer cited excerpt from manuscript.', documentIndex: 0 },
            { citedText: 'Short quote.', documentIndex: 0 }
        ];
        const docs: EvidenceDocumentMeta[] = [
            {
                title: 'The Departure',
                path: 'Scenes/The Departure.md',
                sceneId: 'S1',
                evidenceClass: 'scene'
            }
        ];

        const vm = buildInquirySourcesViewModel(citations, docs);
        expect(vm.hasContent).toBe(true);
        expect(vm.totalCount).toBe(1);
        expect(vm.items[0]).toMatchObject({
            attributionType: 'direct_manuscript',
            title: 'The Departure',
            classLabel: 'Scene',
            citationCount: 2
        });
        expect(vm.items[0].excerpt).toContain('Longer cited excerpt');
    });

    it('renders OpenAI-style external attribution when no manuscript document metadata exists', () => {
        const citations: InquiryCitation[] = [
            {
                attributionType: 'tool_url',
                sourceLabel: 'Style Guide',
                sourceId: 'https://example.com/style',
                url: 'https://example.com/style',
                citedText: 'Shorter sentences improve pace.'
            },
            {
                attributionType: 'tool_url',
                sourceLabel: 'Style Guide',
                sourceId: 'https://example.com/style',
                url: 'https://example.com/style',
                citedText: 'Use shorter sentences in high-pressure scenes.'
            },
            {
                attributionType: 'tool_file',
                sourceLabel: 'notes.md',
                sourceId: 'file_123',
                fileId: 'file_123',
                filename: 'notes.md',
                citedText: 'Character motivation notes.'
            }
        ];

        const vm = buildInquirySourcesViewModel(citations, undefined);
        expect(vm.hasContent).toBe(true);
        expect(vm.totalCount).toBe(2);

        const urlSource = vm.items.find(item => item.attributionType === 'tool_url');
        expect(urlSource).toMatchObject({
            title: 'Style Guide',
            classLabel: 'Tool URL',
            citationCount: 2,
            url: 'https://example.com/style'
        });

        const fileSource = vm.items.find(item => item.attributionType === 'tool_file');
        expect(fileSource).toMatchObject({
            title: 'notes.md',
            classLabel: 'Tool File',
            citationCount: 1
        });
    });

    it('returns empty state when no citation data is provided', () => {
        const vm = buildInquirySourcesViewModel(undefined, undefined);
        expect(vm).toEqual({
            items: [],
            totalCount: 0,
            initialCount: 0,
            hasContent: false
        });
    });
});
