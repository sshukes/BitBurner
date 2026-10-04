/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");


    // ============================================================
    // BITBURNER WORKER / RAM / HWGW BATCH MONITOR
    // ============================================================

    const CONFIG = {

        refreshMs: 1000,

        windowWidth: 1550,
        windowHeight: 850,

        separatorWidth: 148,

        maxTargetRows: 10,

        maxBatchRows: 20
    };


    const COLOR = {

        reset: "\x1b[0m",
        bold: "\x1b[1m",

        white: "\x1b[37m",
        brightWhite: "\x1b[97m",

        cyan: "\x1b[36m",
        brightCyan: "\x1b[96m",

        green: "\x1b[32m",
        brightGreen: "\x1b[92m",

        yellow: "\x1b[33m",
        brightYellow: "\x1b[93m",

        red: "\x1b[31m",
        brightRed: "\x1b[91m",

        gray: "\x1b[90m"
    };


    // ============================================================
    // DISPATCHER WORKER NAMES
    // ============================================================

    const DISPATCHER_WORKERS =
        new Set([
            "bb-hack-worker.js",
            "bb-grow-worker.js",
            "bb-weaken-worker.js"
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
        "BITBURNER // WORKER & HWGW MONITOR"
    );


    let lastDisplay = "";


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        const servers =
            scanNetwork(
                ns
            );


        const serverSet =
            new Set(
                servers
            );


        const workerHosts = [];


        // ========================================================
        // TARGET ACTIVITY
        // ========================================================

        const targetActivity =
            new Map();


        // ========================================================
        // DISPATCHER BATCH ACTIVITY
        // ========================================================

        const batchActivity =
            new Map();


        // ========================================================
        // PREP ACTIVITY
        // ========================================================

        const prepActivity =
            new Map();


        // ========================================================
        // NETWORK TOTALS
        // ========================================================

        let totalRam = 0;

        let totalUsedRam = 0;

        let totalFreeRam = 0;


        let totalProcesses = 0;

        let totalThreads = 0;


        let totalHackThreads = 0;

        let totalGrowThreads = 0;

        let totalWeakenThreads = 0;

        let totalOtherThreads = 0;


        let dispatcherProcesses = 0;

        let dispatcherThreads = 0;


        let activeHosts = 0;

        let idleHosts = 0;


        // ========================================================
        // ANALYZE ROOTED RAM SERVERS
        // ========================================================

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


            // Ignore servers that cannot run scripts.

            if (
                maxRam <= 0
            ) {

                continue;
            }


            const usedRam =
                ns.getServerUsedRam(
                    server
                );


            const freeRam =
                Math.max(
                    0,
                    maxRam -
                    usedRam
                );


            const utilization =
                maxRam > 0
                    ? (
                        usedRam /
                        maxRam
                    ) * 100
                    : 0;


            const processes =
                ns.ps(
                    server
                );


            let hostThreads = 0;

            let hackThreads = 0;

            let growThreads = 0;

            let weakenThreads = 0;

            let otherThreads = 0;


            let hostDispatcherProcesses = 0;

            let hostDispatcherThreads = 0;


            const hostTargets =
                new Set();


            // ====================================================
            // PROCESS ANALYSIS
            // ====================================================

            for (
                const process
                of processes
            ) {

                const threads =
                    process.threads;


                hostThreads +=
                    threads;


                const action =
                    detectAction(
                        process.filename
                    );


                const target =
                    findTarget(
                        process.args,
                        serverSet
                    );


                // =================================================
                // GLOBAL H/G/W COUNTS
                // =================================================

                if (
                    action === "HACK"
                ) {

                    hackThreads +=
                        threads;

                    totalHackThreads +=
                        threads;
                }
                else if (
                    action === "GROW"
                ) {

                    growThreads +=
                        threads;

                    totalGrowThreads +=
                        threads;
                }
                else if (
                    action === "WEAKEN"
                ) {

                    weakenThreads +=
                        threads;

                    totalWeakenThreads +=
                        threads;
                }
                else {

                    otherThreads +=
                        threads;

                    totalOtherThreads +=
                        threads;
                }


                // =================================================
                // DISPATCHER-SPECIFIC PROCESS
                // =================================================

                const dispatcherInfo =
                    parseDispatcherProcess(
                        process,
                        DISPATCHER_WORKERS
                    );


                if (
                    dispatcherInfo
                ) {

                    dispatcherProcesses++;

                    dispatcherThreads +=
                        threads;


                    hostDispatcherProcesses++;

                    hostDispatcherThreads +=
                        threads;


                    // =============================================
                    // ACTIVE NORMAL HWGW BATCH
                    // =============================================

                    if (
                        dispatcherInfo.type ===
                        "BATCH"
                    ) {

                        if (
                            !batchActivity.has(
                                dispatcherInfo.batchId
                            )
                        ) {

                            batchActivity.set(
                                dispatcherInfo.batchId,
                                createBatchRecord(
                                    dispatcherInfo
                                )
                            );
                        }


                        const batch =
                            batchActivity.get(
                                dispatcherInfo.batchId
                            );


                        updateBatchRecord(
                            batch,
                            dispatcherInfo,
                            process,
                            server
                        );
                    }


                    // =============================================
                    // PREP WORK
                    // =============================================

                    if (
                        dispatcherInfo.type ===
                        "PREP"
                    ) {

                        if (
                            !prepActivity.has(
                                dispatcherInfo.batchId
                            )
                        ) {

                            prepActivity.set(
                                dispatcherInfo.batchId,
                                {
                                    id:
                                        dispatcherInfo.batchId,

                                    target:
                                        dispatcherInfo.target,

                                    hosts:
                                        new Set(),

                                    processes: 0,

                                    threads: 0,

                                    grow: 0,

                                    weaken: 0
                                }
                            );
                        }


                        const prep =
                            prepActivity.get(
                                dispatcherInfo.batchId
                            );


                        prep.hosts.add(
                            server
                        );


                        prep.processes++;


                        prep.threads +=
                            threads;


                        if (
                            dispatcherInfo.stage ===
                            "PREP-G"
                        ) {

                            prep.grow +=
                                threads;
                        }


                        if (
                            dispatcherInfo.stage ===
                            "PREP-W"
                        ) {

                            prep.weaken +=
                                threads;
                        }
                    }
                }


                // =================================================
                // TARGET ACTIVITY
                // =================================================

                if (
                    target
                ) {

                    hostTargets.add(
                        target
                    );


                    if (
                        !targetActivity.has(
                            target
                        )
                    ) {

                        targetActivity.set(
                            target,
                            {
                                processes: 0,

                                threads: 0,

                                hack: 0,
                                grow: 0,
                                weaken: 0,
                                other: 0,

                                hosts:
                                    new Set()
                            }
                        );
                    }


                    const activity =
                        targetActivity.get(
                            target
                        );


                    activity.processes++;


                    activity.threads +=
                        threads;


                    activity.hosts.add(
                        server
                    );


                    switch (
                        action
                    ) {

                        case "HACK":

                            activity.hack +=
                                threads;

                            break;


                        case "GROW":

                            activity.grow +=
                                threads;

                            break;


                        case "WEAKEN":

                            activity.weaken +=
                                threads;

                            break;


                        default:

                            activity.other +=
                                threads;

                            break;
                    }
                }
            }


            // ====================================================
            // HOST STATUS
            // ====================================================

            let status;


            if (
                processes.length === 0
            ) {

                status =
                    "IDLE";

                idleHosts++;
            }
            else {

                status =
                    "ACTIVE";

                activeHosts++;
            }


            // ====================================================
            // NETWORK TOTALS
            // ====================================================

            totalRam +=
                maxRam;


            totalUsedRam +=
                usedRam;


            totalFreeRam +=
                freeRam;


            totalProcesses +=
                processes.length;


            totalThreads +=
                hostThreads;


            // ====================================================
            // SAVE HOST
            // ====================================================

            workerHosts.push({

                server,

                status,

                maxRam,
                usedRam,
                freeRam,
                utilization,

                processes:
                    processes.length,

                threads:
                    hostThreads,

                hackThreads,
                growThreads,
                weakenThreads,
                otherThreads,

                dispatcherProcesses:
                    hostDispatcherProcesses,

                dispatcherThreads:
                    hostDispatcherThreads,

                targets:
                    [...hostTargets]
            });
        }


        // ========================================================
        // SORT WORKER HOSTS
        // ========================================================

        workerHosts.sort(
            (a, b) => {

                if (
                    a.status !==
                    b.status
                ) {

                    return (
                        a.status === "ACTIVE"
                            ? -1
                            : 1
                    );
                }


                if (
                    b.usedRam !==
                    a.usedRam
                ) {

                    return (
                        b.usedRam -
                        a.usedRam
                    );
                }


                return (
                    b.maxRam -
                    a.maxRam
                );
            }
        );


        // ========================================================
        // NETWORK UTILIZATION
        // ========================================================

        const utilization =
            totalRam > 0
                ? (
                    totalUsedRam /
                    totalRam
                ) * 100
                : 0;


        // ========================================================
        // TARGET LIST
        // ========================================================

        const targetRows =
            [...targetActivity.entries()]
                .map(
                    ([server, data]) => ({
                        server,
                        ...data
                    })
                )
                .sort(
                    (a, b) =>
                        b.threads -
                        a.threads
                );


        // ========================================================
        // BATCH LIST
        // ========================================================

        const batchRows =
            [...batchActivity.values()]
                .sort(
                    compareBatchIds
                );


        // ========================================================
        // PREP LIST
        // ========================================================

        const prepRows =
            [...prepActivity.values()]
                .sort(
                    (a, b) =>
                        b.threads -
                        a.threads
                );


        // ========================================================
        // BATCH SUMMARY
        // ========================================================

        let completeBatches = 0;

        let partialBatches = 0;


        for (
            const batch
            of batchRows
        ) {

            if (
                isCompleteBatch(
                    batch
                )
            ) {

                completeBatches++;
            }
            else {

                partialBatches++;
            }
        }


        // ========================================================
        // BUILD DISPLAY
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
                    "BITBURNER // WORKER & HWGW MONITOR",
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
        // NETWORK RAM
        // ========================================================

        sectionTitle(
            lines,
            "NETWORK RAM",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Capacity",
                ns.format.ram(
                    totalRam
                ),
                28
            ) +

            field(
                "Used",
                ns.format.ram(
                    totalUsedRam
                ),
                28
            ) +

            field(
                "Free",
                ns.format.ram(
                    totalFreeRam
                ),
                28
            ) +

            field(
                "Utilization",
                `${utilization.toFixed(1)}%`,
                28
            )
        );


        lines.push(
            createBar(
                utilization,
                100
            )
        );


        // ========================================================
        // WORKLOAD
        // ========================================================

        sectionTitle(
            lines,
            "WORKLOAD",
            CONFIG,
            COLOR
        );


        lines.push(

            field(
                "Worker Hosts",
                workerHosts.length,
                24
            ) +

            field(
                "Active",
                activeHosts,
                20
            ) +

            field(
                "Idle",
                idleHosts,
                20
            ) +

            field(
                "Processes",
                totalProcesses,
                24
            ) +

            field(
                "Threads",
                totalThreads,
                24
            )
        );


        lines.push(

            field(
                "Hack Threads",
                totalHackThreads,
                28
            ) +

            field(
                "Grow Threads",
                totalGrowThreads,
                28
            ) +

            field(
                "Weaken Threads",
                totalWeakenThreads,
                28
            ) +

            field(
                "Other Threads",
                totalOtherThreads,
                28
            )
        );


        lines.push(

            field(
                "Dispatcher Proc",
                dispatcherProcesses,
                28
            ) +

            field(
                "Dispatcher Threads",
                dispatcherThreads,
                30
            ) +

            field(
                "Active Batches",
                batchRows.length,
                26
            ) +

            field(
                "Prep Operations",
                prepRows.length,
                26
            )
        );


        // ========================================================
        // ACTIVE HWGW BATCHES
        // ========================================================

        sectionTitle(
            lines,
            "ACTIVE HWGW BATCHES",
            CONFIG,
            COLOR
        );


        lines.push(

            "BATCH"
                .padEnd(25) +

            "TARGET"
                .padEnd(24) +

            "HOSTS"
                .padStart(7) +

            "PROC"
                .padStart(7) +

            "H"
                .padStart(9) +

            "W1"
                .padStart(9) +

            "G"
                .padStart(9) +

            "W2"
                .padStart(9) +

            "THREADS"
                .padStart(11) +

            "STATE"
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


        if (
            batchRows.length === 0
        ) {

            lines.push(
                color(
                    "No active dispatcher HWGW batches detected.",
                    COLOR.gray
                )
            );
        }
        else {

            for (
                const batch
                of batchRows.slice(
                    0,
                    CONFIG.maxBatchRows
                )
            ) {

                const complete =
                    isCompleteBatch(
                        batch
                    );


                const stateText =
                    complete
                        ? color(
                            "COMPLETE",
                            COLOR.brightGreen
                        )
                        : color(
                            "PARTIAL",
                            COLOR.brightYellow
                        );


                lines.push(

                    truncate(
                        batch.id,
                        24
                    )
                        .padEnd(25) +

                    truncate(
                        batch.target,
                        23
                    )
                        .padEnd(24) +

                    batch.hosts.size
                        .toString()
                        .padStart(7) +

                    batch.processes
                        .toString()
                        .padStart(7) +

                    batch.hack
                        .toString()
                        .padStart(9) +

                    batch.weaken1
                        .toString()
                        .padStart(9) +

                    batch.grow
                        .toString()
                        .padStart(9) +

                    batch.weaken2
                        .toString()
                        .padStart(9) +

                    batch.threads
                        .toString()
                        .padStart(11) +

                    padColoredStart(
                        stateText,
                        complete
                            ? 8
                            : 7,
                        14
                    )
                );
            }


            if (
                batchRows.length >
                CONFIG.maxBatchRows
            ) {

                lines.push(
                    color(
                        `... ${batchRows.length - CONFIG.maxBatchRows} more active batches`,
                        COLOR.gray
                    )
                );
            }


            lines.push("");


            lines.push(

                field(
                    "Complete",
                    completeBatches,
                    24
                ) +

                field(
                    "Partial",
                    partialBatches,
                    24
                )
            );
        }


        // ========================================================
        // PREP OPERATIONS
        // ========================================================

        if (
            prepRows.length > 0
        ) {

            sectionTitle(
                lines,
                "TARGET PREP",
                CONFIG,
                COLOR
            );


            lines.push(

                "OPERATION"
                    .padEnd(30) +

                "TARGET"
                    .padEnd(26) +

                "HOSTS"
                    .padStart(8) +

                "PROC"
                    .padStart(8) +

                "GROW"
                    .padStart(10) +

                "WEAKEN"
                    .padStart(10) +

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


            for (
                const prep
                of prepRows
            ) {

                lines.push(

                    truncate(
                        prep.id,
                        29
                    )
                        .padEnd(30) +

                    truncate(
                        prep.target,
                        25
                    )
                        .padEnd(26) +

                    prep.hosts.size
                        .toString()
                        .padStart(8) +

                    prep.processes
                        .toString()
                        .padStart(8) +

                    prep.grow
                        .toString()
                        .padStart(10) +

                    prep.weaken
                        .toString()
                        .padStart(10) +

                    prep.threads
                        .toString()
                        .padStart(10)
                );
            }
        }


        // ========================================================
        // WORKER HOSTS
        // ========================================================

        sectionTitle(
            lines,
            "WORKER HOSTS",
            CONFIG,
            COLOR
        );


        const header =

            "SERVER"
                .padEnd(23) +

            "STATUS"
                .padEnd(10) +

            "USED"
                .padStart(11) +

            "MAX"
                .padStart(11) +

            "FREE"
                .padStart(11) +

            "UTIL"
                .padStart(8) +

            "PROC"
                .padStart(7) +

            "THREADS"
                .padStart(9) +

            "H"
                .padStart(7) +

            "G"
                .padStart(7) +

            "W"
                .padStart(7) +

            "DISP"
                .padStart(8) +

            "TARGETS"
                .padStart(21);


        lines.push(
            color(
                header,
                COLOR.bold +
                COLOR.brightWhite
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


        for (
            const host
            of workerHosts
        ) {

            const statusText =
                host.status ===
                "ACTIVE"

                    ? color(
                        "ACTIVE",
                        COLOR.brightGreen
                    )

                    : color(
                        "IDLE",
                        COLOR.gray
                    );


            const targetText =
                formatTargets(
                    host.targets,
                    19
                );


            const row =

                truncate(
                    host.server,
                    22
                )
                    .padEnd(23) +

                padColored(
                    statusText,
                    host.status.length,
                    10
                ) +

                ns.format.ram(
                    host.usedRam
                )
                    .padStart(11) +

                ns.format.ram(
                    host.maxRam
                )
                    .padStart(11) +

                ns.format.ram(
                    host.freeRam
                )
                    .padStart(11) +

                (
                    host.utilization
                        .toFixed(0) +
                    "%"
                )
                    .padStart(8) +

                host.processes
                    .toString()
                    .padStart(7) +

                host.threads
                    .toString()
                    .padStart(9) +

                host.hackThreads
                    .toString()
                    .padStart(7) +

                host.growThreads
                    .toString()
                    .padStart(7) +

                host.weakenThreads
                    .toString()
                    .padStart(7) +

                host.dispatcherThreads
                    .toString()
                    .padStart(8) +

                targetText
                    .padStart(21);


            lines.push(
                row
            );
        }


        // ========================================================
        // TARGET WORKLOAD
        // ========================================================

        sectionTitle(
            lines,
            "TARGET WORKLOAD",
            CONFIG,
            COLOR
        );


        lines.push(

            "TARGET"
                .padEnd(28) +

            "HOSTS"
                .padStart(8) +

            "PROC"
                .padStart(8) +

            "THREADS"
                .padStart(10) +

            "HACK"
                .padStart(10) +

            "GROW"
                .padStart(10) +

            "WEAKEN"
                .padStart(10) +

            "OTHER"
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
            targetRows.length === 0
        ) {

            lines.push(
                color(
                    "No target-based worker activity detected.",
                    COLOR.gray
                )
            );
        }
        else {

            for (
                const target
                of targetRows.slice(
                    0,
                    CONFIG.maxTargetRows
                )
            ) {

                lines.push(

                    target.server
                        .padEnd(28) +

                    target.hosts.size
                        .toString()
                        .padStart(8) +

                    target.processes
                        .toString()
                        .padStart(8) +

                    target.threads
                        .toString()
                        .padStart(10) +

                    target.hack
                        .toString()
                        .padStart(10) +

                    target.grow
                        .toString()
                        .padStart(10) +

                    target.weaken
                        .toString()
                        .padStart(10) +

                    target.other
                        .toString()
                        .padStart(10)
                );
            }
        }


        // ========================================================
        // ATTENTION
        // ========================================================

        sectionTitle(
            lines,
            "ATTENTION",
            CONFIG,
            COLOR
        );


        const alerts = [];


        if (
            utilization < 50 &&
            totalFreeRam > 0
        ) {

            alerts.push(
                {
                    level:
                        "warning",

                    text:
                        `${ns.format.ram(totalFreeRam)} ` +
                        "of rooted RAM is currently unused."
                }
            );
        }


        if (
            idleHosts > 0
        ) {

            alerts.push(
                {
                    level:
                        "info",

                    text:
                        `${idleHosts} RAM host` +
                        `${idleHosts === 1 ? "" : "s"} ` +
                        "currently have no running scripts."
                }
            );
        }


        if (
            totalHackThreads === 0 &&
            totalGrowThreads === 0 &&
            totalWeakenThreads === 0
        ) {

            alerts.push(
                {
                    level:
                        "danger",

                    text:
                        "No Hack/Grow/Weaken worker threads detected."
                }
            );
        }


        if (
            dispatcherProcesses === 0
        ) {

            alerts.push(
                {
                    level:
                        "info",

                    text:
                        "No bb-dispatcher worker processes are currently running."
                }
            );
        }


        if (
            partialBatches > 0
        ) {

            alerts.push(
                {
                    level:
                        "warning",

                    text:
                        `${partialBatches} active HWGW batch` +
                        `${partialBatches === 1 ? "" : "es"} ` +
                        "currently appear incomplete."
                }
            );
        }


        if (
            targetRows.length === 1
        ) {

            alerts.push(
                {
                    level:
                        "info",

                    text:
                        "All detected HGW activity is concentrated on one target."
                }
            );
        }


        if (
            alerts.length === 0
        ) {

            lines.push(
                color(
                    "✓ Worker network appears healthy.",
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
                `Refresh: ${CONFIG.refreshMs / 1000}s` +
                "  |  Dispatcher batches are identified from worker args: target, delay, batchId, stage.",
                COLOR.gray
            )
        );


        // ========================================================
        // DISPLAY
        // ========================================================

        const display =
            lines.join(
                "\n"
            );


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
        // TITLE BAR
        // ========================================================

        ns.ui.setTailTitle(

            `WORKERS  |  ` +

            `${ns.format.ram(totalUsedRam)} / ${ns.format.ram(totalRam)}  |  ` +

            `${utilization.toFixed(0)}% RAM  |  ` +

            `${batchRows.length} Batches  |  ` +

            `${dispatcherThreads} Dispatcher Threads`
        );


        await ns.sleep(
            CONFIG.refreshMs
        );
    }
}


// ================================================================
// CREATE EMPTY BATCH RECORD
// ================================================================

function createBatchRecord(
    info
) {

    return {

        id:
            info.batchId,

        target:
            info.target,

        hosts:
            new Set(),

        processes: 0,

        threads: 0,

        hack: 0,

        weaken1: 0,

        grow: 0,

        weaken2: 0
    };
}


// ================================================================
// UPDATE BATCH RECORD
// ================================================================

function updateBatchRecord(
    batch,
    info,
    process,
    host
) {

    batch.hosts.add(
        host
    );


    batch.processes++;


    batch.threads +=
        process.threads;


    switch (
        info.stage
    ) {

        case "H":

            batch.hack +=
                process.threads;

            break;


        case "W1":

            batch.weaken1 +=
                process.threads;

            break;


        case "G":

            batch.grow +=
                process.threads;

            break;


        case "W2":

            batch.weaken2 +=
                process.threads;

            break;
    }
}


// ================================================================
// CHECK WHETHER ALL FOUR HWGW STAGES ARE PRESENT
// ================================================================

function isCompleteBatch(
    batch
) {

    return (
        batch.hack > 0 &&
        batch.weaken1 > 0 &&
        batch.grow > 0 &&
        batch.weaken2 > 0
    );
}


// ================================================================
// PARSE BB-DISPATCHER PROCESS
//
// Expected args:
//
// [0] target
// [1] additionalMsec
// [2] batch ID
// [3] stage
//
// Normal batches:
//
// B0-123456789  H
// B0-123456789  W1
// B0-123456789  G
// B0-123456789  W2
//
// Prep:
//
// PREP-W-123456
// PREP-G-123456
// ================================================================

function parseDispatcherProcess(
    process,
    dispatcherWorkers
) {

    if (
        !dispatcherWorkers.has(
            process.filename
        )
    ) {

        return null;
    }


    if (
        !process.args ||
        process.args.length < 4
    ) {

        return null;
    }


    const target =
        String(
            process.args[0] ??
            ""
        );


    const delay =
        Number(
            process.args[1] ??
            0
        );


    const batchId =
        String(
            process.args[2] ??
            ""
        );


    const stage =
        String(
            process.args[3] ??
            ""
        );


    if (
        !target ||
        !batchId ||
        !stage
    ) {

        return null;
    }


    let type =
        "UNKNOWN";


    if (
        batchId.startsWith(
            "B"
        ) &&
        (
            stage === "H" ||
            stage === "W1" ||
            stage === "G" ||
            stage === "W2"
        )
    ) {

        type =
            "BATCH";
    }


    if (
        batchId.startsWith(
            "PREP"
        ) ||
        stage.startsWith(
            "PREP"
        )
    ) {

        type =
            "PREP";
    }


    if (
        type === "UNKNOWN"
    ) {

        return null;
    }


    return {

        type,

        target,

        delay,

        batchId,

        stage
    };
}


// ================================================================
// SORT BATCH IDS
//
// Dispatcher IDs look like:
//
// B0-123456789
// B1-123456789
// B2-123456789
// ================================================================

function compareBatchIds(
    a,
    b
) {

    const aInfo =
        splitBatchId(
            a.id
        );


    const bInfo =
        splitBatchId(
            b.id
        );


    // Newer launches first.

    if (
        aInfo.launchId !==
        bInfo.launchId
    ) {

        return (
            bInfo.launchId -
            aInfo.launchId
        );
    }


    // Then batch sequence.

    return (
        aInfo.index -
        bInfo.index
    );
}


// ================================================================
// SPLIT BATCH ID
// ================================================================

function splitBatchId(
    id
) {

    const match =
        /^B(\d+)-(\d+)$/.exec(
            id
        );


    if (
        !match
    ) {

        return {
            index:
                Number.MAX_SAFE_INTEGER,

            launchId:
                0
        };
    }


    return {

        index:
            Number(
                match[1]
            ),

        launchId:
            Number(
                match[2]
            )
    };
}


// ================================================================
// SCAN NETWORK
// ================================================================

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


// ================================================================
// DETECT ACTION
// ================================================================

function detectAction(
    filename
) {

    const name =
        filename.toLowerCase();


    if (
        name.includes(
            "weaken"
        )
    ) {

        return "WEAKEN";
    }


    if (
        name.includes(
            "grow"
        )
    ) {

        return "GROW";
    }


    if (
        name.includes(
            "hack"
        )
    ) {

        return "HACK";
    }


    return "OTHER";
}


// ================================================================
// FIND TARGET IN PROCESS ARGUMENTS
// ================================================================

function findTarget(
    args,
    serverSet
) {

    if (
        !args
    ) {

        return null;
    }


    for (
        const arg
        of args
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


// ================================================================
// FORMAT TARGET LIST
// ================================================================

function formatTargets(
    targets,
    maxLength
) {

    if (
        targets.length === 0
    ) {

        return "-";
    }


    const text =
        targets.join(
            ","
        );


    if (
        text.length <=
        maxLength
    ) {

        return text;
    }


    return (
        text.substring(
            0,
            maxLength - 3
        ) +
        "..."
    );
}


// ================================================================
// TRUNCATE TEXT
// ================================================================

function truncate(
    value,
    maxLength
) {

    const text =
        String(
            value
        );


    if (
        text.length <=
        maxLength
    ) {

        return text;
    }


    return (
        text.substring(
            0,
            Math.max(
                0,
                maxLength - 3
            )
        ) +
        "..."
    );
}


// ================================================================
// SECTION HEADER
// ================================================================

function sectionTitle(
    lines,
    title,
    config,
    colors
) {

    lines.push("");


    lines.push(
        color(
            `[ ${title} ]`,
            colors.bold +
            colors.brightCyan
        )
    );


    lines.push(
        color(
            "─".repeat(
                config.separatorWidth
            ),
            colors.gray
        )
    );
}


// ================================================================
// FIELD
// ================================================================

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


// ================================================================
// RAM BAR
// ================================================================

function createBar(
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
        normalized.toFixed(
            1
        ) +
        "%"
    );
}


// ================================================================
// ALERT FORMAT
// ================================================================

function formatAlert(
    alert,
    colors
) {

    switch (
        alert.level
    ) {

        case "danger":

            return color(
                `⚠ ${alert.text}`,
                colors.brightRed
            );


        case "warning":

            return color(
                `⚠ ${alert.text}`,
                colors.brightYellow
            );


        default:

            return color(
                `• ${alert.text}`,
                colors.brightCyan
            );
    }
}


// ================================================================
// CENTER TEXT
// ================================================================

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


// ================================================================
// ANSI COLOR
// ================================================================

function color(
    text,
    colorCode
) {

    return (
        colorCode +
        text +
        "\x1b[0m"
    );
}


// ================================================================
// PAD COLORED TEXT TO THE RIGHT
// ================================================================

function padColored(
    coloredText,
    visibleLength,
    width
) {

    return (
        coloredText +
        " ".repeat(
            Math.max(
                0,
                width -
                visibleLength
            )
        )
    );
}


// ================================================================
// PAD COLORED TEXT TO THE LEFT
// ================================================================

function padColoredStart(
    coloredText,
    visibleLength,
    width
) {

    return (
        " ".repeat(
            Math.max(
                0,
                width -
                visibleLength
            )
        ) +
        coloredText
    );
}