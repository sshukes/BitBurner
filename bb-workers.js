/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ============================================================
    // BITBURNER WORKER / RAM MONITOR
    // ============================================================

    const CONFIG = {
        refreshMs: 2000,
        windowWidth: 1500,
        windowHeight: 750,
        separatorWidth: 144,
        maxTargetRows: 10
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
    // WINDOW
    // ============================================================

    ns.ui.openTail();

    ns.ui.resizeTail(
        CONFIG.windowWidth,
        CONFIG.windowHeight
    );

    ns.ui.setTailTitle(
        "BITBURNER // WORKER & RAM MONITOR"
    );

    let lastDisplay = "";

    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        const servers =
            scanNetwork(ns);

        const serverSet =
            new Set(servers);

        const workerHosts = [];

        const targetActivity =
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

        let activeHosts = 0;
        let idleHosts = 0;

        // ========================================================
        // ANALYZE ROOTED SERVERS
        // ========================================================

        for (const server of servers) {

            if (!ns.hasRootAccess(server)) {
                continue;
            }

            const maxRam =
                ns.getServerMaxRam(server);

            // Ignore servers that cannot execute scripts.
            if (maxRam <= 0) {
                continue;
            }

            const usedRam =
                ns.getServerUsedRam(server);

            const freeRam =
                Math.max(
                    0,
                    maxRam - usedRam
                );

            const utilization =
                maxRam > 0
                    ? (usedRam / maxRam) * 100
                    : 0;

            const processes =
                ns.ps(server);

            let hostThreads = 0;

            let hackThreads = 0;
            let growThreads = 0;
            let weakenThreads = 0;
            let otherThreads = 0;

            const hostTargets =
                new Set();

            // ====================================================
            // PROCESS ANALYSIS
            // ====================================================

            for (const process of processes) {

                const threads =
                    process.threads;

                hostThreads += threads;

                const action =
                    detectAction(
                        process.filename
                    );

                const target =
                    findTarget(
                        process.args,
                        serverSet
                    );

                if (action === "HACK") {

                    hackThreads +=
                        threads;

                    totalHackThreads +=
                        threads;
                }
                else if (action === "GROW") {

                    growThreads +=
                        threads;

                    totalGrowThreads +=
                        threads;
                }
                else if (action === "WEAKEN") {

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
                // TARGET ACTIVITY
                // =================================================

                if (target) {

                    hostTargets.add(target);

                    if (
                        !targetActivity.has(target)
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

                                hosts: new Set()
                            }
                        );
                    }

                    const activity =
                        targetActivity.get(target);

                    activity.processes++;

                    activity.threads +=
                        threads;

                    activity.hosts.add(
                        server
                    );

                    switch (action) {

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

            if (processes.length === 0) {

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
            // TOTALS
            // ====================================================

            totalRam += maxRam;

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

                targets:
                    [...hostTargets]
            });
        }

        // ========================================================
        // SORT WORKERS
        //
        // Active first
        // Highest used RAM next
        // Largest servers after that
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
                    "BITBURNER // WORKER & RAM MONITOR",
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
        // NETWORK SUMMARY
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
                ns.format.ram(totalRam),
                28
            ) +

            field(
                "Used",
                ns.format.ram(totalUsedRam),
                28
            ) +

            field(
                "Free",
                ns.format.ram(totalFreeRam),
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
        // WORKLOAD SUMMARY
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

        // ========================================================
        // WORKER TABLE
        // ========================================================

        sectionTitle(
            lines,
            "WORKER HOSTS",
            CONFIG,
            COLOR
        );

        const header =

            "SERVER"
                .padEnd(24) +

            "STATUS"
                .padEnd(10) +

            "USED"
                .padStart(12) +

            "MAX"
                .padStart(12) +

            "FREE"
                .padStart(12) +

            "UTIL"
                .padStart(9) +

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

            "OTHER"
                .padStart(8) +

            "TARGETS"
                .padStart(20);

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
        // WORKER ROWS
        // ========================================================

        for (
            const host
            of workerHosts
        ) {

            const statusText =
                host.status === "ACTIVE"
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
                    18
                );

            const row =

                host.server
                    .padEnd(24) +

                padColored(
                    statusText,
                    host.status.length,
                    10
                ) +

                ns.format.ram(
                    host.usedRam
                )
                    .padStart(12) +

                ns.format.ram(
                    host.maxRam
                )
                    .padStart(12) +

                ns.format.ram(
                    host.freeRam
                )
                    .padStart(12) +

                (
                    host.utilization
                        .toFixed(0) +
                    "%"
                )
                    .padStart(9) +

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

                host.otherThreads
                    .toString()
                    .padStart(8) +

                targetText
                    .padStart(20);

            lines.push(row);
        }

        // ========================================================
        // TARGET DISTRIBUTION
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
                    level: "warning",
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
                    level: "info",
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
                    level: "danger",
                    text:
                        "No Hack/Grow/Weaken worker threads detected."
                }
            );
        }

        if (
            targetRows.length === 1
        ) {

            alerts.push(
                {
                    level: "info",
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
                    "✓ Worker network appears fully utilized.",
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
                "  |  H/G/W thread counts are inferred from script filename + target arguments.",
                COLOR.gray
            )
        );

        // ========================================================
        // DISPLAY
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
        // TITLE BAR
        // ========================================================

        ns.ui.setTailTitle(
            `WORKERS  |  ` +
            `${ns.format.ram(totalUsedRam)} / ${ns.format.ram(totalRam)}  |  ` +
            `${utilization.toFixed(0)}% RAM  |  ` +
            `${totalThreads} Threads`
        );

        await ns.sleep(
            CONFIG.refreshMs
        );
    }
}


// ================================================================
// SCAN NETWORK
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
// DETECT ACTION
// ================================================================

function detectAction(filename) {

    const name =
        filename.toLowerCase();

    // Check weaken before hack because filenames can contain
    // additional descriptive text.

    if (
        name.includes("weaken")
    ) {

        return "WEAKEN";
    }

    if (
        name.includes("grow")
    ) {

        return "GROW";
    }

    if (
        name.includes("hack")
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

    if (!args) {
        return null;
    }

    for (
        const arg
        of args
    ) {

        const value =
            String(arg);

        if (
            serverSet.has(value)
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
        targets.join(",");

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
            .padEnd(width)
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
        "█".repeat(filled) +
        "░".repeat(
            width - filled
        ) +
        "] " +
        normalized.toFixed(1) +
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
        " ".repeat(padding) +
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
// PAD ANSI COLORED TEXT
//
// ANSI escape characters count as string characters, but do not
// occupy screen space. This keeps colored STATUS columns aligned.
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