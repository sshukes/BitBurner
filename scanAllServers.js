/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // =====================================================
    // OPEN TAIL WINDOW
    // =====================================================

    ns.ui.openTail();
    ns.ui.resizeTail(1100, 600);
    ns.ui.setTailTitle("Server Network Scanner");

    while (true) {

        // =====================================================
        // SCAN ENTIRE NETWORK
        // =====================================================

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

        // =====================================================
        // SORT:
        // 1. ADMIN ACCESS FIRST
        // 2. MAX MONEY HIGHEST TO LOWEST
        // =====================================================

        servers.sort((a, b) => {
            const adminA = ns.hasRootAccess(a);
            const adminB = ns.hasRootAccess(b);

            if (adminA !== adminB) {
                return adminA ? -1 : 1;
            }

            const maxMoneyA = ns.getServerMaxMoney(a);
            const maxMoneyB = ns.getServerMaxMoney(b);

            return maxMoneyB - maxMoneyA;
        });

        // =====================================================
        // BUILD DISPLAY
        // =====================================================

        let output = "";

        output +=
            "SERVER".padEnd(28) +
            "ADMIN".padEnd(10) +
            "SCRIPTS".padStart(10) +
            "MAX MONEY".padStart(16) +
            "AVAILABLE".padStart(16) +
            "RAM USED / MAX".padStart(22) +
            "\n";

        output += "-".repeat(102) + "\n";

        for (const server of servers) {

            const admin =
                ns.hasRootAccess(server)
                    ? "YES"
                    : "NO";

            const scriptCount =
                ns.ps(server).length;

            const maxMoney =
                ns.getServerMaxMoney(server);

            const moneyAvailable =
                ns.getServerMoneyAvailable(server);

            const maxRam =
                ns.getServerMaxRam(server);

            const usedRam =
                ns.getServerUsedRam(server);

            const ramText =
                `${ns.format.ram(usedRam)} / ${ns.format.ram(maxRam)}`;

            output +=
                server.padEnd(28) +
                admin.padEnd(10) +
                scriptCount.toString().padStart(10) +
                ns.format.number(maxMoney, 2).padStart(16) +
                ns.format.number(moneyAvailable, 2).padStart(16) +
                ramText.padStart(22) +
                "\n";
        }

        // =====================================================
        // DISPLAY
        // =====================================================

        ns.clearLog();
        ns.print(output);

        ns.ui.setTailTitle(
            `Server Network Scanner | ${servers.length} Servers`
        );

        await ns.sleep(2000);
    }
}