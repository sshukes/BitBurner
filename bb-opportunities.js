/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // ============================================================
  // BITBURNER OPPORTUNITY MONITOR
  // ============================================================
  //
  // Watches for:
  //
  //   - Servers that can now be rooted
  //   - Servers that can now be hacked
  //   - Rooted RAM hosts sitting idle
  //   - New coding contracts
  //   - Changes to the best hacking target
  //   - Conflicts between bb-dispatcher workers and older HGW scripts
  //
  // Server names are clickable when AutoLink.exe is available.
  //
  // This script is READ-ONLY.
  //
  // ============================================================


  // ============================================================
  // CONFIGURATION
  // ============================================================

  const CONFIG = {
    refreshMs: 2000,

    windowWidth: 1400,
    windowHeight: 780,

    separatorWidth: 132,

    maxRows: 10,
    maxEvents: 12,

    minimumUsefulRam: 2,

    minimumHackChance: 0.50
  };


  // ============================================================
  // COLORS
  // ============================================================

  const COLOR = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",

    brightWhite: "\x1b[97m",
    brightCyan: "\x1b[96m",
    brightGreen: "\x1b[92m",
    brightYellow: "\x1b[93m",
    brightRed: "\x1b[91m",

    gray: "\x1b[90m"
  };


  // ============================================================
  // PORT PROGRAMS
  // ============================================================

  const PORT_PROGRAMS = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe"
  ];


  // ============================================================
  // DISPATCHER WORKERS
  // ============================================================

  const DISPATCHER_WORKERS = new Set([
    "bb-hack-worker.js",
    "bb-grow-worker.js",
    "bb-weaken-worker.js"
  ]);


  // ============================================================
  // LEGACY HGW SCRIPTS
  // ============================================================

  const LEGACY_SCRIPTS = new Set([
    "early-hack-template.js",
    "local-hack-template.js"
  ]);


  // ============================================================
  // WINDOW
  // ============================================================

  ns.ui.openTail();

  ns.ui.resizeTail(
    CONFIG.windowWidth,
    CONFIG.windowHeight
  );

  ns.ui.setTailTitle(
    "BITBURNER // OPPORTUNITY MONITOR"
  );


  // ============================================================
  // AUTOLINK
  // ============================================================

  const autoLinkAvailable =
    ns.fileExists(
      "AutoLink.exe",
      "home"
    );


  // ============================================================
  // STATE
  // ============================================================

  let previous = null;

  let eventLog = [];

  let lastDisplayKey = "";


  // ============================================================
  // MAIN LOOP
  // ============================================================

  while (true) {

    // --------------------------------------------------------
    // Network + route map
    // --------------------------------------------------------

    const network =
      scanNetworkWithPaths(ns);


    const servers =
      network.servers;


    const paths =
      network.paths;


    const serverSet =
      new Set(servers);


    // ========================================================
    // PLAYER STATE
    // ========================================================

    const hackingLevel =
      ns.getHackingLevel();


    const playerMoney =
      ns.getServerMoneyAvailable(
        "home"
      );


    const portsAvailable =
      PORT_PROGRAMS.filter(
        program =>
          ns.fileExists(
            program,
            "home"
          )
      ).length;


    // ========================================================
    // CURRENT OPPORTUNITIES
    // ========================================================

    const rootableServers = [];

    const hackableServers = [];

    const idleRamHosts = [];

    const contracts = [];


    let rootedCount = 0;

    let totalRam = 0;

    let usedRam = 0;


    // ========================================================
    // SERVER ANALYSIS
    // ========================================================

    for (
      const server
      of servers
    ) {

      if (
        server === "home"
      ) {

        continue;
      }


      const data =
        ns.getServer(
          server
        );


      const rooted =
        data.hasAdminRights;


      const requiredHack =
        data.requiredHackingSkill ?? 0;


      const portsRequired =
        data.numOpenPortsRequired ?? 0;


      const maxMoney =
        data.moneyMax ?? 0;


      const maxRam =
        data.maxRam ?? 0;


      // ====================================================
      // ROOTED
      // ====================================================

      if (rooted) {

        rootedCount++;

        totalRam +=
          maxRam;

        usedRam +=
          data.ramUsed ?? 0;
      }


      // ====================================================
      // ROOTABLE NOW
      // ====================================================

      if (
        !rooted &&
        portsAvailable >=
        portsRequired
      ) {

        rootableServers.push({
          server,

          requiredHack,

          portsRequired,

          maxMoney,

          maxRam,

          canHack:
            hackingLevel >=
            requiredHack
        });
      }


      // ====================================================
      // HACKABLE NOW
      // ====================================================

      if (
        rooted &&
        maxMoney > 0 &&
        hackingLevel >=
        requiredHack
      ) {

        const chance =
          safeHackChance(
            ns,
            server
          );


        hackableServers.push({
          server,

          requiredHack,

          maxMoney,

          money:
            data.moneyAvailable ?? 0,

          chance,

          hackTime:
            safeHackTime(
              ns,
              server
            )
        });
      }


      // ====================================================
      // IDLE RAM HOST
      // ====================================================

      if (
        rooted &&
        maxRam >=
        CONFIG.minimumUsefulRam
      ) {

        const processes =
          ns.ps(server);


        if (
          processes.length === 0
        ) {

          idleRamHosts.push({
            server,
            maxRam
          });
        }
      }


      // ====================================================
      // CODING CONTRACTS
      // ====================================================

      const contractFiles =
        ns.ls(
          server,
          ".cct"
        );


      for (
        const file
        of contractFiles
      ) {

        contracts.push({
          server,

          file,

          id:
            `${server}|${file}`
        });
      }
    }


    // ========================================================
    // HOME RAM
    // ========================================================

    const homeMaxRam =
      ns.getServerMaxRam(
        "home"
      );


    const homeUsedRam =
      ns.getServerUsedRam(
        "home"
      );


    totalRam +=
      homeMaxRam;


    usedRam +=
      homeUsedRam;


    const freeRam =
      Math.max(
        0,
        totalRam -
        usedRam
      );


    const ramUtilization =
      totalRam > 0
        ? (
          usedRam /
          totalRam
        ) * 100
        : 0;


    // ========================================================
    // SORT
    // ========================================================

    rootableServers.sort(
      (a, b) => {

        if (
          a.portsRequired !==
          b.portsRequired
        ) {

          return (
            a.portsRequired -
            b.portsRequired
          );
        }


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
          b.maxMoney -
          a.maxMoney
        );
      }
    );


    hackableServers.sort(
      (a, b) =>
        b.maxMoney -
        a.maxMoney
    );


    idleRamHosts.sort(
      (a, b) =>
        b.maxRam -
        a.maxRam
    );


    // ========================================================
    // BEST TARGET
    // ========================================================

    const bestTarget =
      findBestTarget(
        ns,
        hackableServers,
        CONFIG.minimumHackChance
      );


    // ========================================================
    // DISPATCHER TARGETS
    // ========================================================

    const dispatcherTargets =
      findDispatcherTargets(
        ns,
        servers,
        serverSet,
        DISPATCHER_WORKERS
      );


    // ========================================================
    // CONFLICTS
    // ========================================================

    const conflicts =
      findConflicts(
        ns,
        servers,
        serverSet,
        dispatcherTargets,
        DISPATCHER_WORKERS,
        LEGACY_SCRIPTS
      );


    // ========================================================
    // SNAPSHOT
    // ========================================================

    const current = {

      hackingLevel,

      portsAvailable,

      rootable:
        new Set(
          rootableServers.map(
            item =>
              item.server
          )
        ),

      hackable:
        new Set(
          hackableServers.map(
            item =>
              item.server
          )
        ),

      idleHosts:
        new Set(
          idleRamHosts.map(
            item =>
              item.server
          )
        ),

      contracts:
        new Set(
          contracts.map(
            item =>
              item.id
          )
        ),

      conflicts:
        new Set(
          conflicts.map(
            item =>
              item.id
          )
        ),

      bestTarget:
        bestTarget?.server ??
        null
    };


    // ========================================================
    // CHANGE DETECTION
    // ========================================================

    if (
      previous !== null
    ) {

      // ----------------------------------------------------
      // HACK LEVEL
      // ----------------------------------------------------

      if (
        hackingLevel >
        previous.hackingLevel
      ) {

        addEvent(
          eventLog,
          CONFIG,
          "LEVEL",

          `Hacking level increased: ` +
          `${previous.hackingLevel} → ${hackingLevel}`
        );
      }


      // ----------------------------------------------------
      // PORT PROGRAM
      // ----------------------------------------------------

      if (
        portsAvailable >
        previous.portsAvailable
      ) {

        addEvent(
          eventLog,
          CONFIG,
          "PORT",

          `Port crackers increased: ` +
          `${previous.portsAvailable}/5 → ${portsAvailable}/5`
        );
      }


      // ----------------------------------------------------
      // ROOTABLE
      // ----------------------------------------------------

      for (
        const server
        of current.rootable
      ) {

        if (
          !previous.rootable.has(
            server
          )
        ) {

          addEvent(
            eventLog,
            CONFIG,
            "ROOT",

            `${server} can now be rooted`
          );


          ns.toast(
            `${server} can now be rooted`,
            "success",
            4000
          );
        }
      }


      // ----------------------------------------------------
      // HACKABLE
      // ----------------------------------------------------

      for (
        const server
        of current.hackable
      ) {

        if (
          !previous.hackable.has(
            server
          )
        ) {

          addEvent(
            eventLog,
            CONFIG,
            "HACK",

            `${server} is now hackable`
          );


          ns.toast(
            `${server} is now hackable`,
            "success",
            4000
          );
        }
      }


      // ----------------------------------------------------
      // IDLE RAM
      // ----------------------------------------------------

      for (
        const server
        of current.idleHosts
      ) {

        if (
          !previous.idleHosts.has(
            server
          )
        ) {

          addEvent(
            eventLog,
            CONFIG,
            "RAM",

            `${server} is now idle and has unused RAM`
          );
        }
      }


      // ----------------------------------------------------
      // CONTRACT
      // ----------------------------------------------------

      for (
        const contract
        of contracts
      ) {

        if (
          !previous.contracts.has(
            contract.id
          )
        ) {

          addEvent(
            eventLog,
            CONFIG,
            "CCT",

            `New contract: ` +
            `${contract.server} / ${contract.file}`
          );


          ns.toast(
            `Coding contract found on ${contract.server}`,
            "info",
            5000
          );
        }
      }


      // ----------------------------------------------------
      // BEST TARGET
      // ----------------------------------------------------

      if (
        current.bestTarget &&
        previous.bestTarget &&
        current.bestTarget !==
        previous.bestTarget
      ) {

        addEvent(
          eventLog,
          CONFIG,
          "TARGET",

          `Best target changed: ` +
          `${previous.bestTarget} → ${current.bestTarget}`
        );


        ns.toast(
          `New best target: ${current.bestTarget}`,
          "info",
          4000
        );
      }


      // ----------------------------------------------------
      // CONFLICT
      // ----------------------------------------------------

      for (
        const conflict
        of conflicts
      ) {

        if (
          !previous.conflicts.has(
            conflict.id
          )
        ) {

          addEvent(
            eventLog,
            CONFIG,
            "CONFLICT",

            `${conflict.host}: ` +
            `${conflict.script} also targets ` +
            `${conflict.target}`
          );


          ns.toast(
            `HGW conflict on ${conflict.target}`,
            "warning",
            5000
          );
        }
      }
    }


    // ========================================================
    // FIRST RUN
    // ========================================================

    if (
      previous === null
    ) {

      addEvent(
        eventLog,
        CONFIG,
        "SYSTEM",

        autoLinkAvailable
          ? "Opportunity monitor initialized — clickable links enabled"
          : "Opportunity monitor initialized — AutoLink.exe not available"
      );
    }


    previous =
      current;


    // ========================================================
    // BUILD DISPLAY KEY
    //
    // This is only used to determine whether the window needs
    // to be redrawn.
    // ========================================================

    const displayKey =
      JSON.stringify({

        hackingLevel,

        playerMoney,

        portsAvailable,

        rootedCount,

        totalRam,

        usedRam,

        rootableServers,

        idleRamHosts,

        contracts,

        bestTarget,

        dispatcherTargets:
          [...dispatcherTargets],

        conflicts,

        eventLog
      });


    // ========================================================
    // REDRAW ONLY ON CHANGE
    // ========================================================

    if (
      displayKey !==
      lastDisplayKey
    ) {

      ns.clearLog();


      // ====================================================
      // HEADER
      // ====================================================

      ns.print(
        color(
          "═".repeat(
            CONFIG.separatorWidth
          ),
          COLOR.brightCyan
        )
      );


      ns.print(
        color(
          centerText(
            "BITBURNER // OPPORTUNITY MONITOR",
            CONFIG.separatorWidth
          ),
          COLOR.bold +
          COLOR.brightWhite
        )
      );


      ns.print(
        color(
          "═".repeat(
            CONFIG.separatorWidth
          ),
          COLOR.brightCyan
        )
      );


      // ====================================================
      // PLAYER / NETWORK
      // ====================================================

      printSection(
        ns,
        "PLAYER / NETWORK",
        CONFIG,
        COLOR
      );


      ns.print(

        field(
          "Hack Level",
          hackingLevel,
          24
        ) +

        field(
          "Cash",
          formatMoney(
            ns,
            playerMoney
          ),
          28
        ) +

        field(
          "Ports",
          `${portsAvailable}/5`,
          20
        ) +

        field(
          "Servers",
          servers.length,
          20
        ) +

        field(
          "Rooted",
          rootedCount,
          20
        )
      );


      ns.print(

        field(
          "Network RAM",
          ns.format.ram(
            totalRam
          ),
          28
        ) +

        field(
          "Free RAM",
          ns.format.ram(
            freeRam
          ),
          28
        ) +

        field(
          "Utilization",
          `${ramUtilization.toFixed(1)}%`,
          24
        ) +

        field(
          "Contracts",
          contracts.length,
          24
        )
      );


      ns.print(

        field(
          "AutoLink",
          autoLinkAvailable
            ? "READY"
            : "NOT AVAILABLE",
          28
        )
      );


      // ====================================================
      // CURRENT OPPORTUNITIES
      // ====================================================

      printSection(
        ns,
        "CURRENT OPPORTUNITIES",
        CONFIG,
        COLOR
      );


      ns.print(

        `ROOTABLE: ${rootableServers.length}`
          .padEnd(30) +

        `HACKABLE: ${hackableServers.length}`
          .padEnd(30) +

        `IDLE RAM HOSTS: ${idleRamHosts.length}`
          .padEnd(34) +

        `CONTRACTS: ${contracts.length}`
      );


      // ====================================================
      // BEST TARGET
      // ====================================================

      printSection(
        ns,
        "BEST CURRENT TARGET",
        CONFIG,
        COLOR
      );


      if (
        bestTarget
      ) {

        const rest =
          "  " +

          field(
            "Max Money",
            formatMoney(
              ns,
              bestTarget.maxMoney
            ),
            28
          ) +

          field(
            "Chance",
            `${(bestTarget.chance * 100).toFixed(1)}%`,
            22
          ) +

          field(
            "Hack Time",
            formatTime(
              bestTarget.hackTime
            ),
            22
          ) +

          field(
            "Score",
            formatMoney(
              ns,
              bestTarget.score
            ) + "/sec/T",
            28
          );


        printServerRow(
          ns,
          bestTarget.server,
          paths,
          autoLinkAvailable,
          28,
          rest
        );
      }
      else {

        ns.print(
          color(
            "No viable money target currently available.",
            COLOR.gray
          )
        );
      }


      // ====================================================
      // ROOTABLE NOW
      // ====================================================

      printSection(
        ns,
        "ROOTABLE NOW",
        CONFIG,
        COLOR
      );


      ns.print(

        "SERVER"
          .padEnd(28) +

        "HACK LVL"
          .padStart(12) +

        "PORTS"
          .padStart(10) +

        "MAX MONEY"
          .padStart(18) +

        "RAM"
          .padStart(14) +

        "HACK READY"
          .padStart(14)
      );


      ns.print(
        color(
          "─".repeat(
            CONFIG.separatorWidth
          ),
          COLOR.gray
        )
      );


      if (
        rootableServers.length === 0
      ) {

        ns.print(
          color(
            "No unrooted servers can currently be rooted.",
            COLOR.gray
          )
        );
      }
      else {

        for (
          const item
          of rootableServers.slice(
            0,
            CONFIG.maxRows
          )
        ) {

          const rest =

            item.requiredHack
              .toString()
              .padStart(12) +

            item.portsRequired
              .toString()
              .padStart(10) +

            formatMoney(
              ns,
              item.maxMoney
            )
              .padStart(18) +

            ns.format.ram(
              item.maxRam
            )
              .padStart(14) +

            (
              item.canHack
                ? "YES"
                : "NO"
            )
              .padStart(14);


          printServerRow(
            ns,
            item.server,
            paths,
            autoLinkAvailable,
            28,
            rest
          );
        }
      }


      // ====================================================
      // IDLE RAM
      // ====================================================

      printSection(
        ns,
        "IDLE RAM HOSTS",
        CONFIG,
        COLOR
      );


      if (
        idleRamHosts.length === 0
      ) {

        ns.print(
          color(
            "No completely idle rooted RAM hosts detected.",
            COLOR.brightGreen
          )
        );
      }
      else {

        ns.print(
          "SERVER"
            .padEnd(32) +

          "MAX RAM"
            .padStart(14)
        );


        ns.print(
          color(
            "─".repeat(
              50
            ),
            COLOR.gray
          )
        );


        for (
          const item
          of idleRamHosts.slice(
            0,
            CONFIG.maxRows
          )
        ) {

          const rest =
            ns.format.ram(
              item.maxRam
            )
              .padStart(14);


          printServerRow(
            ns,
            item.server,
            paths,
            autoLinkAvailable,
            32,
            rest
          );
        }
      }


      // ====================================================
      // DISPATCHER SAFETY
      // ====================================================

      printSection(
        ns,
        "DISPATCHER SAFETY",
        CONFIG,
        COLOR
      );


      if (
        dispatcherTargets.size === 0
      ) {

        ns.print(
          color(
            "No bb-dispatcher worker activity detected.",
            COLOR.gray
          )
        );
      }
      else {

        ns.print(
          "Active dispatcher target(s):"
        );


        for (
          const target
          of dispatcherTargets
        ) {

          printServerRow(
            ns,
            target,
            paths,
            autoLinkAvailable,
            32,
            ""
          );
        }


        ns.print("");


        if (
          conflicts.length === 0
        ) {

          ns.print(
            color(
              "✓ No foreign HGW activity detected on dispatcher targets.",
              COLOR.brightGreen
            )
          );
        }
        else {

          ns.print(
            color(
              "⚠ FOREIGN HGW ACTIVITY DETECTED",
              COLOR.brightRed
            )
          );


          ns.print("");


          for (
            const conflict
            of conflicts.slice(
              0,
              CONFIG.maxRows
            )
          ) {

            const rest =
              "  |  " +

              conflict.script +

              "  |  Target: " +
              conflict.target +

              "  |  Threads: " +
              conflict.threads;


            printServerRow(
              ns,
              conflict.host,
              paths,
              autoLinkAvailable,
              28,
              rest
            );
          }
        }
      }


      // ====================================================
      // CODING CONTRACTS
      // ====================================================

      printSection(
        ns,
        "CODING CONTRACTS",
        CONFIG,
        COLOR
      );


      if (
        contracts.length === 0
      ) {

        ns.print(
          color(
            "No coding contracts currently found.",
            COLOR.gray
          )
        );
      }
      else {

        ns.print(
          "SERVER"
            .padEnd(32) +

          "CONTRACT"
        );


        ns.print(
          color(
            "─".repeat(
              CONFIG.separatorWidth
            ),
            COLOR.gray
          )
        );


        for (
          const contract
          of contracts.slice(
            0,
            CONFIG.maxRows
          )
        ) {

          printServerRow(
            ns,
            contract.server,
            paths,
            autoLinkAvailable,
            32,
            contract.file
          );
        }
      }


      // ====================================================
      // RECENT CHANGES
      // ====================================================

      printSection(
        ns,
        "RECENT CHANGES",
        CONFIG,
        COLOR
      );


      if (
        eventLog.length === 0
      ) {

        ns.print(
          color(
            "No recent changes.",
            COLOR.gray
          )
        );
      }
      else {

        for (
          const event
          of eventLog
        ) {

          ns.print(
            formatEvent(
              event,
              COLOR
            )
          );
        }
      }


      // ====================================================
      // FOOTER
      // ====================================================

      ns.print("");


      ns.print(
        color(
          "─".repeat(
            CONFIG.separatorWidth
          ),
          COLOR.gray
        )
      );


      ns.print(
        color(
          `Refresh: ${CONFIG.refreshMs / 1000}s` +
          "  |  Click server names to connect when AutoLink.exe is available",
          COLOR.gray
        )
      );


      lastDisplayKey =
        displayKey;
    }


    // ========================================================
    // WINDOW TITLE
    // ========================================================

    ns.ui.setTailTitle(

      `OPPORTUNITIES  |  ` +

      `Root ${rootableServers.length}  |  ` +

      `Idle ${idleRamHosts.length}  |  ` +

      `CCT ${contracts.length}  |  ` +

      `Conflicts ${conflicts.length}`
    );


    await ns.sleep(
      CONFIG.refreshMs
    );
  }
}


