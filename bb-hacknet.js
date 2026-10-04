/** @param {NS} ns */
export async function main(ns) {

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const CASH_RESERVE = 5_000_000;

    const MAX_SPEND_PERCENT = 0.25;

    const MAX_PAYBACK_HOURS = 6;

    const UPDATE_INTERVAL = 5000;

    // Prevent the exact same discarded suggestion from
    // immediately prompting again.
    const DISCARD_COOLDOWN = 60_000;

    // ============================================================
    // SETUP
    // ============================================================

    ns.disableLog("ALL");

    ns.ui.openTail();
    ns.ui.resizeTail(1200, 700);

    ns.ui.setTailTitle(
        "HACKNET MANAGER | ANALYZE + RECOMMEND"
    );

    let sessionSpent = 0;
    let sessionPurchases = 0;

    let lastAction =
        "Analyzing current Hacknet...";

    let discardedSuggestion = null;
    let discardedAt = 0;

    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        // ========================================================
        // ANALYZE CURRENT HACKNET
        // ========================================================

        const state =
            analyzeHacknet(ns);

        const homeMoney =
            ns.getServerMoneyAvailable("home");

        const spendableMoney =
            Math.max(
                0,
                homeMoney - CASH_RESERVE
            );

        const maxPurchase =
            spendableMoney *
            MAX_SPEND_PERCENT;

        // ========================================================
        // BUILD INVESTMENTS
        // ========================================================

        const investments =
            buildInvestments(
                ns,
                state
            );

        investments.sort(
            (a, b) =>
                a.paybackSeconds -
                b.paybackSeconds
        );

        const bestInvestment =
            investments.length > 0
                ? investments[0]
                : null;

        // ========================================================
        // DETERMINE RECOMMENDATION
        // ========================================================

        let recommendation = null;
        let recommendationStatus =
            "No recommendation.";

        if (bestInvestment) {

            const paybackHours =
                bestInvestment.paybackSeconds /
                3600;

            const affordable =
                bestInvestment.cost <=
                    spendableMoney &&
                bestInvestment.cost <=
                    maxPurchase;

            const acceptablePayback =
                bestInvestment.firstNode ||
                paybackHours <=
                    MAX_PAYBACK_HOURS;

            if (
                affordable &&
                acceptablePayback
            ) {

                recommendation =
                    bestInvestment;

                recommendationStatus =
                    "READY FOR APPROVAL";

            } else if (
                !acceptablePayback
            ) {

                recommendationStatus =
                    `HOLD — payback ${formatTime(
                        bestInvestment.paybackSeconds
                    )} exceeds policy`;

            } else {

                recommendationStatus =
                    `WAIT — need more available cash`;
            }
        }

        // ========================================================
        // DISPLAY BEFORE PROMPT
        // ========================================================

        display(
            ns,
            state,
            homeMoney,
            spendableMoney,
            investments,
            recommendation,
            recommendationStatus,
            sessionSpent,
            sessionPurchases,
            lastAction,
            CASH_RESERVE,
            MAX_PAYBACK_HOURS
        );

        // ========================================================
        // USER APPROVAL
        // ========================================================

        if (recommendation) {

            const recommendationId =
                getRecommendationId(
                    recommendation
                );

            const sameAsDiscarded =
                discardedSuggestion ===
                    recommendationId;

            const cooldownActive =
                Date.now() -
                    discardedAt <
                DISCARD_COOLDOWN;

            // ----------------------------------------------------
            // DO NOT IMMEDIATELY REPROMPT A DISCARDED OPTION
            // ----------------------------------------------------

            if (
                sameAsDiscarded &&
                cooldownActive
            ) {

                const remaining =
                    Math.ceil(
                        (
                            DISCARD_COOLDOWN -
                            (
                                Date.now() -
                                discardedAt
                            )
                        ) / 1000
                    );

                lastAction =
                    `Suggestion discarded. ` +
                    `Will reconsider in ${remaining}s.`;

            } else {

                // ------------------------------------------------
                // SHOW RECOMMENDATION IN TERMINAL
                // ------------------------------------------------

                printRecommendation(
                    ns,
                    recommendation
                );

                // ------------------------------------------------
                // ASK USER
                // ------------------------------------------------

                const approved =
                    await ns.prompt(
                        buildPrompt(
                            ns,
                            recommendation
                        ),
                        {
                            type: "boolean"
                        }
                    );

                // =================================================
                // APPLY
                // =================================================

                if (approved) {

                    // Re-check affordability because money could
                    // have changed while the prompt was open.

                    const currentMoney =
                        ns.getServerMoneyAvailable(
                            "home"
                        );

                    const currentSpendable =
                        Math.max(
                            0,
                            currentMoney -
                                CASH_RESERVE
                        );

                    if (
                        recommendation.cost <=
                        currentSpendable
                    ) {

                        const success =
                            executeInvestment(
                                ns,
                                recommendation
                            );

                        if (success) {

                            sessionSpent +=
                                recommendation.cost;

                            sessionPurchases++;

                            lastAction =
                                `APPLIED: ` +
                                `${recommendation.type} ` +
                                `${recommendation.nodeLabel} | ` +
                                `${money(
                                    ns,
                                    recommendation.cost
                                )}`;

                            ns.tprint(
                                `[HACKNET] APPLIED: ` +
                                `${recommendation.type} ` +
                                `${recommendation.nodeLabel} | ` +
                                `${money(
                                    ns,
                                    recommendation.cost
                                )}`
                            );

                            discardedSuggestion =
                                null;

                        } else {

                            lastAction =
                                "Upgrade failed — Hacknet state changed.";

                            ns.tprint(
                                "[HACKNET] Upgrade failed. " +
                                "Hacknet state may have changed."
                            );
                        }

                    } else {

                        lastAction =
                            "Upgrade cancelled — cash changed while awaiting approval.";

                        ns.tprint(
                            "[HACKNET] Upgrade cancelled: " +
                            "insufficient spendable cash."
                        );
                    }

                }

                // =================================================
                // DISCARD
                // =================================================

                else {

                    discardedSuggestion =
                        recommendationId;

                    discardedAt =
                        Date.now();

                    lastAction =
                        `DISCARDED: ` +
                        `${recommendation.type} ` +
                        `${recommendation.nodeLabel}`;

                    ns.tprint(
                        `[HACKNET] DISCARDED: ` +
                        `${recommendation.type} ` +
                        `${recommendation.nodeLabel}`
                    );
                }
            }
        }

        await ns.sleep(
            UPDATE_INTERVAL
        );
    }
}


