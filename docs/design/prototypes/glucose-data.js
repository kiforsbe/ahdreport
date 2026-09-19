// Synthetic Apple Health-shaped data + the analysis the glucose spec proposes.
// Prototype only: deterministic (seeded) so screenshots are reproducible.
(function () {
  const MG_PER_MMOL = 18.0182;
  const MIN = 60e3;
  const HOUR = 60 * MIN;
  const DAYS = 30;
  const SLOT = 15 * MIN;

  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  const round1 = (v) => Math.round(v * 10) / 10;
  const iso = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dayStart = (i) => new Date(2026, 8, 18 - (DAYS - 1 - i)).getTime();
  const mealCurve = (dt) => (dt < 0 || dt > 260 ? 0 : (dt / 65) * Math.exp(1 - dt / 65));
  const activityCurve = (dt, dur) =>
    dt < 0 || dt > dur + 200 ? 0 : dt <= dur ? dt / dur : Math.exp(-(dt - dur) / 70);

  function build(mode) {
    const r = rng(mode === "cgm" ? 20260918 : 777);
    const carbs = [], insulin = [], activity = [], sleep = [], readings = [];
    for (let i = 0; i < DAYS; i++) {
      const d0 = dayStart(i);
      const at = (h) => d0 + h * HOUR;
      const hours = 5.3 + r() * 2.9;
      const wake = 6.2 + r() * 1.4;
      sleep.push({ start: at(wake - hours), end: at(wake), hours, date: iso(d0) });
      const shortNight = hours < 6.3;
      const meals = [
        { h: wake + 0.4 + r() * 0.5, g: 30 + r() * 35 },
        { h: 12 + r() * 1.3, g: 40 + r() * 40 },
        { h: 18 + r() * 1.5, g: 45 + r() * 50 },
      ];
      if (r() < 0.35) meals.push({ h: 15 + r() * 1.5, g: 15 + r() * 20 });
      meals.forEach((m) => { if (r() < 0.85) carbs.push({ t: at(m.h), g: Math.round(m.g) }); });
      insulin.push({ t: at(22), iu: 14, reason: "basal" });
      const boluses = [];
      meals.forEach((m) => {
        if (m.g > 70 && r() < 0.5) {
          const b = { t: at(m.h - 0.1), iu: Math.round(m.g / 12), reason: "bolus" };
          insulin.push(b);
          boluses.push(m);
        }
      });
      const acts = [];
      if (r() < 0.6) {
        const h = r() < 0.5 ? 19.5 + r() : 8 + r() * 9;
        const dur = Math.round(20 + r() * 40);
        acts.push({ h, dur });
        activity.push({ start: at(h), minutes: dur });
      }
      const base = 6.4 + gauss(r) * 0.35 + (i / DAYS) * 0.3;
      const g = (hh) => {
        let v = base;
        if (hh >= 3 && hh < wake + 2) v += 0.9 * Math.sin(Math.PI * Math.min(1, (hh - 3) / (wake - 1)));
        if (shortNight && hh >= wake - 1 && hh < wake + 4) v += 0.75;
        meals.forEach((m) => {
          v += m.g * 0.075 * (boluses.includes(m) ? 0.6 : 1) * mealCurve((hh - m.h) * 60);
        });
        acts.forEach((a) => { v -= 1.4 * activityCurve((hh - a.h) * 60, a.dur); });
        return v;
      };
      if (mode === "cgm") {
        if (i === 11) continue; // sensor change: no readings that day
        let noise = 0;
        for (let m = 0; m < 1440; m += 5) {
          if (r() < 0.03 || (i === 20 && m > 600 && m < 800)) continue;
          noise = noise * 0.85 + gauss(r) * 0.12;
          readings.push({ t: d0 + m * MIN, v: round1(Math.max(2.4, g(m / 60) + noise)), meal: null });
        }
      } else {
        if ([4, 13, 22].includes(i)) continue;
        const pts = [{ h: wake + 0.1, tag: r() < 0.6 ? "beforeMeal" : null }];
        meals.slice(0, 3).forEach((m, k) => {
          if (k > 0 && r() < 0.55) pts.push({ h: m.h - 0.15, tag: r() < 0.7 ? "beforeMeal" : null });
          if (r() < 0.5) pts.push({ h: m.h + 1.4 + r() * 0.5, tag: r() < 0.7 ? "afterMeal" : null });
        });
        if (r() < 0.6) pts.push({ h: 22.2 + r() * 0.8, tag: null });
        if (i === 9) pts.push({ h: 16.4, tag: null, low: true });
        pts.forEach((p) =>
          readings.push({ t: at(p.h), v: round1(p.low ? 3.4 : g(p.h) + gauss(r) * 0.25), meal: p.tag }),
        );
      }
    }
    const byT = (a, b) => (a.t ?? a.start) - (b.t ?? b.start);
    readings.sort(byT); carbs.sort(byT); insulin.sort(byT); activity.sort(byT);
    return { mode, readings, carbs, insulin, activity, sleep, from: dayStart(0), to: dayStart(DAYS - 1) + 24 * HOUR };
  }

  const median = (xs) => {
    if (!xs.length) return undefined;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const quantile = (sorted, q) => {
    const p = (sorted.length - 1) * q;
    const lo = Math.floor(p);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (p - lo);
  };
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
  };
  const classify = (v, range) => (v < range.low ? "below" : v > range.high ? "above" : "within");

  // Density gate: CGM-grade metrics only when >= 14 days with readings AND
  // >= 70% of 15-minute slots in the window contain a reading.
  function summarize(ds, range) {
    const rs = ds.readings;
    const values = rs.map((x) => x.v);
    const days = new Set(rs.map((x) => iso(x.t)));
    const slots = new Set(rs.map((x) => Math.floor(x.t / SLOT)));
    const windowDays = Math.round((ds.to - ds.from) / (24 * HOUR));
    const coverage = slots.size / (windowDays * 96);
    const dense = days.size >= 14 && coverage >= 0.7;
    const weights = rs.map((x, i) =>
      dense ? Math.min((rs[i + 1]?.t ?? x.t + 5 * MIN) - x.t, SLOT) : 1,
    );
    const total = weights.reduce((a, b) => a + b, 0);
    const split = { below: 0, within: 0, above: 0 };
    rs.forEach((x, i) => { split[classify(x.v, range)] += weights[i] / total; });
    const m = mean(values);
    return {
      count: rs.length,
      daysWithReadings: days.size,
      windowDays,
      coverage,
      dense,
      latest: rs.at(-1),
      median: median(values),
      mean: m,
      sd: sd(values),
      cv: (sd(values) / m) * 100,
      gmi: 3.31 + 0.02392 * m * MG_PER_MMOL,
      split,
      meal: {
        beforeMeal: rs.filter((x) => x.meal === "beforeMeal").map((x) => x.v),
        afterMeal: rs.filter((x) => x.meal === "afterMeal").map((x) => x.v),
        unspecified: rs.filter((x) => !x.meal).map((x) => x.v),
      },
    };
  }

  function daily(ds, range) {
    const map = new Map();
    const bucket = (date) => {
      if (!map.has(date))
        map.set(date, { date, readings: [], carbs: [], insulin: [], activity: [] });
      return map.get(date);
    };
    ds.readings.forEach((x) => bucket(iso(x.t)).readings.push(x));
    ds.carbs.forEach((x) => bucket(iso(x.t)).carbs.push(x));
    ds.insulin.forEach((x) => bucket(iso(x.t)).insulin.push(x));
    ds.activity.forEach((x) => bucket(iso(x.start)).activity.push(x));
    return [...map.values()]
      .filter((d) => d.readings.length)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => {
        const vs = d.readings.map((x) => x.v);
        const counts = { below: 0, within: 0, above: 0 };
        vs.forEach((v) => counts[classify(v, range)]++);
        const before = d.readings.filter((x) => x.meal === "beforeMeal").map((x) => x.v);
        const after = d.readings.filter((x) => x.meal === "afterMeal").map((x) => x.v);
        return {
          ...d,
          count: vs.length,
          min: Math.min(...vs),
          max: Math.max(...vs),
          median: median(vs),
          average: mean(vs),
          sd: vs.length > 1 ? sd(vs) : 0,
          counts,
          beforeMedian: median(before),
          afterMedian: median(after),
          basal: d.insulin.filter((x) => x.reason === "basal").reduce((a, b) => a + b.iu, 0),
          bolus: d.insulin.filter((x) => x.reason === "bolus").reduce((a, b) => a + b.iu, 0),
          carbTotal: d.carbs.reduce((a, b) => a + b.g, 0),
        };
      });
  }

  // Hour-of-day percentile profile (AGP-style), CGM only.
  function profile(ds) {
    const hours = Array.from({ length: 24 }, () => []);
    ds.readings.forEach((x) => hours[new Date(x.t).getHours()].push(x.v));
    return hours.map((vs, h) => {
      const s = [...vs].sort((a, b) => a - b);
      return { h, p5: quantile(s, 0.05), p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p95: quantile(s, 0.95) };
    });
  }

  // Descriptive paired-event comparisons. Minimum 5 pairs, else unavailable.
  function associations(ds) {
    const rs = ds.readings;
    const lastBefore = (t, win) => {
      for (let i = rs.length - 1; i >= 0; i--) {
        if (rs[i].t <= t && rs[i].t >= t - win) return rs[i];
        if (rs[i].t < t - win) break;
      }
      return undefined;
    };
    const within = (a, b) => rs.filter((x) => x.t > a && x.t <= b);
    const carbDeltas = [];
    ds.carbs.forEach((c) => {
      const base = lastBefore(c.t, 30 * MIN);
      const after = within(c.t, c.t + 2 * HOUR);
      if (base && after.length) carbDeltas.push(Math.max(...after.map((x) => x.v)) - base.v);
    });
    const actDeltas = [];
    ds.activity.forEach((a) => {
      const base = lastBefore(a.start, 30 * MIN);
      const target = a.start + 2 * HOUR;
      const near = within(target - HOUR, target + HOUR).sort(
        (p, q) => Math.abs(p.t - target) - Math.abs(q.t - target),
      )[0];
      if (base && near) actDeltas.push(near.v - base.v);
    });
    const splitAt = median(ds.sleep.map((s) => s.hours));
    const morning = (s) => {
      const firstCarb = ds.carbs.find((c) => c.t > s.end);
      const limit = Math.min(s.end + 2 * HOUR, firstCarb ? firstCarb.t : Infinity);
      return rs.find((x) => x.t >= s.end && x.t <= limit);
    };
    const shorter = [], other = [];
    ds.sleep.forEach((s) => {
      const m = morning(s);
      if (m) (s.hours < splitAt ? shorter : other).push(m.v);
    });
    const need = 5;
    return {
      carbs: { n: carbDeltas.length, value: carbDeltas.length >= need ? median(carbDeltas) : undefined },
      activity: { n: actDeltas.length, value: actDeltas.length >= need ? median(actDeltas) : undefined },
      sleep: {
        n: shorter.length,
        m: other.length,
        splitAt,
        value: shorter.length >= 3 && other.length >= 3 ? median(shorter) - median(other) : undefined,
      },
    };
  }

  // Other new vitals for the "extend existing groups" panels.
  function vitals() {
    const r = rng(42);
    const series = (n, f) => Array.from({ length: n }, (_, i) => ({ t: dayStart(Math.round((i * (DAYS - 1)) / Math.max(1, n - 1))), v: f(i, r) }));
    return {
      oxygenSaturation: { label: "Blood oxygen", unit: "%", decimals: 0, color: "#1098ad", data: series(30, () => Math.round(95 + r() * 4)) },
      respiratoryRate: { label: "Respiratory rate", unit: "breaths/min", decimals: 1, color: "#0ca678", data: series(30, () => round1(13.2 + r() * 3)) },
      heartRateVariability: { label: "Heart rate variability", unit: "ms", decimals: 0, color: "#e64980", data: series(30, () => Math.round(28 + r() * 22)) },
      bodyMassIndex: { label: "Body mass index", unit: "", decimals: 1, color: "#0ca678", data: series(9, (i) => round1(29.8 - i * 0.06 + r() * 0.2)) },
      bodyFatPercentage: { label: "Body fat", unit: "%", decimals: 1, color: "#f08c00", data: series(9, (i) => round1(32.4 - i * 0.08 + r() * 0.3)) },
      waistCircumference: { label: "Waist circumference", unit: "cm", decimals: 0, color: "#7048e8", data: series(3, (i) => 104 - i) },
      vo2Max: { label: "Cardio fitness (VO₂ max)", unit: "mL/kg·min", decimals: 1, color: "#e03131", data: series(6, (i) => round1(30.9 + i * 0.15 + r() * 0.3)) },
      walkingHeartRateAverage: { label: "Walking heart rate average", unit: "bpm", decimals: 0, color: "#e64980", data: series(30, () => Math.round(98 + r() * 12)) },
    };
  }

  window.GlucoseProto = {
    MG_PER_MMOL, HOUR, MIN, build, summarize, daily, profile, associations, vitals, classify, median, iso,
    presets: [
      { id: "type2", label: "Type 2 diabetes", low: 3.9, high: 10.0 },
      { id: "type1", label: "Type 1 diabetes", low: 3.9, high: 10.0 },
      { id: "pregnancy", label: "Pregnancy / gestational", low: 3.5, high: 7.8 },
      { id: "reference", label: "Non-diabetic reference", low: 3.9, high: 7.8 },
      { id: "custom", label: "Custom", low: 4.0, high: 10.0 },
    ],
    colors: { below: "#c92a2a", within: "#51cf66", above: "#d9480f", line: "#4263eb", band: "rgba(81, 207, 102, 0.13)", carbs: "#f08c00", insulin: "#9c36b5", activity: "#0ca678", sleep: "#4c6ef5" },
  };
})();
