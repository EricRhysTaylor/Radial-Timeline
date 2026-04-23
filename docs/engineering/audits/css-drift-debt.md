# CSS Drift Debt

Generated: 2026-04-23T02:45:28.473Z

Snapshot of every WARN-level drift hit at the time of baseline reset. Work through these to ratchet the baseline down. After fixing a batch, run `npm run css-drift -- --maintenance --update-baseline` to lock in the new lower ceiling.

> **Note on counts:** this report scans only the _source_ CSS files under `src/styles/`. The drift check also scans the bundled `styles.css` output (auto-generated from sources), so its totals are roughly 2× these. Fixing a hit here will remove both copies after the next `npm run build`.

Regenerate this report anytime with: `node scripts/css-drift-report.mjs`.

## Totals

- **Total WARN hits:** 786
- `spacing-px`: 406
- `raw-hex`: 26
- `shadow-rgba`: 9
- `rt-legacy`: 345

## How to work a rule

1. Open the section below for the rule.
2. Fix one file's hits at a time (files are grouped together in line order).
3. Rebuild and re-run `npm run css-drift -- --maintenance` to confirm the count dropped.
4. When a batch is done, run `npm run css-drift -- --maintenance --update-baseline`.

### Fix hints per rule

- `spacing-px` — replace literal `padding/margin/gap: Npx` with `var(--ert-pad-*)` / `var(--ert-gap-*)` tokens. See `src/styles/variables.css` for the token table.
- `raw-hex` — replace hex colors with theme vars (`var(--text-*)`, `var(--background-*)`) or ERT tokens. Hex is OK inside `--var:` declarations in `variables.css`.
- `shadow-rgba` — replace raw `rgba(...)` in `box-shadow` with `color-mix(in srgb, var(--...) N%, transparent)` or an ERT shadow token.
- `rt-legacy` — rename `.rt-*` selector to `.ert-*` (and update TS class usage) or relocate to `src/styles/legacy/rt-ui-legacy.css`. Note: `legacy/rt-ui-legacy.css` is itself scanned, so renaming beats relocating long-term.

## `spacing-px` (406)


### src/styles/rt-ui.css (232)

```
src/styles/rt-ui.css:422: gap: 6px
src/styles/rt-ui.css:561: gap: calc(var(--ert-gap-md) + 6px
src/styles/rt-ui.css:620: padding: 4px 10px
src/styles/rt-ui.css:668: gap: 14px
src/styles/rt-ui.css:680: padding: 4px 12px
src/styles/rt-ui.css:710: padding: 1px 4px
src/styles/rt-ui.css:727: padding: 2px
src/styles/rt-ui.css:814: gap: 4px
src/styles/rt-ui.css:968: margin: 8px 0 16px
src/styles/rt-ui.css:993: gap: calc(var(--ert-gap-sm) - 2px
src/styles/rt-ui.css:1067: gap: 2px
src/styles/rt-ui.css:1077: padding: 2px 8px
src/styles/rt-ui.css:1102: padding: 4px 10px
src/styles/rt-ui.css:1116: padding: 4px 10px
src/styles/rt-ui.css:1199: gap: 2px
src/styles/rt-ui.css:1331: gap: 4px
src/styles/rt-ui.css:1409: padding: var(--ert-gap-xs) 10px
src/styles/rt-ui.css:1426: padding: 4px 10px
src/styles/rt-ui.css:1438: padding: 3px
src/styles/rt-ui.css:1529: padding: 4px
src/styles/rt-ui.css:1794: padding: 16px 18px
src/styles/rt-ui.css:1894: padding: 4px 10px
src/styles/rt-ui.css:1935: gap: 4px
src/styles/rt-ui.css:1995: padding: 12px
src/styles/rt-ui.css:2301: gap: 16px
src/styles/rt-ui.css:2308: gap: 16px
src/styles/rt-ui.css:2323: gap: var(--ert-gap-xs, 8px
src/styles/rt-ui.css:2367: padding: var(--ert-row-pad, 16px
src/styles/rt-ui.css:2402: padding: var(--ert-row-pad, 16px
src/styles/rt-ui.css:2533: gap: 4px
src/styles/rt-ui.css:2535: padding: 4px
src/styles/rt-ui.css:2546: padding: 10px 16px
src/styles/rt-ui.css:2558: padding: 8px 14px
src/styles/rt-ui.css:2871: padding: 20px 16px
src/styles/rt-ui.css:2874: gap: 12px
src/styles/rt-ui.css:2926: gap: 4px
src/styles/rt-ui.css:2977: gap: 6px
src/styles/rt-ui.css:2986: gap: 8px
src/styles/rt-ui.css:3045: gap: 6px
src/styles/rt-ui.css:3092: padding: 1px 6px
src/styles/rt-ui.css:3105: gap: 14px
src/styles/rt-ui.css:3115: gap: 2px
src/styles/rt-ui.css:3232: gap: 8px
src/styles/rt-ui.css:3243: padding: 10px 14px
src/styles/rt-ui.css:3275: gap: 8px
src/styles/rt-ui.css:3281: gap: 4px
src/styles/rt-ui.css:3295: gap: 2px
src/styles/rt-ui.css:3353: padding: 4px 10px
src/styles/rt-ui.css:3367: padding: 2px 8px
src/styles/rt-ui.css:3395: padding: 6px 10px
src/styles/rt-ui.css:3432: padding: 4px
src/styles/rt-ui.css:3631: padding: calc(var(--ert-gap-xs) + 1px
src/styles/rt-ui.css:3717: gap: 2px
src/styles/rt-ui.css:3723: gap: 6px
src/styles/rt-ui.css:3802: gap: 4px
src/styles/rt-ui.css:3803: padding: 4px 12px
src/styles/rt-ui.css:3862: gap: 3px
src/styles/rt-ui.css:3925: gap: 6px
src/styles/rt-ui.css:3938: gap: 5px
src/styles/rt-ui.css:3980: padding: 12px 14px
src/styles/rt-ui.css:3989: padding: 16px 18px
src/styles/rt-ui.css:3998: gap: 12px
src/styles/rt-ui.css:4003: gap: 8px
src/styles/rt-ui.css:4024: gap: 3px
src/styles/rt-ui.css:4027: padding: 1px 7px
src/styles/rt-ui.css:4061: gap: 6px
src/styles/rt-ui.css:4062: padding: 8px 12px
src/styles/rt-ui.css:4121: gap: 2px
src/styles/rt-ui.css:4155: padding: 1px 6px
src/styles/rt-ui.css:4237: gap: 6px
src/styles/rt-ui.css:4242: gap: 2px
src/styles/rt-ui.css:4267: gap: 4px
src/styles/rt-ui.css:4315: gap: 2px
src/styles/rt-ui.css:4374: gap: 10px
src/styles/rt-ui.css:4376: padding: 10px 14px
src/styles/rt-ui.css:4408: padding: 4px
src/styles/rt-ui.css:4595: gap: 6px
src/styles/rt-ui.css:4752: gap: 2px
src/styles/rt-ui.css:4827: padding: var(--ert-gap-md) 16px
src/styles/rt-ui.css:4874: padding: 2px
src/styles/rt-ui.css:4886: padding: var(--ert-gap-sm) 16px 16px
src/styles/rt-ui.css:4892: padding: 16px
src/styles/rt-ui.css:4974: padding: 10px 14px
src/styles/rt-ui.css:4981: padding: var(--ert-gap-md) 14px
src/styles/rt-ui.css:5003: padding: var(--ert-gap-sm) 10px
src/styles/rt-ui.css:5024: padding: 2px
src/styles/rt-ui.css:5134: margin: var(--ert-gap-xs) 0 10px
src/styles/rt-ui.css:5216: gap: 16px
src/styles/rt-ui.css:5217: gap: 8px
src/styles/rt-ui.css:5276: gap: 16px
src/styles/rt-ui.css:5292: gap: 8px
src/styles/rt-ui.css:5303: gap: 8px
src/styles/rt-ui.css:5314: gap: var(--ert-gap, 16px
src/styles/rt-ui.css:5334: gap: var(--ert-gap-xs, 8px
src/styles/rt-ui.css:6143: gap: 8px
src/styles/rt-ui.css:6201: gap: 2px
src/styles/rt-ui.css:6221: gap: 6px
src/styles/rt-ui.css:6470: padding: 2px
src/styles/rt-ui.css:6492: padding: calc(var(--ert-gap-xs) + 2px
src/styles/rt-ui.css:6539: padding: 6px
src/styles/rt-ui.css:6564: padding: 2px 10px
src/styles/rt-ui.css:6881: gap: 6px
src/styles/rt-ui.css:6940: gap: 6px
src/styles/rt-ui.css:6952: gap: 8px
src/styles/rt-ui.css:6955: padding: 2px
src/styles/rt-ui.css:6965: padding: 0 14px
src/styles/rt-ui.css:6980: margin: 16px 0 20px
src/styles/rt-ui.css:6981: padding: 14px 18px
src/styles/rt-ui.css:7020: margin: 6px 0 6px 18px
src/styles/rt-ui.css:7025: margin: 0 0 4px
src/styles/rt-ui.css:7039: padding: 8px 10px
src/styles/rt-ui.css:7054: gap: 10px
src/styles/rt-ui.css:7068: gap: 8px
src/styles/rt-ui.css:7128: gap: 10px
src/styles/rt-ui.css:7129: padding: 8px 10px
src/styles/rt-ui.css:7184: padding: 6px 10px
src/styles/rt-ui.css:7200: gap: 6px
src/styles/rt-ui.css:7217: padding: 2px 6px
src/styles/rt-ui.css:7255: padding: 10px
src/styles/rt-ui.css:7285: gap: 10px
src/styles/rt-ui.css:7357: padding: 26px 50px 22px
src/styles/rt-ui.css:7411: padding: var(--ert-gap-xs) 10px
src/styles/rt-ui.css:7420: gap: 4px
src/styles/rt-ui.css:7427: gap: 6px
src/styles/rt-ui.css:7428: padding: 6px 12px
src/styles/rt-ui.css:7554: padding: 24px 30px 22px
src/styles/rt-ui.css:7560: gap: 10px
src/styles/rt-ui.css:7570: padding: 16px 18px
src/styles/rt-ui.css:7642: gap: 14px
src/styles/rt-ui.css:7655: gap: 12px
src/styles/rt-ui.css:7658: padding: 24px 24px 22px
src/styles/rt-ui.css:7767: gap: 8px
src/styles/rt-ui.css:7769: padding: 10px 0 4px
src/styles/rt-ui.css:7843: gap: 4px
src/styles/rt-ui.css:7916: gap: 10px
src/styles/rt-ui.css:7922: gap: 10px 16px
src/styles/rt-ui.css:7943: gap: 12px
src/styles/rt-ui.css:7951: gap: 8px
src/styles/rt-ui.css:7953: padding: 14px 10px
src/styles/rt-ui.css:7988: gap: 8px
src/styles/rt-ui.css:8008: padding: 8px
src/styles/rt-ui.css:8018: padding: 6px
src/styles/rt-ui.css:8025: padding: 14px 14px 12px
src/styles/rt-ui.css:8035: padding: 12px 12px 10px
src/styles/rt-ui.css:8042: margin: 0 auto 18px
src/styles/rt-ui.css:8118: gap: 7px
src/styles/rt-ui.css:8122: gap: 6px
src/styles/rt-ui.css:8149: gap: 16px
src/styles/rt-ui.css:8150: padding: 18px
src/styles/rt-ui.css:8156: gap: 18px
src/styles/rt-ui.css:8162: gap: 10px
src/styles/rt-ui.css:8169: gap: 10px 14px
src/styles/rt-ui.css:8206: gap: 6px
src/styles/rt-ui.css:8232: gap: 10px
src/styles/rt-ui.css:8237: gap: 10px
src/styles/rt-ui.css:8242: padding: 12px 10px
src/styles/rt-ui.css:8243: gap: 6px
src/styles/rt-ui.css:8291: gap: 6px
src/styles/rt-ui.css:8300: padding: 22px 24px 18px
src/styles/rt-ui.css:8335: gap: 6px
src/styles/rt-ui.css:8486: padding: 12px 12px 10px
src/styles/rt-ui.css:8530: margin: 1px
src/styles/rt-ui.css:8570: padding: 0 0 0 calc(var(--ert-gap-md) + 8px
src/styles/rt-ui.css:8628: padding: 6px 4px 4px
src/styles/rt-ui.css:8990: padding: var(--ert-gap-md) 14px
src/styles/rt-ui.css:9823: gap: 4px
src/styles/rt-ui.css:9833: gap: 4px
src/styles/rt-ui.css:9872: padding: 1px 4px
src/styles/rt-ui.css:9873: margin: -1px -4px
src/styles/rt-ui.css:9880: padding: 1px 8px
src/styles/rt-ui.css:9916: gap: 2px
src/styles/rt-ui.css:9957: padding: 12px 12px 10px
src/styles/rt-ui.css:9987: margin: 0 auto 14px
src/styles/rt-ui.css:10034: gap: 6px
src/styles/rt-ui.css:10064: gap: 4px
src/styles/rt-ui.css:10077: margin: -1px
src/styles/rt-ui.css:10085: gap: calc(var(--ert-gap-xs) + 2px
src/styles/rt-ui.css:10149: gap: 4px
src/styles/rt-ui.css:10195: gap: 2px
src/styles/rt-ui.css:10221: margin: 8px 0 6px
src/styles/rt-ui.css:10235: padding: 8px 10px
src/styles/rt-ui.css:10256: padding: 4px 6px
src/styles/rt-ui.css:10284: gap: 3px
src/styles/rt-ui.css:10322: padding: 6px 5px
src/styles/rt-ui.css:10397: gap: 4px
src/styles/rt-ui.css:10416: gap: 4px
src/styles/rt-ui.css:10443: gap: 2px
src/styles/rt-ui.css:10444: margin: 3px
src/styles/rt-ui.css:10548: padding: calc(var(--ert-pad-sm) + 2px
src/styles/rt-ui.css:10552: gap: 7px
src/styles/rt-ui.css:10681: gap: 4px
src/styles/rt-ui.css:10682: padding: 6px
src/styles/rt-ui.css:10763: gap: 4px
src/styles/rt-ui.css:10773: padding: 5px 8px
src/styles/rt-ui.css:10812: gap: 6px
src/styles/rt-ui.css:10819: padding: 1px 7px
src/styles/rt-ui.css:10851: padding: 6px
src/styles/rt-ui.css:10854: margin: 4px
src/styles/rt-ui.css:10863: margin: 6px
src/styles/rt-ui.css:10915: gap: 4px
src/styles/rt-ui.css:10926: gap: 8px 12px
src/styles/rt-ui.css:10963: gap: 2px
src/styles/rt-ui.css:10976: gap: 2px
src/styles/rt-ui.css:11023: gap: 1px
src/styles/rt-ui.css:11041: padding: 4px 8px
src/styles/rt-ui.css:11118: gap: 6px
src/styles/rt-ui.css:11147: gap: 8px
src/styles/rt-ui.css:11194: gap: 4px
src/styles/rt-ui.css:11244: gap: 8px
src/styles/rt-ui.css:11257: padding: 3px 8px
src/styles/rt-ui.css:11263: gap: 2px
src/styles/rt-ui.css:11406: gap: 6px
src/styles/rt-ui.css:11414: padding: 0 2px
src/styles/rt-ui.css:11424: gap: 6px
src/styles/rt-ui.css:11425: padding: 4px 10px 4px 6px
src/styles/rt-ui.css:11497: gap: 4px
src/styles/rt-ui.css:11499: padding: var(--ert-gap-xs) 16px
src/styles/rt-ui.css:11586: padding: 10px 36px
src/styles/rt-ui.css:11595: padding: var(--ert-gap-xs) 16px
src/styles/rt-ui.css:11669: gap: 8px
src/styles/rt-ui.css:11724: gap: 6px
src/styles/rt-ui.css:11788: padding: 2px
src/styles/rt-ui.css:11794: padding: 4px
src/styles/rt-ui.css:11869: gap: 6px
src/styles/rt-ui.css:11875: gap: 4px
src/styles/rt-ui.css:11876: padding: 4px 10px
src/styles/rt-ui.css:11952: padding: 4px 10px
src/styles/rt-ui.css:11976: padding: 8px 12px
src/styles/rt-ui.css:11980: margin: 4px
src/styles/rt-ui.css:11996: margin: 4px 0 0 16px
src/styles/rt-ui.css:12065: padding: 6px 10px
src/styles/rt-ui.css:12083: gap: 16px
```