// ================================================================
// ANALYZE CURRENT HACKNET
// ================================================================

function analyzeHacknet(ns) {

    const nodes = [];

    let totalProduction = 0;
    let totalLevels = 0;
    let totalRam = 0;
    let totalCores = 0;

    const nodeCount =
        ns.hacknet.numNodes();

    for (
        let i = 0;
        i < nodeCount;
        i++
    ) {

        const stats =
            ns.hacknet.getNodeStats(i);

        totalProduction +=
            stats.production;

        totalLevels +=
            stats.level;

        totalRam +=
            stats.ram;

        totalCores +=
            stats.cores;

        nodes.push({
            index: i,
            name: stats.name,
            level: stats.level,
            ram: stats.ram,
            cores: stats.cores,
            production:
                stats.production
        });
    }

    return {
        nodeCount,
        nodes,
        totalProduction,
        totalLevels,
        totalRam,
        totalCores
    };
}


// ================================================================
// BUILD POSSIBLE INVESTMENTS
// ================================================================

function buildInvestments(
    ns,
    state
) {

    const investments = [];

    // ============================================================
    // EXISTING NODES
    // ============================================================

    for (
        const node of state.nodes
    ) {

        const i =
            node.index;

        // --------------------------------------------------------
        // LEVEL
        // --------------------------------------------------------

        const levelCost =
            ns.hacknet.getLevelUpgradeCost(
                i,
                1
            );

        if (
            Number.isFinite(
                levelCost
            )
        ) {

            const newProduction =
                node.production *
                (
                    (node.level + 1) /
                    node.level
                );

            addInvestment(
                investments,
                "LEVEL",
                i,
                node.name,
                levelCost,
                newProduction -
                    node.production
            );
        }

        // --------------------------------------------------------
        // RAM
        // --------------------------------------------------------

        const ramCost =
            ns.hacknet.getRamUpgradeCost(
                i,
                1
            );

        if (
            Number.isFinite(
                ramCost
            )
        ) {

            const newRam =
                node.ram * 2;

            const multiplier =
                Math.pow(
                    1.035,
                    newRam -
                        node.ram
                );

            const newProduction =
                node.production *
                multiplier;

            addInvestment(
                investments,
                "RAM",
                i,
                node.name,
                ramCost,
                newProduction -
                    node.production
            );
        }

        // --------------------------------------------------------
        // CORE
        // --------------------------------------------------------

        const coreCost =
            ns.hacknet.getCoreUpgradeCost(
                i,
                1
            );

        if (
            Number.isFinite(
                coreCost
            )
        ) {

            const multiplier =
                (
                    node.cores +
                    6
                ) /
                (
                    node.cores +
                    5
                );

            const newProduction =
                node.production *
                multiplier;

            addInvestment(
                investments,
                "CORE",
                i,
                node.name,
                coreCost,
                newProduction -
                    node.production
            );
        }
    }

    // ============================================================
    // NEW NODE
    // ============================================================

    const newNodeCost =
        ns.hacknet.getPurchaseNodeCost();

    if (
        Number.isFinite(
            newNodeCost
        )
    ) {

        if (
            state.nodeCount === 0
        ) {

            investments.push({
                type: "NEW",
                node: -1,
                nodeLabel:
                    "New Node",
                cost: newNodeCost,
                productionIncrease: 0,
                paybackSeconds: 0,
                firstNode: true
            });

        } else {

            const newNodeProduction =
                estimateNewNodeProduction(
                    state
                );

            if (
                newNodeProduction > 0
            ) {

                addInvestment(
                    investments,
                    "NEW",
                    -1,
                    "New Node",
                    newNodeCost,
                    newNodeProduction
                );
            }
        }
    }

    return investments;
}


