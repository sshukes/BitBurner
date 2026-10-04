/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");


    // ============================================================
    // DEFAULT CONFIGURATION
    //
    // These match bb-dispatcher.js defaults.
    //
    // If bb-dispatcher.js is running, its command-line arguments
    // override these values automatically.
    // ============================================================

    const DEFAULT_CONFIG = {

        refreshMs: 2000,

        windowWidth: 1550,
        windowHeight: 780,

        displayTargets: 15,

        targetHackFraction: 0.05,

        homeReserveRam: 8,

        gapMs: 100,

        maxParallelBatches: 50,

        readyMoneyPercent: 0.99,

        readySecurityDelta: 0.05,

        maxAggregateHackFraction: 0.80,

        separatorWidth: 150
    };


    // ============================================================
    // FILES
    // ============================================================

    const DISPATCHER_SCRIPT =
        "bb-dispatcher.js";

    const WORKER = {

        hack:
            "bb-hack-worker.js",

        grow:
            "bb-grow-worker.js",

        weaken:
            "bb-weaken-worker.js"
    };


    const WORKER_NAMES =
        new Set(
            Object.values(
                WORKER
            )
        );


    // ============================================================
    // COLORS
    // ============================================================

    const COLOR = {

        reset:
            "\x1b[0m",

        bold:
            "\x1b[1m",

        brightWhite:
            "\x1b[97m",

        brightCyan:
            "\x1b[96m",

        brightGreen:
            "\x1b[92m",

        brightYellow:
            "\x1b[93m",

        brightRed:
            "\x1b[91m",

        gray:
            "\x1b[90m"
    };


    // ============================================================
    // PORT PROGRAMS
    // ============================================================

    const PORT_PROGRAMS = [

        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe"
    ];


    // ============================================================
    // VERIFY WORKERS
    // ============================================================

    for (
        const worker
        of Object.values(WORKER)
    ) {

        if (
            !ns.fileExists(
                worker,
                "home"
            )
        ) {

            ns.tprint(
                `WARNING: ${worker} does not currently exist on home.`
            );
        }
    }


    // ============================================================
    // ACTUAL WORKER RAM
    // ============================================================

    const RAM = {

        hack:
            ns.getScriptRam(
                WORKER.hack,
                "home"
            ),

        grow:
            ns.getScriptRam(
                WORKER.grow,
                "home"
            ),

        weaken:
            ns.getScriptRam(
                WORKER.weaken,
                "home"
            )
    };


    // ============================================================
    // WINDOW
    // ============================================================

    ns.ui.openTail();

    ns.ui.resizeTail(
        DEFAULT_CONFIG.windowWidth,
        DEFAULT_CONFIG.windowHeight
    );


    let lastDisplay = "";


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        // ========================================================
        // NETWORK
        // ========================================================

        const servers =
            scanNetwork(ns);


        const serverSet =
            new Set(
                servers
            );


        // ========================================================
        // PLAYER
        // ========================================================

        const playerHackLevel =
            ns.getHackingLevel();


        const playerMoney =
            ns.getServerMoneyAvailable(
                "home"
            );


        const portsAvailable =
            PORT_PROGRAMS.filter(
                program =>
                    ns.fileExists(
                        program,
                        "home"
                    )
            ).length;


        // ========================================================
        // READ CURRENT DISPATCHER SETTINGS
        // ========================================================

        const dispatcher =
            getDispatcherSettings(
                ns,
                DISPATCHER_SCRIPT,
                DEFAULT_CONFIG
            );


        const CONFIG =
            dispatcher.config;


        // ========================================================
        // WORKER ACTIVITY
        //
        // Scan the network ONCE.
        //
        // Old bb-targets.js scanned running processes separately
        // for every target.
        // ========================================================

        const activityMap =
            buildActivityMap(
                ns,
                servers,
                WORKER_NAMES,
                serverSet
            );


        // ========================================================
        // DISPATCHER-USABLE WORKER HOSTS
        // ========================================================

        const workerHosts =
            getWorkerHosts(
                ns,
                servers,
                CONFIG.homeReserveRam,
                WORKER
            );


        const networkStats =
            getNetworkStats(
                workerHosts
            );


        // ========================================================
        // ANALYZE ALL TARGETS
        // ========================================================

        const targets = [];


        for (
            const server
            of servers
        ) {

            if (
                server === "home"
            ) {

                continue;
            }


            const analysis =
                analyzeTarget(
                    ns,
                    server,
                    RAM,
                    CONFIG,
                    networkStats.freeRam
                );


            if (!analysis) {

                continue;
            }


            const state =
                getTargetState(
                    ns,
                    server,
                    CONFIG
                );


            const activity =
                activityMap.get(
                    server
                ) ??
                createEmptyActivity();


            const safeBatchLimit =
                calculateSafeBatchLimit(
                    analysis.actualHackFraction,
                    CONFIG.maxAggregateHackFraction
                );


            const requestedBatchLimit =
                Math.min(
                    CONFIG.maxParallelBatches,
                    safeBatchLimit
                );


            const ramBatchLimit =
                findMaximumBatchCount(
                    workerHosts,
                    analysis,
                    requestedBatchLimit,
                    WORKER
                );


            targets.push({

                ...analysis,

                ...state,

                activity,

                safeBatchLimit,

                requestedBatchLimit,

                possibleBatches:
                    ramBatchLimit
            });
        }


        // ========================================================
        // SORT EXACTLY LIKE DISPATCHER TARGET SELECTION
        // ========================================================

        targets.sort(
            (a, b) =>
                b.score -
                a.score
        );


        // ========================================================
        // CURRENT BEST TARGET
        // ========================================================

        const bestTarget =
            targets.length > 0
                ? targets[0].server
                : null;


        // ========================================================
        // DETERMINE ACTIVE DISPATCHER TARGET
        // ========================================================

        const activeDispatcherTargets =
            [...activityMap.entries()]

                .filter(
                    ([, activity]) =>
                        activity.workerProcesses > 0
                )

                .map(
                    ([server]) =>
                        server
                );


        let dispatcherTarget =
            null;


        if (
            dispatcher.targetOverride
        ) {

            dispatcherTarget =
                dispatcher.targetOverride;
        }

        else if (
            activeDispatcherTargets.length === 1
        ) {

            dispatcherTarget =
                activeDispatcherTargets[0];
        }


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
                    "BITBURNER // DISPATCHER TARGET ANALYZER",
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
        // PLAYER / NETWORK
        // ========================================================

        section(
            lines,
            "PLAYER / NETWORK",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Hack Level",
                playerHackLevel,
                24
            ) +

            field(
                "Cash",
                formatMoney(
                    ns,
                    playerMoney
                ),
                30
            ) +

            field(
                "Ports",
                `${portsAvailable}/5`,
                20
            ) +

            field(
                "Hackable Targets",
                targets.length,
                28
            ) +

            field(
                "Usable RAM",
                ns.format.ram(
                    networkStats.freeRam
                ),
                28
            )
        );


        // ========================================================
        // DISPATCHER SETTINGS
        // ========================================================

        section(
            lines,
            "DISPATCHER SETTINGS",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Dispatcher",
                dispatcher.running
                    ? "RUNNING"
                    : "NOT RUNNING",
                26
            ) +

            field(
                "Hack Goal",
                (
                    CONFIG.targetHackFraction *
                    100
                ).toFixed(1) +
                "%",
                24
            ) +

            field(
                "Gap",
                `${CONFIG.gapMs}ms`,
                22
            ) +

            field(
                "Max Batches",
                CONFIG.maxParallelBatches,
                24
            ) +

            field(
                "Aggregate Cap",
                (
                    CONFIG.maxAggregateHackFraction *
                    100
                ).toFixed(0) +
                "%",
                28
            )
        );


        lines.push(

            field(
                "Home Reserve",
                ns.format.ram(
                    CONFIG.homeReserveRam
                ),
                26
            ) +

            field(
                "Ready Money",
                (
                    CONFIG.readyMoneyPercent *
                    100
                ).toFixed(0) +
                "%",
                24
            ) +

            field(
                "Ready Security",
                `+${CONFIG.readySecurityDelta}`,
                22
            ) +

            field(
                "Worker Hosts",
                workerHosts.length,
                24
            ) +

            field(
                "Free RAM",
                ns.format.ram(
                    networkStats.freeRam
                ),
                28
            )
        );


        // ========================================================
        // WORKER RAM
        // ========================================================

        lines.push(

            field(
                "Hack RAM",
                ns.format.ram(
                    RAM.hack
                ),
                26
            ) +

            field(
                "Grow RAM",
                ns.format.ram(
                    RAM.grow
                ),
                24
            ) +

            field(
                "Weaken RAM",
                ns.format.ram(
                    RAM.weaken
                ),
                22
            ) +

            field(
                "Capacity",
                ns.format.ram(
                    networkStats.maxRam
                ),
                24
            ) +

            field(
                "Used",
                ns.format.ram(
                    networkStats.usedRam
                ),
                28
            )
        );


        // ========================================================
        // CURRENT SELECTION
        // ========================================================

        section(
            lines,
            "CURRENT SELECTION",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Best Target",
                bestTarget ??
                    "-",
                34
            ) +

            field(
                "Active Target",
                dispatcherTarget ??
                    (
                        activeDispatcherTargets.length > 1
                            ? activeDispatcherTargets.join(",")
                            : "-"
                    ),
                44
            ) +

            field(
                "Match",
                bestTarget &&
                dispatcherTarget &&
                bestTarget ===
                    dispatcherTarget
                    ? "YES"
                    : dispatcherTarget
                        ? "NO"
                        : "-",
                20
            )
        );


        // ========================================================
        // TABLE
        // ========================================================

        section(
            lines,
            "TARGET RANKING",
            CONFIG,
            COLOR
        );


        lines.push(

            "RK"
                .padStart(3) +

            " "
                .padEnd(1) +

            "SERVER"
                .padEnd(22) +

            "STATE"
                .padEnd(10) +

            "MONEY%"
                .padStart(8) +

            "SEC+"
                .padStart(8) +

            "CHANCE"
                .padStart(9) +

            "TAKE"
                .padStart(8) +

            "H"
                .padStart(5) +

            "W1"
                .padStart(5) +

            "G"
                .padStart(6) +

            "W2"
                .padStart(5) +

            "RAM"
                .padStart(11) +

            "BATCH"
                .padStart(7) +

            "$/SEC"
                .padStart(14) +

            "$/GB-SEC"
                .padStart(14) +

            "ACTIVE"
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


        const displayedTargets =
            targets.slice(
                0,
                CONFIG.displayTargets
            );


        for (
            let i = 0;
            i < displayedTargets.length;
            i++
        ) {

            const target =
                displayedTargets[i];


            const rank =
                i + 1;


            const bestMarker =
                rank === 1
                    ? "★"
                    : " ";


            const active =
                target.activity.workerProcesses > 0
                    ? `${target.activity.workerProcesses}/${target.activity.workerThreads}`
                    : "-";


            let line =

                String(rank)
                    .padStart(3) +

                bestMarker +

                target.server
                    .padEnd(22) +

                target.state
                    .padEnd(10) +

                (
                    target.moneyPercent *
                    100
                )
                    .toFixed(1)
                    .padStart(7) +
                "%" +

                target.securityDelta
                    .toFixed(2)
                    .padStart(8) +

                (
                    target.hackChance *
                    100
                )
                    .toFixed(1)
                    .padStart(8) +
                "%" +

                (
                    target.actualHackFraction *
                    100
                )
                    .toFixed(1)
                    .padStart(7) +
                "%" +

                String(
                    target.hackThreads
                )
                    .padStart(5) +

                String(
                    target.weaken1Threads
                )
                    .padStart(5) +

                String(
                    target.growThreads
                )
                    .padStart(6) +

                String(
                    target.weaken2Threads
                )
                    .padStart(5) +

                ns.format.ram(
                    target.batchRam
                )
                    .padStart(11) +

                String(
                    target.possibleBatches
                )
                    .padStart(7) +

                formatMoney(
                    ns,
                    target.expectedMoneyPerSecond
                )
                    .padStart(14) +

                formatMoney(
                    ns,
                    target.score
                )
                    .padStart(14) +

                active
                    .padStart(9);


            if (
                dispatcherTarget ===
                target.server
            ) {

                line =
                    color(
                        line,
                        COLOR.brightGreen
                    );
            }

            else if (
                rank === 1
            ) {

                line =
                    color(
                        line,
                        COLOR.brightCyan
                    );
            }


            lines.push(
                line
            );
        }


        // ========================================================
        // BEST TARGET DETAIL
        // ========================================================

        if (
            targets.length > 0
        ) {

            const best =
                targets[0];


            section(
                lines,
                "BEST TARGET DETAIL",
                CONFIG,
                COLOR
            );


            lines.push(

                field(
                    "Target",
                    best.server,
                    28
                ) +

                field(
                    "Max Money",
                    formatMoney(
                        ns,
                        best.maxMoney
                    ),
                    30
                ) +

                field(
                    "Expected / Batch",
                    formatMoney(
                        ns,
                        best.expectedMoney
                    ),
                    34
                ) +

                field(
                    "Hack Chance",
                    (
                        best.hackChance *
                        100
                    ).toFixed(1) +
                    "%",
                    26
                )
            );


            lines.push(

                field(
                    "Hack Time",
                    formatTime(
                        best.hackTime
                    ),
                    28
                ) +

                field(
                    "Grow Time",
                    formatTime(
                        best.growTime
                    ),
                    30
                ) +

                field(
                    "Weaken Time",
                    formatTime(
                        best.weakenTime
                    ),
                    34
                ) +

                field(
                    "Batch Duration",
                    formatTime(
                        best.batchDurationMs
                    ),
                    26
                )
            );


            lines.push(

                field(
                    "Batch RAM",
                    ns.format.ram(
                        best.batchRam
                    ),
                    28
                ) +

                field(
                    "Safe Batch Limit",
                    best.safeBatchLimit,
                    30
                ) +

                field(
                    "RAM-Fit Batches",
                    best.possibleBatches,
                    34
                ) +

                field(
                    "Score",
                    formatMoney(
                        ns,
                        best.score
                    ) +
                    "/GB-sec",
                    26
                )
            );
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
                "★ = target bb-dispatcher would rank highest  |  ACTIVE = worker processes / worker threads  |  Ranking uses exact dispatcher $ / GB-sec model",
                COLOR.gray
            )
        );


        // ========================================================
        // DISPLAY
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

            `TARGETS  |  ` +

            `Best ${bestTarget ?? "-"}  |  ` +

            `Hack ${(CONFIG.targetHackFraction * 100).toFixed(1)}%  |  ` +

            `RAM ${ns.format.ram(networkStats.freeRam)}`
        );


        await ns.sleep(
            CONFIG.refreshMs
        );
    }
}


