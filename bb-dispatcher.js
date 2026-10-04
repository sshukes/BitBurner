/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");


    // ============================================================
    // RUN FROM HOME
    // ============================================================

    if (ns.getHostname() !== "home") {

        ns.tprint(
            "ERROR: bb-dispatcher.js must be run from home."
        );

        return;
    }


    // ============================================================
    // COMMAND LINE OPTIONS
    // ============================================================

    const flags = ns.flags([
        ["target", ""],
        ["hack", 0.05],
        ["reserve", 8],
        ["gap", 100],
        ["max-batches", 50],
        ["dry-run", false]
    ]);


    const CONFIG = {

        refreshMs: 1000,

        targetHackFraction:
            clamp(
                Number(flags.hack),
                0.01,
                0.50
            ),

        homeReserveRam:
            Math.max(
                0,
                Number(flags.reserve)
            ),

        gapMs:
            Math.max(
                20,
                Number(flags.gap)
            ),

        maxParallelBatches:
            Math.max(
                1,
                Math.floor(
                    Number(flags["max-batches"])
                )
            ),

        targetOverride:
            String(
                flags.target ?? ""
            ),

        dryRun:
            Boolean(
                flags["dry-run"]
            ),

        readyMoneyPercent: 0.99,

        readySecurityDelta: 0.05,

        maxAggregateHackFraction: 0.80,

        windowWidth: 1350,
        windowHeight: 750,

        separatorWidth: 128
    };


    // ============================================================
    // WORKER FILES
    // ============================================================

    const WORKER = {

        hack:
            "bb-hack-worker.js",

        grow:
            "bb-grow-worker.js",

        weaken:
            "bb-weaken-worker.js"
    };


    // ============================================================
    // WORKER SOURCE
    // ============================================================

    const WORKER_CODE = {

        hack:
`/** @param {NS} ns */
export async function main(ns) {

    const target =
        String(ns.args[0]);

    const additionalMsec =
        Number(ns.args[1] ?? 0);

    await ns.hack(
        target,
        {
            additionalMsec
        }
    );
}
`,

        grow:
`/** @param {NS} ns */
export async function main(ns) {

    const target =
        String(ns.args[0]);

    const additionalMsec =
        Number(ns.args[1] ?? 0);

    await ns.grow(
        target,
        {
            additionalMsec
        }
    );
}
`,

        weaken:
`/** @param {NS} ns */
export async function main(ns) {

    const target =
        String(ns.args[0]);

    const additionalMsec =
        Number(ns.args[1] ?? 0);

    await ns.weaken(
        target,
        {
            additionalMsec
        }
    );
}
`
    };


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
    // CREATE / REPAIR WORKERS
    // ============================================================

    await ensureWorker(
        ns,
        WORKER.hack,
        WORKER_CODE.hack
    );

    await ensureWorker(
        ns,
        WORKER.grow,
        WORKER_CODE.grow
    );

    await ensureWorker(
        ns,
        WORKER.weaken,
        WORKER_CODE.weaken
    );


    // ============================================================
    // SCRIPT RAM
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
    // UI
    // ============================================================

    ns.ui.openTail();

    ns.ui.resizeTail(
        CONFIG.windowWidth,
        CONFIG.windowHeight
    );

    ns.ui.setTailTitle(
        "BITBURNER // AUTOMATIC HWGW DISPATCHER"
    );


    // ============================================================
    // STATE
    // ============================================================

    let lastDisplay = "";

    let cycleNumber = 0;

    let totalBatchesLaunched = 0;

    let totalRooted = 0;

    let lastBatchCount = 0;

    let lastAction =
        "Initializing";


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        cycleNumber++;


        // ========================================================
        // NETWORK DISCOVERY
        // ========================================================

        const servers =
            scanNetwork(
                ns
            );


        // ========================================================
        // ROOT EVERYTHING POSSIBLE
        // ========================================================

        const newlyRooted =
            rootAvailableServers(
                ns,
                servers
            );


        totalRooted +=
            newlyRooted;


        // ========================================================
        // DISTRIBUTE WORKERS
        // ========================================================

        await distributeWorkers(
            ns,
            servers,
            WORKER
        );


        // ========================================================
        // WORKER POOL
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
        // TARGET SELECTION
        // ========================================================

        let target;

        let targetAnalysis =
            null;


        if (
            CONFIG.targetOverride
        ) {

            target =
                validateTarget(
                    ns,
                    CONFIG.targetOverride
                );


            if (!target) {

                ns.tprint(
                    `ERROR: Invalid target: ${CONFIG.targetOverride}`
                );

                return;
            }


            targetAnalysis =
                analyzeTarget(
                    ns,
                    target,
                    RAM,
                    CONFIG
                );
        }
        else {

            const selection =
                selectBestTarget(
                    ns,
                    servers,
                    RAM,
                    CONFIG
                );


            target =
                selection?.server ??
                null;


            targetAnalysis =
                selection ??
                null;
        }


        // ========================================================
        // NO TARGET
        // ========================================================

        if (!target) {

            lastAction =
                "No viable target found";


            lastDisplay =
                renderDashboard(
                    ns,
                    CONFIG,
                    COLOR,
                    RAM,
                    {
                        target: null,
                        targetAnalysis: null,
                        cycleNumber,
                        totalBatchesLaunched,
                        lastAction,
                        lastBatchCount,
                        networkStats,
                        workerHosts,
                        newlyRooted,
                        totalRooted
                    },
                    lastDisplay
                );


            await ns.sleep(
                CONFIG.refreshMs
            );

            continue;
        }


        // ========================================================
        // TARGET STATE
        // ========================================================

        const targetState =
            getTargetState(
                ns,
                target
            );


        // ========================================================
        // SECURITY PREP
        // ========================================================

        if (
            targetState.securityDelta >
            CONFIG.readySecurityDelta
        ) {

            lastAction =
                "PREP // WEAKEN";


            const result =
                await prepSecurity(
                    ns,
                    target,
                    workerHosts,
                    RAM,
                    CONFIG,
                    WORKER
                );


            lastDisplay =
                renderDashboard(
                    ns,
                    CONFIG,
                    COLOR,
                    RAM,
                    {
                        target,
                        targetAnalysis,
                        cycleNumber,
                        totalBatchesLaunched,
                        lastAction,
                        lastBatchCount: 0,
                        networkStats,
                        workerHosts,
                        newlyRooted,
                        totalRooted,
                        plan: result
                    },
                    lastDisplay
                );


            if (
                !CONFIG.dryRun &&
                result.launched
            ) {

                await waitForWorkers(
                    ns,
                    servers,
                    WORKER
                );
            }
            else {

                await ns.sleep(
                    CONFIG.refreshMs
                );
            }


            continue;
        }


        // ========================================================
        // MONEY PREP
        // ========================================================

        if (
            targetState.moneyPercent <
            CONFIG.readyMoneyPercent
        ) {

            lastAction =
                "PREP // GROW + WEAKEN";


            const result =
                await prepMoney(
                    ns,
                    target,
                    workerHosts,
                    CONFIG,
                    WORKER
                );


            lastDisplay =
                renderDashboard(
                    ns,
                    CONFIG,
                    COLOR,
                    RAM,
                    {
                        target,
                        targetAnalysis,
                        cycleNumber,
                        totalBatchesLaunched,
                        lastAction,
                        lastBatchCount: 0,
                        networkStats,
                        workerHosts,
                        newlyRooted,
                        totalRooted,
                        plan: result
                    },
                    lastDisplay
                );


            if (
                !CONFIG.dryRun &&
                result.launched
            ) {

                await waitForWorkers(
                    ns,
                    servers,
                    WORKER
                );
            }
            else {

                await ns.sleep(
                    CONFIG.refreshMs
                );
            }


            continue;
        }


        // ========================================================
        // CALCULATE CURRENT HWGW BATCH
        // ========================================================

        const batchPlan =
            calculateBatch(
                ns,
                target,
                RAM,
                CONFIG
            );


        if (!batchPlan) {

            lastAction =
                "Unable to calculate batch";


            await ns.sleep(
                CONFIG.refreshMs
            );

            continue;
        }


        // ========================================================
        // REFRESH TARGET ANALYSIS
        //
        // Target should now be prepared, so this gives us the
        // most useful efficiency measurement.
        // ========================================================

        targetAnalysis =
            analyzeTarget(
                ns,
                target,
                RAM,
                CONFIG
            );


        // ========================================================
        // SAFE BATCH COUNT
        // ========================================================

        const safeBatchLimit =
            calculateSafeBatchLimit(
                batchPlan.actualHackFraction,
                CONFIG.maxAggregateHackFraction
            );


        const requestedBatchLimit =
            Math.min(
                CONFIG.maxParallelBatches,
                safeBatchLimit
            );


        const currentHosts =
            getWorkerHosts(
                ns,
                servers,
                CONFIG.homeReserveRam,
                WORKER
            );


        const batchCount =
            findMaximumBatchCount(
                currentHosts,
                batchPlan,
                requestedBatchLimit,
                WORKER
            );


        lastBatchCount =
            batchCount;


        // ========================================================
        // WAITING FOR RAM
        // ========================================================

        if (
            batchCount <= 0
        ) {

            lastAction =
                "READY // Waiting for RAM";


            lastDisplay =
                renderDashboard(
                    ns,
                    CONFIG,
                    COLOR,
                    RAM,
                    {
                        target,
                        targetAnalysis,
                        cycleNumber,
                        totalBatchesLaunched,
                        lastAction,
                        lastBatchCount,
                        networkStats,
                        workerHosts,
                        newlyRooted,
                        totalRooted,
                        batchPlan
                    },
                    lastDisplay
                );


            await ns.sleep(
                CONFIG.refreshMs
            );

            continue;
        }


        // ========================================================
        // BUILD STAGGERED HWGW PIPELINE
        // ========================================================

        const actions =
            buildBatchActions(
                target,
                batchPlan,
                batchCount,
                CONFIG,
                WORKER
            );


        const hosts =
            getWorkerHosts(
                ns,
                servers,
                CONFIG.homeReserveRam,
                WORKER
            );


        const placement =
            allocateActions(
                hosts,
                actions
            );


        if (
            !placement.success
        ) {

            lastAction =
                "Allocation failed";


            await ns.sleep(
                CONFIG.refreshMs
            );

            continue;
        }


        // ========================================================
        // DRY RUN
        // ========================================================

        if (
            CONFIG.dryRun
        ) {

            lastAction =
                `DRY RUN // ${batchCount} batches`;


            lastDisplay =
                renderDashboard(
                    ns,
                    CONFIG,
                    COLOR,
                    RAM,
                    {
                        target,
                        targetAnalysis,
                        cycleNumber,
                        totalBatchesLaunched,
                        lastAction,
                        lastBatchCount,
                        networkStats,
                        workerHosts,
                        newlyRooted,
                        totalRooted,
                        batchPlan,
                        placement
                    },
                    lastDisplay
                );


            await ns.sleep(
                2000
            );

            continue;
        }


        // ========================================================
        // LAUNCH
        // ========================================================

        const launchResult =
            launchPlacements(
                ns,
                placement.placements
            );


        if (
            !launchResult.success
        ) {

            lastAction =
                "Batch launch failed";


            for (
                const pid
                of launchResult.startedPids
            ) {

                ns.kill(
                    pid
                );
            }


            await ns.sleep(
                CONFIG.refreshMs
            );

            continue;
        }


        totalBatchesLaunched +=
            batchCount;


        lastAction =
            `RUNNING // ${batchCount} HWGW batches`;


        // ========================================================
        // ACTIVE DISPLAY
        // ========================================================

        const updatedHosts =
            getWorkerHosts(
                ns,
                servers,
                CONFIG.homeReserveRam,
                WORKER
            );


        lastDisplay =
            renderDashboard(
                ns,
                CONFIG,
                COLOR,
                RAM,
                {
                    target,
                    targetAnalysis,
                    cycleNumber,
                    totalBatchesLaunched,
                    lastAction,
                    lastBatchCount,

                    networkStats:
                        getNetworkStats(
                            updatedHosts
                        ),

                    workerHosts:
                        updatedHosts,

                    newlyRooted,
                    totalRooted,

                    batchPlan,
                    placement
                },
                lastDisplay
            );


        // ========================================================
        // WAIT UNTIL CURRENT PIPELINE FINISHES
        // ========================================================

        await waitForWorkers(
            ns,
            servers,
            WORKER
        );
    }
}