// ================================================================
// ESTIMATE NEW NODE PRODUCTION
// ================================================================

function estimateNewNodeProduction(
    state
) {

    if (
        state.nodes.length === 0
    ) {
        return 0;
    }

    const node =
        state.nodes[0];

    const nodeFactor =
        node.level *
        Math.pow(
            1.035,
            node.ram - 1
        ) *
        (
            (
                node.cores +
                5
            ) /
            6
        );

    if (
        nodeFactor <= 0
    ) {
        return 0;
    }

    return (
        node.production /
        nodeFactor
    );
}


// ================================================================
// ADD INVESTMENT
// ================================================================

function addInvestment(
    investments,
    type,
    node,
    nodeLabel,
    cost,
    productionIncrease
) {

    if (
        !Number.isFinite(cost) ||
        cost <= 0 ||
        productionIncrease <= 0
    ) {
        return;
    }

    const paybackSeconds =
        cost /
        productionIncrease;

    investments.push({
        type,
        node,
        nodeLabel,
        cost,
        productionIncrease,
        paybackSeconds,
        firstNode: false
    });
}


// ================================================================
// EXECUTE INVESTMENT
// ================================================================

function executeInvestment(
    ns,
    investment
) {

    switch (
        investment.type
    ) {

        case "LEVEL":

            return (
                ns.hacknet.upgradeLevel(
                    investment.node,
                    1
                )
            );

        case "RAM":

            return (
                ns.hacknet.upgradeRam(
                    investment.node,
                    1
                )
            );

        case "CORE":

            return (
                ns.hacknet.upgradeCore(
                    investment.node,
                    1
                )
            );

        case "NEW":

            return (
                ns.hacknet.purchaseNode() !==
                -1
            );
    }

    return false;
}


// ================================================================
// TERMINAL RECOMMENDATION
// ================================================================

