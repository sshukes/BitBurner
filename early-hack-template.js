/** @param {NS} ns */
export async function main(ns) {

  ns.disableLog("ALL");


  // ============================================================
  // EARLY GAME SELF-HACK SCRIPT
  // ============================================================
  //
  // Purpose:
  //
  // - Run directly on a server
  // - Target that same server
  // - Root it if possible
  // - Keep security reasonably low
  // - Keep money reasonably high
  // - Hack when the server is healthy enough
  //
  // ============================================================


  const target =
    ns.getHostname();


  // ============================================================
  // SERVER VALIDATION
  // ============================================================

  const maxMoney =
    ns.getServerMaxMoney(
      target
    );


  // Some rooted servers have RAM but no money.
  // There is nothing useful to hack on those servers.

  if (
    maxMoney <= 0
  ) {

    ns.tprint(
      `ERROR: ${target} has no money available to hack.`
    );

    return;
  }


  // ============================================================
  // THRESHOLDS
  // ============================================================

  const moneyThresh =
    maxMoney *
    0.90;


  const securityThresh =
    ns.getServerMinSecurityLevel(
      target
    ) +
    5;


  // ============================================================
  // AVAILABLE PORT PROGRAMS
  // ============================================================

  const programs = [

    {
      file:
        "BruteSSH.exe",

      open:
        server =>
          ns.brutessh(
            server
          )
    },

    {
      file:
        "FTPCrack.exe",

      open:
        server =>
          ns.ftpcrack(
            server
          )
    },

    {
      file:
        "relaySMTP.exe",

      open:
        server =>
          ns.relaysmtp(
            server
          )
    },

    {
      file:
        "HTTPWorm.exe",

      open:
        server =>
          ns.httpworm(
            server
          )
    },

    {
      file:
        "SQLInject.exe",

      open:
        server =>
          ns.sqlinject(
            server
          )
    }
  ];


  // ============================================================
  // ROOT TARGET IF NEEDED
  // ============================================================

  if (
    !ns.hasRootAccess(
      target
    )
  ) {

    const availablePrograms =
      programs.filter(
        program =>
          ns.fileExists(
            program.file,
            "home"
          )
      );


    const portsRequired =
      ns.getServerNumPortsRequired(
        target
      );


    if (
      availablePrograms.length <
      portsRequired
    ) {

      ns.tprint(
        `ERROR: Cannot root ${target}. ` +
        `Need ${portsRequired} ports, ` +
        `but only ${availablePrograms.length} port programs are available.`
      );

      return;
    }


    // Open every port for which we own a program.

    for (
      const program
      of availablePrograms
    ) {

      program.open(
        target
      );
    }


    const rooted =
      ns.nuke(
        target
      );


    if (
      !rooted ||
      !ns.hasRootAccess(
        target
      )
    ) {

      ns.tprint(
        `ERROR: Failed to gain root access on ${target}.`
      );

      return;
    }
  }


  // ============================================================
  // MAIN LOOP
  // ============================================================

  while (true) {

    const currentSecurity =
      ns.getServerSecurityLevel(
        target
      );


    const currentMoney =
      ns.getServerMoneyAvailable(
        target
      );


    // ========================================================
    // STATUS
    // ========================================================

    ns.clearLog();


    ns.print(
      "========================================"
    );


    ns.print(
      `EARLY HACK // ${target}`
    );


    ns.print(
      "========================================"
    );


    ns.print(
      `Security: ${currentSecurity.toFixed(2)}`
    );


    ns.print(
      `Security Limit: ${securityThresh.toFixed(2)}`
    );


    ns.print(
      `Money: ${ns.format.number(currentMoney, 2)}`
    );


    ns.print(
      `Money Target: ${ns.format.number(moneyThresh, 2)}`
    );


    ns.print(
      `Max Money: ${ns.format.number(maxMoney, 2)}`
    );


    ns.print(
      ""
    );


    // ========================================================
    // ACTION SELECTION
    // ========================================================

    if (
      currentSecurity >
      securityThresh
    ) {

      ns.print(
        "Action: WEAKEN"
      );


      await ns.weaken(
        target
      );
    }
    else if (
      currentMoney <
      moneyThresh
    ) {

      ns.print(
        "Action: GROW"
      );


      await ns.grow(
        target
      );
    }
    else {

      ns.print(
        "Action: HACK"
      );


      await ns.hack(
        target
      );
    }
  }
}