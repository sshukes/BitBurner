/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ============================================================
    // BITBURNER CONTROL CENTER
    // ============================================================
    //
    // Persistent control service + persistent left sidebar menu.
    //
    // START:
    //
    //     run bb-control.js
    //
    // The sidebar then provides:
    //
    //     BB Control
    //       Overview
    //       Targets
    //       Workers
    //       Opportunities
    //       Income
    //       Dispatcher
    //       Open All
    //       Stop Dispatcher
    //
    // Clicking an entry:
    //
    //   - Opens an already-running script's tail
    //   - OR starts the script if it is not running
    //
    // ============================================================


    // ============================================================
    // CONFIG
    // ============================================================

    const CONFIG = {

        refreshMs: 1000,

        windowWidth: 1080,
        windowHeight: 700,

        separatorWidth: 100,

        sidebarHook:
            "sidebar-extra-hook-0",

        sidebarRootId:
            "bb-control-sidebar-root",

        dispatcherDefaults: [
            "--hack",
            0.05,

            "--reserve",
            8,

            "--gap",
            100,

            "--max-batches",
            25
        ]
    };


    // ============================================================
    // MONITORS
    // ============================================================

    const MONITORS = [

        {
            id: "overview",
            name: "Overview",
            script: "bb-overview.js",
            icon: "▣"
        },

        {
            id: "targets",
            name: "Targets",
            script: "bb-targets.js",
            icon: "◎"
        },

        {
            id: "workers",
            name: "Workers",
            script: "bb-workers.js",
            icon: "▤"
        },

        {
            id: "opportunities",
            name: "Opportunities",
            script: "bb-opportunities.js",
            icon: "!"
        },

        {
            id: "income",
            name: "Income",
            script: "bb-income.js",
            icon: "$"
        }
    ];


    // ============================================================
    // UTILITY SCRIPTS
    // ============================================================

    const UTILITIES = [

        {
            id: "dashboard",
            name: "Dashboard",
            scripts: [
                "dashboard.js"
            ]
        },

        {
            id: "scan",
            name: "Server Scan",
            scripts: [
                "scanAllServers.js"
            ]
        },

        {
            id: "zero",
            name: "Zero-RAM Targets",
            scripts: [
                "zeroRamTargets.js"
            ]
        },

        {
            id: "contracts",
            name: "Contracts",
            scripts: [
                "find-contracts.js",
                "findContracts.js"
            ]
        }
    ];


    // ============================================================
    // SUITE SCRIPTS
    // ============================================================

    const SUITE = [

        "bb-overview.js",
        "bb-targets.js",
        "bb-workers.js",
        "bb-opportunities.js",
        "bb-income.js",

        "bb-dispatcher.js",

        "bb-hack-worker.js",
        "bb-grow-worker.js",
        "bb-weaken-worker.js"
    ];


    // ============================================================
    // ONLY ALLOW ONE CONTROL INSTANCE
    // ============================================================

    const existing =
        findOtherControlProcess(
            ns
        );


    if (existing) {

        try {

            ns.ui.openTail(
                existing.pid
            );

        }
        catch {
            // Ignore.
        }


        ns.tprint(
            `bb-control.js already running. PID ${existing.pid}`
        );


        return;
    }


    // ============================================================
    // OPEN CONTROL WINDOW
    // ============================================================

    ns.ui.openTail();


    ns.ui.resizeTail(
        CONFIG.windowWidth,
        CONFIG.windowHeight
    );


    ns.ui.setTailTitle(
        "BITBURNER // CONTROL CENTER"
    );


    // ============================================================
    // INSTALL SIDEBAR
    // ============================================================

    installSidebar(
        ns,
        CONFIG,
        MONITORS,
        UTILITIES
    );


    // ============================================================
    // CLEANUP
    // ============================================================

    ns.atExit(
        () => {

            removeSidebar(
                CONFIG
            );
        }
    );


    // ============================================================
    // STATE
    // ============================================================

    let lastDisplay = "";

    let lastAction =
        "Control center started";


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        // ========================================================
        // SIDEBAR MAY GET REBUILT BY GAME UI
        // ========================================================

        ensureSidebar(
            ns,
            CONFIG,
            MONITORS,
            UTILITIES
        );


        // ========================================================
        // READ SIDEBAR COMMAND
        // ========================================================

        const root =
            document.getElementById(
                CONFIG.sidebarRootId
            );


        if (
            root &&
            root.dataset.command
        ) {

            const command =
                root.dataset.command;


            root.dataset.command =
                "";


            lastAction =
                await executeSidebarCommand(
                    ns,
                    command,
                    CONFIG,
                    MONITORS,
                    UTILITIES,
                    SUITE
                );
        }


        // ========================================================
        // NETWORK STATUS
        // ========================================================

        const network =
            scanNetwork(
                ns
            );


        const stats =
            getSystemStats(
                ns,
                network
            );


        const dispatcher =
            findProcessesByScript(
                ns,
                network,
                "bb-dispatcher.js"
            );


        // ========================================================
        // UPDATE SIDEBAR STATES
        // ========================================================

        updateSidebarStates(
            ns,
            CONFIG,
            MONITORS,
            dispatcher.length > 0,
            network
        );


        // ========================================================
        // CONTROL WINDOW DISPLAY
        // ========================================================

        const lines = [];


        lines.push(
            "═".repeat(
                CONFIG.separatorWidth
            )
        );


        lines.push(
            centerText(
                "BITBURNER CONTROL CENTER",
                CONFIG.separatorWidth
            )
        );


        lines.push(
            "═".repeat(
                CONFIG.separatorWidth
            )
        );


        lines.push("");


        lines.push(

            `Hack Level: ${stats.hackLevel}`
                .padEnd(25) +

            `Money: $${ns.format.number(
                stats.money,
                2
            )}`
                .padEnd(34) +

            `Income: $${ns.format.number(
                stats.income,
                2
            )}/sec`
        );


        lines.push(

            `Servers: ${stats.serverCount}`
                .padEnd(25) +

            `Rooted: ${stats.rooted}`
                .padEnd(34) +

            `RAM Used: ${stats.ramPercent.toFixed(1)}%`
        );


        // ========================================================
        // MONITORS
        // ========================================================

        lines.push("");

        lines.push(
            "[ MONITORS ]"
        );

        lines.push(
            "─".repeat(
                CONFIG.separatorWidth
            )
        );


        for (
            const monitor
            of MONITORS
        ) {

            const running =
                findProcessesByScript(
                    ns,
                    network,
                    monitor.script
                );


            let status;


            if (
                !ns.fileExists(
                    monitor.script,
                    "home"
                )
            ) {

                status =
                    "MISSING";
            }
            else if (
                running.length > 0
            ) {

                status =
                    `RUNNING  PID ${running[0].pid}`;
            }
            else {

                status =
                    "STOPPED";
            }


            lines.push(

                monitor.name
                    .padEnd(22) +

                monitor.script
                    .padEnd(32) +

                status
            );
        }


        // ========================================================
        // DISPATCHER
        // ========================================================

        lines.push("");

        lines.push(
            "[ DISPATCHER ]"
        );

        lines.push(
            "─".repeat(
                CONFIG.separatorWidth
            )
        );


        if (
            dispatcher.length > 0
        ) {

            lines.push(

                "Status: RUNNING"
                    .padEnd(25) +

                `PID: ${dispatcher[0].pid}`
                    .padEnd(20) +

                `Args: ${dispatcher[0].args.join(" ")}`
            );

        }
        else {

            lines.push(
                "Status: STOPPED"
            );
        }


        // ========================================================
        // SIDEBAR HELP
        // ========================================================

        lines.push("");

        lines.push(
            "[ SIDEBAR CONTROL ]"
        );

        lines.push(
            "─".repeat(
                CONFIG.separatorWidth
            )
        );


        lines.push(
            "Use the persistent BB Control menu in the left sidebar."
        );


        lines.push("");

        lines.push(
            "Selecting a monitor:"
        );

        lines.push(
            "  • Opens its existing tail if already running"
        );

        lines.push(
            "  • Starts it automatically if stopped"
        );


        lines.push("");

        lines.push(
            "Dispatcher:"
        );

        lines.push(
            "  • Opens dispatcher if running"
        );

        lines.push(
            "  • Starts dispatcher with conservative defaults if stopped"
        );


        // ========================================================
        // ACTIVITY
        // ========================================================

        lines.push("");

        lines.push(
            "[ LAST ACTION ]"
        );

        lines.push(
            "─".repeat(
                CONFIG.separatorWidth
            )
        );


        lines.push(
            lastAction
        );


        lines.push("");

        lines.push(
            "BB Control remains active while all dashboards remain open."
        );


        // ========================================================
        // REDRAW
        // ========================================================

        const display =
            lines.join("\n");


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
        // WINDOW TITLE
        // ========================================================

        ns.ui.setTailTitle(

            `CONTROL | ` +

            `$${ns.format.number(
                stats.income,
                2
            )}/sec | ` +

            `RAM ${stats.ramPercent.toFixed(0)}% | ` +

            (
                dispatcher.length > 0
                    ? "DISPATCHER ON"
                    : "DISPATCHER OFF"
            )
        );


        await ns.sleep(
            CONFIG.refreshMs
        );
    }
}


