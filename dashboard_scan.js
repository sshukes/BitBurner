/** @param {NS} ns */
export async function main(ns) {

    // ============================================================
    // DASHBOARD SETUP
    // ============================================================

    ns.disableLog("ALL");

    ns.ui.openTail();
    ns.ui.resizeTail(1050, 520);

    let lastDisplay = "";

    const portPrograms = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe"
    ];

    while (true) {

        // ========================================================
        // PLAYER INFORMATION
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
        // TAIL WINDOW TITLE
        // ========================================================

        ns.ui.setTailTitle(
            `TARGET ACQUISITION  |  ` +
            `Hack ${playerHackLevel}  |  ` +
            `Cash ${formatMoney(ns, playerMoney)}  |  ` +
            `Ports ${portsAvailable}/5`
        );


        // ========================================================
        // NETWORK SCAN
        // ========================================================

        const visited = new Set();
        const servers = [];

        function scanServer(server) {

            if (visited.has(server)) {
                return;
            }

            visited.add(server);
            servers.push(server);

            for (const neighbor of ns.scan(server)) {
                scanServer(neighbor);
            }
        }

        scanServer("home");


        // ========================================================
        // BUILD SERVER DATA
        // ========================================================

        const serverData = [];

        for (const server of servers) {

            if (server === "home") {
                continue;
            }

            // Only display servers we DO NOT own yet
            if (ns.hasRootAccess(server)) {
                continue;
            }

            const hackLevel =
                ns.getServerRequiredHackingLevel(server);

            const portsNeeded =
                ns.getServerNumPortsRequired(server);

            const maxMoney =
                ns.getServerMaxMoney(server);

            const canHack =
                playerHackLevel >= hackLevel;

            const canNuke =
                portsAvailable >= portsNeeded;


            // ====================================================
            // STATUS
            // ====================================================

            let status = "READY";

            if (!canHack && !canNuke) {
                status = "HACK + PORTS";
            }
            else if (!canHack) {
                status = "HACK LEVEL";
            }
            else if (!canNuke) {
                status = "PORTS";
            }


            serverData.push({
                server,
                hackLevel,
                portsNeeded,
                maxMoney,
                canHack,
                canNuke,
                status
            });
        }


        // ========================================================
        // SPLIT INTO READY / LOCKED
        // ========================================================

        const readyServers =
            serverData.filter(server =>
                server.canHack &&
                server.canNuke
            );

        const lockedServers =
            serverData.filter(server =>
                !server.canHack ||
                !server.canNuke
            );


        // ========================================================
        // SORT READY SERVERS
        //
        // Highest money first
        // ========================================================

        readyServers.sort((a, b) => {

            if (b.maxMoney !== a.maxMoney) {
                return b.maxMoney - a.maxMoney;
            }

            return a.hackLevel - b.hackLevel;
        });


        // ========================================================
        // SORT LOCKED SERVERS
        //
        // 1. Closest hacking level
        // 2. Fewest missing ports
        // 3. Highest money
        // ========================================================

        lockedServers.sort((a, b) => {

            const hackGapA =
                Math.max(
                    0,
                    a.hackLevel - playerHackLevel
                );

            const hackGapB =
                Math.max(
                    0,
                    b.hackLevel - playerHackLevel
                );

            if (hackGapA !== hackGapB) {
                return hackGapA - hackGapB;
            }

            const portGapA =
                Math.max(
                    0,
                    a.portsNeeded - portsAvailable
                );

            const portGapB =
                Math.max(
                    0,
                    b.portsNeeded - portsAvailable
                );

            if (portGapA !== portGapB) {
                return portGapA - portGapB;
            }

            return b.maxMoney - a.maxMoney;
        });


        // ========================================================
        // SELECT DISPLAY TARGETS
        //
        // Up to:
        // 5 READY
        // 5 LOCKED
        //
        // If one group has fewer than 5,
        // fill remaining slots from the other group.
        // ========================================================

        const MAX_DISPLAY = 10;
        const TARGET_READY = 5;

        const displayedReady =
            readyServers.slice(
                0,
                TARGET_READY
            );

        let remainingSlots =
            MAX_DISPLAY -
            displayedReady.length;

        const displayedLocked =
            lockedServers.slice(
                0,
                remainingSlots
            );

        remainingSlots =
            MAX_DISPLAY -
            displayedReady.length -
            displayedLocked.length;

        // If we don't have enough locked servers,
        // fill the remaining slots with more ready servers.
        if (remainingSlots > 0) {

            const moreReady =
                readyServers.slice(
                    displayedReady.length,
                    displayedReady.length +
                    remainingSlots
                );

            displayedReady.push(
                ...moreReady
            );
        }


        // ========================================================
        // BUILD DASHBOARD
        // ========================================================

        const lines = [];

        const width = 92;

        lines.push("");

        lines.push(
            " BITBURNER // TARGET ACQUISITION"
        );

        lines.push(
            "─".repeat(width)
        );

        lines.push(
            ` Hack Level: ${playerHackLevel}`.padEnd(25) +
            `Cash: ${formatMoney(ns, playerMoney)}`.padEnd(30) +
            `Port Crackers: ${portsAvailable}/5`
        );

        lines.push(
            "─".repeat(width)
        );


        // ========================================================
        // READY TARGETS
        // ========================================================

        lines.push("");

        lines.push(
            ` READY TARGETS (${readyServers.length})`
        );

        lines.push("");

        lines.push(
            " # ".padEnd(5) +
            "SERVER".padEnd(25) +
            "HACK".padStart(8) +
            "PORTS".padStart(8) +
            "MAX MONEY".padStart(18) +
            "STATUS".padStart(18)
        );

        lines.push(
            "─── " +
            "─────────────────────── " +
            "─────── " +
            "─────── " +
            "───────────────── " +
            "─────────────────"
        );


        let index = 1;

        for (const data of displayedReady) {

            lines.push(
                index.toString()
                    .padStart(2) +
                "   " +

                data.server
                    .padEnd(25) +

                data.hackLevel
                    .toString()
                    .padStart(8) +

                data.portsNeeded
                    .toString()
                    .padStart(8) +

                formatMoney(
                    ns,
                    data.maxMoney
                ).padStart(18) +

                data.status
                    .padStart(18)
            );

            index++;
        }


        if (displayedReady.length === 0) {

            lines.push(
                "     No servers currently ready."
            );
        }


        // ========================================================
        // LOCKED / UPCOMING TARGETS
        // ========================================================

        lines.push("");

        lines.push(
            ` UPCOMING TARGETS (${lockedServers.length})`
        );

        lines.push("");

        lines.push(
            " # ".padEnd(5) +
            "SERVER".padEnd(25) +
            "HACK".padStart(8) +
            "PORTS".padStart(8) +
            "MAX MONEY".padStart(18) +
            "STATUS".padStart(18)
        );

        lines.push(
            "─── " +
            "─────────────────────── " +
            "─────── " +
            "─────── " +
            "───────────────── " +
            "─────────────────"
        );


        for (const data of displayedLocked) {

            lines.push(
                index.toString()
                    .padStart(2) +
                "   " +

                data.server
                    .padEnd(25) +

                data.hackLevel
                    .toString()
                    .padStart(8) +

                data.portsNeeded
                    .toString()
                    .padStart(8) +

                formatMoney(
                    ns,
                    data.maxMoney
                ).padStart(18) +

                data.status
                    .padStart(18)
            );

            index++;
        }


        if (displayedLocked.length === 0) {

            lines.push(
                "     No locked targets remaining."
            );
        }


        // ========================================================
        // FOOTER
        // ========================================================

        lines.push("");

        lines.push(
            "─".repeat(width)
        );

        lines.push(
            ` Unrooted: ${serverData.length}` +
            `  |  Ready: ${readyServers.length}` +
            `  |  Locked: ${lockedServers.length}` +
            `  |  Showing: ${
                displayedReady.length +
                displayedLocked.length
            }`
        );

        lines.push(
            "─".repeat(width)
        );


        // ========================================================
        // BUILD FINAL DISPLAY STRING
        // ========================================================

        const display =
            lines.join("\n");


        // ========================================================
        // REDRAW ONLY WHEN DATA CHANGES
        // ========================================================

        if (display !== lastDisplay) {

            ns.clearLog();

            for (const line of lines) {
                ns.print(line);
            }

            lastDisplay =
                display;
        }


        // ========================================================
        // REFRESH
        // ========================================================

        await ns.sleep(1000);
    }
}


/**
 * Format money consistently.
 *
 * @param {NS} ns
 * @param {number} value
 */
function formatMoney(ns, value) {

    return "$" +
        ns.format.number(
            value,
            2
        );
}