// =================================================================
// ANALYZE TARGET
//
// This intentionally mirrors bb-dispatcher.js analyzeTarget()
// and calculateBatch().
// =================================================================

function analyzeTarget(
    ns,
    server,
    RAM,
    CONFIG,
    networkFreeRam
) {

    if (
        server === "home"
    ) {

        return null;
    }


    if (
        !ns.serverExists(
            server
        )
    ) {

        return null;
    }


    const data =
        ns.getServer(
            server
        );


    // ============================================================
    // ROOT REQUIRED
    // ============================================================

    if (
        !data.hasAdminRights
    ) {

        return null;
    }


    // ============================================================
    // MONEY REQUIRED
    // ============================================================

    const maxMoney =
        data.moneyMax ??
        0;


    if (
        maxMoney <= 0
    ) {

        return null;
    }


    // ============================================================
    // HACK LEVEL REQUIRED
    // ============================================================

    if (
        (
            data.requiredHackingSkill ??
            0
        ) >
        ns.getHackingLevel()
    ) {

        return null;
    }


    // ============================================================
    // BATCH
    // ============================================================

    const batch =
        calculateBatch(
            ns,
            server,
            RAM,
            CONFIG
        );


    if (!batch) {

        return null;
    }


    // ============================================================
    // HACK CHANCE
    // ============================================================

    const hackChance =
        ns.hackAnalyzeChance(
            server
        );


    if (
        !Number.isFinite(
            hackChance
        ) ||
        hackChance <= 0
    ) {

        return null;
    }


    // ============================================================
    // EXPECTED MONEY
    // ============================================================

    const expectedMoney =
        maxMoney *
        batch.actualHackFraction *
        hackChance;


    // ============================================================
    // DISPATCHER BATCH DURATION
    //
    // bb-dispatcher uses Weak2 as the final operation.
    // ============================================================

    const batchDurationMs =
        batch.weakenTime +
        (
            3 *
            CONFIG.gapMs
        );


    const batchDurationSeconds =
        Math.max(
            0.001,
            batchDurationMs /
            1000
        );


    // ============================================================
    // DISPATCHER SCORE
    //
    // This is intentionally the SAME calculation currently used by
    // bb-dispatcher.js.
    // ============================================================

    const ramSeconds =
        batch.batchRam *
        batchDurationSeconds;


    if (
        !Number.isFinite(
            ramSeconds
        ) ||
        ramSeconds <= 0
    ) {

        return null;
    }


    const score =
        expectedMoney /
        ramSeconds;


    const expectedMoneyPerSecond =
        expectedMoney /
        batchDurationSeconds;


    return {

        server,

        requiredHack:
            data.requiredHackingSkill ??
            0,

        maxMoney,

        hackChance,

        expectedMoney,

        expectedMoneyPerSecond,

        score,

        ramSeconds,

        batchDurationMs,

        networkFreeRam,

        ...batch
    };
}