// =================================================================
// INSTALL SIDEBAR
// =================================================================

function installSidebar(
    ns,
    CONFIG,
    MONITORS,
    UTILITIES
) {

    const hook =
        document.getElementById(
            CONFIG.sidebarHook
        );


    if (!hook) {

        return false;
    }


    removeSidebar(
        CONFIG
    );


    // =============================================================
    // ROOT
    // =============================================================

    const root =
        document.createElement(
            "div"
        );


    root.id =
        CONFIG.sidebarRootId;


    root.dataset.command =
        "";


    root.style.width =
        "100%";


    root.style.boxSizing =
        "border-box";


    root.style.fontFamily =
        "inherit";


    // =============================================================
    // HEADER
    // =============================================================

    const header =
        document.createElement(
            "button"
        );


    header.id =
        `${CONFIG.sidebarRootId}-header`;


    header.type =
        "button";


    header.style.width =
        "100%";


    header.style.minHeight =
        "46px";


    header.style.border =
        "none";


    header.style.outline =
        "none";


    header.style.background =
        "transparent";


    header.style.color =
        "inherit";


    header.style.font =
        "inherit";


    header.style.display =
        "flex";


    header.style.alignItems =
        "center";


    header.style.padding =
        "8px 16px";


    header.style.cursor =
        "pointer";


    header.style.gap =
        "12px";


    // =============================================================
    // HEADER ICON
    // =============================================================

    const headerIcon =
        document.createElement(
            "span"
        );


    headerIcon.textContent =
        "⚡";


    headerIcon.style.fontSize =
        "20px";


    headerIcon.style.width =
        "28px";


    headerIcon.style.textAlign =
        "center";


    // =============================================================
    // HEADER LABEL
    // =============================================================

    const headerText =
        document.createElement(
            "span"
        );


    headerText.textContent =
        "BB Control";


    headerText.style.flex =
        "1";


    headerText.style.textAlign =
        "left";


    // =============================================================
    // DISPATCHER STATUS
    // =============================================================

    const statusDot =
        document.createElement(
            "span"
        );


    statusDot.id =
        `${CONFIG.sidebarRootId}-dispatcher-status`;


    statusDot.textContent =
        "●";


    statusDot.style.fontSize =
        "10px";


    statusDot.style.color =
        "#777";


    // =============================================================
    // EXPAND ARROW
    // =============================================================

    const arrow =
        document.createElement(
            "span"
        );


    arrow.id =
        `${CONFIG.sidebarRootId}-arrow`;


    arrow.textContent =
        "▾";


    arrow.style.width =
        "18px";


    arrow.style.textAlign =
        "center";


    // =============================================================
    // MENU BODY
    // =============================================================

    const menu =
        document.createElement(
            "div"
        );


    menu.id =
        `${CONFIG.sidebarRootId}-menu`;


    menu.style.display =
        "block";


    menu.style.width =
        "100%";


    // =============================================================
    // HEADER CLICK
    // =============================================================

    header.addEventListener(
        "click",
        () => {

            const open =
                menu.style.display !==
                "none";


            if (open) {

                menu.style.display =
                    "none";


                arrow.textContent =
                    "▸";
            }
            else {

                menu.style.display =
                    "block";


                arrow.textContent =
                    "▾";
            }
        }
    );


    addHover(
        header
    );


    header.appendChild(
        headerIcon
    );


    header.appendChild(
        headerText
    );


    header.appendChild(
        statusDot
    );


    header.appendChild(
        arrow
    );


    root.appendChild(
        header
    );


    // =============================================================
    // CONTROL CENTER WINDOW
    // =============================================================

    addSidebarItem(
        menu,
        "control",
        "▦",
        "Control Center",
        CONFIG
    );


    addDivider(
        menu
    );


    // =============================================================
    // MONITORS
    // =============================================================

    for (
        const monitor
        of MONITORS
    ) {

        addSidebarItem(
            menu,
            monitor.id,
            monitor.icon,
            monitor.name,
            CONFIG
        );
    }


    addDivider(
        menu
    );


    // =============================================================
    // DISPATCHER
    // =============================================================

    addSidebarItem(
        menu,
        "dispatcher",
        "▶",
        "Dispatcher",
        CONFIG
    );


    addSidebarItem(
        menu,
        "stop-dispatcher",
        "■",
        "Stop Dispatcher",
        CONFIG
    );


    addSidebarItem(
        menu,
        "open-all",
        "▦",
        "Open All Monitors",
        CONFIG
    );


    addDivider(
        menu
    );


    // =============================================================
    // UTILITIES
    // =============================================================

    for (
        const utility
        of UTILITIES
    ) {

        addSidebarItem(
            menu,
            utility.id,
            "›",
            utility.name,
            CONFIG
        );
    }


    root.appendChild(
        menu
    );


    hook.appendChild(
        root
    );


    return true;
}