// =================================================================
// CREATE / REPAIR WORKER
// =================================================================

async function ensureWorker(
    ns,
    filename,
    contents
) {

    let existing = "";


    if (
        ns.fileExists(
            filename,
            "home"
        )
    ) {

        existing =
            ns.read(
                filename
            );
    }


    if (
        existing !==
        contents
    ) {

        await ns.write(
            filename,
            contents,
            "w"
        );
    }
}


// =================================================================
// ROOT AVAILABLE SERVERS
// =================================================================

function rootAvailableServers(
    ns,
    servers
) {

    const programs = [

        {
            file:
                "BruteSSH.exe",

            open:
                server =>
                    ns.brutessh(
                        server
                    )
        },

        {
            file:
                "FTPCrack.exe",

            open:
                server =>
                    ns.ftpcrack(
                        server
                    )
        },

        {
            file:
                "relaySMTP.exe",

            open:
                server =>
                    ns.relaysmtp(
                        server
                    )
        },

        {
            file:
                "HTTPWorm.exe",

            open:
                server =>
                    ns.httpworm(
                        server
                    )
        },

        {
            file:
                "SQLInject.exe",

            open:
                server =>
                    ns.sqlinject(
                        server
                    )
        }
    ];


    const availablePrograms =
        programs.filter(
            program =>
                ns.fileExists(
                    program.file,
                    "home"
                )
        );


    let rooted = 0;


    for (
        const server
        of servers
    ) {

        if (
            server === "home"
        ) {
            continue;
        }


        if (
            ns.hasRootAccess(
                server
            )
        ) {
            continue;
        }


        const portsRequired =
            ns.getServerNumPortsRequired(
                server
            );


        if (
            availablePrograms.length <
            portsRequired
        ) {

            continue;
        }


        for (
            const program
            of availablePrograms
        ) {

            program.open(
                server
            );
        }


        const success =
            ns.nuke(
                server
            );


        if (
            success &&
            ns.hasRootAccess(
                server
            )
        ) {

            rooted++;
        }
    }


    return rooted;
}


