/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const REFRESH_MS = 1000;

    const WINDOW_WIDTH = 1500;
    const WINDOW_HEIGHT = 750;

    const MAX_ACQUISITION_SERVERS = 10;
    const MAX_RAM_HOSTS = 12;
    const MAX_TARGETS = 10;
    const MAX_PROCESSES = 15;

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

    const portPrograms = [

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
        WINDOW_WIDTH,
        WINDOW_HEIGHT
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
            new Set(servers);

        // ========================================================
        // PLAYER
        // ========================================================

        const playerHackLevel =
            ns.getHackingLevel();

        const playerMoney =
            ns.getServerMoneyAvailable("home");

        const portsAvailable =
            portPrograms.filter(program =>
                ns.fileExists(program, "home")
            ).length;

        // ========================================================
        // COLLECTIONS
        // ========================================================

        const ramHosts = [];
        const processes = [];
        const acquisitionServers = [];

        const targetActivity =
            new Map();

        // ========================================================
        // COUNTERS
        // ========================================================

        let rootedServers = 0;
        let moneyServers = 0;

        let totalRam = 0;
        let usedRam = 0;

        let totalProcesses = 0;
        let totalThreads = 0;
        let activeHosts = 0;

        // ========================================================
        // ANALYZE NETWORK
        // ========================================================

        for (const server of servers) {

            const data =
                ns.getServer(server);

            const rooted =
                data.hasAdminRights;

            const maxRam =
                data.maxRam ?? 0;

            const serverUsedRam =
                data.ramUsed ?? 0;

            const maxMoney =
                data.moneyMax ?? 0;

            // ====================================================
            // NETWORK COUNTS
            // ====================================================

            if (rooted) {
                rootedServers++;
            }

            if (maxMoney > 0) {
                moneyServers++;
            }

            // ====================================================
            // SERVER ACQUISITION
            // ====================================================

            if (
                server !== "home" &&
                !rooted
            ) {

                const hackLevel =
                    data.requiredHackingSkill ?? 0;

                const portsNeeded =
                    data.numOpenPortsRequired ?? 0;

                const canHack =
                    playerHackLevel >=
                    hackLevel;

                const canNuke =
                    portsAvailable >=
                    portsNeeded;

                let status =
                    "READY";

                if (
                    !canHack &&
                    !canNuke
                ) {

                    status =
                        "HACK + PORTS";
                }
                else if (
                    !canHack
                ) {

                    status =
                        "HACK LEVEL";
                }
                else if (
                    !canNuke
                ) {

                    status =
                        "PORTS";
                }

                acquisitionServers.push({

                    server,

                    hackLevel,

                    portsNeeded,

                    maxMoney,

                    canHack,

                    canNuke,

                    status
                });
            }

            // ====================================================
            // PROCESSES
            // ====================================================

            let serverProcesses = [];

            try {

                serverProcesses =
                    ns.ps(server);

            }
            catch {

                serverProcesses = [];
            }

            if (
                serverProcesses.length > 0
            ) {

                activeHosts++;
            }

            // ====================================================
            // RAM HOSTS
            //
            // Only rooted RAM is actually usable.
            // ====================================================

            if (
                rooted &&
                maxRam > 0
            ) {

                const freeRam =
                    Math.max(
                        0,
                        maxRam -
                        serverUsedRam
                    );

                const ramPercent =
                    maxRam > 0
                        ? (
                            serverUsedRam /
                            maxRam
                        ) * 100
                        : 0;

                let hostThreads = 0;

                for (
                    const process
                    of serverProcesses
                ) {

                    hostThreads +=
                        process.threads;
                }

                ramHosts.push({

                    server,

                    maxRam,

                    usedRam:
                        serverUsedRam,

                    freeRam,

                    ramPercent,

                    processes:
                        serverProcesses.length,

                    threads:
                        hostThreads
                });

                totalRam +=
                    maxRam;

                usedRam +=
                    serverUsedRam;
            }

            // ====================================================
            // PROCESS ANALYSIS
            // ====================================================

            for (
                const process
                of serverProcesses
            ) {

                totalProcesses++;

                totalThreads +=
                    process.threads;

                // ------------------------------------------------
                // TARGET
                // ------------------------------------------------

                let target = "-";

                for (
                    const arg
                    of process.args
                ) {

                    const possibleTarget =
                        String(arg);

                    if (
                        serverSet.has(
                            possibleTarget
                        )
                    ) {

                        target =
                            possibleTarget;

                        break;
                    }
                }

                // ------------------------------------------------
                // SCRIPT RAM
                // ------------------------------------------------

                let scriptRam = 0;

                try {

                    scriptRam =
                        ns.getScriptRam(
                            process.filename,
                            server
                        );

                }
                catch {

                    scriptRam = 0;
                }

                const processRam =
                    scriptRam *
                    process.threads;

                // ------------------------------------------------
                // STORE PROCESS
                // ------------------------------------------------

                processes.push({

                    host:
                        server,

                    script:
                        process.filename,

                    target,

                    threads:
                        process.threads,

                    ram:
                        processRam,

                    pid:
                        process.pid
                });

                // ------------------------------------------------
                // DETECT HACK / GROW / WEAKEN
                // ------------------------------------------------

                const filename =
                    process.filename
                        .toLowerCase();

                let action = null;

                if (
                    filename.includes(
                        "weaken"
                    )
                ) {

                    action = "weaken";
                }
                else if (
                    filename.includes(
                        "grow"
                    )
                ) {

                    action = "grow";
                }
                else if (
                    filename.includes(
                        "hack"
                    )
                ) {

                    action = "hack";
                }

                if (
                    !action ||
                    target === "-"
                ) {

                    continue;
                }

                // ------------------------------------------------
                // TARGET ACTIVITY
                // ------------------------------------------------

                if (
                    !targetActivity.has(
                        target
                    )
                ) {

                    targetActivity.set(
                        target,
                        {
                            hack: 0,
                            grow: 0,
                            weaken: 0,

                            hackThreads: 0,
                            growThreads: 0,
                            weakenThreads: 0,

                            totalThreads: 0,

                            hosts:
                                new Set()
                        }
                    );
                }

                const activity =
                    targetActivity.get(
                        target
                    );

                activity[action]++;

                if (
                    action === "hack"
                ) {

                    activity.hackThreads +=
                        process.threads;
                }

                if (
                    action === "grow"
                ) {

                    activity.growThreads +=
                        process.threads;
                }

                if (
                    action === "weaken"
                ) {

                    activity.weakenThreads +=
                        process.threads;
                }

                activity.totalThreads +=
                    process.threads;

                activity.hosts.add(
                    server
                );
            }
        }

        // ========================================================
        // GLOBAL RAM
        // ========================================================

        const freeRam =
            Math.max(
                0,
                totalRam -
                usedRam
            );

        const ramPercent =
            totalRam > 0
                ? (
                    usedRam /
                    totalRam
                ) * 100
                : 0;

        // ========================================================
        // ACTIVE TARGETS
        // ========================================================

        const activeTargets = [];

        for (
            const [
                target,
                activity
            ]
            of targetActivity
        ) {

            const data =
                ns.getServer(target);

            const maxMoney =
                data.moneyMax ?? 0;

            const money =
                data.moneyAvailable ?? 0;

            const moneyPercent =
                maxMoney > 0
                    ? (
                        money /
                        maxMoney
                    ) * 100
                    : 0;

            const security =
                data.hackDifficulty ?? 0;

            const minSecurity =
                data.minDifficulty ?? 0;

            activeTargets.push({

                target,

                hack:
                    activity.hack,

                grow:
                    activity.grow,

                weaken:
                    activity.weaken,

                hackThreads:
                    activity.hackThreads,

                growThreads:
                    activity.growThreads,

                weakenThreads:
                    activity.weakenThreads,

                totalThreads:
                    activity.totalThreads,

                hosts:
                    activity.hosts.size,

                moneyPercent,

                security,

                minSecurity,

                securityDelta:
                    security -
                    minSecurity
            });
        }

        // ========================================================
        // SORTING
        // ========================================================

        acquisitionServers.sort(
            (a, b) => {

                if (
                    a.hackLevel !==
                    b.hackLevel
                ) {

                    return (
                        a.hackLevel -
                        b.hackLevel
                    );
                }

                if (
                    a.portsNeeded !==
                    b.portsNeeded
                ) {

                    return (
                        a.portsNeeded -
                        b.portsNeeded
                    );
                }

                return (
                    b.maxMoney -
                    a.maxMoney
                );
            }
        );

        ramHosts.sort(
            (a, b) =>
                b.freeRam -
                a.freeRam
        );

        activeTargets.sort(
            (a, b) =>
                b.totalThreads -
                a.totalThreads
        );

        processes.sort(
            (a, b) =>
                b.ram -
                a.ram
        );

        // ========================================================
        // DISPLAY
        // ========================================================

        const lines = [];

        const WIDTH = 138;

        // ========================================================
        // TITLE
        // ========================================================

        lines.push("");

        lines.push(
            color(
                "═".repeat(WIDTH),
                COLOR.brightCyan
            )
        );

        lines.push(
            color(
                " BITBURNER // CONTROL CENTER",
                COLOR.bold +
                COLOR.brightCyan
            )
        );

        lines.push(
            color(
                "═".repeat(WIDTH),
                COLOR.brightCyan
            )
        );

        // ========================================================
        // PLAYER
        // ========================================================

        section(
            lines,
            "PLAYER",
            WIDTH,
            COLOR
        );

        lines.push(

            color(
                "Hack Level: ",
                COLOR.gray
            ) +

            color(
                String(
                    playerHackLevel
                ).padEnd(15),
                COLOR.brightYellow
            ) +

            color(
                "Money: ",
                COLOR.gray
            ) +

            color(
                formatMoney(
                    ns,
                    playerMoney
                ).padEnd(24),
                COLOR.brightGreen
            ) +

            color(
                "Port Crackers: ",
                COLOR.gray
            ) +

            color(
                `${portsAvailable}/5`,
                portsAvailable === 5
                    ? COLOR.brightGreen
                    : COLOR.brightCyan
            )
        );

        // ========================================================
        // NETWORK SUMMARY
        // ========================================================

        section(
            lines,
            "NETWORK SUMMARY",
            WIDTH,
            COLOR
        );

        lines.push(

            color(
                "Servers: ",
                COLOR.gray
            ) +

            color(
                String(
                    servers.length
                ).padEnd(15),
                COLOR.brightCyan
            ) +

            color(
                "Rooted: ",
                COLOR.gray
            ) +

            color(
                String(
                    rootedServers
                ).padEnd(15),
                COLOR.brightGreen
            ) +

            color(
                "Money Targets: ",
                COLOR.gray
            ) +

            color(
                String(
                    moneyServers
                ).padEnd(15),
                COLOR.brightYellow
            ) +

            color(
                "RAM Hosts: ",
                COLOR.gray
            ) +

            color(
                String(
                    ramHosts.length
                ),
                COLOR.brightCyan
            )
        );

        // ========================================================
        // RAM SUMMARY
        // ========================================================

        section(
            lines,
            "RAM SUMMARY",
            WIDTH,
            COLOR
        );

        lines.push(

            color(
                "Total: ",
                COLOR.gray
            ) +

            color(
                ns.format.ram(
                    totalRam
                ).padEnd(18),
                COLOR.brightCyan
            ) +

            color(
                "Used: ",
                COLOR.gray
            ) +

            color(
                ns.format.ram(
                    usedRam
                ).padEnd(18),
                getRamColor(
                    ramPercent,
                    COLOR
                )
            ) +

            color(
                "Free: ",
                COLOR.gray
            ) +

            color(
                ns.format.ram(
                    freeRam
                ).padEnd(18),
                COLOR.brightGreen
            ) +

            color(
                "Utilization: ",
                COLOR.gray
            ) +

            color(
                `${ramPercent.toFixed(1)}%`,
                getRamColor(
                    ramPercent,
                    COLOR
                )
            )
        );

        // ========================================================
        // SERVER ACQUISITION
        // ========================================================

        section(
            lines,
            "SERVER ACQUISITION",
            WIDTH,
            COLOR
        );

        lines.push(
            color(
                " # ".padEnd(5) +
                "SERVER".padEnd(25) +
                "HACK".padStart(8) +
                "PORTS".padStart(8) +
                "MAX MONEY".padStart(18) +
                "STATUS".padStart(20),
                COLOR.bold +
                COLOR.brightWhite
            )
        );

        lines.push(
            color(
                "─".repeat(WIDTH),
                COLOR.gray
            )
        );

        const acquisitionList =
            acquisitionServers.slice(
                0,
                MAX_ACQUISITION_SERVERS
            );

        let acquisitionIndex = 1;

        for (
            const data
            of acquisitionList
        ) {

            lines.push(

                color(
                    acquisitionIndex
                        .toString()
                        .padStart(2) +
                    "   ",
                    COLOR.gray
                ) +

                color(
                    data.server
                        .padEnd(25),
                    COLOR.brightCyan
                ) +

                color(
                    data.hackLevel
                        .toString()
                        .padStart(8),
                    data.canHack
                        ? COLOR.brightGreen
                        : COLOR.brightRed
                ) +

                color(
                    data.portsNeeded
                        .toString()
                        .padStart(8),
                    data.canNuke
                        ? COLOR.brightGreen
                        : COLOR.brightRed
                ) +

                color(
                    formatMoney(
                        ns,
                        data.maxMoney
                    ).padStart(18),
                    data.maxMoney > 0
                        ? COLOR.brightGreen
                        : COLOR.gray
                ) +

                color(
                    data.status
                        .padStart(20),
                    getAcquisitionStatusColor(
                        data.status,
                        COLOR
                    )
                )
            );

            acquisitionIndex++;
        }

        if (
            acquisitionServers.length === 0
        ) {

            lines.push(
                color(
                    "All discovered servers are rooted.",
                    COLOR.brightGreen
                )
            );
        }

        const readyServers =
            acquisitionServers.filter(
                server =>
                    server.canHack &&
                    server.canNuke
            ).length;

        lines.push("");

        lines.push(

            color(
                "Unrooted: ",
                COLOR.gray
            ) +

            color(
                String(
                    acquisitionServers.length
                ).padEnd(10),
                COLOR.brightYellow
            ) +

            color(
                "Ready now: ",
                COLOR.gray
            ) +

            color(
                String(
                    readyServers
                ),
                readyServers > 0
                    ? COLOR.brightGreen
                    : COLOR.gray
            )
        );

        // ========================================================
        // RAM HOSTS
        // ========================================================

        section(
            lines,
            "RAM HOSTS",
            WIDTH,
            COLOR
        );

        lines.push(
            color(
                "HOST".padEnd(27) +
                "USED".padStart(14) +
                "FREE".padStart(14) +
                "MAX".padStart(14) +
                "UTIL %".padStart(10) +
                "PROCS".padStart(9) +
                "THREADS".padStart(10),
                COLOR.bold +
                COLOR.brightWhite
            )
        );

        lines.push(
            color(
                "─".repeat(WIDTH),
                COLOR.gray
            )
        );

        for (
            const host
            of ramHosts.slice(
                0,
                MAX_RAM_HOSTS
            )
        ) {

            lines.push(

                color(
                    truncate(
                        host.server,
                        26
                    ).padEnd(27),
                    COLOR.brightCyan
                ) +

                color(
                    ns.format.ram(
                        host.usedRam
                    ).padStart(14),
                    host.usedRam > 0
                        ? COLOR.brightYellow
                        : COLOR.gray
                ) +

                color(
                    ns.format.ram(
                        host.freeRam
                    ).padStart(14),
                    host.freeRam > 0
                        ? COLOR.brightGreen
                        : COLOR.brightRed
                ) +

                color(
                    ns.format.ram(
                        host.maxRam
                    ).padStart(14),
                    COLOR.brightCyan
                ) +

                color(
                    (
                        host.ramPercent
                            .toFixed(1) +
                        "%"
                    ).padStart(10),
                    getRamColor(
                        host.ramPercent,
                        COLOR
                    )
                ) +

                color(
                    host.processes
                        .toString()
                        .padStart(9),
                    host.processes > 0
                        ? COLOR.white
                        : COLOR.gray
                ) +

                color(
                    host.threads
                        .toString()
                        .padStart(10),
                    host.threads > 0
                        ? COLOR.brightWhite
                        : COLOR.gray
                )
            );
        }

        // ========================================================
        // ACTIVE TARGETS
        // ========================================================

        section(
            lines,
            "ACTIVE TARGETS",
            WIDTH,
            COLOR
        );

        lines.push(
            color(
                "TARGET".padEnd(24) +
                "HACK".padStart(7) +
                "GROW".padStart(7) +
                "WEAK".padStart(7) +
                "THREADS".padStart(10) +
                "HOSTS".padStart(8) +
                "MONEY".padStart(10) +
                "SEC".padStart(10) +
                "MIN".padStart(10) +
                "SEC +".padStart(10),
                COLOR.bold +
                COLOR.brightWhite
            )
        );

        lines.push(
            color(
                "─".repeat(WIDTH),
                COLOR.gray
            )
        );

        for (
            const target
            of activeTargets.slice(
                0,
                MAX_TARGETS
            )
        ) {

            lines.push(

                color(
                    target.target
                        .padEnd(24),
                    COLOR.brightCyan
                ) +

                color(
                    target.hack
                        .toString()
                        .padStart(7),
                    target.hack > 0
                        ? COLOR.brightRed
                        : COLOR.gray
                ) +

                color(
                    target.grow
                        .toString()
                        .padStart(7),
                    target.grow > 0
                        ? COLOR.brightYellow
                        : COLOR.gray
                ) +

                color(
                    target.weaken
                        .toString()
                        .padStart(7),
                    target.weaken > 0
                        ? COLOR.brightGreen
                        : COLOR.gray
                ) +

                color(
                    target.totalThreads
                        .toString()
                        .padStart(10),
                    COLOR.brightWhite
                ) +

                color(
                    target.hosts
                        .toString()
                        .padStart(8),
                    COLOR.white
                ) +

                color(
                    (
                        target.moneyPercent
                            .toFixed(1) +
                        "%"
                    ).padStart(10),
                    getMoneyColor(
                        target.moneyPercent,
                        COLOR
                    )
                ) +

                color(
                    target.security
                        .toFixed(2)
                        .padStart(10),
                    getSecurityColor(
                        target.securityDelta,
                        COLOR
                    )
                ) +

                color(
                    target.minSecurity
                        .toFixed(2)
                        .padStart(10),
                    COLOR.brightGreen
                ) +

                color(
                    target.securityDelta
                        .toFixed(2)
                        .padStart(10),
                    getSecurityColor(
                        target.securityDelta,
                        COLOR
                    )
                )
            );
        }

        if (
            activeTargets.length === 0
        ) {

            lines.push(
                color(
                    "No active hack/grow/weaken targets.",
                    COLOR.gray
                )
            );
        }

        // ========================================================
        // RUNNING PROCESSES
        // ========================================================

        section(
            lines,
            "RUNNING PROCESSES",
            WIDTH,
            COLOR
        );

        lines.push(
            color(
                "HOST".padEnd(22) +
                "SCRIPT".padEnd(30) +
                "TARGET".padEnd(22) +
                "THREADS".padStart(10) +
                "RAM".padStart(14) +
                "PID".padStart(12),
                COLOR.bold +
                COLOR.brightWhite
            )
        );

        lines.push(
            color(
                "─".repeat(WIDTH),
                COLOR.gray
            )
        );

        for (
            const process
            of processes.slice(
                0,
                MAX_PROCESSES
            )
        ) {

            const actionColor =
                getScriptColor(
                    process.script,
                    COLOR
                );

            lines.push(

                color(
                    truncate(
                        process.host,
                        21
                    ).padEnd(22),
                    COLOR.brightCyan
                ) +

                color(
                    truncate(
                        process.script,
                        29
                    ).padEnd(30),
                    actionColor
                ) +

                color(
                    truncate(
                        process.target,
                        21
                    ).padEnd(22),
                    process.target === "-"
                        ? COLOR.gray
                        : COLOR.brightYellow
                ) +

                color(
                    process.threads
                        .toString()
                        .padStart(10),
                    COLOR.brightWhite
                ) +

                color(
                    ns.format.ram(
                        process.ram
                    ).padStart(14),
                    COLOR.brightGreen
                ) +

                color(
                    process.pid
                        .toString()
                        .padStart(12),
                    COLOR.gray
                )
            );
        }

        if (
            processes.length === 0
        ) {

            lines.push(
                color(
                    "No scripts currently running.",
                    COLOR.gray
                )
            );
        }

        // ========================================================
        // FOOTER
        // ========================================================

        lines.push("");

        lines.push(
            color(
                "═".repeat(WIDTH),
                COLOR.brightCyan
            )
        );

        lines.push(

            color(
                "Processes: ",
                COLOR.gray
            ) +

            color(
                String(
                    totalProcesses
                ).padEnd(10),
                COLOR.brightWhite
            ) +

            color(
                "Threads: ",
                COLOR.gray
            ) +

            color(
                String(
                    totalThreads
                ).padEnd(10),
                COLOR.brightWhite
            ) +

            color(
                "Active Hosts: ",
                COLOR.gray
            ) +

            color(
                String(
                    activeHosts
                ).padEnd(10),
                COLOR.brightCyan
            ) +

            color(
                "Targets: ",
                COLOR.gray
            ) +

            color(
                String(
                    activeTargets.length
                ).padEnd(10),
                COLOR.brightYellow
            ) +

            color(
                `Refresh: ${REFRESH_MS / 1000}s`,
                COLOR.gray
            )
        );

        // ========================================================
        // DISPLAY WITHOUT FLASHING
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

            `CONTROL CENTER  |  ` +

            `Hack ${playerHackLevel}  |  ` +

            `${rootedServers}/${servers.length} Rooted  |  ` +

            `${totalProcesses} Processes  |  ` +

            `RAM ${ramPercent.toFixed(0)}%`
        );

        await ns.sleep(
            REFRESH_MS
        );
    }
}


