/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const CONFIG = {
        refreshMs: 2000,

        windowWidth: 1450,
        windowHeight: 850,

        separatorWidth: 138,

        recentWindowSeconds: 60,
        oneMinuteSeconds: 60,
        fiveMinuteSeconds: 300,

        maxTargetRows: 10,
        maxScriptRows: 10,
        maxHostRows: 10,

        // Matches bb-dispatcher.js default unless overridden
        // with --reserve.
        dispatcherDefaultHomeReserve: 8
    };


    // ============================================================
    // COLORS
    // ============================================================

    const COLOR = {
        reset: "\x1b[0m",
        bold: "\x1b[1m",

        brightWhite: "\x1b[97m",
        brightCyan: "\x1b[96m",
        brightGreen: "\x1b[92m",
        brightYellow: "\x1b[93m",
        brightRed: "\x1b[91m",

        gray: "\x1b[90m"
    };


    // ============================================================
    // SCRIPT NAMES
    // ============================================================

    const DISPATCHER_SCRIPT =
        "bb-dispatcher.js";

    const DISPATCHER_WORKERS =
        new Set([
            "bb-hack-worker.js",
            "bb-grow-worker.js",
            "bb-weaken-worker.js"
        ]);

    const LOCAL_TARGET_SCRIPTS =
        new Set([
            "early-hack-template.js",
            "local-hack-template.js"
        ]);


    // ============================================================
    // WINDOW
    // ============================================================

    ns.ui.openTail();

    ns.ui.resizeTail(
        CONFIG.windowWidth,
        CONFIG.windowHeight
    );

    ns.ui.setTailTitle(
        "BITBURNER // INCOME ANALYZER"
    );


    // ============================================================
    // STATE
    // ============================================================

    const realizedSamples = [];

    const seenRecentScripts =
        new Set();

    const monitorStart =
        Date.now();

    let monitorCapturedMoney = 0;
    let monitorCapturedExp = 0;

    let lastDisplay = "";


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        const now =
            Date.now();

        const monitorSeconds =
            Math.max(
                0,
                (
                    now -
                    monitorStart
                ) / 1000
            );


        // ========================================================
        // NETWORK
        // ========================================================

        const servers =
            scanNetwork(ns);

        const serverSet =
            new Set(servers);


        // ========================================================
        // GLOBAL BITBURNER SCRIPT PERFORMANCE
        // ========================================================

        const totalIncome =
            ns.getTotalScriptIncome();

        const activeIncomePerSecond =
            totalIncome[0];

        const sinceAugmentIncomePerSecond =
            totalIncome[1];

        const activeExpPerSecond =
            ns.getTotalScriptExpGain();


        // ========================================================
        // DISPATCHER CONFIGURATION
        // ========================================================

        const dispatcherInfo =
            getDispatcherInfo(
                ns,
                DISPATCHER_SCRIPT,
                CONFIG.dispatcherDefaultHomeReserve
            );

        const homeReserve =
            dispatcherInfo.homeReserve;


        // ========================================================
        // CURRENT RUNNING SCRIPTS + RAM
        // ========================================================

        const currentScripts = [];

        let runningProcesses = 0;
        let runningThreads = 0;

        let totalMaxRam = 0;
        let totalUsedRam = 0;

        let homeMaxRam = 0;
        let homeUsedRam = 0;


        for (const host of servers) {

            if (!ns.hasRootAccess(host)) {
                continue;
            }

            const maxRam =
                ns.getServerMaxRam(host);

            const usedRam =
                ns.getServerUsedRam(host);

            totalMaxRam +=
                maxRam;

            totalUsedRam +=
                usedRam;


            if (host === "home") {

                homeMaxRam =
                    maxRam;

                homeUsedRam =
                    usedRam;
            }


            const processes =
                ns.ps(host);

            runningProcesses +=
                processes.length;


            for (const process of processes) {

                runningThreads +=
                    process.threads;


                const info =
                    ns.getRunningScript(
                        process.pid
                    );

                if (!info) {
                    continue;
                }


                const target =
                    determineTarget(
                        ns,
                        info,
                        serverSet,
                        LOCAL_TARGET_SCRIPTS
                    );


                const lifetimeMoneyPerSecond =
                    info.onlineRunningTime > 0
                        ? info.onlineMoneyMade /
                          info.onlineRunningTime
                        : 0;


                const lifetimeExpPerSecond =
                    info.onlineRunningTime > 0
                        ? info.onlineExpGained /
                          info.onlineRunningTime
                        : 0;


                currentScripts.push({

                    filename:
                        info.filename,

                    host:
                        info.server,

                    target,

                    threads:
                        info.threads,

                    ram:
                        info.ramUsage *
                        info.threads,

                    onlineMoneyMade:
                        info.onlineMoneyMade,

                    onlineExpGained:
                        info.onlineExpGained,

                    onlineRunningTime:
                        info.onlineRunningTime,

                    lifetimeMoneyPerSecond,

                    lifetimeExpPerSecond
                });
            }
        }


        // ========================================================
        // PHYSICAL RAM
        // ========================================================

        const physicalFreeRam =
            Math.max(
                0,
                totalMaxRam -
                totalUsedRam
            );

        const physicalUtilization =
            totalMaxRam > 0
                ? (
                    totalUsedRam /
                    totalMaxRam
                ) * 100
                : 0;


        // ========================================================
        // DISPATCHER-USABLE RAM
        // ========================================================
        //
        // bb-dispatcher subtracts its configured reserve from
        // HOME free RAM. Other rooted servers have no reserve.
        //
        // ========================================================

        const effectiveReserve =
            Math.min(
                homeReserve,
                homeMaxRam
            );


        const dispatcherCapacity =
            Math.max(
                0,
                totalMaxRam -
                effectiveReserve
            );


        const homeDispatcherFree =
            Math.max(
                0,
                homeMaxRam -
                homeUsedRam -
                effectiveReserve
            );


        let nonHomeFreeRam = 0;


        for (const host of servers) {

            if (
                host === "home" ||
                !ns.hasRootAccess(host)
            ) {
                continue;
            }

            nonHomeFreeRam +=
                Math.max(
                    0,
                    ns.getServerMaxRam(host) -
                    ns.getServerUsedRam(host)
                );
        }


        const dispatcherFreeRam =
            homeDispatcherFree +
            nonHomeFreeRam;


        const dispatcherUsedCapacity =
            Math.max(
                0,
                dispatcherCapacity -
                dispatcherFreeRam
            );


        const dispatcherUtilization =
            dispatcherCapacity > 0
                ? (
                    dispatcherUsedCapacity /
                    dispatcherCapacity
                ) * 100
                : 0;


        // ========================================================
        // RECENT COMPLETED SCRIPTS
        // ========================================================

        const recentScripts =
            ns.getRecentScripts();

        const recentCutoff =
            now -
            (
                CONFIG.recentWindowSeconds *
                1000
            );


        const recentCompleted = [];

        let oldestRecentDeath =
            null;


        for (const script of recentScripts) {

            const deathTime =
                getTimeMilliseconds(
                    script.timeOfDeath
                );


            if (
                oldestRecentDeath === null ||
                deathTime < oldestRecentDeath
            ) {

                oldestRecentDeath =
                    deathTime;
            }


            // ====================================================
            // CAPTURE UNIQUE COMPLETIONS SINCE MONITOR START
            // ====================================================

            const recentKey =
                makeRecentScriptKey(
                    script,
                    deathTime
                );


            if (
                deathTime >= monitorStart &&
                !seenRecentScripts.has(
                    recentKey
                )
            ) {

                seenRecentScripts.add(
                    recentKey
                );

                monitorCapturedMoney +=
                    script.onlineMoneyMade ?? 0;

                monitorCapturedExp +=
                    script.onlineExpGained ?? 0;
            }


            // Only need recent-window scripts for the following
            // realized-rate calculations.

            if (
                deathTime <
                recentCutoff
            ) {

                continue;
            }


            const target =
                determineTarget(
                    ns,
                    script,
                    serverSet,
                    LOCAL_TARGET_SCRIPTS
                );


            recentCompleted.push({

                filename:
                    script.filename,

                host:
                    script.server,

                target,

                threads:
                    script.threads,

                onlineMoneyMade:
                    script.onlineMoneyMade ?? 0,

                onlineExpGained:
                    script.onlineExpGained ?? 0,

                onlineRunningTime:
                    script.onlineRunningTime ?? 0,

                deathTime
            });
        }


        // ========================================================
        // RECENT SCRIPT HISTORY COVERAGE
        // ========================================================

        const recentHistoryCoverageSeconds =
            oldestRecentDeath !== null
                ? Math.max(
                    0,
                    (
                        now -
                        oldestRecentDeath
                    ) / 1000
                )
                : 0;


        // Once this monitor has itself been running longer than
        // the requested window, a recent-script history shorter
        // than that window means the 60-second realized estimate
        // may not include the full period.
        //
        // This does NOT prove truncation, but it is a useful warning.

        const recentHistoryMayBeIncomplete =
            monitorSeconds >=
                CONFIG.recentWindowSeconds &&
            recentScripts.length > 0 &&
            recentHistoryCoverageSeconds <
                CONFIG.recentWindowSeconds *
                0.90;


        // ========================================================
        // AGGREGATE REALIZED PERFORMANCE
        // ========================================================

        const targetStats =
            new Map();

        const scriptStats =
            new Map();

        const hostStats =
            new Map();


        let capturedRecentMoney = 0;
        let capturedRecentExp = 0;

        let recentHackCompletions = 0;


        for (const script of recentCompleted) {

            capturedRecentMoney +=
                script.onlineMoneyMade;

            capturedRecentExp +=
                script.onlineExpGained;


            if (
                script.onlineMoneyMade > 0
            ) {

                recentHackCompletions++;
            }


            addAggregate(
                scriptStats,
                script.filename,
                script
            );


            addAggregate(
                hostStats,
                script.host,
                script
            );


            if (script.target) {

                addAggregate(
                    targetStats,
                    script.target,
                    script
                );
            }
        }


        const realizedIncomePerSecond =
            capturedRecentMoney /
            CONFIG.recentWindowSeconds;


        const realizedExpPerSecond =
            capturedRecentExp /
            CONFIG.recentWindowSeconds;


        // ========================================================
        // REALIZED RATE TREND
        // ========================================================

        realizedSamples.push({

            time:
                now,

            value:
                realizedIncomePerSecond
        });


        while (
            realizedSamples.length > 0 &&
            now -
                realizedSamples[0].time >
                (
                    CONFIG.fiveMinuteSeconds +
                    10
                ) *
                1000
        ) {

            realizedSamples.shift();
        }


        const avg1m =
            averageSamples(
                realizedSamples,
                now,
                CONFIG.oneMinuteSeconds
            );


        const avg5m =
            averageSamples(
                realizedSamples,
                now,
                CONFIG.fiveMinuteSeconds
            );


        const trendPercent =
            avg5m > 0
                ? (
                    (
                        realizedIncomePerSecond -
                        avg5m
                    ) /
                    avg5m
                ) *
                100
                : 0;


        // ========================================================
        // AGGREGATE TABLES
        // ========================================================

        const targetRows =
            buildAggregateRows(
                targetStats,
                CONFIG.recentWindowSeconds
            );


        const scriptRows =
            buildAggregateRows(
                scriptStats,
                CONFIG.recentWindowSeconds
            );


        const hostRows =
            buildAggregateRows(
                hostStats,
                CONFIG.recentWindowSeconds
            );


        // ========================================================
        // CURRENT SCRIPT PERFORMANCE
        // ========================================================

        const runningScriptMap =
            new Map();


        for (const script of currentScripts) {

            if (
                !runningScriptMap.has(
                    script.filename
                )
            ) {

                runningScriptMap.set(
                    script.filename,
                    {
                        name:
                            script.filename,

                        processes:
                            0,

                        threads:
                            0,

                        ram:
                            0,

                        moneyPerSecond:
                            0,

                        expPerSecond:
                            0
                    }
                );
            }


            const stat =
                runningScriptMap.get(
                    script.filename
                );


            stat.processes++;

            stat.threads +=
                script.threads;

            stat.ram +=
                script.ram;

            stat.moneyPerSecond +=
                script.lifetimeMoneyPerSecond;

            stat.expPerSecond +=
                script.lifetimeExpPerSecond;
        }


        const runningScriptRows =
            [...runningScriptMap.values()]
                .sort(
                    (a, b) =>
                        b.moneyPerSecond -
                        a.moneyPerSecond
                );


        // ========================================================
        // DISPATCHER WORKERS
        // ========================================================

        const dispatcherRunning =
            currentScripts.filter(
                script =>
                    DISPATCHER_WORKERS.has(
                        script.filename
                    )
            );


        const dispatcherThreads =
            dispatcherRunning.reduce(
                (sum, script) =>
                    sum +
                    script.threads,
                0
            );


        const dispatcherRam =
            dispatcherRunning.reduce(
                (sum, script) =>
                    sum +
                    script.ram,
                0
            );


        const dispatcherTargets =
            new Set(
                dispatcherRunning
                    .map(
                        script =>
                            script.target
                    )
                    .filter(Boolean)
            );


        const hackWorkers =
            dispatcherRunning.filter(
                script =>
                    script.filename ===
                    "bb-hack-worker.js"
            );


        const growWorkers =
            dispatcherRunning.filter(
                script =>
                    script.filename ===
                    "bb-grow-worker.js"
            );


        const weakenWorkers =
            dispatcherRunning.filter(
                script =>
                    script.filename ===
                    "bb-weaken-worker.js"
            );


        // ========================================================
        // DISPLAY
        // ========================================================

        const lines = [];


        lines.push(
            color(
                "═".repeat(
                    CONFIG.separatorWidth
                ),
                COLOR.brightCyan
            )
        );


        lines.push(
            color(
                centerText(
                    "BITBURNER // DISPATCHER INCOME ANALYZER",
                    CONFIG.separatorWidth
                ),
                COLOR.bold +
                COLOR.brightWhite
            )
        );


        lines.push(
            color(
                "═".repeat(
                    CONFIG.separatorWidth
                ),
                COLOR.brightCyan
            )
        );


        // ========================================================
        // REALIZED PERFORMANCE
        // ========================================================

        section(
            lines,
            "REALIZED PERFORMANCE",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Realized / sec",
                formatMoney(
                    ns,
                    realizedIncomePerSecond
                ),
                32
            ) +

            field(
                "1 Min Avg",
                formatMoney(
                    ns,
                    avg1m
                ) + "/sec",
                30
            ) +

            field(
                "5 Min Avg",
                formatMoney(
                    ns,
                    avg5m
                ) + "/sec",
                30
            ) +

            field(
                "Hack Finishes",
                recentHackCompletions,
                24
            )
        );


        lines.push(

            field(
                "60s Money",
                formatMoney(
                    ns,
                    capturedRecentMoney
                ),
                32
            ) +

            field(
                "60s EXP",
                ns.format.number(
                    capturedRecentExp,
                    2
                ),
                30
            ) +

            field(
                "Monitor Money",
                formatMoney(
                    ns,
                    monitorCapturedMoney
                ),
                30
            ) +

            field(
                "Monitoring",
                formatDuration(
                    monitorSeconds
                ),
                24
            )
        );


        const trendSymbol =
            trendPercent > 2
                ? "▲"
                : trendPercent < -2
                    ? "▼"
                    : "■";


        const trendColor =
            trendPercent > 2
                ? COLOR.brightGreen
                : trendPercent < -2
                    ? COLOR.brightRed
                    : COLOR.brightYellow;


        lines.push(
            color(
                `${trendSymbol} ` +
                `${trendPercent >= 0 ? "+" : ""}` +
                `${trendPercent.toFixed(1)}% ` +
                "vs 5-minute realized average",
                trendColor
            )
        );


        lines.push(
            createIncomeBar(
                realizedIncomePerSecond,
                avg5m,
                75
            )
        );


        // ========================================================
        // API / ACTIVE RATE
        // ========================================================

        section(
            lines,
            "BITBURNER SCRIPT RATE",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Active Income",
                formatMoney(
                    ns,
                    activeIncomePerSecond
                ) + "/sec",
                32
            ) +

            field(
                "Since Augment",
                formatMoney(
                    ns,
                    sinceAugmentIncomePerSecond
                ) + "/sec",
                32
            ) +

            field(
                "Active EXP",
                ns.format.number(
                    activeExpPerSecond,
                    2
                ) + "/sec",
                28
            ) +

            field(
                "Processes",
                runningProcesses,
                20
            )
        );


        lines.push(
            color(
                "Active income is Bitburner's running-script rate; realized 60s income is generally more useful for short HWGW workers.",
                COLOR.gray
            )
        );


        // ========================================================
        // DISPATCHER
        // ========================================================

        section(
            lines,
            "DISPATCHER ACTIVITY",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Dispatcher",
                dispatcherInfo.running
                    ? "RUNNING"
                    : "NOT RUNNING",
                28
            ) +

            field(
                "Workers",
                dispatcherRunning.length,
                24
            ) +

            field(
                "Threads",
                dispatcherThreads,
                24
            ) +

            field(
                "Worker RAM",
                ns.format.ram(
                    dispatcherRam
                ),
                28
            )
        );


        lines.push(

            field(
                "Hack Workers",
                hackWorkers.length,
                28
            ) +

            field(
                "Grow Workers",
                growWorkers.length,
                24
            ) +

            field(
                "Weaken Workers",
                weakenWorkers.length,
                24
            ) +

            field(
                "Targets",
                dispatcherTargets.size,
                28
            )
        );


        if (
            dispatcherTargets.size > 0
        ) {

            lines.push(
                "Active Target(s): " +
                color(
                    [...dispatcherTargets]
                        .join(", "),
                    COLOR.brightCyan
                )
            );
        }
        else {

            lines.push(
                color(
                    "No active dispatcher workers detected at this instant.",
                    COLOR.gray
                )
            );
        }


        // ========================================================
        // RAM
        // ========================================================

        section(
            lines,
            "RESOURCE UTILIZATION",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Physical Used",
                ns.format.ram(
                    totalUsedRam
                ),
                28
            ) +

            field(
                "Physical Free",
                ns.format.ram(
                    physicalFreeRam
                ),
                28
            ) +

            field(
                "Physical Total",
                ns.format.ram(
                    totalMaxRam
                ),
                28
            ) +

            field(
                "Physical Util",
                `${physicalUtilization.toFixed(1)}%`,
                26
            )
        );


        lines.push(

            field(
                "Usable Capacity",
                ns.format.ram(
                    dispatcherCapacity
                ),
                28
            ) +

            field(
                "Usable Free",
                ns.format.ram(
                    dispatcherFreeRam
                ),
                28
            ) +

            field(
                "Home Reserve",
                ns.format.ram(
                    effectiveReserve
                ),
                28
            ) +

            field(
                "Usable Util",
                `${dispatcherUtilization.toFixed(1)}%`,
                26
            )
        );


        lines.push(
            createPercentBar(
                dispatcherUtilization,
                85
            )
        );


        // ========================================================
        // TARGET PERFORMANCE
        // ========================================================

        section(
            lines,
            `REALIZED TARGET PERFORMANCE — LAST ${CONFIG.recentWindowSeconds}s`,
            CONFIG,
            COLOR
        );


        lines.push(

            "TARGET"
                .padEnd(28) +

            "MONEY"
                .padStart(18) +

            "$/SEC"
                .padStart(18) +

            "EXP"
                .padStart(14) +

            "JOBS"
                .padStart(9) +

            "THREADS"
                .padStart(10) +

            "HOSTS"
                .padStart(9)
        );


        lines.push(
            color(
                "─".repeat(
                    CONFIG.separatorWidth
                ),
                COLOR.gray
            )
        );


        if (
            targetRows.length === 0
        ) {

            lines.push(
                color(
                    "No completed target jobs captured during the recent window.",
                    COLOR.gray
                )
            );
        }
        else {

            for (
                const row
                of targetRows.slice(
                    0,
                    CONFIG.maxTargetRows
                )
            ) {

                lines.push(

                    row.name
                        .padEnd(28) +

                    formatMoney(
                        ns,
                        row.money
                    )
                        .padStart(18) +

                    formatMoney(
                        ns,
                        row.moneyPerSecond
                    )
                        .padStart(18) +

                    ns.format.number(
                        row.exp,
                        2
                    )
                        .padStart(14) +

                    String(
                        row.jobs
                    )
                        .padStart(9) +

                    String(
                        row.threads
                    )
                        .padStart(10) +

                    String(
                        row.hosts
                    )
                        .padStart(9)
                );
            }
        }


        // ========================================================
        // SCRIPT PERFORMANCE
        // ========================================================

        section(
            lines,
            `REALIZED SCRIPT PERFORMANCE — LAST ${CONFIG.recentWindowSeconds}s`,
            CONFIG,
            COLOR
        );


        lines.push(

            "SCRIPT"
                .padEnd(34) +

            "MONEY"
                .padStart(18) +

            "$/SEC"
                .padStart(18) +

            "EXP"
                .padStart(14) +

            "JOBS"
                .padStart(9) +

            "THREADS"
                .padStart(10)
        );


        lines.push(
            color(
                "─".repeat(
                    CONFIG.separatorWidth
                ),
                COLOR.gray
            )
        );


        if (
            scriptRows.length === 0
        ) {

            lines.push(
                color(
                    "No completed scripts captured during the recent window.",
                    COLOR.gray
                )
            );
        }
        else {

            for (
                const row
                of scriptRows.slice(
                    0,
                    CONFIG.maxScriptRows
                )
            ) {

                lines.push(

                    row.name
                        .padEnd(34) +

                    formatMoney(
                        ns,
                        row.money
                    )
                        .padStart(18) +

                    formatMoney(
                        ns,
                        row.moneyPerSecond
                    )
                        .padStart(18) +

                    ns.format.number(
                        row.exp,
                        2
                    )
                        .padStart(14) +

                    String(
                        row.jobs
                    )
                        .padStart(9) +

                    String(
                        row.threads
                    )
                        .padStart(10)
                );
            }
        }


        // ========================================================
        // HOST PERFORMANCE
        // ========================================================

        section(
            lines,
            `REALIZED HOST PERFORMANCE — LAST ${CONFIG.recentWindowSeconds}s`,
            CONFIG,
            COLOR
        );


        lines.push(

            "HOST"
                .padEnd(28) +

            "MONEY"
                .padStart(18) +

            "$/SEC"
                .padStart(18) +

            "EXP"
                .padStart(14) +

            "JOBS"
                .padStart(9) +

            "THREADS"
                .padStart(10)
        );


        lines.push(
            color(
                "─".repeat(
                    CONFIG.separatorWidth
                ),
                COLOR.gray
            )
        );


        if (
            hostRows.length === 0
        ) {

            lines.push(
                color(
                    "No completed jobs captured by host during the recent window.",
                    COLOR.gray
                )
            );
        }
        else {

            for (
                const row
                of hostRows.slice(
                    0,
                    CONFIG.maxHostRows
                )
            ) {

                lines.push(

                    row.name
                        .padEnd(28) +

                    formatMoney(
                        ns,
                        row.money
                    )
                        .padStart(18) +

                    formatMoney(
                        ns,
                        row.moneyPerSecond
                    )
                        .padStart(18) +

                    ns.format.number(
                        row.exp,
                        2
                    )
                        .padStart(14) +

                    String(
                        row.jobs
                    )
                        .padStart(9) +

                    String(
                        row.threads
                    )
                        .padStart(10)
                );
            }
        }


        // ========================================================
        // CURRENT RUNNING SCRIPTS
        // ========================================================

        section(
            lines,
            "CURRENT RUNNING SCRIPT LIFETIME AVERAGES",
            CONFIG,
            COLOR
        );


        lines.push(

            "SCRIPT"
                .padEnd(34) +

            "AVG $/SEC"
                .padStart(18) +

            "AVG EXP/SEC"
                .padStart(18) +

            "PROC"
                .padStart(8) +

            "THREADS"
                .padStart(10) +

            "RAM"
                .padStart(14)
        );


        lines.push(
            color(
                "─".repeat(
                    CONFIG.separatorWidth
                ),
                COLOR.gray
            )
        );


        for (
            const row
            of runningScriptRows.slice(
                0,
                CONFIG.maxScriptRows
            )
        ) {

            lines.push(

                row.name
                    .padEnd(34) +

                formatMoney(
                    ns,
                    row.moneyPerSecond
                )
                    .padStart(18) +

                ns.format.number(
                    row.expPerSecond,
                    2
                )
                    .padStart(18) +

                String(
                    row.processes
                )
                    .padStart(8) +

                String(
                    row.threads
                )
                    .padStart(10) +

                ns.format.ram(
                    row.ram
                )
                    .padStart(14)
            );
        }


        // ========================================================
        // ATTENTION
        // ========================================================

        section(
            lines,
            "ATTENTION",
            CONFIG,
            COLOR
        );


        const alerts = [];


        if (
            recentHistoryMayBeIncomplete
        ) {

            alerts.push({
                level:
                    "warning",

                text:
                    `Recent-script history currently covers only ` +
                    `${recentHistoryCoverageSeconds.toFixed(0)}s. ` +
                    `The ${CONFIG.recentWindowSeconds}s realized income rate may be under-reported.`
            });
        }


        if (
            dispatcherInfo.running &&
            dispatcherUtilization < 50 &&
            dispatcherFreeRam > 0
        ) {

            alerts.push({
                level:
                    "warning",

                text:
                    `${ns.format.ram(dispatcherFreeRam)} of dispatcher-usable RAM is currently free.`
            });
        }


        if (
            dispatcherInfo.running &&
            dispatcherRunning.length === 0
        ) {

            alerts.push({
                level:
                    "info",

                text:
                    "Dispatcher is running but no HWGW workers are active at this instant. It may be selecting, preparing, or waiting for work."
            });
        }


        if (
            realizedIncomePerSecond <= 0 &&
            dispatcherRunning.length > 0
        ) {

            alerts.push({
                level:
                    "warning",

                text:
                    "HWGW workers are active, but no realized hacking income was captured in the last 60 seconds."
            });
        }


        if (
            recentScripts.length === 0
        ) {

            alerts.push({
                level:
                    "info",

                text:
                    "No recently killed scripts are available yet. Realized dispatcher statistics will populate when workers finish."
            });
        }


        if (
            alerts.length === 0
        ) {

            lines.push(
                color(
                    "✓ No obvious dispatcher income or RAM utilization problems detected.",
                    COLOR.brightGreen
                )
            );
        }
        else {

            for (const alert of alerts) {

                lines.push(
                    formatAlert(
                        alert,
                        COLOR
                    )
                );
            }
        }


        // ========================================================
        // FOOTER
        // ========================================================

        lines.push("");


        lines.push(
            color(
                "─".repeat(
                    CONFIG.separatorWidth
                ),
                COLOR.gray
            )
        );


        lines.push(
            color(
                `Refresh ${CONFIG.refreshMs / 1000}s  |  ` +
                `Realized window ${CONFIG.recentWindowSeconds}s  |  ` +
                `Recent records ${recentScripts.length}  |  ` +
                `History ${formatDuration(recentHistoryCoverageSeconds)}  |  ` +
                `Home reserve ${ns.format.ram(effectiveReserve)}`,
                COLOR.gray
            )
        );


        // ========================================================
        // ANTI-FLICKER
        // ========================================================

        const display =
            lines.join("\n");


        if (
            display !==
            lastDisplay
        ) {

            ns.clearLog();

            ns.print(
                display
            );

            lastDisplay =
                display;
        }


        // ========================================================
        // TITLE
        // ========================================================

        ns.ui.setTailTitle(

            `INCOME  |  ` +

            `Realized ${formatMoney(
                ns,
                realizedIncomePerSecond
            )}/sec  |  ` +

            `1m ${formatMoney(
                ns,
                avg1m
            )}/sec  |  ` +

            `RAM ${dispatcherUtilization.toFixed(0)}%`
        );


        await ns.sleep(
            CONFIG.refreshMs
        );
    }
}