// =================================================================
// CLICKABLE SERVER ROW
// =================================================================
//
// Uses AutoLink.exe via:
//
//     ns.ui.createConnectLink()
//
// The link is printed as React content using ns.printRaw().
//
// =================================================================

function printServerRow(
  ns,
  server,
  paths,
  autoLinkAvailable,
  serverWidth,
  remainingText
) {

  const paddedServer =
    server.padEnd(
      serverWidth
    );


  // -------------------------------------------------------------
  // FALLBACK
  // -------------------------------------------------------------

  if (
    !autoLinkAvailable
  ) {

    ns.print(
      paddedServer +
      remainingText
    );

    return;
  }


  // -------------------------------------------------------------
  // GET ROUTE FROM HOME
  // -------------------------------------------------------------

  const route =
    paths.get(
      server
    );


  if (
    !route
  ) {

    ns.print(
      paddedServer +
      remainingText
    );

    return;
  }


  try {

    const link =
      ns.ui.createConnectLink(
        route,
        paddedServer
      );


    // ReactNode supports arrays of nodes.
    // This lets us keep the rest of the row aligned
    // alongside the clickable server name.

    ns.printRaw([
      link,
      remainingText
    ]);

  }
  catch {

    // If AutoLink or React printing fails for any reason,
    // gracefully fall back to plain text.

    ns.print(
      paddedServer +
      remainingText
    );
  }
}


