/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");

    // ============================================================
    // CONTROL CENTER CONFIGURATION
    //
    // Change filenames here if your actual script names differ.
    // ============================================================

    const sections = [
        {
            title: "MONITORING",
            items: [
                {
                    label: "Server Dashboard",
                    description: "Servers currently running scripts",
                    script: "dashboard.js",
                    icon: "📊"
                },
                {
                    label: "Target Acquisition",
                    description: "Next servers available for rooting/hacking",
                    script: "dashboard_scan.js",
                    icon: "🎯"
                },
                {
                    label: "Cash Trend",
                    description: "Historical player cash delta/sec",
                    script: "trendSec.js",
                    icon: "📈"
                },
                {
                    label: "Zero-RAM Targets",
                    description: "Money targets that must be hacked remotely",
                    script: "zeroRamTargets.js",
                    icon: "💰"
                },
                {
                    label: "Network Scanner",
                    description: "Complete network and server status",
                    script: "scanAllServers.js",
                    icon: "🌐"
                },
                {
                    label: "Running Servers",
                    description: "Servers currently running scripts",
                    script: "scanRunningServers.js",
                    icon: "🖥️"
                }
            ]
        },

        {
            title: "AUTOMATION",
            items: [
                {
                    label: "Central Controller",
                    description: "Automatic rooting and distributed hacking",
                    script: "central-controller.js",
                    icon: "⚙️",
                    controllable: true
                }
            ]
        },

        {
            title: "TOOLS",
            items: [
                {
                    label: "Coding Contracts",
                    description: "Scan network for .cct files",
                    script: "find-contracts.js",
                    icon: "📜"
                },
                {
                    label: "Rooted No-Money Servers",
                    description: "Rooted servers with RAM but no money",
                    script: "scanAdminServers.js",
                    icon: "🔓"
                }
            ]
        }
    ];

    // ============================================================
    // OPTIONAL GLOBAL ALIAS
    //
    // After running this once, you can also type:
    //
    // cc
    //
    // instead of:
    // run control-center.jsx
    // ============================================================

    try {
        ns.ui.alias(
            "cc",
            "run control-center.jsx",
            true
        );
    } catch {}

    // ============================================================
    // RENDER PAGE
    // ============================================================

    ns.ui.renderPage(
        <ControlCenter
            ns={ns}
            sections={sections}
        />
    );

    // ============================================================
    // KEEP SCRIPT ALIVE
    //
    // React buttons still need access to the ns object.
    // ============================================================

    while (true) {
        await ns.sleep(1000000);
    }
}


// =================================================================
// CONTROL CENTER COMPONENT
// =================================================================

