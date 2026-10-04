/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");


    // ============================================================
    // CONFIGURATION
    // ============================================================

    const REFRESH_MS = 1000;


    const COLOR = {

        reset:
            "\u001b[0m",

        brightCyan:
            "\u001b[96m",

        boldBrightGreen:
            "\u001b[1;92m"
    };


    ns.ui.openTail();

    ns.ui.resizeTail(
        1650,
        700
    );


    let lastDisplay = "";


    const portPrograms = [

        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe"
    ];


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {


        // ========================================================
        // PLAYER INFORMATION
        // ========================================================

        const playerHackLevel =
            ns.getHackingLevel();


        const playerMoney =
            ns.getServerMoneyAvailable(
                "home"
            );


        const portsAvailable =
            portPrograms.filter(
                program =>
                    ns.fileExists(
                        program,
                        "home"
                    )
            ).length;


        // ========================================================
        // SCAN ENTIRE NETWORK
        // ========================================================

        const visited =
            new Set();


        const servers = [];


        function scanServer(
            server
        ) {

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
                of ns.scan(
                    server
                )
            ) {

                scanServer(
                    neighbor
                );
            }
        }


        scanServer(
            "home"
        );


        // ========================================================
        // BUILD SERVER DATA
        // ========================================================

        const serverData = [];


        for (
            const server
            of servers
        ) {

            const data =
                ns.getServer(
                    server
                );


            // ----------------------------------------------------
            // ACCESS / REQUIREMENTS
            // ----------------------------------------------------

            const requiredHack =
                data.requiredHackingSkill ??
                0;


            const portsRequired =
                data.numOpenPortsRequired ??
                0;


            const hasAdmin =
                data.hasAdminRights;


            const hackReady =
                playerHackLevel >=
                requiredHack;


            const portsReady =
                portsAvailable >=
                portsRequired;


            // ----------------------------------------------------
            // MONEY
            // ----------------------------------------------------

            const maxMoney =
                data.moneyMax ??
                0;


            const moneyAvailable =
                data.moneyAvailable ??
                0;


            // ----------------------------------------------------
            // RAM
            // ----------------------------------------------------

            const maxRam =
                data.maxRam ??
                0;


            const usedRam =
                data.ramUsed ??
                0;


            const freeRam =
                Math.max(
                    0,
                    maxRam -
                    usedRam
                );


            // ----------------------------------------------------
            // RUNNING SCRIPTS
            // ----------------------------------------------------

            const processes =
                ns.ps(
                    server
                );


            const scriptCount =
                processes.length;


            // ----------------------------------------------------
            // STATUS
            // ----------------------------------------------------

            let status;


            if (
                server === "home"
            ) {

                status =
                    "HOME";
            }
            else if (
                hasAdmin
            ) {

                status =
                    "ROOTED";
            }
            else if (
                hackReady &&
                portsReady
            ) {

                status =
                    "READY";
            }
            else if (
                !hackReady &&
                !portsReady
            ) {

                status =
                    "NEED LVL+PORTS";
            }
            else if (
                !hackReady
            ) {

                status =
                    "NEED LEVEL";
            }
            else {

                status =
                    "NEED PORTS";
            }


            // ----------------------------------------------------
            // ADD SERVER
            // ----------------------------------------------------

            serverData.push({

                server,

                requiredHack,
                portsRequired,

                hasAdmin,
                hackReady,
                portsReady,

                maxMoney,
                moneyAvailable,

                maxRam,
                usedRam,
                freeRam,

                scriptCount,

                status
            });
        }


        // ========================================================
        // SORT
        // ========================================================

        serverData.sort(
            (a, b) => {

                if (
                    a.requiredHack !==
                    b.requiredHack
                ) {

                    return (
                        a.requiredHack -
                        b.requiredHack
                    );
                }


                return (
                    a.server.localeCompare(
                        b.server
                    )
                );
            }
        );


        // ========================================================
        // WINDOW TITLE
        // ========================================================

        ns.ui.setTailTitle(

            `ALL SERVERS  |  ` +

            `Hack ${playerHackLevel}  |  ` +

            `Cash ${formatMoney(ns, playerMoney)}  |  ` +

            `Ports ${portsAvailable}/5  |  ` +

            `Servers ${serverData.length}`
        );


        // ========================================================
        // BUILD DISPLAY
        // ========================================================

        const lines = [];


        const width =
            168;


        lines.push("");


        lines.push(
            "BITBURNER // ALL NETWORK SERVERS"
        );


        lines.push(
            "═".repeat(
                width
            )
        );


        lines.push(

            `Hack Level: ${playerHackLevel}`
                .padEnd(25) +

            `Cash: ${formatMoney(ns, playerMoney)}`
                .padEnd(30) +

            `Port Crackers: ${portsAvailable}/5`
                .padEnd(25) +

            `Servers Found: ${serverData.length}`
        );


        lines.push(
            "═".repeat(
                width
            )
        );


        lines.push("");


        // ========================================================
        // TABLE HEADER
        // ========================================================

        lines.push(

            "SERVER".padEnd(25) +

            "HACK".padStart(7) +

            "ADMIN".padStart(9) +

            "PORTS".padStart(9) +

            "LVL OK".padStart(9) +

            "PORT OK".padStart(10) +

            "MAX MONEY".padStart(16) +

            "AVAILABLE".padStart(16) +

            "SCRIPTS".padStart(9) +

            "USED RAM".padStart(14) +

            "FREE RAM".padStart(14) +

            "TOTAL RAM".padStart(14) +

            "STATUS".padStart(18)
        );


        lines.push(
            "─".repeat(
                width
            )
        );


        // ========================================================
        // SERVER ROWS
        // ========================================================

        for (
            const data
            of serverData
        ) {

            const levelText =
                data.hackReady
                    ? "YES"
                    : "NO";


            const portReadyText =
                data.portsReady
                    ? "YES"
                    : "NO";


            const portsText =
                `${data.portsRequired}/${portsAvailable}`;


            // ====================================================
            // ROOTED / ADMIN SERVER
            // ====================================================

            if (
                data.hasAdmin
            ) {

                const row =

                    COLOR.brightCyan +

                    data.server
                        .padEnd(25) +

                    String(
                        data.requiredHack
                    )
                        .padStart(7) +

                    COLOR.boldBrightGreen +

                    "YES"
                        .padStart(9) +

                    COLOR.brightCyan +

                    portsText
                        .padStart(9) +

                    levelText
                        .padStart(9) +

                    portReadyText
                        .padStart(10) +

                    formatMoney(
                        ns,
                        data.maxMoney
                    )
                        .padStart(16) +

                    formatMoney(
                        ns,
                        data.moneyAvailable
                    )
                        .padStart(16) +

                    String(
                        data.scriptCount
                    )
                        .padStart(9) +

                    formatRam(
                        ns,
                        data.usedRam
                    )
                        .padStart(14) +

                    formatRam(
                        ns,
                        data.freeRam
                    )
                        .padStart(14) +

                    formatRam(
                        ns,
                        data.maxRam
                    )
                        .padStart(14) +

                    data.status
                        .padStart(18) +

                    COLOR.reset;


                lines.push(
                    row
                );
            }


            // ====================================================
            // UNROOTED SERVER
            // ====================================================

            else {

                const row =

                    data.server
                        .padEnd(25) +

                    String(
                        data.requiredHack
                    )
                        .padStart(7) +

                    "NO"
                        .padStart(9) +

                    portsText
                        .padStart(9) +

                    levelText
                        .padStart(9) +

                    portReadyText
                        .padStart(10) +

                    formatMoney(
                        ns,
                        data.maxMoney
                    )
                        .padStart(16) +

                    formatMoney(
                        ns,
                        data.moneyAvailable
                    )
                        .padStart(16) +

                    String(
                        data.scriptCount
                    )
                        .padStart(9) +

                    formatRam(
                        ns,
                        data.usedRam
                    )
                        .padStart(14) +

                    formatRam(
                        ns,
                        data.freeRam
                    )
                        .padStart(14) +

                    formatRam(
                        ns,
                        data.maxRam
                    )
                        .padStart(14) +

                    data.status
                        .padStart(18);


                lines.push(
                    row
                );
            }
        }


        // ========================================================
        // SUMMARY
        // ========================================================

        const rootedCount =
            serverData.filter(
                server =>
                    server.hasAdmin
            ).length;


        const unrootedCount =
            serverData.filter(
                server =>
                    !server.hasAdmin
            ).length;


        const readyToRootCount =
            serverData.filter(
                server =>

                    !server.hasAdmin &&

                    server.hackReady &&

                    server.portsReady
            ).length;


        const needLevelCount =
            serverData.filter(
                server =>

                    !server.hasAdmin &&

                    !server.hackReady
            ).length;


        const needPortsCount =
            serverData.filter(
                server =>

                    !server.hasAdmin &&

                    server.hackReady &&

                    !server.portsReady
            ).length;


        const runningScripts =
            serverData.reduce(
                (
                    total,
                    server
                ) =>
                    total +
                    server.scriptCount,
                0
            );


        const totalUsedRam =
            serverData.reduce(
                (
                    total,
                    server
                ) =>
                    total +
                    server.usedRam,
                0
            );


        const totalFreeRam =
            serverData.reduce(
                (
                    total,
                    server
                ) =>
                    total +
                    server.freeRam,
                0
            );


        const totalMaxRam =
            serverData.reduce(
                (
                    total,
                    server
                ) =>
                    total +
                    server.maxRam,
                0
            );


        // ========================================================
        // SUMMARY DISPLAY
        // ========================================================

        lines.push("");


        lines.push(
            "─".repeat(
                width
            )
        );


        lines.push(

            `Servers: ${serverData.length}`
                .padEnd(18) +

            `Rooted: ${rootedCount}`
                .padEnd(18) +

            `Unrooted: ${unrootedCount}`
                .padEnd(20) +

            `Ready to Root: ${readyToRootCount}`
                .padEnd(24) +

            `Need Level: ${needLevelCount}`
                .padEnd(22) +

            `Need Ports: ${needPortsCount}`
        );


        lines.push(

            `Scripts: ${runningScripts}`
                .padEnd(22) +

            `RAM Used: ${formatRam(ns, totalUsedRam)}`
                .padEnd(30) +

            `RAM Free: ${formatRam(ns, totalFreeRam)}`
                .padEnd(30) +

            `Total RAM: ${formatRam(ns, totalMaxRam)}`
        );


        lines.push(
            "─".repeat(
                width
            )
        );


        // ========================================================
        // ANTI-FLICKER DISPLAY
        // ========================================================

        const display =
            lines.join(
                "\n"
            );


        if (
            display !==
            lastDisplay
        ) {

            ns.clearLog();


            ns.print(
                display
            );


            lastDisplay =
                display;
        }


        // ========================================================
        // REFRESH
        // ========================================================

        await ns.sleep(
            REFRESH_MS
        );
    }
}


// ============================================================
// MONEY FORMAT
// ============================================================

function formatMoney(
    ns,
    value
) {

    return (
        "$" +
        ns.format.number(
            value ?? 0,
            2
        )
    );
}


// ============================================================
// RAM FORMAT
// ============================================================

function formatRam(
    ns,
    value
) {

    return ns.format.ram(
        value ?? 0
    );
}