// =================================================================
// NETWORK SCANNER WITH ROUTES
// =================================================================
//
// paths.get("phantasy") might contain:
//
// [
//     "n00dles",
//     "zer0",
//     "phantasy"
// ]
//
// createConnectLink() converts that into the equivalent sequence:
//
// connect n00dles
// connect zer0
// connect phantasy
//
// =================================================================

function scanNetworkWithPaths(ns) {

  const visited =
    new Set();


  const servers = [];


  const paths =
    new Map();


  // home does not need a connect path.

  paths.set(
    "home",
    []
  );


  // -------------------------------------------------------------
  // BREADTH-FIRST SEARCH
  // -------------------------------------------------------------

  const queue = [

    {
      server: "home",
      path: []
    }
  ];


  visited.add(
    "home"
  );


  while (
    queue.length > 0
  ) {

    const current =
      queue.shift();


    servers.push(
      current.server
    );


    const neighbors =
      ns.scan(
        current.server
      );


    for (
      const neighbor
      of neighbors
    ) {

      if (
        visited.has(
          neighbor
        )
      ) {

        continue;
      }


      visited.add(
        neighbor
      );


      const newPath = [
        ...current.path,
        neighbor
      ];


      paths.set(
        neighbor,
        newPath
      );


      queue.push({

        server:
          neighbor,

        path:
          newPath
      });
    }
  }


  return {
    servers,
    paths
  };
}


