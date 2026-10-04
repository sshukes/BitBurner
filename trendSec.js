/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const SAMPLE_MS = 5000;

    // 1 hour of history at 5-second intervals
    const MAX_SAMPLES = 720;

    const GRAPH_WIDTH = 80;
    const GRAPH_HEIGHT = 18;

    // Extra room above/below the observed range
    const GRAPH_PADDING_PERCENT = 0.20;

    const HISTORY_FILE = "cash-delta-history.txt";

    // ============================================================
    // WINDOW SETUP
    // ============================================================

    ns.ui.openTail();
    ns.ui.resizeTail(1100, 650);

    ns.ui.setTailTitle(
        "💵 PLAYER CASH CHANGE HISTORY"
    );

    // ============================================================
    // LOAD EXISTING HISTORY
    // ============================================================

    let history = [];

    if (
        ns.fileExists(
            HISTORY_FILE,
            "home"
        )
    ) {

        try {

            const data =
                ns.read(
                    HISTORY_FILE
                );

            if (
                data.trim().length > 0
            ) {

                history =
                    JSON.parse(data);

                if (
                    !Array.isArray(history)
                ) {

                    history = [];
                }
            }

        } catch {

            history = [];
        }
    }

    if (
        history.length >
        MAX_SAMPLES
    ) {

        history =
            history.slice(
                -MAX_SAMPLES
            );
    }

    // ============================================================
    // INITIAL CASH SAMPLE
    // ============================================================

    let previousMoney =
        ns.getServerMoneyAvailable(
            "home"
        );

    let previousTime =
        Date.now();

    let lastDisplay = "";

    // Give the monitor a full sample interval before
    // calculating the first delta.
    await ns.sleep(
        SAMPLE_MS
    );

    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        const now =
            Date.now();

        const currentMoney =
            ns.getServerMoneyAvailable(
                "home"
            );

        // ========================================================
        // CALCULATE CASH DELTA
        // ========================================================

        const elapsedSeconds =
            (
                now -
                previousTime
            ) / 1000;

        const moneyChange =
            currentMoney -
            previousMoney;

        const cashDeltaPerSecond =
            elapsedSeconds > 0
                ? moneyChange /
                  elapsedSeconds
                : 0;

        // ========================================================
        // STORE SAMPLE
        // ========================================================

        history.push({
            time: now,
            money: currentMoney,
            change: moneyChange,
            deltaPerSecond:
                cashDeltaPerSecond
        });

        if (
            history.length >
            MAX_SAMPLES
        ) {

            history.shift();
        }

        // ========================================================
        // SAVE HISTORY
        // ========================================================

        await ns.write(
            HISTORY_FILE,
            JSON.stringify(history),
            "w"
        );

        // ========================================================
        // BUILD DISPLAY
        // ========================================================

        const display =
            buildDisplay(
                ns,
                history,
                GRAPH_WIDTH,
                GRAPH_HEIGHT,
                SAMPLE_MS,
                HISTORY_FILE,
                GRAPH_PADDING_PERCENT,
                currentMoney
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
        // PREPARE NEXT SAMPLE
        // ========================================================

        previousMoney =
            currentMoney;

        previousTime =
            now;

        await ns.sleep(
            SAMPLE_MS
        );
    }
}


// ================================================================
// BUILD DASHBOARD
// ================================================================

