/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Japanese translations (日本語)
 * 
 * This file only needs to contain strings that have been translated.
 * Missing keys automatically fall back to English.
 * 
 * To add translations:
 * 1. Copy the key structure from en.ts
 * 2. Replace the English string with the Japanese translation
 * 3. Run `node scripts/check-translations.mjs` to see coverage
 */

import type { TranslationKeys } from './en';

// Helper type for deep partial (allows partial translations at any nesting level)
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const ja: DeepPartial<TranslationKeys> = {
    settings: {
        general: {
            sourcePath: {
                name: 'ソースパス',
                desc: '原稿シーンファイルを含むルートフォルダを指定します。',
                placeholder: '例: 原稿/シーン',
            },
            /** @deprecated Legacy toggle — book title is now set via Book Profiles. */
            showTitle: {
                name: 'レガシー：ソースパスタイトル（非推奨）',
                desc: 'この設定は使用されなくなりました。書籍タイトルは一般設定のブックプロファイルで管理されています。',
            },
        },
        pov: {
            heading: '視点',
            global: {
                name: 'グローバルPOV',
                desc: 'オプション。適用するデフォルトモードを選択します。シーンレベルのPOVはこのグローバル設定を上書きします。',
            },
            yamlOverrides: {
                name: 'シーンレベルのYAML上書き',
                desc: 'シーンのフロントマターでは、`POV:` に first, second, third, omni, objective、または two, four, count, all などの数値を指定できます。count系は `Character:` の先頭N人に印を付け、グローバルPOVのマーカーを使います。',
            },
            modes: {
                off: 'レガシー（最初にリストされたキャラクター、「pov」上付き文字）',
                first: '一人称視点（キャラクターに¹マーカー）',
                second: '二人称視点（You²ラベル）',
                third: '三人称限定視点（キャラクターに³マーカー）',
                omni: '全知の語り手（Omni³ラベル）',
                objective: '客観視点 — カメラアイの語り手（Narrator°ラベル）',
            },
            preview: {
                heading: 'POV例',
                examples: {
                    sceneFirst: 'シーンYAML: POV: first | Character: [Alice]',
                    sceneThird: 'シーンYAML: POV: third | Character: [Bob]',
                    sceneSecond: 'シーンYAML: POV: second | Character: [Alice, Bob]',
                    sceneOmni: 'シーンYAML: POV: omni | Character: [Alice, Bob]',
                    sceneObjective: 'シーンYAML: POV: objective | Character: [Alice, Bob]',
                    countTwoThird: 'グローバル設定: POV = third | シーンYAML: POV: two | Character: [Alice, Bob]',
                    countThreeThird: 'グローバル設定: POV = third | シーンYAML: POV: three | Character: [Alice, Bob, Charlie]',
                    countFourThird: 'グローバル設定: POV = third | シーンYAML: POV: four | Character: [Alice, Bob, Charlie, Diana]',
                    countTwoFirstNumeric: 'グローバル設定: POV = first | シーンYAML: POV: 2 | Character: [Alice, Bob]',
                    countAllFirst: 'グローバル設定: POV = first | シーンYAML: POV: all | Character: [Alice, Bob, Charlie]',
                },
            },
        },
        configuration: {
            heading: '詳細設定',
            aiOutputFolder: {
                name: 'AI出力フォルダ',
                desc: 'AIログやローカルLLMレポートを保存するフォルダです。ボールト内のフォルダを指定してください。',
                placeholder: 'Radial Timeline/Logs',
            },
            manuscriptOutputFolder: {
                name: 'エクスポートフォルダ',
                desc: '原稿/アウトラインのエクスポート（Markdown、PDF、ビートシート、インデックスカード）を保存するフォルダです。デフォルト: Radial Timeline/Export。',
                placeholder: 'Radial Timeline/Export',
            },
            outlineOutputFolder: {
                name: 'アウトラインエクスポートフォルダ（レガシー）',
                desc: 'レガシー設定です。アウトラインのエクスポートは共有エクスポートフォルダを使用します。デフォルト: Radial Timeline/Export。',
                placeholder: 'Radial Timeline/Export',
            },
            autoExpand: {
                name: 'クリップされたシーンタイトルを自動展開',
                desc: 'シーンにホバーしたとき、タイトルテキストがクリップされている場合は自動的に展開します。',
            },
            readability: {
                name: '可読性サイズ',
                desc: 'タイムラインテキストのフォントサイズプロファイルを選択します。',
                normal: '標準',
                large: '大',
            },
        },
        ai: {
            heading: 'シーン分析用AI LLM',
            enable: {
                name: 'AI LLM機能を有効にする',
                desc: 'コマンドパレットオプションとUIシーン分析の色とホバーシノプシスを表示します。',
            },
        },
    },
    timeline: {
        acts: {
            act1: '第一幕',
            act2: '第二幕',
            act3: '第三幕',
        },
        /** @deprecated No longer used — book title comes from Book Profiles. */
        workInProgress: '無題の原稿',
    },
    common: {
        yes: 'はい',
        no: 'いいえ',
        cancel: 'キャンセル',
        save: '保存',
        reset: 'リセット',
        enable: '有効',
        disable: '無効',
        loading: '読み込み中...',
        error: 'エラー',
        success: '成功',
    },
};