// =================================================================
// TARGET STATE
// =================================================================

function getTargetState(
    ns,
    target,
    CONFIG
) {

    const maxMoney =
        ns.getServerMaxMoney(
            target
        );


    const money =
        ns.getServerMoneyAvailable(
            target
        );


    const minSecurity =
        ns.getServerMinSecurityLevel(
            target
        );


    const security =
        ns.getServerSecurityLevel(
            target
        );


    const moneyPercent =
        maxMoney > 0
            ? money /
              maxMoney
            : 0;


    const securityDelta =
        Math.max(
            0,
            security -
            minSecurity
        );


    let state =
        "READY";


    if (
        securityDelta >
        CONFIG.readySecurityDelta
    ) {

        state =
            "WEAKEN";
    }

    else if (
        moneyPercent <
        CONFIG.readyMoneyPercent
    ) {

        state =
            "GROW";
    }


    return {

        money,

        maxMoney,

        moneyPercent,

        security,

        minSecurity,

        securityDelta,

        state
    };
}


// =================================================================
// CALCULATE HWGW BATCH
//
// Mirrors bb-dispatcher.js.
// =================================================================

function calculateBatch(
    ns,
    target,
    RAM,
    CONFIG
) {

    // ============================================================
    // HACK FRACTION PER THREAD
    // ============================================================

    const hackFractionPerThread =
        ns.hackAnalyze(
            target
        );


    if (
        !Number.isFinite(
            hackFractionPerThread
        ) ||
        hackFractionPerThread <= 0
    ) {

        return null;
    }


    // ============================================================
    // HACK THREADS
    // ============================================================

    let hackThreads =
        Math.max(
            1,
            Math.floor(
                CONFIG.targetHackFraction /
                hackFractionPerThread
            )
        );


    let actualHackFraction =
        hackThreads *
        hackFractionPerThread;


    // Same individual-batch safety used by dispatcher.

    if (
        actualHackFraction >=
        0.90
    ) {

        hackThreads =
            Math.max(
                1,
                Math.floor(
                    0.90 /
                    hackFractionPerThread
                )
            );


        actualHackFraction =
            hackThreads *
            hackFractionPerThread;
    }


    actualHackFraction =
        Math.min(
            0.90,
            actualHackFraction
        );


    // ============================================================
    // GROW
    // ============================================================

    const remainingMoneyFraction =
        Math.max(
            0.01,
            1 -
            actualHackFraction
        );


    const growMultiplier =
        1 /
        remainingMoneyFraction;


    let growThreads;


    try {

        growThreads =
            Math.ceil(
                ns.growthAnalyze(
                    target,
                    growMultiplier,
                    1
                )
            );
    }
    catch {

        return null;
    }


    if (
        !Number.isFinite(
            growThreads
        )
    ) {

        return null;
    }


    growThreads =
        Math.max(
            1,
            growThreads
        );


    // ============================================================
    // WEAKEN EFFECT
    // ============================================================

    const weakenPerThread =
        ns.weakenAnalyze(
            1,
            1
        );


    if (
        !Number.isFinite(
            weakenPerThread
        ) ||
        weakenPerThread <= 0
    ) {

        return null;
    }


    // ============================================================
    // HACK SECURITY
    // ============================================================

    const hackSecurity =
        ns.hackAnalyzeSecurity(
            hackThreads,
            target
        );


    // ============================================================
    // GROW SECURITY
    // ============================================================

    const growSecurity =
        ns.growthAnalyzeSecurity(
            growThreads,
            target,
            1
        );


    // ============================================================
    // WEAKEN 1
    //
    // Repairs hack security.
    // ============================================================

    const weaken1Threads =
        Math.max(
            1,
            Math.ceil(
                hackSecurity /
                weakenPerThread
            )
        );


    // ============================================================
    // WEAKEN 2
    //
    // Repairs grow security.
    // ============================================================

    const weaken2Threads =
        Math.max(
            1,
            Math.ceil(
                growSecurity /
                weakenPerThread
            )
        );


    // ============================================================
    // TIMES
    // ============================================================

    const hackTime =
        ns.getHackTime(
            target
        );


    const growTime =
        ns.getGrowTime(
            target
        );


    const weakenTime =
        ns.getWeakenTime(
            target
        );


    if (
        !Number.isFinite(
            hackTime
        ) ||

        !Number.isFinite(
            growTime
        ) ||

        !Number.isFinite(
            weakenTime
        ) ||

        hackTime <= 0 ||

        growTime <= 0 ||

        weakenTime <= 0
    ) {

        return null;
    }


    // ============================================================
    // BATCH RAM
    // ============================================================

    const batchRam =
        (
            hackThreads *
            RAM.hack
        ) +
        (
            growThreads *
            RAM.grow
        ) +
        (
            (
                weaken1Threads +
                weaken2Threads
            ) *
            RAM.weaken
        );


    return {

        hackThreads,

        growThreads,

        weaken1Threads,

        weaken2Threads,

        hackFractionPerThread,

        actualHackFraction,

        growMultiplier,

        hackSecurity,

        growSecurity,

        hackTime,

        growTime,

        weakenTime,

        batchRam
    };
}