// =================================================================
// SELECT BEST TARGET
//
// NEW:
// Instead of:
//
//     expected money / hack time
//
// we evaluate the entire HWGW batch:
//
//     expected money
//     ------------------------
//     batch RAM * batch seconds
//
// This gives us expected dollars per RAM-second.
// =================================================================

function selectBestTarget(
    ns,
    servers,
    RAM,
    CONFIG
) {

    const candidates = [];


    for (
        const server
        of servers
    ) {

        const analysis =
            analyzeTarget(
                ns,
                server,
                RAM,
                CONFIG
            );


        if (!analysis) {
            continue;
        }


        candidates.push(
            analysis
        );
    }


    candidates.sort(
        (a, b) =>
            b.score -
            a.score
    );


    return (
        candidates[0] ??
        null
    );
}


// =================================================================
// ANALYZE TARGET PROFITABILITY
// =================================================================

function analyzeTarget(
    ns,
    server,
    RAM,
    CONFIG
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


    // Must already have root.

    if (
        !data.hasAdminRights
    ) {

        return null;
    }


    const maxMoney =
        data.moneyMax ??
        0;


    if (
        maxMoney <= 0
    ) {

        return null;
    }


    // Player must actually be able to hack it.

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
    // CALCULATE COMPLETE HWGW BATCH
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
    // BATCH DURATION
    //
    // Weak2 is intentionally the final operation.
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
    // RAM-SECONDS
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


    // ============================================================
    // PRIMARY SCORE
    //
    // Expected dollars produced for one GB-second of RAM.
    // ============================================================

    const score =
        expectedMoney /
        ramSeconds;


    // Useful secondary statistics.

    const expectedMoneyPerSecond =
        expectedMoney /
        batchDurationSeconds;


    return {

        server,

        score,

        expectedMoney,

        expectedMoneyPerSecond,

        ramSeconds,

        batchRam:
            batch.batchRam,

        batchDurationMs,

        hackChance,

        actualHackFraction:
            batch.actualHackFraction,

        hackThreads:
            batch.hackThreads,

        growThreads:
            batch.growThreads,

        weaken1Threads:
            batch.weaken1Threads,

        weaken2Threads:
            batch.weaken2Threads
    };
}