function buildDisplay(
    ns,
    history,
    graphWidth,
    graphHeight,
    sampleMs,
    historyFile,
    graphPaddingPercent,
    currentMoney
) {

    const lines = [];

    // ============================================================
    // CURRENT VALUE
    // ============================================================

    const latest =
        history.length > 0
            ? history[
                history.length - 1
              ].deltaPerSecond
            : 0;

    // ============================================================
    // STATISTICS
    // ============================================================

    const values =
        history.map(
            sample =>
                sample.deltaPerSecond
        );

    const maxDelta =
        values.length > 0
            ? Math.max(...values)
            : 0;

    const minDelta =
        values.length > 0
            ? Math.min(...values)
            : 0;

    const averageDelta =
        values.length > 0
            ? values.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            values.length
            : 0;

    // ============================================================
    // TOTAL CHANGE DURING STORED HISTORY
    // ============================================================

    let totalCashChange = 0;

    if (
        history.length > 0
    ) {

        totalCashChange =
            history.reduce(
                (sum, sample) =>
                    sum +
                    sample.change,
                0
            );
    }

    // ============================================================
    // HEADER
    // ============================================================

    lines.push("");

    lines.push(
        " PLAYER CASH CHANGE HISTORY"
    );

    lines.push(
        "═".repeat(100)
    );

    lines.push(
        ` Cash       : ${formatMoney(ns, currentMoney)}`
            .padEnd(35) +
        `Current Δ : ${formatRate(ns, latest)}`
    );

    lines.push(
        ` Average Δ  : ${formatRate(ns, averageDelta)}`
            .padEnd(35) +
        `Peak Gain : ${formatRate(ns, maxDelta)}`
    );

    lines.push(
        ` Peak Loss  : ${formatRate(ns, minDelta)}`
            .padEnd(35) +
        `Net Change: ${formatSignedMoney(ns, totalCashChange)}`
    );

    lines.push(
        ` Sampling every ${(sampleMs / 1000).toFixed(0)} seconds`
    );

    lines.push("");

    lines.push(
        "─".repeat(100)
    );

    lines.push("");

    // ============================================================
    // GRAPH VALUES
    // ============================================================

    const graphValues =
        compressHistory(
            history,
            graphWidth
        );

    let graphMax =
        graphValues.length > 0
            ? Math.max(...graphValues)
            : 1;

    let graphMin =
        graphValues.length > 0
            ? Math.min(...graphValues)
            : -1;

    // ============================================================
    // WIDEN SCALE
    // ============================================================

    const observedRange =
        graphMax -
        graphMin;

    const largestMagnitude =
        Math.max(
            Math.abs(graphMax),
            Math.abs(graphMin),
            1
        );

    const baseRange =
        Math.max(
            observedRange,
            largestMagnitude *
                0.10,
            1
        );

    const padding =
        baseRange *
        graphPaddingPercent;

    graphMax +=
        padding;

    graphMin -=
        padding;

    // ============================================================
    // INCLUDE ZERO IN GRAPH RANGE
    //
    // Important for cash delta because values can be both
    // positive and negative.
    // ============================================================

    graphMax =
        Math.max(
            graphMax,
            0
        );

    graphMin =
        Math.min(
            graphMin,
            0
        );

    if (
        graphMax ===
        graphMin
    ) {

        graphMax = 1;
        graphMin = -1;
    }

    // ============================================================
    // GRAPH
    // ============================================================

    for (
        let row =
            graphHeight - 1;

        row >= 0;

        row--
    ) {

        const rowTop =
            graphMin +
            (
                (row + 1) /
                graphHeight
            ) *
            (
                graphMax -
                graphMin
            );

        const rowBottom =
            graphMin +
            (
                row /
                graphHeight
            ) *
            (
                graphMax -
                graphMin
            );

        let graphLine = "";

        for (
            const value
            of graphValues
        ) {

            if (
                value >=
                rowTop
            ) {

                graphLine += "█";

            } else if (
                value >=
                rowBottom
            ) {

                graphLine += "▄";

            } else {

                graphLine += " ";
            }
        }

        // ========================================================
        // Y AXIS LABELS
        // ========================================================

        let label = "";

        if (
            row ===
            graphHeight - 1
        ) {

            label =
                formatRate(
                    ns,
                    graphMax
                );

        } else if (
            row ===
            Math.floor(
                graphHeight *
                0.75
            )
        ) {

            label =
                formatRate(
                    ns,
                    graphMin +
                    (
                        graphMax -
                        graphMin
                    ) *
                    0.75
                );

        } else if (
            row ===
            Math.floor(
                graphHeight *
                0.50
            )
        ) {

            label =
                formatRate(
                    ns,
                    graphMin +
                    (
                        graphMax -
                        graphMin
                    ) *
                    0.50
                );

        } else if (
            row ===
            Math.floor(
                graphHeight *
                0.25
            )
        ) {

            label =
                formatRate(
                    ns,
                    graphMin +
                    (
                        graphMax -
                        graphMin
                    ) *
                    0.25
                );

        } else if (
            row === 0
        ) {

            label =
                formatRate(
                    ns,
                    graphMin
                );
        }

        lines.push(
            label.padStart(16) +
            " │" +
            graphLine
        );
    }

    // ============================================================
    // X AXIS
    // ============================================================

    lines.push(
        " ".repeat(17) +
        "└" +
        "─".repeat(
            graphValues.length
        )
    );

    // ============================================================
    // TIME RANGE
    // ============================================================

    if (
        history.length > 0
    ) {

        const oldest =
            history[0].time;

        const newest =
            history[
                history.length - 1
            ].time;

        const leftTime =
            formatTime(
                oldest
            );

        const rightTime =
            formatTime(
                newest
            );

        const spacing =
            Math.max(
                1,
                graphValues.length -
                leftTime.length -
                rightTime.length
            );

        lines.push(
            " ".repeat(18) +
            leftTime +
            " ".repeat(
                spacing
            ) +
            rightTime
        );
    }

    // ============================================================
    // RECENT SAMPLES
    // ============================================================

    lines.push("");

    lines.push(
        "─".repeat(100)
    );

    lines.push("");

    lines.push(
        " RECENT CASH CHANGES"
    );

    lines.push("");

    lines.push(
        "TIME".padEnd(12) +
        "CASH".padStart(18) +
        "CHANGE".padStart(18) +
        "$ / SEC".padStart(18)
    );

    lines.push(
        "-".repeat(66)
    );

    const recent =
        history.slice(-8);

    for (
        const sample
        of recent
    ) {

        lines.push(
            formatTime(
                sample.time
            ).padEnd(12) +

            formatMoney(
                ns,
                sample.money
            ).padStart(18) +

            formatSignedMoney(
                ns,
                sample.change
            ).padStart(18) +

            formatRate(
                ns,
                sample.deltaPerSecond
            ).padStart(18)
        );
    }

    lines.push("");

    lines.push(
        `Samples: ${history.length}/${720}`
    );

    lines.push(
        `History file: ${historyFile}`
    );

    lines.push("");

    lines.push(
        "NOTE: Purchases/upgrades appear as negative cash-flow spikes."
    );

    return lines.join("\n");
}


