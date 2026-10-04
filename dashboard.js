/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ============================================================
    // DASHBOARD CONFIGURATION
    // ============================================================

    const REFRESH_RATE = 1000;
    const DASH_WIDTH = 1100;
    const DASH_HEIGHT = 550;
    const LINE_WIDTH = 110;

    const MONEY_THRESHOLD_PERCENT = 0.05;

    // ANSI COLORS
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

    const portPrograms = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe"
    ];

    // ============================================================
    // DASHBOARD WINDOW
    // ============================================================

    ns.ui.openTail();
    ns.ui.resizeTail(DASH_WIDTH, DASH_HEIGHT);

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    function color(text, colorCode) {
        return `${colorCode}${text}${COLOR.reset}`;
    }

    function scanNetwork() {
        const visited = new Set();
        const servers = [];

        function scan(server) {
            if (visited.has(server)) {
                return;
            }

            visited.add(server);
            servers.push(server);

            for (const neighbor of ns.scan(server)) {
                scan(neighbor);
            }
        }

        scan("home");

        return servers;
    }

    function getAvailablePortCrackers() {
        return portPrograms.filter(program =>
            ns.fileExists(program, "home")
        ).length;
    }

    function getSecurityColor(security, minSecurity) {
        const difference = security - minSecurity;

        if (difference <= 1) {
            return COLOR.brightGreen;
        }

        if (difference <= 5) {
            return COLOR.brightYellow;
        }

        return COLOR.brightRed;
    }

    function getMoneyColor(money, maxMoney) {
        if (maxMoney <= 0) {
            return COLOR.gray;
        }

        const percentage = money / maxMoney;

        if (percentage >= 0.75) {
            return COLOR.brightGreen;
        }

        if (percentage >= 0.25) {
            return COLOR.brightYellow;
        }

        return COLOR.brightRed;
    }

    // ============================================================
    // MAIN DASHBOARD LOOP
    // ============================================================

    while (true) {
        ns.clearLog();

        // --------------------------------------------------------
        // PLAYER INFORMATION
        // --------------------------------------------------------

        const hackLevel = ns.getHackingLevel();
        const playerMoney = ns.getServerMoneyAvailable("home");
        const availablePorts = getAvailablePortCrackers();

        ns.print(
            color("═".repeat(LINE_WIDTH), COLOR.brightCyan)
        );

        ns.print(
            color(
                "BITBURNER NETWORK DASHBOARD".padStart(
                    (LINE_WIDTH + 27) / 2
                ),
                COLOR.bold + COLOR.brightCyan
            )
        );

        ns.print(
            color("═".repeat(LINE_WIDTH), COLOR.brightCyan)
        );

        ns.print("");

        ns.print(
            color("HACK LEVEL: ", COLOR.gray) +
            color(
                hackLevel.toString().padEnd(18),
                COLOR.brightYellow
            ) +

            color("MONEY: ", COLOR.gray) +
            color(
                ns.format.number(playerMoney, 2).padEnd(25),
                COLOR.brightGreen
            ) +

            color("PORT CRACKERS: ", COLOR.gray) +
            color(
                `${availablePorts}/5`,
                COLOR.brightCyan
            )
        );

        ns.print("");

        // --------------------------------------------------------
        // SERVER TABLE HEADER
        // --------------------------------------------------------

        const header =
            "SERVER".padEnd(22) +
            "SCRIPTS".padStart(8) +
            "SECURITY".padStart(12) +
            "MIN SEC".padStart(10) +
            "MONEY AVAIL".padStart(16) +
            "MAX MONEY".padStart(16) +
            "5% THRESHOLD".padStart(16);

        ns.print(
            color(header, COLOR.bold + COLOR.brightWhite)
        );

        ns.print(
            color("─".repeat(LINE_WIDTH), COLOR.gray)
        );

        // --------------------------------------------------------
        // SERVER INFORMATION
        // --------------------------------------------------------

        const servers = scanNetwork();

        for (const server of servers) {

            // Skip home because its money represents player money
            if (server === "home") {
                continue;
            }

            const processes = ns.ps(server);

            // Only show servers that currently have scripts running
            if (processes.length === 0) {
                continue;
            }

            const security =
                ns.getServerSecurityLevel(server);

            const minSecurity =
                ns.getServerMinSecurityLevel(server);

            const money =
                ns.getServerMoneyAvailable(server);

            const maxMoney =
                ns.getServerMaxMoney(server);

            const thresholdMoney =
                maxMoney * MONEY_THRESHOLD_PERCENT;

            const securityColor =
                getSecurityColor(security, minSecurity);

            const moneyColor =
                getMoneyColor(money, maxMoney);

            const serverColumn =
                color(
                    server.padEnd(22),
                    COLOR.brightCyan
                );

            const scriptsColumn =
                color(
                    processes.length
                        .toString()
                        .padStart(8),
                    COLOR.white
                );

            const securityColumn =
                color(
                    security
                        .toFixed(2)
                        .padStart(12),
                    securityColor
                );

            const minSecurityColumn =
                color(
                    minSecurity
                        .toFixed(2)
                        .padStart(10),
                    COLOR.green
                );

            const moneyColumn =
                color(
                    ns.format
                        .number(money, 2)
                        .padStart(16),
                    moneyColor
                );

            const maxMoneyColumn =
                color(
                    ns.format
                        .number(maxMoney, 2)
                        .padStart(16),
                    COLOR.brightGreen
                );

            const thresholdColumn =
                color(
                    ns.format
                        .number(thresholdMoney, 2)
                        .padStart(16),
                    COLOR.yellow
                );

            ns.print(
                serverColumn +
                scriptsColumn +
                securityColumn +
                minSecurityColumn +
                moneyColumn +
                maxMoneyColumn +
                thresholdColumn
            );
        }

        // --------------------------------------------------------
        // FOOTER
        // --------------------------------------------------------

        ns.print("");
        ns.print(
            color("─".repeat(LINE_WIDTH), COLOR.gray)
        );

        ns.print(
            color(
                `Refreshing every ${REFRESH_RATE / 1000}s`,
                COLOR.gray
            )
        );

        await ns.sleep(REFRESH_RATE);
    }
}