### src/styles/modal.css (159)

```
src/styles/modal.css:27: padding: 6px 12px
src/styles/modal.css:43: gap: 6px
src/styles/modal.css:44: padding: 6px 12px
src/styles/modal.css:57: gap: 6px
src/styles/modal.css:58: padding: 6px 12px
src/styles/modal.css:95: gap: 8px
src/styles/modal.css:103: gap: 6px
src/styles/modal.css:131: gap: 8px
src/styles/modal.css:139: margin: 6px 0 16px
src/styles/modal.css:157: gap: 8px
src/styles/modal.css:168: gap: 6px
src/styles/modal.css:182: padding: 8px
src/styles/modal.css:199: padding: 10px
src/styles/modal.css:211: gap: 16px
src/styles/modal.css:220: gap: 10px
src/styles/modal.css:225: padding: 8px 14px
src/styles/modal.css:248: padding: 26px 30px 22px
src/styles/modal.css:284: padding: 12px 14px
src/styles/modal.css:294: padding: 8px
src/styles/modal.css:309: gap: 16px
src/styles/modal.css:321: gap: 16px
src/styles/modal.css:359: padding: 12px 16px
src/styles/modal.css:365: gap: 10px
src/styles/modal.css:371: padding: 12px
src/styles/modal.css:405: gap: 10px
src/styles/modal.css:445: gap: 10px
src/styles/modal.css:463: padding: 6px 4px 6px 4px
src/styles/modal.css:472: padding: 0 2px
src/styles/modal.css:478: gap: 16px
src/styles/modal.css:479: padding: 12px
src/styles/modal.css:510: margin: 0 6px
src/styles/modal.css:527: margin: 0 8px
src/styles/modal.css:542: gap: 10px
src/styles/modal.css:548: gap: 12px
src/styles/modal.css:549: padding: 10px 12px
src/styles/modal.css:558: gap: 2px
src/styles/modal.css:581: padding: 12px 14px
src/styles/modal.css:601: gap: 8px
src/styles/modal.css:694: padding: 8px
src/styles/modal.css:699: gap: 8px
src/styles/modal.css:704: gap: 18px
src/styles/modal.css:710: gap: 12px
src/styles/modal.css:717: padding: 10px 12px
src/styles/modal.css:723: gap: 4px
src/styles/modal.css:741: gap: 20px
src/styles/modal.css:754: gap: 12px
src/styles/modal.css:781: gap: 6px
src/styles/modal.css:794: padding: 12px 16px
src/styles/modal.css:797: gap: 6px
src/styles/modal.css:823: padding: 12px 14px
src/styles/modal.css:836: gap: 10px
src/styles/modal.css:841: padding: 16px 18px
src/styles/modal.css:842: gap: 12px
src/styles/modal.css:869: gap: 12px
src/styles/modal.css:876: padding: 12px 16px
src/styles/modal.css:879: gap: 4px
src/styles/modal.css:899: gap: 8px
src/styles/modal.css:904: padding: 8px 12px
src/styles/modal.css:912: padding: 10px 12px
src/styles/modal.css:924: padding: 0 2px
src/styles/modal.css:951: margin: 20px
src/styles/modal.css:990: gap: 10px
src/styles/modal.css:999: margin: 6px 0 20px
src/styles/modal.css:1013: margin: 0 0 10px
src/styles/modal.css:1019: padding: 12px
src/styles/modal.css:1025: gap: 6px
src/styles/modal.css:1032: padding: 12px
src/styles/modal.css:1044: gap: 10px
src/styles/modal.css:1049: padding: 10px 12px
src/styles/modal.css:1061: padding: 10px 12px
src/styles/modal.css:1073: margin: 20px
src/styles/modal.css:1111: padding: 10px 12px
src/styles/modal.css:1118: gap: 6px
src/styles/modal.css:1144: padding: 10px
src/styles/modal.css:1160: padding: 15px
src/styles/modal.css:1168: padding: 10px
src/styles/modal.css:1177: gap: 10px
src/styles/modal.css:1190: padding: 26px 50px 22px
src/styles/modal.css:1194: gap: 18px
src/styles/modal.css:1208: gap: 16px
src/styles/modal.css:1213: padding: 12px 16px
src/styles/modal.css:1225: gap: 6px
src/styles/modal.css:1226: padding: 16px 20px 12px
src/styles/modal.css:1232: gap: 6px
src/styles/modal.css:1236: padding: 6px 12px
src/styles/modal.css:1262: gap: 8px
src/styles/modal.css:1272: gap: 14px
src/styles/modal.css:1276: padding: 14px 16px
src/styles/modal.css:1285: gap: 6px
src/styles/modal.css:1286: margin: 0 0 10px
src/styles/modal.css:1300: margin: 6px
src/styles/modal.css:1343: padding: 10px
src/styles/modal.css:1359: gap: 10px
src/styles/modal.css:1379: gap: 6px
src/styles/modal.css:1380: padding: 6px 10px
src/styles/modal.css:1401: gap: 10px
src/styles/modal.css:1405: padding: 10px 12px
src/styles/modal.css:1412: margin: 0 0 6px
src/styles/modal.css:1428: gap: 10px
src/styles/modal.css:1441: margin: 0 0 6px
src/styles/modal.css:1453: gap: 6px
src/styles/modal.css:1459: gap: 6px
src/styles/modal.css:1476: padding: 16px 18px
src/styles/modal.css:1479: gap: 10px
src/styles/modal.css:1503: gap: 8px
src/styles/modal.css:1520: margin: 3px
src/styles/modal.css:1528: padding: 2px 6px
src/styles/modal.css:1554: gap: 8px
src/styles/modal.css:1555: margin: 4px
src/styles/modal.css:1582: padding: 8px
src/styles/modal.css:1597: gap: 20px
src/styles/modal.css:1598: margin: 15px
src/styles/modal.css:1604: gap: 8px
src/styles/modal.css:1610: gap: 8px
src/styles/modal.css:1644: gap: 6px
src/styles/modal.css:1645: padding: 6px 12px
src/styles/modal.css:1817: gap: 10px
src/styles/modal.css:1916: gap: 12px
src/styles/modal.css:1921: gap: 12px
src/styles/modal.css:2070: padding: 8px 10px
src/styles/modal.css:2140: gap: 10px
src/styles/modal.css:2141: padding: 12px 16px
src/styles/modal.css:2159: padding: 16px 20px
src/styles/modal.css:2166: margin: 0 0 4px
src/styles/modal.css:2174: margin: 0 0 14px
src/styles/modal.css:2183: gap: 8px
src/styles/modal.css:2189: gap: 6px
src/styles/modal.css:2190: padding: 6px 10px
src/styles/modal.css:2227: gap: 8px
src/styles/modal.css:2233: padding: 8px 16px
src/styles/modal.css:2264: gap: 8px
src/styles/modal.css:2272: gap: 12px
src/styles/modal.css:2273: margin: 16px
src/styles/modal.css:2283: padding: 10px
src/styles/modal.css:2331: gap: 2px
src/styles/modal.css:2360: gap: 8px
src/styles/modal.css:2364: padding: 10px 12px
src/styles/modal.css:2385: padding: 40px
src/styles/modal.css:2392: padding: 40px
src/styles/modal.css:2401: padding: 10px
src/styles/modal.css:2417: gap: 8px
src/styles/modal.css:2424: gap: 6px
src/styles/modal.css:2425: padding: 8px 14px
src/styles/modal.css:2452: padding: 12px
src/styles/modal.css:2456: margin: 0 0 12px
src/styles/modal.css:2469: margin: 0 0 10px
src/styles/modal.css:2477: gap: 8px
src/styles/modal.css:2483: margin: 0 0 12px
src/styles/modal.css:2494: gap: 10px
src/styles/modal.css:2500: padding: 18px 20px
src/styles/modal.css:2504: gap: 16px
src/styles/modal.css:2510: gap: 6px
src/styles/modal.css:2518: gap: 16px
src/styles/modal.css:2526: gap: 14px
src/styles/modal.css:2537: gap: 12px
src/styles/modal.css:2544: gap: 4px
src/styles/modal.css:2597: margin: 4px
src/styles/modal.css:2602: padding: 12px 14px
src/styles/modal.css:2624: gap: 10px
```

