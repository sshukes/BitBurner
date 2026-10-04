/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // =====================================================
    // WINDOW SETUP
    // =====================================================

    ns.ui.openTail();
    ns.ui.resizeTail(800, 500);
    ns.ui.setTailTitle("Coding Contract Scanner");

    const visited = new Set();
    const servers = [];
    const results = [];

    // =====================================================
    // SCAN ENTIRE NETWORK
    // =====================================================

    function scanServer(server) {
        if (visited.has(server)) return;

        visited.add(server);
        servers.push(server);

        for (const neighbor of ns.scan(server)) {
            scanServer(neighbor);
        }
    }

    scanServer("home");

    // =====================================================
    // FIND CODING CONTRACTS
    // =====================================================

    for (const server of servers) {
        const files = ns.ls(server, ".cct");

        for (const file of files) {
            results.push({
                server: server,
                file: file
            });
        }
    }

    // =====================================================
    // DISPLAY RESULTS
    // =====================================================

    ns.clearLog();

    ns.ui.setTailTitle(
        `Coding Contract Scanner | Contracts: ${results.length}`
    );

    ns.print("");
    ns.print("CODING CONTRACTS FOUND");
    ns.print("=".repeat(75));
    ns.print("");

    if (results.length === 0) {
        ns.print("No .cct files were found on the network.");
        ns.print("");

        // Keep window open
        while (true) {
            await ns.sleep(1000);
        }
    }

    const serverWidth = 32;
    const fileWidth = 38;

    ns.print(
        "SERVER".padEnd(serverWidth) +
        "CONTRACT FILE".padEnd(fileWidth)
    );

    ns.print("-".repeat(75));

    for (const result of results) {
        ns.print(
            result.server.padEnd(serverWidth) +
            result.file.padEnd(fileWidth)
        );
    }

    ns.print("-".repeat(75));
    ns.print("");
    ns.print(`Total Contracts: ${results.length}`);
    ns.print(`Servers Scanned: ${servers.length}`);
    ns.print("");

    // =====================================================
    // KEEP WINDOW OPEN
    // =====================================================

    while (true) {
        await ns.sleep(1000);
    }
}