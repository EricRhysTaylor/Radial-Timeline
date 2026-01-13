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
            showTitle: {
                name: 'ソースパスをタイトルとして表示',
                desc: 'ソースフォルダ名を作品のタイトルとして表示します。オフの場合、「進行中の作品」と表示されます。',
            },
        },
        pov: {
            heading: '視点',
            global: {
                name: 'グローバルPOV',
                desc: 'オプション。適用するデフォルトモードを選択します。シーンレベルのPOVはこのグローバル設定を上書きします。',
            },
            modes: {
                off: 'レガシー（最初にリストされたキャラクター、「pov」上付き文字）',
                first: '一人称視点（キャラクターに¹マーカー）',
                second: '二人称視点（You²ラベル）',
                third: '三人称限定視点（キャラクターに³マーカー）',
                omni: '全知の語り手（Omni³ラベル）',
                objective: '客観視点 — カメラアイの語り手（Narrator°ラベル）',
            },
        },
        advanced: {
            heading: '詳細設定',
            aiOutputFolder: {
                name: 'AI出力フォルダ',
                desc: 'AIログやローカルLLMレポートを保存するフォルダです。ボールト内のフォルダを指定してください。',
                placeholder: 'Radial Timeline/AI Logs',
            },
            manuscriptOutputFolder: {
                name: '原稿エクスポートフォルダ',
                desc: '原稿のエクスポート（Markdown、DOCX、PDF）を保存するフォルダです。デフォルト: Radial Timeline/Manuscript。',
                placeholder: 'Radial Timeline/Manuscript',
            },
            outlineOutputFolder: {
                name: 'アウトラインエクスポートフォルダ',
                desc: 'アウトラインのエクスポート（ビートシート、エピソードランダウン、インデックスカード）を保存するフォルダです。デフォルト: Radial Timeline/Outline。',
                placeholder: 'Radial Timeline/Outline',
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
        workInProgress: '進行中の作品',
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