### src/styles/legacy/rt-ui-legacy.css (15)

```
src/styles/legacy/rt-ui-legacy.css:146: gap: 6px
src/styles/legacy/rt-ui-legacy.css:190: padding: 12px
src/styles/legacy/rt-ui-legacy.css:266: gap: 4px
src/styles/legacy/rt-ui-legacy.css:286: padding: 10px 12px
src/styles/legacy/rt-ui-legacy.css:291: gap: 4px
src/styles/legacy/rt-ui-legacy.css:314: gap: 8px
src/styles/legacy/rt-ui-legacy.css:349: gap: 8px
src/styles/legacy/rt-ui-legacy.css:351: padding: 8px
src/styles/legacy/rt-ui-legacy.css:386: padding: 12px 0 0 28px
src/styles/legacy/rt-ui-legacy.css:395: padding: 6px
src/styles/legacy/rt-ui-legacy.css:414: margin: 12px 0 8px
src/styles/legacy/rt-ui-legacy.css:434: gap: 8px
src/styles/legacy/rt-ui-legacy.css:442: gap: 12px
src/styles/legacy/rt-ui-legacy.css:445: padding: 8px 12px
src/styles/legacy/rt-ui-legacy.css:472: gap: 8px
```

## `raw-hex` (26)


### src/styles/modal.css (14)

```
src/styles/modal.css:106: color: var(--rt-pro-color, #d946ef);
src/styles/modal.css:118: stroke: var(--rt-pro-color, #d946ef);
src/styles/modal.css:1317: background: linear-gradient(90deg, #ff9900, #ff5e00);
src/styles/modal.css:1324: background: linear-gradient(90deg, #31d47b, #0fb069);
src/styles/modal.css:1329: background: linear-gradient(90deg, #ff5f6d, #d7263d);
src/styles/modal.css:1653: color: var(--rt-social-color, #ffd41d);
src/styles/modal.css:1665: stroke: var(--rt-social-color, #ffd41d);
src/styles/modal.css:2207: accent-color: var(--rt-social-color, #ffd41d);
src/styles/modal.css:2253: border-color: var(--rt-social-color, #ffd41d);
src/styles/modal.css:2254: color: var(--rt-social-color, #ffd41d);
src/styles/modal.css:2305: border-color: var(--rt-social-color, #ffd41d);
src/styles/modal.css:2366: border-left: 3px solid var(--rt-social-color, #ffd41d);
src/styles/modal.css:2377: color: var(--rt-social-color, #ffd41d);
src/styles/modal.css:2443: color: var(--rt-social-color, #ffd41d);
```

### src/styles/rt-ui.css (12)

```
src/styles/rt-ui.css:463: radial-gradient(circle at 90% 8%, color-mix(in srgb, #8b5cf6 28%, transparent) 0%, transparent 52%),
src/styles/rt-ui.css:464: linear-gradient(135deg, #050507 0%, color-mix(in srgb, var(--ert-pro-accent-color) 40%, #050507) 52%, color-mix(in srgb, #8b5cf6 30%, #050507) 100%);
src/styles/rt-ui.css:510: background: #0a0a0a;
src/styles/rt-ui.css:1911: background: var(--ert-flow-color, #808080);
src/styles/rt-ui.css:1916: background: var(--ert-flow-color, #808080);
src/styles/rt-ui.css:1943: background: var(--ert-flow-color, #808080);
src/styles/rt-ui.css:2585: color: #fff;
src/styles/rt-ui.css:2592: color: #fff;
src/styles/rt-ui.css:2969: color: color-mix(in srgb, var(--text-success) 90%, #eaffef 10%);
src/styles/rt-ui.css:10909: color: var(--text-warning, var(--color-orange, #f5a97a));
src/styles/rt-ui.css:10956: color: var(--text-warning, var(--color-orange, #f5a97a));
src/styles/rt-ui.css:11079: color: var(--text-warning, var(--color-orange, #f5a97a));
```

## `shadow-rgba` (9)


### src/styles/modal.css (4)

```
src/styles/modal.css:1320: box-shadow: 0 0 10px rgba(
src/styles/modal.css:1325: box-shadow: 0 0 10px rgba(
src/styles/modal.css:1330: box-shadow: 0 0 12px rgba(
src/styles/modal.css:2306: box-shadow: 0 0 12px rgba(
```

### src/styles/rt-ui.css (3)

```
src/styles/rt-ui.css:2588: box-shadow: 0 0 12px rgba(
src/styles/rt-ui.css:8029: box-shadow: inset 0 1px 0 rgba(
src/styles/rt-ui.css:9961: box-shadow: inset 0 1px 0 rgba(
```

### src/styles/settings.css (1)

```
src/styles/settings.css:3: box-shadow: 0 2px 8px rgba(
```

### src/styles/legacy/rt-ui-legacy.css (1)

```
src/styles/legacy/rt-ui-legacy.css:582: box-shadow:
    0 16px 36px rgba(
```

## `rt-legacy` (345)


### src/styles/modal.css (295)