// =================================================================
// NETWORK SCANNER
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
// COLOR OUTPUT
// =================================================================

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


// =================================================================
// SECTION HEADER
// =================================================================

function section(
    lines,
    title,
    width,
    COLOR
) {

    lines.push("");

    lines.push(
        color(
            title,
            COLOR.bold +
            COLOR.brightCyan
        )
    );

    lines.push(
        color(
            "─".repeat(width),
            COLOR.gray
        )
    );
}


// =================================================================
// RAM COLOR
// =================================================================

function getRamColor(
    percent,
    COLOR
) {

    if (
        percent < 70
    ) {

        return COLOR.brightGreen;
    }

    if (
        percent < 90
    ) {

        return COLOR.brightYellow;
    }

    return COLOR.brightRed;
}


// =================================================================
// MONEY COLOR
// =================================================================

function getMoneyColor(
    percent,
    COLOR
) {

    if (
        percent >= 75
    ) {

        return COLOR.brightGreen;
    }

    if (
        percent >= 25
    ) {

        return COLOR.brightYellow;
    }

    return COLOR.brightRed;
}


// =================================================================
// SECURITY COLOR
// =================================================================

function getSecurityColor(
    difference,
    COLOR
) {

    if (
        difference <= 1
    ) {

        return COLOR.brightGreen;
    }

    if (
        difference <= 5
    ) {

        return COLOR.brightYellow;
    }

    return COLOR.brightRed;
}


// =================================================================
// SERVER ACQUISITION STATUS
// =================================================================

function getAcquisitionStatusColor(
    status,
    COLOR
) {

    if (
        status === "READY"
    ) {

        return COLOR.brightGreen;
    }

    if (
        status === "PORTS"
    ) {

        return COLOR.brightYellow;
    }

    if (
        status === "HACK LEVEL"
    ) {

        return COLOR.brightYellow;
    }

    return COLOR.brightRed;
}


// =================================================================
// SCRIPT COLOR
// =================================================================

function getScriptColor(
    filename,
    COLOR
) {

    const name =
        filename.toLowerCase();

    if (
        name.includes(
            "weaken"
        )
    ) {

        return COLOR.brightGreen;
    }

    if (
        name.includes(
            "grow"
        )
    ) {

        return COLOR.brightYellow;
    }

    if (
        name.includes(
            "hack"
        )
    ) {

        return COLOR.brightRed;
    }

    return COLOR.white;
}


// =================================================================
// MONEY FORMAT
// =================================================================

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


// =================================================================
// TRUNCATE
// =================================================================

function truncate(
    value,
    maxLength
) {

    const text =
        String(value);

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