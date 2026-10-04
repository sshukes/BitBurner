/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // =====================================================
    // WINDOW SETUP
    // =====================================================

    ns.ui.openTail();
    ns.ui.resizeTail(1450, 550);
    ns.ui.setTailTitle("💰 ZERO-RAM REMOTE HACK TARGETS");

    const REFRESH_MS = 1000;

    while (true) {

        // =================================================
        // PLAYER INFORMATION
        // =================================================

        const playerHackLevel = ns.getHackingLevel();
        const playerMoney = ns.getServerMoneyAvailable("home");

        const portPrograms = [
            "BruteSSH.exe",
            "FTPCrack.exe",
            "relaySMTP.exe",
            "HTTPWorm.exe",
            "SQLInject.exe"
        ];

        const portsAvailable = portPrograms.filter(program =>
            ns.fileExists(program, "home")
        ).length;

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
        // FIND ACTIVE PROCESSES
        //
        // This lets us determine what is currently
        // happening to each target.
        // =================================================

        const activity = new Map();

        for (const host of servers) {

            const processes = ns.ps(host);

            for (const process of processes) {

                const filename = process.filename.toLowerCase();

                let action = null;

                if (filename.includes("hack")) {
                    action = "hack";
                }
                else if (filename.includes("grow")) {
                    action = "grow";
                }
                else if (filename.includes("weaken")) {
                    action = "weaken";
                }

                if (!action) continue;

                // Look through arguments to find target server
                for (const arg of process.args) {

                    const target = String(arg);

                    if (!servers.includes(target)) continue;

                    if (!activity.has(target)) {
                        activity.set(target, {
                            hack: 0,
                            grow: 0,
                            weaken: 0,
                            threads: 0
                        });
                    }

                    const stats = activity.get(target);

                    stats[action]++;
                    stats.threads += process.threads;
                }
            }
        }

        // =================================================
        // COLLECT ZERO-RAM MONEY SERVERS
        // =================================================

        const targets = [];

        for (const server of servers) {

            if (server === "home") continue;

            const data = ns.getServer(server);

            const maxRam = data.maxRam;
            const maxMoney = data.moneyMax ?? 0;
            const moneyAvailable = data.moneyAvailable ?? 0;

            const requiredHack =
                data.requiredHackingSkill ?? 0;

            const currentSecurity =
                data.hackDifficulty ?? 0;

            const minSecurity =
                data.minDifficulty ?? 0;

            const hasRoot =
                data.hasAdminRights;

            // =================================================
            // FILTER
            // =================================================

            if (!hasRoot) continue;
            if (maxRam > 0) continue;
            if (maxMoney <= 0) continue;
            if (requiredHack > playerHackLevel) continue;

            const moneyPercent =
                maxMoney > 0
                    ? (moneyAvailable / maxMoney) * 100
                    : 0;

            const securityAboveMin =
                currentSecurity - minSecurity;

            let hackPercent = 0;

            try {
                hackPercent =
                    ns.hackAnalyze(server) * 100;
            }
            catch {
                hackPercent = 0;
            }

            let hackTime = 0;

            try {
                hackTime =
                    ns.getHackTime(server);
            }
            catch {
                hackTime = 0;
            }

            // =================================================
            // REAL-TIME STATUS
            // =================================================

            const active = activity.get(server);

            let status = "IDLE";

            if (active) {

                const actions = [];

                if (active.hack > 0) {
                    actions.push(
                        `HACK:${active.hack}`
                    );
                }

                if (active.grow > 0) {
                    actions.push(
                        `GROW:${active.grow}`
                    );
                }

                if (active.weaken > 0) {
                    actions.push(
                        `WEAK:${active.weaken}`
                    );
                }

                status = actions.join(" ");
            }
            else {

                // Server is prepared for hacking
                if (
                    moneyPercent >= 95 &&
                    securityAboveMin <= 1
                ) {
                    status = "READY";
                }

                // Security needs work
                else if (
                    securityAboveMin > 5
                ) {
                    status = "NEEDS WEAKEN";
                }

                // Money needs to be restored
                else if (
                    moneyPercent < 75
                ) {
                    status = "NEEDS GROW";
                }
            }

            targets.push({
                server,
                moneyAvailable,
                maxMoney,
                moneyPercent,
                currentSecurity,
                minSecurity,
                securityAboveMin,
                requiredHack,
                maxRam,
                hackPercent,
                hackTime,
                status,
                threads: active?.threads ?? 0
            });
        }

        // =================================================
        // SORT
        //
        // Highest potential money targets first
        // =================================================

        targets.sort((a, b) => {

            if (b.maxMoney !== a.maxMoney) {
                return b.maxMoney - a.maxMoney;
            }

            return a.requiredHack - b.requiredHack;
        });

        // =================================================
        // DASHBOARD
        // =================================================

        const lines = [];

        lines.push(
            "╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗"
        );

        lines.push(
            "║                                                        ZERO-RAM REMOTE HACK TARGETS                                                           ║"
        );

        lines.push(
            "╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣"
        );

        lines.push(
            `║ Hack Level: ${String(playerHackLevel).padEnd(8)}` +
            `Money: ${ns.format.number(playerMoney, 2).padEnd(14)}` +
            `Ports: ${(portsAvailable + "/5").padEnd(8)}` +
            `Targets: ${String(targets.length).padEnd(8)}` +
            `Refresh: ${(REFRESH_MS / 1000 + " sec").padEnd(10)}` +
            "                                                               ║"
        );

        lines.push(
            "╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝"
        );

        lines.push("");

        // =================================================
        // HEADER
        // =================================================

        const header =
            "SERVER".padEnd(20) +
            "STATUS".padEnd(23) +
            "CURRENT".padStart(13) +
            "MAX MONEY".padStart(13) +
            "MONEY %".padStart(9) +
            "SEC".padStart(8) +
            "MIN".padStart(8) +
            "SEC +".padStart(8) +
            "HACK LVL".padStart(10) +
            "HACK %".padStart(9) +
            "TIME".padStart(9) +
            "THREADS".padStart(9);

        lines.push(header);

        lines.push(
            "─".repeat(139)
        );

        // =================================================
        // ROWS
        // =================================================

        for (const target of targets) {

            const hackTimeSeconds =
                target.hackTime / 1000;

            const row =

                target.server
                    .padEnd(20) +

                target.status
                    .padEnd(23) +

                ns.format.number(
                    target.moneyAvailable,
                    2
                ).padStart(13) +

                ns.format.number(
                    target.maxMoney,
                    2
                ).padStart(13) +

                (
                    target.moneyPercent.toFixed(1) + "%"
                ).padStart(9) +

                target.currentSecurity
                    .toFixed(2)
                    .padStart(8) +

                target.minSecurity
                    .toFixed(2)
                    .padStart(8) +

                target.securityAboveMin
                    .toFixed(2)
                    .padStart(8) +

                String(
                    target.requiredHack
                ).padStart(10) +

                (
                    target.hackPercent.toFixed(2) + "%"
                ).padStart(9) +

                (
                    hackTimeSeconds.toFixed(1) + "s"
                ).padStart(9) +

                String(
                    target.threads
                ).padStart(9);

            lines.push(row);
        }

        // =================================================
        // NO TARGETS
        // =================================================

        if (targets.length === 0) {

            lines.push("");

            lines.push(
                "No hackable zero-RAM money servers found."
            );
        }

        // =================================================
        // DISPLAY
        // =================================================

        ns.clearLog();

        for (const line of lines) {
            ns.print(line);
        }

        await ns.sleep(REFRESH_MS);
    }
}