// =================================================================
// DISPATCHER INFORMATION
// =================================================================

function getDispatcherInfo(
    ns,
    dispatcherFilename,
    defaultReserve
) {

    const result = {
        running:
            false,

        pid:
            0,

        homeReserve:
            defaultReserve,

        args:
            []
    };


    const processes =
        ns.ps("home");


    const dispatcher =
        processes.find(
            process =>
                process.filename ===
                dispatcherFilename
        );


    if (!dispatcher) {
        return result;
    }


    result.running =
        true;

    result.pid =
        dispatcher.pid;

    result.args =
        dispatcher.args;


    // ============================================================
    // PARSE --reserve
    // ============================================================

    for (
        let i = 0;
        i < dispatcher.args.length;
        i++
    ) {

        const arg =
            String(
                dispatcher.args[i]
            );


        if (
            arg === "--reserve" &&
            i + 1 <
                dispatcher.args.length
        ) {

            const value =
                Number(
                    dispatcher.args[
                        i + 1
                    ]
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                result.homeReserve =
                    Math.max(
                        0,
                        value
                    );
            }


            continue;
        }


        if (
            arg.startsWith(
                "--reserve="
            )
        ) {

            const value =
                Number(
                    arg.substring(
                        "--reserve=".length
                    )
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                result.homeReserve =
                    Math.max(
                        0,
                        value
                    );
            }
        }
    }


    return result;
}


