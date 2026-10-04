/** @param {NS} ns */
export async function main(ns) {

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const REFRESH_RATE = 2000;

    ns.disableLog("ALL");

    ns.ui.openTail();
    ns.ui.resizeTail(1225, 625);

    let lastDisplay = "";

    // ============================================================
    // PORT PROGRAMS
    // ============================================================

    const portPrograms = [
        {
            file: "BruteSSH.exe",
            run: server => ns.brutessh(server)
        },
        {
            file: "FTPCrack.exe",
            run: server => ns.ftpcrack(server)
        },
        {
            file: "relaySMTP.exe",
            run: server => ns.relaysmtp(server)
        },
        {
            file: "HTTPWorm.exe",
            run: server => ns.httpworm(server)
        },
        {
            file: "SQLInject.exe",
            run: server => ns.sqlinject(server)
        }
    ];


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        // ========================================================
        // PLAYER INFORMATION
        // ========================================================

        const hackingLevel =
            ns.getHackingLevel();

        const hasNuke =
            ns.fileExists("NUKE.exe", "home");

        const availablePrograms =
            portPrograms.filter(program =>
                ns.fileExists(program.file, "home")
            );

        const availablePorts =
            availablePrograms.length;


        // ========================================================
        // SCAN ENTIRE NETWORK
        // ========================================================

        const servers =
            scanNetwork(ns);

        const results = [];

        let rootedThisPass = 0;
        let totalRooted = 0;

        let readyForDispatcher = 0;
        let waitingForLevel = 0;
        let waitingForPorts = 0;
        let waitingForNuke = 0;
        let noMoney = 0;


        // ========================================================
        // PROCESS SERVERS
        // ========================================================

        for (const server of servers) {

            if (server === "home") {
                continue;
            }

            let info =
                ns.getServer(server);


            // ====================================================
            // SERVER REQUIREMENTS
            // ====================================================

            const requiredHack =
                info.requiredHackingSkill ?? 0;

            const portsRequired =
                info.numOpenPortsRequired ?? 0;


            // ====================================================
            // ATTEMPT TO OPEN AVAILABLE PORTS
            // ====================================================

            if (!info.hasAdminRights) {

                for (const program of availablePrograms) {

                    try {

                        program.run(server);

                    }
                    catch {

                        // Ignore individual port-opening failures.
                    }
                }


                // Refresh because openPortCount may have changed.

                info =
                    ns.getServer(server);


                // =================================================
                // ATTEMPT NUKE
                // =================================================
                //
                // IMPORTANT:
                //
                // Root eligibility is based on ACTUAL open ports,
                // not simply how many port programs we own.
                //
                // =================================================

                if (
                    hasNuke &&
                    info.openPortCount >=
                    info.numOpenPortsRequired
                ) {

                    try {

                        const success =
                            ns.nuke(server);

                        if (success) {

                            rootedThisPass++;

                            // Refresh after root access changes
                            info =
                                ns.getServer(server);
                        }
                    }
                    catch {

                        // Leave server unrooted and try again
                        // on the next refresh cycle.
                    }
                }
            }


            // ====================================================
            // CURRENT SERVER STATE
            // ====================================================

            const rooted =
                info.hasAdminRights;

            const openPorts =
                info.openPortCount ?? 0;

            const actualPortsReady =
                openPorts >= portsRequired;

            const hackingReady =
                hackingLevel >= requiredHack;

            const currentMoney =
                info.moneyAvailable ?? 0;

            const maxMoney =
                info.moneyMax ?? 0;

            const maxRam =
                info.maxRam ?? 0;


            // ====================================================
            // DETERMINE STATUS
            // ====================================================

            let status = "";


            // ----------------------------------------------------
            // NOT ROOTED
            // ----------------------------------------------------

            if (!rooted) {

                // Not enough actual open ports

                if (!actualPortsReady) {

                    status =
                        `WAIT PORTS ${openPorts}/${portsRequired}`;

                    waitingForPorts++;
                }


                // Ports are open, but NUKE.exe isn't owned yet

                else if (!hasNuke) {

                    status =
                        "WAIT NUKE";

                    waitingForNuke++;
                }


                // Should normally root during this cycle.
                // If it didn't, we'll retry.

                else {

                    status =
                        "ROOT PENDING";
                }
            }


            // ----------------------------------------------------
            // ROOTED
            // ----------------------------------------------------

            else {

                totalRooted++;


                // ------------------------------------------------
                // NO MONEY TARGET
                // ------------------------------------------------

                if (maxMoney <= 0) {

                    status =
                        "ROOTED / NO MONEY";

                    noMoney++;
                }


                // ------------------------------------------------
                // PLAYER HACK LEVEL TOO LOW
                // ------------------------------------------------

                else if (!hackingReady) {

                    status =
                        `WAIT LEVEL ${hackingLevel}/${requiredHack}`;

                    waitingForLevel++;
                }


                // ------------------------------------------------
                // READY FOR DISPATCHER
                // ------------------------------------------------

                else {

                    status =
                        "READY FOR DISPATCHER";

                    readyForDispatcher++;
                }
            }


            // ====================================================
            // SAVE RESULT
            // ====================================================

            results.push({

                server,

                rooted,

                requiredHack,

                portsRequired,

                openPorts,

                hackingReady,

                currentMoney,

                maxMoney,

                maxRam,

                status
            });
        }


        // ========================================================
        // SORT RESULTS
        // ========================================================
        //
        // Primary:
        //      hacking level required
        //
        // Secondary:
        //      highest-value server
        //
        // ========================================================

        results.sort(
            (a, b) =>

                a.requiredHack -
                b.requiredHack ||

                b.maxMoney -
                a.maxMoney
        );


        // ========================================================
        // WINDOW TITLE
        // ========================================================

        ns.ui.setTailTitle(

            `SERVER ACQUISITION  |  ` +

            `Hack ${hackingLevel}  |  ` +

            `Ports ${availablePorts}/5  |  ` +

            `NUKE ${hasNuke ? "YES" : "NO"}  |  ` +

            `Ready ${readyForDispatcher}`
        );


        // ========================================================
        // BUILD DISPLAY
        // ========================================================

        const lines = [];


        lines.push(
            "════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════"
        );

        lines.push(
            "                                         SERVER ACQUISITION MANAGER"
        );

        lines.push(
            "════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════"
        );

        lines.push("");


        // ========================================================
        // PLAYER INFO
        // ========================================================

        lines.push(

            ` Hack Level : ${String(hackingLevel).padStart(6)}    ` +

            `Port Programs : ${availablePorts}/5    ` +

            `NUKE.exe : ${hasNuke ? "YES" : "NO"}    ` +

            `Dispatcher Ready : ${readyForDispatcher}`
        );


        lines.push("");


        // ========================================================
        // TABLE HEADER
        // ========================================================

        lines.push(

            " SERVER                    ROOT   HACK    PORTS       MONEY / MAX MONEY             RAM       STATUS"
        );

        lines.push(

            "────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────"
        );


        // ========================================================
        // SERVER ROWS
        // ========================================================

        for (const r of results) {

            const root =
                r.rooted
                    ? "YES"
                    : "NO";

            const ports =
                `${r.openPorts}/${r.portsRequired}`;

            const money =
                `${formatMoney(ns, r.currentMoney)} / ` +
                `${formatMoney(ns, r.maxMoney)}`;


            lines.push(

                `${r.server.padEnd(26)}` +

                `${root.padEnd(7)}` +

                `${String(r.requiredHack).padStart(5)}   ` +

                `${ports.padStart(7)}   ` +

                `${money.padStart(28)}   ` +

                `${ns.format.ram(r.maxRam).padStart(9)}   ` +

                `${r.status}`
            );
        }


        // ========================================================
        // SUMMARY
        // ========================================================

        lines.push("");

        lines.push(
            "────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────"
        );


        lines.push(

            ` Rooted this pass : ${String(rootedThisPass).padStart(3)}    ` +

            `Total rooted : ${String(totalRooted).padStart(3)}    ` +

            `Ready for dispatcher : ${String(readyForDispatcher).padStart(3)}`
        );


        lines.push(

            ` Waiting level    : ${String(waitingForLevel).padStart(3)}    ` +

            `Waiting ports : ${String(waitingForPorts).padStart(3)}    ` +

            `Waiting NUKE : ${String(waitingForNuke).padStart(3)}`
        );


        lines.push(

            ` No-money servers : ${String(noMoney).padStart(3)}`
        );


        lines.push(

            "════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════"
        );


        // ========================================================
        // UPDATE WINDOW ONLY WHEN SOMETHING CHANGED
        // ========================================================

        const display =
            lines.join("\n");


        if (display !== lastDisplay) {

            ns.clearLog();

            ns.print(display);

            lastDisplay =
                display;
        }


        // ========================================================
        // WAIT
        // ========================================================

        await ns.sleep(REFRESH_RATE);
    }
}


// ============================================================
// SCAN ENTIRE NETWORK
// ============================================================

function scanNetwork(ns) {

    const discovered =
        new Set(["home"]);

    const queue =
        ["home"];


    while (queue.length > 0) {

        const current =
            queue.shift();

        const neighbors =
            ns.scan(current);


        for (const neighbor of neighbors) {

            if (!discovered.has(neighbor)) {

                discovered.add(neighbor);

                queue.push(neighbor);
            }
        }
    }


    return [...discovered];
}


// ============================================================
// FORMAT MONEY
// ============================================================

function formatMoney(ns, amount) {

    if (!amount || amount <= 0) {

        return "$0";
    }


    return "$" +
        ns.format.number(amount, 2);
}