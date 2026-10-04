/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");

    // ============================================================
    // CONFIGURATION
    // ============================================================

    // RAM reserved on home for dashboards / utilities / controller
    const HOME_RAM_RESERVE = 32;

    // Percentage of target money to steal during each hack cycle
    const HACK_FRACTION = 0.10;

    // Grow target when money falls below this percentage
    const MONEY_READY_PERCENT = 0.90;

    // Security is considered prepared within this amount of minimum
    const SECURITY_TOLERANCE = 1.0;

    // Reconsider target every 2 minutes
    const TARGET_REEVALUATE_MS = 120000;

    // Small pause between completed cycles
    const LOOP_DELAY = 500;

    // ============================================================
    // WORKER FILENAMES
    // ============================================================

    const HACK_SCRIPT = "worker-hack.js";
    const GROW_SCRIPT = "worker-grow.js";
    const WEAKEN_SCRIPT = "worker-weaken.js";

    // ============================================================
    // WORKER CODE
    // ============================================================

    const hackWorkerCode =
`/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);
    await ns.hack(target);
}
`;

    const growWorkerCode =
`/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);
    await ns.grow(target);
}
`;

    const weakenWorkerCode =
`/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);
    await ns.weaken(target);
}
`;

    // ============================================================
    // CREATE / UPDATE WORKER FILES
    // ============================================================

    await ensureWorker(
        ns,
        HACK_SCRIPT,
        hackWorkerCode
    );

    await ensureWorker(
        ns,
        GROW_SCRIPT,
        growWorkerCode
    );

    await ensureWorker(
        ns,
        WEAKEN_SCRIPT,
        weakenWorkerCode
    );

    // ============================================================
    // UI SETUP
    // ============================================================

    ns.ui.openTail();

    ns.ui.resizeTail(
        1200,
        600
    );

    ns.ui.setTailTitle(
        "BITBURNER // CENTRAL HACKING CONTROLLER"
    );

    // ============================================================
    // CONTROLLER STATE
    // ============================================================

    let currentTarget = null;

    let lastTargetSelection = 0;

    let hackCycles = 0;

    let totalRooted = 0;

    let currentStage = "STARTING";

    let lastDisplay = "";

    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        // ========================================================
        // SCAN NETWORK
        // ========================================================

        const servers =
            scanNetwork(ns);

        // ========================================================
        // ROOT EVERYTHING CURRENTLY AVAILABLE
        // ========================================================

        const newlyRooted =
            await rootAvailableServers(
                ns,
                servers
            );

        totalRooted +=
            newlyRooted;

        // ========================================================
        // BUILD RAM WORKER POOL
        // ========================================================

        const workerServers =
            getWorkerServers(
                ns,
                servers,
                HOME_RAM_RESERVE
            );

        // ========================================================
        // DETERMINE WHETHER TARGET NEEDS TO CHANGE
        // ========================================================

        const now =
            Date.now();

        let chooseNewTarget =
            false;

        if (!currentTarget) {

            chooseNewTarget =
                true;

        } else if (
            !ns.serverExists(
                currentTarget
            )
        ) {

            chooseNewTarget =
                true;

        } else if (
            !ns.hasRootAccess(
                currentTarget
            )
        ) {

            chooseNewTarget =
                true;

        } else if (
            ns.getServerRequiredHackingLevel(
                currentTarget
            ) >
            ns.getHackingLevel()
        ) {

            chooseNewTarget =
                true;
        }

        // ========================================================
        // PERIODIC TARGET RE-EVALUATION
        // ========================================================

        if (
            !chooseNewTarget &&
            now - lastTargetSelection >=
            TARGET_REEVALUATE_MS
        ) {

            const money =
                ns.getServerMoneyAvailable(
                    currentTarget
                );

            const maxMoney =
                ns.getServerMaxMoney(
                    currentTarget
                );

            const security =
                ns.getServerSecurityLevel(
                    currentTarget
                );

            const minSecurity =
                ns.getServerMinSecurityLevel(
                    currentTarget
                );

            const moneyPercent =
                maxMoney > 0
                    ? money / maxMoney
                    : 0;

            // Only switch away when the existing target is
            // reasonably prepared.
            if (
                moneyPercent >=
                    MONEY_READY_PERCENT &&
                security <=
                    minSecurity +
                    SECURITY_TOLERANCE
            ) {

                chooseNewTarget =
                    true;
            }
        }

        // ========================================================
        // SELECT BEST TARGET
        // ========================================================

        if (chooseNewTarget) {

            const bestTarget =
                chooseBestTarget(
                    ns,
                    servers
                );

            if (bestTarget) {

                currentTarget =
                    bestTarget.server;

                lastTargetSelection =
                    now;

                currentStage =
                    "TARGET SELECTED";
            }
        }

        // ========================================================
        // NO TARGET AVAILABLE
        // ========================================================

        if (!currentTarget) {

            currentStage =
                "WAITING FOR TARGET";

            lastDisplay =
                updateDashboard(
                    ns,
                    {
                        servers,
                        workerServers,
                        currentTarget,
                        currentStage,
                        hackCycles,
                        newlyRooted,
                        totalRooted,
                        HOME_RAM_RESERVE,
                        HACK_FRACTION
                    },
                    lastDisplay
                );

            await ns.sleep(
                2000
            );

            continue;
        }

        // ========================================================
        // READ CURRENT TARGET STATE
        // ========================================================

        const target =
            ns.getServer(
                currentTarget
            );

        const money =
            target.moneyAvailable ??
            0;

        const maxMoney =
            target.moneyMax ??
            0;

        const security =
            target.hackDifficulty ??
            0;

        const minSecurity =
            target.minDifficulty ??
            0;

        const moneyPercent =
            maxMoney > 0
                ? money / maxMoney
                : 0;

        const securityDifference =
            security -
            minSecurity;

        // ========================================================
        // STAGE 1
        // WEAKEN
        // ========================================================

        if (
            securityDifference >
            SECURITY_TOLERANCE
        ) {

            currentStage =
                "WEAKEN";

            const weakenPerThread =
                ns.weakenAnalyze(1);

            let threadsNeeded =
                Math.ceil(
                    securityDifference /
                    weakenPerThread
                );

            threadsNeeded =
                Math.max(
                    1,
                    threadsNeeded
                );

            lastDisplay =
                updateDashboard(
                    ns,
                    {
                        servers,
                        workerServers,
                        currentTarget,
                        currentStage,
                        hackCycles,
                        newlyRooted,
                        totalRooted,
                        HOME_RAM_RESERVE,
                        HACK_FRACTION,
                        threadsNeeded
                    },
                    lastDisplay
                );

            const jobs =
                await deployThreads(
                    ns,
                    workerServers,
                    WEAKEN_SCRIPT,
                    currentTarget,
                    threadsNeeded,
                    HOME_RAM_RESERVE
                );

            if (
                jobs.length === 0
            ) {

                currentStage =
                    "WAITING FOR RAM";

                lastDisplay =
                    updateDashboard(
                        ns,
                        {
                            servers,
                            workerServers,
                            currentTarget,
                            currentStage,
                            hackCycles,
                            newlyRooted,
                            totalRooted,
                            HOME_RAM_RESERVE,
                            HACK_FRACTION,
                            threadsNeeded
                        },
                        lastDisplay
                    );

                await ns.sleep(
                    2000
                );

                continue;
            }

            await waitForJobs(
                ns,
                jobs
            );

            continue;
        }

        // ========================================================
        // STAGE 2
        // GROW
        // ========================================================

        if (
            moneyPercent <
            MONEY_READY_PERCENT
        ) {

            currentStage =
                "GROW";

            let multiplier;

            // growthAnalyze does not behave nicely when money
            // is exactly zero, so use maxMoney as a large multiplier.
            if (
                money <= 1
            ) {

                multiplier =
                    Math.max(
                        1.01,
                        maxMoney
                    );

            } else {

                multiplier =
                    maxMoney /
                    money;
            }

            multiplier =
                Math.max(
                    multiplier,
                    1.01
                );

            let threadsNeeded;

            try {

                threadsNeeded =
                    Math.ceil(
                        ns.growthAnalyze(
                            currentTarget,
                            multiplier
                        )
                    );

            } catch {

                threadsNeeded =
                    Number.MAX_SAFE_INTEGER;
            }

            if (
                !Number.isFinite(
                    threadsNeeded
                ) ||
                threadsNeeded <= 0
            ) {

                threadsNeeded =
                    Number.MAX_SAFE_INTEGER;
            }

            lastDisplay =
                updateDashboard(
                    ns,
                    {
                        servers,
                        workerServers,
                        currentTarget,
                        currentStage,
                        hackCycles,
                        newlyRooted,
                        totalRooted,
                        HOME_RAM_RESERVE,
                        HACK_FRACTION,
                        threadsNeeded
                    },
                    lastDisplay
                );

            const jobs =
                await deployThreads(
                    ns,
                    workerServers,
                    GROW_SCRIPT,
                    currentTarget,
                    threadsNeeded,
                    HOME_RAM_RESERVE
                );

            if (
                jobs.length === 0
            ) {

                currentStage =
                    "WAITING FOR RAM";

                lastDisplay =
                    updateDashboard(
                        ns,
                        {
                            servers,
                            workerServers,
                            currentTarget,
                            currentStage,
                            hackCycles,
                            newlyRooted,
                            totalRooted,
                            HOME_RAM_RESERVE,
                            HACK_FRACTION,
                            threadsNeeded
                        },
                        lastDisplay
                    );

                await ns.sleep(
                    2000
                );

                continue;
            }

            await waitForJobs(
                ns,
                jobs
            );

            continue;
        }

        // ========================================================
        // STAGE 3
        // HACK
        // ========================================================

        currentStage =
            "HACK";

        const hackPercentPerThread =
            ns.hackAnalyze(
                currentTarget
            );

        if (
            hackPercentPerThread <= 0
        ) {

            currentTarget =
                null;

            await ns.sleep(
                1000
            );

            continue;
        }

        let hackThreads =
            Math.floor(
                HACK_FRACTION /
                hackPercentPerThread
            );

        hackThreads =
            Math.max(
                1,
                hackThreads
            );

        lastDisplay =
            updateDashboard(
                ns,
                {
                    servers,
                    workerServers,
                    currentTarget,
                    currentStage,
                    hackCycles,
                    newlyRooted,
                    totalRooted,
                    HOME_RAM_RESERVE,
                    HACK_FRACTION,
                    threadsNeeded:
                        hackThreads
                },
                lastDisplay
            );

        const jobs =
            await deployThreads(
                ns,
                workerServers,
                HACK_SCRIPT,
                currentTarget,
                hackThreads,
                HOME_RAM_RESERVE
            );

        if (
            jobs.length === 0
        ) {

            currentStage =
                "WAITING FOR RAM";

            lastDisplay =
                updateDashboard(
                    ns,
                    {
                        servers,
                        workerServers,
                        currentTarget,
                        currentStage,
                        hackCycles,
                        newlyRooted,
                        totalRooted,
                        HOME_RAM_RESERVE,
                        HACK_FRACTION,
                        threadsNeeded:
                            hackThreads
                    },
                    lastDisplay
                );

            await ns.sleep(
                2000
            );

            continue;
        }

        await waitForJobs(
            ns,
            jobs
        );

        hackCycles++;

        await ns.sleep(
            LOOP_DELAY
        );
    }
}