// =================================================================
// SAFE PARALLEL BATCH LIMIT
//
// Mirrors bb-dispatcher.js.
// =================================================================

function calculateSafeBatchLimit(
    hackFraction,
    maxAggregateFraction
) {

    if (
        hackFraction <= 0
    ) {

        return 1;
    }


    if (
        hackFraction >=
        maxAggregateFraction
    ) {

        return 1;
    }


    const minimumRemaining =
        1 -
        maxAggregateFraction;


    const count =
        Math.floor(
            Math.log(
                minimumRemaining
            ) /
            Math.log(
                1 -
                hackFraction
            )
        );


    return Math.max(
        1,
        count
    );
}


// =================================================================
// FIND MAXIMUM BATCH COUNT THAT FITS AVAILABLE RAM
// =================================================================

function findMaximumBatchCount(
    hosts,
    batch,
    maximum,
    WORKER
) {

    let low = 0;

    let high =
        maximum;


    while (
        low <
        high
    ) {

        const mid =
            Math.ceil(
                (
                    low +
                    high
                ) /
                2
            );


        const actions =
            buildSimpleBatchActions(
                batch,
                mid,
                WORKER
            );


        const allocation =
            allocateActions(
                cloneHosts(
                    hosts
                ),
                actions
            );


        if (
            allocation.success
        ) {

            low =
                mid;
        }
        else {

            high =
                mid - 1;
        }
    }


    return low;
}


