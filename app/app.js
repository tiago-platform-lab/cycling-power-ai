"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "cycling-power-ai.profile.v1";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const profileInputs = [$("ftp"), $("weight"), $("max-hr")];
  let storageAvailable = true;
  let profile;
  let generatedGoal = "threshold";
  let generatedMinutes = 60;

  const zoneDefinitions = [
    { name: "Active recovery", percent: "≤ 55%", upper: 0.55, width: 25 },
    { name: "Endurance", percent: "56–75%", upper: 0.75, width: 40 },
    { name: "Tempo", percent: "76–90%", upper: 0.9, width: 52 },
    { name: "Threshold", percent: "91–105%", upper: 1.05, width: 64 },
    { name: "VO₂max", percent: "106–120%", upper: 1.2, width: 76 },
    { name: "Anaerobic capacity", percent: "121–150%", upper: 1.5, width: 88 },
    { name: "Neuromuscular", percent: "> 150%", upper: Infinity, width: 100 },
  ];

  function setError(input, message) {
    input.setAttribute("aria-invalid", message ? "true" : "false");
    $(`${input.id}-error`).textContent = message;
  }

  function readNumber(id, label, optional = false) {
    const input = $(id);
    if (optional && input.value.trim() === "" && !input.validity.badInput) {
      setError(input, "");
      return null;
    }
    const value = input.valueAsNumber;
    let message = "";
    if (!Number.isFinite(value)) message = `Enter ${label}.`;
    else if (value < Number(input.min) || value > Number(input.max)) {
      message = `Use ${input.min}–${input.max}${id === "ftp" || id.includes("power") ? " W" : ""}.`;
    } else if (input.validity.stepMismatch) {
      message = Number(input.step) === 1 ? "Use a whole number." : `Use increments of ${input.step}.`;
    }
    setError(input, message);
    return message ? null : value;
  }

  function restoreProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return;
      const fields = [["ftp", "ftp"], ["weight", "weight"], ["max-hr", "maxHr"]];
      fields.forEach(([id, key]) => {
        const input = $(id);
        const value = saved[key];
        if (typeof value !== "number" || !Number.isFinite(value)) return;
        if (value >= Number(input.min) && value <= Number(input.max)) {
          const previous = input.value;
          input.value = String(value);
          if (input.validity.stepMismatch) input.value = previous;
        }
      });
    } catch (error) {
      // Invalid stored JSON is safe to ignore; unavailable storage is optional.
      if (!(error instanceof SyntaxError)) storageAvailable = false;
    }
  }

  function saveProfile() {
    const valid = profile.ftp !== null && profile.weight !== null && $("max-hr").getAttribute("aria-invalid") !== "true";
    if (valid && storageAvailable) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      } catch {
        storageAvailable = false;
      }
    }
    $("save-status").textContent = !storageAvailable
      ? "Storage unavailable · profile stays in this session"
      : valid ? "Profile saved on this device" : "Check your profile · changes not saved";
  }

  function riderCategory(wkg) {
    if (wkg < 1.5) return "Untrained";
    if (wkg < 2.5) return "Beginner";
    if (wkg < 3) return "Recreational";
    if (wkg < 4) return "Trained";
    if (wkg < 5) return "Advanced";
    if (wkg < 6) return "Elite";
    return "World class";
  }

  function renderProfile() {
    profile = {
      ftp: readNumber("ftp", "your FTP"),
      weight: readNumber("weight", "your body weight"),
      maxHr: readNumber("max-hr", "a maximum heart rate", true),
    };
    const wkg = profile.ftp !== null && profile.weight !== null ? profile.ftp / profile.weight : null;
    $("power-weight").textContent = wkg === null ? "—" : wkg.toFixed(2);
    $("rider-category").textContent = wkg === null ? "Check profile" : riderCategory(wkg);
    saveProfile();
    renderZones();
    renderWorkout();
    renderRide();
  }

  function renderZones() {
    const tbody = $("zones-body");
    tbody.replaceChildren();
    if (profile.ftp === null) {
      const row = tbody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 3;
      cell.textContent = "Enter a valid FTP to see your power zones.";
      $("zones-footer").textContent = "Your zones will appear when your FTP is ready.";
      $("zone-status").textContent = "Enter a valid FTP to calculate power zones.";
    } else {
      let lower = 0;
      zoneDefinitions.forEach((zone, index) => {
        const upper = Number.isFinite(zone.upper) ? Math.floor(profile.ftp * zone.upper) : null;
        const row = tbody.insertRow();
        row.style.setProperty("--zone", `var(--z${index + 1})`);
        row.style.setProperty("--bar-width", `${zone.width}%`);
        // All interpolated content comes from constants or validated finite numbers.
        row.innerHTML = `<td><div class="zone-name"><span class="zone-number">Z${index + 1}</span><div><strong>${zone.name}</strong><span class="zone-bar" aria-hidden="true"></span></div></div></td><td class="zone-percent">${zone.percent}</td><td class="zone-range">${upper === null ? `${lower}+` : `${lower}–${upper}`} <span>W</span></td>`;
        lower = upper === null ? lower : upper + 1;
      });
      $("zones-footer").textContent = `Based on your ${profile.ftp} W FTP. Updates as you do.`;
      $("zone-status").textContent = `Power zones updated for ${profile.ftp} watts FTP.`;
    }

    $("hr-zones").hidden = profile.maxHr === null;
    $("hr-grid").replaceChildren();
    if (profile.maxHr !== null) {
      let lower = Math.ceil(profile.maxHr * 0.5);
      for (let index = 0; index < 5; index++) {
        const upper = Math.floor(profile.maxHr * (60 + index * 10) / 100);
        const item = document.createElement("div");
        item.className = "hr-item";
        item.style.setProperty("--zone", `var(--z${index + 1})`);
        item.innerHTML = `<span>Z${index + 1} · ${50 + index * 10}–${60 + index * 10}%</span><strong>${lower}–${upper}</strong><span>bpm</span>`;
        $("hr-grid").append(item);
        lower = upper + 1;
      }
    }
  }

  function renderTest() {
    const ramp = document.querySelector('input[name="test-type"]:checked').value === "ramp";
    $("test-power-label").textContent = ramp ? "Best 1-minute power" : "20-minute average power";
    $("test-formula").textContent = ramp
      ? "Estimated FTP = 75% of best 1-minute ramp power."
      : "Estimated FTP = 95% of 20-minute average power.";
    const power = readNumber("test-power", "your test power");
    const estimate = power === null ? null : Math.round(power * (ramp ? 0.75 : 0.95));
    $("estimated-ftp").textContent = estimate === null ? "—" : `${estimate} W`;
    $("test-status").textContent = estimate !== null && (estimate < 50 || estimate > 700)
      ? "This estimate falls outside the supported FTP range of 50–700 W. Check your test value."
      : "";
    return estimate;
  }

  const workoutCopy = {
    endurance: { name: "The aerobic foundation", kicker: "EASY TO REPEAT. BUILT TO LAST.", description: "Comfortable, steady Z2 work to build your aerobic base." },
    threshold: { name: "Threshold builder", kicker: "STEADY WORK. STRONGER LEGS.", description: "Controlled efforts at FTP, with easy recovery between." },
    vo2max: { name: "Raise the ceiling", kicker: "SHORT EFFORTS. A BIG STIMULUS.", description: "Three-minute Z5 efforts with equal-time recovery." },
    recovery: { name: "The easy spin", kicker: "LESS TODAY. MORE TOMORROW.", description: "Gentle Z1 spinning. Keep it easy and let your legs recover." },
  };

  function createWorkout(goal, total) {
    const steps = [];
    const add = (name, minutes, fraction, kind) => {
      if (minutes > 0) steps.push({ name, minutes, fraction, kind });
    };
    const warm = Math.max(5, Math.min(12, Math.round(total * 0.15)));
    const cool = Math.max(4, Math.min(8, Math.round(total * 0.1)));
    const main = total - warm - cool;
    const firstWarm = Math.floor(warm / 2);
    add("Warm-up · easy spin", firstWarm, goal === "recovery" ? 0.35 : 0.45, "warm");
    add("Warm-up · build gently", warm - firstWarm, goal === "recovery" ? 0.45 : 0.65, "warm");
    if (goal === "threshold" || goal === "vo2max") {
      const vo2 = goal === "vo2max";
      const rest = 3;
      const count = Math.min(vo2 ? 8 : 5, Math.floor((main + rest) / (vo2 ? 6 : 11)));
      const work = vo2 ? 3 : Math.min(12, Math.floor((main - (count - 1) * rest) / count));
      const extra = main - count * work - (count - 1) * rest;
      add("Settle into endurance", extra, 0.65, "work");
      for (let index = 0; index < count; index++) {
        add(`${vo2 ? "VO₂max" : "Threshold"} effort ${index + 1}`, work, vo2 ? 1.15 : 1, "work");
        if (index < count - 1) add("Easy recovery", rest, 0.5, "rest");
      }
    } else if (goal === "endurance") {
      const part = Math.floor(main / 3);
      add("Find your rhythm", part, 0.65, "work");
      add("Steady endurance", main - part * 2, 0.7, "work");
      add("Hold it comfortable", part, 0.68, "work");
    } else {
      add("Relaxed recovery spin", main, 0.45, "rest");
    }
    add("Cool-down", cool, goal === "recovery" ? 0.35 : 0.4, "warm");
    return steps;
  }

  function svgElement(name, attributes, text) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderWorkout() {
    const ready = profile.ftp !== null;
    $("workout-result").hidden = !ready;
    if (!ready) {
      $("workout-status").textContent = "Enter a valid profile FTP to build your workout.";
      return;
    }
    if ($("workout-status").textContent === "Enter a valid profile FTP to build your workout.") $("workout-status").textContent = "";
    const steps = createWorkout(generatedGoal, generatedMinutes);
    const copy = workoutCopy[generatedGoal];
    $("workout-name").textContent = copy.name;
    $("workout-kicker").textContent = copy.kicker;
    $("workout-description").textContent = copy.description;
    $("workout-duration").innerHTML = `${generatedMinutes}<span> min</span>`;
    const average = Math.round(steps.reduce((sum, step) => sum + step.minutes * Math.round(step.fraction * profile.ftp), 0) / generatedMinutes);
    $("workout-average").innerHTML = `${average}<span> W</span>`;
    $("step-count").textContent = `${steps.length} STEPS`;
    $("workout-steps").replaceChildren();
    let elapsed = 0;
    steps.forEach((step, index) => {
      const watts = Math.round(step.fraction * profile.ftp);
      const item = document.createElement("li");
      item.innerHTML = `<span class="step-index">${index + 1}</span><span class="step-info"><strong>${step.name}</strong><span>${elapsed}–${elapsed + step.minutes} min · ${Math.round(step.fraction * 100)}% FTP</span></span><span class="step-power">${watts} W</span>`;
      $("workout-steps").append(item);
      elapsed += step.minutes;
    });
    drawWorkout(steps);
  }

  function drawWorkout(steps) {
    const chart = $("workout-chart");
    const width = Math.max(260, chart.getBoundingClientRect().width || 900);
    chart.setAttribute("viewBox", `0 0 ${width} 230`);
    chart.replaceChildren();
    chart.append(svgElement("title", { id: "chart-title" }, `${workoutCopy[generatedGoal].name}: ${generatedMinutes} minutes`));
    chart.append(svgElement("desc", { id: "chart-description" }, steps.map((step) => `${step.minutes} minutes ${step.name} at ${Math.round(step.fraction * profile.ftp)} watts`).join(". ") + ". Full steps are available below the chart."));
    const left = 43;
    const right = width - 14;
    const top = 18;
    const bottom = 195;
    const ceiling = Math.ceil(profile.ftp * 1.35 / 50) * 50;
    const y = (watts) => bottom - (watts / ceiling) * (bottom - top);
    for (let index = 0; index <= 4; index++) {
      const watts = Math.round(ceiling * index / 4);
      const position = y(watts);
      chart.append(svgElement("line", { x1: left, x2: right, y1: position, y2: position, class: "chart-grid" }));
      chart.append(svgElement("text", { x: left - 10, y: position + 4, "text-anchor": "end", class: "chart-label" }, String(watts)));
    }
    let elapsed = 0;
    const colors = { warm: "#a0bdb0", work: "#5e9a73", rest: "#c4d6b5" };
    steps.forEach((step) => {
      const watts = Math.round(step.fraction * profile.ftp);
      const block = svgElement("rect", { x: left + elapsed / generatedMinutes * (right - left), y: y(watts), width: step.minutes / generatedMinutes * (right - left), height: bottom - y(watts), fill: colors[step.kind], rx: 2, class: "chart-block" });
      block.append(svgElement("title", {}, `${step.name}: ${step.minutes} min at ${watts} W (${Math.round(step.fraction * 100)}% FTP)`));
      chart.append(block);
      elapsed += step.minutes;
    });
    chart.append(svgElement("line", { x1: left, x2: right, y1: y(profile.ftp), y2: y(profile.ftp), class: "chart-ftp" }));
    chart.append(svgElement("text", { x: right - 2, y: y(profile.ftp) - 6, "text-anchor": "end", class: "chart-label" }, `FTP ${profile.ftp} W`));
    const ticks = width < 450 ? 2 : 4;
    for (let index = 0; index <= ticks; index++) {
      chart.append(svgElement("text", { x: left + index / ticks * (right - left), y: 219, "text-anchor": index === 0 ? "start" : index === ticks ? "end" : "middle", class: "chart-label" }, `${generatedMinutes * index / ticks} min`));
    }
  }

  function formatTime(hours) {
    const minutes = Math.max(1, Math.round(hours * 60));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h} h ${m.toString().padStart(2, "0")} min` : `${m} min`;
  }

  function renderRide() {
    const distance = readNumber("distance", "a distance");
    const elevation = readNumber("elevation", "an elevation gain");
    const power = readNumber("ride-power", "a steady power");
    const cda = readNumber("cda", "a drag area");
    const crr = readNumber("crr", "a rolling resistance");
    const bike = readNumber("bike-weight", "a bike and gear weight");
    let message = "Check the highlighted ride inputs to see an estimate.";
    let valid = [distance, elevation, power, cda, crr, bike, profile.weight].every((value) => value !== null);
    if (profile.weight === null) message = "Enter a valid body weight in your rider profile.";
    if (distance !== null && elevation !== null && elevation / (distance * 1000) > 0.25) {
      setError($("elevation"), "Use a gain below 25% of the route distance.");
      valid = false;
    }
    if (!valid) {
      $("ride-speed").textContent = "—";
      $("ride-time").textContent = "—";
      $("ride-result-note").textContent = message;
      return;
    }
    // Equivalent constant grade: gain / horizontal distance. This intentionally
    // does not model downhill energy recovery or a particular route profile.
    const grade = elevation / (distance * 1000);
    const angle = Math.atan(grade);
    const mass = profile.weight + bike;
    const constantForce = mass * 9.80665 * (crr * Math.cos(angle) + Math.sin(angle));
    const aerodynamic = 0.5 * 1.225 * cda;
    const wheelPower = power * 0.97;
    let low = 0;
    let high = 100;
    for (let iteration = 0; iteration < 80; iteration++) {
      const speed = (low + high) / 2;
      const requiredPower = (constantForce + aerodynamic * speed * speed) * speed;
      if (requiredPower > wheelPower) high = speed;
      else low = speed;
    }
    const kmh = (low + high) / 2 * 3.6;
    $("ride-speed").textContent = kmh.toFixed(1);
    $("ride-time").textContent = formatTime(distance / kmh);
    $("ride-result-note").textContent = `${distance} km · ${elevation.toLocaleString("en-US")} m climbing · ${power} W. A steady-effort estimate, not a route forecast.`;
  }

  $("profile-form").addEventListener("submit", (event) => event.preventDefault());
  profileInputs.forEach((input) => input.addEventListener("input", renderProfile));
  $("ftp-test-form").addEventListener("input", renderTest);
  $("ftp-test-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const estimate = renderTest();
    if (estimate === null || estimate < 50 || estimate > 700) {
      $("test-power").focus();
      return;
    }
    $("ftp").value = String(estimate);
    renderProfile();
    $("test-status").textContent = `${estimate} W applied to your profile. Zones and workout targets updated.`;
  });
  $("workout-form").addEventListener("input", () => {
    $("time-output").textContent = `${$("workout-time").value} min`;
    $("workout-status").textContent = "Settings changed. Build your workout to apply them.";
  });
  $("workout-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const minutes = $("workout-time").valueAsNumber;
    const goal = document.querySelector('input[name="goal"]:checked').value;
    if (!Number.isFinite(minutes) || minutes < 30 || minutes > 120 || !Object.hasOwn(workoutCopy, goal)) {
      $("workout-status").textContent = "Choose a goal and 30–120 minutes.";
      return;
    }
    generatedGoal = goal;
    generatedMinutes = minutes;
    renderWorkout();
    if (profile.ftp !== null) $("workout-status").textContent = `${workoutCopy[goal].name} is ready. ${minutes} minutes, with targets linked to your profile FTP.`;
  });
  $("ride-form").addEventListener("submit", (event) => event.preventDefault());
  $("ride-form").addEventListener("input", renderRide);

  // Navigation remains ordinary anchor navigation, including without JS.
  const navLinks = [...document.querySelectorAll(".nav-link")];
  if ("IntersectionObserver" in window) {
    const visible = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      });
      const current = navLinks.find((link) => visible.has(link.hash.slice(1)));
      if (!current) return;
      navLinks.forEach((link) => {
        const active = link === current;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-5% 0px -45% 0px", threshold: 0 });
    navLinks.forEach((link) => observer.observe($(link.hash.slice(1))));
  }

  restoreProfile();
  renderProfile();
  renderTest();

  // Keep SVG labels readable at narrow widths instead of scaling the text down.
  if ("ResizeObserver" in window) {
    let previousWidth = 0;
    const chartObserver = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width === previousWidth) return;
      previousWidth = width;
      if (profile.ftp !== null) drawWorkout(createWorkout(generatedGoal, generatedMinutes));
    });
    chartObserver.observe($("workout-chart").parentElement);
  } else {
    window.addEventListener("resize", () => {
      if (profile.ftp !== null) drawWorkout(createWorkout(generatedGoal, generatedMinutes));
    });
  }
})();