```
src/styles/modal.css:1: /* Template Dialog - Simple modals for save/delete/confirm actions */
.rt-template-dialog {
src/styles/modal.css:2: --ert-group-gap: var(--ert-gap-sm);
}

.rt-template-dialog .rt-glass-card.rt-sub-card {
src/styles/modal.css:6: padding: var(--ert-pad-md);
  gap: var(--ert-gap-sm);
}

.rt-template-dialog .rt-manuscript-group-setting {
src/styles/modal.css:11: padding: 0;
}

.rt-template-dialog .rt-sub-card-note {
src/styles/modal.css:15: margin-top: 0;
  padding: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

/* Consolidated badge pattern - all badges with identical styling grouped together */
.rt-scene-analysis-badge,
.rt-subplot-picker-badge {
src/styles/modal.css:25: display: inline-block;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}

/* Consolidated meta-item base pattern */
.rt-pulse-hero-meta-item {
src/styles/modal.css:40: display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
}

/* Warning variant - inherits base + warning colors */
.rt-pulse-hero-meta-item-warning {
src/styles/modal.css:74: margin-right: auto;
}

/* ert-modal-actions base consolidated in rt-ui.css */

.rt-pulse-modal .ert-modal-actions {
src/styles/modal.css:115: width: 14px;
  height: 14px;
  stroke: var(--rt-pro-color, #d946ef);
  stroke-width: 2;
  fill: none;
}

/* Rename Subplot Modal sizing */
.rt-rename-subplot-modal.modal {
src/styles/modal.css:124: width: min(640px, 92vw);
  max-height: 92vh;
}

.rt-ai-context-actions {
src/styles/modal.css:129: display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 0;
}

/* AI Context Template Modal Styles */
.rt-ai-context-info {
src/styles/modal.css:138: margin: 6px 0 16px 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.rt-ai-context-selector-section {
src/styles/modal.css:145: margin-bottom: 16px;
}

.rt-ai-context-label {
src/styles/modal.css:149: font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-normal);
}

.rt-ai-context-selector-row {
src/styles/modal.css:155: display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.rt-ai-context-selector-row .dropdown {
src/styles/modal.css:161: flex: 1;
  min-width: 200px;
}

.rt-ai-context-button-row {
src/styles/modal.css:166: display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.rt-ai-context-editor-section {
src/styles/modal.css:172: margin-bottom: 16px;
}

.rt-ai-context-textarea {
src/styles/modal.css:176: width: 100%;
  min-height: 150px;
  resize: vertical;
  font-family: var(--font-monospace);
  font-size: 13px;
  padding: 8px;
}

.rt-ai-context-textarea:disabled {
src/styles/modal.css:185: opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--background-modifier-border);
}

.rt-ai-context-preview-section {
src/styles/modal.css:191: margin-bottom: 16px;
}

.rt-ai-context-preview {
src/styles/modal.css:195: background-color: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  padding: 10px;
  font-family: var(--font-monospace);
  font-size: 12px;
  color: var(--text-muted);
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}

.rt-scene-analysis-modal {
src/styles/modal.css:208: display: flex;
  flex-direction: column;
  gap: 16px;
}

/* rt-scene-analysis-badge - consolidated above with ert-modal-badge */

.rt-scene-analysis-meta {
src/styles/modal.css:216: margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.rt-scene-analysis-meta-item {
src/styles/modal.css:223: display: inline-block;
  padding: 8px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.rt-scene-analysis-modal .rt-glass-card {
src/styles/modal.css:234: background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow: none;
}

.rt-pulse-modal-shell.modal {
src/styles/modal.css:241: width: min(760px, 92vw);
  max-height: 92vh;
}

.rt-pulse-modal {
src/styles/modal.css:246: position: relative;
  padding: 26px 30px 22px;
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(16, 16, 21, 0.95), rgba(36, 28, 24, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: none;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(92vh - 40px);
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  contain: paint;
}

.rt-pulse-modal.rt-gossamer-score-modal {
src/styles/modal.css:263: padding: 0;
}

.rt-pulse-modal::before {
src/styles/modal.css:267: content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 15% 10%, rgba(255, 255, 255, 0.08), transparent 52%),
    radial-gradient(circle at 85% 5%, rgba(247, 176, 92, 0.1), transparent 42%);
  pointer-events: none;
}

.rt-pulse-modal>* {
src/styles/modal.css:276: position: relative;
  z-index: 1;
}

/* rt-glass-card base consolidated in base.css */

.rt-gossamer-score-modal .rt-glass-card {
src/styles/modal.css:283: padding: 12px 14px;
}

.rt-subplot-management-input-label {
src/styles/modal.css:287: margin-bottom: 8px;
  color: var(--text-muted);
}

.rt-subplot-management-input {
src/styles/modal.css:292: width: 100%;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
}

.ert-modal-shell.modal:has(.rt-manage-subplots-modal) {
src/styles/modal.css:301: width: min(700px, 90vw);
  max-height: calc(92vh - 100px);
}

.rt-manage-subplots-modal {
src/styles/modal.css:306: display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: calc(80vh - 100px);
  max-height: calc(90vh - 100px);
}

/* Height-safe shells for tall modals */
.rt-manuscript-modal,
.rt-gossamer-processing-modal,
.rt-book-designer-modal {
src/styles/modal.css:318: display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 92vh;
  min-height: 0;
}

.rt-manuscript-modal {
src/styles/modal.css:326: overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  contain: paint;
}

.rt-gossamer-processing-modal {
src/styles/modal.css:334: overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  contain: paint;
}

.rt-book-designer-modal .rt-card-stack {
src/styles/modal.css:341: flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  contain: paint;
}

/* Planetary Time Modal */
.rt-planetary-modal-result {
src/styles/modal.css:353: margin-top: 0;
  font-weight: 700;
  font-size: 1.2rem;
  color: var(--text-normal);
  background: rgba(255, 255, 255, 0.04);
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.rt-planetary-modal .setting-item {
src/styles/modal.css:368: border-top: none;
  border-bottom: none;
  padding: 12px 0;
}

.rt-planetary-modal .setting-item + .setting-item {
src/styles/modal.css:374: border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* Match date and time inputs to the same theme style */
.rt-planetary-modal input[type="date"],
.rt-planetary-modal input[type="time"] {
src/styles/modal.css:380: background-color: var(--background-primary-alt);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--input-radius);
  padding: var(--size-2-3) var(--size-4-3);
  font-size: var(--font-ui-medium);
  color-scheme: dark;
}

.rt-planetary-modal input[type="date"]::-webkit-calendar-picker-indicator,
.rt-planetary-modal input[type="time"]::-webkit-calendar-picker-indicator {
src/styles/modal.css:391: filter: invert(0.7) sepia(0.3) hue-rotate(10deg);
  opacity: 0.7;
}

.rt-planetary-modal .ert-modal-header {
src/styles/modal.css:396: padding-bottom: 12px;
  margin-bottom: 0;
  border-bottom: none;
}

.rt-planetary-modal-result-row {
src/styles/modal.css:402: display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.rt-planetary-modal-result-row .rt-planetary-modal-result {
src/styles/modal.css:409: flex: 1;
  margin-top: 0;
}

.rt-planetary-result-icon {
src/styles/modal.css:414: display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.rt-planetary-result-icon svg {
src/styles/modal.css:421: width: 18px;
  height: 18px;
  opacity: 0.85;
  transform: translateY(0);
}

.rt-planetary-result-text {
src/styles/modal.css:428: flex: 1;
  text-align: center;
}

/* rt-drag-confirm-modal width controlled via inline styles in DragConfirmModal.ts */

.rt-drag-confirm-list {
src/styles/modal.css:435: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-sm);
  margin: 0;
}

.rt-drag-confirm-section {
src/styles/modal.css:442: display: flex;
  flex-direction: column;
  gap: 10px;
}

.rt-drag-confirm-history-frame {
src/styles/modal.css:448: background: none;
  border: none;
  border-radius: 0;
  padding: 0;
}

.rt-drag-confirm-history-list {
src/styles/modal.css:455: display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 340px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 4px 6px 4px;
}

.rt-drag-confirm-section-title {
src/styles/modal.css:466: font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 0 2px;
}

.rt-drag-confirm-row {
src/styles/modal.css:475: display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background-color: var(--background-secondary);
  border-radius: 8px;
  border: 1px solid var(--background-modifier-border);
}

.rt-drag-confirm-row-icon {
src/styles/modal.css:485: display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
  color: var(--rt-confirm-accent, var(--text-normal));
}

.rt-drag-confirm-row-icon svg {
src/styles/modal.css:493: width: 24px;
  height: 24px;
}

.rt-drag-confirm-row-text {
src/styles/modal.css:498: font-size: 1.05em;
  line-height: 1.4;
}

/* Default inline arrow — used by the "Recent moves" rows. Small and muted. */
.rt-drag-confirm-inline-icon {
src/styles/modal.css:504: display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin: 0 6px;
  vertical-align: text-bottom;
  color: var(--text-muted);
  opacity: 0.86;
}

.rt-drag-confirm-inline-icon svg {
src/styles/modal.css:516: width: 14px;
  height: 14px;
  display: block;
}

/* Current move summary row — larger, thicker, tinted with the subplot accent.
 * Scoped by the row-text parent so history rows keep the small treatment. */
.rt-drag-confirm-row-text .rt-drag-confirm-inline-icon {
src/styles/modal.css:524: width: 20px;
  height: 20px;
  margin: 0 8px;
  vertical-align: -0.28em;
  color: var(--rt-confirm-accent, var(--text-muted));
  opacity: 1;
}

.rt-drag-confirm-row-text .rt-drag-confirm-inline-icon svg {
src/styles/modal.css:533: width: 20px;
  height: 20px;
  stroke-width: 2.5;
}

.rt-drag-confirm-impact-grid {
src/styles/modal.css:539: display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.rt-drag-confirm-impact-card {
src/styles/modal.css:545: display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  background-color: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
}

.rt-drag-confirm-impact-text {
src/styles/modal.css:555: display: flex;
  flex-direction: column;
  gap: 2px;
}

.rt-drag-confirm-impact-label {
src/styles/modal.css:561: font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.rt-drag-confirm-impact-value {
src/styles/modal.css:569: font-size: 0.96rem;
  line-height: 1.35;
  color: var(--text-normal);
}

.rt-drag-confirm-history-item {
src/styles/modal.css:575: display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  box-sizing: border-box;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
}

.rt-drag-confirm-history-item:hover {
src/styles/modal.css:589: border-color: rgba(255, 255, 255, 0.18);
}

.rt-drag-confirm-history-item:focus-visible {
src/styles/modal.css:593: outline: none;
  border-color: rgba(255, 255, 255, 0.18);
}

.rt-drag-confirm-history-header {
src/styles/modal.css:598: display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.rt-drag-confirm-history-icon {
src/styles/modal.css:605: flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  opacity: 0.82;
  margin-top: 2px;
}

.rt-drag-confirm-history-icon svg {
src/styles/modal.css:614: width: 14px;
  height: 14px;
  display: block;
}

.rt-drag-confirm-history-summary {
src/styles/modal.css:620: font-size: 0.88em;
  line-height: 1.35;
  color: var(--text-normal);
  min-width: 0;
}

.rt-drag-confirm-history-meta {
src/styles/modal.css:627: font-size: 0.78em;
  line-height: 1.35;
  color: var(--text-muted);
  margin-top: 2px;
  font-weight: 600;
}

.rt-drag-confirm-row.is-status-row {
src/styles/modal.css:635: border-style: dashed;
}

.rt-drag-confirm-row.is-status-row.is-hidden {
src/styles/modal.css:639: display: none;
}

.rt-drag-confirm-row.is-status-row.is-live {
src/styles/modal.css:643: border-color: color-mix(in srgb, var(--rt-confirm-accent, var(--interactive-accent)) 42%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--rt-confirm-accent, var(--interactive-accent)) 10%, var(--background-secondary));
}

.rt-drag-confirm-row.is-status-row.is-complete {
src/styles/modal.css:648: border-color: color-mix(in srgb, var(--text-success) 38%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--text-success) 10%, var(--background-secondary));
}

.rt-drag-confirm-row.is-status-row.is-error {
src/styles/modal.css:658: font-size: 0.98em;
  color: var(--text-normal);
}

.rt-drag-confirm-modal .ert-modal-actions .is-hidden-action {
src/styles/modal.css:663: display: none;
}

.rt-drag-confirm-modal .modal-close-button.is-locked-close {
src/styles/modal.css:667: visibility: hidden;
  pointer-events: none;
}

.ert-ui.ert-scope--modal .rt-drag-confirm-modal .ert-modal-badge {
src/styles/modal.css:672: color: var(--rt-confirm-accent, var(--text-muted));
  border-color: color-mix(in srgb, var(--rt-confirm-accent, var(--interactive-accent)) 45%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--rt-confirm-accent, var(--interactive-accent)) 12%, var(--background-secondary));
}

.ert-ui.ert-scope--modal .rt-drag-confirm-modal .ert-modal-title {
src/styles/modal.css:678: background: linear-gradient(90deg,
      var(--rt-confirm-accent, var(--text-normal)),
      color-mix(in srgb, var(--rt-confirm-accent, var(--text-normal)) 66%, var(--text-faint) 34%));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ert-ui.ert-scope--modal .rt-drag-confirm-modal .rt-mod-cta {
src/styles/modal.css:687: background-color: var(--rt-confirm-accent, var(--interactive-accent));
}

.rt-text-input-modal-field {
src/styles/modal.css:691: width: 100%;
  margin-bottom: 12px;
  padding: 8px;
}

.rt-text-input-modal-buttons {
src/styles/modal.css:697: display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.rt-subplot-picker-modal {
src/styles/modal.css:703: gap: 18px;
}

.rt-subplot-picker-hero-stats {
src/styles/modal.css:707: display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 16px;
  margin-bottom: 20px;
  width: 100%;
}

.rt-subplot-picker-hero-stat {
src/styles/modal.css:716: padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rt-subplot-picker-hero-label {
src/styles/modal.css:726: font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.rt-subplot-picker-hero-value {
src/styles/modal.css:733: font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-subplot-picker-grid {
src/styles/modal.css:745: .rt-subplot-picker-grid {
src/styles/modal.css:746: grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.rt-subplot-picker-card {
src/styles/modal.css:751: display: flex;
  flex-direction: column;
  gap: 12px;
}

.rt-subplot-picker-info {
src/styles/modal.css:757: margin: 0;
  color: var(--text-normal);
  font-size: 0.95rem;
  line-height: 1.5;
}

.rt-subplot-picker-hint {
src/styles/modal.css:764: margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.rt-subplot-picker-label {
src/styles/modal.css:770: display: block;
  margin-bottom: 6px;
  color: var(--text-normal);
  font-weight: 600;
  font-size: 0.85rem;
}

.rt-subplot-picker-select {
src/styles/modal.css:778: display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.rt-subplot-picker-dropdown .dropdown {
src/styles/modal.css:785: width: 100%;
  font-size: 0.95rem;
}

.rt-subplot-picker-stats {
src/styles/modal.css:790: border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rt-subplot-picker-stats-line {
src/styles/modal.css:800: font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-subplot-picker-summary {
src/styles/modal.css:806: margin-top: 10px;
  font-size: 0.78rem;
  color: var(--text-muted);
}

/* rt-subplot-picker-badge - consolidated at top with ert-modal-badge */

/* AI Prompt & Context advanced panel — wrap long lines instead of horizontal scroll. */
.ert-ai-advanced-pre {
src/styles/modal.css:815: white-space: pre-wrap;
  word-break: break-word;
  overflow-x: hidden;
}

/* Gossamer / Pulse modal overrides */
.rt-gossamer-score-modal .rt-pulse-progress-hero {
src/styles/modal.css:822: padding: 12px 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: none;
  border-radius: 12px;
  margin-bottom: 12px;
}

.rt-gossamer-score-modal .rt-pulse-progress-hero::after {
src/styles/modal.css:831: display: none;
}

.rt-gossamer-score-modal .rt-pulse-progress-body {
src/styles/modal.css:835: gap: 10px;
  margin-top: 12px;
}

.rt-gossamer-score-modal .rt-pulse-progress-card {
src/styles/modal.css:840: padding: 16px 18px;
  gap: 12px;
}

.rt-gossamer-proc-modal {
src/styles/modal.css:845: padding: 0;
}

.rt-gossamer-proc-modal .rt-pulse-progress-body {
src/styles/modal.css:849: margin-top: 8px;
  overflow-y: visible;
  width: 100%;
}

.rt-gossamer-proc-info-section,
.rt-gossamer-proc-status-section {
src/styles/modal.css:856: margin-bottom: 20px;
}

/* rt-gossamer-proc-section-title replaced by rt-section-title in base.css */

.rt-gossamer-proc-manuscript-info {
src/styles/modal.css:862: margin-top: 12px;
}

.rt-gossamer-proc-stats {
src/styles/modal.css:866: display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.rt-gossamer-proc-stat-item {
src/styles/modal.css:872: background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rt-gossamer-proc-stat-label {
src/styles/modal.css:882: font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.rt-gossamer-proc-stat-value {
src/styles/modal.css:889: font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-gossamer-proc-stat-row {
src/styles/modal.css:895: font-size: 13px;
  color: var(--text-normal);
  display: flex;
  gap: 8px;
}

.rt-gossamer-proc-iterative-note {
src/styles/modal.css:902: margin-top: 8px;
  padding: 8px 12px;
  background-color: var(--background-secondary);
  border-radius: 4px;
  border-left: 3px solid var(--interactive-accent);
  font-weight: 500;
}

.rt-gossamer-proc-status-text {
src/styles/modal.css:911: padding: 10px 12px;
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-normal);
  min-height: 40px;
  display: flex;
  align-items: center;
}

.rt-gossamer-proc-api-status {
src/styles/modal.css:922: margin-top: 8px;
  padding: 0 2px;
  font-size: 13px;
  color: var(--text-muted);
  min-height: 0;
  display: flex;
  align-items: center;
}

.rt-gossamer-proc-error-header {
src/styles/modal.css:932: font-weight: 600;
  color: var(--text-error);
  margin-bottom: 8px;
}

.rt-gossamer-proc-error-item {
src/styles/modal.css:938: font-size: 0.85rem;
  color: var(--text-error);
  margin-bottom: 4px;
}

.rt-gossamer-proc-beat-system-info {
src/styles/modal.css:944: font-weight: 600;
  color: var(--text-normal);
  margin-bottom: 12px;
}

.rt-gossamer-progress-container {
src/styles/modal.css:950: margin: 20px 0;
}

.rt-gossamer-progress-bg {
src/styles/modal.css:954: width: 100%;
  height: 24px;
  background-color: var(--background-secondary);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.rt-gossamer-progress-bar {
src/styles/modal.css:963: height: 100%;
  background: linear-gradient(90deg, var(--interactive-accent), var(--interactive-accent-hover));
  border-radius: 12px;
  transition: width 0.5s ease;
  position: relative;
  width: var(--progress-width, 0%);
}

.rt-gossamer-progress-bar::after {
src/styles/modal.css:972: content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2) 50%, transparent);
  animation: progress-shine 2s infinite;
}

.rt-gossamer-progress-bar.rt-progress-complete::after {
src/styles/modal.css:983: animation: none;
}

.rt-gossamer-actions {
src/styles/modal.css:987: margin-top: 20px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.rt-beat-placement-modal {
src/styles/modal.css:994: padding: 0;
}

.rt-beat-placement-modal .rt-beats-info {
src/styles/modal.css:998: margin: 6px 0 20px 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.rt-beat-placement-modal .rt-manuscript-section {
src/styles/modal.css:1005: margin-bottom: 20px;
}

.rt-beat-placement-modal .rt-manuscript-section h3 {
src/styles/modal.css:1009: font-size: 14px;
  font-weight: 600;
  color: var(--text-normal);
  margin: 0 0 10px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.rt-beat-placement-modal .rt-manuscript-details {
src/styles/modal.css:1018: padding: 12px;
  background-color: var(--background-secondary);
  border-radius: 6px;
  border-left: 4px solid var(--interactive-accent);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-normal);
}

.rt-beat-placement-modal .rt-api-warning {
src/styles/modal.css:1030: margin-bottom: 20px;
  padding: 12px;
  background-color: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-normal);
  line-height: 1.5;
}

.rt-beat-placement-modal .ert-modal-buttons {
src/styles/modal.css:1041: margin-top: 20px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.rt-beat-placement-modal .rt-status-text {
src/styles/modal.css:1048: padding: 10px 12px;
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-normal);
  min-height: 40px;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.rt-beat-placement-modal .rt-api-status {
src/styles/modal.css:1060: padding: 10px 12px;
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-muted);
  min-height: 40px;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.rt-beat-placement-modal .rt-beat-placement-progress-container {
src/styles/modal.css:1072: margin: 20px 0;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bg {
src/styles/modal.css:1076: width: 100%;
  height: 24px;
  background-color: var(--background-secondary);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar {
src/styles/modal.css:1085: height: 100%;
  background: linear-gradient(90deg, var(--interactive-accent), var(--interactive-accent-hover));
  border-radius: 12px;
  transition: width 0.5s ease;
  position: relative;
  width: var(--progress-width, 0%);
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar::after {
src/styles/modal.css:1094: content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2) 50%, transparent);
  animation: progress-shine 2s infinite;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar.rt-progress-complete::after {
src/styles/modal.css:1105: animation: none;
}

.rt-beat-placement-modal .rt-error-list {
src/styles/modal.css:1109: margin-top: 12px;
  padding: 10px 12px;
  background-color: rgba(255, 92, 92, 0.1);
  border: 1px solid rgba(255, 92, 92, 0.2);
  border-radius: 8px;
  color: var(--text-normal);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rt-beat-placement-modal .rt-error-item {
src/styles/modal.css:1121: margin: 0;
  line-height: 1.4;
}

.rt-beat-placement-modal .rt-error-item:last-child {
src/styles/modal.css:1126: margin-bottom: 0;
}

.rt-gossamer-assembly-modal .rt-gossamer-title {
src/styles/modal.css:1130: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress {
src/styles/modal.css:1134: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress-title {
src/styles/modal.css:1138: margin-bottom: 10px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress-status {
src/styles/modal.css:1142: font-family: var(--font-monospace);
  padding: 10px;
  background-color: var(--background-secondary);
  border-radius: 4px;
  min-height: 60px;
}

.rt-gossamer-assembly-modal .rt-gossamer-summary {
src/styles/modal.css:1150: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-summary-title {
src/styles/modal.css:1154: margin-bottom: 15px;
}

.rt-gossamer-assembly-modal .rt-gossamer-summary-content {
src/styles/modal.css:1158: font-family: var(--font-monospace);
  padding: 15px;
  background-color: var(--background-secondary);
  border-radius: 4px;
  line-height: 1.8;
}

.rt-gossamer-assembly-modal .rt-gossamer-warning {
src/styles/modal.css:1166: margin-top: 15px;
  padding: 10px;
  background-color: var(--background-modifier-error);
  border-radius: 4px;
  color: var(--text-on-accent);
}

.rt-gossamer-assembly-modal .rt-gossamer-buttons {
src/styles/modal.css:1174: margin-top: 20px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.rt-gossamer-assembly-modal .rt-gossamer-buttons.rt-hidden {
src/styles/modal.css:1181: display: none;
}

.rt-gossamer-assembly-modal .rt-hidden {
src/styles/modal.css:1185: display: none;
}

.rt-gossamer-score-modal {
src/styles/modal.css:1189: padding: 26px 50px 22px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-height: 92vh;
  min-height: 0;
  overflow: hidden;
}

/* Scrollable container for beat entries */
.rt-gossamer-score-modal .rt-container {
src/styles/modal.css:1201: flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rt-gossamer-warning {
src/styles/modal.css:1211: margin: 0;
  padding: 12px 16px;
  color: var(--text-normal);
  background: rgba(255, 136, 56, 0.14);
  border-radius: 12px;
  border: 1px solid rgba(255, 136, 56, 0.3);
  font-size: 0.9rem;
  line-height: 1.5;
}

.rt-gossamer-simple-header {
src/styles/modal.css:1222: display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 20px 12px;
}

.rt-gossamer-simple-badge {
src/styles/modal.css:1229: display: inline-flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
  font-weight: 600;
}

.rt-gossamer-hero-system {
src/styles/modal.css:1244: font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-normal);
  margin: 0;
}

.rt-gossamer-score-subtitle {
src/styles/modal.css:1252: margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.5;
}

.rt-gossamer-simple-meta {
src/styles/modal.css:1259: display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

/* rt-pulse-hero-meta-item - consolidated above with ert-modal-meta-item */
/* rt-pulse-hero-meta-item-warning - warning override consolidated above */

.rt-gossamer-score-cards {
src/styles/modal.css:1269: display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.rt-gossamer-score-card {
src/styles/modal.css:1275: padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.rt-gossamer-score-card-title {
src/styles/modal.css:1282: display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-card-value {
src/styles/modal.css:1292: margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-card-meta {
src/styles/modal.css:1299: margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.rt-gossamer-score-card-progress {
src/styles/modal.css:1305: margin-top: 12px;
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  overflow: hidden;
}

.rt-gossamer-score-card-progress-bar {
src/styles/modal.css:1314: height: 100%;
  width: var(--progress-width, 0%);
  background: linear-gradient(90deg, #ff9900, #ff5e00);
  border-radius: 4px;
  transition: width 0.3s ease-out;
  box-shadow: 0 0 10px rgba(255, 153, 0, 0.3);
}

.rt-gossamer-score-card-progress-bar.rt-progress-complete {
src/styles/modal.css:1323: background: linear-gradient(90deg, #31d47b, #0fb069);
  box-shadow: 0 0 10px rgba(49, 212, 123, 0.45);
}

.rt-gossamer-score-card-progress-bar.rt-progress-error {
src/styles/modal.css:1328: background: linear-gradient(90deg, #ff5f6d, #d7263d);
  box-shadow: 0 0 12px rgba(215, 38, 61, 0.45);
}

.rt-gossamer-score-table {
src/styles/modal.css:1333: width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  color: var(--text-normal);
  font-size: 0.95rem;
}

.rt-gossamer-score-table th,
.rt-gossamer-score-table td {
src/styles/modal.css:1342: padding: 10px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.rt-gossamer-score-table th {
src/styles/modal.css:1348: font-size: 0.9rem;
  color: var(--text-muted);
}

.rt-gossamer-score-table tr:last-child td {
src/styles/modal.css:1353: border-bottom: none;
}

.rt-gossamer-score-cta {
src/styles/modal.css:1357: display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.rt-gossamer-score-cta .mod-warning {
src/styles/modal.css:1363: color: var(--text-warning);
  border-color: rgba(255, 165, 0, 0.4);
}

.rt-gossamer-score-cta .mod-success {
src/styles/modal.css:1368: color: var(--text-success);
}

.rt-gossamer-score-cta .mod-error {
src/styles/modal.css:1372: color: var(--text-error);
}

.rt-gossamer-score-cta .rt-warning-label {
src/styles/modal.css:1376: display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
  font-size: 0.85rem;
  color: var(--text-normal);
}

.rt-gossamer-score-table tr .rt-warning-label {
src/styles/modal.css:1388: margin-top: 4px;
}

/* Keep score label/value readable on hover in the manual update modal */
.rt-gossamer-score-modal .rt-gossamer-score-item-container:hover .rt-gossamer-score-value,
.rt-gossamer-score-modal .rt-gossamer-score-item-container:hover .rt-gossamer-score-label {
src/styles/modal.css:1394: color: var(--text-normal);
}

.rt-purge-issues-grid {
src/styles/modal.css:1398: display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.rt-purge-issue-card {
src/styles/modal.css:1404: padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.rt-purge-issue-title {
src/styles/modal.css:1411: margin: 0 0 6px;
  font-size: 0.95rem;
  font-weight: 700;
}

.rt-purge-issue-note {
src/styles/modal.css:1417: margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.rt-gossamer-score-modal .ert-modal-actions {
src/styles/modal.css:1423: margin-top: 12px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rt-gossamer-score-modal .ert-modal-actions.rt-inline-actions {
src/styles/modal.css:1431: justify-content: space-between;
  align-items: center;
}

.rt-gossamer-score-modal .rt-purge-issues {
src/styles/modal.css:1436: margin-top: 12px;
}

.rt-gossamer-score-modal .rt-purge-issues-title {
src/styles/modal.css:1440: margin: 0 0 6px;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-modal .rt-purge-issues-list {
src/styles/modal.css:1447: list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rt-gossamer-score-modal .rt-purge-issues-item {
src/styles/modal.css:1456: display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;
  color: var(--text-muted);
  line-height: 1.35;
}

.rt-gossamer-score-modal .rt-purge-issues-item strong {
src/styles/modal.css:1465: color: var(--text-normal);
}

.rt-gossamer-score-modal .rt-purge-issues-footnote {
src/styles/modal.css:1469: margin-top: 6px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.rt-purge-confirm-card {
src/styles/modal.css:1475: padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rt-purge-confirm-modal .ert-modal-subtitle {
src/styles/modal.css:1482: margin-bottom: 12px;
}

.rt-purge-message {
src/styles/modal.css:1486: font-size: 1rem;
  color: var(--text-normal);
  line-height: 1.5;
}

.rt-purge-message-secondary {
src/styles/modal.css:1492: color: var(--text-muted);
}

.rt-purge-message + .rt-purge-message {
src/styles/modal.css:1496: margin-top: 12px;
}

.rt-purge-details {
src/styles/modal.css:1500: display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--text-normal);
}

.rt-purge-danger {
src/styles/modal.css:1507: color: var(--text-normal);
  font-weight: 700;
}

.rt-purge-list {
src/styles/modal.css:1512: margin: 0;
  padding-left: 20px;
  color: var(--text-normal);
  line-height: 1.4;
}

.rt-purge-list li {
src/styles/modal.css:1519: margin: 3px 0;
}

.rt-purge-list code {
src/styles/modal.css:1523: font-family: var(--font-monospace);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px 6px;
  color: var(--text-normal);
}

.rt-purge-warning {
src/styles/modal.css:1532: color: var(--text-normal);
  font-weight: 700;
}

.rt-gossamer-score-label {
src/styles/modal.css:1537: font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-normal);
}

.rt-gossamer-score-value {
src/styles/modal.css:1545: font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-line {
src/styles/modal.css:1551: display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.rt-gossamer-score-line svg {
src/styles/modal.css:1558: width: 24px;
  height: 24px;
}

.rt-gossamer-score-line text {
src/styles/modal.css:1563: fill: var(--text-normal);
}

.rt-gossamer-score-line .rt-gossamer-score-value {
src/styles/modal.css:1567: margin-left: auto;
}

.rt-gossamer-score-line [data-item-type=title] {
src/styles/modal.css:1571: fill: var(--rt-max-publish-stage-color);
  stroke: white;
  stroke-width: 0.07em;
  paint-order: stroke;
  font-size: 40px;
  font-weight: 700;
}

.rt-gossamer-score-format-info {
src/styles/modal.css:1580: margin-bottom: 12px;
  padding: 8px;
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.rt-plot-system-selected {
src/styles/modal.css:1589: color: var(--text-success);
  font-weight: 500;
}

.rt-gossamer-options-container {
src/styles/modal.css:1594: display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 15px 0;
}

.rt-gossamer-option-col {
src/styles/modal.css:1601: display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-gossamer-checkbox-row {
src/styles/modal.css:1607: display: flex;
  align-items: center;
  gap: 8px;
}

.rt-gossamer-checkbox {
src/styles/modal.css:1613: width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.rt-gossamer-option-label {
src/styles/modal.css:1620: font-weight: 500;
  font-size: 14px;
  cursor: pointer;
}

.rt-gossamer-option-description {
src/styles/modal.css:1626: font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  padding-left: 26px;
}

/* -------------------------------------------------------------------------- */
/* AUTHOR PROGRESS REPORT (APR) MODAL                                          */
/* -------------------------------------------------------------------------- */

/* APR Modal uses standard ert-modal-shell + ert-modal-container pattern */
/* Sizing handled via inline styles in the modal class */

/* APR Badge - social media theme */
.rt-apr-badge {
src/styles/modal.css:1641: display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.15);
  border: 1px solid rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.3);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--rt-social-color, #ffd41d);
  margin-bottom: 8px;
}

.rt-apr-badge .ert-modal-badge-icon {
src/styles/modal.css:1657: display: inline-flex;
  align-items: center;
}

.rt-apr-badge .ert-modal-badge-icon svg {
src/styles/modal.css:2130: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

/* Refresh Alert */
.rt-apr-refresh-alert {
src/styles/modal.css:2137: display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255, 140, 0, 0.12);
  border: 1px solid rgba(255, 140, 0, 0.3);
  border-radius: 12px;
  color: var(--text-warning);
  font-size: 0.9rem;
  margin-bottom: 16px;
}

.rt-apr-refresh-icon svg {
src/styles/modal.css:2150: width: 18px;
  height: 18px;
  stroke: var(--text-warning);
}

/* Reveal Section - compact checkbox grid */
.rt-apr-reveal-section {
src/styles/modal.css:2157: margin-bottom: 16px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

.rt-apr-reveal-title {
src/styles/modal.css:2165: margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.02em;
}

.rt-apr-reveal-desc {
src/styles/modal.css:2173: margin: 0 0 14px;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.rt-apr-checkbox-grid {
src/styles/modal.css:2180: display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rt-apr-checkbox-item {
src/styles/modal.css:2186: display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.rt-apr-checkbox-item:hover {
src/styles/modal.css:2198: background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.15);
}

.rt-apr-checkbox-item input[type="checkbox"] {
src/styles/modal.css:2203: width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--rt-social-color, #ffd41d);
  flex-shrink: 0;
  margin: 0;
}

.rt-apr-checkbox-item label {
src/styles/modal.css:2212: font-size: 0.8rem;
  color: var(--text-normal);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

/* Mode Section */
.rt-apr-mode-section {
src/styles/modal.css:2221: margin-bottom: 16px;
}

.rt-apr-mode-selector {
src/styles/modal.css:2225: display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.rt-apr-mode-btn,
.rt-apr-size-btn {
src/styles/modal.css:2232: padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rt-apr-mode-btn:hover,
.rt-apr-size-btn:hover {
src/styles/modal.css:2245: background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.rt-apr-mode-btn.rt-active,
.rt-apr-size-btn.rt-active {
src/styles/modal.css:2251: background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.2);
  border-color: var(--rt-social-color, #ffd41d);
  color: var(--rt-social-color, #ffd41d);
}

/* Size Section */
.rt-apr-size-section {
src/styles/modal.css:2258: margin-bottom: 16px;
}

.rt-apr-size-selector {
src/styles/modal.css:2262: display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

/* Side-by-side preview row */
.rt-apr-preview-row {
src/styles/modal.css:2270: display: flex;
  gap: 12px;
  margin: 16px 0;
  justify-content: center;
}

.rt-apr-preview-card {
src/styles/modal.css:2277: flex: 1;
  max-width: 200px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  padding: 10px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
}

.rt-apr-preview-card:hover {
src/styles/modal.css:2288: border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
}

.rt-apr-preview-card.is-locked {
src/styles/modal.css:2293: cursor: default;
  opacity: 0.7;
}

.rt-apr-preview-card.is-locked:hover {
src/styles/modal.css:2298: border-color: rgba(255, 255, 255, 0.1);
  transform: none;
  box-shadow: none;
}

.rt-apr-preview-card.rt-active {
src/styles/modal.css:2304: border-color: var(--rt-social-color, #ffd41d);
  box-shadow: 0 0 12px rgba(255, 212, 29, 0.25);
}

.rt-apr-preview-thumb {
src/styles/modal.css:2309: display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  min-height: 120px;
  max-height: 150px;
  overflow: hidden;
  margin-bottom: 8px;
}

.rt-apr-preview-thumb svg {
src/styles/modal.css:2321: width: 100%;
  height: auto;
  max-height: 140px;
}

.rt-apr-preview-label {
src/styles/modal.css:2327: text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rt-apr-preview-label strong {
src/styles/modal.css:2334: font-size: 0.95rem;
  color: var(--text-normal);
}

.rt-apr-preview-dims {
src/styles/modal.css:2339: font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-monospace);
}

.rt-apr-preview-dims sup {
src/styles/modal.css:2345: font-size: 0.65em;
  line-height: 0;
  vertical-align: super;
}

.rt-apr-preview-usecase {
src/styles/modal.css:2351: font-size: 0.7rem;
  color: var(--text-faint);
}

/* Density tip note */
.rt-apr-density-note {
src/styles/modal.css:2357: display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: rgba(255, 212, 29, 0.08);
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--rt-social-color, #ffd41d);
}

.rt-apr-density-icon {
src/styles/modal.css:2369: flex-shrink: 0;
  margin-top: 1px;
}

.rt-apr-density-icon svg {
src/styles/modal.css:2374: width: 14px;
  height: 14px;
  color: var(--rt-social-color, #ffd41d);
}

.rt-apr-loading,
.rt-apr-empty {
src/styles/modal.css:2381: text-align: center;
  color: var(--text-muted);
  font-size: 0.95rem;
  padding: 40px;
}

.rt-apr-error {
src/styles/modal.css:2388: text-align: center;
  color: var(--text-error);
  font-size: 0.95rem;
  padding: 40px;
}

/* Identity Section */
.rt-apr-identity-section {
src/styles/modal.css:2396: margin-bottom: 16px;
}

.rt-apr-identity-section .setting-item {
src/styles/modal.css:2400: padding: 10px 0;
  border-top: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.rt-apr-identity-section .setting-item:last-child {
src/styles/modal.css:2406: border-bottom: none;
}

/* Actions Section */
.rt-apr-actions-section {
src/styles/modal.css:2411: margin-bottom: 16px;
}

.rt-apr-tabs-container {
src/styles/modal.css:2415: display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.rt-apr-tab {
src/styles/modal.css:2421: display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rt-apr-tab:hover {
src/styles/modal.css:2436: background: rgba(255, 255, 255, 0.06);
}

.rt-apr-tab.rt-active {
src/styles/modal.css:2440: background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.15);
  border-color: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.4);
  color: var(--rt-social-color, #ffd41d);
}

.rt-apr-tab svg {
src/styles/modal.css:2446: width: 14px;
  height: 14px;
}

.rt-apr-actions-content {
src/styles/modal.css:2451: padding: 12px 0;
}

.rt-apr-tab-desc {
src/styles/modal.css:2455: margin: 0 0 12px;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.rt-apr-embed-codes {
src/styles/modal.css:2462: margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.rt-apr-embed-codes h5 {
src/styles/modal.css:2468: margin: 0 0 10px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-apr-embed-codes .rt-row {
src/styles/modal.css:2475: display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Section titles in APR modal */
.rt-apr-modal .rt-section-title {
src/styles/modal.css:2482: margin: 0 0 12px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.02em;
  border-bottom: none;
}

/* Row utility */
.rt-apr-modal .rt-row {
src/styles/modal.css:2492: display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* Synopsis Controls */
.rt-synopsis-controls {
src/styles/modal.css:2499: padding: 18px 20px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rt-synopsis-control {
src/styles/modal.css:2507: display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Two-column row layout for synopsis controls */
.rt-synopsis-control--row {
src/styles/modal.css:2529: margin: 0;
  align-self: center;
}

.rt-synopsis-control-right {
src/styles/modal.css:2534: display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.rt-synopsis-control-info {
src/styles/modal.css:2541: display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.rt-synopsis-control-label {
src/styles/modal.css:2549: font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.01em;
}

.rt-synopsis-control-input {
src/styles/modal.css:2556: width: var(--ert-input-width-3digit);
  min-width: var(--ert-input-width-3digit);
  padding: var(--ert-control-pad-y) var(--ert-control-pad-x);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-normal);
  font-size: 0.95rem;
  font-family: var(--font-monospace);
  flex-shrink: 0;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.rt-synopsis-control-input:focus {
src/styles/modal.css:2571: outline: none;
  border-color: var(--interactive-accent);
  background: rgba(255, 255, 255, 0.08);
}

.rt-synopsis-control-help {
src/styles/modal.css:2577: font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin-top: 0;
}

.rt-synopsis-control-help .rt-synopsis-control-link {
src/styles/modal.css:2584: color: var(--interactive-accent);
  text-decoration: none;
  font-weight: 500;
}

.rt-synopsis-control-help .rt-synopsis-control-link:hover {
src/styles/modal.css:2590: text-decoration: underline;
}

.rt-synopsis-control-divider {
src/styles/modal.css:2594: border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

.rt-synopsis-threshold-warning {
src/styles/modal.css:2600: display: none;
  padding: 12px 14px;
  margin-top: 8px;
  border-radius: 6px;
  background: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  color: var(--text-warning);
  font-size: 0.85rem;
  line-height: 1.5;
}

.rt-synopsis-threshold-warning.is-visible {
src/styles/modal.css:2616: .rt-synopsis-control-right {
src/styles/modal.css:2622: grid-template-columns: auto minmax(0, 1fr);
    row-gap: 10px;
  }

  .ert-synopsis-control--three-col .rt-synopsis-control-input {
src/styles/modal.css:2627: grid-column: 2;
    justify-self: end;
  }
}

.ert-ui.ert-scope--modal .rt-glass-card,
.ert-ui.ert-scope--modal .rt-card-glass,
.ert-ui .ert-scope--modal .rt-glass-card,
.ert-ui .ert-scope--modal .rt-card-glass {
```

