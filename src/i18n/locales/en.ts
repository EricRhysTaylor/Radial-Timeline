/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * English translations (source of truth)
 * 
 * All keys MUST be defined here. Other locales can provide partial translations
 * and will fall back to English for missing keys.
 * 
 * Naming conventions:
 * - Use dot notation for hierarchy: settings.general.sourcePath.name
 * - 'name' = setting title, 'desc' = setting description
 * - 'heading' = section headings
 * - Use {{variable}} for dynamic content
 */

// Define the shape of translations (allows any string value)
export interface TranslationKeys {
    settings: {
        general: {
            sourcePath: {
                name: string;
                desc: string;
                placeholder: string;
            };
            /** @deprecated Kept for structural compat; not rendered in UI. */
            showTitle: {
                name: string;
                desc: string;
            };
        };
        pov: {
            heading: string;
            global: {
                name: string;
                desc: string;
            };
            yamlOverrides: {
                name: string;
                desc: string;
            };
            modes: {
                off: string;
                first: string;
                second: string;
                third: string;
                omni: string;
                objective: string;
            };
            preview: {
                heading: string;
                examples: {
                    sceneFirst: string;
                    sceneThird: string;
                    sceneSecond: string;
                    sceneOmni: string;
                    sceneObjective: string;
                    countTwoThird: string;
                    countThreeThird: string;
                    countFourThird: string;
                    countTwoFirstNumeric: string;
                    countAllFirst: string;
                };
            };
        };
        configuration: {
            heading: string;
            aiOutputFolder: {
                name: string;
                desc: string;
                placeholder: string;
            };
            manuscriptOutputFolder: {
                name: string;
                desc: string;
                placeholder: string;
            };
            outlineOutputFolder: {
                name: string;
                desc: string;
                placeholder: string;
            };
            synopsisMaxLines: {
                name: string;
                desc: string;
                placeholder: string;
                error: string;
            };
            rippleRename: {
                name: string;
                desc: string;
            };
            autoExpand: {
                name: string;
                desc: string;
            };
            chapterMarkers: {
                name: string;
                desc: string;
            };
            readability: {
                name: string;
                desc: string;
                normal: string;
                large: string;
            };
            showEstimate: {
                name: string;
                desc: string;
            };
            debounce: {
                name: string;
                desc: string;
                placeholder: string;
                error: string;
            };
        };
        ai: {
            heading: string;
            enable: {
                name: string;
                desc: string;
            };
            hero: {
                badgeText: string;
                wikiAriaLabel: string;
                toggleInactive: string;
                toggleActive: string;
                toggleAriaLabel: string;
                titleActive: string;
                titleInactive: string;
                descriptionActive: string;
                highlightsKicker: string;
                featureInquiry: string;
                featurePulse: string;
                featureGossamer: string;
                featureForceMultiplier: string;
            };
            heroOff: {
                descriptionPrimary: string;
                descriptionSecondary: string;
                toolsKicker: string;
                featureInquiry: string;
                featurePulse: string;
                featureGossamer: string;
                featureEnhanced: string;
                muted: string;
            };
            strategy: { title: string; desc: string; };
            costEstimate: { title: string; desc: string; corpusCalculating: string; corpusScanning: string; };
            provider: { name: string; desc: string; optionAnthropic: string; optionOpenai: string; optionGoogle: string; optionLocalLlm: string; };
            modelOverride: { name: string; desc: string; };
            accessTier: { name: string; desc: string; tier1: string; tier2: string; tier3: string; tier4: string; };
            executionPreference: { name: string; desc: string; optionAutomatic: string; optionSinglePass: string; optionSegmented: string; noteSinglePass: string; noteSegmented: string; };
            largeHandling: { name: string; };
            roleContext: { title: string; desc: string; };
            apiKeys: { name: string; };
            configuration: { name: string; };
            contextTemplate: { name: string; tooltip: string; };
            preview: { kicker: string; resolving: string; providerPlaceholder: string; };
            secureKey: { unavailableName: string; unavailableDesc: string; migrateName: string; migrateDesc: string; migrateButton: string; noLegacyKeysNotice: string; };
            credential: { statusReady: string; statusRejected: string; statusNetworkBlocked: string; statusChecking: string; statusNotConfigured: string; helperNotConfigured: string; helperRejected: string; helperNetworkBlocked: string; helperChecking: string; replaceKeyButton: string; copyKeyNameButton: string; keyNameCopiedNotice: string; keyNameCopyFailNotice: string; placeholderAnthropic: string; placeholderGoogle: string; placeholderOpenai: string; };
            localLlm: { configTitle: string; configDesc: string; statusTitle: string; statusDesc: string; serverName: string; serverDesc: string; modelsLoading: string; noModelsAuto: string; noModelsCustom: string; legendNotUsable: string; legendLimited: string; legendStrong: string; legendInquiryEligible: string; modelActive: string; actionsName: string; actionsDesc: string; loadServersButton: string; loadModelsButton: string; validateButton: string; loadModelsTooltip: string; };
            localLlmConfig: { serverName: string; serverDesc: string; optionOllama: string; optionLmStudio: string; optionOpenaiCompat: string; baseUrlName: string; baseUrlDesc: string; manualModelName: string; manualModelDesc: string; };
            config: { timelineDisplayTitle: string; pulseContextName: string; pulseContextDesc: string; synopsisMaxWordsName: string; synopsisMaxWordsDesc: string; synopsisMaxWordsInvalid: string; summaryRefreshTitle: string; targetSummaryName: string; targetSummaryDesc: string; targetSummaryInvalid: string; weakThresholdName: string; weakThresholdDesc: string; weakThresholdInvalid: string; alsoUpdateSynopsisName: string; alsoUpdateSynopsisDesc: string; };
        };
        publication: {
            heading: string;
            completionEstimate: {
                heading: string;
                scenesComplete: string;
                remaining: string;
                perWeek: string;
                completedFraction: string;
                estimatedCompletion: string;
                daysFromNow: string;
                insufficientData: string;
                projectionHeading: string;
                projectionHeadingLastPace: string;
                lastProgress: string;
            };
        };
        chronologue: {
            heading: string;
        };
        storyBeats: {
            heading: string;
        };
        colors: {
            heading: string;
        };
        beats: {
            acts: { name: string };
            actCount: { name: string; desc: string; placeholder: string };
            actLabels: { name: string; desc: string; placeholder: string };
            storyBeatsSystem: { name: string };
            systemEditModal: {
                badge: string;
                title: string;
                subtitle: string;
                nameLabel: string;
                namePlaceholder: string;
                descLabel: string;
                descPlaceholder: string;
                nameRequiredNotice: string;
                nameLettersNotice: string;
                saveText: string;
                cancelText: string;
            };
            design: {
                builtInTag: string;
                starterTag: string;
                savedTag: string;
                builtInTagTooltip: string;
                starterTagTooltip: string;
                savedTagTooltip: string;
                builtInDirtyTooltip: string;
                starterDirtyTooltip: string;
                savedDirtyTooltip: string;
                modifiedLabel: string;
                guidance: string;
                beatNamesNotice: string;
                beatNameNotice: string;
                beatNamePlaceholder: string;
                newBeatPlaceholder: string;
                addBeatAriaLabel: string;
                dragTooltip: string;
                rangeTooltip: string;
                setSavedNotice: string;
                noActiveSystemNotice: string;
            };
            stages: {
                preview: string;
                design: string;
                fields: string;
            };
            beatNotes: {
                name: string;
                desc: string;
                createText: string;
                createTooltip: string;
                repairText: string;
                repairTooltip: string;
            };
            beatFields: {
                name: string;
                desc: string;
                baseFieldsHeading: string;
                customFieldsHeading: string;
                dragTooltip: string;
                iconPlaceholder: string;
                iconTooltip: string;
                hoverCheckboxTooltip: string;
                keyPlaceholder: string;
                keyRequiredNotice: string;
                baseFieldNotice: string;
                legacyKeyNotice: string;
                keyExistsNotice: string;
                commaSeparatedPlaceholder: string;
                defaultValuePlaceholder: string;
                removeFieldLabel: string;
                newKeyPlaceholder: string;
                valuePlaceholder: string;
                addPropertyTooltip: string;
                revertTooltip: string;
            };
            resetModal: {
                badge: string;
                title: string;
                subtitle: string;
                confirmText: string;
                resetText: string;
                cancelText: string;
            };
            hoverPreview: {
                heading: string;
                headingNoneEnabled: string;
                enableHint: string;
            };
            library: {
                heading: string;
                desc: string;
                addSystemLabel: string;
                selectLabel: string;
                narrativeGroup: string;
                engineGroup: string;
                formatGroup: string;
                savedGroup: string;
                blankGroup: string;
                blankSystemTag: string;
                librarySystemTag: string;
                savedSystemTag: string;
                loadedStatus: string;
                activeStatus: string;
                createBlankText: string;
                focusTabText: string;
                openTabText: string;
                saveAsCopyText: string;
                resetToDefaultText: string;
            };
            deleteModal: {
                subtitleWithNotes: string;
                scopePrefix: string;
                beatNote: string;
                warningExtra: string;
                warningTemplate: string;
                typeDeletePrompt: string;
                cancelText: string;
            };
            saveModal: {
                badge: string;
                copyTitle: string;
                saveTitle: string;
                copySubtitle: string;
                saveSubtitle: string;
                namePlaceholder: string;
                saveText: string;
                cancelText: string;
                beatNamesNotice: string;
                noBeatsNotice: string;
                nameRequiredNotice: string;
            };
            backdrop: {
                name: string;
                desc: string;
                showLabel: string;
                hideLabel: string;
                iconTooltip: string;
                hoverCheckboxTooltip: string;
                addFieldTooltip: string;
                revertTooltip: string;
                systemManagedNotice: string;
                baseFieldNotice: string;
                legacyKeyNotice: string;
                hoverPreviewHeading: string;
                hoverPreviewNoneEnabled: string;
                hoverPreviewEnableHint: string;
            };
            audit: {
                copyTooltip: string;
                copiedNotice: string;
                insertFieldsText: string;
                insertFieldsTooltip: string;
                insertIdsText: string;
                insertIdsTooltip: string;
                fixDuplicateIdsText: string;
                fixDuplicateIdsTooltip: string;
                fillEmptyText: string;
                fillEmptyTooltip: string;
                migrateDeprecatedText: string;
                migrateDeprecatedTooltip: string;
                removeUnusedText: string;
                removeUnusedTooltip: string;
                deleteCustomText: string;
                deleteCustomTooltip: string;
                reorderText: string;
                reorderTooltip: string;
                saveChangesText: string;
                saveChangesTooltip: string;
                checkNotesText: string;
                healthClean: string;
                healthMixed: string;
                healthNeedsAttention: string;
                healthCritical: string;
                healthUnsafe: string;
            };
        };
        runtime: {
            header: { name: string; desc: string; badgeText: string; };
            rates: { name: string; };
            contentType: { name: string; desc: string; optionNovel: string; optionScreenplay: string; };
            dialogueWpm: { name: string; desc: string; };
            actionWpm: { name: string; desc: string; };
            parenthetical: {
                beat: { name: string; desc: string; };
                pause: { name: string; desc: string; };
                longPause: { name: string; desc: string; };
                moment: { name: string; desc: string; };
                silence: { name: string; desc: string; };
                resetTooltip: string;
            };
            narrationWpm: { name: string; desc: string; };
            sessionPlanning: { name: string; desc: string; };
            draftingWpm: { name: string; desc: string; };
            dailyMinutes: { name: string; desc: string; };
            patterns: { heading: string; seconds: string; minutes: string; runtime: string; allow: string; };
            profile: {
                defaultSuffix: string; name: string; noneFallback: string;
                duplicateTooltip: string; renameTooltip: string; renameTitle: string;
                okButton: string; cancelButton: string; deleteTooltip: string;
                alreadyDefaultTooltip: string; setDefaultTooltip: string;
                desc: string;
            };
        };
        inquiry: {
            time: { justNow: string; };
            session: { scopeSaga: string; scopeBook: string; scopeWithLabel: string; };
            contribution: { excluded: string; summary: string; full: string; };
            corpus: { errorEmptyMax: string; errorSketchyMin: string; errorMediumMin: string; errorSubstantiveMin: string; resetTooltip: string; name: string; desc: string; };
            prompts: { name: string; proTag: string; alreadyAddedTag: string; alreadyAdded: string; dragToReorder: string; labelPlaceholder: string; fixedTemplate: string; replaceWithTemplate: string; applyCanonical: string; resetToCanonical: string; deleteQuestion: string; questionPlaceholder: string; customizedQuestion: string; unlockProGhost: string; chooseCanonical: string; noRemainingCanonical: string; addQuestion: string; zoneFullNote: string; };
            sources: { name: string; };
            booksForInquiry: { name: string; desc: string; buttonText: string; ariaLabel: string; };
            scanRoots: { name: string; desc: string; placeholder: string; characterFolder: string; placeFolder: string; heredityFolder: string; commonSupportFolders: string; tooManyFolders: string; };
            supportingMaterial: { name: string; nameWithCount: string; };
            materialRules: { name: string; desc: string; };
            classScope: { name: string; desc: string; placeholder: string; };
            presets: { name: string; desc: string; default: string; light: string; deep: string; };
            classTable: { enabled: string; class: string; book: string; saga: string; reference: string; matches: string; matchCount: string; };
            bookStatus: { ready: string; missingScenesAndOutline: string; missingScenes: string; missingOutline: string; };
            booksTable: { sequence: string; book: string; detectedMaterial: string; status: string; empty: string; materialCounts: string; };
            supportingTable: { material: string; matches: string; empty: string; };
            zone: { setup: string; pressure: string; payoff: string; };
            modal: { badge: string; cancel: string; };
            canonicalLibrary: { name: string; descPro: string; descFree: string; loadFullProSet: string; loadAllTooltip: string; loadCoreQuestions: string; };
            corpusTable: { tier: string; threshold: string; };
            corpusTier: { empty: string; sketchy: string; medium: string; substantive: string; };
            highlightLowSubstance: { name: string; desc: string; };
            config: { name: string; desc: string; };
            briefingFolder: { name: string; desc: string; invalidChars: string; };
            autoSave: { name: string; desc: string; };
            actionNotesField: { name: string; desc: string; resetTooltip: string; };
            historyLimit: { name: string; desc: string; };
            recentSessions: { name: string; reopenFailed: string; empty: string; fallbackTitle: string; };
        };
        authorProgress: {
            hero: { badgeRefresh: string; badgeDefault: string; wikiAriaLabel: string; title: string; desc: string; keyBenefitsHeading: string; featureSpoilerSafe: string; featureShareable: string; featureStageWeighted: string; };
            preview: { sizeLabel: string; actualSizePreview: string; teaserAuto: string; teaserRing: string; teaserScenes: string; teaserColor: string; teaserComplete: string; loading: string; lastUpdateNever: string; kickstarterReady: string; patreonFriendly: string; emptyState: string; renderError: string; lastUpdate: string; };
            configuration: { name: string; desc: string; projectPath: { name: string; desc: string; placeholder: string; }; linkUrl: { name: string; desc: string; placeholder: string; }; autoUpdateExportPaths: { name: string; desc: string; }; };
            styling: {
                name: string; desc: string; choosePaletteButton: string;
                fontDefault: string; fontInter: string; fontSystemUI: string; fontExo: string; fontRoboto: string; fontMontserrat: string; fontOpenSans: string; fontDancingScript: string; fontCaveat: string;
                weightLight: string; weightLightItalic: string; weightNormal: string; weightNormalItalic: string; weightMedium: string; weightMediumItalic: string; weightSemiBold: string; weightSemiBoldItalic: string; weightBold: string; weightBoldItalic: string; weightExtraBold: string; weightExtraBoldItalic: string; weightBlack: string; weightBlackItalic: string;
                customFontModal: { customOption: string; title: string; hint: string; placeholder: string; cancel: string; save: string; };
                autoButton: string;
                title: { label: string; desc: string; };
                author: { label: string; desc: string; placeholder: string; };
                percentSymbol: { label: string; desc: string; };
                percentNumber: { label: string; desc: string; };
                stageBadge: { label: string; desc: string; };
                transparentMode: { name: string; desc: string; };
                backgroundColor: { name: string; desc: string; };
                spokesAndBorders: { name: string; desc: string; };
                strokeLightStrokes: string; strokeDarkStrokes: string; strokeNoStrokes: string; strokeCustomColor: string;
            };
            publishing: {
                name: string;
                updateFrequency: { name: string; desc: string; };
                frequencyManual: string; frequencyDaily: string; frequencyWeekly: string; frequencyMonthly: string;
                refreshAlertThreshold: { name: string; desc: string; };
                exportPath: { name: string; desc: string; };
                autoUpdateExportPaths: { name: string; desc: string; };
                proTeaser: { wantMore: string; enhanceWorkflow: string; desc: string; upgradeLink: string; };
            };
            progressMode: {
                name: string; desc: string; detecting: string; dateRangePlaceholder: string; dateRangeFormat: string;
                noScenesFound: string; noProgressEstimate: string; basedOnEstimate: string;
                errorEnterBothDates: string; errorUseDateFormat: string; errorStartBeforeTarget: string;
                zeroMode: string; dateTargetMode: string; guidanceZero: string; guidanceDate: string;
                publishStageAuto: string; guidancePublishStage: string;
                stageDetected: string;
            };
            attribution: { name: string; desc: string; };
        };
    };
    timelineRepairModal: {
        config: { badge: string; title: string; subtitle: string; statTotalScenes: string; statWithWhen: string; statMissingWhen: string; previewButton: string; cancelButton: string; };
        anchor: { name: string; desc: string; dateLabel: string; timeLabel: string; };
        preview: { name: string; };
        pattern: { name: string; desc: string; };
        refinements: { name: string; desc: string; baseScaffoldTitle: string; baseScaffoldDesc: string; alwaysOn: string; textCuesTitle: string; textCuesDesc: string; };
        analyzing: { badge: string; title: string; statusApplying: string; preparing: string; abortButton: string; abortedNotice: string; phasePattern: string; phaseCues: string; phaseComplete: string; };
        review: { badge: string; title: string; subtitle: string; filterNeedsReview: string; filterTextCues: string; rippleMode: string; rippleModeHelp: string; undoButton: string; redoButton: string; backButton: string; applyButton: string; emptyFilter: string; untitled: string; warningBackwardTime: string; warningLargeGap: string; dayMinus: string; dayPlus: string; summaryChanged: string; summaryNeedReview: string; summarySelected: string; };
        apply: { noChangesNotice: string; partialNotice: string; successNotice: string; };
        confirm: { title: string; warning: string; applyButton: string; cancelButton: string; description: string; };
    };
    timelineAuditModal: {
        header: { badge: string; title: string; subtitle: string; aiEnhancedBadge: string; };
        loading: { title: string; description: string; };
        actions: { abort: string; reRunAudit: string; applyAccepted: string; close: string; };
        empty: { noResults: string; noFindings: string; };
        scope: { entireVault: string; activeScope: string; };
        stats: { totalScenes: string; aligned: string; warnings: string; contradictions: string; missingWhen: string; };
        filters: { all: string; contradictions: string; missingWhen: string; summaryBodyDisagreement: string; continuityProblems: string; aiSuggested: string; unresolved: string; };
        controls: { title: string; };
        instantCard: { title: string; description: string; status: string; continuityPassToggle: string; continuityPassDesc: string; };
        aiCard: { title: string; aiEnhancedBadge: string; description: string; actionRunning: string; actionReRun: string; actionStart: string; };
        aiStatus: { inProgress: string; complete: string; failed: string; notStarted: string; runningBackground: string; failedRetry: string; notStartedHint: string; progressCount: string; progressCountWithScene: string; completedAgo: string; };
        relativeTime: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string; };
        overview: { title: string; };
        detail: { whatYamlSays: string; chronologyNotPlaced: string; whatManuscriptImplies: string; noAlternatePosition: string; noSuggestedWhen: string; whyFlagged: string; whatAuthorCanDo: string; actionEligible: string; actionIneligible: string; noEvidence: string; applyButton: string; keepButton: string; markReviewButton: string; noRationale: string; whenMissing: string; formatWhenMissing: string; chronologyPosition: string; suggestedWhen: string; evidenceLabel: string; whenInvalid: string; whenCurrent: string; };
        evidenceSource: { summary: string; synopsis: string; body: string; neighbor: string; ai: string; };
        evidenceTier: { direct: string; strongInference: string; ambiguous: string; };
        detectionSource: { deterministic: string; continuity: string; ai: string; };
        notices: { applySuccess: string; applyPartial: string; };
    };
    timeline: {
        acts: {
            act1: string;
            act2: string;
            act3: string;
        };
        /** @deprecated Kept for structural compat; use DEFAULT_BOOK_TITLE instead. */
        workInProgress: string;
    };
    commands: {
        openTimeline: string;
        openInquiry: string;
        inquiryOmnibusPass: string;
        searchTimeline: string;
        createNote: string;
        manageSubplots: string;
        bookDesigner: string;
        timelineOrder: string;
        timelineAudit: string;
        manuscriptExport: string;
        planetaryTimeCalculator: string;
        gossamerScoreManager: string;
        gossamerAnalysis: string;
        authorProgressReport: string;
    };
    common: {
        yes: string;
        no: string;
        cancel: string;
        save: string;
        reset: string;
        enable: string;
        disable: string;
        loading: string;
        error: string;
        success: string;
    };
    notices: {
        settingsSaved: string;
        invalidInput: string;
    };
    manuscriptModal: {
        badge: string;
        title: string;
        description: string;
        heroLoading: string;
        heroNarrativeMeta: string;
        exportHeading: string;
        exportTypeManuscript: string;
        exportTypeOutline: string;
        proBadge: string;
        proRequired: string;
        proEnabled: string;
        manuscriptPresetHeading: string;
        presetNovel: string;
        presetNovelDesc: string;
        presetScreenplay: string;
        presetScreenplayDesc: string;
        presetPodcast: string;
        presetPodcastDesc: string;
        outlineBeatSheetDesc: string;
        outlineEpisodeRundownDesc: string;
        outlineShootingScheduleDesc: string;
        outlineIndexCardsDesc: string;
        formatMarkdown: string;
        formatPdf: string;
        formatCsv: string;
        formatJson: string;
        outlinePresetHeading: string;
        outlineBeatSheet: string;
        outlineEpisodeRundown: string;
        outlineShootingSchedule: string;
        outlineIndexCardsCsv: string;
        outlineIndexCardsJson: string;
        tocHeading: string;
        tocPlain: string;
        tocMarkdown: string;
        tocNone: string;
        tocNote: string;
        orderHeading: string;
        orderNarrative: string;
        orderReverseNarrative: string;
        orderChronological: string;
        orderReverseChronological: string;
        orderNote: string;
        rangeHeading: string;
        rangeFirst: string;
        rangeLast: string;
        rangeAllLabel: string;
        rangeSingleLabel: string;
        rangeSelectedLabel: string;
        rangeCountLabel: string;
        rangeStatus: string;
        rangeLoading: string;
        rangeDecimalWarning: string;
        actionCreate: string;
        actionCancel: string;
        emptyNotice: string;
        templateNotConfigured: string;
        templateNotFound: string;
        templateFound: string;
        configureInSettings: string;
        rangeEmpty: string;
        loadError: string;
        wordCountHeading: string;
        wordCountToggle: string;
        wordCountNote: string;
        includeSynopsis: string;
        includeSynopsisNote: string;
    };
    planetary: {
        heading: string;
        enable: { name: string; desc: string; };
        active: { name: string; desc: string; disabled: string; };
        actions: { add: string; delete: string; };
        fields: {
            profileName: string;
            hoursPerDay: string;
            daysPerWeek: string;
            daysPerYear: string;
            epochOffset: string;
            epochLabel: string;
            monthNames: string;
            weekdayNames: string;
        };
        preview: {
            heading: string;
            invalid: string;
            empty: string;
            disabled: string;
        };
        modal: {
            title: string;
            activeProfile: string;
            datetimeLabel: string;
            datetimeDesc: string;
            now: string;
            convert: string;
            noProfile: string;
            disabled: string;
            invalid: string;
        };
        synopsis: { prefix: string; };
        tooltip: { altHint: string; };
    };
}