// =================================================================
// DETERMINE TARGET
// =================================================================

function determineTarget(
    ns,
    script,
    serverSet,
    localTargetScripts
) {

    if (script.args) {

        for (const arg of script.args) {

            const value =
                String(arg);


            if (
                serverSet.has(
                    value
                )
            ) {

                return value;
            }
        }
    }


    // ============================================================
    // LEGACY LOCAL TARGET SCRIPTS
    // ============================================================

    if (
        localTargetScripts.has(
            script.filename
        )
    ) {

        try {

            if (
                ns.getServerMaxMoney(
                    script.server
                ) > 0
            ) {

                return script.server;
            }
        }
        catch {

            return null;
        }
    }


    return null;
}


// =================================================================
// RECENT SCRIPT UNIQUE KEY
// =================================================================

function makeRecentScriptKey(
    script,
    deathTime
) {

    const args =
        Array.isArray(
            script.args
        )
            ? script.args.join("|")
            : "";


    return (
        `${script.pid ?? "?"}|` +
        `${script.filename}|` +
        `${script.server}|` +
        `${deathTime}|` +
        `${args}`
    );
}


// =================================================================
// ADD AGGREGATE
// =================================================================

function addAggregate(
    map,
    key,
    script
) {

    if (!key) {
        return;
    }


    if (
        !map.has(key)
    ) {

        map.set(
            key,
            {
                name:
                    key,

                money:
                    0,

                exp:
                    0,

                jobs:
                    0,

                threads:
                    0,

                hosts:
                    new Set()
            }
        );
    }


    const item =
        map.get(key);


    item.money +=
        script.onlineMoneyMade ?? 0;


    item.exp +=
        script.onlineExpGained ?? 0;


    item.jobs++;


    item.threads +=
        script.threads ?? 0;


    if (script.host) {

        item.hosts.add(
            script.host
        );
    }
}


