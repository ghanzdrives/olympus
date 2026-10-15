(() => {
  "use strict";

  const STORAGE_KEY = "sudirman-dor-local-v4";
  const LEGACY_KEY = "sudirman-dor-demo-v3";
  const ROWS = 5;
  const COLUMNS = 7;
  const CELL_COUNT = ROWS * COLUMNS;
  const OCCURRENCE_RANGES = [
    { key: "6", min: 6, max: 7 },
    { key: "8", min: 8, max: 9 },
    { key: "10", min: 10, max: 11 },
    { key: "12", min: 12, max: 14 },
    { key: "15", min: 15, max: CELL_COUNT }
  ];
  const DEFAULT_OCCURRENCE_CHANCES = { "6": 10, "8": 8, "10": 3, "12": 0.8, "15": 0.2 };
  const DEFAULT_MULTIPLIER_COUNT_CHANCES = { "2": 0.1, "3": 0.01 };
  const LOW_BET_CHANCE_ADJUSTMENT = { "6": -2, "8": -2, "10": -1, "12": -0.5, "15": -0.2 };
  const MID_BET_CHANCE_ADJUSTMENT = { "6": 2, "8": 2, "10": 1, "12": 0.5, "15": 0.3 };
  const HIGH_BET_CHANCE_ADJUSTMENT = { "6": 4, "8": 4, "10": 2, "12": 1, "15": 0.5 };
  const SUN_VALUES_BY_BET = new Map([
    [200, 15], [500, 40], [1000, 80], [2000, 160], [5000, 400],
    [10000, 800], [20000, 1600], [50000, 4000], [100000, 8000]
  ]);
  const SPIN_DURATION = 1700;
  const MULTIPLIER_DURATION = 1250;
  const WIN_HIGHLIGHT_DURATION = 2200;
  const AUTOPLAY_SPEED_FACTOR = 1.25;
  const MULTIPLIERS = [2, 5, 10, 20, 50, 100];
  const symbols = [
    { tier: 1, name: "Matahari", icon: "☀️", chance: 25, factor: 1 },
    { tier: 2, name: "Bulan", icon: "🌙", chance: 19, factor: 2 },
    { tier: 3, name: "Bintang", icon: "⭐", chance: 15, factor: 4 },
    { tier: 4, name: "Permata", icon: "💎", chance: 12, factor: 7 },
    { tier: 5, name: "Planet", icon: "🪐", chance: 10, factor: 12 },
    { tier: 6, name: "Kristal", icon: "🔮", chance: 7, factor: 20 },
    { tier: 7, name: "Mahkota", icon: "👑", chance: 5, factor: 35 },
    { tier: 8, name: "Trisula", icon: "🔱", chance: 4, factor: 55 },
    { tier: 9, name: "Kuil", icon: "🏛️", chance: 3, factor: 80 }
  ];
  const defaults = {
    balance: 100000,
    bet: 200,
    startingCredit: 100000,
    betLevels: [200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
    winChance: 22,
    multiplierChance: 2,
    multiplierCountChances: { ...DEFAULT_MULTIPLIER_COUNT_CHANCES },
    maxRespins: 10,
    multiplierWeights: [34, 25, 18, 12, 7, 4],
    tiers: symbols.map(({ chance, factor }) => ({ chance, factor })),
    nextWinChance: 22,
    occurrenceChances: { ...DEFAULT_OCCURRENCE_CHANCES },
    nextOccurrenceChances: { ...DEFAULT_OCCURRENCE_CHANCES },
    plays: 0,
    wins: 0,
    net: 0,
    history: []
  };
  const elements = {
    balance: document.querySelector("#balance"),
    betValue: document.querySelector("#bet-value"),
    betOptions: document.querySelector("#bet-options"),
    selectedBetLabel: document.querySelector("#selected-bet-label"),
    autoCount: document.querySelector("#auto-count"),
    autoStart: document.querySelector("#auto-start"),
    autoStop: document.querySelector("#auto-stop"),
    autoStatus: document.querySelector("#auto-status"),
    spin: document.querySelector("#spin"),
    reset: document.querySelector("#reset"),
    clearHistory: document.querySelector("#clear-history"),
    result: document.querySelector("#result"),
    resultIcon: document.querySelector("#result-icon"),
    resultDetail: document.querySelector("#result-detail"),
    pendingCredit: document.querySelector("#pending-credit"),
    plays: document.querySelector("#plays"),
    wins: document.querySelector("#wins"),
    net: document.querySelector("#net"),
    board: document.querySelector("#slot-board"),
    boardWrap: document.querySelector(".board-wrap"),
    roundLabel: document.querySelector("#round-label"),
    spinKind: document.querySelector("#spin-kind"),
    legend: document.querySelector("#symbol-legend"),
    history: document.querySelector("#history-list")
  };

  function boundedNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
  }

  function normalizeMultiplierCountChances(source, totalChance) {
    const chances = Object.fromEntries(["2", "3"].map((count) => [
      count,
      boundedNumber(source?.[count], 0, 100, DEFAULT_MULTIPLIER_COUNT_CHANCES[count])
    ]));
    const countChanceTotal = Object.values(chances).reduce((sum, chance) => sum + chance, 0);
    if (countChanceTotal > totalChance && countChanceTotal > 0) {
      ["2", "3"].forEach((count) => {
        chances[count] = Number((chances[count] * totalChance / countChanceTotal).toFixed(2));
      });
      const roundedTotal = chances["2"] + chances["3"];
      if (roundedTotal > totalChance) {
        const largestCount = chances["2"] >= chances["3"] ? "2" : "3";
        const otherCount = largestCount === "2" ? "3" : "2";
        chances[largestCount] = Math.max(0, Number((totalChance - chances[otherCount]).toFixed(2)));
      }
    }
    return chances;
  }

  function normalizeOccurrenceChances(source, legacyTotal, fallback) {
    let chances;
    if (source && typeof source === "object") {
      chances = Object.fromEntries(OCCURRENCE_RANGES.map(({ key }) => [
        key,
        boundedNumber(source[key], 0, 100, fallback[key])
      ]));
    } else {
      const total = boundedNumber(legacyTotal, 0, 100, Object.values(fallback).reduce((sum, chance) => sum + chance, 0));
      const defaultTotal = Object.values(DEFAULT_OCCURRENCE_CHANCES).reduce((sum, chance) => sum + chance, 0);
      chances = Object.fromEntries(OCCURRENCE_RANGES.map(({ key }) => [
        key,
        Number((DEFAULT_OCCURRENCE_CHANCES[key] * total / defaultTotal).toFixed(1))
      ]));
    }
    if (source && typeof source === "object" && source["6"] === undefined) {
      chances["6"] = Number((boundedNumber(source["8"], 0, 100, fallback["8"]) + 2).toFixed(1));
    }
    const total = Object.values(chances).reduce((sum, chance) => sum + chance, 0);
    if (total > 100) {
      const scale = 100 / total;
      chances = Object.fromEntries(OCCURRENCE_RANGES.map(({ key }) => [key, Number((chances[key] * scale).toFixed(1))]));
      const roundedTotal = Object.values(chances).reduce((sum, chance) => sum + chance, 0);
      const largestKey = OCCURRENCE_RANGES.reduce((largest, { key }) =>
        chances[key] > chances[largest] ? key : largest, OCCURRENCE_RANGES[0].key);
      chances[largestKey] = Number((chances[largestKey] + 100 - roundedTotal).toFixed(1));
    }
    return chances;
  }

  function getTotalOccurrenceChance(chances) {
    return OCCURRENCE_RANGES.reduce((total, { key }) => total + chances[key], 0);
  }

  function getBetAdjustedOccurrenceChances(baseChances, bet) {
    let adjustment = null;
    if (bet < 5000) {
      adjustment = LOW_BET_CHANCE_ADJUSTMENT;
    } else if (bet >= 100000) {
      adjustment = HIGH_BET_CHANCE_ADJUSTMENT;
    } else if (bet >= 10000 && bet <= 50000) {
      adjustment = MID_BET_CHANCE_ADJUSTMENT;
    }
    const chances = { ...baseChances };
    if (!adjustment) return chances;
    const adjusted = Object.fromEntries(OCCURRENCE_RANGES.map(({ key }) => [
      key,
      Number(Math.max(0, Math.min(100, chances[key] + adjustment[key])).toFixed(1))
    ]));
    const total = Object.values(adjusted).reduce((sum, chance) => sum + chance, 0);
    if (total > 100) {
      OCCURRENCE_RANGES.forEach(({ key }) => {
        adjusted[key] = Number((adjusted[key] * 100 / total).toFixed(1));
      });
      const roundedTotal = Object.values(adjusted).reduce((sum, chance) => sum + chance, 0);
      const largestKey = OCCURRENCE_RANGES.reduce((largest, { key }) =>
        adjusted[key] > adjusted[largest] ? key : largest, OCCURRENCE_RANGES[0].key);
      adjusted[largestKey] = Number((adjusted[largestKey] + 100 - roundedTotal).toFixed(1));
    }
    return adjusted;
  }

  function roundMoney(value) {
    return Math.max(0, Number(value.toFixed(2)));
  }

  function formatMoney(value) {
    return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}`;
  }

  function randomInt(max) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return Math.floor((values[0] / 0x100000000) * max);
  }

  function randomFloat() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] / 0x100000000;
  }

  function weightedPick(items, weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) throw new Error("Peluang aktif tidak memiliki bobot positif.");
    let choice = randomFloat() * total;
    for (let index = 0; index < items.length; index += 1) {
      choice -= weights[index];
      if (choice < 0) return items[index];
    }
    return items[items.length - 1];
  }

  function getTierOneValue(bet) {
    return SUN_VALUES_BY_BET.get(bet) ?? bet * 0.08;
  }

  function getSymbolValue(index, bet, tiers = state.tiers) {
    return roundMoney(getTierOneValue(bet) * tiers[index].factor / tiers[0].factor);
  }

  function normalizeTiers(tiers) {
    const total = tiers.reduce((sum, tier) => sum + tier.chance, 0);
    if (total <= 0) return symbols.map(({ chance, factor }) => ({ chance, factor }));
    const normalized = tiers.map((tier) => Number((tier.chance / total * 100).toFixed(1)));
    const sum = normalized.reduce((totalValue, value) => totalValue + value, 0);
    const correction = normalized.indexOf(Math.max(...normalized));
    normalized[correction] = Number((normalized[correction] + 100 - sum).toFixed(1));
    return tiers.map((tier, index) => ({ ...tier, chance: normalized[index] }));
  }

  function loadState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
        if (legacy && typeof legacy === "object") {
          saved = {
            ...defaults,
            winChance: legacy.winChance,
            nextWinChance: legacy.winChance,
            occurrenceChances: null,
            nextOccurrenceChances: null,
            multiplierChance: legacy.multiplierChance,
            maxRespins: legacy.maxRespins,
            multiplierWeights: legacy.multiplierWeights,
            tiers: defaults.tiers.map((tier, index) => ({
              chance: legacy.tiers?.[index]?.chance ?? tier.chance,
              factor: tier.factor
            }))
          };
        }
      }
    } catch (error) {
      console.warn("Pengaturan tersimpan tidak dapat dibaca; nilai awal digunakan.", error);
    }
    if (!saved || typeof saved !== "object") return structuredClone(defaults);

    const betLevels = Array.isArray(saved.betLevels)
      ? [...new Set(saved.betLevels.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b)
      : [...defaults.betLevels];
    const tiers = normalizeTiers(symbols.map((symbol, index) => ({
      chance: boundedNumber(saved.tiers?.[index]?.chance, 0, 100, symbol.chance),
      factor: boundedNumber(saved.tiers?.[index]?.factor, 0.1, 1000, symbol.factor)
    })));
    const multiplierWeights = MULTIPLIERS.map((_, index) =>
      boundedNumber(saved.multiplierWeights?.[index], 0, 100, defaults.multiplierWeights[index])
    );
    if (multiplierWeights.every((weight) => weight === 0)) multiplierWeights[0] = 1;
    const multiplierChance = boundedNumber(saved.multiplierChance, 0, 100, defaults.multiplierChance);
    const multiplierCountChances = normalizeMultiplierCountChances(saved.multiplierCountChances, multiplierChance);
    const startingCredit = boundedNumber(saved.startingCredit, 1000, 1000000000, defaults.startingCredit);
    const occurrenceChances = normalizeOccurrenceChances(
      saved.occurrenceChances,
      saved.winChance,
      defaults.occurrenceChances
    );
    const nextOccurrenceChances = normalizeOccurrenceChances(
      saved.nextOccurrenceChances,
      saved.nextWinChance ?? saved.winChance,
      occurrenceChances
    );
    const state = {
      ...defaults,
      balance: boundedNumber(saved.balance, 0, Number.MAX_SAFE_INTEGER, defaults.balance),
      bet: boundedNumber(saved.bet, 1, Number.MAX_SAFE_INTEGER, defaults.bet),
      startingCredit,
      betLevels: betLevels.length ? betLevels : [...defaults.betLevels],
      occurrenceChances,
      nextOccurrenceChances,
      winChance: getTotalOccurrenceChance(occurrenceChances),
      nextWinChance: getTotalOccurrenceChance(nextOccurrenceChances),
      multiplierChance,
      multiplierCountChances,
      maxRespins: boundedNumber(saved.maxRespins, 0, 50, defaults.maxRespins),
      multiplierWeights,
      tiers,
      plays: boundedNumber(saved.plays, 0, Number.MAX_SAFE_INTEGER, 0),
      wins: boundedNumber(saved.wins, 0, Number.MAX_SAFE_INTEGER, 0),
      net: boundedNumber(saved.net, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0),
      history: Array.isArray(saved.history) ? saved.history.filter((item) => typeof item === "string").slice(0, 20) : []
    };
    if (!state.betLevels.includes(state.bet)) state.bet = state.betLevels[0];
    return state;
  }

  let state = loadState();
  let spinning = false;
  let autoRunning = false;
  let autoStopRequested = false;
  let autoplayRound = false;

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Perubahan tidak dapat disimpan di browser.", error);
      setResult("Pengaturan belum tersimpan.", "Penyimpanan browser gagal. Periksa ruang penyimpanan dan izin situs.");
    }
  }

  function renderBetOptions() {
    elements.betOptions.replaceChildren();
    const levels = state.betLevels;
    levels.forEach((amount) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bet-option${state.bet === amount ? " selected" : ""}`;
      button.textContent = amount >= 1000 ? `${amount / 1000}K` : formatMoney(amount);
      button.setAttribute("aria-pressed", String(state.bet === amount));
      button.disabled = spinning || autoRunning;
      button.addEventListener("click", () => chooseBet(amount));
      elements.betOptions.append(button);
    });
    const maximum = levels[levels.length - 1];
    const maxButton = document.createElement("button");
    maxButton.type = "button";
    maxButton.className = "bet-option bet-max";
    maxButton.textContent = "Maks";
    maxButton.disabled = spinning || autoRunning;
    maxButton.setAttribute("aria-label", `Taruhan maksimum ${formatMoney(maximum)}`);
    maxButton.addEventListener("click", () => chooseBet(maximum));
    elements.betOptions.append(maxButton);
  }

  function chooseBet(amount) {
    if (spinning || autoRunning || !state.betLevels.includes(amount)) return;
    state.bet = amount;
    saveState();
    render();
  }

  function renderLegend() {
    elements.legend.replaceChildren();
    symbols.forEach((symbol, index) => {
      const item = document.createElement("div");
      item.className = `legend-item tier-${symbol.tier}`;
      const icon = document.createElement("span");
      icon.className = "legend-symbol";
      icon.textContent = symbol.icon;
      const text = document.createElement("span");
      text.className = "legend-description";
      const name = document.createElement("strong");
      name.textContent = symbol.name;
      const value = document.createElement("small");
      value.textContent = formatMoney(getSymbolValue(index, state.bet));
      text.append(name, value);
      item.append(icon, text);
      elements.legend.append(item);
    });
  }

  function renderHistory() {
    elements.history.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement("li");
      empty.className = "empty-history";
      empty.textContent = "Belum ada putaran.";
      elements.history.append(empty);
      return;
    }
    state.history.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry;
      elements.history.append(item);
    });
  }

  function render() {
    elements.balance.textContent = formatMoney(state.balance);
    elements.betValue.textContent = formatMoney(state.bet);
    elements.selectedBetLabel.textContent = formatMoney(state.bet);
    elements.plays.textContent = new Intl.NumberFormat("id-ID").format(state.plays);
    elements.wins.textContent = new Intl.NumberFormat("id-ID").format(state.wins);
    elements.net.textContent = `${state.net < 0 ? "−" : state.net > 0 ? "+" : ""}${formatMoney(Math.abs(state.net))}`;
    elements.net.style.color = state.net < 0 ? "#ff9c9c" : state.net > 0 ? "var(--mint)" : "";
    elements.spin.disabled = spinning || autoRunning || state.balance < state.bet;
    elements.spin.innerHTML = spinning ? "MEMUTAR…" : '<span aria-hidden="true">✦</span> PUTAR';
    elements.reset.disabled = spinning || autoRunning;
    elements.autoStart.disabled = spinning || autoRunning || state.balance < state.bet;
    elements.autoStop.hidden = !autoRunning;
    elements.autoCount.disabled = spinning || autoRunning;
    elements.autoStatus.textContent = autoRunning
      ? `Putar otomatis berjalan · ${autoStopRequested ? "berhenti setelah putaran ini" : "tekan Hentikan untuk berhenti"}`
      : `Maksimum 100 putaran per sesi${state.bet > state.balance ? " · saldo tidak cukup untuk taruhan ini" : ""}.`;
    elements.roundLabel.textContent = spinning ? "PUTARAN BERLANGSUNG" : "SIAP · 35 POSISI";
    renderBetOptions();
    renderLegend();
    renderHistory();
  }

  function countWins(board) {
    return symbols.map((symbol) => {
      const positions = [];
      board.forEach((item, index) => {
        if (item.tier === symbol.tier) positions.push(index);
      });
      return { symbol, tier: symbol.tier, count: positions.length, positions };
    }).filter((win) => win.count >= 6);
  }

  function guaranteeWinningSymbol(board, tiers, matchCount) {
    const symbol = weightedPick(symbols, tiers.map((tier) => tier.chance));
    const positions = Array.from({ length: CELL_COUNT }, (_, index) => index);
    for (let index = positions.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      [positions[index], positions[swap]] = [positions[swap], positions[index]];
    }
    board.fill(null);
    positions.slice(0, matchCount).forEach((position) => { board[position] = symbol; });
    const counts = Array(symbols.length).fill(0);
    counts[symbol.tier - 1] = matchCount;
    positions.slice(matchCount).forEach((position) => {
      const candidates = symbols.filter((candidate) =>
        candidate.tier !== symbol.tier && counts[candidate.tier - 1] < 5
      );
      const weightedCandidates = candidates.filter((candidate) => tiers[candidate.tier - 1].chance > 0);
      const available = weightedCandidates.length ? weightedCandidates : candidates;
      const weights = weightedCandidates.length
        ? available.map((candidate) => tiers[candidate.tier - 1].chance)
        : available.map(() => 1);
      const selected = weightedPick(available, weights);
      board[position] = selected;
      counts[selected.tier - 1] += 1;
    });
  }

  function preventWinningSymbols(board, tiers) {
    for (const symbol of symbols) {
      let positions = board.map((item, index) => item.tier === symbol.tier ? index : -1).filter((index) => index >= 0);
      while (positions.length >= 6) {
        const replace = positions[randomInt(positions.length)];
        const candidates = symbols.filter((candidate) =>
          candidate.tier !== symbol.tier &&
          board.filter((item) => item.tier === candidate.tier).length < 5
        );
        if (!candidates.length) break;
        const available = candidates.filter((candidate) => tiers[candidate.tier - 1].chance > 0);
        board[replace] = weightedPick(
          available.length ? available : candidates,
          available.length ? available.map((candidate) => tiers[candidate.tier - 1].chance) : candidates.map(() => 1)
        );
        positions = board.map((item, index) => item.tier === symbol.tier ? index : -1).filter((index) => index >= 0);
      }
    }
  }

  function matchBonusRate(count) {
    if (count >= 15) return 0.15;
    if (count >= 12) return 0.075;
    if (count >= 10) return 0.05;
    return 0;
  }

  function selectWinningRange(occurrenceChances) {
    const choice = randomFloat() * 100;
    let threshold = 0;
    for (const range of OCCURRENCE_RANGES) {
      threshold += occurrenceChances[range.key];
      if (choice < threshold) return range;
    }
    return null;
  }

  function buildRound(settings, occurrenceChances) {
    const board = Array.from({ length: CELL_COUNT }, () =>
      weightedPick(symbols, settings.tiers.map((tier) => tier.chance))
    );
    const winningRange = selectWinningRange(occurrenceChances);
    if (winningRange) {
      const matchCount = winningRange.min + randomInt(winningRange.max - winningRange.min + 1);
      guaranteeWinningSymbol(board, settings.tiers, matchCount);
    } else {
      preventWinningSymbols(board, settings.tiers);
    }
    const wins = countWins(board);
    const eligiblePositions = Array.from({ length: CELL_COUNT }, (_, index) => index)
      .filter((index) => !wins.some((win) => win.positions.includes(index)));
    const multipliers = [];
    const countTwoChance = settings.multiplierCountChances["2"];
    const countThreeChance = settings.multiplierCountChances["3"];
    const countOneChance = Math.max(0, settings.multiplierChance - countTwoChance - countThreeChance);
    const multiplierRoll = randomFloat() * 100;
    if (multiplierRoll < settings.multiplierChance && eligiblePositions.length) {
      const count = multiplierRoll < countOneChance
        ? 1
        : multiplierRoll < countOneChance + countTwoChance ? 2 : 3;
      const cappedCount = Math.min(count, 3, eligiblePositions.length);
      for (let index = 0; index < cappedCount; index += 1) {
        const positionIndex = randomInt(eligiblePositions.length);
        const [position] = eligiblePositions.splice(positionIndex, 1);
        multipliers.push({ position, value: weightedPick(MULTIPLIERS, settings.multiplierWeights) });
      }
    }
    const multiplierProduct = multipliers.reduce((product, item) => product * item.value, 1);
    const basePayout = wins.reduce((total, win) => {
      const symbolValue = getTierOneValue(settings.bet) *
        settings.tiers[win.tier - 1].factor / settings.tiers[0].factor;
      const symbolSubtotal = symbolValue * win.count;
      return total + symbolSubtotal * (1 + matchBonusRate(win.count));
    }, 0);
    const payout = wins.length ? roundMoney(basePayout * multiplierProduct) : 0;
    return { symbols: board, multipliers, wins, multiplierProduct, payout };
  }

  function renderBoard(board) {
    const fragment = document.createDocumentFragment();
    board.forEach((symbol, position) => {
      const rowIndex = Math.floor(position / COLUMNS);
      if (position % COLUMNS === 0) {
        const row = document.createElement("div");
        row.className = "slot-row";
        row.setAttribute("role", "row");
        row.setAttribute("aria-label", `Baris ${rowIndex + 1}`);
        fragment.append(row);
      }
      const cell = document.createElement("div");
      cell.className = `slot-cell tier-${symbol.tier}`;
      cell.dataset.position = String(position);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Baris ${rowIndex + 1}, kolom ${position % COLUMNS + 1}: ${symbol.name}`);
      const face = document.createElement("span");
      face.className = "cell-symbol";
      face.textContent = symbol.icon;
      cell.append(face);
      fragment.lastElementChild.append(cell);
    });
    elements.board.replaceChildren(fragment);
  }

  function drawPreview() {
    renderBoard(Array.from({ length: CELL_COUNT }, () => weightedPick(symbols, state.tiers.map((tier) => tier.chance))));
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function clearMultiplierBadges() {
    elements.board.querySelectorAll(".cell-multiplier").forEach((badge) => badge.remove());
    elements.board.querySelectorAll(".has-multiplier").forEach((cell) => cell.classList.remove("has-multiplier"));
  }

  async function animateMultiplierDrops(multipliers, accelerated) {
    if (!multipliers.length) return;
    const duration = MULTIPLIER_DURATION / (accelerated ? 1.1 : 1);
    for (const multiplier of multipliers) {
      const cell = elements.board.querySelector(`[data-position="${multiplier.position}"]`);
      if (!cell) continue;
      const from = elements.board.getBoundingClientRect();
      const to = cell.getBoundingClientRect();
      const width = Math.max(38, to.width * 0.9);
      const drop = document.createElement("div");
      drop.className = "multiplier-drop";
      drop.textContent = `×${multiplier.value}`;
      drop.style.width = `${width}px`;
      drop.style.left = `${to.left + to.width / 2 - width / 2}px`;
      drop.style.top = `${from.top - width - 10}px`;
      document.body.append(drop);
      const travel = to.top + to.height / 2 - (from.top - width / 2);
      const durationAdjusted = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : duration;
      const animation = drop.animate([
        { transform: "translateY(0) scale(.65)", opacity: 0 },
        { transform: `translateY(${travel * 0.82}px) scale(1.1)`, opacity: 1, offset: 0.78 },
        { transform: `translateY(${travel}px) scale(.94)`, opacity: 1 }
      ], { duration: durationAdjusted, easing: "cubic-bezier(.18,.78,.24,1)", fill: "forwards" });
      await delay(durationAdjusted + 80);
      animation.cancel();
      drop.remove();
      cell.classList.add("has-multiplier");
      const badge = document.createElement("span");
      badge.className = "cell-multiplier";
      badge.textContent = `×${multiplier.value}`;
      cell.append(badge);
    }
  }

  async function animateRound(round, accelerated) {
    elements.board.classList.add("board-spinning");
    const cells = [...elements.board.querySelectorAll(".slot-cell")];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 100 : SPIN_DURATION / (accelerated ? AUTOPLAY_SPEED_FACTOR : 1);
    const lastCellDelay = reducedMotion ? 0 : Math.min(230, duration * 0.14);
    const reelAnimations = [];

    cells.forEach((cell, position) => {
      const target = round.symbols[position];
      const cellHeight = cell.getBoundingClientRect().height;
      const reel = document.createElement("span");
      reel.className = "reel-strip";
      reel.style.setProperty("--cell-height", `${cellHeight}px`);
      const finalFace = document.createElement("span");
      finalFace.className = "cell-symbol reel-symbol";
      finalFace.textContent = target.icon;
      reel.append(finalFace);
      for (let index = 0; index < 11; index += 1) {
        const symbol = symbols[randomInt(symbols.length)];
        const face = document.createElement("span");
        face.className = "cell-symbol reel-symbol";
        face.textContent = symbol.icon;
        reel.append(face);
      }
      cell.className = `slot-cell tier-${target.tier}`;
      cell.replaceChildren(reel);
      const row = Math.floor(position / COLUMNS);
      const column = position % COLUMNS;
      const stagger = reducedMotion ? 0 : lastCellDelay * (row * 0.4 + column) / (ROWS * 0.4 + COLUMNS - 1);
      reelAnimations.push(reel.animate(
        [
          { transform: `translate3d(0, -${cellHeight * 11}px, 0) scale(.94)`, offset: 0 },
          { transform: `translate3d(0, -${cellHeight * 0.8}px, 0) scale(1)`, offset: 0.78, easing: "cubic-bezier(.12,.72,.2,1)" },
          { transform: `translate3d(0, ${cellHeight * 0.08}px, 0) scale(1)`, offset: 0.94, easing: "cubic-bezier(.2,.68,.28,1)" },
          { transform: "translate3d(0, 0, 0) scale(1)", offset: 1 }
        ],
        {
          duration: duration - lastCellDelay,
          delay: stagger,
          easing: "linear",
          fill: "forwards"
        }
      ));
    });

    try {
      await delay(duration + 50);
    } finally {
      reelAnimations.forEach((animation) => animation.cancel());
      elements.board.classList.remove("board-spinning", "auto-speed");
    }
    renderBoard(round.symbols);
    await animateMultiplierDrops(round.multipliers, accelerated);
    if (!round.wins.length) return;

    const matchingCells = [...elements.board.querySelectorAll(".slot-cell")];
    round.wins.forEach((win) => win.positions.forEach((position) => matchingCells[position].classList.add("is-match")));
    await delay(WIN_HIGHLIGHT_DURATION / (accelerated ? 1.2 : 1));
  }

  function setResult(title, detail, kind = "neutral") {
    elements.result.textContent = title;
    elements.resultDetail.textContent = detail;
    elements.resultIcon.textContent = kind === "win" ? "✦" : kind === "loss" ? "◎" : "↻";
    elements.resultIcon.className = kind === "win" ? "result-win" : kind === "loss" ? "result-loss" : "";
  }

  function snapshot() {
    return {
      bet: state.bet,
      occurrenceChances: { ...state.occurrenceChances },
      multiplierChance: state.multiplierChance,
      multiplierCountChances: { ...state.multiplierCountChances },
      maxRespins: state.maxRespins,
      multiplierWeights: [...state.multiplierWeights],
      tiers: state.tiers.map((tier) => ({ ...tier }))
    };
  }

  async function playSession(accelerated = false) {
    if (spinning || state.balance < state.bet) return false;
    spinning = true;
    const settings = snapshot();
    const wager = settings.bet;
    state.balance -= wager;
    state.plays += 1;
    elements.spinKind.textContent = "PUTARAN UTAMA";
    elements.pendingCredit.hidden = true;
    elements.pendingCredit.textContent = "";
    render();
    saveState();

    let totalPayout = 0;
    let matchedCount = 0;
    let freeSpins = 0;
    let multiplierCount = 0;
    let multiplierProduct = 1;
    let capped = false;
    const startingOccurrenceChances = { ...state.nextOccurrenceChances };

    try {
      while (true) {
        const roundChances = getBetAdjustedOccurrenceChances(state.nextOccurrenceChances, settings.bet);
        const round = buildRound(settings, roundChances);
        elements.roundLabel.textContent = `${freeSpins ? `PUTARAN GRATIS ${freeSpins} · ` : ""}MEMUTAR`;
        await animateRound(round, accelerated);
        multiplierCount += round.multipliers.length;
        if (round.wins.length) {
          totalPayout += round.payout;
          matchedCount += round.wins.length;
          multiplierProduct *= round.multiplierProduct;
          state.nextOccurrenceChances = Object.fromEntries(OCCURRENCE_RANGES.map(({ key }) => [
            key,
            Math.max(0, state.nextOccurrenceChances[key] - 3)
          ]));
          state.nextWinChance = getTotalOccurrenceChance(state.nextOccurrenceChances);
          const matchInfo = round.wins.map((win) => `${win.symbol.icon} ${win.symbol.name} ×${win.count}`).join(" · ");
          const multiplierInfo = round.multipliers.length
            ? ` Multiplier ${round.multipliers.map((item) => `×${item.value}`).join(" · ")} aktif (produk ×${new Intl.NumberFormat("id-ID").format(round.multiplierProduct)}).`
            : " Tanpa multiplier.";
          setResult(`Hadiah putaran ${formatMoney(round.payout)}`, `${matchInfo}.${multiplierInfo} Peluang rangkaian berikutnya berkurang 3 poin.`, "win");
          elements.pendingCredit.hidden = false;
          elements.pendingCredit.textContent = `KREDIT VIRTUAL SEMENTARA · ${formatMoney(totalPayout)} · dikreditkan setelah rangkaian selesai`;
          elements.roundLabel.textContent = `MENANG · ${round.wins.map((win) => win.count).join(" / ")} BENTUK`;
        } else {
          state.nextOccurrenceChances = { ...settings.occurrenceChances };
          state.nextWinChance = getTotalOccurrenceChance(settings.occurrenceChances);
          const visibleMultipliers = round.multipliers.map((item) => `×${item.value}`).join(" · ");
          setResult("Belum ada bentuk yang cocok.", `Tidak ada simbol sama yang muncul 6 kali. ${visibleMultipliers ? `Multiplier ${visibleMultipliers} tidak menghasilkan hadiah.` : ""}`, "loss");
        }
        if (round.wins.length && freeSpins < settings.maxRespins) {
          clearMultiplierBadges();
          freeSpins += 1;
          elements.spinKind.textContent = `PUTARAN GRATIS ${freeSpins}/${settings.maxRespins}`;
          await delay(350);
        } else {
          capped = round.wins.length > 0;
          break;
        }
      }
    } catch (error) {
      console.error("Putaran tidak dapat diselesaikan; taruhan dikembalikan.", error);
      state.balance += wager;
      state.plays = Math.max(0, state.plays - 1);
      state.nextOccurrenceChances = startingOccurrenceChances;
      state.nextWinChance = getTotalOccurrenceChance(startingOccurrenceChances);
      spinning = false;
      elements.board.classList.remove("board-spinning", "auto-speed");
      document.querySelectorAll(".multiplier-drop").forEach((drop) => drop.remove());
      elements.pendingCredit.hidden = true;
      elements.pendingCredit.textContent = "";
      elements.spinKind.textContent = "PUTARAN DIBATALKAN";
      setResult("Putaran gagal; taruhan dikembalikan.", "Kesalahan saat memproses hasil. Periksa pengaturan lokal dan coba lagi.");
      saveState();
      render();
      return false;
    }

    state.balance = Number((state.balance + totalPayout).toFixed(2));
    state.wins += matchedCount;
    state.net = Number((state.net + totalPayout - wager).toFixed(2));
    const suffix = capped ? ` · batas ${settings.maxRespins} putaran gratis tercapai` : "";
    const historyEntry = `${formatMoney(totalPayout)} · bet ${formatMoney(wager)} · ${matchedCount} bentuk menang · ${freeSpins} putaran gratis${suffix}`;
    state.history.unshift(historyEntry);
    state.history = state.history.slice(0, 20);
    spinning = false;
    elements.spinKind.textContent = "PUTARAN SELESAI";
    elements.pendingCredit.hidden = true;
    elements.pendingCredit.textContent = "";
    if (totalPayout > 0) {
      const multiplierNote = multiplierCount ? ` · ${multiplierCount} multiplier (produk gabungan ×${new Intl.NumberFormat("id-ID").format(multiplierProduct)})` : "";
      setResult(`Total hadiah ${formatMoney(totalPayout)}`, `${matchedCount} bentuk menang · ${freeSpins} putaran gratis${multiplierNote}${suffix}. Saldo diperbarui setelah rangkaian selesai.`, "win");
    } else {
      setResult("Putaran selesai tanpa hadiah.", `Taruhan ${formatMoney(wager)} digunakan. Saldo: ${formatMoney(state.balance)}.`);
    }
    elements.roundLabel.textContent = "SIAP · 35 POSISI";
    saveState();
    render();
    return true;
  }

  async function startAutoplay() {
    if (autoRunning || spinning) return;
    const requested = Number(elements.autoCount.value);
    const rounds = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.trunc(requested))) : 10;
    elements.autoCount.value = String(rounds);
    autoRunning = true;
    autoStopRequested = false;
    render();
    let completed = 0;
    while (completed < rounds && !autoStopRequested && state.balance >= state.bet) {
      const played = await playSession(true);
      if (!played) break;
      completed += 1;
      render();
      if (completed < rounds && !autoStopRequested && state.balance >= state.bet) await delay(180);
    }
    autoRunning = false;
    const stopped = autoStopRequested;
    autoStopRequested = false;
    render();
    elements.autoStatus.textContent = stopped
      ? `Putar otomatis dihentikan · ${completed}/${rounds} putaran selesai.`
      : `Putar otomatis selesai · ${completed}/${rounds} putaran.`;
  }

  function resetGame() {
    if (spinning || autoRunning) return;
    state.balance = state.startingCredit;
    state.bet = state.betLevels.includes(state.bet) ? state.bet : state.betLevels[0];
    state.nextOccurrenceChances = { ...state.occurrenceChances };
    state.nextWinChance = getTotalOccurrenceChance(state.occurrenceChances);
    state.plays = 0;
    state.wins = 0;
    state.net = 0;
    state.history = [];
    elements.spinKind.textContent = "PUTARAN UTAMA";
    elements.pendingCredit.hidden = true;
    setResult("Saldo permainan telah diatur ulang.", "Saldo virtual kembali ke nilai awal. Pengaturan permainan tetap tersimpan.");
    drawPreview();
    saveState();
    render();
  }

  elements.spin.addEventListener("click", () => playSession(false));
  elements.autoStart.addEventListener("click", startAutoplay);
  elements.autoStop.addEventListener("click", () => {
    autoStopRequested = true;
    elements.autoStatus.textContent = "Putar otomatis akan berhenti setelah putaran ini.";
  });
  elements.autoCount.addEventListener("change", () => {
    const requested = Number(elements.autoCount.value);
    elements.autoCount.value = String(Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.trunc(requested))) : 10);
  });
  elements.reset.addEventListener("click", resetGame);
  elements.clearHistory.addEventListener("click", (event) => {
    event.preventDefault();
    state.history = [];
    saveState();
    renderHistory();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || spinning || autoRunning) return;
    state = loadState();
    render();
    drawPreview();
  });

  drawPreview();
  render();
})();