// ================================================================
// COMPRESS HISTORY TO GRAPH WIDTH
// ================================================================

function compressHistory(
    history,
    width
) {

    if (
        history.length === 0
    ) {

        return [];
    }

    if (
        history.length <=
        width
    ) {

        return history.map(
            sample =>
                sample.deltaPerSecond
        );
    }

    const result = [];

    const samplesPerBucket =
        history.length /
        width;

    for (
        let i = 0;
        i < width;
        i++
    ) {

        const start =
            Math.floor(
                i *
                samplesPerBucket
            );

        const end =
            Math.floor(
                (i + 1) *
                samplesPerBucket
            );

        const bucket =
            history.slice(
                start,
                Math.max(
                    start + 1,
                    end
                )
            );

        const average =
            bucket.reduce(
                (sum, sample) =>
                    sum +
                    sample.deltaPerSecond,
                0
            ) /
            bucket.length;

        result.push(
            average
        );
    }

    return result;
}


// ================================================================
// FORMAT NORMAL MONEY
// ================================================================

function formatMoney(
    ns,
    value
) {

    return "$" +
        ns.format.number(
            value,
            2
        );
}


// ================================================================
// FORMAT SIGNED MONEY
// ================================================================

function formatSignedMoney(
    ns,
    value
) {

    const sign =
        value > 0
            ? "+"
            : "";

    return (
        sign +
        "$" +
        ns.format.number(
            value,
            2
        )
    );
}


// ================================================================
// FORMAT $ / SEC
// ================================================================

function formatRate(
    ns,
    value
) {

    const sign =
        value > 0
            ? "+"
            : "";

    return (
        sign +
        "$" +
        ns.format.number(
            value,
            2
        ) +
        "/s"
    );
}


// ================================================================
// FORMAT TIME
// ================================================================

function formatTime(
    timestamp
) {

    const date =
        new Date(
            timestamp
        );

    return (
        String(
            date.getHours()
        ).padStart(
            2,
            "0"
        ) +
        ":" +
        String(
            date.getMinutes()
        ).padStart(
            2,
            "0"
        ) +
        ":" +
        String(
            date.getSeconds()
        ).padStart(
            2,
            "0"
        )
    );
}