// =================================================================
// BUILD AGGREGATE ROWS
// =================================================================

function buildAggregateRows(
    map,
    windowSeconds
) {

    return [...map.values()]

        .map(
            item => ({

                name:
                    item.name,

                money:
                    item.money,

                moneyPerSecond:
                    item.money /
                    windowSeconds,

                exp:
                    item.exp,

                jobs:
                    item.jobs,

                threads:
                    item.threads,

                hosts:
                    item.hosts.size
            })
        )

        .sort(
            (a, b) =>
                b.moneyPerSecond -
                a.moneyPerSecond
        );
}


// =================================================================
// TREND AVERAGE
// =================================================================

function averageSamples(
    samples,
    now,
    seconds
) {

    const cutoff =
        now -
        (
            seconds *
            1000
        );


    let total = 0;
    let count = 0;


    for (const sample of samples) {

        if (
            sample.time <
            cutoff
        ) {

            continue;
        }


        total +=
            sample.value;

        count++;
    }


    return count > 0
        ? total / count
        : 0;
}


// =================================================================
// GET DATE/TIME VALUE
// =================================================================

function getTimeMilliseconds(
    value
) {

    if (
        value instanceof Date
    ) {

        return value.getTime();
    }


    const parsed =
        new Date(
            value
        ).getTime();


    return Number.isFinite(
        parsed
    )
        ? parsed
        : 0;
}


