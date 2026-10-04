/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ============================================================
    // BITBURNER TARGET PROFITABILITY ANALYZER
    // ============================================================
    //
    // Purpose:
    //
    // Rank available hacking targets using:
    //
    //   - Maximum money
    //   - Current money
    //   - Security
    //   - Hack chance
    //   - Hack percentage
    //   - Hack threads
    //   - Grow recovery threads
    //   - Weaken recovery threads
    //   - Hack / Grow / Weaken time
    //   - Estimated cycle RAM
    //   - Estimated RAM-seconds
    //   - Expected money per cycle
    //   - Expected money / second
    //   - Expected money / second / GB
    //
    // The most important ranking metric is:
    //
    //              EXPECTED MONEY
    //   --------------------------------------
    //        TOTAL RAM * EXECUTION TIME
    //
    // This gives an approximate $ / sec / GB efficiency.
    //
    // ============================================================


    // ============================================================
    // CONFIGURATION
    // ============================================================

    const CONFIG = {

        refreshMs: 2000,

        windowWidth: 1500,
        windowHeight: 720,

        displayTargets: 15,

        // Target percentage of server money we attempt
        // to take with each theoretical hack cycle.
        targetHackFraction: 0.10,

        // Never model stealing more than this percentage.
        maxHackFraction: 0.90,

        readyMoneyPercent: 95,

        readySecurityDelta: 1,

        growMoneyPercent: 75,

        weakSecurityDelta: 5,

        separatorWidth: 146
    };


    // ============================================================
    // ANSI COLORS
    // ============================================================

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
    // WINDOW
    // ============================================================

    ns.ui.openTail();

    ns.ui.resizeTail(
        CONFIG.windowWidth,
        CONFIG.windowHeight
    );

    ns.ui.setTailTitle(
        "BITBURNER // TARGET PROFITABILITY ANALYZER"
    );


    // ============================================================
    // DETERMINE WORKER RAM COST
    // ============================================================
    //
    // A minimal worker script consists roughly of:
    //
    // base script RAM
    // +
    // RAM cost of hack(), grow(), or weaken()
    //
    // getFunctionRamCost("baseCost") is provided by Bitburner.
    //
    // ============================================================

    const baseRam =
        ns.getFunctionRamCost(
            "baseCost"
        );

    const hackRam =
        baseRam +
        ns.getFunctionRamCost(
            "hack"
        );

    const growRam =
        baseRam +
        ns.getFunctionRamCost(
            "grow"
        );

    const weakenRam =
        baseRam +
        ns.getFunctionRamCost(
            "weaken"
        );


    let lastDisplay = "";


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        const servers =
            scanNetwork(ns);

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
        // NETWORK RAM
        // ========================================================

        let networkMaxRam = 0;
        let networkUsedRam = 0;

        for (const server of servers) {

            if (
                !ns.hasRootAccess(server)
            ) {
                continue;
            }

            networkMaxRam +=
                ns.getServerMaxRam(
                    server
                );

            networkUsedRam +=
                ns.getServerUsedRam(
                    server
                );
        }


        const networkFreeRam =
            Math.max(
                0,
                networkMaxRam -
                networkUsedRam
            );


        // ========================================================
        // ANALYZE TARGETS
        // ========================================================

        const targets = [];


        for (const server of servers) {

            if (
                server === "home"
            ) {
                continue;
            }


            const data =
                ns.getServer(
                    server
                );


            // ----------------------------------------------------
            // MUST HAVE ROOT
            // ----------------------------------------------------

            if (
                !data.hasAdminRights
            ) {
                continue;
            }


            // ----------------------------------------------------
            // MUST HAVE MONEY
            // ----------------------------------------------------

            const maxMoney =
                data.moneyMax ?? 0;

            if (
                maxMoney <= 0
            ) {
                continue;
            }


            // ----------------------------------------------------
            // PLAYER MUST BE ABLE TO HACK IT
            // ----------------------------------------------------

            const requiredHack =
                data.requiredHackingSkill ?? 0;

            if (
                requiredHack >
                playerHackLevel
            ) {
                continue;
            }


            // ====================================================
            // CURRENT SERVER CONDITION
            // ====================================================

            const currentMoney =
                data.moneyAvailable ?? 0;

            const currentSecurity =
                data.hackDifficulty ?? 0;

            const minSecurity =
                data.minDifficulty ?? 0;


            const moneyPercent =
                maxMoney > 0
                    ? (
                        currentMoney /
                        maxMoney
                    ) * 100
                    : 0;


            const securityDelta =
                Math.max(
                    0,
                    currentSecurity -
                    minSecurity
                );


            // ====================================================
            // SERVER STATE
            // ====================================================

            let state =
                "READY";

            if (
                securityDelta >
                CONFIG.weakSecurityDelta
            ) {

                state =
                    "WEAKEN";
            }
            else if (
                moneyPercent <
                CONFIG.growMoneyPercent
            ) {

                state =
                    "GROW";
            }
            else if (
                moneyPercent <
                    CONFIG.readyMoneyPercent ||
                securityDelta >
                    CONFIG.readySecurityDelta
            ) {

                state =
                    "PREP";
            }


            // ====================================================
            // HACK ANALYSIS
            // ====================================================

            let hackChance;
            let hackFraction;

            let hackTime;
            let growTime;
            let weakenTime;


            try {

                hackChance =
                    ns.hackAnalyzeChance(
                        server
                    );

                hackFraction =
                    ns.hackAnalyze(
                        server
                    );

                hackTime =
                    ns.getHackTime(
                        server
                    );

                growTime =
                    ns.getGrowTime(
                        server
                    );

                weakenTime =
                    ns.getWeakenTime(
                        server
                    );

            }
            catch {

                continue;
            }


            if (
                hackFraction <= 0 ||
                hackChance <= 0 ||
                hackTime <= 0
            ) {

                continue;
            }


            // ====================================================
            // HACK THREADS
            // ====================================================

            let hackThreads =
                Math.floor(
                    CONFIG.targetHackFraction /
                    hackFraction
                );


            if (
                hackThreads < 1
            ) {

                hackThreads = 1;
            }


            // Prevent theoretical cycle from draining
            // almost all server money.

            const maxHackThreads =
                Math.max(
                    1,
                    Math.floor(
                        CONFIG.maxHackFraction /
                        hackFraction
                    )
                );


            hackThreads =
                Math.min(
                    hackThreads,
                    maxHackThreads
                );


            // ====================================================
            // ACTUAL HACK FRACTION
            // ====================================================

            const actualHackFraction =
                Math.min(
                    CONFIG.maxHackFraction,

                    hackFraction *
                    hackThreads
                );


            // ====================================================
            // EXPECTED MONEY
            // ====================================================

            const theoreticalHackMoney =
                maxMoney *
                actualHackFraction;


            const expectedHackMoney =
                theoreticalHackMoney *
                hackChance;


            // ====================================================
            // GROW RECOVERY
            // ====================================================
            //
            // Example:
            //
            // Steal 10%.
            //
            // Server goes:
            //
            // 100% -> 90%
            //
            // Required multiplier:
            //
            // 100 / 90 = 1.1111
            //
            // ====================================================

            const remainingFraction =
                Math.max(
                    0.000001,
                    1 -
                    actualHackFraction
                );


            const growMultiplier =
                1 /
                remainingFraction;


            let growThreads = 0;


            try {

                growThreads =
                    Math.ceil(
                        ns.growthAnalyze(
                            server,
                            growMultiplier,
                            1
                        )
                    );

            }
            catch {

                growThreads = 0;
            }


            if (
                !Number.isFinite(
                    growThreads
                )
            ) {

                growThreads = 0;
            }


            // ====================================================
            // SECURITY GENERATED BY HACK
            // ====================================================

            let hackSecurity = 0;


            try {

                hackSecurity =
                    ns.hackAnalyzeSecurity(
                        hackThreads,
                        server
                    );

            }
            catch {

                hackSecurity = 0;
            }


            // ====================================================
            // SECURITY GENERATED BY GROW
            // ====================================================

            let growSecurity = 0;


            try {

                growSecurity =
                    ns.growthAnalyzeSecurity(
                        growThreads,
                        server,
                        1
                    );

            }
            catch {

                growSecurity = 0;
            }


            // ====================================================
            // WEAKEN THREADS REQUIRED
            // ====================================================

            const totalSecurityIncrease =
                hackSecurity +
                growSecurity;


            let weakenPerThread = 0;


            try {

                weakenPerThread =
                    ns.weakenAnalyze(
                        1,
                        1
                    );

            }
            catch {

                weakenPerThread = 0;
            }


            let weakenThreads = 0;


            if (
                weakenPerThread > 0
            ) {

                weakenThreads =
                    Math.ceil(
                        totalSecurityIncrease /
                        weakenPerThread
                    );
            }


            // ====================================================
            // RAM REQUIREMENTS
            // ====================================================

            const hackTotalRam =
                hackThreads *
                hackRam;


            const growTotalRam =
                growThreads *
                growRam;


            const weakenTotalRam =
                weakenThreads *
                weakenRam;


            // Maximum simultaneous RAM requirement if
            // these workers overlap as a batch.

            const batchRam =
                hackTotalRam +
                growTotalRam +
                weakenTotalRam;


            // ====================================================
            // RAM-SECONDS
            // ====================================================
            //
            // This represents the actual amount of RAM occupied
            // over time.
            //
            // Example:
            //
            // 10 GB for 5 seconds
            //
            // = 50 GB-seconds
            //
            // ====================================================

            const hackRamSeconds =
                hackTotalRam *
                (
                    hackTime /
                    1000
                );


            const growRamSeconds =
                growTotalRam *
                (
                    growTime /
                    1000
                );


            const weakenRamSeconds =
                weakenTotalRam *
                (
                    weakenTime /
                    1000
                );


            const totalRamSeconds =
                hackRamSeconds +
                growRamSeconds +
                weakenRamSeconds;


            // ====================================================
            // SEQUENTIAL CYCLE TIME
            // ====================================================

            const sequentialCycleTime =
                hackTime +
                growTime +
                weakenTime;


            const sequentialSeconds =
                sequentialCycleTime /
                1000;


            // ====================================================
            // EXPECTED $ / SECOND
            // ====================================================

            const moneyPerSecond =
                sequentialSeconds > 0
                    ? expectedHackMoney /
                        sequentialSeconds
                    : 0;


            // ====================================================
            // EXPECTED $ / SEC / GB
            // ====================================================
            //
            // Expected money divided by consumed RAM-time.
            //
            // This is the primary efficiency metric.
            //
            // ====================================================

            const moneyPerSecondPerGb =
                totalRamSeconds > 0
                    ? expectedHackMoney /
                        totalRamSeconds
                    : 0;


            // ====================================================
            // BATCH CAPACITY
            // ====================================================

            const possibleBatches =
                batchRam > 0
                    ? Math.floor(
                        networkFreeRam /
                        batchRam
                    )
                    : 0;


            // ====================================================
            // ACTIVE PROCESSES TARGETING SERVER
            // ====================================================

            const activity =
                findTargetActivity(
                    ns,
                    servers,
                    server
                );


            // ====================================================
            // STORE RESULT
            // ====================================================

            targets.push({

                server,

                state,

                maxMoney,
                currentMoney,
                moneyPercent,

                requiredHack,

                currentSecurity,
                minSecurity,
                securityDelta,

                hackChance,
                hackFraction,

                actualHackFraction,

                hackThreads,
                growThreads,
                weakenThreads,

                hackTime,
                growTime,
                weakenTime,

                hackRam,
                growRam,
                weakenRam,

                batchRam,

                totalRamSeconds,

                theoreticalHackMoney,
                expectedHackMoney,

                moneyPerSecond,
                moneyPerSecondPerGb,

                possibleBatches,

                activity
            });
        }


        // ========================================================
        // SORT
        //
        // Highest efficiency first.
        // ========================================================

        targets.sort(
            (a, b) => {

                if (
                    b.moneyPerSecondPerGb !==
                    a.moneyPerSecondPerGb
                ) {

                    return (
                        b.moneyPerSecondPerGb -
                        a.moneyPerSecondPerGb
                    );
                }


                return (
                    b.moneyPerSecond -
                    a.moneyPerSecond
                );
            }
        );


        const displayedTargets =
            targets.slice(
                0,
                CONFIG.displayTargets
            );


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


        const title =
            "BITBURNER // TARGET PROFITABILITY ANALYZER";


        lines.push(
            centerText(
                title,
                CONFIG.separatorWidth
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


        lines.push("");


        // ========================================================
        // PLAYER SUMMARY
        // ========================================================

        lines.push(
            color(
                "[ PLAYER / NETWORK ]",
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
                "Targets",
                targets.length,
                20
            ) +

            field(
                "Free RAM",
                ns.format.ram(
                    networkFreeRam
                ),
                28
            )
        );


        lines.push(

            field(
                "Hack RAM",
                ns.format.ram(
                    hackRam
                ),
                24
            ) +

            field(
                "Grow RAM",
                ns.format.ram(
                    growRam
                ),
                30
            ) +

            field(
                "Weaken RAM",
                ns.format.ram(
                    weakenRam
                ),
                20
            ) +

            field(
                "Hack Goal",
                (
                    CONFIG.targetHackFraction *
                    100
                ).toFixed(0) + "%",
                20
            )
        );


        // ========================================================
        // TARGET TABLE
        // ========================================================

        lines.push("");

        lines.push(
            color(
                "[ TARGET RANKING ]",
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


        const header =

            "#".padStart(3) +

            "  SERVER"
                .padEnd(23) +

            "STATE"
                .padEnd(9) +

            "$/SEC/GB"
                .padStart(13) +

            "$/SEC"
                .padStart(13) +

            "CHANCE"
                .padStart(9) +

            "TAKE"
                .padStart(8) +

            "H"
                .padStart(6) +

            "G"
                .padStart(6) +

            "W"
                .padStart(6) +

            "RAM"
                .padStart(11) +

            "MONEY"
                .padStart(9) +

            "SEC+"
                .padStart(8) +

            "H-TIME"
                .padStart(10) +

            "BATCH"
                .padStart(8) +

            "ACTIVE"
                .padStart(10);


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


        // ========================================================
        // TARGET ROWS
        // ========================================================

        let rank = 1;


        for (
            const target
            of displayedTargets
        ) {

            const stateText =
                formatState(
                    target.state,
                    COLOR
                );


            const activityText =
                formatActivity(
                    target.activity
                );


            const row =

                rank
                    .toString()
                    .padStart(3) +

                "  " +

                target.server
                    .padEnd(21) +

                stateText
                    .padEnd(18) +

                formatMoney(
                    ns,
                    target.moneyPerSecondPerGb
                )
                    .padStart(13) +

                formatMoney(
                    ns,
                    target.moneyPerSecond
                )
                    .padStart(13) +

                (
                    target.hackChance *
                    100
                )
                    .toFixed(1)
                    .concat("%")
                    .padStart(9) +

                (
                    target.actualHackFraction *
                    100
                )
                    .toFixed(1)
                    .concat("%")
                    .padStart(8) +

                target.hackThreads
                    .toString()
                    .padStart(6) +

                target.growThreads
                    .toString()
                    .padStart(6) +

                target.weakenThreads
                    .toString()
                    .padStart(6) +

                ns.format.ram(
                    target.batchRam
                )
                    .padStart(11) +

                (
                    target.moneyPercent
                        .toFixed(0) +
                    "%"
                )
                    .padStart(9) +

                target.securityDelta
                    .toFixed(1)
                    .padStart(8) +

                formatTime(
                    target.hackTime
                )
                    .padStart(10) +

                target.possibleBatches
                    .toString()
                    .padStart(8) +

                activityText
                    .padStart(10);


            lines.push(row);

            rank++;
        }


        // ========================================================
        // NO TARGETS
        // ========================================================

        if (
            displayedTargets.length === 0
        ) {

            lines.push("");

            lines.push(
                color(
                    "No viable hacking targets found.",
                    COLOR.brightYellow
                )
            );
        }


        // ========================================================
        // BEST TARGET DETAIL
        // ========================================================

        if (
            displayedTargets.length > 0
        ) {

            const best =
                displayedTargets[0];


            lines.push("");

            lines.push(
                color(
                    "[ CURRENT BEST TARGET ]",
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


            lines.push(

                color(
                    best.server,
                    COLOR.bold +
                    COLOR.brightGreen
                ) +

                "  |  Expected Cycle: " +

                formatMoney(
                    ns,
                    best.expectedHackMoney
                ) +

                "  |  Efficiency: " +

                formatMoney(
                    ns,
                    best.moneyPerSecondPerGb
                ) +

                "/sec/GB" +

                "  |  Batch RAM: " +

                ns.format.ram(
                    best.batchRam
                )
            );


            lines.push(

                "Threads  " +

                `Hack ${best.hackThreads}` +

                "  |  " +

                `Grow ${best.growThreads}` +

                "  |  " +

                `Weaken ${best.weakenThreads}` +

                "      " +

                "Times  " +

                `H ${formatTime(best.hackTime)}` +

                "  |  " +

                `G ${formatTime(best.growTime)}` +

                "  |  " +

                `W ${formatTime(best.weakenTime)}`
            );
        }


        // ========================================================
        // LEGEND
        // ========================================================

        lines.push("");

        lines.push(
            color(
                "[ LEGEND ]",
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


        lines.push(
            "H/G/W = estimated Hack/Grow/Weaken threads   |   " +
            "RAM = simultaneous batch RAM   |   " +
            "BATCH = batches that fit in currently free network RAM"
        );


        lines.push(
            "$/SEC/GB = expected hack income divided by total HGW RAM-time. " +
            "Higher values indicate more efficient targets."
        );


        lines.push(
            color(
                `Refresh: ${CONFIG.refreshMs / 1000}s  |  ` +
                `Showing top ${displayedTargets.length} of ${targets.length} viable targets`,
                COLOR.gray
            )
        );


        // ========================================================
        // DISPLAY - ONLY REDRAW WHEN CHANGED
        // ========================================================

        const display =
            lines.join("\n");


        if (
            display !== lastDisplay
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

        if (
            targets.length > 0
        ) {

            const best =
                targets[0];

            ns.ui.setTailTitle(

                `TARGET ANALYZER  |  ` +

                `#1 ${best.server}  |  ` +

                `${formatMoney(
                    ns,
                    best.moneyPerSecondPerGb
                )}/sec/GB`
            );
        }


        await ns.sleep(
            CONFIG.refreshMs
        );
    }
}


// ================================================================
// NETWORK SCANNER
// ================================================================

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


// ================================================================
// FIND ACTIVE JOBS TARGETING SERVER
// ================================================================

function findTargetActivity(
    ns,
    servers,
    target
) {

    let hackThreads = 0;
    let growThreads = 0;
    let weakenThreads = 0;


    for (
        const host
        of servers
    ) {

        if (
            !ns.hasRootAccess(host)
        ) {

            continue;
        }


        const processes =
            ns.ps(host);


        for (
            const process
            of processes
        ) {

            let targetsServer =
                false;


            for (
                const arg
                of process.args
            ) {

                if (
                    String(arg) === target
                ) {

                    targetsServer =
                        true;

                    break;
                }
            }


            if (
                !targetsServer
            ) {

                continue;
            }


            const filename =
                process.filename
                    .toLowerCase();


            if (
                filename.includes(
                    "weaken"
                )
            ) {

                weakenThreads +=
                    process.threads;
            }
            else if (
                filename.includes(
                    "grow"
                )
            ) {

                growThreads +=
                    process.threads;
            }
            else if (
                filename.includes(
                    "hack"
                )
            ) {

                hackThreads +=
                    process.threads;
            }
        }
    }


    return {

        hack: hackThreads,

        grow: growThreads,

        weaken: weakenThreads,

        total:
            hackThreads +
            growThreads +
            weakenThreads
    };
}


// ================================================================
// FORMAT ACTIVITY
// ================================================================

function formatActivity(
    activity
) {

    if (
        activity.total === 0
    ) {

        return "IDLE";
    }


    return (
        activity.total.toString()
    );
}


// ================================================================
// FORMAT SERVER STATE
// ================================================================

function formatState(
    state,
    colors
) {

    switch (
        state
    ) {

        case "READY":

            return (
                colors.brightGreen +
                "READY" +
                colors.reset
            );


        case "GROW":

            return (
                colors.brightYellow +
                "GROW" +
                colors.reset
            );


        case "WEAKEN":

            return (
                colors.brightRed +
                "WEAKEN" +
                colors.reset
            );


        default:

            return (
                colors.brightCyan +
                "PREP" +
                colors.reset
            );
    }
}


// ================================================================
// FIELD FORMATTER
// ================================================================

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


// ================================================================
// MONEY FORMATTER
// ================================================================

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


// ================================================================
// TIME FORMATTER
// ================================================================

function formatTime(
    milliseconds
) {

    if (
        milliseconds < 1000
    ) {

        return (
            milliseconds
                .toFixed(0) +
            "ms"
        );
    }


    const seconds =
        milliseconds /
        1000;


    if (
        seconds < 60
    ) {

        return (
            seconds
                .toFixed(1) +
            "s"
        );
    }


    const minutes =
        seconds /
        60;


    return (
        minutes
            .toFixed(1) +
        "m"
    );
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
// COLOR HELPER
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