// =================================================================
// SIMPLE BATCH ACTIONS
// =================================================================

function buildSimpleBatchActions(
    batch,
    batchCount,
    WORKER
) {

    const actions = [];


    for (
        let i = 0;
        i < batchCount;
        i++
    ) {

        actions.push({

            script:
                WORKER.hack,

            threads:
                batch.hackThreads
        });


        actions.push({

            script:
                WORKER.weaken,

            threads:
                batch.weaken1Threads
        });


        actions.push({

            script:
                WORKER.grow,

            threads:
                batch.growThreads
        });


        actions.push({

            script:
                WORKER.weaken,

            threads:
                batch.weaken2Threads
        });
    }


    return actions;
}


// =================================================================
// WORKER HOSTS
//
// Mirrors dispatcher available-RAM behavior.
// =================================================================

function getWorkerHosts(
    ns,
    servers,
    homeReserveRam,
    WORKER
) {

    const hosts = [];


    const scripts =
        Object.values(
            WORKER
        );


    for (
        const server
        of servers
    ) {

        if (
            !ns.hasRootAccess(
                server
            )
        ) {

            continue;
        }


        const maxRam =
            ns.getServerMaxRam(
                server
            );


        if (
            maxRam <= 0
        ) {

            continue;
        }


        const usedRam =
            ns.getServerUsedRam(
                server
            );


        const reserve =
            server === "home"
                ? homeReserveRam
                : 0;


        const freeRam =
            Math.max(
                0,
                maxRam -
                usedRam -
                reserve
            );


        const scriptRam = {};


        for (
            const script
            of scripts
        ) {

            scriptRam[script] =
                ns.getScriptRam(
                    script,
                    "home"
                );
        }


        hosts.push({

            server,

            maxRam,

            usedRam,

            freeRam,

            scriptRam
        });
    }


    hosts.sort(
        (a, b) =>
            b.freeRam -
            a.freeRam
    );


    return hosts;
}


