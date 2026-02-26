import { describe, expect, it } from 'vitest';
import { parseMatterMetaFromFrontmatter } from './matterMeta';

describe('matterMeta parser', () => {
  it('parses simplified flat frontmatter fields', () => {
    const parsed = parseMatterMetaFromFrontmatter(
      {
        Class: 'Frontmatter',
        Role: 'title-page',
        UseBookMeta: true
      }
    );

    expect(parsed).toEqual({
      side: 'front',
      role: 'title-page',
      usesBookMeta: true,
      bodyMode: 'auto'
    });
  });

  it('uses back side by class when Class is Backmatter', () => {
    const parsed = parseMatterMetaFromFrontmatter(
      { Class: 'Backmatter', Role: 'acknowledgments' }
    );

    expect(parsed?.side).toBe('back');
    expect(parsed?.role).toBe('acknowledgments');
  });

  it('ignores Side overrides and resolves side strictly from Class', () => {
    const parsed = parseMatterMetaFromFrontmatter(
      { Class: 'Frontmatter', Side: 'back', Role: 'other' }
    );

    expect(parsed?.side).toBe('front');
  });

  it('does not parse nested Matter block keys anymore', () => {
    const parsed = parseMatterMetaFromFrontmatter(
      {
        Class: 'Frontmatter',
        Role: 'epigraph',
        Matter: {
          role: 'copyright'
        }
      }
    );

    expect(parsed).toEqual({
      side: 'front',
      role: 'epigraph',
      bodyMode: 'auto'
    });
  });

  it('returns null for Class: Matter', () => {
    const parsed = parseMatterMetaFromFrontmatter(
      { Class: 'Matter', Role: 'other' }
    );
    expect(parsed).toBeNull();
  });

  it('supports Mode alias for BodyMode', () => {
    const parsed = parseMatterMetaFromFrontmatter(
      {
        Class: 'Frontmatter',
        Mode: 'latex'
      }
    );

    expect(parsed?.bodyMode).toBe('latex');
  });

  it('returns null for non-matter classes', () => {
    const parsed = parseMatterMetaFromFrontmatter(
      { Class: 'Scene' }
    );

    expect(parsed).toBeNull();
  });
});