// =================================================================
// ADD SIDEBAR ITEM
// =================================================================

function addSidebarItem(
    menu,
    command,
    iconText,
    labelText,
    CONFIG
) {

    const button =
        document.createElement(
            "button"
        );


    button.id =
        `${CONFIG.sidebarRootId}-item-${command}`;


    button.type =
        "button";


    button.style.width =
        "100%";


    button.style.minHeight =
        "38px";


    button.style.border =
        "none";


    button.style.outline =
        "none";


    button.style.background =
        "transparent";


    button.style.color =
        "inherit";


    button.style.font =
        "inherit";


    button.style.fontSize =
        "13px";


    button.style.display =
        "flex";


    button.style.alignItems =
        "center";


    button.style.gap =
        "10px";


    button.style.padding =
        "6px 18px 6px 30px";


    button.style.cursor =
        "pointer";


    button.style.textAlign =
        "left";


    // =============================================================
    // ICON
    // =============================================================

    const icon =
        document.createElement(
            "span"
        );


    icon.textContent =
        iconText;


    icon.style.width =
        "22px";


    icon.style.textAlign =
        "center";


    // =============================================================
    // LABEL
    // =============================================================

    const label =
        document.createElement(
            "span"
        );


    label.textContent =
        labelText;


    label.style.flex =
        "1";


    // =============================================================
    // STATUS
    // =============================================================

    const status =
        document.createElement(
            "span"
        );


    status.id =
        `${CONFIG.sidebarRootId}-state-${command}`;


    status.textContent =
        "";


    status.style.fontSize =
        "9px";


    status.style.width =
        "12px";


    status.style.textAlign =
        "center";


    // =============================================================
    // CLICK
    // =============================================================

    button.addEventListener(
        "click",
        () => {

            const root =
                document.getElementById(
                    CONFIG.sidebarRootId
                );


            if (
                root
            ) {

                root.dataset.command =
                    command;
            }
        }
    );


    addHover(
        button
    );


    button.appendChild(
        icon
    );


    button.appendChild(
        label
    );


    button.appendChild(
        status
    );


    menu.appendChild(
        button
    );
}


