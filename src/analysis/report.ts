export type CddMetric = {
  metric: string;
  count: number;
  score: number;
};

// The positions are 1-based. The columns count UTF-8 bytes, and the end column is exclusive.
export type CddOccurrence = {
  metric: string;
  line: number;
  col: number;
  end_line: number;
  end_col: number;
  count: number;
  score: number;
};

export type CddUnit = {
  name: string;
  kind: string;
  line: number;
  col: number;
  total: number;
  limit: number;
  exceeds: boolean;
  metrics: CddMetric[];
  occurrences?: CddOccurrence[];
};

export type CddFile = {
  path: string;
  language: string;
  units: CddUnit[];
  warnings?: string[];
};

export type CddReport = {
  root: string;
  blocked: boolean;
  filter: "violations" | "all";
  explain: boolean;
  partial: boolean;
  elapsed_ms: number;
  files: CddFile[];
  warnings?: string[];
  summary: { units: number; violations: number };
};
