/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // =====================================================
    // OPEN TAIL WINDOW
    // =====================================================

    ns.ui.openTail();
    ns.ui.resizeTail(850, 500);
    ns.ui.setTailTitle("Rooted Servers With No Money");

    let lastDisplay = "";

    while (true) {

        // =================================================
        // SCAN ENTIRE NETWORK
        // =================================================

        const visited = new Set();
        const servers = [];

        function scanServer(server) {
            if (visited.has(server)) return;

            visited.add(server);
            servers.push(server);

            for (const neighbor of ns.scan(server)) {
                scanServer(neighbor);
            }
        }

        scanServer("home");

        // =================================================
        // FIND ROOTED SERVERS THAT CANNOT HOLD MONEY
        // =================================================

        const results = [];

        for (const server of servers) {

            // Skip home
            if (server === "home") continue;

            // Must have root/admin access
            if (!ns.hasRootAccess(server)) continue;

            const maxMoney = ns.getServerMaxMoney(server);

            // Server has no money available to hack
            if (maxMoney > 0) continue;

            results.push({
                server: server,
                hackLevel: ns.getServerRequiredHackingLevel(server),
                maxRam: ns.getServerMaxRam(server),
                usedRam: ns.getServerUsedRam(server)
            });
        }

        // =================================================
        // SORT BY SERVER NAME
        // =================================================

        results.sort((a, b) =>
            a.server.localeCompare(b.server)
        );

        // =================================================
        // BUILD DISPLAY
        // =================================================

        let output = "";

        output +=
            "SERVER".padEnd(32) +
            "HACK".padStart(8) +
            "MAX RAM".padStart(14) +
            "USED RAM".padStart(14) +
            "FREE RAM".padStart(14) +
            "\n";

        output += "-".repeat(82) + "\n";

        for (const row of results) {

            const freeRam = row.maxRam - row.usedRam;

            output +=
                row.server.padEnd(32) +
                row.hackLevel.toString().padStart(8) +
                `${ns.format.number(row.maxRam, 2)} GB`.padStart(14) +
                `${ns.format.number(row.usedRam, 2)} GB`.padStart(14) +
                `${ns.format.number(freeRam, 2)} GB`.padStart(14) +
                "\n";
        }

        // =================================================
        // SUMMARY
        // =================================================

        output += "\n";
        output += "-".repeat(82) + "\n";

        output += `Rooted servers with no money: ${results.length}\n`;
        output += `Total network servers scanned: ${servers.length}\n`;

        // =================================================
        // UPDATE ONLY WHEN SOMETHING CHANGES
        // =================================================

        if (output !== lastDisplay) {
            ns.clearLog();
            ns.print(output);
            lastDisplay = output;
        }

        await ns.sleep(2000);
    }
}