// =================================================================
// ADD DIVIDER
// =================================================================

function addDivider(menu) {

    const divider =
        document.createElement(
            "div"
        );


    divider.style.height =
        "1px";


    divider.style.margin =
        "4px 16px";


    divider.style.background =
        "rgba(255,255,255,0.12)";


    menu.appendChild(
        divider
    );
}


// =================================================================
// HOVER EFFECT
// =================================================================

function addHover(element) {

    element.addEventListener(
        "mouseenter",
        () => {

            element.style.background =
                "rgba(255,255,255,0.08)";
        }
    );


    element.addEventListener(
        "mouseleave",
        () => {

            element.style.background =
                "transparent";
        }
    );
}


// =================================================================
// ENSURE SIDEBAR
// =================================================================

function ensureSidebar(
    ns,
    CONFIG,
    MONITORS,
    UTILITIES
) {

    const existing =
        document.getElementById(
            CONFIG.sidebarRootId
        );


    if (
        existing
    ) {

        return;
    }


    installSidebar(
        ns,
        CONFIG,
        MONITORS,
        UTILITIES
    );
}


// =================================================================
// REMOVE SIDEBAR
// =================================================================

function removeSidebar(CONFIG) {

    const existing =
        document.getElementById(
            CONFIG.sidebarRootId
        );


    if (
        existing
    ) {

        existing.remove();
    }
}