function printRecommendation(
    ns,
    investment
) {

    ns.tprint("");

    ns.tprint(
        "════════════════ HACKNET RECOMMENDATION ════════════════"
    );

    ns.tprint(
        `Action:     ${investment.type}`
    );

    ns.tprint(
        `Target:     ${investment.nodeLabel}`
    );

    ns.tprint(
        `Cost:       ${money(ns, investment.cost)}`
    );

    if (
        !investment.firstNode
    ) {

        ns.tprint(
            `Income +:   ${money(
                ns,
                investment.productionIncrease
            )}/sec`
        );

        ns.tprint(
            `Payback:    ${formatTime(
                investment.paybackSeconds
            )}`
        );
    }

    ns.tprint(
        "Waiting for user approval..."
    );

    ns.tprint(
        "════════════════════════════════════════════════════════"
    );

    ns.tprint("");
}


// ================================================================
// BUILD CONFIRMATION MESSAGE
// ================================================================

function buildPrompt(
    ns,
    investment
) {

    let message =
        `Hacknet Recommendation\n\n` +
        `Action: ${investment.type}\n` +
        `Target: ${investment.nodeLabel}\n` +
        `Cost: ${money(
            ns,
            investment.cost
        )}\n`;

    if (
        !investment.firstNode
    ) {

        message +=
            `Income increase: ` +
            `${money(
                ns,
                investment.productionIncrease
            )}/sec\n` +

            `Payback: ` +
            `${formatTime(
                investment.paybackSeconds
            )}\n`;
    }

    message +=
        `\nApply this recommendation?\n\n` +
        `YES = Apply\n` +
        `NO = Discard`;

    return message;
}


// ================================================================
// RECOMMENDATION ID
// ================================================================

function getRecommendationId(
    investment
) {

    return (
        `${investment.type}:` +
        `${investment.node}:` +
        `${investment.cost}`
    );
}


// ================================================================
// DISPLAY
// ================================================================

