/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ============================================================
    // BITBURNER AUTOMATIC HWGW DISPATCHER
    // ============================================================
    //
    // Features:
    //
    // 1. Scans all rooted RAM hosts
    // 2. Automatically selects a profitable target
    // 3. Prepares target:
    //      - Security -> minimum
    //      - Money -> maximum
    // 4. Calculates HWGW batch thread requirements
    // 5. Distributes workers across ALL available rooted RAM
    // 6. Uses additionalMsec for ordered completion
    // 7. Never launches a partially allocated batch
    // 8. Continuously re-evaluates target state
    //
    // Batch landing order:
    //
    //     HACK
    //     WEAKEN 1
    //     GROW
    //     WEAKEN 2
    //
    // ============================================================


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
            String(flags.target ?? ""),

        dryRun:
            Boolean(flags["dry-run"]),

        readyMoneyPercent: 0.99,

        readySecurityDelta: 0.05,

        // Prevent shotgun batches from temporarily
        // draining essentially all target money.
        maxAggregateHackFraction: 0.80,

        windowWidth: 1350,
        windowHeight: 720,

        separatorWidth: 128
    };


    // ============================================================
    // WORKER FILES
    // ============================================================

    const WORKER = {
        hack: "bb-hack-worker.js",
        grow: "bb-grow-worker.js",
        weaken: "bb-weaken-worker.js"
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
    // VERIFY WORKERS
    // ============================================================

    for (
        const script
        of Object.values(WORKER)
    ) {

        if (
            !ns.fileExists(
                script,
                "home"
            )
        ) {

            ns.tprint(
                `ERROR: Missing worker: ${script}`
            );

            return;
        }
    }


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
    // WINDOW
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

    let lastAction =
        "Initializing";

    let lastTarget =
        "";

    let lastBatchCount =
        0;


    // ============================================================
    // MAIN CONTROL LOOP
    // ============================================================

    while (true) {

        cycleNumber++;

        const servers =
            scanNetwork(ns);

        // ========================================================
        // COPY WORKERS
        // ========================================================

        await distributeWorkers(
            ns,
            servers,
            WORKER
        );


        // ========================================================
        // WORKER HOSTS
        // ========================================================

        const workerHosts =
            getWorkerHosts(
                ns,
                servers,
                CONFIG.homeReserveRam
            );


        const networkStats =
            getNetworkStats(
                workerHosts
            );


        // ========================================================
        // TARGET SELECTION
        // ========================================================

        let target;


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
                    `Invalid target: ${CONFIG.targetOverride}`
                );

                return;
            }
        }
        else {

            target =
                selectBestTarget(
                    ns,
                    servers,
                    CONFIG.targetHackFraction
                );
        }


        if (!target) {

            lastAction =
                "No viable target found";

            renderDashboard(
                ns,
                CONFIG,
                COLOR,
                RAM,
                {
                    target: null,
                    cycleNumber,
                    totalBatchesLaunched,
                    lastAction,
                    lastBatchCount,
                    networkStats,
                    workerHosts
                },
                lastDisplay
            );

            await ns.sleep(
                CONFIG.refreshMs
            );

            continue;
        }


        lastTarget =
            target;


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
                    servers,
                    workerHosts,
                    RAM,
                    CONFIG,
                    WORKER
                );


            renderDashboard(
                ns,
                CONFIG,
                COLOR,
                RAM,
                {
                    target,
                    cycleNumber,
                    totalBatchesLaunched,
                    lastAction,
                    lastBatchCount: 0,
                    networkStats,
                    workerHosts,
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
                    servers,
                    workerHosts,
                    RAM,
                    CONFIG,
                    WORKER
                );


            renderDashboard(
                ns,
                CONFIG,
                COLOR,
                RAM,
                {
                    target,
                    cycleNumber,
                    totalBatchesLaunched,
                    lastAction,
                    lastBatchCount: 0,
                    networkStats,
                    workerHosts,
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
        // TARGET READY
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
        // DETERMINE SAFE BATCH COUNT
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
                CONFIG.homeReserveRam
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
        // NOT ENOUGH RAM
        // ========================================================

        if (
            batchCount <= 0
        ) {

            lastAction =
                "READY // Waiting for RAM";


            renderDashboard(
                ns,
                CONFIG,
                COLOR,
                RAM,
                {
                    target,
                    cycleNumber,
                    totalBatchesLaunched,
                    lastAction,
                    lastBatchCount,
                    networkStats,
                    workerHosts,
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
        // BUILD SHOTGUN BATCH SET
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
                CONFIG.homeReserveRam
            );


        const placement =
            allocateActions(
                hosts,
                actions
            );


        if (!placement.success) {

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


            renderDashboard(
                ns,
                CONFIG,
                COLOR,
                RAM,
                {
                    target,
                    cycleNumber,
                    totalBatchesLaunched,
                    lastAction,
                    lastBatchCount,
                    networkStats,
                    workerHosts,
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

            // Stop anything from this partial launch.
            for (
                const pid
                of launchResult.startedPids
            ) {

                ns.kill(pid);
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
        // DISPLAY ACTIVE BATCH
        // ========================================================

        const updatedHosts =
            getWorkerHosts(
                ns,
                servers,
                CONFIG.homeReserveRam
            );


        renderDashboard(
            ns,
            CONFIG,
            COLOR,
            RAM,
            {
                target,
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
                batchPlan,
                placement
            },
            lastDisplay
        );


        // ========================================================
        // WAIT FOR BATCHES
        // ========================================================

        await waitForWorkers(
            ns,
            servers,
            WORKER
        );
    }
}


// =================================================================
// SELECT BEST TARGET
// =================================================================

function selectBestTarget(
    ns,
    servers,
    targetHackFraction
) {

    const hackingLevel =
        ns.getHackingLevel();

    const candidates = [];


    for (
        const server
        of servers
    ) {

        if (
            server === "home"
        ) {
            continue;
        }


        const data =
            ns.getServer(
                server
            );


        if (
            !data.hasAdminRights
        ) {
            continue;
        }


        const maxMoney =
            data.moneyMax ?? 0;


        if (
            maxMoney <= 0
        ) {
            continue;
        }


        if (
            (
                data.requiredHackingSkill ??
                0
            ) >
            hackingLevel
        ) {

            continue;
        }


        const hackFraction =
            ns.hackAnalyze(
                server
            );


        const chance =
            ns.hackAnalyzeChance(
                server
            );


        const time =
            ns.getHackTime(
                server
            );


        if (
            hackFraction <= 0 ||
            chance <= 0 ||
            time <= 0
        ) {

            continue;
        }


        const threads =
            Math.max(
                1,
                Math.floor(
                    targetHackFraction /
                    hackFraction
                )
            );


        const actualFraction =
            Math.min(
                0.90,
                hackFraction *
                threads
            );


        const expectedMoney =
            maxMoney *
            actualFraction *
            chance;


        const score =
            expectedMoney /
            (
                time /
                1000
            );


        candidates.push({
            server,
            score
        });
    }


    candidates.sort(
        (a, b) =>
            b.score -
            a.score
    );


    return (
        candidates[0]?.server ??
        null
    );
}


// =================================================================
// VALIDATE MANUAL TARGET
// =================================================================

function validateTarget(
    ns,
    server
) {

    if (
        !ns.serverExists(server)
    ) {

        return null;
    }


    if (
        !ns.hasRootAccess(server)
    ) {

        return null;
    }


    if (
        ns.getServerMaxMoney(server) <=
        0
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
                ? money / maxMoney
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
        actualHackFraction >= 0.90
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


    const remainingMoneyFraction =
        Math.max(
            0.01,
            1 -
            actualHackFraction
        );


    const growMultiplier =
        1 /
        remainingMoneyFraction;


    const growThreads =
        Math.max(
            1,
            Math.ceil(
                ns.growthAnalyze(
                    target,
                    growMultiplier,
                    1
                )
            )
        );


    const weakenPerThread =
        ns.weakenAnalyze(
            1,
            1
        );


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
// SAFE NUMBER OF SIMULTANEOUS HACKS
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


    // Remaining money after N hacks:
    //
    // (1 - hackFraction)^N
    //
    // We limit the aggregate temporary drain.

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
// BUILD BATCH ACTIONS
// =================================================================

function buildBatchActions(
    target,
    batch,
    batchCount,
    CONFIG,
    WORKER
) {

    const actions = [];


    // -------------------------------------------------------------
    // FINISH ORDER
    //
    // Hack    = W
    // Weak 1  = W + gap
    // Grow    = W + 2gap
    // Weak 2  = W + 3gap
    // -------------------------------------------------------------

    const hackDelay =
        Math.max(
            0,
            batch.weakenTime -
            batch.hackTime
        );


    const weaken1Delay =
        CONFIG.gapMs;


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
            batch.growTime
        );


    const weaken2Delay =
        3 *
        CONFIG.gapMs;


    // -------------------------------------------------------------
    // HACKS FIRST
    // -------------------------------------------------------------

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

            ramPerThread:
                0,

            args: [
                target,
                hackDelay,
                `B${i}`,
                "H"
            ]
        });
    }


    // -------------------------------------------------------------
    // WEAKEN 1
    // -------------------------------------------------------------

    for (
        let i = 0;
        i < batchCount;
        i++
    ) {

        actions.push({

            script:
                WORKER.weaken,

            threads:
                batch.weaken1Threads,

            ramPerThread:
                0,

            args: [
                target,
                weaken1Delay,
                `B${i}`,
                "W1"
            ]
        });
    }


    // -------------------------------------------------------------
    // GROW
    // -------------------------------------------------------------

    for (
        let i = 0;
        i < batchCount;
        i++
    ) {

        actions.push({

            script:
                WORKER.grow,

            threads:
                batch.growThreads,

            ramPerThread:
                0,

            args: [
                target,
                growDelay,
                `B${i}`,
                "G"
            ]
        });
    }


    // -------------------------------------------------------------
    // WEAKEN 2
    // -------------------------------------------------------------

    for (
        let i = 0;
        i < batchCount;
        i++
    ) {

        actions.push({

            script:
                WORKER.weaken,

            threads:
                batch.weaken2Threads,

            ramPerThread:
                0,

            args: [
                target,
                weaken2Delay,
                `B${i}`,
                "W2"
            ]
        });
    }


    return actions;
}


// =================================================================
// FIND MAXIMUM BATCHES THAT ACTUALLY FIT
// =================================================================

function findMaximumBatchCount(
    hosts,
    batch,
    maximum,
    WORKER
) {

    let low = 0;
    let high = maximum;


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


        const test =
            allocateActions(
                cloneHosts(hosts),
                actions
            );


        if (
            test.success
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
// SIMPLE ACTIONS USED ONLY FOR RAM FIT TEST
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
    }


    for (
        let i = 0;
        i < batchCount;
        i++
    ) {

        actions.push({
            script:
                WORKER.weaken,

            threads:
                batch.weaken1Threads,

            args: []
        });
    }


    for (
        let i = 0;
        i < batchCount;
        i++
    ) {

        actions.push({
            script:
                WORKER.grow,

            threads:
                batch.growThreads,

            args: []
        });
    }


    for (
        let i = 0;
        i < batchCount;
        i++
    ) {

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
// PREP SECURITY
// =================================================================

async function prepSecurity(
    ns,
    target,
    servers,
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


    const actions = [{

        script:
            WORKER.weaken,

        threads,

        args: [
            target,
            0,
            `PREP-${Date.now()}`,
            "PREP-W"
        ]
    }];


    const placement =
        allocateActions(
            cloneHosts(hosts),
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
// PREP MONEY
// =================================================================

async function prepMoney(
    ns,
    target,
    servers,
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


    const currentMoney =
        Math.max(
            1,
            state.money
        );


    const multiplier =
        state.maxMoney /
        currentMoney;


    let requiredGrowThreads =
        Math.ceil(
            ns.growthAnalyze(
                target,
                multiplier,
                1
            )
        );


    requiredGrowThreads =
        Math.max(
            1,
            requiredGrowThreads
        );


    // Find largest paired Grow + Weaken operation
    // that fits current network RAM.

    let low = 0;
    let high =
        requiredGrowThreads;


    let bestActions =
        null;


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


        const growSecurity =
            ns.growthAnalyzeSecurity(
                mid,
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
                ns.getWeakenTime(target) -
                ns.getGrowTime(target)
            );


        const actions = [

            {
                script:
                    WORKER.grow,

                threads:
                    mid,

                args: [
                    target,
                    growDelay,
                    `PREP-${Date.now()}`,
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
                    `PREP-${Date.now()}`,
                    "PREP-W"
                ]
            }
        ];


        const test =
            allocateActions(
                cloneHosts(hosts),
                actions
            );


        if (
            test.success
        ) {

            low =
                mid;

            bestActions =
                actions;
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


    if (
        !bestActions ||
        bestActions[0].threads !== low
    ) {

        const growSecurity =
            ns.growthAnalyzeSecurity(
                low,
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


        bestActions = [

            {
                script:
                    WORKER.grow,

                threads:
                    low,

                args: [
                    target,
                    Math.max(
                        0,
                        ns.getWeakenTime(target) -
                        ns.getGrowTime(target)
                    ),
                    `PREP-${Date.now()}`,
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
                    `PREP-${Date.now()}`,
                    "PREP-W"
                ]
            }
        ];
    }


    const placement =
        allocateActions(
            cloneHosts(hosts),
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
// ALLOCATE ACTIONS TO WORKER HOSTS
// =================================================================

function allocateActions(
    hosts,
    actions
) {

    const placements = [];


    const workerRam = {

        "bb-hack-worker.js":
            null,

        "bb-grow-worker.js":
            null,

        "bb-weaken-worker.js":
            null
    };


    // Script RAM is attached dynamically from the
    // host's ramMap property.

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
    homeReserveRam
) {

    const hosts = [];


    const scripts = [
        "bb-hack-worker.js",
        "bb-grow-worker.js",
        "bb-weaken-worker.js"
    ];


    for (
        const server
        of servers
    ) {

        if (
            !ns.hasRootAccess(server)
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


    // Larger free hosts first reduces fragmentation.

    hosts.sort(
        (a, b) =>
            b.freeRam -
            a.freeRam
    );


    return hosts;
}


// =================================================================
// NETWORK STATISTICS
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
                ) * 100
                : 0
    };
}


// =================================================================
// DISTRIBUTE WORKER FILES
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
            !ns.hasRootAccess(server)
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
// WAIT UNTIL THIS DISPATCHER'S WORKERS FINISH
// =================================================================

async function waitForWorkers(
    ns,
    servers,
    WORKER
) {

    const names =
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
                !ns.hasRootAccess(server)
            ) {

                continue;
            }


            const processes =
                ns.ps(
                    server
                );


            if (
                processes.some(
                    process =>
                        names.has(
                            process.filename
                        )
                )
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
// AVAILABLE THREAD COUNT
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
// SCAN NETWORK
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


    scan(
        "home"
    );


    return servers;
}


// =================================================================
// CLONE HOST ALLOCATION STATE
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
            22
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
            ).toFixed(1) + "%",
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
    // NETWORK
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
            "Hack Worker",
            ns.format.ram(
                RAM.hack
            ),
            28
        ) +

        field(
            "Grow Worker",
            ns.format.ram(
                RAM.grow
            ),
            28
        ) +

        field(
            "Weaken Worker",
            ns.format.ram(
                RAM.weaken
            ),
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
                ).toFixed(1) + "%",
                24
            ) +

            field(
                "Security +",
                target.securityDelta.toFixed(2),
                24
            )
        );
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
                ).toFixed(2) + "%",
                24
            )
        );
    }


    // ============================================================
    // HOSTS
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
                ) * 100
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
            `Maximum ${CONFIG.maxParallelBatches} parallel batches`,
            COLOR.gray
        )
    );


    const display =
        lines.join("\n");


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
            .padEnd(width)
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
            seconds.toFixed(1) +
            "s"
        );
    }


    return (
        (
            seconds /
            60
        ).toFixed(1) +
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