// ═══════════════════════════════════════════════════════════════════
// ENGLISH TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════
export const en: TranslationKeys = {
    settings: {
        general: {
            sourcePath: {
                name: 'Source path',
                desc: 'Specify the root folder containing your manuscript scene files.',
                placeholder: 'Example: Manuscript/Scenes',
            },
            /** @deprecated Legacy toggle — book title is now set via Book Profiles. */
            showTitle: {
                name: 'Legacy: source path title (deprecated)',
                desc: 'This setting is no longer used. Book title is managed via Book Profiles in General settings.',
            },
        },
        pov: {
            heading: 'Point of view',
            global: {
                name: 'Global POV',
                desc: 'Choose a default mode to apply. Scene level POV will override this global setting.',
            },
            yamlOverrides: {
                name: 'Scene override examples',
                desc: 'In scene frontmatter, you can use `POV:` first, second, third, omni, objective, or a number such as two, four, count, or all to designate more than one character is carrying the scene POV. Count values mark the first N names in `Character:` and use the Global POV mode to choose the marker.',
            },
            modes: {
                off: 'Legacy (first listed character, POV)',
                first: 'First-person voice (¹)',
                second: 'Second-person voice (You²)',
                third: 'Third-person limited (³)',
                omni: 'Omni narrator (Omni³)',
                objective: 'Objective — camera-eye narrator (Narrator°)',
            },
            preview: {
                heading: 'POV EXAMPLES',
                examples: {
                    sceneFirst: 'Scene YAML: POV: first | Character: [Alice]',
                    sceneThird: 'Scene YAML: POV: third | Character: [Bob]',
                    sceneSecond: 'Scene YAML: POV: second | Character: [Alice, Bob]',
                    sceneOmni: 'Scene YAML: POV: omni | Character: [Alice, Bob]',
                    sceneObjective: 'Scene YAML: POV: objective | Character: [Alice, Bob]',
                    countTwoThird: 'Global setting: POV = third | Scene YAML: POV: two | Character: [Alice, Bob]',
                    countThreeThird: 'Global setting: POV = third | Scene YAML: POV: three | Character: [Alice, Bob, Charlie]',
                    countFourThird: 'Global setting: POV = third | Scene YAML: POV: four | Character: [Alice, Bob, Charlie, Diana]',
                    countTwoFirstNumeric: 'Global setting: POV = first | Scene YAML: POV: 2 | Character: [Alice, Bob]',
                    countAllFirst: 'Global setting: POV = first | Scene YAML: POV: all | Character: [Alice, Bob, Charlie]',
                },
            },
        },
        configuration: {
            heading: 'Configuration',
            aiOutputFolder: {
                name: 'Logs & generated files output folder',
                desc: 'Folder where AI logs and local LLM reports are saved. Default: Radial Timeline/Logs.',
                placeholder: 'Radial Timeline/Logs',
            },
            manuscriptOutputFolder: {
                name: 'Export folder',
                desc: 'Folder where manuscript, outline, and cue card exports (Markdown, PDF, beat sheets, index cards) are saved. Default: Radial Timeline/Export.',
                placeholder: 'Radial Timeline/Export',
            },
            outlineOutputFolder: {
                name: 'Outline export folder (legacy)',
                desc: 'Legacy setting. Outline exports now use the shared Export folder. Default: Radial Timeline/Export.',
                placeholder: 'Radial Timeline/Export',
            },
            synopsisMaxLines: {
                name: 'Synopsis max words',
                desc: 'Maximum words for generated Synopsis. Hover display is synced automatically from this value.',
                placeholder: '30',
                error: 'Please enter a valid number between 10 and 300.',
            },
            rippleRename: {
                name: 'Manuscript ripple rename: normalize numeric prefixes after drag reorder.',
                desc: 'Renames scene and active-beat filenames only. Scenes stay integer (1, 2, 3). Beats become decimal minors (1.01, 1.02).',
            },
            autoExpand: {
                name: 'Auto-expand clipped scene titles',
                desc: 'When hovering over a scene, automatically expand it if the title text is clipped. Disable this if you prefer to quickly slide through scenes and read titles from the synopsis instead.',
            },
            chapterMarkers: {
                name: 'Show chapter markers',
                desc: 'Display chapter boundaries as small double ticks on the Narrative all-scenes ring.',
            },
            readability: {
                name: 'Readability size',
                desc: 'Choose a curated font sizing profile for select timeline text. Large may be helpful for low-res screens; Normal is recommended for standard and high-dpi displays.',
                normal: 'Normal',
                large: 'Large',
            },
            showEstimate: {
                name: 'Show estimated completion date',
                desc: 'Display a tick mark and label on the timeline for the estimated completion date. Tip: When you complete a scene, in addition to setting the Status to Complete, also set the Due date to the same day the scene was completed to improve the estimate.',
            },
            debounce: {
                name: 'Metadata refresh debounce (ms)',
                desc: 'Delay before refreshing the timeline after YAML frontmatter changes. Increase if your vault is large and updates feel too frequent.',
                placeholder: 'e.g., 10000',
                error: 'Please enter a non-negative number.',
            },
        },
        ai: {
            heading: 'AI LLM configuration',
            enable: {
                name: 'Enable AI LLM features',
                desc: 'Show command palette options and UI scene analysis colors and hover synopsis. When off, these visuals are hidden, but metadata remains unchanged.',
            },
            hero: {
                badgeText: 'AI',
                wikiAriaLabel: 'Read more in the Wiki',
                toggleInactive: 'Inactive',
                toggleActive: 'Active',
                toggleAriaLabel: 'Enable AI features',
                titleActive: 'A deep editorial lens for your manuscript.',
                titleInactive: 'AI guidance is currently paused.',
                descriptionActive: 'Radial Timeline uses AI to help authors prepare their work for editorial review\u2014by beta readers, collaborators, and professional editors. It analyzes structure, momentum, and continuity across scenes, helping the author identify gaps, surface contradictions, and strengthen narrative clarity.',
                highlightsKicker: 'AI HIGHLIGHTS',
                featureInquiry: 'Inquiry - Ask precise, cross-scene questions and receive structured editorial feedback.',
                featurePulse: 'Pulse (Triplet Analysis) - Examine scenes in context using Radial Timeline\u2019s three-scene lens.',
                featureGossamer: 'Gossamer Momentum - Measure beat-level tension and narrative drive.',
                featureForceMultiplier: 'Force multiplier - Expand analytical reach while saving time with contextual, actionable insight.',
            },
            heroOff: {
                descriptionPrimary: 'Your manuscript is being shaped through human judgment, revision, and creative instinct. Radial Timeline continues to support structure, sequencing, and story architecture without automated analysis.',
                descriptionSecondary: 'AI in Radial Timeline is editorial in nature and supports your goals as a writer or author. It can be enabled at any time when you want an additional layer of structured insight.',
                toolsKicker: 'AI TOOLS AVAILABLE WHEN ENABLED',
                featureInquiry: 'Inquiry - Cross-scene structural analysis via custom inquiry questions.',
                featurePulse: 'Pulse (Triplet Analysis) - Context-aware scene evaluation.',
                featureGossamer: 'Gossamer Momentum - Beat-level narrative momentum mapping.',
                featureEnhanced: 'Enhanced features such as scene summaries & runtime estimates - Tools that speed workflow.',
                muted: 'Your voice leads. AI supports.',
            },
            strategy: {
                title: 'AI Strategy',
                desc: 'Set how AI selects its model and how deeply it analyzes your manuscript.',
            },
            costEstimate: {
                title: 'AI Cost Estimate',
                desc: 'Cost estimates based on the current Inquiry scope. Includes scenes, outlines, and reference documents according to Inquiry settings.',
                corpusCalculating: 'Inquiry Corpus: Calculating...',
                corpusScanning: 'Scanning corpus...',
            },
            provider: {
                name: 'Provider',
                desc: 'Select the AI service or Local LLM runtime that powers structural analysis and editorial insight.',
                optionAnthropic: 'Anthropic',
                optionOpenai: 'OpenAI',
                optionGoogle: 'Google',
                optionLocalLlm: 'Local LLM',
            },
            modelOverride: {
                name: 'Model',
                desc: 'Choose Auto to use the latest stable model, or pick a specific model.',
            },
            accessTier: {
                name: 'Access',
                desc: 'Increase available context headroom if your provider has granted you a higher Tier.',
                tier1: 'Tier 1',
                tier2: 'Tier 2',
                tier3: 'Tier 3',
                tier4: 'Tier 4',
            },
            executionPreference: {
                name: 'Execution preference',
                desc: 'Choose how large requests are handled during Inquiry. Automatic is recommended.',
                optionAutomatic: 'Automatic',
                optionSinglePass: 'Single-pass only',
                optionSegmented: 'Segmented (always split)',
                noteSinglePass: 'Runs only when the Inquiry corpus fits one pass. Otherwise reduce scope or switch to Automatic.',
                noteSegmented: 'Always splits the run into structured passes, even when one pass would fit.',
            },
            largeHandling: {
                name: 'What gets sent to the AI',
            },
            roleContext: {
                title: 'Role context',
                desc: 'Active role and context framing used for AI submissions. Applied to Inquiry, Pulse (Triplet Analysis), Gossamer Momentum, Summary Refresh, Runtime AI Estimation.',
            },
            apiKeys: {
                name: 'API keys',
            },
            configuration: {
                name: 'Configuration',
            },
            contextTemplate: {
                name: 'AI prompt role & context template',
                tooltip: 'Manage context templates for AI prompt generation and Gossamer score generation',
            },
            preview: {
                kicker: 'PREVIEW (ACTIVE MODEL)',
                resolving: 'Resolving...',
                providerPlaceholder: 'Provider: \u2014',
            },
            secureKey: {
                unavailableName: 'Secure key saving unavailable',
                unavailableDesc: 'Secure key saving is unavailable in this Obsidian build. Provider API keys cannot be configured until secret storage is available.',
                migrateName: 'Secure my saved keys',
                migrateDesc: 'Moves older provider key fields into private saved keys and clears plaintext values.',
                migrateButton: 'Secure now',
                noLegacyKeysNotice: 'No legacy provider keys were available to migrate.',
            },
            credential: {
                statusReady: 'Status: Ready \u2713',
                statusRejected: 'Status: Key rejected',
                statusNetworkBlocked: 'Status: Provider validation failed',
                statusChecking: 'Status: Checking key...',
                statusNotConfigured: 'Status: Not configured',
                helperNotConfigured: 'Paste a key to enable this provider.',
                helperRejected: 'Paste a new key to replace the saved one.',
                helperNetworkBlocked: 'Provider could not be reached. You can still replace the key below.',
                helperChecking: 'Validating saved key with the provider...',
                replaceKeyButton: 'Replace key...',
                copyKeyNameButton: 'Copy key name',
                keyNameCopiedNotice: 'Saved key name copied.',
                keyNameCopyFailNotice: 'Unable to copy saved key name.',
                placeholderAnthropic: 'Enter your Anthropic API key',
                placeholderGoogle: 'Enter your Google API key',
                placeholderOpenai: 'Enter your OpenAI API key',
            },
            localLlm: {
                configTitle: 'Local LLM Configuration',
                configDesc: 'Override the auto-detected Local LLM setup only when the standard path fails or you need a deliberate custom transport.',
                statusTitle: 'Local LLM Status / Validation',
                statusDesc: 'Auto-configuration diagnostics for the current Local LLM setup. This stays visible so you can confirm connection, validation, and capability.',
                serverName: 'Local server',
                serverDesc: 'Choose between detected local runtimes when more than one healthy server is available.',
                modelsLoading: 'Checking the local server and loading available models...',
                noModelsAuto: 'No local models are loaded yet. This list will appear when a healthy local server responds.',
                noModelsCustom: 'No local models are loaded yet. Use the actions below to check the selected local server.',
                legendNotUsable: 'Not usable',
                legendLimited: 'Limited',
                legendStrong: 'Strong',
                legendInquiryEligible: 'Inquiry eligible',
                modelActive: 'Active',
                actionsName: 'Local setup actions',
                actionsDesc: 'Use these actions when Local server detection, model loading, or validation needs another pass.',
                loadServersButton: 'Load Servers',
                loadModelsButton: 'Load Models',
                validateButton: 'Validate Local LLM',
                loadModelsTooltip: 'Load models from the selected local server',
            },
            localLlmConfig: {
                serverName: 'Local server',
                serverDesc: 'Choose the local server/runtime behind the Local LLM path. Server-specific transport stays below this seam.',
                optionOllama: 'Ollama',
                optionLmStudio: 'LM Studio',
                optionOpenaiCompat: 'OpenAI-Compatible',
                baseUrlName: 'Base URL',
                baseUrlDesc: 'The API endpoint for the selected Local server. For example: Ollama "http://localhost:11434/v1" or LM Studio "http://localhost:1234/v1".',
                manualModelName: 'Manual model ID (fallback)',
                manualModelDesc: 'Only use this if automatic model discovery cannot find the model you want. The AI Strategy model dropdown above is now the primary local model selector.',
            },
            config: {
                timelineDisplayTitle: 'Timeline Display',
                pulseContextName: 'Pulse context',
                pulseContextDesc: 'Include previous and next scenes in triplet analysis hover reveal. (Does not affect the underlying scene properties.)',
                synopsisMaxWordsName: 'Synopsis max words',
                synopsisMaxWordsDesc: 'Base cap for generated Synopsis text. Hover can use a little more when space allows, but this remains the stored Synopsis target.',
                synopsisMaxWordsInvalid: 'Synopsis length must be between 10 and 300 words.',
                summaryRefreshTitle: 'Summary Refresh Defaults',
                targetSummaryName: 'Target summary length',
                targetSummaryDesc: 'Default word count used when opening Summary refresh. You can still change it per run.',
                targetSummaryInvalid: 'Target summary length must be between 75 and 500 words.',
                weakThresholdName: 'Treat summary as weak if under',
                weakThresholdDesc: 'Default threshold used to decide which scenes are selected for Summary refresh.',
                weakThresholdInvalid: 'Weak summary threshold must be between 10 and 300 words.',
                alsoUpdateSynopsisName: 'Also update Synopsis',
                alsoUpdateSynopsisDesc: 'When enabled, Summary refresh also writes Synopsis using the configured Synopsis max words.',
            },
        },
        publication: {
            heading: 'Publication & Progress',
            completionEstimate: {
                heading: 'Completion Estimate \u2022 {{stage}} Stage',
                scenesComplete: 'Scenes Complete',
                remaining: 'Remaining',
                perWeek: 'Per Week',
                completedFraction: '{{completed}}/{{total}}',
                estimatedCompletion: 'Estimated Completion:',
                daysFromNow: '({{days}} days from now)',
                insufficientData: 'Insufficient data to calculate',
                projectionHeading: 'Monthly Progress Projection',
                projectionHeadingLastPace: 'Monthly Progress Projection (based on last known pace)',
                lastProgress: 'Last progress: {{date}} ({{days}} days ago) \u2022 {{window}}-day rolling window',
            },
        },
        chronologue: {
            heading: 'Chronologue Mode',
        },
        storyBeats: {
            heading: 'Story Beats & Gossamer',
        },
        colors: {
            heading: 'Colors',
        },
        beats: {
            acts: { name: 'Acts' },
            actCount: {
                name: 'Act count',
                desc: 'Applies to Narrative, Publication, and Gossamer modes. Scene and Beat properties. (Minimum 3)',
                placeholder: '3',
            },
            actLabels: {
                name: 'Act labels (optional)',
                desc: 'Comma-separated labels. Leave blank for Act 1, Act 2, Act 3. Examples: "1, 2, 3, 4" or "Spring, Summer, Fall, Winter".',
                placeholder: 'Act 1, Act 2, Act 3',
            },
            storyBeatsSystem: { name: 'Story beats system' },
            systemEditModal: {
                badge: 'Edit',
                title: 'Edit custom system details',
                subtitle: 'This name identifies your beat system and appears in each beat note\'s frontmatter.',
                nameLabel: 'System name',
                namePlaceholder: 'Custom beats',
                descLabel: 'Description (optional)',
                descPlaceholder: 'Describe the purpose of this beat system...',
                nameRequiredNotice: 'Please enter a system name with letters or numbers.',
                nameLettersNotice: 'System name must include letters or numbers.',
                saveText: 'Save',
                cancelText: 'Cancel',
            },
            design: {
                builtInTag: 'Built-in set',
                starterTag: 'Starter set',
                savedTag: 'Saved set',
                builtInTagTooltip: 'Save a copy to turn this into a saved set.',
                starterTagTooltip: 'Save a copy to edit.',
                savedTagTooltip: 'Last saved version is current.',
                builtInDirtyTooltip: 'Built-in set has been changed. Save a copy to keep your version.',
                starterDirtyTooltip: 'Starter set has been changed. Save a copy to keep your version.',
                savedDirtyTooltip: 'Changes have been made since last save.',
                modifiedLabel: 'Modified',
                guidance: 'Create beats from the row at the bottom: enter a beat name, optional range, choose an act, then click + (or press Enter). Drag beats to reorder or drop them into another act. Use Beat notes below to create or repair beat files in your vault.',
                beatNamesNotice: 'Beat names must include letters or numbers.',
                beatNameNotice: 'Beat name must include letters or numbers.',
                beatNamePlaceholder: 'Beat name',
                newBeatPlaceholder: 'New beat',
                addBeatAriaLabel: 'Add beat',
                dragTooltip: 'Drag to reorder beat',
                rangeTooltip: 'Gossamer momentum range (e.g. 10-20)',
                setSavedNotice: 'Set saved. You can run the audit now.',
                noActiveSystemNotice: 'No active beat system selected.',
            },
            stages: {
                preview: 'Preview',
                design: 'Design',
                fields: 'Fields',
            },
            beatNotes: {
                name: 'Beat notes',
                desc: 'Create beat note files in your vault based on the selected story structure system.',
                createText: 'Create beat notes',
                createTooltip: 'Create beat note files in your source path',
                repairText: 'Repair beat notes',
                repairTooltip: 'Update Act and Beat Model in frontmatter for misaligned beat notes. Prefix numbers are not changed.',
            },
            beatFields: {
                name: 'Beat fields',
                desc: 'Customize additional properties for beat notes. Enable fields to show in beat hover info. Use the audit below to check conformity across existing beat notes.',
                baseFieldsHeading: 'Base fields (read-only)',
                customFieldsHeading: 'Custom fields',
                dragTooltip: 'Drag to reorder',
                iconPlaceholder: 'Icon name...',
                iconTooltip: 'Lucide icon name for hover synopsis',
                hoverCheckboxTooltip: 'Show in beat hover synopsis',
                keyPlaceholder: 'Key',
                keyRequiredNotice: 'Field key must include letters or numbers.',
                baseFieldNotice: 'is a base beat field. Choose another name.',
                legacyKeyNotice: 'is a legacy beat key. Use "Purpose" instead.',
                keyExistsNotice: 'Key "{{key}}" already exists.',
                commaSeparatedPlaceholder: 'Comma-separated values',
                defaultValuePlaceholder: 'Default value (optional)',
                removeFieldLabel: 'Remove field',
                newKeyPlaceholder: 'New key',
                valuePlaceholder: 'Value',
                addPropertyTooltip: 'Add custom beat property',
                revertTooltip: 'Revert beat properties to default',
            },
            resetModal: {
                badge: 'Warning',
                title: 'Reset beat properties',
                subtitle: 'Resetting will delete all custom beat properties, lucide icons, and restore the defaults.',
                confirmText: 'Are you sure you want to reset? This cannot be undone.',
                resetText: 'Reset to default',
                cancelText: 'Cancel',
            },
            hoverPreview: {
                heading: 'Beat Hover Metadata Preview',
                headingNoneEnabled: 'Beat Hover Metadata Preview (none enabled)',
                enableHint: 'Enable fields using the checkboxes above to show them in beat hover synopsis.',
            },
            library: {
                heading: 'Beat system sets',
                desc: 'Library systems are ready-to-use structural lenses. Saved sets are your own versions you can edit and delete.',
                addSystemLabel: 'Add system',
                selectLabel: 'Select a set',
                narrativeGroup: 'Narrative Frameworks',
                engineGroup: 'Story Engines',
                formatGroup: 'Format Structures',
                savedGroup: 'Saved systems',
                blankGroup: 'Blank / Custom',
                blankSystemTag: 'Blank system',
                librarySystemTag: 'Library system',
                savedSystemTag: 'Saved system',
                loadedStatus: 'Loaded in workspace',
                activeStatus: 'Active in timeline',
                createBlankText: 'Create blank system',
                focusTabText: 'Focus tab',
                openTabText: 'Open tab',
                saveAsCopyText: 'Save as copy',
                resetToDefaultText: 'Reset to default',
            },
            deleteModal: {
                subtitleWithNotes: 'This moves beat notes to trash. The set definition remains available in Add system.',
                scopePrefix: 'Scope: ',
                beatNote: 'beat note',
                warningExtra: 'Any custom properties with values will be lost, including all data entry in non-template fields.',
                warningTemplate: 'Any custom properties with values will be lost, including all data entry.',
                typeDeletePrompt: 'Type DELETE to confirm:',
                cancelText: 'Cancel',
            },
            saveModal: {
                badge: 'BEAT SYSTEM',
                copyTitle: 'Save a copy',
                saveTitle: 'Save set',
                copySubtitle: 'Create an editable copy of this starter set. The original stays unchanged.',
                saveSubtitle: 'Enter a name for this set. Existing sets with the same name will be updated.',
                namePlaceholder: 'Set name',
                saveText: 'Save',
                cancelText: 'Cancel',
                beatNamesNotice: 'Beat names must include letters or numbers before saving a set.',
                noBeatsNotice: 'No beats defined. Add beats before saving.',
                nameRequiredNotice: 'Set name must include letters or numbers.',
            },
            backdrop: {
                name: 'Backdrop properties editor',
                desc: 'Customize additional YAML keys for backdrop notes. Enable fields to show in backdrop hover synopsis.',
                showLabel: 'Show backdrop properties editor',
                hideLabel: 'Hide backdrop properties editor',
                iconTooltip: 'Lucide icon name for hover synopsis',
                hoverCheckboxTooltip: 'Show in backdrop hover synopsis',
                addFieldTooltip: 'Add custom field',
                revertTooltip: 'Clear all custom backdrop fields',
                systemManagedNotice: 'is system-managed. Use "Insert missing IDs" from the audit panel instead.',
                baseFieldNotice: 'is a base field and cannot be used as a custom key.',
                legacyKeyNotice: 'is a legacy backdrop key. Use "Context" instead.',
                hoverPreviewHeading: 'Backdrop Hover Metadata Preview',
                hoverPreviewNoneEnabled: 'Backdrop Hover Metadata Preview (none enabled)',
                hoverPreviewEnableHint: 'Enable fields using the checkboxes above to show them in backdrop hover synopsis.',
            },
            audit: {
                copyTooltip: 'Copy status report to clipboard',
                copiedNotice: 'Audit report copied to clipboard.',
                insertFieldsText: 'Insert missing fields',
                insertFieldsTooltip: 'Add missing custom fields to existing notes',
                insertIdsText: 'Insert missing IDs',
                insertIdsTooltip: 'Insert missing Reference IDs in this scope',
                fixDuplicateIdsText: 'Fix duplicate IDs',
                fixDuplicateIdsTooltip: 'Reassign duplicate Reference IDs in this scope',
                fillEmptyText: 'Fill empty values',
                fillEmptyTooltip: 'Fill empty existing custom beat fields in the active book folder',
                migrateDeprecatedText: 'Migrate deprecated fields',
                migrateDeprecatedTooltip: 'Migrate deprecated YAML keys to canonical fields before cleanup',
                removeUnusedText: 'Remove unused fields',
                removeUnusedTooltip: 'Remove frontmatter fields not defined in the current property rules',
                deleteCustomText: 'Delete custom fields',
                deleteCustomTooltip: 'Remove custom template fields from existing notes (base fields are preserved)',
                reorderText: 'Reorder properties',
                reorderTooltip: 'Reorder frontmatter properties to match the canonical template order',
                saveChangesText: 'Save changes',
                saveChangesTooltip: 'Save changes before running beat audit',
                checkNotesText: 'Check notes',
                healthClean: 'Clean',
                healthMixed: 'Some cleanup needed',
                healthNeedsAttention: 'Missing required properties',
                healthCritical: 'Critical property issues',
                healthUnsafe: 'Unsafe notes detected',
            },
        },
        runtime: {
            header: {
                name: 'Runtime estimation',
                desc: 'Activate runtime estimate sub-mode in Chronologue Mode, timeline hover text, and command palette runtime estimator.',
                badgeText: 'Pro',
            },
            rates: { name: 'Rates & timings' },
            contentType: {
                name: 'Content type',
                desc: 'Novel calculates all text at narration pace. Screenplay separates dialogue from action.',
                optionNovel: 'Novel / Audiobook',
                optionScreenplay: 'Screenplay',
            },
            dialogueWpm: { name: 'Dialogue words per minute', desc: 'Reading speed for quoted dialogue.' },
            actionWpm: { name: 'Action words per minute', desc: 'Reading speed for scene descriptions and action lines.' },
            parenthetical: {
                beat: { name: '(beat)', desc: 'Brief pause. Parenthetical timings — seconds added when screenplay directives are detected.' },
                pause: { name: '(pause)', desc: 'Standard pause' },
                longPause: { name: '(long pause)', desc: 'Extended silence' },
                moment: { name: '(a moment)', desc: 'Reflective beat' },
                silence: { name: '(silence)', desc: 'Atmospheric pause' },
                resetTooltip: 'Reset to default',
            },
            narrationWpm: { name: 'Narration words per minute', desc: 'Reading pace for all content (audiobook narration).' },
            sessionPlanning: { name: 'Session planning (optional)', desc: 'Used in the Outline export: Index cards (JSON) summary to estimate writing hours and total sessions.' },
            draftingWpm: { name: 'Drafting words per minute (optional)', desc: 'Your writing speed for session time estimates.' },
            dailyMinutes: { name: 'Daily minutes available (optional)', desc: 'For shooting schedule time estimates.' },
            patterns: {
                heading: 'Explicit duration patterns are always parsed and added to runtime:',
                seconds: '(30 seconds) or (30s)',
                minutes: '(2 minutes) or (2m)',
                runtime: '(runtime: 3m)',
                allow: '(allow 5 minutes) — for demos, podcasts',
            },
            profile: {
                defaultSuffix: ' (default)',
                name: 'Profile',
                noneFallback: 'None',
                duplicateTooltip: 'Duplicate profile',
                renameTooltip: 'Rename profile',
                renameTitle: 'Rename profile',
                okButton: 'OK',
                cancelButton: 'Cancel',
                deleteTooltip: 'Delete profile',
                alreadyDefaultTooltip: 'Already default',
                setDefaultTooltip: 'Set as default',
                desc: 'Select, rename, duplicate, delete, or set as default. Current default: {{current}}',
            },
        },
        inquiry: {
            time: { justNow: 'just now' },
            session: { scopeSaga: 'Saga', scopeBook: 'Book', scopeWithLabel: '{{scope}} {{label}}' },
            contribution: { excluded: 'Excluded', summary: 'Summary', full: 'Full' },
            corpus: {
                errorEmptyMax: 'Empty max must be a non-negative number.',
                errorSketchyMin: 'Sketchy min must be greater than Empty max.',
                errorMediumMin: 'Medium min must be greater than Sketchy min.',
                errorSubstantiveMin: 'Substantive min must be greater than Medium min.',
                resetTooltip: 'Reset CC thresholds',
                name: 'Corpus (CC)',
                desc: 'Highlight content quality and completeness according to your quality standards. Thresholds are based on content-only word counts (frontmatter excluded).',
            },
            prompts: {
                name: 'Inquiry prompts',
                proTag: 'Pro',
                alreadyAddedTag: 'Already added',
                alreadyAdded: 'Already added \u2014 moved to existing question',
                dragToReorder: 'Drag to reorder',
                labelPlaceholder: 'Label (optional)',
                fixedTemplate: 'Fixed template',
                replaceWithTemplate: 'Replace with template',
                applyCanonical: 'Apply selected canonical question',
                resetToCanonical: 'Reset to canonical question',
                deleteQuestion: 'Delete question',
                questionPlaceholder: 'Question text',
                customizedQuestion: 'Customized question',
                unlockProGhost: 'Unlock more custom questions with Pro',
                chooseCanonical: 'Or choose a canonical question',
                noRemainingCanonical: 'No remaining canonical questions',
                addQuestion: 'Add question',
                zoneFullNote: 'Delete a question to add a custom or remaining template question.',
            },
            sources: { name: 'Inquiry sources' },
            booksForInquiry: {
                name: 'Books for Inquiry',
                desc: 'Book Manager defines Inquiry books and their B1/B2/B3 sequence. Folder names stay vault-facing; row order drives traversal.',
                buttonText: 'Open Book Manager',
                ariaLabel: 'Open Book Manager',
            },
            scanRoots: {
                name: 'Supporting material folders',
                desc: 'Inquiry always uses scenes and outlines from Book Manager books. Add folders here only for extra supporting material such as characters, places, heredity, lore, or research.',
                placeholder: '/Character/\n/Place/\n/Heredity/\n/Lore/\n/Research/',
                characterFolder: 'Character folder',
                placeFolder: 'Place folder',
                heredityFolder: 'Heredity folder',
                commonSupportFolders: 'Common support folders',
                tooManyFolders: 'Pattern expands to {{count}} folders; refine your root.',
            },
            supportingMaterial: { name: 'Detected supporting material', nameWithCount: 'Detected supporting material ({{count}})' },
            materialRules: { name: 'Material rules', desc: 'Define how each material type participates in Book, Saga, and Reference analysis.' },
            classScope: {
                name: 'Material types (advanced)',
                desc: 'Frontmatter Class values to include. One class per line. Use / to allow all classes. Empty = no classes allowed.',
                placeholder: 'scene\noutline\ncharacter\nplace',
            },
            presets: {
                name: 'Presets',
                desc: 'Quick starters for material rules. Apply one, then tweak as needed.',
                default: 'Default',
                light: 'Light',
                deep: 'Deep',
            },
            classTable: { enabled: 'Enabled', class: 'Class', book: 'Book', saga: 'Saga', reference: 'Reference', matches: 'Matches', matchCount: '{{count}} matches' },
            bookStatus: {
                ready: 'Ready',
                missingScenesAndOutline: 'Missing scenes + outline',
                missingScenes: 'Missing scenes',
                missingOutline: 'Missing outline',
            },
            booksTable: {
                sequence: 'Sequence',
                book: 'Book',
                detectedMaterial: 'Detected material',
                status: 'Status',
                empty: 'No Book Manager books are configured yet.',
                materialCounts: '{{sceneCount}} scenes \u00b7 {{outlineCount}} outlines',
            },
            supportingTable: {
                material: 'Material',
                matches: 'Matches',
                empty: 'No supporting material detected in the current supporting material folders.',
            },
            zone: { setup: 'Setup', pressure: 'Pressure', payoff: 'Payoff' },
            modal: { badge: 'INQUIRY', cancel: 'Cancel' },
            canonicalLibrary: {
                name: 'Canonical question library',
                descPro: 'Frame Inquiry across three zones: Setup, Pressure, and Payoff. Add your own custom questions, install curated questions line by line, or load the full Pro set across all zones at once.',
                descFree: 'Frame Inquiry across three zones: Setup, Pressure, and Payoff. Add your own custom questions, install curated questions line by line, or load the curated Core set across all zones at once.',
                loadFullProSet: 'Load Full Pro Set',
                loadAllTooltip: 'Load all canonical Inquiry questions',
                loadCoreQuestions: 'Load Core Questions',
            },
            corpusTable: { tier: 'Tier', threshold: 'Threshold' },
            corpusTier: { empty: 'Empty', sketchy: 'Sketchy', medium: 'Medium', substantive: 'Substantive' },
            highlightLowSubstance: { name: 'Highlight completed docs with low substance', desc: 'Flags completed notes that fall in Empty or Sketchy tiers.' },
            config: { name: 'Configuration', desc: 'Briefings, action notes, and recent session defaults for Inquiry briefs.' },
            briefingFolder: {
                name: 'Briefing folder',
                desc: 'Inquiry briefs are saved here when auto-save is enabled.',
                invalidChars: 'Folder path cannot contain the characters < > : " | ? *',
            },
            autoSave: { name: 'Auto-save Inquiry briefs', desc: 'Save a brief automatically after each successful Inquiry run.' },
            actionNotesField: {
                name: 'Action notes target YAML field',
                desc: 'Frontmatter field to receive Inquiry action notes. Default is "Pending Edits". Notes are appended after any existing content with a link to the Inquiry brief.',
                resetTooltip: 'Reset to default',
            },
            historyLimit: {
                name: 'Inquire session history',
                desc: 'This does not affect Inquiry Briefs. It relates only to Inquiry View rehydration, which loads previous sessions from the Session Manager Popover. Limited to a max of 100 sessions.',
            },
            recentSessions: {
                name: 'Recent sessions',
                reopenFailed: 'Unable to reopen this session right now.',
                empty: 'No recent sessions yet. Run Inquiry to populate this list.',
                fallbackTitle: 'Inquiry prompt',
            },
        },
        authorProgress: {
            hero: {
                badgeRefresh: 'Reminder to Refresh',
                badgeDefault: 'Share \u00b7 Social',
                wikiAriaLabel: 'Read more in the Wiki',
                title: 'Promote your latest work across social media.',
                desc: 'Generate vibrant, spoiler-safe progress graphics for social media and crowdfunding. Perfect for Kickstarter updates, Patreon posts, or sharing your writing journey with fans.',
                keyBenefitsHeading: 'Key Benefits:',
                featureSpoilerSafe: 'Spoiler-Safe \u2014 Scene titles and content are not part of the graphic build process.',
                featureShareable: 'Shareable \u2014 Export as static snapshot or live-updating embed',
                featureStageWeighted: 'Stage-Weighted Progress \u2014 Tracks advancement through Zero \u2192 Author \u2192 House \u2192 Press',
            },
            preview: {
                sizeLabel: 'Preview Size:',
                actualSizePreview: 'Actual size preview',
                teaserAuto: 'Auto (Current Stage)',
                teaserRing: 'Ring',
                teaserScenes: 'Scenes',
                teaserColor: 'Color',
                teaserComplete: 'Complete',
                loading: 'Loading preview...',
                lastUpdateNever: 'Never',
                kickstarterReady: 'Kickstarter ready',
                patreonFriendly: 'Patreon friendly',
                emptyState: 'Create scenes to see a preview of your Social report.',
                renderError: 'Failed to render preview.',
                lastUpdate: 'Last update: {{date}}',
            },
            configuration: {
                name: 'Configuration',
                desc: 'Configure your project settings and Social destination details, including project path and link URL.',
                projectPath: {
                    name: 'Project path',
                    desc: 'Project folder path for this Social target. Leave blank to use the main Source path.',
                    placeholder: 'Projects/My Novel',
                },
                linkUrl: {
                    name: 'Link URL',
                    desc: 'Where the graphic should link to (e.g. your website, Kickstarter, or shop).',
                    placeholder: 'https://your-site.com',
                },
                autoUpdateExportPaths: {
                    name: 'Auto-update export paths',
                    desc: 'When size or schedule changes, update default and campaign export paths if they still match the default pattern.',
                },
            },
            styling: {
                name: 'Styling',
                desc: 'Adjust colors, fonts and borders for your Social report. Configure the background based on the hosted location. Use the theme palette (keys off the Title color) to apply curated colors across Title, Author, % Symbol, and % Number. Manual edits override per row.',
                choosePaletteButton: 'Choose Palette',
                fontDefault: 'Default',
                fontInter: 'Inter',
                fontSystemUI: 'System UI',
                fontExo: 'Exo',
                fontRoboto: 'Roboto',
                fontMontserrat: 'Montserrat',
                fontOpenSans: 'Open Sans',
                fontDancingScript: 'Dancing Script',
                fontCaveat: 'Caveat',
                weightLight: 'Light (300)',
                weightLightItalic: 'Light Italic',
                weightNormal: 'Normal (400)',
                weightNormalItalic: 'Normal Italic',
                weightMedium: 'Medium (500)',
                weightMediumItalic: 'Medium Italic',
                weightSemiBold: 'Semi-Bold (600)',
                weightSemiBoldItalic: 'Semi-Bold Italic',
                weightBold: 'Bold (700)',
                weightBoldItalic: 'Bold Italic',
                weightExtraBold: 'Extra-Bold (800)',
                weightExtraBoldItalic: 'Extra-Bold Italic',
                weightBlack: 'Black (900)',
                weightBlackItalic: 'Black Italic',
                customFontModal: {
                    customOption: 'Custom...',
                    title: 'Custom font',
                    hint: 'Enter a font family available on your system.',
                    placeholder: 'e.g., EB Garamond',
                    cancel: 'Cancel',
                    save: 'Save',
                },
                autoButton: 'Auto',
                title: {
                    label: 'Title',
                    desc: 'Outer ring book title text. This color is used for the palette seed color.',
                },
                author: {
                    label: 'Author',
                    desc: 'Outer ring author name text.',
                    placeholder: 'Author Name',
                },
                percentSymbol: { label: '% Symbol', desc: 'Center percent symbol.' },
                percentNumber: { label: '% Number', desc: 'Center progress number.' },
                stageBadge: { label: 'Stage badge / RT mark', desc: 'Typography for the publish stage badge and the RT attribution mark.' },
                transparentMode: {
                    name: 'Transparent mode',
                    desc: 'No background fill \u2014 adapts to any page or app. Ideal for websites, blogs, and platforms that preserve SVG transparency.',
                },
                backgroundColor: {
                    name: 'Background color',
                    desc: 'Bakes in a solid background. Use when transparency isn\'t reliable: email newsletters, Kickstarter, PDF exports, or platforms that rasterize SVGs.',
                },
                spokesAndBorders: {
                    name: 'Spokes and borders',
                    desc: 'Choose contrasting color or none. Controls all structural elements including scene borders and act division spokes.',
                },
                strokeLightStrokes: 'Light Strokes',
                strokeDarkStrokes: 'Dark Strokes',
                strokeNoStrokes: 'No Strokes',
                strokeCustomColor: 'Custom Color',
            },
            publishing: {
                name: 'Publishing & automation',
                updateFrequency: {
                    name: 'Update frequency',
                    desc: 'How often to auto-update the live embed file. "Manual" requires clicking the update button in the Social modal.',
                },
                frequencyManual: 'Manual Only',
                frequencyDaily: 'Daily',
                frequencyWeekly: 'Weekly',
                frequencyMonthly: 'Monthly',
                refreshAlertThreshold: { name: 'Refresh alert threshold', desc: 'Days before showing a refresh reminder in the timeline view. Currently: {{days}} days.' },
                exportPath: { name: 'Export path', desc: 'Location for the live export file. Format follows the Social modal setting.' },
                autoUpdateExportPaths: {
                    name: 'Auto-update export paths',
                    desc: 'When size or schedule changes, update the default export path if it still matches the default pattern.',
                },
                proTeaser: {
                    wantMore: 'Want more?',
                    enhanceWorkflow: 'Enhance your workflow',
                    desc: 'Campaign manager lets you create multiple embeds with Teaser Reveal\u2014progressively show more detail as you write. Get access to Campaign manager and more Pro workflow features including runtime (RT) chronologue mode and Pandoc manuscript export templates.',
                    upgradeLink: 'Upgrade to Pro \u2192',
                },
            },
            progressMode: {
                name: 'Publish stage detection & progress mode',
                desc: 'Detects your current publish stage. In new projects, select between a target manuscript length (recommended) or date range.',
                detecting: 'DETECTING\u2026',
                dateRangePlaceholder: 'YYYY-MM-DD to YYYY-MM-DD',
                dateRangeFormat: 'Format: YYYY-MM-DD to YYYY-MM-DD.',
                noScenesFound: 'No scenes found yet; assuming Zero stage.',
                noProgressEstimate: 'No progress estimate available yet.',
                basedOnEstimate: 'Based on the progress estimate (active publish stage).',
                errorEnterBothDates: 'Enter both start and target dates (YYYY-MM-DD).',
                errorUseDateFormat: 'Use YYYY-MM-DD for both dates.',
                errorStartBeforeTarget: 'Start date must be before target date.',
                zeroMode: 'Zero Mode (End scene number created by Author)',
                dateTargetMode: 'Date Target Mode',
                guidanceZero: 'Zero Mode (recommended): create a placeholder final scene note with a high prefix number (e.g., "60 The End") to set intended total scene count.',
                guidanceDate: 'Date Mode: choose a start date and target completion date.',
                publishStageAuto: 'Publish-stage progress (auto)',
                guidancePublishStage: 'Using publish-stage progress.',
                stageDetected: '{{stage}} DETECTED',
            },
            attribution: {
                name: 'RT attribution',
                desc: 'Show the Radial Timeline attribution mark and link in Social exports.',
            },
        },
    },
    timelineRepairModal: {
        config: {
            badge: 'Quick Scaffold',
            title: 'Timeline order normalizer',
            subtitle: 'Quickly scaffold When dates from narrative order so Chronologue becomes usable. Uses pattern spacing and simple text cues. For deeper timeline analysis, use Timeline Audit. Scaffolds When values across the active book in narrative order and updates conflicting values.',
            statTotalScenes: 'Total Scenes',
            statWithWhen: 'With When',
            statMissingWhen: 'Missing When',
            previewButton: 'Preview Scaffold',
            cancelButton: 'Cancel',
        },
        anchor: {
            name: 'Anchor',
            desc: 'Set the starting When for scene 1.',
            dateLabel: 'Date',
            timeLabel: 'Time',
        },
        preview: { name: 'Scaffold preview' },
        pattern: { name: 'Pattern', desc: 'Apply the selected spacing pattern in narrative order.' },
        refinements: {
            name: 'Refinements',
            desc: 'Base scaffold assigns When values in narrative order using the selected pattern.',
            baseScaffoldTitle: 'Base scaffold',
            baseScaffoldDesc: 'Assigns When values across the active book using the selected pattern.',
            alwaysOn: 'Always on',
            textCuesTitle: 'Text cues',
            textCuesDesc: 'Detect simple phrases like "next morning" or "three days later".',
        },
        analyzing: {
            badge: 'Quick Scaffold',
            title: 'Scaffolding When dates...',
            statusApplying: 'Applying pattern spacing...',
            preparing: 'Preparing...',
            abortButton: 'Abort',
            abortedNotice: 'Scaffold aborted',
            phasePattern: 'Applying pattern spacing...',
            phaseCues: 'Checking simple text cues...',
            phaseComplete: 'Scaffold ready',
        },
        review: {
            badge: 'Quick Scaffold',
            title: 'Review scaffolded dates',
            subtitle: 'Adjust the scaffold before writing YAML. Review each proposed When value, use the filters to focus attention, and nudge days or swap time buckets where the scaffold misses intent. Ripple Mode shifts downstream scenes to preserve spacing; turn it off to edit a scene independently. J/K navigates the list, and [ and ] shift days.',
            filterNeedsReview: 'Needs Review',
            filterTextCues: 'Text cues',
            rippleMode: 'Ripple Mode',
            rippleModeHelp: 'Ripple Mode\nAdjusting a scene shifts all subsequent scenes to preserve spacing.\nTurn off to adjust scenes independently.',
            undoButton: 'Undo',
            redoButton: 'Redo',
            backButton: 'Back',
            applyButton: 'Apply When Dates',
            emptyFilter: 'No scenes match the current filters.',
            untitled: 'Untitled',
            warningBackwardTime: 'Backward time',
            warningLargeGap: 'Large time gap',
            dayMinus: '\u22121d',
            dayPlus: '+1d',
            summaryChanged: '{{count}} changed',
            summaryNeedReview: '{{count}} need review',
            summarySelected: '{{count}} selected',
        },
        apply: { noChangesNotice: 'No changes to apply', partialNotice: 'Applied {{success}} changes. {{failed}} failed.', successNotice: 'Successfully applied {{count}} timeline changes' },
        confirm: {
            title: 'Confirm Changes',
            warning: 'This action cannot be undone automatically. Make sure you have a backup if needed.',
            applyButton: 'Apply When Dates',
            cancelButton: 'Cancel',
            description: 'This will update {{count}} scene file(s) with scaffolded When dates and provenance metadata.',
        },
    },
    timelineAuditModal: {
        header: {
            badge: 'Timeline Audit',
            title: 'Evidence-based timeline diagnosis',
            subtitle: 'Timeline Audit checks each scene\'s YAML When value, summary, synopsis, and body text, then compares nearby scenes in chronology order. It looks for missing or invalid When values, time-of-day mismatches, suspicious jumps, and places where the written sequence appears to disagree with chronology. Direct text evidence counts more than inference, and AI remains optional. Use it to see where the timeline breaks before deciding what to change.',
            aiEnhancedBadge: 'AI-enhanced',
        },
        loading: {
            title: 'Running instant audit\u2026',
            description: 'Deterministic checks run first and continuity checks run next. AI audit only runs when you explicitly start it.',
        },
        actions: {
            abort: 'Abort',
            reRunAudit: 'Re-run audit',
            applyAccepted: 'Apply accepted changes',
            close: 'Close',
        },
        empty: {
            noResults: 'No audit results available.',
            noFindings: 'No findings match the current filter.',
        },
        scope: { entireVault: 'Entire vault', activeScope: 'Active scope: {{path}}' },
        stats: {
            totalScenes: 'Total scenes',
            aligned: 'Aligned',
            warnings: 'Warnings',
            contradictions: 'Contradictions',
            missingWhen: 'Missing When',
        },
        filters: {
            all: 'All',
            contradictions: 'Contradictions',
            missingWhen: 'Missing When',
            summaryBodyDisagreement: 'Summary/body disagreement',
            continuityProblems: 'Continuity problems',
            aiSuggested: 'AI-suggested',
            unresolved: 'Unresolved',
        },
        controls: { title: 'Audit actions' },
        instantCard: {
            title: 'Instant audit',
            description: 'Runs automatically when this window opens. Checks chronology, summary/body disagreement, and nearby scene continuity.',
            status: 'Already run for the current view.',
            continuityPassToggle: 'Continuity pass',
            continuityPassDesc: 'Checks neighboring scenes for suspicious jumps or impossible order.',
        },
        aiCard: {
            title: 'AI audit',
            aiEnhancedBadge: 'AI-enhanced',
            description: 'Uses AI to read scene evidence more deeply and surface subtler timeline inconsistencies. Runs in the background and can be revisited later.',
            actionRunning: 'Running AI audit\u2026',
            actionReRun: 'Re-run AI Audit',
            actionStart: 'Start AI Audit',
        },
        aiStatus: {
            inProgress: 'AI audit in progress',
            complete: 'AI audit complete',
            failed: 'AI audit failed',
            notStarted: 'AI audit not started',
            runningBackground: 'AI audit is running in the background.',
            failedRetry: 'Try starting the AI audit again.',
            notStartedHint: 'Instant audit is done. Start AI Audit to look for subtler timeline problems.',
            progressCount: '{{current}}/{{total}}',
            progressCountWithScene: '{{current}}/{{total}} \u00b7 {{scene}}',
            completedAgo: 'AI audit run {{time}}',
        },
        relativeTime: { justNow: 'just now', minutesAgo: '{{minutes}} min ago', hoursAgo: '{{hours}}h ago', daysAgo: '{{days}}d ago' },
        overview: { title: 'Timeline overview' },
        detail: {
            whatYamlSays: 'What YAML currently says',
            chronologyNotPlaced: 'Not placed because YAML does not place it safely.',
            whatManuscriptImplies: 'What the manuscript implies',
            noAlternatePosition: 'No reliable alternate timeline position inferred.',
            noSuggestedWhen: 'No safe replacement When suggested.',
            whyFlagged: 'Why this was flagged',
            whatAuthorCanDo: 'What the author can do',
            actionEligible: 'Apply the suggested When, keep YAML as-is, or mark for review.',
            actionIneligible: 'Keep YAML as-is or mark for review. Apply is disabled until evidence is safer.',
            noEvidence: 'No evidence snippets captured.',
            applyButton: 'Apply',
            keepButton: 'Keep',
            markReviewButton: 'Mark review',
            noRationale: 'No rationale recorded.',
            whenMissing: 'YAML When: missing from frontmatter.',
            formatWhenMissing: 'Missing',
            chronologyPosition: 'Chronology position: {{position}}',
            suggestedWhen: 'Suggested When: {{when}}',
            evidenceLabel: '{{source}} \u00b7 {{tier}}',
            whenInvalid: 'YAML When: invalid in frontmatter ({{raw}}).',
            whenCurrent: 'YAML When: {{when}}.',
        },
        evidenceSource: { summary: 'Summary', synopsis: 'Synopsis', body: 'Body', neighbor: 'Neighbor', ai: 'AI' },
        evidenceTier: { direct: 'Direct text', strongInference: 'Strong inference', ambiguous: 'Ambiguous cue' },
        detectionSource: { deterministic: 'Deterministic', continuity: 'Continuity', ai: 'AI' },
        notices: { applySuccess: 'Applied timeline audit decisions.', applyPartial: 'Applied timeline audit decisions — {{failed}} failed.' },
    },
    timeline: {
        acts: {
            act1: 'ACT I',
            act2: 'ACT II',
            act3: 'ACT III',
        },
        /** @deprecated No longer used — book title comes from Book Profiles. */
        workInProgress: 'Untitled Manuscript',
    },
    commands: {
        openTimeline: 'Open',
        openInquiry: 'Open inquiry',
        inquiryOmnibusPass: 'Inquiry omnibus pass',
        searchTimeline: 'Search timeline',
        createNote: 'Create note\u2026',
        manageSubplots: 'Manage subplots',
        bookDesigner: 'Book designer',
        timelineOrder: 'Timeline order',
        timelineAudit: 'Timeline audit',
        manuscriptExport: 'Manuscript export',
        planetaryTimeCalculator: 'Planetary time calculator',
        gossamerScoreManager: 'Gossamer score manager',
        gossamerAnalysis: 'Gossamer analysis',
        authorProgressReport: 'Author progress report',
    },
    common: {
        yes: 'Yes',
        no: 'No',
        cancel: 'Cancel',
        save: 'Save',
        reset: 'Reset',
        enable: 'Enable',
        disable: 'Disable',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
    },
    notices: {
        settingsSaved: 'Settings saved.',
        invalidInput: 'Invalid input.',
    },
    manuscriptModal: {
        badge: 'Export',
        title: 'Export',
        description: 'Export your active book as a manuscript or a structural outline. Choose what to include and how it should be formatted.',
        heroLoading: 'Loading scenes...',
        heroNarrativeMeta: 'Adjust scene range below.',
        exportHeading: 'Export type',
        exportTypeManuscript: 'Manuscript',
        exportTypeOutline: 'Outline',
        proBadge: 'Pro',
        proRequired: 'Pro export required for this option.',
        proEnabled: 'Pro export enabled (beta).',
        manuscriptPresetHeading: 'Manuscript preset',
        presetNovel: 'Novel manuscript',
        presetNovelDesc: 'A formatted document of your scenes in reading order.',
        presetScreenplay: 'Screenplay',
        presetScreenplayDesc: 'A script-oriented export that preserves screenplay-specific layout selection.',
        presetPodcast: 'Podcast script',
        presetPodcastDesc: 'An audio-production script export that preserves podcast layout selection.',
        outlineBeatSheetDesc: 'Save-the-Cat style beat list from scene metadata.',
        outlineEpisodeRundownDesc: 'Ordered scene rundown with timing-oriented structure.',
        outlineShootingScheduleDesc: 'Production-oriented scene table with location and schedule context.',
        outlineIndexCardsDesc: 'Structured scene data for external tools and automation.',
        formatMarkdown: 'Markdown',
        formatPdf: 'PDF',
        formatCsv: 'CSV',
        formatJson: 'JSON',
        outlinePresetHeading: 'Outline preset',
        outlineBeatSheet: 'Beat sheet',
        outlineEpisodeRundown: 'Episode rundown',
        outlineShootingSchedule: 'Shooting schedule list',
        outlineIndexCardsCsv: 'Index cards (CSV)',
        outlineIndexCardsJson: 'Index cards (JSON)',
        tocHeading: 'Table of contents',
        tocMarkdown: 'Markdown links (default)',
        tocPlain: 'Plain text',
        tocNone: 'No TOC',
        tocNote: 'Choose a navigation style for the scene list.',
        orderHeading: 'Scene ordering',
        orderNarrative: 'Narrative',
        orderReverseNarrative: 'Reverse',
        orderChronological: 'Chronological',
        orderReverseChronological: 'Reverse chrono',
        orderNote: 'Choose how scenes are ordered in the export.',
        rangeHeading: 'Scene range',
        rangeFirst: 'First scene',
        rangeLast: 'Last scene',
        rangeAllLabel: 'All scenes',
        rangeSingleLabel: 'Single scene',
        rangeSelectedLabel: 'Scenes {{start}}–{{end}}',
        rangeCountLabel: '{{count}} scenes selected',
        rangeStatus: 'Scenes {{start}} – {{end}} of {{total}} ({{count}} selected)',
        rangeLoading: 'Fetching scenes…',
        rangeDecimalWarning: 'Some scene filenames use decimal prefixes. Canonical scene numbering is integer-only; use drag + Ripple Rename to normalize.',
        actionCreate: 'Manuscript generate',
        actionCancel: 'Cancel',
        emptyNotice: 'No scenes available to assemble.',
        templateNotConfigured: '⚠️ Template not configured. PDF will use Pandoc defaults.',
        templateNotFound: '⚠️ Template file not found: {{path}}. Export may fail or use defaults.',
        templateFound: '✅ Template configured: {{path}}',
        configureInSettings: 'Configure in Settings → Pro',
        rangeEmpty: 'Selected range is empty.',
        loadError: 'Failed to load scenes.',
        wordCountHeading: 'Update metadata',
        wordCountToggle: 'Update Words in scene YAML',
        wordCountNote: 'Updates the Words field in each scene\'s frontmatter with accurate counts (excludes YAML and comments).',
        includeSynopsis: 'Include scene synopsis',
        includeSynopsisNote: 'Adds the Synopsis field from each scene.',
    },
    planetary: {
        heading: 'Planetary calendar system',
        enable: {
            name: 'Enable planetary conversions',
            desc: 'Turns on the converter modal, Chronologue Alt/Option tooltip, and synopsis line for the active profile.',
        },
        active: {
            name: 'Active profile',
            desc: 'Pick which planet or setting profile is used for conversions.',
            disabled: '— Disabled —',
        },
        actions: {
            add: 'Add profile',
            delete: 'Delete profile',
        },
        fields: {
            profileName: 'Profile name',
            hoursPerDay: 'Hours per day',
            daysPerWeek: 'Days per week',
            daysPerYear: 'Days per year',
            epochOffset: 'Epoch offset (Earth days)',
            epochLabel: 'Epoch label (optional)',
            monthNames: 'Month names (comma separated)',
            weekdayNames: 'Weekday names (comma separated)',
        },
        preview: {
            heading: 'Quick preview (Earth → local)',
            invalid: 'Enter valid values to see a conversion preview.',
            empty: 'Add a profile to start configuring planetary time.',
            disabled: 'Choose an active profile to preview conversions.',
        },
        modal: {
            title: 'Planetary time converter',
            activeProfile: 'Active profile',
            datetimeLabel: 'Earth date & time',
            datetimeDesc: 'Pick a local date and time to convert.',
            now: 'Now',
            convert: 'Convert',
            noProfile: 'Select an active planetary profile in Settings first.',
            disabled: 'Enable planetary conversions in settings to use this tool.',
            invalid: 'Enter a valid ISO datetime.',
        },
        synopsis: { prefix: 'Local: ' },
        tooltip: { altHint: 'Hold Alt/Option to show local time.' },
    },
};