// =================================================================
// VALIDATE MANUAL TARGET
// =================================================================

function validateTarget(
    ns,
    server
) {

    if (
        !ns.serverExists(
            server
        )
    ) {

        return null;
    }


    if (
        !ns.hasRootAccess(
            server
        )
    ) {

        return null;
    }


    if (
        ns.getServerMaxMoney(
            server
        ) <= 0
    ) {

        return null;
    }


    if (
        ns.getServerRequiredHackingLevel(
            server
        ) >
        ns.getHackingLevel()
    ) {

        return null;
    }


    return server;
}


// =================================================================
// TARGET STATE
// =================================================================

function getTargetState(
    ns,
    target
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


    return {

        money,

        maxMoney,

        moneyPercent:
            maxMoney > 0
                ? money /
                  maxMoney
                : 0,

        security,

        minSecurity,

        securityDelta:
            Math.max(
                0,
                security -
                minSecurity
            )
    };
}


// =================================================================
// BATCH CALCULATION
// =================================================================

function calculateBatch(
    ns,
    target,
    RAM,
    CONFIG
) {

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


    // Never allow an invalid >= 100% batch.

    actualHackFraction =
        Math.min(
            0.90,
            actualHackFraction
        );


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


    const hackSecurity =
        ns.hackAnalyzeSecurity(
            hackThreads,
            target
        );


    const growSecurity =
        ns.growthAnalyzeSecurity(
            growThreads,
            target,
            1
        );


    const weaken1Threads =
        Math.max(
            1,
            Math.ceil(
                hackSecurity /
                weakenPerThread
            )
        );


    const weaken2Threads =
        Math.max(
            1,
            Math.ceil(
                growSecurity /
                weakenPerThread
            )
        );


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
        !Number.isFinite(hackTime) ||
        !Number.isFinite(growTime) ||
        !Number.isFinite(weakenTime) ||
        hackTime <= 0 ||
        growTime <= 0 ||
        weakenTime <= 0
    ) {

        return null;
    }


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
// SAFE BATCH COUNT
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
// BUILD STAGGERED HWGW BATCHES
// =================================================================