### src/styles/legacy/rt-ui-legacy.css (50)

```
src/styles/legacy/rt-ui-legacy.css:1: /* Legacy rt-* selectors extracted from rt-ui.css during ERT migration. */


/* Pro Target Dropdown */
.rt-apr-pro-target .dropdown {
src/styles/legacy/rt-ui-legacy.css:5: background: color-mix(in srgb, var(--ert-pro-accent-color) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--ert-pro-accent-color) 30%, transparent);
  color: var(--text-normal);
  transition: all 0.2s ease;
  font-weight: 500;
}

.rt-apr-pro-target .dropdown:hover,
.rt-apr-pro-target .dropdown:focus {
src/styles/legacy/rt-ui-legacy.css:20: --rt-pro-color: var(--rt-pro-color-base);
  --rt-pro-color-rgb: 217, 70, 239;
  --rt-social-color: var(--rt-social-color-base);
  --rt-social-color-rgb: 255, 212, 29;
}

/* Legacy settings input validation styles (modals) */
.rt-setting-input-success {
src/styles/legacy/rt-ui-legacy.css:28: border-color: var(--text-success);
  background-color: color-mix(in srgb, var(--text-success) 10%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-success) 20%, transparent);
}

.rt-setting-input-error {
src/styles/legacy/rt-ui-legacy.css:34: border-color: var(--text-error);
  background-color: color-mix(in srgb, var(--text-error) 10%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-error) 20%, transparent);
}

/* -------------------------------------------------------------------------- */
/* MIGRATED FROM settings.css (rt-* selectors)                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* PROFESSIONAL SECTION                                                       */
/* -------------------------------------------------------------------------- */

.ert-settings-root .rt-professional-header-toggle .setting-item-control {
src/styles/legacy/rt-ui-legacy.css:89: background-color: var(--background-primary);
  padding: 1em;
  border-radius: 5px;
  overflow-x: auto;
  margin: 1em 0;
}

/* Input sizing utilities (shared across settings) */
.rt-input-xs {
src/styles/legacy/rt-ui-legacy.css:98: width: var(--rt-input-width-xs);
  min-width: var(--rt-input-width-xs);
}

.rt-input-sm {
src/styles/legacy/rt-ui-legacy.css:103: width: var(--rt-input-width-sm);
  min-width: var(--rt-input-width-sm);
}

.rt-input-lg {
src/styles/legacy/rt-ui-legacy.css:108: width: var(--rt-input-width-lg);
  min-width: var(--rt-input-width-lg);
}

.rt-input-full {
src/styles/legacy/rt-ui-legacy.css:113: width: 100%;
  min-width: var(--rt-input-width-xl);
}

.ert-settings-root .setting-item .setting-item-control .rt-input-full {
src/styles/legacy/rt-ui-legacy.css:118: width: 100%;
  min-width: var(--rt-input-width-xl);
}

/* Default sizing for settings inputs (override with utilities above when needed) */
.ert-settings-root .setting-item .setting-item-control input[type="text"]:not(.rt-input-xs):not(.rt-input-sm):not(.rt-input-md):not(.rt-input-lg):not(.rt-input-full):not(.ert-input--xs):not(.ert-input--2digit):not(.ert-input--sm):not(.ert-input--md):not(.ert-input--lg):not(.ert-input--xl):not(.ert-input--full):not(.ert-hex-input),
.ert-settings-root .setting-item .setting-item-control input[type="number"]:not(.rt-input-xs):not(.rt-input-sm):not(.rt-input-md):not(.rt-input-lg):not(.rt-input-full):not(.ert-input--xs):not(.ert-input--2digit):not(.ert-input--sm):not(.ert-input--md):not(.ert-input--lg):not(.ert-input--xl):not(.ert-input--full),
.ert-settings-root .setting-item .setting-item-control input[type="password"]:not(.rt-input-xs):not(.rt-input-sm):not(.rt-input-md):not(.rt-input-lg):not(.rt-input-full):not(.ert-input--xs):not(.ert-input--2digit):not(.ert-input--sm):not(.ert-input--md):not(.ert-input--lg):not(.ert-input--xl):not(.ert-input--full) {
src/styles/legacy/rt-ui-legacy.css:126: width: var(--rt-input-width-md);
  max-width: 100%;
}

.ert-settings-root .setting-item .setting-item-control textarea {
src/styles/legacy/rt-ui-legacy.css:131: width: 100%;
}

.ert-settings-root .setting-item .setting-item-control textarea.rt-input-lg {
src/styles/legacy/rt-ui-legacy.css:135: width: var(--rt-input-width-lg);
  min-width: var(--rt-input-width-lg);
  max-width: 100%;
}

/* Align settings rows to the top when descriptions wrap */

.ert-settings-root .setting-item.setting-item-heading .setting-item-name {
src/styles/legacy/rt-ui-legacy.css:170: align-self: center;
  margin-top: 0;
}

.rt-template-actions {
src/styles/legacy/rt-ui-legacy.css:200: font-weight: 600;
  color: var(--rt-pro-color);
}

.ert-runtime-hint {
src/styles/legacy/rt-ui-legacy.css:223: max-height: 200px;
  overflow-y: auto;
  margin-top: 12px;
}

/* Utility class for hiding elements */
.rt-hidden {
src/styles/legacy/rt-ui-legacy.css:243: margin-bottom: 12px;
}

/* Runtime sections use glass-card but without heavy dropshadow */
.rt-glass-card.ert-runtime-section {
src/styles/legacy/rt-ui-legacy.css:248: box-shadow: none;
}

/* ert-runtime-section-header replaced by rt-section-title in base.css */

.ert-runtime-section-desc {
src/styles/legacy/rt-ui-legacy.css:254: font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

/* ert-runtime-scope-layout, ert-runtime-scope-info, ert-runtime-scope-controls, ert-runtime-scope-row
   replaced by rt-row and rt-stack utilities in base.css */

.ert-runtime-dropdown-container {
src/styles/legacy/rt-ui-legacy.css:304: color: var(--text-muted);
  font-style: italic;
}

/* ert-runtime-status-row replaced by rt-row rt-row-loose rt-row-wrap in base.css */

.ert-runtime-status-checkbox {
src/styles/legacy/rt-ui-legacy.css:355: color: var(--rt-pro-color);
}

.ert-runtime-accordion-icon {
src/styles/legacy/rt-ui-legacy.css:419: font-size: 11px;
  color: var(--text-faint);
  margin-top: 12px;
  font-style: italic;
}

/* Books settings (moved from rt-ui.css during ERT migration) */

/* "+" add-book button in heading (ert-iconBtn ert-mod-cta base) */
.rt-books-add-btn--pulse {
src/styles/legacy/rt-ui-legacy.css:429: box-shadow: 0 0 0 1px color-mix(in srgb, var(--text-success) 28%, transparent);
}

.rt-books-panel {
src/styles/legacy/rt-ui-legacy.css:433: gap: 8px;
}

/* Book card: single-row Setting with bordered card look */
.rt-book-card.setting-item {
src/styles/legacy/rt-ui-legacy.css:438: display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m, 8px);
  padding: 8px 12px;
  background: var(--background-primary);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease;
}

/* Override generic .is-inactive muting — book cards must stay interactive */
.rt-book-card.setting-item.is-inactive {
src/styles/legacy/rt-ui-legacy.css:454: opacity: 1;
  pointer-events: auto;
}

.rt-book-card.setting-item.is-active {
src/styles/legacy/rt-ui-legacy.css:459: border-color: color-mix(in srgb, var(--text-success) 50%, transparent);
}

.rt-book-card.setting-item.rt-book-card--link-broken {
src/styles/legacy/rt-ui-legacy.css:463: border-color: color-mix(in srgb, var(--text-error) 42%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--text-error) 6%, var(--background-primary));
}

/* Name column: status icon + title stacked above desc */
.rt-book-card__name {
src/styles/legacy/rt-ui-legacy.css:469: display: flex;
  align-items: center;
  gap: 8px;
}

.rt-book-card .setting-item-info {
src/styles/legacy/rt-ui-legacy.css:475: min-width: 0;
}

.rt-book-card .setting-item-control {
src/styles/legacy/rt-ui-legacy.css:479: min-width: 0;
}

.rt-book-card__drag {
src/styles/legacy/rt-ui-legacy.css:483: display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-width: 28px;
  color: var(--text-faint);
  cursor: grab;
}

.rt-book-card__drag svg {
src/styles/legacy/rt-ui-legacy.css:493: width: 16px;
  height: 16px;
}

.rt-book-card__meta {
src/styles/legacy/rt-ui-legacy.css:498: letter-spacing: 0.02em;
}

.rt-book-card__status {
src/styles/legacy/rt-ui-legacy.css:502: display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-faint);
}

.rt-book-card__status svg {
src/styles/legacy/rt-ui-legacy.css:510: width: 16px;
  height: 16px;
}

.rt-book-card__status--active {
src/styles/legacy/rt-ui-legacy.css:515: color: var(--text-success);
}

.rt-book-card__status--invalid {
src/styles/legacy/rt-ui-legacy.css:519: color: var(--text-error);
}

/* Clickable row to activate inactive book */
.rt-book-card--clickable {
src/styles/legacy/rt-ui-legacy.css:524: cursor: pointer;
}

.rt-book-card--clickable:hover {
src/styles/legacy/rt-ui-legacy.css:528: border-color: color-mix(in srgb, var(--text-success) 40%, transparent);
}

.rt-book-card--clickable:hover .rt-book-card__status {
src/styles/legacy/rt-ui-legacy.css:532: color: var(--text-success);
}

.rt-book-card--clickable.rt-book-card--link-broken:hover {
src/styles/legacy/rt-ui-legacy.css:536: border-color: color-mix(in srgb, var(--text-error) 42%, var(--background-modifier-border));
}

.rt-book-card--clickable.rt-book-card--link-broken:hover .rt-book-card__status--invalid {
src/styles/legacy/rt-ui-legacy.css:540: color: var(--text-error);
}

.rt-book-card__stat--warn {
src/styles/legacy/rt-ui-legacy.css:544: color: var(--text-faint);
}

.rt-book-card__stat--invalid {
src/styles/legacy/rt-ui-legacy.css:548: color: var(--text-error);
}

.rt-book-card__trash.is-disabled {
src/styles/legacy/rt-ui-legacy.css:552: opacity: 0.3;
  pointer-events: none;
}

.rt-books-panel--dragging .rt-book-card .setting-item-control,
.rt-books-panel--dragging .rt-book-card .ert-book-name {
src/styles/legacy/rt-ui-legacy.css:558: pointer-events: none;
}

.rt-book-card.setting-item.is-dragging {
src/styles/legacy/rt-ui-legacy.css:562: opacity: 0.36;
  box-shadow: none;
}

.rt-book-card.setting-item.is-dragover {
src/styles/legacy/rt-ui-legacy.css:567: border-color: color-mix(in srgb, var(--interactive-accent) 72%, var(--background-modifier-border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--interactive-accent) 28%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 16%, transparent);
}

.rt-book-card--dragPreview {
```
