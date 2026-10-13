import { describe, expect, it } from 'vitest';
import { appearanceTokens, contrast, nodeStyleClasses, PALETTE_PRESETS } from '@so7ob/contracts';
import { literalColors } from '../../../../tools/test/design-system';

describe('unified appearance contracts', () => {
  it('pairs every semantic surface with readable content for built-in and extreme palettes', () => {
    for (const primary of [...Object.values(PALETTE_PRESETS).map(p=>p.primaryLight), '#ffffff', '#000000', '#ffff00', '#ff00ff']) {
      for (const mode of ['light','dark'] as const) {
        const t = appearanceTokens({['appearance.primary'+(mode==='light'?'Light':'Dark')]:primary},mode);
        const pairs = [
          ['foreground','background'],['card-foreground','card'],['primary-foreground','primary'],
          ['primary-hover-foreground','primary-hover'],['emphasis-foreground','emphasis'],
          ['emphasis-muted','emphasis'],['emphasis-action-foreground','emphasis-action'],
          ['selection-foreground','selection'],
          ...['success','warning','info','danger','highlight'].flatMap(tone=>[[tone+'-foreground',tone+'-soft'],['on-'+tone,tone]]),
        ];
        for(const [fg,bg] of pairs) expect(contrast(t[fg],t[bg]),`${primary}/${mode}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('recolors identity surfaces and secondary highlights without recoloring danger', () => {
    for(const mode of ['light','dark'] as const){
      const suffix=mode==='light'?'Light':'Dark';
      const a=appearanceTokens({},mode),b=appearanceTokens({['appearance.primary'+suffix]:'#9d174d',['appearance.accent'+suffix]:'#0f766e'},mode);
      for(const key of ['primary','inverse','emphasis','sidebar-primary','highlight','chart-2'])expect(a[key],key).not.toBe(b[key]);
      for(const key of ['danger','warning','success'])expect(a[key],key).toBe(b[key]);
    }
  });
  it('keeps serialized CMS styles compatible and applies paired responsive surfaces', () => {
    const style={base:{background:'white' as const},tablet:{background:'navy' as const},desktop:{background:'white' as const}};
    const frozen=JSON.stringify(style);
    const classes=nodeStyleClasses(style);
    for(const expected of ['bg-card','surface-card','md:bg-emphasis','md:surface-emphasis','lg:bg-card','lg:surface-card'])expect(classes).toContain(expected);
    expect(JSON.stringify(style)).toBe(frozen);
    expect(classes).not.toContain('bg-white');
  });
  it('rejects raw colors across states, arbitrary utilities and inline styles', () => {
    for(const source of ['dark:hover:bg-sky-300','text-white/80','border-[#123456]','color: "#aabbcc"','background: rgb(12 34 56)','shadow-[0_1px_2px_rgba(0,0,0,.2)]'])expect(literalColors(source).length).toBeGreaterThan(0);
    expect(literalColors('bg-card text-card-foreground hover:bg-accent border-border var(--primary) #main-content')).toEqual([]);
  });
});