// =================================================================
// FIND BEST TARGET
// =================================================================

function findBestTarget(
  ns,
  hackableServers,
  minimumChance
) {

  let best =
    null;


  for (
    const server
    of hackableServers
  ) {

    const chance =
      server.chance;


    if (
      chance <
      minimumChance
    ) {

      continue;
    }


    const hackPercent =
      ns.hackAnalyze(
        server.server
      );


    if (
      hackPercent <= 0
    ) {

      continue;
    }


    const hackTimeSeconds =
      server.hackTime /
      1000;


    if (
      hackTimeSeconds <= 0
    ) {

      continue;
    }


    const expectedMoney =
      server.maxMoney *
      hackPercent *
      chance;


    const score =
      expectedMoney /
      hackTimeSeconds;


    const candidate = {

      ...server,

      hackPercent,

      expectedMoney,

      score
    };


    if (
      !best ||
      candidate.score >
      best.score
    ) {

      best =
        candidate;
    }
  }


  return best;
}


// =================================================================
// FIND DISPATCHER TARGETS
// =================================================================

function findDispatcherTargets(
  ns,
  servers,
  serverSet,
  dispatcherWorkers
) {

  const targets =
    new Set();


  for (
    const host
    of servers
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
        !dispatcherWorkers.has(
          process.filename
        )
      ) {

        continue;
      }


      const target =
        findServerArgument(
          process.args,
          serverSet
        );


      if (target) {

        targets.add(
          target
        );
      }
    }
  }


  return targets;
}