// =================================================================
// NETWORK STATS
// =================================================================

function getNetworkStats(
    hosts
) {

    let maxRam = 0;
    let usedRam = 0;
    let freeRam = 0;


    for (
        const host
        of hosts
    ) {

        maxRam +=
            host.maxRam;

        usedRam +=
            host.usedRam;

        freeRam +=
            host.freeRam;
    }


    return {

        hosts:
            hosts.length,

        maxRam,

        usedRam,

        freeRam
    };
}


// =================================================================
// ALLOCATE ACTIONS
//
// Mirrors dispatcher RAM-placement behavior.
// =================================================================

function allocateActions(
    hosts,
    actions
) {

    for (
        const action
        of actions
    ) {

        let remaining =
            action.threads;


        for (
            const host
            of hosts
        ) {

            if (
                remaining <= 0
            ) {

                break;
            }


            const ram =
                host.scriptRam[
                    action.script
                ];


            if (
                !ram ||
                ram <= 0
            ) {

                continue;
            }


            const possible =
                Math.floor(
                    host.freeRam /
                    ram
                );


            if (
                possible <= 0
            ) {

                continue;
            }


            const threads =
                Math.min(
                    possible,
                    remaining
                );


            host.freeRam -=
                threads *
                ram;


            remaining -=
                threads;
        }


        if (
            remaining > 0
        ) {

            return {
                success:
                    false
            };
        }
    }


    return {
        success:
            true
    };
}


