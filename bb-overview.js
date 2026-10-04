/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ============================================================
    // BITBURNER OPERATIONS OVERVIEW
    // ============================================================

    const CONFIG = {
        refreshMs: 1000,
        width: 112,
        windowWidth: 1200,
        windowHeight: 720,
        topTargets: 5
    };

    const COLORS = {
        reset: "\x1b[0m",
        bold: "\x1b[1m",
        dim: "\x1b[2m",

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

    const PORT_PROGRAMS = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe"
    ];

    ns.ui.openTail();
    ns.ui.resizeTail(
        CONFIG.windowWidth,
        CONFIG.windowHeight
    );

    ns.ui.setTailTitle(
        "BITBURNER // OPERATIONS OVERVIEW"
    );

    let lastDisplay = "";

    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        const servers = scanNetwork(ns);
        const serverSet = new Set(servers);

        // ========================================================
        // PLAYER
        // ========================================================

        const playerHackLevel =
            ns.getHackingLevel();

        const playerMoney =
            ns.getServerMoneyAvailable("home");

        const portsAvailable =
            PORT_PROGRAMS.filter(program =>
                ns.fileExists(program, "home")
            ).length;

        // Current income / second.
        const incomeData =
            ns.getTotalScriptIncome();

        const incomePerSecond =
            incomeData[0];

        const expPerSecond =
            ns.getTotalScriptExpGain();


        // ========================================================
        // NETWORK STATISTICS
        // ========================================================

        let rootedCount = 0;
        let unrootedCount = 0;

        let rootableNow = 0;
        let hackableNow = 0;

        let totalMaxRam = 0;
        let totalUsedRam = 0;

        let runningProcesses = 0;
        let runningThreads = 0;

        let contractCount = 0;

        const activeTargets =
            new Map();


        for (const server of servers) {

            const data =
                ns.getServer(server);

            const rooted =
                data.hasAdminRights;

            // ----------------------------------------------------
            // ROOT STATUS
            // ----------------------------------------------------

            if (rooted) {
                rootedCount++;
            }
            else {
                unrootedCount++;

                const portsNeeded =
                    data.numOpenPortsRequired ?? 0;

                if (
                    portsAvailable >= portsNeeded
                ) {
                    rootableNow++;
                }
            }


            // ----------------------------------------------------
            // HACKABLE MONEY TARGETS
            // ----------------------------------------------------

            if (
                rooted &&
                (data.moneyMax ?? 0) > 0 &&
                (data.requiredHackingSkill ?? 0)
                    <= playerHackLevel
            ) {
                hackableNow++;
            }


            // ----------------------------------------------------
            // USABLE RAM
            // ----------------------------------------------------

            if (rooted) {

                totalMaxRam +=
                    data.maxRam ?? 0;

                totalUsedRam +=
                    data.ramUsed ?? 0;
            }


            // ----------------------------------------------------
            // PROCESSES
            // ----------------------------------------------------

            if (rooted) {

                const processes =
                    ns.ps(server);

                runningProcesses +=
                    processes.length;

                for (const process of processes) {

                    runningThreads +=
                        process.threads;

                    detectTargetActivity(
                        process,
                        serverSet,
                        activeTargets
                    );
                }
            }


            // ----------------------------------------------------
            // CONTRACTS
            // ----------------------------------------------------

            const contracts =
                ns.ls(server, ".cct");

            contractCount +=
                contracts.length;
        }


        const freeRam =
            Math.max(
                0,
                totalMaxRam - totalUsedRam
            );

        const ramPercent =
            totalMaxRam > 0
                ? (
                    totalUsedRam /
                    totalMaxRam
                ) * 100
                : 0;


        // ========================================================
        // TARGET HEALTH
        // ========================================================

        let targetsReady = 0;
        let targetsNeedGrow = 0;
        let targetsNeedWeaken = 0;

        for (
            const targetName
            of activeTargets.keys()
        ) {

            const data =
                ns.getServer(targetName);

            const maxMoney =
                data.moneyMax ?? 0;

            const money =
                data.moneyAvailable ?? 0;

            const minSecurity =
                data.minDifficulty ?? 0;

            const security =
                data.hackDifficulty ?? 0;

            if (maxMoney <= 0) {
                continue;
            }

            const moneyPercent =
                maxMoney > 0
                    ? (
                        money /
                        maxMoney
                    ) * 100
                    : 0;

            const securityDelta =
                security -
                minSecurity;

            if (securityDelta > 5) {

                targetsNeedWeaken++;
            }
            else if (moneyPercent < 75) {

                targetsNeedGrow++;
            }
            else if (
                moneyPercent >= 95 &&
                securityDelta <= 1
            ) {

                targetsReady++;
            }
        }


        // ========================================================
        // TARGET ANALYSIS
        // ========================================================

        const targetScores = [];

        for (const server of servers) {

            if (server === "home") {
                continue;
            }

            const data =
                ns.getServer(server);

            if (!data.hasAdminRights) {
                continue;
            }

            const maxMoney =
                data.moneyMax ?? 0;

            if (maxMoney <= 0) {
                continue;
            }

            const requiredHack =
                data.requiredHackingSkill ?? 0;

            if (
                requiredHack >
                playerHackLevel
            ) {
                continue;
            }


            let hackChance = 0;
            let hackFraction = 0;
            let hackTime = 0;

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

            }
            catch {

                continue;
            }


            if (
                hackTime <= 0 ||
                hackFraction <= 0
            ) {
                continue;
            }


            // ----------------------------------------------------
            // FIRST-PASS PROFITABILITY SCORE
            //
            // Expected money generated by ONE hack thread
            // divided by hack duration.
            //
            // This does NOT yet include grow/weaken recovery.
            // bb-targets.js will handle that later.
            // ----------------------------------------------------

            const expectedHackMoney =
                maxMoney *
                hackFraction *
                hackChance;

            const expectedPerSecond =
                expectedHackMoney /
                (hackTime / 1000);


            const currentMoney =
                data.moneyAvailable ?? 0;

            const moneyPercent =
                maxMoney > 0
                    ? (
                        currentMoney /
                        maxMoney
                    ) * 100
                    : 0;

            const security =
                data.hackDifficulty ?? 0;

            const minSecurity =
                data.minDifficulty ?? 0;

            targetScores.push({
                server,
                maxMoney,
                currentMoney,
                moneyPercent,
                security,
                minSecurity,
                securityDelta:
                    security - minSecurity,
                hackChance,
                hackFraction,
                hackTime,
                expectedPerSecond
            });
        }


        targetScores.sort(
            (a, b) =>
                b.expectedPerSecond -
                a.expectedPerSecond
        );


        const topTargets =
            targetScores.slice(
                0,
                CONFIG.topTargets
            );


        // ========================================================
        // DISPLAY
        // ========================================================

        const lines = [];

        drawHeader(
            lines,
            CONFIG,
            COLORS
        );


        // ========================================================
        // PLAYER SECTION
        // ========================================================

        sectionTitle(
            lines,
            "PLAYER",
            CONFIG,
            COLORS
        );

        lines.push(
            field(
                "Hack Level",
                ns.format.number(
                    playerHackLevel,
                    0
                ),
                18
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
                "Port Crackers",
                `${portsAvailable}/5`,
                24
            )
        );

        lines.push(
            field(
                "Income / sec",
                formatMoney(
                    ns,
                    incomePerSecond
                ),
                18
            ) +

            field(
                "EXP / sec",
                ns.format.number(
                    expPerSecond,
                    2
                ),
                30
            ) +

            field(
                "Contracts",
                contractCount.toString(),
                24
            )
        );


        // ========================================================
        // NETWORK SECTION
        // ========================================================

        sectionTitle(
            lines,
            "NETWORK",
            CONFIG,
            COLORS
        );

        lines.push(
            field(
                "Servers",
                servers.length.toString(),
                18
            ) +

            field(
                "Rooted",
                rootedCount.toString(),
                18
            ) +

            field(
                "Unrooted",
                unrootedCount.toString(),
                18
            ) +

            field(
                "Rootable Now",
                rootableNow.toString(),
                22
            )
        );

        lines.push(
            field(
                "Hackable",
                hackableNow.toString(),
                18
            ) +

            field(
                "Processes",
                runningProcesses.toString(),
                18
            ) +

            field(
                "Threads",
                runningThreads.toString(),
                18
            ) +

            field(
                "Active Targets",
                activeTargets.size.toString(),
                22
            )
        );


        // ========================================================
        // RAM SECTION
        // ========================================================

        sectionTitle(
            lines,
            "RAM UTILIZATION",
            CONFIG,
            COLORS
        );

        lines.push(
            field(
                "Used",
                ns.format.ram(
                    totalUsedRam
                ),
                24
            ) +

            field(
                "Available",
                ns.format.ram(
                    freeRam
                ),
                24
            ) +

            field(
                "Capacity",
                ns.format.ram(
                    totalMaxRam
                ),
                24
            ) +

            field(
                "Utilization",
                `${ramPercent.toFixed(1)}%`,
                24
            )
        );

        lines.push(
            createRamBar(
                ramPercent,
                80
            )
        );


        // ========================================================
        // TARGET HEALTH
        // ========================================================

        sectionTitle(
            lines,
            "ACTIVE TARGET HEALTH",
            CONFIG,
            COLORS
        );

        lines.push(
            field(
                "Ready",
                targetsReady.toString(),
                24
            ) +

            field(
                "Need Grow",
                targetsNeedGrow.toString(),
                24
            ) +

            field(
                "Need Weaken",
                targetsNeedWeaken.toString(),
                24
            ) +

            field(
                "Tracked",
                activeTargets.size.toString(),
                24
            )
        );


        // ========================================================
        // BEST TARGETS
        // ========================================================

        sectionTitle(
            lines,
            "TOP HACK TARGETS",
            CONFIG,
            COLORS
        );

        lines.push(
            "SERVER".padEnd(24) +
            "EST $/SEC/T".padStart(16) +
            "CHANCE".padStart(11) +
            "HACK %".padStart(10) +
            "MONEY".padStart(10) +
            "SEC +".padStart(10) +
            "TIME".padStart(12)
        );

        lines.push(
            "─".repeat(
                CONFIG.width
            )
        );


        if (topTargets.length === 0) {

            lines.push(
                "No current hack targets available."
            );
        }
        else {

            for (
                const target
                of topTargets
            ) {

                lines.push(

                    target.server
                        .padEnd(24) +

                    formatMoney(
                        ns,
                        target.expectedPerSecond
                    )
                        .padStart(16) +

                    (
                        target.hackChance *
                        100
                    )
                        .toFixed(1)
                        .concat("%")
                        .padStart(11) +

                    (
                        target.hackFraction *
                        100
                    )
                        .toFixed(2)
                        .concat("%")
                        .padStart(10) +

                    target.moneyPercent
                        .toFixed(0)
                        .concat("%")
                        .padStart(10) +

                    target.securityDelta
                        .toFixed(2)
                        .padStart(10) +

                    formatTime(
                        target.hackTime
                    )
                        .padStart(12)
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
            COLORS
        );

        const alerts =
            buildAlerts({
                rootableNow,
                contractCount,
                freeRam,
                totalMaxRam,
                ramPercent,
                targetsNeedGrow,
                targetsNeedWeaken,
                portsAvailable
            });


        if (alerts.length === 0) {

            lines.push(
                `${COLORS.brightGreen}` +
                "✓ No immediate issues detected." +
                `${COLORS.reset}`
            );
        }
        else {

            for (const alert of alerts) {

                lines.push(
                    formatAlert(
                        alert,
                        COLORS
                    )
                );
            }
        }


        // ========================================================
        // FOOTER
        // ========================================================

        lines.push("");

        lines.push(
            `${COLORS.gray}` +
            "─".repeat(
                CONFIG.width
            ) +
            `${COLORS.reset}`
        );

        lines.push(
            `${COLORS.gray}` +
            `Refresh: ${(CONFIG.refreshMs / 1000).toFixed(0)}s` +
            "  |  Target score is estimated hack income per second per thread." +
            " Grow/weaken recovery is not yet included." +
            `${COLORS.reset}`
        );


        // ========================================================
        // ANTI-FLICKER DISPLAY
        // ========================================================

        const display =
            lines.join("\n");

        if (
            display !== lastDisplay
        ) {

            ns.clearLog();

            ns.print(display);

            lastDisplay =
                display;
        }


        ns.ui.setTailTitle(
            `BITBURNER // OPS  |  ` +
            `Hack ${playerHackLevel}  |  ` +
            `${formatMoney(ns, incomePerSecond)}/sec  |  ` +
            `RAM ${ramPercent.toFixed(0)}%`
        );


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

        visited.add(server);

        servers.push(server);

        for (
            const neighbor
            of ns.scan(server)
        ) {

            scan(neighbor);
        }
    }

    scan("home");

    return servers;
}