// =================================================================
// FIND CONFLICTS
// =================================================================

function findConflicts(
  ns,
  servers,
  serverSet,
  dispatcherTargets,
  dispatcherWorkers,
  legacyScripts
) {

  const conflicts = [];


  if (
    dispatcherTargets.size === 0
  ) {

    return conflicts;
  }


  for (
    const host
    of servers
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

      // Ignore our dispatcher workers.

      if (
        dispatcherWorkers.has(
          process.filename
        )
      ) {

        continue;
      }


      const filename =
        process.filename
          .toLowerCase();


      const looksLikeHgw =
        filename.includes(
          "hack"
        ) ||

        filename.includes(
          "grow"
        ) ||

        filename.includes(
          "weaken"
        ) ||

        legacyScripts.has(
          process.filename
        );


      if (
        !looksLikeHgw
      ) {

        continue;
      }


      let target =
        findServerArgument(
          process.args,
          serverSet
        );


      // -----------------------------------------------------
      // Old local scripts may attack the machine they
      // physically run on.
      // -----------------------------------------------------

      if (
        !target &&
        legacyScripts.has(
          process.filename
        ) &&
        ns.getServerMaxMoney(
          host
        ) > 0
      ) {

        target =
          host;
      }


      if (
        !target
      ) {

        continue;
      }


      if (
        !dispatcherTargets.has(
          target
        )
      ) {

        continue;
      }


      conflicts.push({

        id:
          `${host}|${process.pid}|${target}`,

        host,

        target,

        script:
          process.filename,

        pid:
          process.pid,

        threads:
          process.threads
      });
    }
  }


  return conflicts;
}