function buildBatchActions(
    target,
    batch,
    batchCount,
    CONFIG,
    WORKER
) {

    const actions = [];


    const launchId =
        Date.now();


    for (
        let i = 0;
        i < batchCount;
        i++
    ) {

        const batchOffset =
            i *
            CONFIG.gapMs *
            4;


        const batchId =
            `B${i}-${launchId}`;


        const hackDelay =
            Math.max(
                0,
                batch.weakenTime -
                batch.hackTime +
                batchOffset
            );


        const weaken1Delay =
            CONFIG.gapMs +
            batchOffset;


        const growDelay =
            Math.max(
                0,
                (
                    batch.weakenTime +
                    (
                        2 *
                        CONFIG.gapMs
                    )
                ) -
                batch.growTime +
                batchOffset
            );


        const weaken2Delay =
            (
                3 *
                CONFIG.gapMs
            ) +
            batchOffset;


        actions.push({

            script:
                WORKER.hack,

            threads:
                batch.hackThreads,

            args: [
                target,
                hackDelay,
                batchId,
                "H"
            ]
        });


        actions.push({

            script:
                WORKER.weaken,

            threads:
                batch.weaken1Threads,

            args: [
                target,
                weaken1Delay,
                batchId,
                "W1"
            ]
        });


        actions.push({

            script:
                WORKER.grow,

            threads:
                batch.growThreads,

            args: [
                target,
                growDelay,
                batchId,
                "G"
            ]
        });


        actions.push({

            script:
                WORKER.weaken,

            threads:
                batch.weaken2Threads,

            args: [
                target,
                weaken2Delay,
                batchId,
                "W2"
            ]
        });
    }


    return actions;
}


// =================================================================
// FIND MAXIMUM NUMBER OF BATCHES THAT FIT
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
        low < high
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


        const result =
            allocateActions(
                cloneHosts(
                    hosts
                ),
                actions
            );


        if (
            result.success
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
// SIMPLE BATCH ACTIONS FOR RAM TESTING
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
                batch.hackThreads,

            args: []
        });


        actions.push({

            script:
                WORKER.weaken,

            threads:
                batch.weaken1Threads,

            args: []
        });


        actions.push({

            script:
                WORKER.grow,

            threads:
                batch.growThreads,

            args: []
        });


        actions.push({

            script:
                WORKER.weaken,

            threads:
                batch.weaken2Threads,

            args: []
        });
    }


    return actions;
}


// =================================================================
// SECURITY PREP
// =================================================================

