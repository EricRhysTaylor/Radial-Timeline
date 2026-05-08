/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Simplified Chinese translations (简体中文)
 *
 * Covers `zh`, `zh-cn`, `zh-hans` (the i18n module strips region codes).
 * Missing keys automatically fall back to English.
 *
 * To add or refine translations:
 * 1. Copy the key structure from en.ts
 * 2. Replace the English string with the Chinese translation
 * 3. Run `node scripts/check-translations.mjs` to see coverage
 */

import type { TranslationKeys } from './en';

// Helper type for deep partial (allows partial translations at any nesting level)
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const zh: DeepPartial<TranslationKeys> = {
    settings: {
        general: {
            sourcePath: {
                name: '源路径',
                desc: '指定包含手稿场景文件的根文件夹。',
                placeholder: '例如：手稿/场景',
            },
            /** @deprecated Legacy toggle — book title is now set via Book Profiles. */
            showTitle: {
                name: '旧版：源路径作为标题（已弃用）',
                desc: '此设置不再使用。书名现通过常规设置中的书籍配置文件管理。',
            },
        },
        pov: {
            heading: '视角',
            global: {
                name: '全局视角',
                desc: '可选。选择默认应用的模式。场景级视角将覆盖此全局设置。',
            },
            yamlOverrides: {
                name: '场景级 YAML 覆盖',
                desc: '在场景的前置元数据中，`POV:` 可以是 first、second、third、omni、objective，或者数字如 two、four、count、all。数字类会标记 `Character:` 中的前 N 个角色，并使用全局视角的标记。',
            },
            modes: {
                off: '旧版（首位列出的角色，"pov" 上标）',
                first: '第一人称（角色带 ¹ 标记）',
                second: '第二人称（You² 标签）',
                third: '第三人称有限视角（角色带 ³ 标记）',
                omni: '全知叙述者（Omni³ 标签）',
                objective: '客观视角 — 摄像机叙述者（Narrator° 标签）',
            },
            preview: {
                heading: '视角示例',
                examples: {
                    sceneFirst: '场景 YAML：POV: first | Character: [Alice]',
                    sceneThird: '场景 YAML：POV: third | Character: [Bob]',
                    sceneSecond: '场景 YAML：POV: second | Character: [Alice, Bob]',
                    sceneOmni: '场景 YAML：POV: omni | Character: [Alice, Bob]',
                    sceneObjective: '场景 YAML：POV: objective | Character: [Alice, Bob]',
                    countTwoThird: '全局设置：POV = third | 场景 YAML：POV: two | Character: [Alice, Bob]',
                    countThreeThird: '全局设置：POV = third | 场景 YAML：POV: three | Character: [Alice, Bob, Charlie]',
                    countFourThird: '全局设置：POV = third | 场景 YAML：POV: four | Character: [Alice, Bob, Charlie, Diana]',
                    countTwoFirstNumeric: '全局设置：POV = first | 场景 YAML：POV: 2 | Character: [Alice, Bob]',
                    countAllFirst: '全局设置：POV = first | 场景 YAML：POV: all | Character: [Alice, Bob, Charlie]',
                },
            },
        },
        configuration: {
            heading: '高级设置',
            aiOutputFolder: {
                name: '日志',
                desc: '运行日志、归档、快照和移动历史保存在 Radial Timeline/Logs。',
                placeholder: 'Radial Timeline/Logs',
            },
            manuscriptOutputFolder: {
                name: '导出文件夹',
                desc: '手稿、大纲和索引卡导出（Markdown、PDF、节拍表、索引卡）保存在 Radial Timeline/Export。',
                placeholder: 'Radial Timeline/Export',
            },
            outlineOutputFolder: {
                name: '大纲导出文件夹（旧版）',
                desc: '旧版设置。大纲导出使用共享的导出文件夹。默认：Radial Timeline/Export。',
                placeholder: 'Radial Timeline/Export',
            },
            autoExpand: {
                name: '自动展开被截断的场景标题',
                desc: '悬停在场景上时，如果标题文本被截断则自动展开。',
            },
            readability: {
                name: '可读性大小',
                desc: '为时间轴文本选择字体大小配置文件。',
                normal: '标准',
                large: '大',
            },
        },
        ai: {
            heading: '场景分析的 AI LLM',
            enable: {
                name: '启用 AI LLM 功能',
                desc: '显示命令面板选项以及 UI 场景分析的颜色与悬停提要。',
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
        workInProgress: '未命名手稿',
        defaultBookTitle: '未命名手稿',
        loading: '正在加载时间轴...',
        loadingData: '正在加载时间轴数据...',
        renderError: '渲染时间轴时出错。请查看控制台了解详情。',
        overdue: '已逾期：{{date}}',
        modes: {
            narrative: { name: '叙事', acronym: '叙事' },
            progress: { name: '进度', acronym: '进度' },
            chronologue: { name: '编年史', acronym: '编年' },
            gossamer: { name: 'Gossamer', acronym: '蛛丝' },
        },
        subplotRing: {
            allScenes: '全部场景',
            mainPlot: '主情节',
            chronologue: '编年史',
        },
        grid: {
            statusHeader: {
                todo: '待',
                working: '进',
                completed: '完',
                due: '期',
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
        yes: '是',
        no: '否',
        cancel: '取消',
        save: '保存',
        reset: '重置',
        enable: '启用',
        disable: '禁用',
        loading: '加载中...',
        error: '错误',
        success: '成功',
    },
    inquiry: {
        help: {
            tooltip: 'Inquiry 使用方法',
            configTooltip: 'Inquiry 尚未配置。\n请在设置 -> Inquiry 中配置存储场景、书籍和大纲的 Inquiry 目录。\n然后明确选择要为所选范围包含的类。',
            noScenesTooltip: '在当前范围内未找到场景。\n请在设置 -> Inquiry 中配置存储场景、书籍和大纲的 Inquiry 目录。\n然后明确选择要为所选范围包含的类。',
            corpusTooltip: '语料库已禁用。\n要运行 Inquiry，请在语料库条中启用语料库范围。',
            resultsTooltip: '在迷你地图中查看材料引用以获取细化反馈。\n查看 Brief 以获取完整详情。',
            runningTooltip: 'Inquiry 正在处理 API 运行。\n你可以切换到其他笔记继续工作，但请保持此 Inquiry 选项卡打开。',
            runningSingleTooltip: 'Inquiry 正在处理此问题。\n你可以切换到其他笔记继续工作，但请保持此 Inquiry 选项卡打开。\n如果你取消此运行，必须从头开始，无法恢复。',
            onboardingTooltip: '编号按钮显示问题和负载。点击以使用 AI 处理问题。Flow 与 Depth 环用于调整响应的视角。迷你地图显示上下文引用。',
        },
        mobile: {
            title: '需要桌面端',
            subtitle: 'Inquiry 仅在桌面端可用。Brief 在移动端仍可阅读。',
            openBriefs: '打开 Briefs 文件夹',
            viewLatest: '查看最新 Brief',
        },
        nav: {
            bookUnresolved: '书籍范围未解析。请检查 Inquiry 源。',
            waitingForProvider: '等待提供商响应。',
            welcome: '欢迎使用 Inquiry。{{weekday}} {{month}} {{day}}{{ordinal}}。',
            previousBook: '上一本书。',
            nextBook: '下一本书。',
            noPreviousBook: '没有上一本书。',
            noNextBook: '没有下一本书。',
        },
        navTooltip: {
            scopeToggle: '在 Book 与 Saga 范围之间切换。',
            flowLens: '切换到 Flow 视角。',
            depthLens: '切换到 Depth 视角。',
            modeIconToggle: '在 Flow 与 Depth 视角之间切换。',
            focusRingToggle: '切换聚焦环展开。',
            previousBook: '上一本书。',
            nextBook: '下一本书。',
        },
        runner: {
            contactingProvider: 'Inquiry：正在连接 AI 提供商。',
            running: '当前运行中（{{evidenceMode}}）。预计完成 {{estimateLabel}}。',
            cancelRequested: '已请求取消 Inquiry。当前回合返回后停止；已发出的提供商请求可能仍会完成。',
            finalizing: '已收到提供商响应。正在最终化结果。',
            waiting: '等待提供商响应。',
            runAborted: 'Inquiry 运行已中止。',
            inquiryAlreadyRunning: 'Inquiry 已在运行中。',
            inquiryNotConfigured: 'Inquiry 尚未配置。',
            noScenesAvailable: '没有可供 Inquiry 使用的场景。',
            noEnabledQuestions: '未找到已启用的 Inquiry 问题。',
        },
        notice: {
            aiDisabledInSettings: 'Inquiry 需要启用 AI 功能。请在设置中开启「启用 AI LLM 功能」。',
            omnibusViewFailed: '无法打开用于 Omnibus pass 的 Inquiry 视图。',
            omnibusMobileOnly: 'Inquiry omnibus pass 仅在桌面端可用。',
            omnibusResumeNothing: '所有问题均已完成。没有可恢复的内容。',
            running: 'Inquiry 运行中。请稍候。',
            noEnabledQuestions: '未找到已启用的 Inquiry 问题。',
            logNotFound: '此运行没有找到 Inquiry 日志。',
            briefNotFound: '未找到 Brief。可能已移动或删除。',
            briefSaved: 'Inquiry brief 已保存。',
            briefNotSaved: '当前 inquiry 没有保存的 brief。',
            noBriefActive: '没有活动的 inquiry brief。',
            sceneNotFound: '未找到场景文件。',
            noRunForPreview: '请先运行 inquiry，再预览报告。',
            noRunForSave: '请先运行 inquiry，再保存 brief。',
            noBriefs: '未找到任何 Brief。',
            fileExplorerUnavailable: '文件管理器不可用。',
        },
        interaction: {
            running: 'Inquiry 运行中。请稍候。',
            noQuestionsForZone: '此区域未配置问题。',
            noQuestionForSlot: '此插槽未配置问题。',
            targetScenesBookOnly: '目标场景仅在 Book 范围内可用。',
            targetSceneAdded: '已添加到目标场景。',
            targetSceneRemoved: '已从目标场景移除。',
            clearedAllTargetScenes: '已清除所有目标场景。',
            corpusDisabled: '语料库已禁用。请启用语料库以运行 Inquiry。',
            inquiryAlreadyRun: 'Inquiry 已运行过。打开最近的 Inquiry 会话查看。',
        },
        menu: {
            forceRerun: '强制重新运行',
            openCitationBriefing: '在简报文章中打开引用',
            openCitationMarkdown: '在 Markdown Brief 中打开引用',
            openScene: '打开场景',
            openNote: '打开笔记',
            cancelTargeting: '取消所有定位',
        },
        findings: {
            findings: '发现',
            noInquiryRun: '尚未运行 Inquiry。',
            runToSeeVerdicts: '运行 Inquiry 以查看判定。',
            selectionDiscover: '选择模式 · 发现',
            targetSection: '目标发现',
            contextSection: '上下文发现',
            empty: '无。',
        },
        preview: {
            footerOpenLog: '打开 Inquiry 日志查看详细错误报告。',
            hoverPreview: '悬停在问题上以预览负载。',
            noScenesHero: '没有可供 Inquiry 使用的场景。',
        },
        details: {
            toggle: '切换详情',
        },
        corpus: {
            disabled: '语料库已禁用。请启用语料库以运行 Inquiry。',
            legendClickKeysTitle: '点击键',
            legendModeTitle: '模式（图标 + 颜色）',
            legendStatusTitle: '状态（边框）',
            legendTierTitle: '层级（填充级别）',
            statusOverdueLabel: '已逾期',
            statusTodoLabel: '待办',
            statusWorkingLabel: '进行中',
            statusCompleteLabel: '已完成',
        },
        settingsExtra: {
            autopopulateName: '自动填充待编辑',
            autopopulateDesc: '每次 Inquiry 运行后，自动将操作笔记写入 Pending Edits YAML 字段。关闭时使用最近的 Inquiry 会话手动写入。',
            replaceQuestionsTitle: '替换当前问题？',
            replaceCustomizedQuestionsTitle: '替换自定义问题？',
            replaceQuestionsConfirm: '替换问题',
            replaceCustomTitle: '替换自定义问题？',
            replaceCustomConfirm: '替换问题',
            replaceCanonicalTitle: '替换标准问题？',
            collapse: '折叠',
            expand: '展开',
        },
    },
    bookDesigner: {
        saveTemplate: {
            badge: '场景集',
            title: '保存场景布局',
            subtitle: '为此布局命名以便日后重用。',
            nameField: {
                name: '布局名称',
                desc: '请使用简短且唯一的名称。',
                placeholder: '例如：惊悚 / 三幕平衡',
            },
            note: '模板包含布局、幕、副情节、人物、节拍开关，以及所选 YAML 类型（基本/高级）。',
            nameRequired: '模板名称为必填项。',
        },
        deleteTemplate: {
            title: '删除布局',
            subtitle: '确定删除 "{{name}}" 吗？此操作无法撤销。',
        },
        demoProject: {
            badge: '演示',
            title: '生成非线性演示项目',
            subtitle: '创建一个 20 场景、5 幕的示例，展示叙事顺序（读者遇到场景的顺序）与时间顺序（事件实际发生的顺序）之间的差异。场景编号按叙事顺序为 1–20，但日期和时间会前后跳跃 — 生成后请打开 START HERE 笔记查看，并在 Timeline 与 Chronologue 视图之间切换进行比较。',
            startDate: {
                name: '起始日期',
                desc: '用于时间线节奏。格式：YYYY-MM-DD。',
            },
            note: '这也会确保工作区配置为五幕，以便演示正确呈现。',
            generate: '生成演示项目',
            invalidDate: '请使用 YYYY-MM-DD 格式的有效起始日期。',
        },
        modal: {
            badge: '设置',
            title: '书籍设计器',
            subtitle: '为新小说配置并生成框架。在预览中将场景拖到不同的幕和副情节上即可激活手动模式。保存模板以便日后重用。',
            wikiAriaLabel: '在 Wiki 中阅读更多',
            noBookSelected: '未选择书籍',
            untitled: '无标题',
        },
        meta: {
            autoMode: '自动模式',
            manualMode: '手动模式',
            manualLayoutActive: '手动布局已启用',
            autoDistribution: '自动分配',
            fromTemplate: ' · 来自模板',
        },
        sections: {
            locationStructure: '位置与结构',
            contentConfiguration: '内容配置',
            sceneSetsExtras: '场景集与附加',
        },
        fields: {
            targetBook: {
                name: '目标书籍',
                desc: '选择创建场景和节拍的 Book Manager 项目。',
                noBooks: '未配置书籍',
                addFirstNote: '在此生成框架之前，请在 Book Manager 中添加书籍并设置其文件夹。',
            },
            timeIncrement: {
                name: '每个场景的日期递增',
                desc: '场景之间的时间递增（例如 1 小时、1 天、1 周）。设为 0 可禁用递增。',
                placeholder: '1 day',
                invalid: '无效的时长："{{raw}}"。已恢复为 {{current}}。',
            },
            scenes: {
                name: '要生成的场景数',
                desc: '要创建的带 YAML frontmatter 的模板场景文件数量。',
            },
            targetLength: {
                name: '目标书籍长度',
                desc: '用于编号分配（例如 10、20、30...）',
                detail: '场景将编号为：{{examples}}{{suffix}}，基于 {{scenes}} 个场景跨 {{max}} 个单位。',
            },
            acts: {
                label: '分配场景的幕',
                actLabel: '第 {{num}} 幕',
            },
            subplots: {
                name: '副情节',
                desc: '每行输入一个副情节。',
            },
            characters: {
                name: '人物',
                desc: '每行输入一个人物。',
            },
            sceneSet: {
                label: '场景集',
                base: '基础场景集',
                advanced: '高级属性',
            },
            generateBeats: {
                withSystem: '生成 {{name}} 节拍',
                noSystem: '无活动节拍系统',
                tooltipNoSystem: '在“设置 → 节拍”中选择节拍系统以启用节拍生成。',
                existsAria: '此文件夹中已存在节拍笔记',
                noSystemAria: '请先在“设置 → 节拍”中选择节拍系统',
                yes: '是',
                no: '否',
            },
            sceneLayouts: {
                name: '场景布局',
                desc: '选择已保存的布局（幕、副情节、分配、元数据）。',
                newOption: '新建模板',
                emptyOption: '—',
            },
        },
        preview: {
            title: '预览',
            dragging: '正在拖动场景 {{scene}} → 第 {{act}} 幕，{{subplot}}',
            subplotFallback: '副情节 {{num}}',
        },
        buttons: {
            saveSceneSet: '保存场景集',
            reset: '重置',
            demoProject: '演示项目',
            deleteLayout: '删除布局',
            createBook: '创建书籍',
            save: '保存',
            delete: '删除',
            cancel: '取消',
        },
        notes: {
            layoutTemplatesIncludes: '包含场景、幕、副情节、节拍和时间安排。',
        },
        notices: {
            layoutReset: '布局已重置为带自动分配的默认值。',
            templateDeleted: '模板已删除。',
            templateNotFound: '未找到模板。',
            templateSaved: '模板 "{{name}}" 已保存。',
            templateUpdated: '模板 "{{name}}" 已更新。',
            templateApplied: '已应用模板 "{{name}}"。',
            selectBookForDemo: '生成演示项目之前，请选择带文件夹的 Book Manager 书籍。',
            selectBookForGenerate: '生成场景之前，请选择带文件夹的 Book Manager 书籍。',
            folderError: '创建文件夹错误：{{error}}',
            baseSetMissing: '设置中未找到基础场景集。请先设置场景集再生成。',
            generating: '正在生成 {{count}} 个场景...',
            beatsExist: '此文件夹中已存在节拍笔记（找到 {{count}} 个）。请使用设置中的节拍管理器进行修复或重新同步。',
            noBeatSystemActive: '此书籍未选择活动节拍系统。在创建节拍笔记之前，请在节拍管理器中选择。',
            beatsError: '创建节拍错误：{{error}}',
            bookCreated: '书籍已创建！{{scenes}} 个场景{{skipped}}{{beats}}。',
            bookCreatedSkipped: '（跳过 {{count}} 个已存在）',
            bookCreatedBeatsExist: '（节拍已存在）',
            bookCreatedBeats: '，{{count}} 个节拍笔记',
            demoReady: '演示项目准备就绪：{{scenes}} 个场景、{{notes}} 个笔记、{{beats}} 个节拍笔记。{{skipped}}',
            demoSkipped: ' 已跳过 {{scenes}} 个已存在场景和 {{notes}} 个已存在笔记。',
        },
    },
    gossamer: {
        scoreModal: {
            beatSystemTitle: '{{label}} 节拍系统',
            subtitle: '为每个节拍输入 {{signal}} 分数（0-100）。之前的分数将作为历史记录保存。',
            signalMeta: '信号: {{label}}',
            beatsDetectedMeta: '检测到的节拍: {{count}}',
            enterScoreLabel: '输入分数',
            scorePlaceholder: '0-100',
            groupMaintenance: '维护',
            groupAi: 'AI 工作流',
            normalizeButton: '规范化历史',
            deleteButton: '删除 {{label}} 分数',
            copyButton: '复制 AI 提示',
            pasteButton: '粘贴 AI 响应',
            saveButton: '保存分数',
            cancelButton: '取消',
            aiMetaVaultLink: 'vault 文件',
            normalizeNothing: '没有要规范化的 Gossamer 历史。',
            clipboardEmpty: '剪贴板为空。',
            clipboardReadFailed: '无法读取剪贴板。',
            noChanges: '没有要保存的更改。',
            saveFailed: '保存分数失败。请查看控制台了解详情。',
            deleteConfirmBadge: '警告',
            deleteConfirmCancel: '取消',
            normalizeConfirmBadge: '警告',
            normalizeConfirmTitle: '规范化 Gossamer 历史？',
            normalizeConfirmButton: '规范化',
            normalizeConfirmCancel: '取消',
        },
        processingModal: {
            statusInitializing: '正在初始化...',
            backgroundContinues: '分析在后台继续。',
            modelDisabled: 'AI 已禁用',
            beginButton: '开始分析',
            cancelButton: '取消',
            analyzingManuscript: '正在分析手稿...',
            assemblingManuscript: '正在组装手稿...',
            statusHeading: '状态',
            waitingToSend: '等待发送...',
            closeButton: '关闭',
            statScenes: '场景',
            statWords: '字数',
            statBeats: '故事节拍',
            statEvidence: '证据',
            analysisComplete: '分析完成',
            analysisFailed: '分析失败',
            apiFailed: '✗ API 调用失败',
        },
        notices: {
            noStoryBeats: '未找到故事节拍。请创建带有 "Class: Beat" 前置数据的笔记。',
            cannotEnterMode: '无法进入 Gossamer 模式。{{hint}}',
            validating: '正在验证配置...',
            loadingBeats: '正在加载故事节拍...',
            updatingBeats: '正在更新节拍笔记...',
            generatingLog: '正在生成分析日志...',
            processingFailed: '处理失败: {{error}}',
        },
        service: {
            noBeatsUpdated: '没有更新任何节拍。',
        },
    },
};