// =================================================================
// UPDATE SIDEBAR STATES
// =================================================================

function updateSidebarStates(
    ns,
    CONFIG,
    MONITORS,
    dispatcherRunning,
    network
) {

    // =============================================================
    // DISPATCHER DOT IN HEADER
    // =============================================================

    const dispatcherStatus =
        document.getElementById(
            `${CONFIG.sidebarRootId}-dispatcher-status`
        );


    if (
        dispatcherStatus
    ) {

        if (
            dispatcherRunning
        ) {

            dispatcherStatus.style.color =
                "#00c853";


            dispatcherStatus.title =
                "Dispatcher running";
        }
        else {

            dispatcherStatus.style.color =
                "#777";


            dispatcherStatus.title =
                "Dispatcher stopped";
        }
    }


    // =============================================================
    // MONITOR STATUS DOTS
    // =============================================================

    for (
        const monitor
        of MONITORS
    ) {

        const status =
            document.getElementById(
                `${CONFIG.sidebarRootId}-state-${monitor.id}`
            );


        if (
            !status
        ) {

            continue;
        }


        const running =
            findProcessesByScript(
                ns,
                network,
                monitor.script
            );


        if (
            running.length > 0
        ) {

            status.textContent =
                "●";


            status.style.color =
                "#00c853";


            status.title =
                "Running";
        }
        else {

            status.textContent =
                "●";


            status.style.color =
                "#666";


            status.title =
                "Stopped";
        }
    }


    // =============================================================
    // DISPATCHER MENU STATUS
    // =============================================================

    const dispatcherMenuStatus =
        document.getElementById(
            `${CONFIG.sidebarRootId}-state-dispatcher`
        );


    if (
        dispatcherMenuStatus
    ) {

        dispatcherMenuStatus.textContent =
            "●";


        dispatcherMenuStatus.style.color =
            dispatcherRunning
                ? "#00c853"
                : "#666";
    }
}


// =================================================================
// EXECUTE SIDEBAR COMMAND
// =================================================================