function display(
    ns,
    state,
    homeMoney,
    spendableMoney,
    investments,
    recommendation,
    recommendationStatus,
    sessionSpent,
    sessionPurchases,
    lastAction,
    cashReserve,
    maxPaybackHours
) {

    ns.clearLog();

    // ============================================================
    // HEADER
    // ============================================================

    ns.print(
        "════════════════════════════════════════════════════════════════════════════════════════════════════════"
    );

    ns.print(
        "                                  HACKNET INVESTMENT MANAGER"
    );

    ns.print(
        "════════════════════════════════════════════════════════════════════════════════════════════════════════"
    );

    ns.print("");

    // ============================================================
    // CURRENT STATE
    // ============================================================

    ns.print(
        "CURRENT HACKNET STATE"
    );

    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );

    ns.print(
        `Nodes              : ${state.nodeCount}`
    );

    ns.print(
        `Total Production   : ${money(
            ns,
            state.totalProduction
        )}/sec`
    );

    ns.print(
        `Total Levels       : ${state.totalLevels}`
    );

    ns.print(
        `Total RAM          : ${ns.format.ram(
            state.totalRam
        )}`
    );

    ns.print(
        `Total Cores        : ${state.totalCores}`
    );

    ns.print("");

    ns.print(
        `Home Cash          : ${money(
            ns,
            homeMoney
        )}`
    );

    ns.print(
        `Protected Reserve  : ${money(
            ns,
            cashReserve
        )}`
    );

    ns.print(
        `Spendable Cash     : ${money(
            ns,
            spendableMoney
        )}`
    );

    ns.print("");

    // ============================================================
    // CURRENT NODES
    // ============================================================

    ns.print(
        "CURRENT NODES"
    );

    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );

    ns.print(
        pad("NODE", 18) +
        pad("LEVEL", 10) +
        pad("RAM", 12) +
        pad("CORES", 10) +
        pad("$/SEC", 18) +
        "% TOTAL"
    );

    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );

    for (
        const node of state.nodes
    ) {

        const contribution =
            state.totalProduction > 0
                ? (
                    node.production /
                    state.totalProduction *
                    100
                )
                : 0;

        ns.print(
            pad(
                node.name,
                18
            ) +

            pad(
                node.level,
                10
            ) +

            pad(
                ns.format.ram(
                    node.ram
                ),
                12
            ) +

            pad(
                node.cores,
                10
            ) +

            pad(
                money(
                    ns,
                    node.production
                ),
                18
            ) +

            `${contribution.toFixed(1)}%`
        );
    }

    if (
        state.nodeCount === 0
    ) {

        ns.print(
            "No Hacknet nodes currently owned."
        );
    }

    ns.print("");

    // ============================================================
    // RECOMMENDATION
    // ============================================================

    ns.print(
        "CURRENT RECOMMENDATION"
    );

    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );

    ns.print(
        `Status             : ${recommendationStatus}`
    );

    if (
        recommendation
    ) {

        ns.print(
            `Action             : ${recommendation.type}`
        );

        ns.print(
            `Target             : ${recommendation.nodeLabel}`
        );

        ns.print(
            `Cost               : ${money(
                ns,
                recommendation.cost
            )}`
        );

        if (
            !recommendation.firstNode
        ) {

            ns.print(
                `Income Increase    : ${money(
                    ns,
                    recommendation.productionIncrease
                )}/sec`
            );

            ns.print(
                `Payback            : ${formatTime(
                    recommendation.paybackSeconds
                )}`
            );
        }

        ns.print("");

        ns.print(
            "USER ACTION REQUIRED: APPLY or DISCARD"
        );
    }

    ns.print("");

    // ============================================================
    // TOP INVESTMENTS
    // ============================================================

    ns.print(
        "TOP INVESTMENT OPTIONS"
    );

    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );

    ns.print(
        pad("TYPE", 10) +
        pad("NODE", 18) +
        pad("COST", 18) +
        pad("+$/SEC", 18) +
        "PAYBACK"
    );

    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );

    const top =
        investments.slice(
            0,
            8
        );

    for (
        const investment of top
    ) {

        ns.print(
            pad(
                investment.type,
                10
            ) +

            pad(
                investment.nodeLabel,
                18
            ) +

            pad(
                money(
                    ns,
                    investment.cost
                ),
                18
            ) +

            pad(
                investment.firstNode
                    ? "Unknown"
                    : money(
                        ns,
                        investment.productionIncrease
                    ),
                18
            ) +

            (
                investment.firstNode
                    ? "Initial Node"
                    : formatTime(
                        investment.paybackSeconds
                    )
            )
        );
    }

    ns.print("");

    // ============================================================
    // SESSION
    // ============================================================

    ns.print(
        "MANAGER SESSION"
    );

    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );

    ns.print(
        `Purchases Applied   : ${sessionPurchases}`
    );

    ns.print(
        `Session Spending    : ${money(
            ns,
            sessionSpent
        )}`
    );

    ns.print(
        `Last Action         : ${lastAction}`
    );

    ns.print("");

    ns.print(
        `Policy: ${maxPaybackHours}h max payback | ` +
        `25% max investment | ` +
        `${money(
            ns,
            cashReserve
        )} reserve`
    );
}


// ================================================================
// FORMATTING
// ================================================================

function money(
    ns,
    value
) {

    return (
        "$" +
        ns.format.number(
            value,
            2
        )
    );
}


function formatTime(
    seconds
) {

    if (
        !Number.isFinite(
            seconds
        )
    ) {
        return "∞";
    }

    if (
        seconds < 60
    ) {
        return (
            `${seconds.toFixed(0)} sec`
        );
    }

    if (
        seconds < 3600
    ) {
        return (
            `${(
                seconds / 60
            ).toFixed(1)} min`
        );
    }

    if (
        seconds < 86400
    ) {
        return (
            `${(
                seconds / 3600
            ).toFixed(2)} hr`
        );
    }

    return (
        `${(
            seconds / 86400
        ).toFixed(2)} days`
    );
}


function pad(
    value,
    width
) {

    const text =
        String(value);

    if (
        text.length >= width
    ) {

        return (
            text.substring(
                0,
                width - 1
            ) +
            " "
        );
    }

    return (
        text.padEnd(
            width
        )
    );
}