async function prepSecurity(
    ns,
    target,
    hosts,
    RAM,
    CONFIG,
    WORKER
) {

    const state =
        getTargetState(
            ns,
            target
        );


    const weakenPerThread =
        ns.weakenAnalyze(
            1,
            1
        );


    const requiredThreads =
        Math.ceil(
            state.securityDelta /
            weakenPerThread
        );


    const availableThreads =
        totalAvailableThreads(
            hosts,
            RAM.weaken
        );


    const threads =
        Math.min(
            requiredThreads,
            availableThreads
        );


    if (
        threads <= 0
    ) {

        return {

            launched: false,

            description:
                "No RAM available for weaken prep"
        };
    }


    const prepId =
        `PREP-W-${Date.now()}`;


    const actions = [{

        script:
            WORKER.weaken,

        threads,

        args: [
            target,
            0,
            prepId,
            "PREP-W"
        ]
    }];


    const placement =
        allocateActions(
            cloneHosts(
                hosts
            ),
            actions
        );


    if (
        !placement.success
    ) {

        return {

            launched: false,

            description:
                "Unable to allocate weaken prep"
        };
    }


    if (
        CONFIG.dryRun
    ) {

        return {

            launched: false,

            description:
                `Would launch ${threads} weaken threads`
        };
    }


    const result =
        launchPlacements(
            ns,
            placement.placements
        );


    return {

        launched:
            result.success,

        description:
            `${threads} weaken threads`
    };
}


// =================================================================
// MONEY PREP
// =================================================================

async function prepMoney(
    ns,
    target,
    hosts,
    CONFIG,
    WORKER
) {

    const state =
        getTargetState(
            ns,
            target
        );


    const currentMoney =
        Math.max(
            1,
            state.money
        );


    const multiplier =
        state.maxMoney /
        currentMoney;


    let requiredGrowThreads;


    try {

        requiredGrowThreads =
            Math.ceil(
                ns.growthAnalyze(
                    target,
                    multiplier,
                    1
                )
            );

    }
    catch {

        return {

            launched: false,

            description:
                "Unable to calculate grow prep"
        };
    }


    if (
        !Number.isFinite(
            requiredGrowThreads
        )
    ) {

        return {

            launched: false,

            description:
                "Unable to calculate grow prep"
        };
    }


    requiredGrowThreads =
        Math.max(
            1,
            requiredGrowThreads
        );


    let low = 0;

    let high =
        requiredGrowThreads;


    while (
        low < high
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
            buildPrepMoneyActions(
                ns,
                target,
                mid,
                CONFIG,
                WORKER
            );


        const result =
            allocateActions(
                cloneHosts(
                    hosts
                ),
                actions
            );


        if (
            result.success
        ) {

            low =
                mid;
        }
        else {

            high =
                mid - 1;
        }
    }


    if (
        low <= 0
    ) {

        return {

            launched: false,

            description:
                "No RAM available for grow prep"
        };
    }


    const bestActions =
        buildPrepMoneyActions(
            ns,
            target,
            low,
            CONFIG,
            WORKER
        );


    const placement =
        allocateActions(
            cloneHosts(
                hosts
            ),
            bestActions
        );


    if (
        !placement.success
    ) {

        return {

            launched: false,

            description:
                "Unable to allocate grow prep"
        };
    }


    if (
        CONFIG.dryRun
    ) {

        return {

            launched: false,

            description:
                `Would launch ${low} grow threads`
        };
    }


    const result =
        launchPlacements(
            ns,
            placement.placements
        );


    return {

        launched:
            result.success,

        description:
            `${low} grow threads`
    };
}


// =================================================================
// BUILD MONEY PREP ACTIONS
// =================================================================

function buildPrepMoneyActions(
    ns,
    target,
    growThreads,
    CONFIG,
    WORKER
) {

    const growSecurity =
        ns.growthAnalyzeSecurity(
            growThreads,
            target,
            1
        );


    const weakenThreads =
        Math.max(
            1,
            Math.ceil(
                growSecurity /
                ns.weakenAnalyze(
                    1,
                    1
                )
            )
        );


    const growDelay =
        Math.max(
            0,
            ns.getWeakenTime(
                target
            ) -
            ns.getGrowTime(
                target
            )
        );


    const prepId =
        `PREP-G-${Date.now()}`;


    return [

        {
            script:
                WORKER.grow,

            threads:
                growThreads,

            args: [
                target,
                growDelay,
                prepId,
                "PREP-G"
            ]
        },

        {
            script:
                WORKER.weaken,

            threads:
                weakenThreads,

            args: [
                target,
                CONFIG.gapMs,
                prepId,
                "PREP-W"
            ]
        }
    ];
}


// =================================================================
// ALLOCATE ACTIONS
// =================================================================

function allocateActions(
    hosts,
    actions
) {

    const placements = [];


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


            placements.push({

                host:
                    host.server,

                script:
                    action.script,

                threads,

                args:
                    action.args
            });


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

                success: false,

                placements: []
            };
        }
    }


    return {

        success: true,

        placements
    };
}


