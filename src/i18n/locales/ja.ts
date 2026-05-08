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
                name: 'ログ',
                desc: '実行ログ、アーカイブ、スナップショット、Move History は Radial Timeline/Logs に保存されます。',
                placeholder: 'Radial Timeline/Logs',
            },
            manuscriptOutputFolder: {
                name: 'エクスポートフォルダ',
                desc: '原稿、アウトライン、インデックスカードのエクスポート（Markdown、PDF、ビートシート、インデックスカード）は Radial Timeline/Export に保存されます。',
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
            actFallback: '第{{number}}幕',
        },
        /** @deprecated No longer used — book title comes from Book Profiles. */
        workInProgress: '無題の原稿',
        defaultBookTitle: '無題の原稿',
        loading: 'タイムラインを読み込み中...',
        loadingData: 'タイムラインデータを読み込み中...',
        renderError: 'タイムラインの描画でエラーが発生しました。詳細はコンソールを確認してください。',
        overdue: '期限超過: {{date}}',
        modes: {
            narrative: { name: '叙事', acronym: '叙事' },
            progress: { name: '進捗', acronym: '進捗' },
            chronologue: { name: '年代記', acronym: '年代' },
            gossamer: { name: 'ゴッサマー', acronym: 'ゴサ' },
        },
        subplotRing: {
            allScenes: '全シーン',
            mainPlot: 'メインプロット',
            chronologue: '年代記',
        },
        grid: {
            statusHeader: {
                todo: '予定',
                working: '進行',
                completed: '完了',
                due: '期日',
            },
            stageHeader: {
                zero: '零',
                author: '著',
                house: '社',
                press: '刊',
            },
        },
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
    inquiry: {
        help: {
            tooltip: 'Inquiry の使い方',
            configTooltip: 'Inquiry はまだ設定されていません。\nシーン、書籍、アウトラインが格納されている Inquiry ディレクトリを設定してください（設定 -> Inquiry）。\nそして、選択したスコープに含めるクラスを明示的に確認してください。',
            noScenesTooltip: '現在のスコープにシーンが見つかりません。\nシーン、書籍、アウトラインが格納されている Inquiry ディレクトリを設定してください（設定 -> Inquiry）。\nそして、選択したスコープに含めるクラスを明示的に確認してください。',
            corpusTooltip: 'コーパスが無効です。\nInquiry を実行するには、コーパスストリップでコーパススコープを有効にしてください。',
            resultsTooltip: 'ミニマップでマテリアル引用を確認して詳細なフィードバックを得てください。\n完全な詳細は Brief を表示してください。',
            runningTooltip: 'Inquiry は API 実行を処理しています。\n別のノートに切り替えて作業を続けることができますが、この Inquiry タブは開いたままにしてください。',
            runningSingleTooltip: 'Inquiry は現在この質問を処理しています。\n別のノートに切り替えて作業を続けることができますが、この Inquiry タブは開いたままにしてください。\nこの実行をキャンセルすると、最初からやり直す必要があります。再開はできません。',
            onboardingTooltip: '番号ボタンで質問とペイロードが表示されます。クリックすると AI で質問を処理します。Flow と Depth リングは応答のレンズを調整します。ミニマップは文脈に応じた引用を表示します。',
        },
        mobile: {
            title: 'デスクトップが必要です',
            subtitle: 'Inquiry はデスクトップでのみ利用可能です。Brief はモバイルでも読み取り可能です。',
            openBriefs: 'Briefs フォルダを開く',
            viewLatest: '最新の Brief を表示',
        },
        nav: {
            bookUnresolved: '書籍スコープが未解決です。Inquiry のソースを確認してください。',
            waitingForProvider: 'プロバイダーの応答を待機中。',
            welcome: 'Inquiry へようこそ。{{weekday}} {{month}} {{day}}{{ordinal}}。',
            previousBook: '前の書籍。',
            nextBook: '次の書籍。',
            noPreviousBook: '前の書籍はありません。',
            noNextBook: '次の書籍はありません。',
        },
        navTooltip: {
            scopeToggle: 'Book と Saga スコープを切り替えます。',
            flowLens: 'Flow レンズに切り替え。',
            depthLens: 'Depth レンズに切り替え。',
            modeIconToggle: 'Flow と Depth レンズを切り替え。',
            focusRingToggle: 'フォーカスリングの展開を切り替え。',
            previousBook: '前の書籍。',
            nextBook: '次の書籍。',
        },
        runner: {
            contactingProvider: 'Inquiry: AI プロバイダーに接続中。',
            running: '現在実行中（{{evidenceMode}}）。概算 ETA {{estimateLabel}}。',
            cancelRequested: 'Inquiry のキャンセルが要求されました。現在のパスが返されてから停止します。アクティブなプロバイダーリクエストはまだ完了する可能性があります。',
            finalizing: 'プロバイダーの応答を受信しました。結果を最終化中。',
            waiting: 'プロバイダーの応答を待機中。',
            runAborted: 'Inquiry 実行が中止されました。',
            inquiryAlreadyRunning: 'Inquiry は既に実行中です。',
            inquiryNotConfigured: 'Inquiry はまだ設定されていません。',
            noScenesAvailable: 'Inquiry に利用可能なシーンがありません。',
            noEnabledQuestions: '有効な Inquiry の質問が見つかりません。',
        },
        notice: {
            aiDisabledInSettings: 'Inquiry には AI 機能が有効である必要があります。設定で「AI LLM 機能を有効にする」をオンにしてください。',
            omnibusViewFailed: 'オムニバスパス用の Inquiry ビューを開けません。',
            omnibusMobileOnly: 'Inquiry オムニバスパスはデスクトップでのみ利用可能です。',
            omnibusResumeNothing: 'すべての質問が完了済みです。再開するものがありません。',
            running: 'Inquiry 実行中。お待ちください。',
            noEnabledQuestions: '有効な Inquiry の質問が見つかりません。',
            logNotFound: 'この実行の Inquiry ログが見つかりません。',
            briefNotFound: 'Brief が見つかりません。移動または削除された可能性があります。',
            briefSaved: 'Inquiry brief を保存しました。',
            briefNotSaved: 'アクティブな inquiry に保存された brief がありません。',
            noBriefActive: 'アクティブな inquiry brief がありません。',
            sceneNotFound: 'シーンファイルが見つかりません。',
            noRunForPreview: 'レポートをプレビューする前に inquiry を実行してください。',
            noRunForSave: 'brief を保存する前に inquiry を実行してください。',
            noBriefs: 'Brief が見つかりません。',
            fileExplorerUnavailable: 'ファイルエクスプローラーが利用できません。',
        },
        interaction: {
            running: 'Inquiry 実行中。お待ちください。',
            noQuestionsForZone: 'このゾーンに質問が設定されていません。',
            noQuestionForSlot: 'このスロットに質問が設定されていません。',
            targetScenesBookOnly: 'ターゲットシーンは Book スコープでのみ利用可能です。',
            targetSceneAdded: 'ターゲットシーンに追加しました。',
            targetSceneRemoved: 'ターゲットシーンから削除しました。',
            clearedAllTargetScenes: 'すべてのターゲットシーンをクリアしました。',
            corpusDisabled: 'コーパスが無効です。Inquiry を実行するにはコーパスを有効にしてください。',
            inquiryAlreadyRun: 'Inquiry は既に実行されています。最近の Inquiry セッションを開いて再表示してください。',
        },
        menu: {
            forceRerun: '強制再実行',
            openCitationBriefing: 'Briefing 記事で引用を開く',
            openCitationMarkdown: 'Markdown Brief で引用を開く',
            openScene: 'シーンを開く',
            openNote: 'ノートを開く',
            cancelTargeting: 'すべてのターゲティングをキャンセル',
        },
        findings: {
            findings: '発見',
            noInquiryRun: 'まだ inquiry が実行されていません。',
            runToSeeVerdicts: 'inquiry を実行して判定を確認します。',
            selectionDiscover: '選択モード · Discover',
            targetSection: 'ターゲットの発見',
            contextSection: 'コンテキストの発見',
            empty: 'なし。',
        },
        preview: {
            footerOpenLog: '詳細なエラーレポートのために Inquiry ログを開きます。',
            hoverPreview: '質問にホバーしてペイロードをプレビューします。',
            noScenesHero: 'Inquiry に利用可能なシーンがありません。',
        },
        details: {
            toggle: '詳細を切り替え',
        },
        corpus: {
            disabled: 'コーパスが無効です。Inquiry を実行するにはコーパスを有効にしてください。',
            legendClickKeysTitle: 'クリックキー',
            legendModeTitle: 'モード（アイコン + 色）',
            legendStatusTitle: 'ステータス（境界線）',
            legendTierTitle: 'ティア（塗りつぶしレベル）',
            statusOverdueLabel: '期限超過',
            statusTodoLabel: '未着手',
            statusWorkingLabel: '作業中',
            statusCompleteLabel: '完了',
        },
        settingsExtra: {
            autopopulateName: '保留中の編集を自動入力',
            autopopulateDesc: 'Inquiry の各実行後、Pending Edits の YAML フィールドにアクションノートを自動的に書き込みます。オフの場合は、Recent Inquiry Sessions を使用して手動で書き込みます。',
            replaceQuestionsTitle: '現在の質問を置き換えますか？',
            replaceCustomizedQuestionsTitle: 'カスタマイズした質問を置き換えますか？',
            replaceQuestionsConfirm: '質問を置き換える',
            replaceCustomTitle: 'カスタム質問を置き換えますか？',
            replaceCustomConfirm: '質問を置き換える',
            replaceCanonicalTitle: '正規の質問を置き換えますか？',
            collapse: '折りたたむ',
            expand: '展開',
        },
    },
    // sceneAnalysis: deferred — interface is `?:` optional in TranslationKeys
    // until the matching values block lands. Untyped partial assignment fails
    // because DeepPartial doesn't recurse through `T | undefined`. Re-add when
    // the full interface stabilises.
    bookDesigner: {
        saveTemplate: {
            badge: 'シーンセット',
            title: 'シーンレイアウトを保存',
            subtitle: '後で再利用できるように、このレイアウトに名前を付けます。',
            nameField: {
                name: 'レイアウト名',
                desc: '短くユニークな名前を付けてください。',
                placeholder: '例：スリラー / 3幕バランス',
            },
            note: 'テンプレートにはレイアウト、幕、サブプロット、キャラクター、ビートの切り替え、選択した YAML タイプ（基本/上級）が含まれます。',
            nameRequired: 'テンプレート名は必須です。',
        },
        deleteTemplate: {
            title: 'レイアウトを削除',
            subtitle: '"{{name}}" を削除しますか？この操作は元に戻せません。',
        },
        demoProject: {
            badge: 'デモ',
            title: '非線形デモプロジェクトを生成',
            subtitle: '20シーン・5幕の例を作成し、物語順（読者がシーンに出会う順）と時系列順（実際に出来事が起こる順）の違いを示します。シーン番号は物語順で1〜20ですが、日付と時間は前後に飛びます — 生成後に START HERE ノートを開いて確認し、Timeline と Chronologue ビューを切り替えて比較してください。',
            startDate: {
                name: '開始日',
                desc: 'クロノロジーのリズムに使用されます。形式：YYYY-MM-DD。',
            },
            note: 'デモが正しく描画されるように、ワークスペースが5幕用に構成されていることも保証されます。',
            generate: 'デモプロジェクトを生成',
            invalidDate: 'YYYY-MM-DD 形式で有効な開始日を入力してください。',
        },
        modal: {
            badge: 'セットアップ',
            title: 'ブックデザイナー',
            subtitle: '新しい小説の足場を構成して生成します。プレビューでシーンを別の幕やサブプロットにドラッグするとマニュアルモードが有効になります。後で再利用できるようにテンプレートを保存してください。',
            wikiAriaLabel: 'Wiki で詳細を読む',
            noBookSelected: '本が選択されていません',
            untitled: '無題',
        },
        meta: {
            autoMode: '自動モード',
            manualMode: 'マニュアルモード',
            manualLayoutActive: 'マニュアルレイアウトが有効',
            autoDistribution: '自動分配',
            fromTemplate: ' · テンプレートから',
        },
        sections: {
            locationStructure: '場所と構造',
            contentConfiguration: 'コンテンツ設定',
            sceneSetsExtras: 'シーンセットと追加',
        },
        fields: {
            targetBook: {
                name: '対象の本',
                desc: 'シーンとビートを作成するブックマネージャープロジェクトを選択します。',
                noBooks: '本が設定されていません',
                addFirstNote: 'ここで足場を生成する前に、ブックマネージャーで本を追加してフォルダを設定してください。',
            },
            timeIncrement: {
                name: 'シーンごとの日付増分',
                desc: 'シーン間のタイムライン増分（例：1時間、1日、1週間）。0に設定すると増分は無効になります。',
                placeholder: '1 day',
                invalid: '無効な期間："{{raw}}"。{{current}} に戻します。',
            },
            scenes: {
                name: '生成するシーン数',
                desc: 'YAML フロントマター付きで作成するテンプレートシーンファイルの数。',
            },
            targetLength: {
                name: '目標の本の長さ',
                desc: '番号付け分配に使用されます（例：10、20、30...）',
                detail: 'シーンには次の番号が付けられます：{{examples}}{{suffix}}（{{scenes}} シーン × {{max}} 単位）。',
            },
            acts: {
                label: 'シーンを分配する幕',
                actLabel: '第 {{num}} 幕',
            },
            subplots: {
                name: 'サブプロット',
                desc: '1行に1つのサブプロットを入力してください。',
            },
            characters: {
                name: 'キャラクター',
                desc: '1行に1人のキャラクターを入力してください。',
            },
            sceneSet: {
                label: 'シーンセット',
                base: 'ベースシーンセット',
                advanced: '高度なプロパティ',
            },
            generateBeats: {
                withSystem: '{{name}} ビートを生成',
                noSystem: 'アクティブなビートシステムなし',
                tooltipNoSystem: '設定 → ビートでビートシステムを選択して、ビート生成を有効にしてください。',
                existsAria: 'このフォルダにはすでにビートノートが存在します',
                noSystemAria: '最初に設定 → ビートでビートシステムを選択してください',
                yes: 'はい',
                no: 'いいえ',
            },
            sceneLayouts: {
                name: 'シーンレイアウト',
                desc: '保存されたレイアウト（幕、サブプロット、割り当て、メタデータ）を選択します。',
                newOption: '新規テンプレート',
                emptyOption: '—',
            },
        },
        preview: {
            title: 'プレビュー',
            dragging: 'シーン {{scene}} をドラッグ中 → 第 {{act}} 幕、{{subplot}}',
            subplotFallback: 'サブプロット {{num}}',
        },
        buttons: {
            saveSceneSet: 'シーンセットを保存',
            reset: 'リセット',
            demoProject: 'デモプロジェクト',
            deleteLayout: 'レイアウトを削除',
            createBook: '本を作成',
            save: '保存',
            delete: '削除',
            cancel: 'キャンセル',
        },
        notes: {
            layoutTemplatesIncludes: 'シーン、幕、サブプロット、ビート、クロノロジータイミングを含みます。',
        },
        notices: {
            layoutReset: 'レイアウトを自動分配のデフォルトにリセットしました。',
            templateDeleted: 'テンプレートを削除しました。',
            templateNotFound: 'テンプレートが見つかりません。',
            templateSaved: 'テンプレート "{{name}}" を保存しました。',
            templateUpdated: 'テンプレート "{{name}}" を更新しました。',
            templateApplied: 'テンプレート "{{name}}" を適用しました。',
            selectBookForDemo: 'デモプロジェクトを生成する前に、フォルダ付きのブックマネージャー本を選択してください。',
            selectBookForGenerate: 'シーンを生成する前に、フォルダ付きのブックマネージャー本を選択してください。',
            folderError: 'フォルダ作成エラー：{{error}}',
            baseSetMissing: '設定にベースシーンセットがありません。生成する前にシーンセットを設定してください。',
            generating: '{{count}} シーンを生成中...',
            beatsExist: 'このフォルダにはすでにビートノートが存在します（{{count}} 個見つかりました）。設定のビートマネージャーで修復または再同期してください。',
            noBeatSystemActive: 'この本のアクティブなビートシステムが選択されていません。ビートノートを作成する前にビートマネージャーで選択してください。',
            beatsError: 'ビート作成エラー：{{error}}',
            bookCreated: '本を作成しました！{{scenes}} シーン{{skipped}}{{beats}}。',
            bookCreatedSkipped: '（既存の {{count}} 個をスキップ）',
            bookCreatedBeatsExist: '（ビートはすでに存在します）',
            bookCreatedBeats: '、{{count}} ビートノート',
            demoReady: 'デモプロジェクト準備完了：{{scenes}} シーン、{{notes}} ノート、{{beats}} ビートノート。{{skipped}}',
            demoSkipped: ' 既存の {{scenes}} シーンと {{notes}} ノートをスキップしました。',
        },
    },
    gossamer: {
        scoreModal: {
            beatSystemTitle: '{{label}} ビートシステム',
            subtitle: '各ビートの{{signal}}スコア（0-100）を入力してください。以前のスコアは履歴として保存されます。',
            signalMeta: 'シグナル: {{label}}',
            beatsDetectedMeta: '検出されたビート: {{count}}',
            enterScoreLabel: 'スコアを入力',
            scorePlaceholder: '0-100',
            groupMaintenance: 'メンテナンス',
            groupAi: 'AIワークフロー',
            normalizeButton: '履歴を正規化',
            deleteButton: '{{label}}スコアを削除',
            copyButton: 'AIプロンプトをコピー',
            pasteButton: 'AIレスポンスを貼り付け',
            saveButton: 'スコアを保存',
            cancelButton: 'キャンセル',
            aiMetaVaultLink: 'Vaultファイル',
            normalizeNothing: '正規化するGossamer履歴はありません。',
            clipboardEmpty: 'クリップボードが空です。',
            clipboardReadFailed: 'クリップボードを読み取れませんでした。',
            noChanges: '保存する変更はありません。',
            saveFailed: 'スコアの保存に失敗しました。コンソールで詳細を確認してください。',
            deleteConfirmBadge: '警告',
            deleteConfirmCancel: 'キャンセル',
            normalizeConfirmBadge: '警告',
            normalizeConfirmTitle: 'Gossamer履歴を正規化しますか？',
            normalizeConfirmButton: '正規化',
            normalizeConfirmCancel: 'キャンセル',
        },
        processingModal: {
            statusInitializing: '初期化中...',
            backgroundContinues: '分析はバックグラウンドで続行されます。',
            modelDisabled: 'AI無効',
            beginButton: '分析を開始',
            cancelButton: 'キャンセル',
            analyzingManuscript: '原稿を分析中...',
            assemblingManuscript: '原稿を組み立て中...',
            statusHeading: 'ステータス',
            waitingToSend: '送信待機中...',
            closeButton: '閉じる',
            statScenes: 'シーン',
            statWords: '語数',
            statBeats: 'ストーリービート',
            statEvidence: '証拠',
            analysisComplete: '分析完了',
            analysisFailed: '分析失敗',
            apiFailed: '✗ API呼び出し失敗',
        },
        notices: {
            noStoryBeats: 'ストーリービートが見つかりません。フロントマターに "Class: Beat" を含むノートを作成してください。',
            cannotEnterMode: 'Gossamerモードに入れません。{{hint}}',
            validating: '設定を検証中...',
            loadingBeats: 'ストーリービートを読み込み中...',
            updatingBeats: 'ビートノートを更新中...',
            generatingLog: '分析ログを生成中...',
            processingFailed: '処理に失敗しました: {{error}}',
        },
        service: {
            noBeatsUpdated: '更新されたビートはありません。',
        },
    },
};