// =================================================================
// NETWORK SCAN
// =================================================================

function scanNetwork(ns) {

    const visited =
        new Set();

    const servers =
        [];


    function scan(server) {

        if (
            visited.has(
                server
            )
        ) {

            return;
        }


        visited.add(
            server
        );

        servers.push(
            server
        );


        for (
            const neighbor
            of ns.scan(server)
        ) {

            scan(
                neighbor
            );
        }
    }


    scan(
        "home"
    );


    return servers;
}


// =================================================================
// DISPLAY SECTION
// =================================================================

function section(
    lines,
    title,
    CONFIG,
    COLOR
) {

    lines.push("");


    lines.push(
        color(
            `[ ${title} ]`,
            COLOR.bold +
            COLOR.brightCyan
        )
    );


    lines.push(
        color(
            "─".repeat(
                CONFIG.separatorWidth
            ),
            COLOR.gray
        )
    );
}


// =================================================================
// FIELD
// =================================================================

function field(
    label,
    value,
    width
) {

    return (
        `${label}: ${value}`
            .padEnd(
                width
            )
    );
}


// =================================================================
// FORMAT MONEY
// =================================================================

function formatMoney(
    ns,
    value
) {

    if (
        !Number.isFinite(
            value
        )
    ) {

        return "$0";
    }


    return (
        "$" +
        ns.format.number(
            value,
            2
        )
    );
}