// ================================================================
// CREATE / UPDATE WORKER FILE
// ================================================================

async function ensureWorker(
    ns,
    filename,
    contents
) {

    let existing =
        "";

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


// ================================================================
// NETWORK SCANNER
// ================================================================

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


// ================================================================
// ROOT AVAILABLE SERVERS
// ================================================================

async function rootAvailableServers(
    ns,
    servers
) {

    let rooted =
        0;

    for (
        const server
        of servers
    ) {

        if (
            server ===
            "home"
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

        let availablePorts =
            0;

        // ========================================================
        // SSH
        // ========================================================

        if (
            ns.fileExists(
                "BruteSSH.exe",
                "home"
            )
        ) {

            availablePorts++;

            try {

                ns.brutessh(
                    server
                );

            } catch {}
        }

        // ========================================================
        // FTP
        // ========================================================

        if (
            ns.fileExists(
                "FTPCrack.exe",
                "home"
            )
        ) {

            availablePorts++;

            try {

                ns.ftpcrack(
                    server
                );

            } catch {}
        }

        // ========================================================
        // SMTP
        // ========================================================

        if (
            ns.fileExists(
                "relaySMTP.exe",
                "home"
            )
        ) {

            availablePorts++;

            try {

                ns.relaysmtp(
                    server
                );

            } catch {}
        }

        // ========================================================
        // HTTP
        // ========================================================

        if (
            ns.fileExists(
                "HTTPWorm.exe",
                "home"
            )
        ) {

            availablePorts++;

            try {

                ns.httpworm(
                    server
                );

            } catch {}
        }

        // ========================================================
        // SQL
        // ========================================================

        if (
            ns.fileExists(
                "SQLInject.exe",
                "home"
            )
        ) {

            availablePorts++;

            try {

                ns.sqlinject(
                    server
                );

            } catch {}
        }

        // ========================================================
        // NUKE
        // ========================================================

        if (
            availablePorts >=
            portsRequired
        ) {

            try {

                ns.nuke(
                    server
                );

                if (
                    ns.hasRootAccess(
                        server
                    )
                ) {

                    rooted++;

                    ns.toast(
                        `Rooted ${server}`,
                        "success",
                        2500
                    );
                }

            } catch {}
        }
    }

    return rooted;
}


// ================================================================
// BUILD WORKER SERVER LIST
// ================================================================

function getWorkerServers(
    ns,
    servers,
    homeReserve
) {

    const workers =
        [];

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

        let freeRam =
            maxRam -
            usedRam;

        if (
            server ===
            "home"
        ) {

            freeRam -=
                homeReserve;
        }

        freeRam =
            Math.max(
                0,
                freeRam
            );

        workers.push({
            server,
            maxRam,
            usedRam,
            freeRam
        });
    }

    // Highest available RAM first
    workers.sort(
        (a, b) =>
            b.freeRam -
            a.freeRam
    );

    return workers;
}


// ================================================================
// CHOOSE BEST TARGET
// ================================================================

function chooseBestTarget(
    ns,
    servers
) {

    const playerHack =
        ns.getHackingLevel();

    const candidates =
        [];

    for (
        const server
        of servers
    ) {

        if (
            server ===
            "home"
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

        const requiredHack =
            ns.getServerRequiredHackingLevel(
                server
            );

        if (
            requiredHack >
            playerHack
        ) {

            continue;
        }

        const maxMoney =
            ns.getServerMaxMoney(
                server
            );

        if (
            maxMoney <= 0
        ) {

            continue;
        }

        const hackTime =
            ns.getHackTime(
                server
            );

        const hackPercent =
            ns.hackAnalyze(
                server
            );

        const hackChance =
            ns.hackAnalyzeChance(
                server
            );

        if (
            hackTime <= 0 ||
            hackPercent <= 0 ||
            hackChance <= 0
        ) {

            continue;
        }

        // ========================================================
        // TARGET SCORE
        //
        // Expected money produced by one hack thread
        // divided by hacking time.
        // ========================================================

        const expectedMoney =
            maxMoney *
            hackPercent *
            hackChance;

        const score =
            expectedMoney /
            (
                hackTime /
                1000
            );

        candidates.push({
            server,
            maxMoney,
            requiredHack,
            hackTime,
            hackPercent,
            hackChance,
            score
        });
    }

    candidates.sort(
        (a, b) =>
            b.score -
            a.score
    );

    if (
        candidates.length === 0
    ) {

        return null;
    }

    return candidates[0];
}


// ================================================================
// DEPLOY THREADS ACROSS NETWORK
// ================================================================

async function deployThreads(
    ns,
    workerServers,
    script,
    target,
    requestedThreads,
    homeReserve
) {

    const jobs =
        [];

    const scriptRam =
        ns.getScriptRam(
            script,
            "home"
        );

    if (
        scriptRam <= 0
    ) {

        ns.print(
            `ERROR: Could not determine RAM for ${script}`
        );

        return jobs;
    }

    let remainingThreads =
        requestedThreads;

    for (
        const worker
        of workerServers
    ) {

        if (
            remainingThreads <=
            0
        ) {

            break;
        }

        const host =
            worker.server;

        // ========================================================
        // COPY WORKER SCRIPT
        // ========================================================

        if (
            host !==
            "home"
        ) {

            await ns.scp(
                script,
                host,
                "home"
            );
        }

        // ========================================================
        // RECALCULATE CURRENT FREE RAM
        // ========================================================

        const maxRam =
            ns.getServerMaxRam(
                host
            );

        const usedRam =
            ns.getServerUsedRam(
                host
            );

        let freeRam =
            maxRam -
            usedRam;

        if (
            host ===
            "home"
        ) {

            freeRam -=
                homeReserve;
        }

        freeRam =
            Math.max(
                0,
                freeRam
            );

        const possibleThreads =
            Math.floor(
                freeRam /
                scriptRam
            );

        if (
            possibleThreads <=
            0
        ) {

            continue;
        }

        const threads =
            Math.min(
                possibleThreads,
                remainingThreads
            );

        // ========================================================
        // EXECUTE WORKER
        // ========================================================

        const pid =
            ns.exec(
                script,
                host,
                threads,
                target
            );

        if (
            pid === 0
        ) {

            continue;
        }

        jobs.push({
            pid,
            host,
            threads,
            script
        });

        remainingThreads -=
            threads;
    }

    return jobs;
}


// ================================================================
// WAIT FOR ALL DISTRIBUTED JOBS
// ================================================================

async function waitForJobs(
    ns,
    jobs
) {

    while (true) {

        let running =
            false;

        for (
            const job
            of jobs
        ) {

            if (
                ns.isRunning(
                    job.pid,
                    job.host
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
            250
        );
    }
}


// ================================================================
// DASHBOARD
// ================================================================

function updateDashboard(
    ns,
    state,
    lastDisplay
) {

    const {
        servers,
        workerServers,
        currentTarget,
        currentStage,
        hackCycles,
        newlyRooted,
        totalRooted,
        HOME_RAM_RESERVE,
        HACK_FRACTION,
        threadsNeeded = 0
    } = state;

    // ============================================================
    // PLAYER INFORMATION
    // ============================================================

    const playerHack =
        ns.getHackingLevel();

    const playerMoney =
        ns.getServerMoneyAvailable(
            "home"
        );

    const ports =
        getPortPrograms(
            ns
        );

    // ============================================================
    // RAM POOL INFORMATION
    // ============================================================

    let totalRam =
        0;

    let usedRam =
        0;

    let freeRam =
        0;

    for (
        const worker
        of workerServers
    ) {

        totalRam +=
            worker.maxRam;

        usedRam +=
            worker.usedRam;

        freeRam +=
            worker.freeRam;
    }

    // ============================================================
    // TARGET INFORMATION
    // ============================================================

    let targetMaxMoney =
        0;

    let targetMoney =
        0;

    let moneyPercent =
        0;

    let targetSecurity =
        0;

    let targetMinSecurity =
        0;

    let hackChance =
        0;

    let hackPercent =
        0;

    let hackTime =
        0;

    if (
        currentTarget
    ) {

        targetMaxMoney =
            ns.getServerMaxMoney(
                currentTarget
            );

        targetMoney =
            ns.getServerMoneyAvailable(
                currentTarget
            );

        moneyPercent =
            targetMaxMoney > 0
                ? (
                    targetMoney /
                    targetMaxMoney
                ) * 100
                : 0;

        targetSecurity =
            ns.getServerSecurityLevel(
                currentTarget
            );

        targetMinSecurity =
            ns.getServerMinSecurityLevel(
                currentTarget
            );

        hackChance =
            ns.hackAnalyzeChance(
                currentTarget
            ) * 100;

        hackPercent =
            ns.hackAnalyze(
                currentTarget
            ) * 100;

        hackTime =
            ns.getHackTime(
                currentTarget
            ) /
            1000;
    }

    // ============================================================
    // BUILD DISPLAY
    // ============================================================

    const lines =
        [];

    const width =
        112;

    lines.push("");

    lines.push(
        " BITBURNER // CENTRAL HACKING CONTROLLER"
    );

    lines.push(
        "═".repeat(
            width
        )
    );

    lines.push(
        ` Hack Level : ${playerHack.toString().padEnd(10)}` +
        `Cash : ${formatMoney(ns, playerMoney).padEnd(18)}` +
        `Ports : ${(ports + "/5").padEnd(10)}` +
        `Servers : ${servers.length}`
    );

    lines.push(
        ` Workers    : ${workerServers.length.toString().padEnd(10)}` +
        `RAM Pool : ${ns.format.ram(totalRam).padEnd(16)}` +
        `Free RAM : ${ns.format.ram(freeRam).padEnd(16)}` +
        `Home Reserve : ${ns.format.ram(HOME_RAM_RESERVE)}`
    );

    lines.push(
        "─".repeat(
            width
        )
    );

    lines.push("");

    lines.push(
        ` STAGE      : ${currentStage}`
    );

    lines.push(
        ` TARGET     : ${currentTarget ?? "NONE"}`
    );

    lines.push("");

    if (
        currentTarget
    ) {

        lines.push(
            ` Money      : ${formatMoney(ns, targetMoney)} / ` +
            `${formatMoney(ns, targetMaxMoney)} ` +
            `(${moneyPercent.toFixed(1)}%)`
        );

        lines.push(
            ` Security   : ${targetSecurity.toFixed(2)} / ` +
            `${targetMinSecurity.toFixed(2)} minimum ` +
            `(+${(
                targetSecurity -
                targetMinSecurity
            ).toFixed(2)})`
        );

        lines.push(
            ` Hack       : ${hackPercent.toFixed(2)}% per thread  |  ` +
            `Chance ${hackChance.toFixed(1)}%  |  ` +
            `Time ${hackTime.toFixed(1)}s`
        );
    }

    lines.push("");

    lines.push(
        "─".repeat(
            width
        )
    );

    lines.push(
        ` Threads Requested : ${threadsNeeded}`
    );

    lines.push(
        ` Hack Fraction     : ${(HACK_FRACTION * 100).toFixed(0)}%`
    );

    lines.push(
        ` Hack Cycles       : ${hackCycles}`
    );

    lines.push(
        ` Newly Rooted      : ${newlyRooted}`
    );

    lines.push(
        ` Rooted This Run   : ${totalRooted}`
    );

    lines.push("");

    lines.push(
        "─".repeat(
            width
        )
    );

    lines.push(
        " TOP WORKER SERVERS"
    );

    lines.push("");

    lines.push(
        "SERVER".padEnd(28) +
        "MAX RAM".padStart(15) +
        "USED".padStart(15) +
        "FREE".padStart(15)
    );

    lines.push(
        "-".repeat(
            73
        )
    );

    const topWorkers =
        workerServers.slice(
            0,
            10
        );

    for (
        const worker
        of topWorkers
    ) {

        lines.push(
            worker.server.padEnd(28) +
            ns.format.ram(
                worker.maxRam
            ).padStart(15) +
            ns.format.ram(
                worker.usedRam
            ).padStart(15) +
            ns.format.ram(
                worker.freeRam
            ).padStart(15)
        );
    }

    lines.push("");

    lines.push(
        "═".repeat(
            width
        )
    );

    const display =
        lines.join(
            "\n"
        );

    // ============================================================
    // ONLY REDRAW WHEN DISPLAY CHANGES
    // ============================================================

    if (
        display !==
        lastDisplay
    ) {

        ns.clearLog();

        for (
            const line
            of lines
        ) {

            ns.print(
                line
            );
        }
    }

    return display;
}


// ================================================================
// COUNT AVAILABLE PORT PROGRAMS
// ================================================================

function getPortPrograms(ns) {

    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe"
    ];

    return programs.filter(
        program =>
            ns.fileExists(
                program,
                "home"
            )
    ).length;
}


// ================================================================
// MONEY FORMATTER
// ================================================================

function formatMoney(
    ns,
    value
) {

    return "$" +
        ns.format.number(
            value,
            2
        );
}