// =================================================================
// FIND SERVER ARGUMENT
// =================================================================

function findServerArgument(
  args,
  serverSet
) {

  if (
    !args
  ) {

    return null;
  }


  for (
    const arg
    of args
  ) {

    const text =
      String(
        arg
      );


    if (
      serverSet.has(
        text
      )
    ) {

      return text;
    }
  }


  return null;
}


// =================================================================
// SAFE HACK CHANCE
// =================================================================

function safeHackChance(
  ns,
  server
) {

  try {

    return (
      ns.hackAnalyzeChance(
        server
      )
    );

  }
  catch {

    return 0;
  }
}


// =================================================================
// SAFE HACK TIME
// =================================================================

function safeHackTime(
  ns,
  server
) {

  try {

    return (
      ns.getHackTime(
        server
      )
    );

  }
  catch {

    return 0;
  }
}


// =================================================================
// EVENT LOG
// =================================================================

function addEvent(
  eventLog,
  CONFIG,
  type,
  text
) {

  eventLog.unshift({

    type,

    text,

    time:
      new Date()
        .toLocaleTimeString()
  });


  if (
    eventLog.length >
    CONFIG.maxEvents
  ) {

    eventLog.length =
      CONFIG.maxEvents;
  }
}


// =================================================================
// EVENT FORMATTER
// =================================================================

