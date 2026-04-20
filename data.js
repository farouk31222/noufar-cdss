const patientPredictions = [
  {
    id: "NFR-2401",
    patient: "A. Benali",
    age: 34,
    sex: "F",
    analyzedAt: "2026-04-18",
    source: "Manual",
    result: "Relapse",
    probability: 78,
  },
  {
    id: "NFR-2402",
    patient: "M. Haddad",
    age: 41,
    sex: "M",
    analyzedAt: "2026-04-18",
    source: "Excel import",
    result: "No Relapse",
    probability: 28,
  },
  {
    id: "NFR-2403",
    patient: "S. Karim",
    age: 29,
    sex: "F",
    analyzedAt: "2026-04-17",
    source: "Manual",
    result: "Relapse",
    probability: 81,
  },
  {
    id: "NFR-2404",
    patient: "R. Naceur",
    age: 52,
    sex: "M",
    analyzedAt: "2026-04-16",
    source: "CSV import",
    result: "No Relapse",
    probability: 32,
  },
  {
    id: "NFR-2405",
    patient: "L. Farhat",
    age: 37,
    sex: "F",
    analyzedAt: "2026-04-15",
    source: "Manual",
    result: "Relapse",
    probability: 74,
  },
  {
    id: "NFR-2406",
    patient: "T. Mansouri",
    age: 45,
    sex: "M",
    analyzedAt: "2026-04-14",
    source: "Excel import",
    result: "No Relapse",
    probability: 21,
  },
  {
    id: "NFR-2407",
    patient: "N. Chikhi",
    age: 31,
    sex: "F",
    analyzedAt: "2026-04-13",
    source: "Manual",
    result: "Relapse",
    probability: 69,
  },
  {
    id: "NFR-2408",
    patient: "Y. Bouzid",
    age: 48,
    sex: "M",
    analyzedAt: "2026-04-12",
    source: "CSV import",
    result: "No Relapse",
    probability: 35,
  },
  {
    id: "NFR-2409",
    patient: "D. Saadi",
    age: 39,
    sex: "F",
    analyzedAt: "2026-04-11",
    source: "Manual",
    result: "Relapse",
    probability: 73,
  },
  {
    id: "NFR-2410",
    patient: "K. Yousfi",
    age: 43,
    sex: "M",
    analyzedAt: "2026-04-10",
    source: "Excel import",
    result: "No Relapse",
    probability: 24,
  },
  {
    id: "NFR-2411",
    patient: "H. Zeroual",
    age: 36,
    sex: "F",
    analyzedAt: "2026-04-09",
    source: "Manual",
    result: "Relapse",
    probability: 76,
  },
  {
    id: "NFR-2412",
    patient: "C. Belaid",
    age: 47,
    sex: "F",
    analyzedAt: "2026-04-08",
    source: "CSV import",
    result: "No Relapse",
    probability: 30,
  },
];

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const getDashboardStats = () => {
  const relapse = patientPredictions.filter((entry) => entry.result === "Relapse").length;
  const noRelapse = patientPredictions.length - relapse;

  return {
    total: patientPredictions.length,
    relapse,
    noRelapse,
  };
};

const getRecentPatients = (count = 5) =>
  [...patientPredictions]
    .sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt))
    .slice(0, count);

const getTopRiskPatients = (count = 6) =>
  [...patientPredictions]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, count);

const getTrendSeries = () => {
  const sorted = [...patientPredictions].sort((a, b) => new Date(a.analyzedAt) - new Date(b.analyzedAt));
  return sorted.slice(-6).map((item) => ({
    label: new Date(item.analyzedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    value: item.result === "Relapse" ? 1 : 0.55,
  }));
};

const getAverageProbability = () => {
  if (!patientPredictions.length) return 0;

  const total = patientPredictions.reduce((sum, entry) => sum + entry.probability, 0);
  return Number((total / patientPredictions.length).toFixed(1));
};

const getPredictionBadge = (entry) => {
  if (entry.result === "No Relapse") {
    return {
      label: "No Relapse",
      tone: "safe",
    };
  }

  if (entry.probability >= 70) {
    return {
      label: "High Risk Relapse",
      tone: "relapse",
    };
  }

  return {
    label: "Elevated Risk",
    tone: "warning",
  };
};