// =================================================================
// FORMAT DURATION
// =================================================================

function formatDuration(
    seconds
) {

    if (
        !Number.isFinite(
            seconds
        ) ||
        seconds <= 0
    ) {

        return "0s";
    }


    if (
        seconds <
        60
    ) {

        return (
            seconds.toFixed(0) +
            "s"
        );
    }


    if (
        seconds <
        3600
    ) {

        return (
            (
                seconds /
                60
            ).toFixed(1) +
            "m"
        );
    }


    return (
        (
            seconds /
            3600
        ).toFixed(1) +
        "h"
    );
}


// =================================================================
// INCOME BAR
// =================================================================

function createIncomeBar(
    current,
    reference,
    width
) {

    if (
        reference <= 0
    ) {

        return (
            "Income trend: " +
            "█".repeat(
                Math.min(
                    width,
                    current > 0
                        ? Math.floor(
                            width *
                            0.5
                        )
                        : 0
                )
            )
        );
    }


    const ratio =
        Math.max(
            0,
            Math.min(
                2,
                current /
                reference
            )
        );


    const filled =
        Math.min(
            width,
            Math.round(
                (
                    ratio /
                    2
                ) *
                width
            )
        );


    return (
        "Income trend: [" +
        "█".repeat(
            filled
        ) +
        "░".repeat(
            width -
            filled
        ) +
        "]"
    );
}


