/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ============================================================
    // BITBURNER INCOME ANALYZER
    // ============================================================
    //
    // Shows:
    //
    //   - Current total script income / second
    //   - Current total script EXP / second
    //   - 1 minute income trend
    //   - 5 minute income trend
    //   - Recent realized income by target
    //   - Recent realized income by script
    //   - Current running script lifetime performance
    //   - RAM utilization
    //   - Dispatcher vs legacy hacking activity
    //
    // Recent realized performance uses getRecentScripts().
    //
    // ============================================================


    // ============================================================
    // CONFIGURATION
    // ============================================================

    const CONFIG = {
        refreshMs: 2000,

        windowWidth: 1450,
        windowHeight: 800,

        separatorWidth: 138,

        recentWindowSeconds: 60,

        oneMinuteSeconds: 60,
        fiveMinuteSeconds: 300,

        maxTargetRows: 10,
        maxScriptRows: 10,
        maxHostRows: 10,

        // Ignore recent scripts older than this.
        recentScriptMaxAgeSeconds: 300
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
    // KNOWN WORKERS
    // ============================================================

    const DISPATCHER_WORKERS = new Set([
        "bb-hack-worker.js",
        "bb-grow-worker.js",
        "bb-weaken-worker.js"
    ]);


    // ============================================================
    // LEGACY SCRIPTS
    //
    // These may attack the host they run on when no server
    // argument exists.
    // ============================================================

    const LOCAL_TARGET_SCRIPTS = new Set([
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

    const incomeSamples = [];

    let lastDisplay = "";


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        const now =
            Date.now();


        // ========================================================
        // NETWORK
        // ========================================================

        const servers =
            scanNetwork(ns);


        const serverSet =
            new Set(servers);


        // ========================================================
        // GLOBAL PERFORMANCE
        // ========================================================

        const totalIncome =
            ns.getTotalScriptIncome();


        const currentIncomePerSecond =
            totalIncome[0];


        const incomeSinceAugment =
            totalIncome[1];


        const currentExpPerSecond =
            ns.getTotalScriptExpGain();


        // ========================================================
        // ADD TREND SAMPLE
        // ========================================================

        incomeSamples.push({
            time: now,
            value: currentIncomePerSecond
        });


        // Keep only slightly more than five minutes.

        while (
            incomeSamples.length > 0 &&
            now -
                incomeSamples[0].time >
                (
                    CONFIG.fiveMinuteSeconds +
                    10
                ) * 1000
        ) {

            incomeSamples.shift();
        }


        // ========================================================
        // TREND CALCULATIONS
        // ========================================================

        const avg1m =
            averageSamples(
                incomeSamples,
                now,
                CONFIG.oneMinuteSeconds
            );


        const avg5m =
            averageSamples(
                incomeSamples,
                now,
                CONFIG.fiveMinuteSeconds
            );


        const oldestSample =
            incomeSamples.length > 0
                ? incomeSamples[0]
                : null;


        const monitoringSeconds =
            oldestSample
                ? (
                    now -
                    oldestSample.time
                ) / 1000
                : 0;


        const trendPercent =
            avg5m > 0
                ? (
                    (
                        currentIncomePerSecond -
                        avg5m
                    ) /
                    avg5m
                ) * 100
                : 0;


        // ========================================================
        // CURRENT RUNNING SCRIPTS
        // ========================================================

        const currentScripts = [];


        let runningProcesses = 0;

        let runningThreads = 0;

        let totalMaxRam = 0;

        let totalUsedRam = 0;


        for (
            const host
            of servers
        ) {

            if (
                !ns.hasRootAccess(host)
            ) {

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


            const processes =
                ns.ps(host);


            runningProcesses +=
                processes.length;


            for (
                const process
                of processes
            ) {

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
                        ? (
                            info.onlineMoneyMade /
                            info.onlineRunningTime
                        )
                        : 0;


                const lifetimeExpPerSecond =
                    info.onlineRunningTime > 0
                        ? (
                            info.onlineExpGained /
                            info.onlineRunningTime
                        )
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


        const freeRam =
            Math.max(
                0,
                totalMaxRam -
                totalUsedRam
            );


        const ramUtilization =
            totalMaxRam > 0
                ? (
                    totalUsedRam /
                    totalMaxRam
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


        const maxRecentCutoff =
            now -
            (
                CONFIG.recentScriptMaxAgeSeconds *
                1000
            );


        const recentCompleted = [];


        for (
            const script
            of recentScripts
        ) {

            const deathTime =
                getTimeMilliseconds(
                    script.timeOfDeath
                );


            if (
                deathTime <
                maxRecentCutoff
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
                    script.onlineMoneyMade,

                onlineExpGained:
                    script.onlineExpGained,

                onlineRunningTime:
                    script.onlineRunningTime,

                deathTime,

                inRecentWindow:
                    deathTime >=
                    recentCutoff
            });
        }


        // ========================================================
        // AGGREGATE RECENT REALIZED INCOME
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


        for (
            const script
            of recentCompleted
        ) {

            if (
                !script.inRecentWindow
            ) {

                continue;
            }


            capturedRecentMoney +=
                script.onlineMoneyMade;


            capturedRecentExp +=
                script.onlineExpGained;


            if (
                script.onlineMoneyMade > 0
            ) {

                recentHackCompletions++;
            }


            // ----------------------------------------------------
            // BY SCRIPT
            // ----------------------------------------------------

            addAggregate(
                scriptStats,
                script.filename,
                script
            );


            // ----------------------------------------------------
            // BY HOST
            // ----------------------------------------------------

            addAggregate(
                hostStats,
                script.host,
                script
            );


            // ----------------------------------------------------
            // BY TARGET
            // ----------------------------------------------------

            if (script.target) {

                addAggregate(
                    targetStats,
                    script.target,
                    script
                );
            }
        }


        // ========================================================
        // TURN AGGREGATES INTO ARRAYS
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
        // CURRENT LONG-RUNNING PERFORMANCE BY SCRIPT
        // ========================================================

        const runningScriptMap =
            new Map();


        for (
            const script
            of currentScripts
        ) {

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

                        processes: 0,

                        threads: 0,

                        ram: 0,

                        moneyPerSecond: 0,

                        expPerSecond: 0
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
        // DISPATCHER INFORMATION
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


        const dispatcherTargets =
            new Set(
                dispatcherRunning
                    .map(
                        script =>
                            script.target
                    )
                    .filter(Boolean)
            );


        // ========================================================
        // RECENT REALIZED RATE
        // ========================================================
        //
        // This is:
        //
        // money captured from scripts that completed in the
        // most recent configured window
        //
        //              divided by
        //
        // window length.
        //
        // This is particularly useful for short dispatcher workers.
        //
        // ========================================================

        const capturedIncomePerSecond =
            capturedRecentMoney /
            CONFIG.recentWindowSeconds;


        const capturedExpPerSecond =
            capturedRecentExp /
            CONFIG.recentWindowSeconds;


        // ========================================================
        // DISPLAY
        // ========================================================

        const lines = [];


        // ========================================================
        // HEADER
        // ========================================================

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
                    "BITBURNER // INCOME ANALYZER",
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
        // CURRENT PERFORMANCE
        // ========================================================

        section(
            lines,
            "CURRENT PERFORMANCE",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Income / sec",
                formatMoney(
                    ns,
                    currentIncomePerSecond
                ),
                30
            ) +

            field(
                "EXP / sec",
                ns.format.number(
                    currentExpPerSecond,
                    2
                ),
                28
            ) +

            field(
                "Processes",
                runningProcesses,
                24
            ) +

            field(
                "Threads",
                runningThreads,
                24
            )
        );


        lines.push(

            field(
                "Since Augment",
                formatMoney(
                    ns,
                    incomeSinceAugment
                ) + "/sec",
                30
            ) +

            field(
                "Recent Captured",
                formatMoney(
                    ns,
                    capturedIncomePerSecond
                ) + "/sec",
                28
            ) +

            field(
                "Recent EXP",
                ns.format.number(
                    capturedExpPerSecond,
                    2
                ) + "/sec",
                24
            ) +

            field(
                "Hack Completions",
                recentHackCompletions,
                24
            )
        );


        // ========================================================
        // TREND
        // ========================================================

        section(
            lines,
            "INCOME TREND",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Current",
                formatMoney(
                    ns,
                    currentIncomePerSecond
                ) + "/sec",
                30
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
                "Monitoring",
                formatDuration(
                    monitoringSeconds
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
                "vs monitored 5-minute average",
                trendColor
            )
        );


        lines.push(
            createIncomeBar(
                currentIncomePerSecond,
                avg5m,
                70
            )
        );


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
                "RAM Used",
                ns.format.ram(
                    totalUsedRam
                ),
                28
            ) +

            field(
                "RAM Free",
                ns.format.ram(
                    freeRam
                ),
                28
            ) +

            field(
                "RAM Total",
                ns.format.ram(
                    totalMaxRam
                ),
                28
            ) +

            field(
                "Utilization",
                `${ramUtilization.toFixed(1)}%`,
                24
            )
        );


        lines.push(
            createPercentBar(
                ramUtilization,
                85
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
                "Workers Running",
                dispatcherRunning.length,
                28
            ) +

            field(
                "Worker Threads",
                dispatcherThreads,
                28
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
                    "No active bb-dispatcher workers detected at this instant.",
                    COLOR.gray
                )
            );
        }


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
                    "No completed target-based jobs captured in the recent window.",
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

                    row.jobs
                        .toString()
                        .padStart(9) +

                    row.threads
                        .toString()
                        .padStart(10) +

                    row.hosts
                        .toString()
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
                    "No completed scripts captured in the recent window.",
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

                    row.jobs
                        .toString()
                        .padStart(9) +

                    row.threads
                        .toString()
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
                    "No completed jobs captured by host in the recent window.",
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

                    row.jobs
                        .toString()
                        .padStart(9) +

                    row.threads
                        .toString()
                        .padStart(10)
                );
            }
        }


        // ========================================================
        // RUNNING SCRIPT LIFETIME PERFORMANCE
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

                row.processes
                    .toString()
                    .padStart(8) +

                row.threads
                    .toString()
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
            ramUtilization < 50 &&
            freeRam > 0
        ) {

            alerts.push({
                level: "warning",

                text:
                    `${ns.format.ram(freeRam)} ` +
                    "of rooted RAM is currently unused."
            });
        }


        if (
            currentIncomePerSecond <= 0 &&
            runningThreads > 0
        ) {

            alerts.push({
                level: "danger",

                text:
                    "Scripts are running, but total script income is currently zero."
            });
        }


        if (
            capturedIncomePerSecond >
            currentIncomePerSecond *
            1.25 &&
            capturedIncomePerSecond > 0
        ) {

            alerts.push({
                level: "info",

                text:
                    "Recent completed hacks are producing more than the current instantaneous income rate suggests."
            });
        }


        if (
            recentScripts.length === 0
        ) {

            alerts.push({
                level: "info",

                text:
                    "No recently killed scripts are available yet. Dispatcher performance will populate as workers finish."
            });
        }


        if (
            recentScripts.length > 0 &&
            recentCompleted.length ===
                recentScripts.length
        ) {

            // No alert required.
        }


        if (
            alerts.length === 0
        ) {

            lines.push(
                color(
                    "✓ No obvious income or RAM utilization problems detected.",
                    COLOR.brightGreen
                )
            );
        }
        else {

            for (
                const alert
                of alerts
            ) {

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
                `Recent realized window ${CONFIG.recentWindowSeconds}s  |  ` +
                `Recent-script retention depends on Settings → Recently killed scripts size`,
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

            `${formatMoney(
                ns,
                currentIncomePerSecond
            )}/sec  |  ` +

            `1m ${formatMoney(
                ns,
                avg1m
            )}/sec  |  ` +

            `RAM ${ramUtilization.toFixed(0)}%`
        );


        await ns.sleep(
            CONFIG.refreshMs
        );
    }
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

    if (
        script.args
    ) {

        for (
            const arg
            of script.args
        ) {

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


    // -------------------------------------------------------------
    // Legacy scripts that hack the server they are physically
    // running on.
    // -------------------------------------------------------------

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
// ADD AGGREGATE
// =================================================================

function addAggregate(
    map,
    key,
    script
) {

    if (
        !map.has(key)
    ) {

        map.set(
            key,
            {
                name: key,

                money: 0,

                exp: 0,

                jobs: 0,

                threads: 0,

                hosts:
                    new Set()
            }
        );
    }


    const item =
        map.get(key);


    item.money +=
        script.onlineMoneyMade;


    item.exp +=
        script.onlineExpGained;


    item.jobs++;


    item.threads +=
        script.threads;


    if (
        script.host
    ) {

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


    for (
        const sample
        of samples
    ) {

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
        new Date(value)
            .getTime();


    return Number.isFinite(parsed)
        ? parsed
        : 0;
}


// =================================================================
// NETWORK SCAN
// =================================================================

function scanNetwork(ns) {

    const visited =
        new Set();


    const servers = [];


    function scan(server) {

        if (
            visited.has(server)
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


    scan("home");


    return servers;
}


// =================================================================
// INCOME BAR
// =================================================================

function createIncomeBar(
    current,
    average,
    width
) {

    if (
        average <= 0
    ) {

        return (
            "Income comparison unavailable until trend history builds."
        );
    }


    const ratio =
        current /
        average;


    const normalized =
        Math.max(
            0,
            Math.min(
                2,
                ratio
            )
        );


    const filled =
        Math.round(
            (
                normalized /
                2
            ) *
            width
        );


    return (
        "5m Avg  [" +

        "█".repeat(
            filled
        ) +

        "░".repeat(
            width -
            filled
        ) +

        "]  Current / Avg: " +

        ratio.toFixed(2) +

        "x"
    );
}


// =================================================================
// PERCENT BAR
// =================================================================

function createPercentBar(
    percent,
    width
) {

    const normalized =
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
                normalized /
                100
            ) *
            width
        );


    return (
        "[" +

        "█".repeat(
            filled
        ) +

        "░".repeat(
            width -
            filled
        ) +

        "] " +

        normalized.toFixed(1) +

        "%"
    );
}


// =================================================================
// SECTION
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
            .padEnd(width)
    );
}


// =================================================================
// ALERT
// =================================================================

function formatAlert(
    alert,
    COLOR
) {

    switch (
        alert.level
    ) {

        case "danger":

            return color(
                `⚠ ${alert.text}`,
                COLOR.brightRed
            );


        case "warning":

            return color(
                `⚠ ${alert.text}`,
                COLOR.brightYellow
            );


        default:

            return color(
                `• ${alert.text}`,
                COLOR.brightCyan
            );
    }
}


// =================================================================
// MONEY
// =================================================================

function formatMoney(
    ns,
    value
) {

    if (
        !Number.isFinite(value)
    ) {

        return "$0.00";
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
// DURATION
// =================================================================

function formatDuration(
    seconds
) {

    if (
        seconds < 60
    ) {

        return (
            `${Math.floor(seconds)}s`
        );
    }


    const minutes =
        seconds /
        60;


    return (
        `${minutes.toFixed(1)}m`
    );
}


// =================================================================
// CENTER
// =================================================================

function centerText(
    text,
    width
) {

    const padding =
        Math.max(
            0,
            Math.floor(
                (
                    width -
                    text.length
                ) /
                2
            )
        );


    return (
        " ".repeat(
            padding
        ) +
        text
    );
}


// =================================================================
// COLOR
// =================================================================

function color(
    text,
    code
) {

    return (
        code +
        text +
        "\x1b[0m"
    );
}