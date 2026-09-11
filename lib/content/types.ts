export type TryItExample = {
  /** Button label in the "Load example" row. */
  label: string;
  /** Pre-filled SQL dropped into the editor. */
  sql: string;
  /** One line explaining what the learner should watch for. */
  note?: string;
};

export type Mistake = {
  wrong: string;
  why: string;
  fix?: string;
};

export type Module = {
  slug: string;
  title: string;
  /** Short blurb for the module list. */
  summary: string;
  /** Rough reading + practice time. */
  minutes: number;
  /** 2-4 sentences: what the thing actually is. */
  whatIsIt: string;
  /** Why a beginner should care. */
  whyItMatters: string;
  /** Bare syntax skeleton. */
  syntax: string;
  /** A complete, runnable example. */
  example: string;
  /** The same idea expressed in a Prisma schema or Prisma Client call. */
  prisma: string;
  /** Optional prose shown under the Prisma block. */
  prismaNote?: string;
  mistakes: Mistake[];
  tryIt: TryItExample[];
  /** Optional comparison table rendered after the example. */
  table?: {
    caption: string;
    headers: string[];
    rows: string[][];
  };
};