// =================================================================
// PERCENT BAR
// =================================================================

function createPercentBar(
    percent,
    width
) {

    const safePercent =
        Math.max(
            0,
            Math.min(
                100,
                percent
            )
        );


    const filled =
        Math.round(
            (
                safePercent /
                100
            ) *
            width
        );


    return (
        "RAM usage:    [" +
        "█".repeat(
            filled
        ) +
        "░".repeat(
            width -
            filled
        ) +
        "] " +
        safePercent.toFixed(1) +
        "%"
    );
}


// =================================================================
// ALERT
// =================================================================

function formatAlert(
    alert,
    COLOR
) {

    if (
        alert.level ===
        "danger"
    ) {

        return color(
            `✖ ${alert.text}`,
            COLOR.brightRed
        );
    }


    if (
        alert.level ===
        "warning"
    ) {

        return color(
            `⚠ ${alert.text}`,
            COLOR.brightYellow
        );
    }


    return color(
        `● ${alert.text}`,
        COLOR.brightCyan
    );
}


// =================================================================
// CENTER TEXT
// =================================================================

function centerText(
    text,
    width
) {

    return (
        " ".repeat(
            Math.max(
                0,
                Math.floor(
                    (
                        width -
                        text.length
                    ) /
                    2
                )
            )
        ) +
        text
    );
}


// =================================================================
// COLOR
// =================================================================

function color(
    text,
    value
) {

    return (
        value +
        text +
        "\x1b[0m"
    );
}