async function executeSidebarCommand(
    ns,
    command,
    CONFIG,
    MONITORS,
    UTILITIES,
    SUITE
) {

    const network =
        scanNetwork(
            ns
        );


    // =============================================================
    // CONTROL CENTER
    // =============================================================

    if (
        command ===
        "control"
    ) {

        try {

            ns.ui.openTail(
                ns.pid
            );

        }
        catch {
            // Ignore.
        }


        return (
            "Opened BB Control Center"
        );
    }


    // =============================================================
    // MONITOR
    // =============================================================

    const monitor =
        MONITORS.find(
            item =>
                item.id ===
                command
        );


    if (
        monitor
    ) {

        return await openOrStart(
            ns,
            monitor.script,
            monitor.name,
            network
        );
    }


    // =============================================================
    // OPEN ALL
    // =============================================================

    if (
        command ===
        "open-all"
    ) {

        let started = 0;

        let opened = 0;

        let failed = 0;


        for (
            const monitor
            of MONITORS
        ) {

            const currentNetwork =
                scanNetwork(
                    ns
                );


            const running =
                findProcessesByScript(
                    ns,
                    currentNetwork,
                    monitor.script
                );


            if (
                running.length > 0
            ) {

                try {

                    ns.ui.openTail(
                        running[0].pid
                    );


                    opened++;

                }
                catch {

                    failed++;
                }


                continue;
            }


            const pid =
                ns.run(
                    monitor.script,
                    1
                );


            if (
                pid > 0
            ) {

                started++;


                await ns.sleep(
                    100
                );
            }
            else {

                failed++;
            }
        }


        return (
            `Open All: ${started} started, ${opened} opened, ${failed} failed`
        );
    }


    // =============================================================
    // DISPATCHER
    // =============================================================

    if (
        command ===
        "dispatcher"
    ) {

        if (
            !verifyDispatcherWorkers(
                ns
            )
        ) {

            ns.toast(
                "Dispatcher worker files missing",
                "error",
                3500
            );


            return (
                "Dispatcher worker files missing"
            );
        }


        const running =
            findProcessesByScript(
                ns,
                network,
                "bb-dispatcher.js"
            );


        if (
            running.length > 0
        ) {

            try {

                ns.ui.openTail(
                    running[0].pid
                );

            }
            catch {
                // Ignore.
            }


            return (
                `Opened Dispatcher PID ${running[0].pid}`
            );
        }


        const pid =
            ns.run(
                "bb-dispatcher.js",
                1,
                ...CONFIG.dispatcherDefaults
            );


        if (
            pid === 0
        ) {

            ns.toast(
                "Could not start dispatcher",
                "error",
                3500
            );


            return (
                "Dispatcher failed to start"
            );
        }


        ns.toast(
            `Dispatcher started - PID ${pid}`,
            "success",
            2500
        );


        await ns.sleep(
            100
        );


        try {

            ns.ui.openTail(
                pid
            );

        }
        catch {
            // Ignore.
        }


        return (
            `Started Dispatcher PID ${pid}`
        );
    }


    // =============================================================
    // STOP DISPATCHER
    // =============================================================

    if (
        command ===
        "stop-dispatcher"
    ) {

        const scripts = [

            "bb-dispatcher.js",
            "bb-hack-worker.js",
            "bb-grow-worker.js",
            "bb-weaken-worker.js"
        ];


        let stopped = 0;


        for (
            const script
            of scripts
        ) {

            const currentNetwork =
                scanNetwork(
                    ns
                );


            const processes =
                findProcessesByScript(
                    ns,
                    currentNetwork,
                    script
                );


            for (
                const process
                of processes
            ) {

                if (
                    ns.kill(
                        process.pid
                    )
                ) {

                    stopped++;
                }
            }
        }


        ns.toast(
            `Stopped ${stopped} dispatcher process(es)`,
            "warning",
            2500
        );


        return (
            `Stopped ${stopped} dispatcher process(es)`
        );
    }


    // =============================================================
    // UTILITY
    // =============================================================

    const utility =
        UTILITIES.find(
            item =>
                item.id ===
                command
        );


    if (
        utility
    ) {

        let script =
            null;


        for (
            const candidate
            of utility.scripts
        ) {

            if (
                ns.fileExists(
                    candidate,
                    "home"
                )
            ) {

                script =
                    candidate;

                break;
            }
        }


        if (
            !script
        ) {

            return (
                `${utility.name} script not found`
            );
        }


        return await openOrStart(
            ns,
            script,
            utility.name,
            network
        );
    }


    return (
        `Unknown command: ${command}`
    );
}