function ControlCenter({
    ns,
    sections
}) {

    const [refreshCounter, setRefreshCounter] =
        React.useState(0);

    const [message, setMessage] =
        React.useState(
            "Control Center ready."
        );

    // =============================================================
    // AUTO REFRESH RUNNING STATUS
    // =============================================================

    React.useEffect(() => {

        const timer =
            setInterval(
                () => {
                    setRefreshCounter(
                        value =>
                            value + 1
                    );
                },
                1000
            );

        return () =>
            clearInterval(timer);

    }, []);

    // =============================================================
    // PLAYER INFORMATION
    // =============================================================

    const hackingLevel =
        ns.getHackingLevel();

    const playerMoney =
        ns.getServerMoneyAvailable(
            "home"
        );

    const homeMaxRam =
        ns.getServerMaxRam(
            "home"
        );

    const homeUsedRam =
        ns.getServerUsedRam(
            "home"
        );

    const homeFreeRam =
        Math.max(
            0,
            homeMaxRam -
            homeUsedRam
        );

    const ports =
        getAvailablePorts(ns);

    // =============================================================
    // SCRIPT HELPERS
    // =============================================================

    function getProcesses(
        filename
    ) {

        return ns.ps("home")
            .filter(
                process =>
                    process.filename ===
                    filename
            );
    }


    function isRunning(
        filename
    ) {

        return (
            getProcesses(
                filename
            ).length > 0
        );
    }


    function scriptExists(
        filename
    ) {

        return ns.fileExists(
            filename,
            "home"
        );
    }


    function openScript(
        filename
    ) {

        const processes =
            getProcesses(
                filename
            );

        if (
            processes.length === 0
        ) {

            setMessage(
                `${filename} is not running.`
            );

            return;
        }

        try {

            ns.ui.openTail(
                processes[0].pid
            );

            setMessage(
                `Opened ${filename}`
            );

        } catch (error) {

            setMessage(
                `Could not open ${filename}`
            );
        }
    }


    function startScript(
        filename
    ) {

        if (
            !scriptExists(
                filename
            )
        ) {

            setMessage(
                `Script not found: ${filename}`
            );

            ns.toast(
                `Missing: ${filename}`,
                "error",
                4000
            );

            return;
        }

        // ---------------------------------------------------------
        // IF ALREADY RUNNING, JUST OPEN IT
        // ---------------------------------------------------------

        const running =
            getProcesses(
                filename
            );

        if (
            running.length > 0
        ) {

            try {

                ns.ui.openTail(
                    running[0].pid
                );

            } catch {}

            setMessage(
                `${filename} is already running.`
            );

            return;
        }

        // ---------------------------------------------------------
        // START SCRIPT
        // ---------------------------------------------------------

        const pid =
            ns.exec(
                filename,
                "home",
                1
            );

        if (
            pid === 0
        ) {

            setMessage(
                `Could not start ${filename}. Check home RAM.`
            );

            ns.toast(
                `Could not start ${filename}`,
                "error",
                4000
            );

            return;
        }

        setMessage(
            `Started ${filename}`
        );

        ns.toast(
            `Started ${filename}`,
            "success",
            2500
        );

        // ---------------------------------------------------------
        // OPEN ITS TAIL WINDOW
        // ---------------------------------------------------------

        try {

            ns.ui.openTail(
                pid
            );

        } catch {}

        setRefreshCounter(
            value =>
                value + 1
        );
    }


    function stopScript(
        filename
    ) {

        const processes =
            getProcesses(
                filename
            );

        if (
            processes.length === 0
        ) {

            setMessage(
                `${filename} is not running.`
            );

            return;
        }

        let stopped =
            0;

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

        setMessage(
            `Stopped ${filename} (${stopped} process${stopped === 1 ? "" : "es"}).`
        );

        ns.toast(
            `Stopped ${filename}`,
            "warning",
            2500
        );

        setRefreshCounter(
            value =>
                value + 1
        );
    }


    // =============================================================
    // STYLES
    // =============================================================

    const pageStyle = {
        padding: "30px",
        width: "100%",
        minHeight: "100vh",
        boxSizing: "border-box",
        fontFamily: "monospace"
    };

    const headerStyle = {
        marginBottom: "28px"
    };

    const titleStyle = {
        fontSize: "30px",
        fontWeight: "700",
        marginBottom: "8px"
    };

    const subtitleStyle = {
        opacity: 0.7,
        fontSize: "14px"
    };

    const statGridStyle = {
        display: "grid",
        gridTemplateColumns:
            "repeat(auto-fit, minmax(170px, 1fr))",
        gap: "12px",
        marginBottom: "30px"
    };

    const statStyle = {
        border: "1px solid #555",
        borderRadius: "8px",
        padding: "12px 16px"
    };

    const statLabelStyle = {
        opacity: 0.65,
        fontSize: "11px",
        marginBottom: "5px"
    };

    const statValueStyle = {
        fontSize: "18px",
        fontWeight: "700"
    };

    const sectionStyle = {
        marginBottom: "32px"
    };

    const sectionTitleStyle = {
        fontSize: "14px",
        fontWeight: "700",
        letterSpacing: "2px",
        opacity: 0.7,
        marginBottom: "12px"
    };

    const gridStyle = {
        display: "grid",
        gridTemplateColumns:
            "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "12px"
    };

    const cardStyle = {
        border: "1px solid #555",
        borderRadius: "10px",
        padding: "16px"
    };

    const cardTopStyle = {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "10px"
    };

    const cardTitleStyle = {
        fontSize: "16px",
        fontWeight: "700"
    };

    const descriptionStyle = {
        opacity: 0.65,
        fontSize: "12px",
        marginTop: "5px",
        lineHeight: "1.4"
    };

    const statusRunningStyle = {
        fontSize: "11px",
        fontWeight: "700",
        padding: "3px 7px",
        borderRadius: "5px",
        border: "1px solid #4caf50"
    };

    const statusStoppedStyle = {
        fontSize: "11px",
        opacity: 0.6,
        padding: "3px 7px",
        borderRadius: "5px",
        border: "1px solid #555"
    };

    const buttonsStyle = {
        display: "flex",
        gap: "8px",
        marginTop: "14px"
    };

    const buttonStyle = {
        padding: "7px 12px",
        cursor: "pointer",
        borderRadius: "5px",
        border: "1px solid #777",
        background: "transparent",
        color: "inherit",
        fontFamily: "inherit"
    };

    const disabledButtonStyle = {
        ...buttonStyle,
        opacity: 0.35,
        cursor: "default"
    };

    const messageStyle = {
        borderTop: "1px solid #555",
        marginTop: "25px",
        paddingTop: "16px",
        opacity: 0.8,
        fontSize: "13px"
    };

    // =============================================================
    // RENDER
    // =============================================================

    return (
        <div style={pageStyle}>

            {/* ====================================================
                HEADER
               ==================================================== */}

            <div style={headerStyle}>

                <div style={titleStyle}>
                    BITBURNER CONTROL CENTER
                </div>

                <div style={subtitleStyle}>
                    Central launcher for monitoring,
                    automation and network utilities
                </div>

            </div>


            {/* ====================================================
                PLAYER STATUS
               ==================================================== */}

            <div style={statGridStyle}>

                <Stat
                    label="HACK LEVEL"
                    value={String(
                        hackingLevel
                    )}
                    styles={{
                        statStyle,
                        statLabelStyle,
                        statValueStyle
                    }}
                />

                <Stat
                    label="CASH"
                    value={
                        "$" +
                        ns.format.number(
                            playerMoney,
                            2
                        )
                    }
                    styles={{
                        statStyle,
                        statLabelStyle,
                        statValueStyle
                    }}
                />

                <Stat
                    label="PORT CRACKERS"
                    value={
                        `${ports}/5`
                    }
                    styles={{
                        statStyle,
                        statLabelStyle,
                        statValueStyle
                    }}
                />

                <Stat
                    label="HOME FREE RAM"
                    value={
                        ns.format.ram(
                            homeFreeRam
                        )
                    }
                    styles={{
                        statStyle,
                        statLabelStyle,
                        statValueStyle
                    }}
                />

            </div>


            {/* ====================================================
                SCRIPT SECTIONS
               ==================================================== */}

            {
                sections.map(
                    section => (

                        <div
                            key={section.title}
                            style={sectionStyle}
                        >

                            <div
                                style={sectionTitleStyle}
                            >
                                {section.title}
                            </div>

                            <div
                                style={gridStyle}
                            >

                                {
                                    section.items.map(
                                        item => {

                                            const exists =
                                                scriptExists(
                                                    item.script
                                                );

                                            const running =
                                                isRunning(
                                                    item.script
                                                );

                                            return (

                                                <div
                                                    key={
                                                        item.script
                                                    }
                                                    style={
                                                        cardStyle
                                                    }
                                                >

                                                    <div
                                                        style={
                                                            cardTopStyle
                                                        }
                                                    >

                                                        <div>

                                                            <div
                                                                style={
                                                                    cardTitleStyle
                                                                }
                                                            >
                                                                {
                                                                    item.icon
                                                                }{" "}
                                                                {
                                                                    item.label
                                                                }
                                                            </div>

                                                            <div
                                                                style={
                                                                    descriptionStyle
                                                                }
                                                            >
                                                                {
                                                                    item.description
                                                                }
                                                            </div>

                                                        </div>


                                                        {/* STATUS */}

                                                        {
                                                            !exists
                                                                ? (
                                                                    <span
                                                                        style={
                                                                            statusStoppedStyle
                                                                        }
                                                                    >
                                                                        MISSING
                                                                    </span>
                                                                )
                                                                :
                                                                running
                                                                    ? (
                                                                        <span
                                                                            style={
                                                                                statusRunningStyle
                                                                            }
                                                                        >
                                                                            RUNNING
                                                                        </span>
                                                                    )
                                                                    : (
                                                                        <span
                                                                            style={
                                                                                statusStoppedStyle
                                                                            }
                                                                        >
                                                                            STOPPED
                                                                        </span>
                                                                    )
                                                        }

                                                    </div>


                                                    {/* SCRIPT NAME */}

                                                    <div
                                                        style={{
                                                            opacity: 0.45,
                                                            fontSize: "11px"
                                                        }}
                                                    >
                                                        {item.script}
                                                    </div>


                                                    {/* BUTTONS */}

                                                    <div
                                                        style={
                                                            buttonsStyle
                                                        }
                                                    >

                                                        <button
                                                            style={
                                                                exists
                                                                    ? buttonStyle
                                                                    : disabledButtonStyle
                                                            }
                                                            disabled={
                                                                !exists
                                                            }
                                                            onClick={
                                                                () =>
                                                                    startScript(
                                                                        item.script
                                                                    )
                                                            }
                                                        >

                                                            {
                                                                running
                                                                    ? "Open"
                                                                    : "Start"
                                                            }

                                                        </button>


                                                        {
                                                            running && (

                                                                <button
                                                                    style={
                                                                        buttonStyle
                                                                    }
                                                                    onClick={
                                                                        () =>
                                                                            openScript(
                                                                                item.script
                                                                            )
                                                                    }
                                                                >
                                                                    Tail
                                                                </button>

                                                            )
                                                        }


                                                        {
                                                            item.controllable &&
                                                            running && (

                                                                <button
                                                                    style={
                                                                        buttonStyle
                                                                    }
                                                                    onClick={
                                                                        () =>
                                                                            stopScript(
                                                                                item.script
                                                                            )
                                                                    }
                                                                >
                                                                    Stop
                                                                </button>

                                                            )
                                                        }

                                                    </div>

                                                </div>
                                            );
                                        }
                                    )
                                }

                            </div>

                        </div>
                    )
                )
            }


            {/* ====================================================
                MESSAGE AREA
               ==================================================== */}

            <div style={messageStyle}>

                STATUS: {message}

                <br />

                Launcher status refreshes automatically
                every second.

            </div>

        </div>
    );
}


// =================================================================
// STAT COMPONENT
// =================================================================

function Stat({
    label,
    value,
    styles
}) {

    return (

        <div
            style={
                styles.statStyle
            }
        >

            <div
                style={
                    styles.statLabelStyle
                }
            >
                {label}
            </div>

            <div
                style={
                    styles.statValueStyle
                }
            >
                {value}
            </div>

        </div>
    );
}


// =================================================================
// AVAILABLE PORT PROGRAMS
// =================================================================

function getAvailablePorts(ns) {

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