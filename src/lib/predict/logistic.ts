/**
 * L2-regularised logistic regression on standardised features, plus the metrics used to judge it.
 * Small enough to train per customer in a nightly function, and every weight can be explained.
 */

export type LogisticModel = { features: string[]; means: number[]; scales: number[]; weights: number[]; bias: number };

export function trainLogistic(rows: number[][], labels: number[], features: string[], { iterations = 400, learningRate = 0.5, l2 = 1e-3 } = {}): LogisticModel {
  const size = features.length;
  const n = rows.length;
  const means = Array.from({ length: size }, (_, j) => rows.reduce((sum, row) => sum + row[j], 0) / n);
  const scales = means.map((mean, j) => Math.sqrt(rows.reduce((sum, row) => sum + (row[j] - mean) ** 2, 0) / n) || 1);
  const x = rows.map((row) => row.map((value, j) => (value - means[j]) / scales[j]));
  const positives = labels.reduce((sum, label) => sum + label, 0);
  const weights = new Array<number>(size).fill(0);
  // Starting at the base rate converges faster on rare outcomes.
  let bias = Math.log(Math.max(positives, 0.5) / Math.max(n - positives, 0.5));

  for (let iteration = 0; iteration < iterations; iteration++) {
    const gradient = new Array<number>(size).fill(0);
    let biasGradient = 0;
    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < size; j++) z += weights[j] * x[i][j];
      const error = sigmoid(z) - labels[i];
      biasGradient += error;
      for (let j = 0; j < size; j++) gradient[j] += error * x[i][j];
    }
    bias -= (learningRate * biasGradient) / n;
    for (let j = 0; j < size; j++) weights[j] -= learningRate * (gradient[j] / n + l2 * weights[j]);
  }
  return { features, means, scales, weights, bias };
}

export function predictLogistic(model: LogisticModel, row: number[]) {
  let z = model.bias;
  for (let j = 0; j < model.weights.length; j++) z += model.weights[j] * ((row[j] - model.means[j]) / model.scales[j]);
  return sigmoid(z);
}

function sigmoid(z: number) {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

/** Area under the ROC curve (Mann–Whitney, ties share their rank); null without both outcomes. */
export function auc(scores: number[], labels: number[]) {
  const order = scores.map((score, index) => ({ score, label: labels[index] })).sort((left, right) => left.score - right.score);
  let rankSum = 0;
  let positives = 0;
  for (let start = 0; start < order.length;) {
    let end = start;
    while (end + 1 < order.length && order[end + 1].score === order[start].score) end++;
    const rank = (start + end) / 2 + 1;
    for (let index = start; index <= end; index++) {
      if (order[index].label) { rankSum += rank; positives++; }
    }
    start = end + 1;
  }
  const negatives = order.length - positives;
  if (!positives || !negatives) return null;
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** How many times more often the top `share` (by score) has the outcome than the population. */
export function liftAt(scores: number[], labels: number[], share = 0.1) {
  const total = labels.reduce((sum, label) => sum + label, 0);
  if (!total || !labels.length) return null;
  const top = scores.map((score, index) => ({ score, label: labels[index] })).sort((left, right) => right.score - left.score).slice(0, Math.max(1, Math.round(labels.length * share)));
  const topRate = top.reduce((sum, item) => sum + item.label, 0) / top.length;
  return topRate / (total / labels.length);
}