// ================================================================
// PROCESS / TARGET DETECTION
// ================================================================

function detectTargetActivity(
    process,
    serverSet,
    activeTargets
) {

    const filename =
        process.filename
            .toLowerCase();

    let action = null;

    if (
        filename.includes("weaken")
    ) {
        action = "weaken";
    }
    else if (
        filename.includes("grow")
    ) {
        action = "grow";
    }
    else if (
        filename.includes("hack")
    ) {
        action = "hack";
    }

    if (!action) {
        return;
    }


    for (
        const arg
        of process.args
    ) {

        const target =
            String(arg);

        if (
            !serverSet.has(target)
        ) {
            continue;
        }


        if (
            !activeTargets.has(target)
        ) {

            activeTargets.set(
                target,
                {
                    hack: 0,
                    grow: 0,
                    weaken: 0,
                    threads: 0
                }
            );
        }


        const activity =
            activeTargets.get(target);

        activity[action] +=
            process.threads;

        activity.threads +=
            process.threads;

        break;
    }
}


// ================================================================
// ALERT ENGINE
// ================================================================

function buildAlerts(stats) {

    const alerts = [];


    if (
        stats.rootableNow > 0
    ) {

        alerts.push({
            level: "success",
            text:
                `${stats.rootableNow} server` +
                `${stats.rootableNow === 1 ? "" : "s"}` +
                " can be rooted now."
        });
    }


    if (
        stats.contractCount > 0
    ) {

        alerts.push({
            level: "info",
            text:
                `${stats.contractCount} coding contract` +
                `${stats.contractCount === 1 ? "" : "s"}` +
                " available."
        });
    }


    if (
        stats.totalMaxRam > 0 &&
        stats.ramPercent < 50
    ) {

        alerts.push({
            level: "warning",
            text:
                `${stats.freeRam.toFixed(2)} GB of rooted RAM is currently unused.`
        });
    }


    if (
        stats.targetsNeedGrow > 0
    ) {

        alerts.push({
            level: "warning",
            text:
                `${stats.targetsNeedGrow} active target` +
                `${stats.targetsNeedGrow === 1 ? "" : "s"}` +
                " need money recovery."
        });
    }


    if (
        stats.targetsNeedWeaken > 0
    ) {

        alerts.push({
            level: "danger",
            text:
                `${stats.targetsNeedWeaken} active target` +
                `${stats.targetsNeedWeaken === 1 ? "" : "s"}` +
                " have elevated security."
        });
    }


    if (
        stats.portsAvailable < 5
    ) {

        alerts.push({
            level: "info",
            text:
                `${5 - stats.portsAvailable} port cracker` +
                `${5 - stats.portsAvailable === 1 ? "" : "s"}` +
                " still unavailable."
        });
    }


    return alerts;
}


