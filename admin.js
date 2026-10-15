(() => {
  "use strict";

  const STORAGE_KEY = "sudirman-dor-local-v4";
  const MULTIPLIERS = [2, 5, 10, 20, 50, 100];
  const OCCURRENCE_KEYS = ["6", "8", "10", "12", "15"];
  const WINNING_RANGES = OCCURRENCE_KEYS;
  const defaultOccurrenceChances = { "6": 10, "8": 8, "10": 3, "12": 0.8, "15": 0.2 };
  const defaultMultiplierCountChances = { "2": 0.1, "3": 0.01 };
  const SUN_VALUES_BY_BET = new Map([
    [200, 15], [500, 40], [1000, 80], [2000, 160], [5000, 400],
    [10000, 800], [20000, 1600], [50000, 4000], [100000, 8000]
  ]);
  const symbols = [
    { name: "Matahari", icon: "☀️", chance: 25, factor: 1 },
    { name: "Bulan", icon: "🌙", chance: 19, factor: 2 },
    { name: "Bintang", icon: "⭐", chance: 15, factor: 4 },
    { name: "Permata", icon: "💎", chance: 12, factor: 7 },
    { name: "Planet", icon: "🪐", chance: 10, factor: 12 },
    { name: "Kristal", icon: "🔮", chance: 7, factor: 20 },
    { name: "Mahkota", icon: "👑", chance: 5, factor: 35 },
    { name: "Trisula", icon: "🔱", chance: 4, factor: 55 },
    { name: "Kuil", icon: "🏛️", chance: 3, factor: 80 }
  ];
  const defaults = {
    balance: 100000,
    bet: 200,
    startingCredit: 100000,
    betLevels: [200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
    winChance: 22,
    nextWinChance: 22,
    occurrenceChances: { ...defaultOccurrenceChances },
    nextOccurrenceChances: { ...defaultOccurrenceChances },
    multiplierChance: 2,
    multiplierCountChances: { ...defaultMultiplierCountChances },
    maxRespins: 10,
    multiplierWeights: [34, 25, 18, 12, 7, 4],
    tiers: symbols.map(({ chance, factor }) => ({ chance, factor })),
    plays: 0,
    wins: 0,
    net: 0,
    history: []
  };
  const elements = {
    startingCredit: document.querySelector("#starting-credit"),
    occurrenceChances: [...document.querySelectorAll("[data-occurrence]")],
    occurrenceTotal: document.querySelector("#win-chance-total"),
    multiplierChance: document.querySelector("#multiplier-chance"),
    multiplierCountChances: [...document.querySelectorAll("[data-multiplier-count]")],
    multiplierOneChance: document.querySelector("#multiplier-one-chance"),
    maxRespins: document.querySelector("#max-respins"),
    betLevels: document.querySelector("#bet-levels"),
    tiers: document.querySelector("#tier-settings"),
    multipliers: document.querySelector("#multiplier-settings"),
    chanceTotal: document.querySelector("#chance-total"),
    multiplierTotal: document.querySelector("#multiplier-total"),
    saveStatus: document.querySelector("#save-status"),
    restore: document.querySelector("#restore-settings")
  };
  const format = (value) => `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}`;
  const roundMoney = (value) => Math.max(0, Number(value.toFixed(2)));

  function boundedNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
  }

  function normalizeOccurrenceChances(source, legacyTotal, fallback) {
    let chances;
    if (source && typeof source === "object") {
      chances = Object.fromEntries(OCCURRENCE_KEYS.map((key) => [
        key,
        boundedNumber(source[key], 0, 100, fallback[key])
      ]));
    } else {
      const total = boundedNumber(legacyTotal, 0, 100, Object.values(fallback).reduce((sum, chance) => sum + chance, 0));
      const defaultTotal = Object.values(defaultOccurrenceChances).reduce((sum, chance) => sum + chance, 0);
      chances = Object.fromEntries(OCCURRENCE_KEYS.map((key) => [
        key,
        Number((defaultOccurrenceChances[key] * total / defaultTotal).toFixed(1))
      ]));
    }
    if (source && typeof source === "object" && source["6"] === undefined) {
      chances["6"] = Number((boundedNumber(source["8"], 0, 100, fallback["8"]) + 2).toFixed(1));
    }
    const total = Object.values(chances).reduce((sum, chance) => sum + chance, 0);
    if (total > 100) {
      const scale = 100 / total;
      chances = Object.fromEntries(OCCURRENCE_KEYS.map((key) => [key, Number((chances[key] * scale).toFixed(1))]));
      const roundedTotal = Object.values(chances).reduce((sum, chance) => sum + chance, 0);
      const largestKey = OCCURRENCE_KEYS.reduce((largest, key) =>
        chances[key] > chances[largest] ? key : largest, OCCURRENCE_KEYS[0]);
      chances[largestKey] = Number((chances[largestKey] + 100 - roundedTotal).toFixed(1));
    }
    return chances;
  }

  function getTotalOccurrenceChance(chances) {
    return WINNING_RANGES.reduce((total, key) => total + chances[key], 0);
  }

  function getTierOneValue(bet) {
    return SUN_VALUES_BY_BET.get(bet) ?? bet * 0.08;
  }

  function normalizeMultiplierCountChances(source, totalChance) {
    const chances = Object.fromEntries(["2", "3"].map((count) => [
      count,
      boundedNumber(source?.[count], 0, 100, defaultMultiplierCountChances[count])
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

  let state;
  let savedState = null;
  try {
    savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    state = savedState && typeof savedState === "object" ? { ...structuredClone(defaults), ...savedState } : structuredClone(defaults);
  } catch (error) {
    console.warn("Konfigurasi tersimpan tidak dapat dibaca; nilai awal digunakan.", error);
    state = structuredClone(defaults);
  }
  state.betLevels = Array.isArray(state.betLevels) && state.betLevels.length
    ? state.betLevels.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0).sort((a, b) => a - b)
    : [...defaults.betLevels];
  if (!state.betLevels.length) state.betLevels = [...defaults.betLevels];
  state.tiers = symbols.map((symbol, index) => ({
    chance: boundedNumber(state.tiers?.[index]?.chance, 0, 100, symbol.chance),
    factor: boundedNumber(state.tiers?.[index]?.factor, 0.1, 1000, symbol.factor)
  }));
  const chanceSum = state.tiers.reduce((sum, tier) => sum + tier.chance, 0);
  if (chanceSum > 0) {
    state.tiers.forEach((tier) => { tier.chance = Number((tier.chance / chanceSum * 100).toFixed(1)); });
    const roundedSum = state.tiers.reduce((sum, tier) => sum + tier.chance, 0);
    const correctionTier = state.tiers.reduce((largest, tier, index, tiers) =>
      tier.chance > tiers[largest].chance ? index : largest, 0);
    state.tiers[correctionTier].chance = Number((state.tiers[correctionTier].chance + 100 - roundedSum).toFixed(1));
  } else {
    state.tiers = defaults.tiers.map((tier) => ({ ...tier }));
  }
  state.multiplierWeights = MULTIPLIERS.map((_, index) =>
    boundedNumber(state.multiplierWeights?.[index], 0, 100, defaults.multiplierWeights[index])
  );
  if (state.multiplierWeights.every((weight) => weight === 0)) state.multiplierWeights[0] = 1;
  state.startingCredit = boundedNumber(state.startingCredit, 1000, 1000000000, defaults.startingCredit);
  state.occurrenceChances = normalizeOccurrenceChances(savedState?.occurrenceChances, savedState?.winChance, defaults.occurrenceChances);
  state.nextOccurrenceChances = normalizeOccurrenceChances(savedState?.nextOccurrenceChances, savedState?.nextWinChance, state.occurrenceChances);
  state.winChance = getTotalOccurrenceChance(state.occurrenceChances);
  state.nextWinChance = getTotalOccurrenceChance(state.nextOccurrenceChances);
  state.multiplierChance = boundedNumber(state.multiplierChance, 0, 100, defaults.multiplierChance);
  state.multiplierCountChances = normalizeMultiplierCountChances(savedState?.multiplierCountChances, state.multiplierChance);
  state.maxRespins = boundedNumber(state.maxRespins, 0, 50, defaults.maxRespins);
  if (!state.betLevels.includes(state.bet)) state.bet = state.betLevels[0];

  function setStatus(message, error = false) {
    elements.saveStatus.textContent = message;
    elements.saveStatus.classList.toggle("is-error", error);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStatus("Pengaturan disimpan otomatis.");
    } catch (error) {
      console.error("Pengaturan tidak dapat disimpan di browser.", error);
      setStatus("Gagal menyimpan perubahan. Periksa izin atau ruang penyimpanan browser.", true);
    }
  }

  function updateDisplayedValues() {
    const bet = state.betLevels.includes(state.bet) ? state.bet : state.betLevels[0];
    elements.tiers.querySelectorAll("tr").forEach((row, index) => {
      row.querySelector(".tier-value").textContent = format(roundMoney(
        getTierOneValue(bet) * state.tiers[index].factor / state.tiers[0].factor
      ));
    });
    const chance = state.tiers.reduce((sum, tier) => sum + tier.chance, 0);
    elements.chanceTotal.textContent = `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(chance)}%`;
    elements.chanceTotal.classList.toggle("is-error", Math.abs(chance - 100) > 0.01);
    const occurrenceTotal = getTotalOccurrenceChance(state.occurrenceChances);
    elements.occurrenceTotal.textContent = `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(occurrenceTotal)}%`;
    elements.occurrenceTotal.classList.toggle("is-error", occurrenceTotal > 100);
    const weightTotal = state.multiplierWeights.reduce((sum, weight) => sum + weight, 0);
    elements.multiplierTotal.textContent = `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(weightTotal ? 100 : 0)}%`;
    const oneChance = Math.max(0, state.multiplierChance -
      state.multiplierCountChances["2"] - state.multiplierCountChances["3"]);
    elements.multiplierOneChance.textContent =
      `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(oneChance)}%`;
    elements.multiplierCountChances.forEach((input) => {
      input.value = String(state.multiplierCountChances[input.dataset.multiplierCount]);
    });
    elements.multipliers.querySelectorAll(".multiplier-card").forEach((card, index) => {
      const chanceText = card.querySelector(".multiplier-percent");
      chanceText.textContent = `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(weightTotal ? state.multiplierWeights[index] / weightTotal * 100 : 0)}%`;
    });
  }

  function createNumberInput(value, min, max, step, group, index, key, label) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.dataset.group = group;
    input.dataset.index = String(index);
    input.dataset.key = key;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", updateSetting);
    return input;
  }

  function renderControls() {
    elements.tiers.replaceChildren();
    state.tiers.forEach((tier, index) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.innerHTML = `<span class="table-symbol">${symbols[index].icon}</span> ${symbols[index].name}`;
      const chance = document.createElement("td");
      chance.append(createNumberInput(tier.chance, 0, 100, 0.1, "tier", index, "chance", `${symbols[index].name} peluang`));
      const factor = document.createElement("td");
      factor.append(createNumberInput(tier.factor, 0.1, 1000, 0.1, "tier", index, "factor", `${symbols[index].name} faktor hadiah`));
      const value = document.createElement("td");
      value.className = "tier-value";
      row.append(name, chance, factor, value);
      elements.tiers.append(row);
    });
    elements.multipliers.replaceChildren();
    MULTIPLIERS.forEach((multiplier, index) => {
      const label = document.createElement("label");
      label.className = "multiplier-card";
      const heading = document.createElement("span");
      heading.textContent = `×${multiplier}`;
      const percent = document.createElement("small");
      percent.className = "multiplier-percent";
      const input = createNumberInput(state.multiplierWeights[index], 0, 100, 0.1, "multiplier", index, "weight", `Bobot multiplier ×${multiplier}`);
      label.append(heading, percent, input);
      elements.multipliers.append(label);
    });
    updateDisplayedValues();
  }

  function distribute(values, changedIndex, requested) {
    const otherIndices = values.map((_, index) => index).filter((index) => index !== changedIndex);
    const remaining = Number((100 - requested).toFixed(1));
    const previousTotal = otherIndices.reduce((sum, index) => sum + values[index], 0);
    values[changedIndex] = requested;
    otherIndices.forEach((index) => {
      const portion = previousTotal ? values[index] / previousTotal : 1 / otherIndices.length;
      values[index] = Number((portion * remaining).toFixed(1));
    });
    const total = values.reduce((sum, value) => sum + value, 0);
    const correction = otherIndices.reduce((largest, index) => values[index] > values[largest] ? index : largest, otherIndices[0]);
    values[correction] = Number((values[correction] + 100 - total).toFixed(1));
    return values;
  }

  function updateSetting(event) {
    const input = event.currentTarget;
    const index = Number(input.dataset.index);
    const key = input.dataset.key;
    const fallback = input.dataset.group === "tier"
      ? state.tiers[index][key]
      : state.multiplierWeights[index];
    const value = boundedNumber(input.value, Number(input.min), Number(input.max), fallback);
    input.value = String(value);
    if (input.dataset.group === "tier") {
      if (key === "chance") {
        const chances = state.tiers.map((tier) => tier.chance);
        distribute(chances, index, value);
        chances.forEach((chance, tierIndex) => { state.tiers[tierIndex].chance = chance; });
      } else {
        state.tiers[index].factor = value;
      }
    } else {
      if (state.multiplierWeights.every((weight, weightIndex) => weightIndex === index || weight === 0) && value === 0) {
        input.value = "0.1";
        state.multiplierWeights[index] = 0.1;
        setStatus("Setidaknya satu bobot multiplier harus lebih besar dari 0.", true);
        renderControls();
        save();
        return;
      }
      const weights = [...state.multiplierWeights];
      distribute(weights, index, value);
      state.multiplierWeights = weights;
    }
    if (input.dataset.group === "tier" && input.dataset.key === "chance") {
      const values = state.tiers.map((tier) => tier.chance);
      const row = input.closest("tbody");
      row.querySelectorAll('input[data-key="chance"]').forEach((field, fieldIndex) => {
        field.value = String(values[fieldIndex]);
      });
    }
    if (input.dataset.group === "multiplier") {
      elements.multipliers.querySelectorAll('input[data-group="multiplier"]').forEach((field, fieldIndex) => {
        field.value = String(state.multiplierWeights[fieldIndex]);
      });
    }
    updateDisplayedValues();
    save();
  }

  function commitBasic(input, min, max, property, integer = false) {
    let value = boundedNumber(input.value, min, max, state[property]);
    if (integer) value = Math.trunc(value);
    input.value = String(value);
    state[property] = value;
    if (property === "winChance") state.nextWinChance = value;
    save();
  }

  function commitMultiplierChance() {
    const previous = state.multiplierChance;
    const value = boundedNumber(elements.multiplierChance.value, 0, 100, previous);
    const multipleChance = state.multiplierCountChances["2"] + state.multiplierCountChances["3"];
    if (value < multipleChance) {
      elements.multiplierChance.value = String(previous);
      setStatus("Peluang multiplier total tidak boleh lebih kecil dari total peluang 2 dan 3 multiplier.", true);
      return;
    }
    state.multiplierChance = value;
    elements.multiplierChance.value = String(value);
    updateDisplayedValues();
    save();
  }

  function commitMultiplierCountChance(input) {
    const count = input.dataset.multiplierCount;
    const previous = state.multiplierCountChances[count];
    const value = boundedNumber(input.value, 0, 100, previous);
    const otherCount = count === "2" ? "3" : "2";
    if (value + state.multiplierCountChances[otherCount] > state.multiplierChance) {
      input.value = String(previous);
      setStatus("Total peluang 2 dan 3 multiplier tidak boleh melebihi peluang multiplier per putaran.", true);
      return;
    }
    state.multiplierCountChances[count] = value;
    input.value = String(value);
    updateDisplayedValues();
    save();
  }

  function commitOccurrenceChance(input) {
    const key = input.dataset.occurrence;
    const previous = state.occurrenceChances[key];
    const value = boundedNumber(input.value, 0, 100, previous);
    const updated = { ...state.occurrenceChances, [key]: value };
    const total = getTotalOccurrenceChance(updated);
    if (total > 100) {
      input.value = String(previous);
      setStatus("Total peluang kemenangan tidak boleh melebihi 100%.", true);
      return;
    }
    input.value = String(value);
    state.occurrenceChances[key] = value;
    state.nextOccurrenceChances = { ...state.occurrenceChances };
    state.winChance = total;
    state.nextWinChance = total;
    updateDisplayedValues();
    save();
  }

  elements.startingCredit.value = String(boundedNumber(state.startingCredit, 1000, 1000000000, defaults.startingCredit));
  elements.occurrenceChances.forEach((input) => {
    input.value = String(state.occurrenceChances[input.dataset.occurrence]);
    input.addEventListener("change", () => commitOccurrenceChance(input));
  });
  elements.multiplierChance.value = String(boundedNumber(state.multiplierChance, 0, 100, defaults.multiplierChance));
  elements.multiplierCountChances.forEach((input) => {
    input.value = String(state.multiplierCountChances[input.dataset.multiplierCount]);
    input.addEventListener("change", () => commitMultiplierCountChance(input));
  });
  elements.maxRespins.value = String(boundedNumber(state.maxRespins, 0, 50, defaults.maxRespins));
  elements.betLevels.value = state.betLevels.join("\n");
  elements.startingCredit.addEventListener("change", () => commitBasic(elements.startingCredit, 1000, 1000000000, "startingCredit", true));
  elements.multiplierChance.addEventListener("change", commitMultiplierChance);
  elements.maxRespins.addEventListener("change", () => commitBasic(elements.maxRespins, 0, 50, "maxRespins", true));
  elements.betLevels.addEventListener("change", () => {
    const parsed = elements.betLevels.value.split(/[\s,;]+/).filter(Boolean).map(Number);
    const valid = parsed.length > 0 && parsed.length <= 20 && parsed.every((value) => Number.isSafeInteger(value) && value > 0);
    const uniqueSorted = [...new Set(parsed)].sort((a, b) => a - b);
    if (!valid || uniqueSorted.length !== parsed.length) {
      elements.betLevels.value = state.betLevels.join("\n");
      setStatus("Nominal harus berupa 1–20 angka bulat positif dan tidak boleh duplikat.", true);
      return;
    }
    state.betLevels = uniqueSorted;
    if (!state.betLevels.includes(state.bet)) state.bet = state.betLevels[0];
    elements.betLevels.value = uniqueSorted.join("\n");
    updateDisplayedValues();
    save();
  });
  elements.restore.addEventListener("click", () => {
    state = {
      ...state,
      startingCredit: defaults.startingCredit,
      betLevels: [...defaults.betLevels],
      winChance: getTotalOccurrenceChance(defaultOccurrenceChances),
      nextWinChance: getTotalOccurrenceChance(defaultOccurrenceChances),
      occurrenceChances: { ...defaultOccurrenceChances },
      nextOccurrenceChances: { ...defaultOccurrenceChances },
      multiplierChance: defaults.multiplierChance,
      multiplierCountChances: { ...defaultMultiplierCountChances },
      maxRespins: defaults.maxRespins,
      multiplierWeights: [...defaults.multiplierWeights],
      tiers: defaults.tiers.map((tier) => ({ ...tier })),
      bet: defaults.betLevels[0]
    };
    elements.startingCredit.value = String(state.startingCredit);
    elements.occurrenceChances.forEach((input) => { input.value = String(state.occurrenceChances[input.dataset.occurrence]); });
    elements.multiplierChance.value = String(state.multiplierChance);
    elements.multiplierCountChances.forEach((input) => {
      input.value = String(state.multiplierCountChances[input.dataset.multiplierCount]);
    });
    elements.maxRespins.value = String(state.maxRespins);
    elements.betLevels.value = state.betLevels.join("\n");
    renderControls();
    save();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      const latest = JSON.parse(event.newValue);
      if (!latest) return;
      state = { ...state, ...latest };
      elements.startingCredit.value = String(state.startingCredit);
      state.occurrenceChances = normalizeOccurrenceChances(latest.occurrenceChances, latest.winChance, defaults.occurrenceChances);
      state.nextOccurrenceChances = normalizeOccurrenceChances(latest.nextOccurrenceChances, latest.nextWinChance, state.occurrenceChances);
      state.winChance = getTotalOccurrenceChance(state.occurrenceChances);
      state.nextWinChance = getTotalOccurrenceChance(state.nextOccurrenceChances);
      state.multiplierChance = boundedNumber(latest.multiplierChance, 0, 100, defaults.multiplierChance);
      state.multiplierCountChances = normalizeMultiplierCountChances(latest.multiplierCountChances, state.multiplierChance);
      elements.occurrenceChances.forEach((input) => { input.value = String(state.occurrenceChances[input.dataset.occurrence]); });
      elements.multiplierChance.value = String(state.multiplierChance);
      elements.multiplierCountChances.forEach((input) => {
        input.value = String(state.multiplierCountChances[input.dataset.multiplierCount]);
      });
      elements.maxRespins.value = String(state.maxRespins);
      elements.betLevels.value = state.betLevels.join("\n");
      renderControls();
    } catch (error) {
      console.warn("Pembaruan konfigurasi dari permainan tidak dapat dibaca.", error);
    }
  });
  renderControls();
})();