// =================================================================
// OPEN OR START
// =================================================================

async function openOrStart(
    ns,
    script,
    displayName,
    network
) {

    if (
        !ns.fileExists(
            script,
            "home"
        )
    ) {

        ns.toast(
            `${script} not found`,
            "error",
            3000
        );


        return (
            `${displayName} missing`
        );
    }


    const running =
        findProcessesByScript(
            ns,
            network,
            script
        );


    // =============================================================
    // ALREADY RUNNING
    // =============================================================

    if (
        running.length > 0
    ) {

        try {

            ns.ui.openTail(
                running[0].pid
            );

        }
        catch {
            // Ignore.
        }


        return (
            `Opened ${displayName} PID ${running[0].pid}`
        );
    }


    // =============================================================
    // START SCRIPT
    // =============================================================

    const pid =
        ns.run(
            script,
            1
        );


    if (
        pid === 0
    ) {

        ns.toast(
            `Could not start ${script}`,
            "error",
            3000
        );


        return (
            `${displayName} failed to start`
        );
    }


    ns.toast(
        `${displayName} started`,
        "success",
        2000
    );


    await ns.sleep(
        100
    );


    try {

        ns.ui.openTail(
            pid
        );

    }
    catch {
        // Script may open itself.
    }


    return (
        `Started ${displayName} PID ${pid}`
    );
}


// =================================================================
// FIND OTHER CONTROL PROCESS
// =================================================================

function findOtherControlProcess(ns) {

    const processes =
        ns.ps(
            "home"
        );


    for (
        const process
        of processes
    ) {

        if (
            process.filename !==
            "bb-control.js"
        ) {

            continue;
        }


        if (
            process.pid ===
            ns.pid
        ) {

            continue;
        }


        return process;
    }


    return null;
}


// =================================================================
// VERIFY DISPATCHER WORKERS
// =================================================================

function verifyDispatcherWorkers(ns) {

    const workers = [

        "bb-hack-worker.js",
        "bb-grow-worker.js",
        "bb-weaken-worker.js"
    ];


    return workers.every(
        script =>
            ns.fileExists(
                script,
                "home"
            )
    );
}


// =================================================================
// FIND PROCESSES
// =================================================================

function findProcessesByScript(
    ns,
    network,
    filename
) {

    const results =
        [];


    for (
        const host
        of network
    ) {

        if (
            !ns.hasRootAccess(
                host
            )
        ) {

            continue;
        }


        const processes =
            ns.ps(
                host
            );


        for (
            const process
            of processes
        ) {

            if (
                process.filename !==
                filename
            ) {

                continue;
            }


            results.push({

                ...process,

                host
            });
        }
    }


    return results;
}


// =================================================================
// SYSTEM STATS
// =================================================================

function getSystemStats(
    ns,
    network
) {

    let rooted = 0;

    let maxRam = 0;

    let usedRam = 0;


    for (
        const server
        of network
    ) {

        if (
            !ns.hasRootAccess(
                server
            )
        ) {

            continue;
        }


        rooted++;


        maxRam +=
            ns.getServerMaxRam(
                server
            );


        usedRam +=
            ns.getServerUsedRam(
                server
            );
    }


    return {

        hackLevel:
            ns.getHackingLevel(),

        money:
            ns.getServerMoneyAvailable(
                "home"
            ),

        income:
            ns.getTotalScriptIncome()[0],

        serverCount:
            network.length,

        rooted,

        maxRam,

        usedRam,

        ramPercent:
            maxRam > 0
                ? (
                    usedRam /
                    maxRam
                ) * 100
                : 0
    };
}


// =================================================================
// NETWORK SCAN
// =================================================================

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
            of ns.scan(
                server
            )
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
// CENTER TEXT
// =================================================================

function centerText(
    text,
    width
) {

    const padding =
        Math.max(
            0,

            Math.floor(
                (
                    width -
                    text.length
                ) /
                2
            )
        );


    return (
        " ".repeat(
            padding
        ) +
        text
    );
}