// ================================================================
// DISPLAY HELPERS
// ================================================================

function drawHeader(
    lines,
    config,
    colors
) {

    lines.push(
        `${colors.brightCyan}` +
        "═".repeat(config.width) +
        `${colors.reset}`
    );

    const title =
        "BITBURNER // OPERATIONS OVERVIEW";

    const padding =
        Math.max(
            0,
            Math.floor(
                (
                    config.width -
                    title.length
                ) / 2
            )
        );

    lines.push(
        `${colors.bold}` +
        `${colors.brightWhite}` +
        " ".repeat(padding) +
        title +
        `${colors.reset}`
    );

    lines.push(
        `${colors.brightCyan}` +
        "═".repeat(config.width) +
        `${colors.reset}`
    );
}


function sectionTitle(
    lines,
    title,
    config,
    colors
) {

    lines.push("");

    lines.push(
        `${colors.bold}` +
        `${colors.brightCyan}` +
        `[ ${title} ]` +
        `${colors.reset}`
    );

    lines.push(
        `${colors.gray}` +
        "─".repeat(config.width) +
        `${colors.reset}`
    );
}


function field(
    label,
    value,
    width
) {

    const text =
        `${label}: ${value}`;

    return text.padEnd(width);
}


function createRamBar(
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

    const empty =
        width - filled;

    return (
        "[" +
        "█".repeat(filled) +
        "░".repeat(empty) +
        "] " +
        `${normalized.toFixed(1)}%`
    );
}


function formatAlert(
    alert,
    colors
) {

    switch (
        alert.level
    ) {

        case "success":

            return (
                `${colors.brightGreen}` +
                "★ " +
                alert.text +
                `${colors.reset}`
            );

        case "warning":

            return (
                `${colors.brightYellow}` +
                "⚠ " +
                alert.text +
                `${colors.reset}`
            );

        case "danger":

            return (
                `${colors.brightRed}` +
                "⚠ " +
                alert.text +
                `${colors.reset}`
            );

        default:

            return (
                `${colors.brightCyan}` +
                "• " +
                alert.text +
                `${colors.reset}`
            );
    }
}


// ================================================================
// FORMATTERS
// ================================================================

function formatMoney(
    ns,
    value
) {

    return (
        "$" +
        ns.format.number(
            value,
            2
        )
    );
}


function formatTime(ms) {

    if (ms < 1000) {

        return (
            ms.toFixed(0) +
            "ms"
        );
    }

    const seconds =
        ms / 1000;

    if (seconds < 60) {

        return (
            seconds.toFixed(1) +
            "s"
        );
    }

    const minutes =
        seconds / 60;

    return (
        minutes.toFixed(1) +
        "m"
    );
}