// =================================================================
// CLONE HOSTS
// =================================================================

function cloneHosts(
    hosts
) {

    return hosts.map(
        host => ({

            ...host,

            scriptRam: {
                ...host.scriptRam
            }
        })
    );
}


// =================================================================
// BUILD ACTIVITY MAP
//
// Scan processes once and determine which targets the dispatcher
// workers are currently attacking.
// =================================================================

function buildActivityMap(
    ns,
    servers,
    workerNames,
    serverSet
) {

    const activity =
        new Map();


    for (
        const host
        of servers
    ) {

        if (
            !ns.hasRootAccess(
                host
            )
        ) {

            continue;
        }


        const processes =
            ns.ps(
                host
            );


        for (
            const process
            of processes
        ) {

            if (
                !workerNames.has(
                    process.filename
                )
            ) {

                continue;
            }


            const target =
                determineWorkerTarget(
                    process,
                    serverSet
                );


            if (!target) {

                continue;
            }


            if (
                !activity.has(
                    target
                )
            ) {

                activity.set(
                    target,
                    createEmptyActivity()
                );
            }


            const entry =
                activity.get(
                    target
                );


            entry.workerProcesses++;

            entry.workerThreads +=
                process.threads;


            entry.hosts.add(
                host
            );


            if (
                process.filename ===
                "bb-hack-worker.js"
            ) {

                entry.hackProcesses++;

                entry.hackThreads +=
                    process.threads;
            }


            else if (
                process.filename ===
                "bb-grow-worker.js"
            ) {

                entry.growProcesses++;

                entry.growThreads +=
                    process.threads;
            }


            else if (
                process.filename ===
                "bb-weaken-worker.js"
            ) {

                entry.weakenProcesses++;

                entry.weakenThreads +=
                    process.threads;
            }
        }
    }


    return activity;
}


// =================================================================
// EMPTY ACTIVITY
// =================================================================

function createEmptyActivity() {

    return {

        workerProcesses:
            0,

        workerThreads:
            0,

        hackProcesses:
            0,

        hackThreads:
            0,

        growProcesses:
            0,

        growThreads:
            0,

        weakenProcesses:
            0,

        weakenThreads:
            0,

        hosts:
            new Set()
    };
}


// =================================================================
// WORKER TARGET
// =================================================================

function determineWorkerTarget(
    process,
    serverSet
) {

    if (
        !process.args
    ) {

        return null;
    }


    for (
        const arg
        of process.args
    ) {

        const value =
            String(
                arg
            );


        if (
            serverSet.has(
                value
            )
        ) {

            return value;
        }
    }


    return null;
}


// =================================================================
// READ RUNNING DISPATCHER SETTINGS
// =================================================================