function formatEvent(
  event,
  COLOR
) {

  let eventColor =
    COLOR.brightCyan;


  switch (
  event.type
  ) {

    case "ROOT":
    case "HACK":
    case "LEVEL":
    case "PORT":

      eventColor =
        COLOR.brightGreen;

      break;


    case "RAM":
    case "CCT":
    case "TARGET":

      eventColor =
        COLOR.brightYellow;

      break;


    case "CONFLICT":

      eventColor =
        COLOR.brightRed;

      break;


    case "SYSTEM":

      eventColor =
        COLOR.gray;

      break;
  }


  return (
    color(

      `[${event.time}] ` +

      `${event.type.padEnd(8)} ` +

      event.text,

      eventColor
    )
  );
}


// =================================================================
// SECTION
// =================================================================

function printSection(
  ns,
  title,
  CONFIG,
  COLOR
) {

  ns.print("");


  ns.print(
    color(
      `[ ${title} ]`,

      COLOR.bold +
      COLOR.brightCyan
    )
  );


  ns.print(
    color(
      "─".repeat(
        CONFIG.separatorWidth
      ),

      COLOR.gray
    )
  );
}


// =================================================================
// FIELD
// =================================================================

function field(
  label,
  value,
  width
) {

  return (
    `${label}: ${value}`
      .padEnd(
        width
      )
  );
}


// =================================================================
// MONEY
// =================================================================

function formatMoney(
  ns,
  amount
) {

  return (
    "$" +
    ns.format.number(
      amount,
      2
    )
  );
}


// =================================================================
// TIME
// =================================================================

function formatTime(
  milliseconds
) {

  const seconds =
    milliseconds /
    1000;


  if (
    seconds < 60
  ) {

    return (
      seconds.toFixed(1) +
      "s"
    );
  }


  return (
    (
      seconds /
      60
    ).toFixed(1) +
    "m"
  );
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


// =================================================================
// COLOR
// =================================================================

function color(
  text,
  code
) {

  return (
    code +
    text +
    "\x1b[0m"
  );
}