// =================================================================
// LAUNCH PLACEMENTS
// =================================================================

function launchPlacements(
    ns,
    placements
) {

    const startedPids = [];


    for (
        const placement
        of placements
    ) {

        const pid =
            ns.exec(
                placement.script,
                placement.host,
                placement.threads,
                ...placement.args
            );


        if (
            pid === 0
        ) {

            return {

                success: false,

                startedPids
            };
        }


        startedPids.push(
            pid
        );
    }


    return {

        success: true,

        startedPids
    };
}


// =================================================================
// WORKER HOSTS
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

        freeRam,

        utilization:
            maxRam > 0
                ? (
                    usedRam /
                    maxRam
                ) *
                  100
                : 0
    };
}


// =================================================================
// DISTRIBUTE WORKERS
// =================================================================

async function distributeWorkers(
    ns,
    servers,
    WORKER
) {

    const files =
        Object.values(
            WORKER
        );


    for (
        const server
        of servers
    ) {

        if (
            server === "home"
        ) {

            continue;
        }


        if (
            !ns.hasRootAccess(
                server
            )
        ) {

            continue;
        }


        if (
            ns.getServerMaxRam(
                server
            ) <= 0
        ) {

            continue;
        }


        await ns.scp(
            files,
            server,
            "home"
        );
    }
}


// =================================================================
// WAIT FOR DISPATCHER WORKERS
// =================================================================

async function waitForWorkers(
    ns,
    servers,
    WORKER
) {

    const workerNames =
        new Set(
            Object.values(
                WORKER
            )
        );


    while (true) {

        let running =
            false;


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


            const processes =
                ns.ps(
                    server
                );


            const found =
                processes.some(
                    process =>
                        workerNames.has(
                            process.filename
                        )
                );


            if (
                found
            ) {

                running =
                    true;

                break;
            }
        }


        if (
            !running
        ) {

            return;
        }


        await ns.sleep(
            200
        );
    }
}


// =================================================================
// AVAILABLE THREADS
// =================================================================