function getDispatcherSettings(
    ns,
    dispatcherFilename,
    defaults
) {

    const config = {

        refreshMs:
            defaults.refreshMs,

        windowWidth:
            defaults.windowWidth,

        windowHeight:
            defaults.windowHeight,

        displayTargets:
            defaults.displayTargets,

        targetHackFraction:
            defaults.targetHackFraction,

        homeReserveRam:
            defaults.homeReserveRam,

        gapMs:
            defaults.gapMs,

        maxParallelBatches:
            defaults.maxParallelBatches,

        readyMoneyPercent:
            defaults.readyMoneyPercent,

        readySecurityDelta:
            defaults.readySecurityDelta,

        maxAggregateHackFraction:
            defaults.maxAggregateHackFraction,

        separatorWidth:
            defaults.separatorWidth
    };


    const result = {

        running:
            false,

        pid:
            0,

        args:
            [],

        targetOverride:
            "",

        config
    };


    const processes =
        ns.ps(
            "home"
        );


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
    // PARSE FLAGS
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


        // --------------------------------------------------------
        // --hack
        // --------------------------------------------------------

        if (
            arg === "--hack" &&
            i + 1 <
                dispatcher.args.length
        ) {

            const value =
                Number(
                    dispatcher.args[
                        ++i
                    ]
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                config.targetHackFraction =
                    clamp(
                        value,
                        0.01,
                        0.50
                    );
            }


            continue;
        }


        if (
            arg.startsWith(
                "--hack="
            )
        ) {

            const value =
                Number(
                    arg.substring(
                        "--hack=".length
                    )
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                config.targetHackFraction =
                    clamp(
                        value,
                        0.01,
                        0.50
                    );
            }


            continue;
        }


        // --------------------------------------------------------
        // --reserve
        // --------------------------------------------------------

        if (
            arg === "--reserve" &&
            i + 1 <
                dispatcher.args.length
        ) {

            const value =
                Number(
                    dispatcher.args[
                        ++i
                    ]
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                config.homeReserveRam =
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

                config.homeReserveRam =
                    Math.max(
                        0,
                        value
                    );
            }


            continue;
        }


        // --------------------------------------------------------
        // --gap
        // --------------------------------------------------------

        if (
            arg === "--gap" &&
            i + 1 <
                dispatcher.args.length
        ) {

            const value =
                Number(
                    dispatcher.args[
                        ++i
                    ]
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                config.gapMs =
                    Math.max(
                        20,
                        value
                    );
            }


            continue;
        }


        if (
            arg.startsWith(
                "--gap="
            )
        ) {

            const value =
                Number(
                    arg.substring(
                        "--gap=".length
                    )
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                config.gapMs =
                    Math.max(
                        20,
                        value
                    );
            }


            continue;
        }


        // --------------------------------------------------------
        // --max-batches
        // --------------------------------------------------------

        if (
            arg === "--max-batches" &&
            i + 1 <
                dispatcher.args.length
        ) {

            const value =
                Number(
                    dispatcher.args[
                        ++i
                    ]
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                config.maxParallelBatches =
                    Math.max(
                        1,
                        Math.floor(
                            value
                        )
                    );
            }


            continue;
        }


        if (
            arg.startsWith(
                "--max-batches="
            )
        ) {

            const value =
                Number(
                    arg.substring(
                        "--max-batches=".length
                    )
                );


            if (
                Number.isFinite(
                    value
                )
            ) {

                config.maxParallelBatches =
                    Math.max(
                        1,
                        Math.floor(
                            value
                        )
                    );
            }


            continue;
        }


        // --------------------------------------------------------
        // --target
        // --------------------------------------------------------

        if (
            arg === "--target" &&
            i + 1 <
                dispatcher.args.length
        ) {

            result.targetOverride =
                String(
                    dispatcher.args[
                        ++i
                    ]
                );


            continue;
        }


        if (
            arg.startsWith(
                "--target="
            )
        ) {

            result.targetOverride =
                arg.substring(
                    "--target=".length
                );
        }
    }


    return result;
}


// =================================================================
// NETWORK SCAN
// =================================================================

function scanNetwork(
    ns
) {

    const visited =
        new Set();


    const servers =
        [];


    function scan(
        server
    ) {

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
            of ns.scan(
                server
            )
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
            .padEnd(
                width
            )
    );
}


// =================================================================
// MONEY
// =================================================================

function formatMoney(
    ns,
    value
) {

    if (
        !Number.isFinite(
            value
        ) ||
        value <= 0
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
// TIME
// =================================================================

function formatTime(
    milliseconds
) {

    if (
        !Number.isFinite(
            milliseconds
        ) ||
        milliseconds <= 0
    ) {

        return "0s";
    }


    const seconds =
        milliseconds /
        1000;


    if (
        seconds < 60
    ) {

        return (
            seconds.toFixed(
                1
            ) +
            "s"
        );
    }


    return (
        (
            seconds /
            60
        ).toFixed(
            1
        ) +
        "m"
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


// =================================================================
// CLAMP
// =================================================================

function clamp(
    value,
    min,
    max
) {

    return Math.min(
        max,
        Math.max(
            min,
            value
        )
    );
}