function totalAvailableThreads(
    hosts,
    ramPerThread
) {

    let result = 0;


    for (
        const host
        of hosts
    ) {

        result +=
            Math.floor(
                host.freeRam /
                ramPerThread
            );
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


    const servers = [];


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
// CLONE HOST STATE
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
// DASHBOARD
// =================================================================

function renderDashboard(
    ns,
    CONFIG,
    COLOR,
    RAM,
    state,
    previousDisplay
) {

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
                "BITBURNER // AUTOMATIC HWGW DISPATCHER",
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


    // ============================================================
    // CONTROLLER
    // ============================================================

    section(
        lines,
        "CONTROLLER",
        CONFIG,
        COLOR
    );


    lines.push(

        field(
            "Cycle",
            state.cycleNumber,
            20
        ) +

        field(
            "Target",
            state.target ?? "-",
            30
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
            "Total Batches",
            state.totalBatchesLaunched,
            28
        )
    );


    lines.push(

        field(
            "Status",
            state.lastAction,
            52
        ) +

        field(
            "Current Batches",
            state.lastBatchCount,
            28
        ) +

        field(
            "Mode",
            CONFIG.dryRun
                ? "DRY RUN"
                : "LIVE",
            22
        )
    );


    // ============================================================
    // WORKER NETWORK
    // ============================================================

    section(
        lines,
        "WORKER NETWORK",
        CONFIG,
        COLOR
    );


    lines.push(

        field(
            "Hosts",
            state.networkStats.hosts,
            20
        ) +

        field(
            "Capacity",
            ns.format.ram(
                state.networkStats.maxRam
            ),
            28
        ) +

        field(
            "Used",
            ns.format.ram(
                state.networkStats.usedRam
            ),
            28
        ) +

        field(
            "Available",
            ns.format.ram(
                state.networkStats.freeRam
            ),
            30
        )
    );


    lines.push(

        field(
            "Rooted This Cycle",
            state.newlyRooted ?? 0,
            28
        ) +

        field(
            "Rooted Since Start",
            state.totalRooted ?? 0,
            28
        ) +

        field(
            "Utilization",
            state.networkStats.utilization.toFixed(1) +
            "%",
            28
        )
    );


    // ============================================================
    // TARGET
    // ============================================================

    if (
        state.target
    ) {

        const target =
            getTargetState(
                ns,
                state.target
            );


        section(
            lines,
            "TARGET HEALTH",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Money",
                ns.format.number(
                    target.money,
                    2
                ),
                28
            ) +

            field(
                "Maximum",
                ns.format.number(
                    target.maxMoney,
                    2
                ),
                28
            ) +

            field(
                "Money %",
                (
                    target.moneyPercent *
                    100
                ).toFixed(1) +
                "%",
                24
            ) +

            field(
                "Security +",
                target.securityDelta.toFixed(
                    2
                ),
                24
            )
        );


        // ========================================================
        // TARGET EFFICIENCY
        // ========================================================

        if (
            state.targetAnalysis
        ) {

            const a =
                state.targetAnalysis;


            lines.push(

                field(
                    "Hack Chance",
                    (
                        a.hackChance *
                        100
                    ).toFixed(1) +
                    "%",
                    24
                ) +

                field(
                    "Expected $",
                    ns.format.number(
                        a.expectedMoney,
                        2
                    ),
                    28
                ) +

                field(
                    "$ / sec",
                    ns.format.number(
                        a.expectedMoneyPerSecond,
                        2
                    ),
                    28
                ) +

                field(
                    "$ / GB-sec",
                    ns.format.number(
                        a.score,
                        2
                    ),
                    28
                )
            );
        }
    }


    // ============================================================
    // BATCH PLAN
    // ============================================================

    if (
        state.batchPlan
    ) {

        const b =
            state.batchPlan;


        section(
            lines,
            "HWGW BATCH PLAN",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Hack",
                b.hackThreads,
                20
            ) +

            field(
                "Weaken 1",
                b.weaken1Threads,
                22
            ) +

            field(
                "Grow",
                b.growThreads,
                20
            ) +

            field(
                "Weaken 2",
                b.weaken2Threads,
                22
            ) +

            field(
                "Batch RAM",
                ns.format.ram(
                    b.batchRam
                ),
                28
            )
        );


        lines.push(

            field(
                "Hack Time",
                formatTime(
                    b.hackTime
                ),
                28
            ) +

            field(
                "Grow Time",
                formatTime(
                    b.growTime
                ),
                28
            ) +

            field(
                "Weaken Time",
                formatTime(
                    b.weakenTime
                ),
                28
            ) +

            field(
                "Take",
                (
                    b.actualHackFraction *
                    100
                ).toFixed(2) +
                "%",
                24
            )
        );
    }


    // ============================================================
    // TOP WORKER HOSTS
    // ============================================================

    section(
        lines,
        "TOP WORKER HOSTS",
        CONFIG,
        COLOR
    );


    lines.push(

        "SERVER"
            .padEnd(28) +

        "USED"
            .padStart(14) +

        "MAX"
            .padStart(14) +

        "AVAILABLE"
            .padStart(14) +

        "UTIL"
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


    const sortedHosts =
        [...state.workerHosts]
            .sort(
                (a, b) =>
                    b.maxRam -
                    a.maxRam
            )
            .slice(
                0,
                10
            );


    for (
        const host
        of sortedHosts
    ) {

        const utilization =
            host.maxRam > 0
                ? (
                    host.usedRam /
                    host.maxRam
                ) *
                  100
                : 0;


        lines.push(

            host.server
                .padEnd(28) +

            ns.format.ram(
                host.usedRam
            )
                .padStart(14) +

            ns.format.ram(
                host.maxRam
            )
                .padStart(14) +

            ns.format.ram(
                host.freeRam
            )
                .padStart(14) +

            (
                utilization.toFixed(0) +
                "%"
            )
                .padStart(10)
        );
    }


    // ============================================================
    // FOOTER
    // ============================================================

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
            `Gap ${CONFIG.gapMs}ms  |  ` +
            `Home reserve ${ns.format.ram(CONFIG.homeReserveRam)}  |  ` +
            `Maximum ${CONFIG.maxParallelBatches} batches`,
            COLOR.gray
        )
    );


    const display =
        lines.join(
            "\n"
        );


    if (
        display !==
        previousDisplay
    ) {

        ns.clearLog();

        ns.print(
            display
        );
    }


    ns.ui.setTailTitle(

        `HWGW DISPATCHER  |  ` +

        `${state.target ?? "NO TARGET"}  |  ` +

        `${state.lastAction}`
    );


    return display;
}


// =================================================================
// DISPLAY HELPERS
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


function formatTime(
    milliseconds
) {

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